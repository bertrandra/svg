<?php
// Les jetons des mails (ADR-0041 §4) : confirmation d'adresse (48 h) et reinitialisation du mot de passe (1 h, usage unique).
// data/jetons/<sha256(jeton)>.json : { usage, compte, expire, creeLe } ; le jeton lui-meme ne va qu'au lien du mail, jamais sur le
// disque. Un jeton consomme est supprime ; les jetons expires partent au menage des sessions. Creer un jeton remplace les jetons du
// meme usage du meme compte (un seul lien valide a la fois).

declare(strict_types=1);

defined('SVG_SITE') || exit;

const USAGES_JETON = ['confirmation', 'reinitialisation'];

function chemin_jeton(string $jeton): string
{
    return donnees('jetons/' . hash('sha256', $jeton) . '.json');
}

function creer_jeton(string $usage, string $compteId, int $duree): string
{
    if (!in_array($usage, USAGES_JETON, true) || !id_compte_valide($compteId)) {
        throw new InvalidArgumentException('jeton : usage ou compte invalide');
    }
    supprimer_jetons_du_compte($compteId, $usage);
    $jeton = bin2hex(random_bytes(32));
    ecrire_atomique(chemin_jeton($jeton), json_encode(['usage' => $usage, 'compte' => $compteId, 'expire' => time() + $duree, 'creeLe' => time()]), 0640);
    return $jeton;
}

/** Le jeton, s'il existe pour cet usage et n'a pas expire (un jeton expire est supprime) ; null sinon. */
function lire_jeton(mixed $jeton, string $usage): ?array
{
    if (!is_string($jeton) || preg_match(MOTIF_JETON, $jeton) !== 1) {
        return null;
    }
    $f = chemin_jeton($jeton);
    $j = lire_json($f, 2);
    if (!is_array($j) || ($j['usage'] ?? null) !== $usage || !id_compte_valide($j['compte'] ?? null) || !is_int($j['expire'] ?? null)) {
        return null;
    }
    if ($j['expire'] < time()) {
        @unlink($f);
        return null;
    }
    return $j;
}

/** Lit et supprime le jeton : un lien ne sert qu'une fois. */
function consommer_jeton(mixed $jeton, string $usage): ?array
{
    $j = lire_jeton($jeton, $usage);
    if ($j !== null) {
        @unlink(chemin_jeton((string) $jeton));
    }
    return $j;
}

function supprimer_jetons_du_compte(string $compteId, ?string $usage = null): void
{
    $d = donnees('jetons');
    foreach (scandir($d) ?: [] as $f) {
        if (preg_match('/^[a-f0-9]{64}\.json$/', $f) !== 1) {
            continue;
        }
        $j = lire_json($d . '/' . $f, 2);
        if (is_array($j) && ($j['compte'] ?? null) === $compteId && ($usage === null || ($j['usage'] ?? null) === $usage)) {
            @unlink($d . '/' . $f);
        }
    }
}

function menage_jetons(): void
{
    $d = donnees('jetons');
    foreach (scandir($d) ?: [] as $f) {
        if (preg_match('/^[a-f0-9]{64}\.json$/', $f) !== 1) {
            continue;
        }
        $j = lire_json($d . '/' . $f, 2);
        if (!is_array($j) || (int) ($j['expire'] ?? 0) < time()) {
            @unlink($d . '/' . $f);
        }
    }
}
