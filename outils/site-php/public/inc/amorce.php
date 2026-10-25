<?php
// L'amorce commune a index.php et api.php (ADR-0030) : les reglages, aucune erreur affichee, un journal dans data/journal, les
// dossiers de data/ prets, les en-tetes de securite. Un fichier de inc/ demande directement ne fait rien (et inc/.htaccess le refuse).

declare(strict_types=1);

defined('SVG_SITE') || exit;

require_once __DIR__ . '/../config.php';

// Jamais d'erreur a l'ecran en production : elle dirait un chemin, une version ; tout va au journal.
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);
// Les nombres d'un projet se relisent a l'identique : le plus court texte qui redonne le meme double (comme JavaScript).
ini_set('serialize_precision', '-1');

/** Un chemin sous DATA_DIR. */
function donnees(string $sous = ''): string
{
    // Le chemin reel quand le dossier existe : « public/../data » devient « data », ce que rendent aussi tempnam et realpath.
    $racine = realpath(DATA_DIR) ?: rtrim(DATA_DIR, '/\\');
    return $racine . ($sous === '' ? '' : '/' . $sous);
}

/** Les dossiers de data/ que le site ecrit. */
const DOSSIERS_DONNEES = ['projets', 'projets/corbeille', 'font', 'font/catalogue', 'json', 'journal', 'sessions'];

/**
 * Prepare data/ : cree les dossiers qui manquent et branche le journal des erreurs. Rend la phrase a dire a l'administrateur si
 * data/ n'existe pas ou ne s'ecrit pas, null sinon.
 */
function preparer_donnees(): ?string
{
    $racine = donnees();
    if (!is_dir($racine)) {
        return 'Le dossier des données (' . $racine . ') est introuvable. Créez-le à côté du dossier public/ et rendez-le accessible en écriture au serveur web, ou réglez DATA_DIR dans config.local.php.';
    }
    foreach (DOSSIERS_DONNEES as $sous) {
        $d = donnees($sous);
        if (!is_dir($d) && !@mkdir($d, 0750, true) && !is_dir($d)) {
            return 'Le dossier des données (' . $racine . ') n’est pas accessible en écriture au serveur web : donnez-lui les droits d’écriture (voir docs/deploiement-php.md).';
        }
    }
    if (!is_writable(donnees('projets')) || !is_writable(donnees('journal'))) {
        return 'Le dossier des données (' . $racine . ') n’est pas accessible en écriture au serveur web : donnez-lui les droits d’écriture (voir docs/deploiement-php.md).';
    }
    ini_set('error_log', donnees('journal/erreurs.log'));
    return null;
}

/** Une ligne d'un journal de data/journal, horodatee ; un journal qui ne s'ecrit pas ne fait echouer rien. */
function journaliser(string $journal, string $ligne): void
{
    if (!preg_match('/^[a-z-]{1,30}$/', $journal)) {
        return;
    }
    $propre = preg_replace('/[\x00-\x1f\x7f]/', ' ', $ligne) ?? '';
    @file_put_contents(donnees('journal/' . $journal . '.log'), gmdate('Y-m-d\TH:i:s\Z') . ' ' . $propre . "\n", FILE_APPEND | LOCK_EX);
}

/** Vrai quand la requete est arrivee en HTTPS (ou que HTTPS_FORCE le dit pour un mandataire). */
function est_https(): bool
{
    return HTTPS_FORCE || (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off');
}

/**
 * Les en-tetes de securite. La page n'appelle aucun domaine tiers : scripts, styles, images, fontes et requetes viennent du site
 * seul (les polices du catalogue aussi : le serveur les telecharge pour elle). `wasm-unsafe-eval` pour le traceur (WebAssembly),
 * `unsafe-inline` pour les styles parce que l'editeur pose des attributs `style` (docs/integration.md).
 */
function entetes_securite(): void
{
    header_remove('X-Powered-By');
    header("Content-Security-Policy: default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; manifest-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    header('X-Frame-Options: DENY');
    header('Cross-Origin-Opener-Policy: same-origin');
    header('Cross-Origin-Resource-Policy: same-origin');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    if (est_https()) {
        header('Strict-Transport-Security: max-age=31536000');
    }
}

/**
 * Ecrit un fichier d'un seul geste : un fichier temporaire dans le meme dossier, puis `rename`, atomique sur un meme systeme de
 * fichiers. Un lecteur voit l'ancien contenu ou le nouveau, jamais un fichier a moitie ecrit. Leve en cas d'echec.
 */
function ecrire_atomique(string $chemin, string $contenu, int $droits = 0640): void
{
    $dossier = realpath(dirname($chemin)) ?: dirname($chemin);
    $chemin = $dossier . '/' . basename($chemin);
    $tmp = tempnam($dossier, '.tmp-');
    if ($tmp === false || dirname($tmp) !== $dossier) {
        if ($tmp !== false) {
            @unlink($tmp);
        }
        throw new RuntimeException('fichier temporaire impossible dans ' . $dossier);
    }
    $ecrits = file_put_contents($tmp, $contenu);
    if ($ecrits !== strlen($contenu)) {
        @unlink($tmp);
        throw new RuntimeException('écriture incomplète de ' . $chemin);
    }
    @chmod($tmp, $droits);
    if (!rename($tmp, $chemin)) {
        @unlink($tmp);
        throw new RuntimeException('renommage impossible vers ' . $chemin);
    }
}

/** Echappe un texte pour du HTML. */
function h(string $t): string
{
    return htmlspecialchars($t, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
}
