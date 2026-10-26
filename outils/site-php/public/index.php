<?php
// Le fichier principal du site (ADR-0030) : la connexion par mot de passe, puis l'application. A chaque requete, un fichier
// data/password depose par FTP devient l'empreinte de data/pwd, puis disparait (inc/connexion.php). Tant qu'aucun mot de passe
// n'existe, la page le fait choisir (premiere visite) et ne montre rien d'autre. Sans session valide, le formulaire de connexion ;
// avec, l'ecran « Projets » de l'editeur.

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
 * Le dossier des donnees est-il sous la racine web ? Il l'est dans la disposition par defaut (public/data, un seul dossier envoye
 * par FTP) : data/pwd ne doit pas se lire par HTTP. On le demande au serveur lui-meme, une fois par heure, et l'on avertit
 * l'administrateur s'il repond. Tant que data/password existe (il n'a pas pu etre supprime), on le demande aussi, a chaque fois.
 */
function avertissement_donnees(): string
{
    $racine = realpath((string) ($_SERVER['DOCUMENT_ROOT'] ?? '')) ?: '';
    $data = realpath(DATA_DIR) ?: '';
    if ($racine === '' || $data === '' || !str_starts_with($data . '/', rtrim($racine, '/') . '/')) {
        return '';
    }
    $chemin = str_replace('\\', '/', substr($data, strlen(rtrim($racine, '/'))));
    $base = (est_https() ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . implode('/', array_map('rawurlencode', explode('/', $chemin)));
    $cache = donnees('journal/verification-http.json');
    $vu = is_file($cache) ? json_decode((string) file_get_contents($cache), true) : null;
    if (is_array($vu) && time() - (int) ($vu['quand'] ?? 0) < 3600) {
        $lisible = $vu['lisible'] ?? null;
    } else {
        $lisible = http_lisible($base . '/pwd');
        @file_put_contents($cache, json_encode(['quand' => time(), 'lisible' => $lisible]));
    }
    if ($lisible !== true && is_file(fichier_mot_de_passe_clair()) && http_lisible($base . '/password') === true) {
        $lisible = true;
    }
    if ($lisible === true) {
        error_log('securite : ' . DATA_DIR . ' se lit par HTTP (data/pwd ou data/password repond)');
        return 'Attention : le dossier des données est lisible depuis le Web (data/pwd ou data/password répond). Vérifiez que son .htaccess est appliqué (AllowOverride), ou placez data/ hors de la racine web, voir docs/deploiement-php.md.';
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
// Avant toute connexion : un mot de passe depose dans data/password devient l'empreinte, et le fichier disparait.
$clair = convertir_mot_de_passe_clair();
if (isset($clair['erreur'])) {
    page_installation($clair['erreur']);
}
$avertissements = isset($clair['avertissement']) ? [$clair['avertissement']] : [];
demarrer_session();

$action = ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' ? (string) ($_POST['action'] ?? '') : '';

// La premiere visite : aucun mot de passe, ni data/pwd ni data/password. On le fait choisir ici, et seulement ici ; des que data/pwd
// existe, la route n'existe plus (un envoi direct est refuse plus bas).
if (!file_exists(fichier_mot_de_passe())) {
    if ($action === 'choisir') {
        if (!csrf_valide($_POST['csrf'] ?? null)) {
            page_premier_mot_de_passe('La page a expiré : saisissez de nouveau le mot de passe, deux fois.');
        }
        $refus = poser_premier_mot_de_passe($_POST['mot_de_passe'] ?? '', $_POST['confirmation'] ?? '');
        if ($refus === null) {
            // La personne vient de le choisir : elle entre directement.
            ouvrir_session_connectee();
            header('Location: index.php', true, 303);
            exit;
        }
        if ($refus !== MSG_MOT_DE_PASSE_DEJA) {
            page_premier_mot_de_passe($refus);
        }
    } else {
        page_premier_mot_de_passe();
    }
}
if (!mot_de_passe_pose()) {
    page_installation('Le fichier data/pwd ne contient pas d’empreinte reconnue : personne ne peut entrer. Créez par FTP un fichier data/password qui contient le mot de passe (10 caractères au moins), puis rechargez la page ; ou, en ligne de commande dans le dossier du site :', 'php inc/mot-de-passe.php');
}
if ($action === 'choisir') {
    page_connexion(MSG_MOT_DE_PASSE_DEJA, '', 403, $avertissements);
}

if ($action === 'deconnexion') {
    if (est_connecte() && csrf_valide($_POST['csrf'] ?? null)) {
        fermer_session();
    }
    header('Location: index.php?au-revoir', true, 303);
    exit;
}

if ($action === 'connexion') {
    if (!csrf_valide($_POST['csrf'] ?? null)) {
        page_connexion('La page de connexion a expiré : saisissez de nouveau le mot de passe.', '', 200, $avertissements);
    }
    $essai = $_POST['mot_de_passe'] ?? '';
    $r = essayer_connexion(is_string($essai) ? $essai : '', cle_client(), time());
    if ($r === 'ok') {
        ouvrir_session_connectee();
        header('Location: index.php', true, 303);
        exit;
    }
    if (isset($r['attente'])) {
        page_connexion('Trop d’essais : patientez ' . $r['attente'] . ' seconde' . ($r['attente'] > 1 ? 's' : '') . ' avant de réessayer.', '', 429, $avertissements);
    }
    $suite = (int) ($r['refus'] ?? 0);
    // Le formulaire revient avec son erreur, en 200 : c'est une page a lire, pas une ressource refusee (la limitation, elle, rend 429).
    page_connexion('Mot de passe incorrect.' . ($suite > 0 ? ' Prochain essai possible dans ' . $suite . ' seconde' . ($suite > 1 ? 's' : '') . '.' : ''), '', 200, $avertissements);
}

if (!est_connecte()) {
    $expiree = ($_SESSION['expiree'] ?? false) === true;
    $change = ($_SESSION['change'] ?? false) === true;
    unset($_SESSION['expiree'], $_SESSION['change']);
    $info = match (true) {
        isset($_GET['au-revoir']) => 'Vous êtes déconnecté.',
        isset($clair['pose']) => 'Mot de passe enregistré, et le fichier data/password supprimé : connectez-vous avec ce mot de passe.',
        $change => 'Le mot de passe du site a changé : reconnectez-vous.',
        $expiree => 'Votre session a expiré : reconnectez-vous.',
        default => '',
    };
    page_connexion('', $info, 200, $avertissements);
}

$avertissements[] = avertissement_donnees();
page_application($avertissements);
