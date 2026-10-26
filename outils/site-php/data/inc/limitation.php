<?php
// La limitation des essais de connexion (ADR-0030, ADR-0041 §4) : apres CONNEXION_ESSAIS_LIBRES echecs, chaque essai attend un delai
// qui double, jusqu'a CONNEXION_DELAI_MAX ; les essais se comptent par client ET par compte (une attaque repartie sur beaucoup
// d'adresses contre un seul compte est ralentie aussi), dans data/essais.json, et se journalisent dans data/journal/connexions.log,
// ou le client est une empreinte salee de son adresse, jamais l'adresse, et ou aucune adresse de courrier ni mot de passe n'entre.

declare(strict_types=1);

defined('SVG_SITE') || exit;

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
    return 'c:' . substr(hash_hmac('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? ''), secret_site()), 0, 16);
}

/** La cle d'un compte dans le compteur des essais. */
function cle_compte(string $id): string
{
    return 'k:' . $id;
}

/** Le delai a attendre apres `echecs` echecs (en secondes) : rien pendant les essais libres, puis 2, 4, 8… jusqu'au plafond. */
function delai_apres(int $echecs, int $libres = CONNEXION_ESSAIS_LIBRES): int
{
    if ($echecs < $libres) {
        return 0;
    }
    return (int) min(CONNEXION_DELAI_MAX, 2 ** min(30, $echecs - $libres + 1));
}

/** Les essais libres d'une cle : ceux des mails (prefixe `m`) ou ceux des connexions. */
function essais_libres(string $cle): int
{
    return str_starts_with($cle, 'm') ? COURRIER_DEMANDES_LIBRES : CONNEXION_ESSAIS_LIBRES;
}

/** Lit, change et reecrit data/essais.json sous un verrou : deux essais de front ne perdent pas un echec. */
function avec_essais(callable $changer): mixed
{
    $f = donnees('essais.json');
    $h = fopen($f, 'c+');
    if ($h === false) {
        throw new RuntimeException('data/essais.json ne s’ouvre pas');
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

/** Les secondes qu'une cle (client ou compte) doit encore attendre avant d'essayer ; 0 si elle peut essayer. */
function attente_restante(string $cle, int $maintenant): int
{
    return (int) avec_essais(function (array $essais) use ($cle, $maintenant): array {
        $e = $essais[$cle] ?? null;
        if (!is_array($e)) {
            return [0, null];
        }
        $reste = (int) ($e['dernier'] ?? 0) + delai_apres((int) ($e['echecs'] ?? 0), essais_libres($cle)) - $maintenant;
        return [max(0, $reste), null];
    });
}

/** Note un essai pour des cles : un succes efface leurs echecs, un echec en ajoute un. Les entrees vieilles d'un jour s'effacent. */
function noter_essai(array|string $cles, bool $reussi, int $maintenant): void
{
    $cles = is_array($cles) ? $cles : [$cles];
    avec_essais(function (array $essais) use ($cles, $reussi, $maintenant): array {
        foreach ($essais as $k => $e) {
            if (!is_array($e) || $maintenant - (int) ($e['dernier'] ?? 0) > 86400) {
                unset($essais[$k]);
            }
        }
        foreach ($cles as $cle) {
            if ($reussi) {
                unset($essais[$cle]);
            } else {
                $echecs = (int) (($essais[$cle]['echecs'] ?? 0)) + 1;
                $essais[$cle] = ['echecs' => $echecs, 'dernier' => $maintenant];
            }
        }
        return [null, $essais];
    });
}

/** Une empreinte factice, verifiee quand l'adresse est inconnue : un essai sur une adresse absente coute le meme temps. */
function empreinte_factice(): string
{
    static $h = null;
    return $h ??= empreinte_mot_de_passe('factice-' . bin2hex(random_bytes(8)));
}

/**
 * Un essai de connexion complet : le delai d'abord (sans meme regarder le mot de passe), par client et par compte, puis la
 * verification. Rend ['ok' => true, 'compte' => …], ou ['attente' => secondes], ou ['refus' => raison, 'suite' => secondes a
 * attendre avant le prochain essai, 'compte'? => …] ; la raison est `generique` (adresse inconnue ou mot de passe faux : la meme),
 * ou, le mot de passe etant juste, l'etat du compte : `a-confirmer`, `en-attente`, `acces` (refuse ou suspendu).
 */
function essayer_connexion(mixed $email, mixed $mot, string $cleClient, int $maintenant): array
{
    $compte = is_string($email) ? compte_par_email($email) : null;
    $cles = $compte === null ? [$cleClient] : [$cleClient, cle_compte($compte['id'])];
    $attente = 0;
    foreach ($cles as $cle) {
        $attente = max($attente, attente_restante($cle, $maintenant));
    }
    if ($attente > 0) {
        journaliser('connexions', 'retenue client=' . $cleClient . ($compte === null ? '' : ' compte=' . $compte['id']) . ' attente=' . $attente);
        return ['attente' => $attente];
    }
    $mot = is_string($mot) ? $mot : '';
    if ($compte === null) {
        password_verify($mot, empreinte_factice());
        noter_essai($cles, false, $maintenant);
        journaliser('connexions', 'echec client=' . $cleClient . ' compte=-');
        return ['refus' => 'generique', 'suite' => attente_restante($cleClient, $maintenant)];
    }
    if (!verifier_mot_de_passe_compte($compte, $mot)) {
        noter_essai($cles, false, $maintenant);
        journaliser('connexions', 'echec client=' . $cleClient . ' compte=' . $compte['id']);
        $suite = 0;
        foreach ($cles as $cle) {
            $suite = max($suite, attente_restante($cle, $maintenant));
        }
        return ['refus' => 'generique', 'suite' => $suite];
    }
    if ($compte['etat'] !== 'actif') {
        journaliser('connexions', 'refus etat=' . $compte['etat'] . ' client=' . $cleClient . ' compte=' . $compte['id']);
        $raison = in_array($compte['etat'], ['a-confirmer', 'en-attente'], true) ? $compte['etat'] : 'acces';
        return ['refus' => $raison, 'suite' => 0, 'compte' => $compte];
    }
    noter_essai($cles, true, $maintenant);
    journaliser('connexions', 'reussie client=' . $cleClient . ' compte=' . $compte['id']);
    return ['ok' => true, 'compte' => lire_compte($compte['id']) ?? $compte];
}
