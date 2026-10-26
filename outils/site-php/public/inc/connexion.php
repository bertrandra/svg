<?php
// Le mot de passe du site et la limitation des essais (ADR-0030). Le mot de passe n'existe sur le serveur qu'en empreinte
// (`password_hash` : argon2id quand PHP l'a, bcrypt sinon), dans data/pwd, posee par un fichier data/password que le site convertit
// puis supprime (un hebergement sans ligne de commande), ou par `php inc/mot-de-passe.php`. Apres
// CONNEXION_ESSAIS_LIBRES echecs d'un meme client, chaque essai attend un delai qui double, jusqu'a CONNEXION_DELAI_MAX ; les essais
// se comptent dans data/connexions.json et se journalisent dans data/journal/connexions.log (le client y est une empreinte de son
// adresse, jamais l'adresse elle-meme).

declare(strict_types=1);

defined('SVG_SITE') || exit;

function fichier_mot_de_passe(): string
{
    return donnees('pwd');
}

/** Le mot de passe en clair que l'administrateur depose par FTP : converti en empreinte, puis supprime, a la requete suivante. */
function fichier_mot_de_passe_clair(): string
{
    return donnees('password');
}

/** Un mot de passe compte au moins ce nombre de caracteres, qu'il vienne de la ligne de commande ou de data/password. */
const MOT_DE_PASSE_LONGUEUR_MIN = 10;

/** La raison de refuser un mot de passe propose, ou null s'il convient. */
function mot_de_passe_refuse(string $mot): ?string
{
    if (!mb_check_encoding($mot, 'UTF-8')) {
        return 'Le mot de passe n’est pas en UTF-8 (enregistrez le fichier en UTF-8)';
    }
    if (mb_strlen($mot) < MOT_DE_PASSE_LONGUEUR_MIN) {
        return 'Le mot de passe doit compter au moins ' . MOT_DE_PASSE_LONGUEUR_MIN . ' caractères';
    }
    return null;
}

/** Vrai quand data/pwd porte une empreinte que PHP reconnait. */
function mot_de_passe_pose(): bool
{
    $f = fichier_mot_de_passe();
    if (!is_file($f)) {
        return false;
    }
    $h = trim((string) @file_get_contents($f));
    return $h !== '' && password_get_info($h)['algo'] !== null && password_get_info($h)['algoName'] !== 'unknown';
}

/** L'algorithme d'empreinte du moment : argon2id quand PHP le connait, bcrypt sinon. */
function algorithme_empreinte(): string|int|null
{
    return defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT;
}

/** Ecrit l'empreinte d'un mot de passe dans data/pwd, d'un seul geste. */
function poser_mot_de_passe(string $mot): void
{
    ecrire_atomique(fichier_mot_de_passe(), password_hash($mot, algorithme_empreinte()) . "\n", 0640);
}

/** Le refus du formulaire du premier mot de passe quand un mot de passe existe deja. */
const MSG_MOT_DE_PASSE_DEJA = 'Un mot de passe a déjà été posé : connectez-vous avec lui. Pour le changer, créez le fichier data/password par FTP (ou utilisez la ligne de commande).';

/**
 * Pose le premier mot de passe, choisi dans la page a la premiere visite. Seulement tant qu'aucun n'existe : data/pwd est revu sous
 * un verrou (data/.verrou-mot-de-passe), pour que deux envois simultanes n'en posent pas deux. Rend null quand l'empreinte est
 * ecrite, ou la phrase du refus (MSG_MOT_DE_PASSE_DEJA si un mot de passe existe) ; rien n'est ecrit en cas de refus.
 */
function poser_premier_mot_de_passe(mixed $mot, mixed $confirmation): ?string
{
    if (file_exists(fichier_mot_de_passe())) {
        return MSG_MOT_DE_PASSE_DEJA;
    }
    $mot = is_string($mot) ? $mot : '';
    $confirmation = is_string($confirmation) ? $confirmation : '';
    $refus = mot_de_passe_refuse($mot);
    if ($refus !== null) {
        return $refus . ' : rien n’est enregistré.';
    }
    if (!hash_equals($mot, $confirmation)) {
        return 'Les deux saisies diffèrent : rien n’est enregistré.';
    }
    $verrou = fopen(donnees('.verrou-mot-de-passe'), 'c');
    if ($verrou === false) {
        throw new RuntimeException('data/.verrou-mot-de-passe ne s’ouvre pas');
    }
    try {
        flock($verrou, LOCK_EX);
        clearstatcache(true, fichier_mot_de_passe());
        if (file_exists(fichier_mot_de_passe())) {
            return MSG_MOT_DE_PASSE_DEJA;
        }
        poser_mot_de_passe($mot);
    } finally {
        flock($verrou, LOCK_UN);
        fclose($verrou);
    }
    journaliser('connexions', 'mot de passe pose depuis la page de premiere visite');
    return null;
}

/** Ce qui s'affiche tant que data/password reste sur le serveur apres sa conversion. */
const MSG_MOT_DE_PASSE_CLAIR = 'Supprimez le fichier data/password par FTP : le mot de passe y est lisible en clair. (Le site a bien enregistré son empreinte, mais n’a pas pu supprimer le fichier.)';

/** L'etat de data/password (inode, taille, dates), sans rien de son contenu : de quoi reconnaitre un fichier deja converti. */
function signature_fichier(string $f): string
{
    clearstatcache(true, $f);
    $s = @stat($f);
    return is_array($s) ? $s['ino'] . ':' . $s['size'] . ':' . $s['mtime'] . ':' . $s['ctime'] : '';
}

/**
 * Convertit data/password, s'il existe, en empreinte dans data/pwd, puis le supprime : c'est la facon de poser ou de changer le
 * mot de passe sans ligne de commande. Le contenu est pris entier, sans BOM, sans blancs ni fins de ligne aux extremites. Un
 * mot de passe refuse (trop court, pas en UTF-8) ne change rien. Si le fichier ne se supprime pas, l'empreinte est quand meme
 * posee, l'erreur va au journal, et sa signature (jamais son contenu) est notee pour ne pas refaire l'empreinte a chaque requete.
 * Le mot de passe n'est jamais journalise ni affiche. `$supprimer` est `unlink`, sauf dans un test.
 *
 * Rend null s'il n'y avait rien a faire, ['pose' => true] apres une conversion complete, ['erreur' => phrase] si le fichier est
 * refuse (rien n'est ecrit), ['avertissement' => phrase] si l'empreinte est posee mais que le fichier reste.
 */
function convertir_mot_de_passe_clair(?callable $supprimer = null): ?array
{
    $f = fichier_mot_de_passe_clair();
    $note = donnees('journal/password-restant.txt');
    clearstatcache(true, $f);
    if (!is_file($f)) {
        if (is_file($note)) {
            @unlink($note);
        }
        return null;
    }
    $signature = signature_fichier($f);
    if (is_file($note) && hash_equals(trim((string) @file_get_contents($note)), $signature) && mot_de_passe_pose()) {
        return ['avertissement' => MSG_MOT_DE_PASSE_CLAIR];
    }
    $texte = @file_get_contents($f, false, null, 0, 4097);
    if ($texte === false) {
        clearstatcache(true, $f);
        // Une autre requete l'a converti et supprime entre-temps : rien a faire.
        return is_file($f) ? ['erreur' => 'Le fichier data/password ne peut pas être lu par le serveur : vérifiez ses droits par FTP, puis rechargez la page.'] : null;
    }
    if (strlen($texte) > 4096) {
        return ['erreur' => 'Le fichier data/password est trop long pour être un mot de passe : rien n’est changé. Corrigez-le par FTP, puis rechargez la page.'];
    }
    $mot = trim(str_starts_with($texte, "\xEF\xBB\xBF") ? substr($texte, 3) : $texte);
    $refus = mot_de_passe_refuse($mot);
    if ($refus !== null) {
        return ['erreur' => 'Le fichier data/password est refusé. ' . $refus . ' : rien n’est changé. Corrigez-le par FTP, puis rechargez la page.'];
    }
    $remplace = mot_de_passe_pose();
    try {
        poser_mot_de_passe($mot);
    } catch (Throwable $e) {
        error_log('mot de passe : empreinte non ecrite depuis data/password (' . $e->getMessage() . ')');
        return ['erreur' => 'L’empreinte du mot de passe n’a pas pu être écrite dans data/pwd : vérifiez que le serveur peut écrire dans data/, puis rechargez la page.'];
    }
    journaliser('connexions', 'mot de passe ' . ($remplace ? 'change' : 'pose') . ' depuis data/password');
    $supprimer ??= 'unlink';
    $supprime = (bool) @$supprimer($f);
    clearstatcache(true, $f);
    // Une requete voisine a pu le supprimer avant nous : il a disparu, c'est ce qui compte.
    if ($supprime || !file_exists($f)) {
        if (is_file($note)) {
            @unlink($note);
        }
        return ['pose' => true];
    }
    @file_put_contents($note, signature_fichier($f) . "\n");
    error_log('securite : data/password ne se supprime pas ; le mot de passe y reste lisible en clair, supprimez-le par FTP');
    journaliser('connexions', 'data/password non supprime');
    return ['avertissement' => MSG_MOT_DE_PASSE_CLAIR];
}

/**
 * Le mot de passe essaye est-il le bon ? `password_verify` compare en temps constant. Une empreinte d'un algorithme plus ancien
 * (bcrypt quand argon2id est la) se refait au passage.
 */
function verifier_mot_de_passe(string $essai): bool
{
    if (!mot_de_passe_pose()) {
        return false;
    }
    $h = trim((string) file_get_contents(fichier_mot_de_passe()));
    $ok = password_verify($essai, $h);
    if ($ok && password_needs_rehash($h, algorithme_empreinte())) {
        try {
            poser_mot_de_passe($essai);
        } catch (Throwable $e) {
            error_log('mot de passe : empreinte non refaite (' . $e->getMessage() . ')');
        }
    }
    return $ok;
}

/** Le secret du site (data/secret), cree au premier besoin : il sale l'empreinte des adresses du journal. */
function secret_site(): string
{
    $f = donnees('secret');
    $s = is_file($f) ? trim((string) file_get_contents($f)) : '';
    if (!preg_match('/^[a-f0-9]{64}$/', $s)) {
        $s = bin2hex(random_bytes(32));
        ecrire_atomique($f, $s . "\n", 0600);
    }
    return $s;
}

/** Le client, tel que la limitation et le journal le connaissent : une empreinte de son adresse, salee par le secret du site. */
function cle_client(): string
{
    return substr(hash_hmac('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? ''), secret_site()), 0, 16);
}

/** Le delai a attendre apres `echecs` echecs (en secondes) : rien pendant les essais libres, puis 2, 4, 8… jusqu'au plafond. */
function delai_apres(int $echecs): int
{
    if ($echecs < CONNEXION_ESSAIS_LIBRES) {
        return 0;
    }
    return (int) min(CONNEXION_DELAI_MAX, 2 ** min(30, $echecs - CONNEXION_ESSAIS_LIBRES + 1));
}

/** Lit, change et reecrit data/connexions.json sous un verrou : deux essais de front ne perdent pas un echec. */
function avec_essais(callable $changer): mixed
{
    $f = donnees('connexions.json');
    $h = fopen($f, 'c+');
    if ($h === false) {
        throw new RuntimeException('data/connexions.json ne s’ouvre pas');
    }
    try {
        flock($h, LOCK_EX);
        $texte = stream_get_contents($h);
        $essais = json_decode($texte === false || $texte === '' ? '{}' : $texte, true);
        $essais = is_array($essais) ? $essais : [];
        [$resultat, $nouveaux] = $changer($essais);
        if ($nouveaux !== null) {
            ftruncate($h, 0);
            rewind($h);
            fwrite($h, json_encode($nouveaux, JSON_UNESCAPED_SLASHES) ?: '{}');
            fflush($h);
        }
        return $resultat;
    } finally {
        flock($h, LOCK_UN);
        fclose($h);
    }
}

/** Les secondes qu'un client doit encore attendre avant d'essayer ; 0 s'il peut essayer. */
function attente_restante(string $cle, int $maintenant): int
{
    return (int) avec_essais(function (array $essais) use ($cle, $maintenant): array {
        $e = $essais[$cle] ?? null;
        if (!is_array($e)) {
            return [0, null];
        }
        $reste = (int) ($e['dernier'] ?? 0) + delai_apres((int) ($e['echecs'] ?? 0)) - $maintenant;
        return [max(0, $reste), null];
    });
}

/** Note un essai : un succes efface les echecs du client, un echec en ajoute un. Les entrees vieilles d'un jour s'effacent. */
function noter_essai(string $cle, bool $reussi, int $maintenant): void
{
    avec_essais(function (array $essais) use ($cle, $reussi, $maintenant): array {
        foreach ($essais as $k => $e) {
            if (!is_array($e) || $maintenant - (int) ($e['dernier'] ?? 0) > 86400) {
                unset($essais[$k]);
            }
        }
        if ($reussi) {
            unset($essais[$cle]);
        } else {
            $echecs = (int) (($essais[$cle]['echecs'] ?? 0)) + 1;
            $essais[$cle] = ['echecs' => $echecs, 'dernier' => $maintenant];
        }
        return [null, $essais];
    });
    journaliser('connexions', ($reussi ? 'reussie' : 'echec') . ' client=' . $cle);
}

/**
 * Un essai de connexion complet : le delai d'abord (sans meme regarder le mot de passe), puis la verification, notee. Rend 'ok',
 * ou ['attente' => secondes] quand il faut patienter, ou ['refus' => secondes a attendre avant le prochain essai].
 */
function essayer_connexion(string $essai, string $cle, int $maintenant): string|array
{
    $attente = attente_restante($cle, $maintenant);
    if ($attente > 0) {
        journaliser('connexions', 'retenue client=' . $cle . ' attente=' . $attente);
        return ['attente' => $attente];
    }
    $ok = verifier_mot_de_passe($essai);
    noter_essai($cle, $ok, $maintenant);
    return $ok ? 'ok' : ['refus' => attente_restante($cle, $maintenant)];
}
