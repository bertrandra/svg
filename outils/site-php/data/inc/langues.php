<?php
// La langue des pages PHP et des mails (ADR-0041 §8, ADR-0042 §5) : t(phrase francaise) rend la phrase dans la langue courante,
// d'apres le tableau fr → en de langues-en.php (la cle est la phrase francaise elle-meme, comme dans util/i18n.ts). La langue est
// celle du compte connecte, sinon le cookie `svg_langue`, sinon `site.langue` ; un mail part dans la langue de son destinataire.
// Une phrase sans traduction reste en francais (un test verifie qu'il n'en manque aucune dans le code livre).

declare(strict_types=1);

defined('SVG_SITE') || exit;

require_once __DIR__ . '/langues-en.php';

const COOKIE_LANGUE = 'svg_langue';

function langue_valide(mixed $l): bool
{
    return is_string($l) && in_array($l, LANGUES, true);
}

/** Pose la langue de la requete ; sans argument, la rend. */
function langue_courante(?string $poser = null): string
{
    static $langue = 'fr';
    if ($poser !== null && langue_valide($poser)) {
        $langue = $poser;
    }
    return $langue;
}

/** La langue a employer pour cette requete : celle du compte, sinon le cookie, sinon le site. */
function langue_de_la_requete(?array $compte): string
{
    if ($compte !== null && langue_valide($compte['langue'] ?? null)) {
        return $compte['langue'];
    }
    $cookie = $_COOKIE[COOKIE_LANGUE] ?? null;
    if (langue_valide($cookie)) {
        return $cookie;
    }
    $site = reglage('site.langue');
    return langue_valide($site) ? $site : 'fr';
}

/**
 * Le script d'amorce du dictionnaire de l'interface (ADR-0042) : pose la langue choisie, puis la table, pour qu'util/i18n.ts les lise
 * a son initialisation, AVANT le code de l'application (les textes evalues au chargement des modules sont alors deja traduits).
 * Un script servi par l'API plutot qu'un script en ligne : la politique de securite du site n'en admet aucun. `$json` est le contenu
 * de data/json/langue-<l>.json ; « </ » s'y echappe en « <\/ » (du JSON toujours valide) pour qu'aucun texte du dictionnaire ne
 * puisse fermer la balise <script> qui le charge.
 */
function script_langue(string $langue, string $json): string
{
    return 'window.__langueSvgLangue=' . json_encode($langue) . ';window.__langueSvg_' . $langue . '=' . str_replace('</', '<\/', trim($json)) . ';';
}

/**
 * GET api.php?r=langue&l=en : le dictionnaire de l'interface en script d'amorce, avec son ETag (un 304 ensuite), une heure en cache
 * prive. Le francais n'a pas de dictionnaire : seule une langue traduite se demande (400 sinon), et un dictionnaire que le build n'a
 * pas livre se dit (404).
 */
function servir_langue(mixed $l): never
{
    if (!langue_valide($l) || $l === 'fr') {
        repondre_erreur(400, 'invalide', t('Choisissez une langue.'));
    }
    $f = donnees('json/langue-' . $l . '.json');
    if (!is_file($f)) {
        repondre_erreur(404, 'introuvable', t('Le dictionnaire « {langue} » est introuvable sur le serveur : relancez la construction du site.', ['langue' => $l]));
    }
    servir_texte(script_langue($l, (string) file_get_contents($f)), 'text/javascript; charset=utf-8', '"' . sha1_file($f) . '"', 'private, max-age=3600');
}

/** Pose le cookie de langue des pages d'avant la connexion (un an ; un cookie de confort, lisible sans secret). */
function poser_cookie_langue(string $langue): void
{
    if (!langue_valide($langue)) {
        return;
    }
    setcookie(COOKIE_LANGUE, $langue, ['expires' => time() + 365 * 86400, 'path' => chemin_cookie(), 'secure' => est_https(), 'httponly' => true, 'samesite' => 'Lax']);
    $_COOKIE[COOKIE_LANGUE] = $langue;
}

/**
 * La phrase dans la langue courante (ou dans `$langue`), les valeurs interpolees par `{nom}`. En francais, la cle interpolee ; en
 * anglais, l'entree du tableau, sinon la cle.
 */
function t(string $fr, array $valeurs = [], ?string $langue = null): string
{
    $l = $langue ?? langue_courante();
    $texte = $l === 'en' ? (TRADUCTIONS_EN[$fr] ?? $fr) : $fr;
    if ($valeurs === []) {
        return $texte;
    }
    $table = [];
    foreach ($valeurs as $k => $v) {
        $table['{' . $k . '}'] = (string) $v;
    }
    return strtr($texte, $table);
}

/** Le nom d'une langue, dans cette langue (pour le selecteur). */
function nom_langue(string $l): string
{
    return $l === 'en' ? 'English' : 'Français';
}
