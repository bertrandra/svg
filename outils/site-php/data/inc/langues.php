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
