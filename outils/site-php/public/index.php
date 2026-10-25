<?php
// Le fichier principal du site (ADR-0030) : la connexion par mot de passe, puis l'application. Tant que data/pwd manque, il dit
// a l'administrateur comment le poser, et ne laisse entrer personne. Sans session valide, le formulaire de connexion ; avec, l'ecran
// « Projets » de l'editeur.

declare(strict_types=1);

define('SVG_SITE', true);
require __DIR__ . '/inc/amorce.php';
require __DIR__ . '/inc/session.php';
require __DIR__ . '/inc/connexion.php';
require __DIR__ . '/inc/page.php';

set_exception_handler(function (Throwable $e): void {
    error_log('index : ' . $e::class . ' : ' . $e->getMessage() . ' (' . $e->getFile() . ':' . $e->getLine() . ')');
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: text/html; charset=utf-8');
    }
    echo '<!doctype html><html lang="fr"><meta charset="utf-8"><title>Erreur</title><p>Le serveur a rencontré une erreur. Réessayez ; si elle persiste, l’administrateur la trouvera dans son journal.</p>';
});

/**
 * Le dossier des donnees est-il sous la racine web ? S'il l'est (un hebergeur qui impose tout dans public/), data/pwd ne doit pas
 * se lire par HTTP : on le demande au serveur lui-meme, une fois par heure, et l'on avertit l'administrateur s'il repond.
 */
function avertissement_donnees(): string
{
    $racine = realpath((string) ($_SERVER['DOCUMENT_ROOT'] ?? '')) ?: '';
    $data = realpath(DATA_DIR) ?: '';
    if ($racine === '' || $data === '' || !str_starts_with($data . '/', rtrim($racine, '/') . '/')) {
        return '';
    }
    $cache = donnees('journal/verification-http.json');
    $vu = is_file($cache) ? json_decode((string) file_get_contents($cache), true) : null;
    if (is_array($vu) && time() - (int) ($vu['quand'] ?? 0) < 3600) {
        $lisible = $vu['lisible'] ?? null;
    } else {
        $chemin = str_replace('\\', '/', substr($data, strlen(rtrim($racine, '/'))));
        $url = (est_https() ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . implode('/', array_map('rawurlencode', explode('/', $chemin))) . '/pwd';
        $lisible = http_lisible($url);
        @file_put_contents($cache, json_encode(['quand' => time(), 'lisible' => $lisible]));
    }
    if ($lisible === true) {
        error_log('securite : ' . DATA_DIR . '/pwd se lit par HTTP');
        return 'Attention : le dossier des données est lisible depuis le Web (data/pwd répond). Placez data/ hors de la racine web, ou vérifiez que son .htaccess est appliqué (AllowOverride), voir docs/deploiement-php.md.';
    }
    return $lisible === null ? 'Le dossier des données est sous la racine web et sa protection n’a pas pu être vérifiée : assurez-vous que le serveur refuse l’accès à data/ (voir docs/deploiement-php.md).' : '';
}

/** Vrai si l'adresse repond 200, faux si elle refuse, null si on ne sait pas (pas de cURL, pas de reponse). */
function http_lisible(string $url): ?bool
{
    if (!function_exists('curl_init')) {
        return null;
    }
    $c = curl_init($url);
    curl_setopt_array($c, [CURLOPT_NOBODY => true, CURLOPT_TIMEOUT => 3, CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS, CURLOPT_SSL_VERIFYPEER => false]);
    $ok = curl_exec($c);
    $code = (int) curl_getinfo($c, CURLINFO_RESPONSE_CODE);
    unset($c);
    return $ok === false || $code === 0 ? null : $code === 200;
}

entetes_securite();
$probleme = preparer_donnees();
if ($probleme !== null) {
    page_installation($probleme);
}
if (!mot_de_passe_pose()) {
    page_installation('Aucun mot de passe n’est posé : personne ne peut entrer. Sur le serveur, dans le dossier du site, lancez :', 'php outils/mot-de-passe.php');
}
demarrer_session();

$action = ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' ? (string) ($_POST['action'] ?? '') : '';

if ($action === 'deconnexion') {
    if (est_connecte() && csrf_valide($_POST['csrf'] ?? null)) {
        fermer_session();
    }
    header('Location: index.php?au-revoir', true, 303);
    exit;
}

if ($action === 'connexion') {
    if (!csrf_valide($_POST['csrf'] ?? null)) {
        page_connexion('La page de connexion a expiré : saisissez de nouveau le mot de passe.', '', 400);
    }
    $essai = $_POST['mot_de_passe'] ?? '';
    $r = essayer_connexion(is_string($essai) ? $essai : '', cle_client(), time());
    if ($r === 'ok') {
        ouvrir_session_connectee();
        header('Location: index.php', true, 303);
        exit;
    }
    if (isset($r['attente'])) {
        page_connexion('Trop d’essais : patientez ' . $r['attente'] . ' seconde' . ($r['attente'] > 1 ? 's' : '') . ' avant de réessayer.', '', 429);
    }
    $suite = (int) ($r['refus'] ?? 0);
    page_connexion('Mot de passe incorrect.' . ($suite > 0 ? ' Prochain essai possible dans ' . $suite . ' seconde' . ($suite > 1 ? 's' : '') . '.' : ''), '', 401);
}

if (!est_connecte()) {
    $expiree = ($_SESSION['expiree'] ?? false) === true;
    unset($_SESSION['expiree']);
    page_connexion('', isset($_GET['au-revoir']) ? 'Vous êtes déconnecté.' : ($expiree ? 'Votre session a expiré : reconnectez-vous.' : ''));
}

page_application(avertissement_donnees());
