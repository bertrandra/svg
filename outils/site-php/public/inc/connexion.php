<?php
// Le mot de passe du site et la limitation des essais (ADR-0030). Le mot de passe n'existe sur le serveur qu'en empreinte
// (`password_hash` : argon2id quand PHP l'a, bcrypt sinon), dans data/pwd, posee par `php outils/mot-de-passe.php`. Apres
// CONNEXION_ESSAIS_LIBRES echecs d'un meme client, chaque essai attend un delai qui double, jusqu'a CONNEXION_DELAI_MAX ; les essais
// se comptent dans data/connexions.json et se journalisent dans data/journal/connexions.log (le client y est une empreinte de son
// adresse, jamais l'adresse elle-meme).

declare(strict_types=1);

defined('SVG_SITE') || exit;

function fichier_mot_de_passe(): string
{
    return donnees('pwd');
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

/** Le delai a attendre apres `echecs` echecs (en secondes) : rien pendant les essais libres, puis 1, 2, 4… jusqu'au plafond. */
function delai_apres(int $echecs): int
{
    if ($echecs < CONNEXION_ESSAIS_LIBRES) {
        return 0;
    }
    return (int) min(CONNEXION_DELAI_MAX, 2 ** min(30, $echecs - CONNEXION_ESSAIS_LIBRES));
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
