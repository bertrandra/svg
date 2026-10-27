<?php
// L'amorce commune a index.php, api.php et a l'outil de ligne de commande (ADR-0030, ADR-0041) : le dossier des donnees (celui qui
// contient ce inc/), les reglages, aucune erreur affichee, un journal dans data/journal, les dossiers de data/ prets, les en-tetes
// de securite, puis tous les modules du site. Un fichier de inc/ demande directement ne fait rien (et data/.htaccess le refuse).

declare(strict_types=1);

defined('SVG_SITE') || exit;

// Le dossier des donnees est celui qui porte ce code : data/inc/amorce.php. Un test le fixe avant de charger l'amorce.
defined('DATA_DIR') || define('DATA_DIR', dirname(__DIR__));

require_once __DIR__ . '/config.php';

// Jamais d'erreur a l'ecran en production : elle dirait un chemin, une version ; tout va au journal.
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);
// Les nombres d'un projet se relisent a l'identique : le plus court texte qui redonne le meme double (comme JavaScript).
ini_set('serialize_precision', '-1');

/** Un identifiant de compte ou de projet sur le disque : 16 chiffres hexadecimaux tires au hasard, seuls a fabriquer un chemin. */
const MOTIF_ID = '/^[a-f0-9]{16}$/';

/** Un chemin sous DATA_DIR. */
function donnees(string $sous = ''): string
{
    // Le chemin reel quand le dossier existe : « public/../data » devient « data », ce que rendent aussi tempnam et realpath.
    $racine = realpath(DATA_DIR) ?: rtrim(DATA_DIR, '/\\');
    return $racine . ($sous === '' ? '' : '/' . $sous);
}

/** Les dossiers de data/ que le site ecrit. */
const DOSSIERS_DONNEES = ['config', 'comptes', 'sessions', 'jetons', 'projets', 'projets/corbeille-comptes', 'font', 'font/catalogue', 'json', 'journal', 'journal/courrier'];

/**
 * Le .htaccess de data/, le meme que celui que livre le build (outils/site-php/data/.htaccess, un test les compare) : reecrit s'il
 * manque, parce qu'un client FTP qui cache les fichiers commencant par un point ne l'envoie pas toujours, et que data/ vit sous la
 * racine web dans la disposition par defaut.
 */
const HTACCESS_DONNEES = <<<'HTACCESS'
# Le dossier des donnees du site (ADR-0030, ADR-0041) : jamais servi par HTTP (code, reglages, comptes, sessions, jetons, projets,
# journaux). Le build le place sous la racine web (public/data) ; ce fichier y refuse tout acces direct, a tous les fichiers, avec ou
# sans extension, Apache 2.4 et 2.2 en repli. Sous nginx : `location ^~ /data/ { return 404; }` (docs/deploiement-php.md).
<IfModule mod_authz_core.c>
  Require all denied
</IfModule>
<IfModule !mod_authz_core.c>
  Order deny,allow
  Deny from all
</IfModule>

HTACCESS;

/**
 * Prepare data/ : cree les dossiers qui manquent et branche le journal des erreurs. Rend la phrase a dire a l'administrateur si
 * data/ n'existe pas ou ne s'ecrit pas, null sinon.
 */
function preparer_donnees(): ?string
{
    $racine = donnees();
    if (!is_dir($racine)) {
        return 'Le dossier des données (data/) est introuvable. Envoyez-le avec le reste du site, dans le même dossier qu’index.php, et rendez-le accessible en écriture au serveur web.';
    }
    foreach (DOSSIERS_DONNEES as $sous) {
        $d = donnees($sous);
        if (!is_dir($d) && !@mkdir($d, 0750, true) && !is_dir($d)) {
            return 'Le dossier des données (' . $racine . ') n’est pas accessible en écriture au serveur web : donnez-lui les droits d’écriture (voir docs/deploiement-php.md).';
        }
    }
    foreach (['comptes', 'sessions', 'projets', 'journal', 'config'] as $sous) {
        if (!is_writable(donnees($sous))) {
            return 'Le dossier des données (' . $racine . ') n’est pas accessible en écriture au serveur web : donnez-lui les droits d’écriture (voir docs/deploiement-php.md).';
        }
    }
    ini_set('error_log', donnees('journal/erreurs.log'));
    if (!is_file(donnees('.htaccess'))) {
        try {
            ecrire_atomique(donnees('.htaccess'), HTACCESS_DONNEES, 0644);
        } catch (Throwable $e) {
            error_log('securite : data/.htaccess manque et ne s ecrit pas (' . $e->getMessage() . ')');
        }
    }
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

function maintenant_iso(): string
{
    return gmdate('Y-m-d\TH:i:s\Z');
}

/** Vrai quand la requete est arrivee en HTTPS (ou que HTTPS_FORCE le dit pour un mandataire). */
function est_https(): bool
{
    return HTTPS_FORCE || (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off');
}

/**
 * L'adresse du site, avec sa barre finale, pour les liens des mails : celle des reglages (site.adresse) quand elle est posee, sinon
 * celle de la requete (le dossier du script). Vide hors de toute requete et sans reglage.
 */
function adresse_site(): string
{
    $reglee = (string) reglage('site.adresse');
    if ($reglee !== '') {
        return rtrim($reglee, '/') . '/';
    }
    $hote = (string) ($_SERVER['HTTP_HOST'] ?? '');
    if ($hote === '' || preg_match('/^[A-Za-z0-9.\-:\[\]]{1,255}$/', $hote) !== 1) {
        return '';
    }
    $dossier = str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/')));
    return (est_https() ? 'https' : 'http') . '://' . $hote . rtrim($dossier, '/') . '/';
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

/** Lit un JSON en tableaux associatifs, borne en profondeur ; null si le fichier manque ou n'est pas du JSON. */
function lire_json(string $chemin, int $profondeur = 16): ?array
{
    if (!is_file($chemin)) {
        return null;
    }
    try {
        $x = json_decode((string) file_get_contents($chemin), true, $profondeur, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        return null;
    }
    return is_array($x) ? $x : null;
}

/** Execute `$faire` sous un verrou exclusif (`flock`) sur le fichier donne, cree s'il manque. */
function sous_verrou(string $fichier, callable $faire): mixed
{
    $v = fopen($fichier, 'c');
    if ($v === false) {
        throw new RuntimeException('verrou impossible : ' . basename($fichier));
    }
    try {
        flock($v, LOCK_EX);
        return $faire();
    } finally {
        flock($v, LOCK_UN);
        fclose($v);
    }
}

/** Echappe un texte pour du HTML. */
function h(string $t): string
{
    return htmlspecialchars($t, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
}

require_once __DIR__ . '/reglages.php';
require_once __DIR__ . '/langues.php';
require_once __DIR__ . '/reponses.php';
require_once __DIR__ . '/comptes.php';
require_once __DIR__ . '/session.php';
require_once __DIR__ . '/jetons.php';
require_once __DIR__ . '/courrier.php';
require_once __DIR__ . '/limitation.php';
require_once __DIR__ . '/projets.php';
require_once __DIR__ . '/partages.php';
require_once __DIR__ . '/polices.php';
require_once __DIR__ . '/adresse.php';
require_once __DIR__ . '/pages.php';
require_once __DIR__ . '/entree-index.php';
require_once __DIR__ . '/entree-api.php';
