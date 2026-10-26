<?php
// La session du site (ADR-0030) : un seul mot de passe, pas de comptes. Le cookie est `HttpOnly`, `SameSite=Strict`, `Secure` en
// HTTPS ; l'identifiant change a la connexion (`session_regenerate_id`) ; la session expire apres SESSION_INACTIVITE sans requete.
// Le jeton CSRF de la session accompagne toute requete qui ecrit, et se compare en temps constant. Une session connectee porte la
// marque de l'empreinte du mot de passe de sa connexion : changer le mot de passe (data/password ou inc/mot-de-passe.php) ferme
// toutes les sessions ouvertes, ou qu'elles soient rangees, sans avoir a les parcourir.

declare(strict_types=1);

defined('SVG_SITE') || exit;

/** Le chemin du cookie : le dossier du script (le site peut vivre dans un sous-dossier). */
function chemin_cookie(): string
{
    $d = str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/')));
    return rtrim($d, '/') . '/';
}

/** La marque de l'empreinte du mot de passe (data/pwd) : un condense, jamais l'empreinte ; vide sans mot de passe. */
function marque_mot_de_passe(): string
{
    $h = @file_get_contents(donnees('pwd'));
    $h = is_string($h) ? trim($h) : '';
    return $h === '' ? '' : substr(hash('sha256', 'session:' . $h), 0, 32);
}

function demarrer_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.use_trans_sid', '0');
    ini_set('session.cookie_httponly', '1');
    ini_set('session.gc_maxlifetime', (string) SESSION_INACTIVITE);
    // Les sessions vivent dans data/sessions, pas dans un /tmp partage avec les autres sites de l'hebergeur ; le menage s'y fait ici.
    $dossier = donnees('sessions');
    if (is_dir($dossier) && is_writable($dossier)) {
        session_save_path($dossier);
        ini_set('session.gc_probability', '1');
        ini_set('session.gc_divisor', '100');
    }
    session_name('svg_session');
    session_set_cookie_params(['lifetime' => 0, 'path' => chemin_cookie(), 'secure' => est_https(), 'httponly' => true, 'samesite' => 'Strict']);
    session_start();
    $maintenant = time();
    if (!empty($_SESSION['connecte']) && $maintenant - (int) ($_SESSION['vu'] ?? 0) > SESSION_INACTIVITE) {
        $_SESSION = ['expiree' => true];
        session_regenerate_id(true);
    } elseif (!empty($_SESSION['connecte']) && !hash_equals(marque_mot_de_passe(), (string) ($_SESSION['marque'] ?? '-'))) {
        $_SESSION = ['change' => true];
        session_regenerate_id(true);
    }
    if (!empty($_SESSION['connecte'])) {
        $_SESSION['vu'] = $maintenant;
    }
    if (!isset($_SESSION['csrf']) || !is_string($_SESSION['csrf']) || strlen($_SESSION['csrf']) !== 64) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
}

function est_connecte(): bool
{
    return ($_SESSION['connecte'] ?? false) === true;
}

function jeton_csrf(): string
{
    return (string) ($_SESSION['csrf'] ?? '');
}

/** Le jeton recu est-il celui de la session ? En temps constant ; un jeton absent ou vide ne vaut jamais. */
function csrf_valide(mixed $jeton): bool
{
    $attendu = jeton_csrf();
    return is_string($jeton) && $attendu !== '' && hash_equals($attendu, $jeton);
}

/** La connexion reussie : un nouvel identifiant de session (contre la fixation), un nouveau jeton. */
function ouvrir_session_connectee(): void
{
    session_regenerate_id(true);
    $_SESSION = ['connecte' => true, 'vu' => time(), 'csrf' => bin2hex(random_bytes(32)), 'marque' => marque_mot_de_passe()];
}

/** La deconnexion : la session videe, detruite, son cookie efface. */
function fermer_session(): void
{
    $_SESSION = [];
    if (session_status() === PHP_SESSION_ACTIVE) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => $p['path'], 'secure' => $p['secure'], 'httponly' => true, 'samesite' => 'Strict']);
        session_destroy();
    }
}
