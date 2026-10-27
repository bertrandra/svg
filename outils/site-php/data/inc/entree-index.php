<?php
// Le point d'entree des pages (ADR-0041 §4) : la premiere visite cree l'administrateur (tant qu'aucun compte n'existe) ; ensuite,
// connexion, inscription, confirmation d'adresse, mot de passe oublie, reinitialisation, deconnexion ; connecte, l'application.
// Les formulaires portent le jeton CSRF de la session (anonyme ou non) ; les essais de connexion sont limites par client et par
// compte, les demandes de mail par client ; aucune reponse n'enumere les comptes.

declare(strict_types=1);

defined('SVG_SITE') || exit;

/**
 * Le dossier des donnees est-il sous la racine web ? Il l'est dans la disposition par defaut (public/data, un seul dossier envoye par
 * FTP) : rien n'y doit se lire par HTTP. On le demande au serveur lui-meme (data/config/config.json), une fois par heure, et l'on
 * avertit l'administrateur s'il repond.
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
    $vu = lire_json($cache, 2);
    if (is_array($vu) && time() - (int) ($vu['quand'] ?? 0) < 3600) {
        $lisible = $vu['lisible'] ?? null;
    } else {
        $lisible = http_lisible($base . '/config/config.json');
        @file_put_contents($cache, json_encode(['quand' => time(), 'lisible' => $lisible]));
    }
    if ($lisible === true) {
        error_log('securite : ' . DATA_DIR . ' se lit par HTTP (data/config/config.json repond)');
        return t('Attention : le dossier des données est lisible depuis le Web (data/config/config.json répond). Vérifiez que son .htaccess est appliqué (AllowOverride), ou placez data/ hors de la racine web, voir docs/deploiement-php.md.');
    }
    return $lisible === null ? t('Le dossier des données est sous la racine web et sa protection n’a pas pu être vérifiée : assurez-vous que le serveur refuse l’accès à data/ (voir docs/deploiement-php.md).') : '';
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

function rediriger(string $vers): never
{
    header('Location: ' . $vers, true, 303);
    exit;
}

function champ_formulaire(string $nom): string
{
    $v = $_POST[$nom] ?? '';
    return is_string($v) ? $v : '';
}

/** Les demandes qui font partir un mail (inscription, renvoi, mot de passe oublie) sont limitees par client, comme la connexion. */
function limiter_mails(): void
{
    $cle = 'm' . cle_client();
    $attente = attente_restante($cle, time());
    if ($attente > 0) {
        page_message(t('Trop de demandes'), t('Patientez {n} secondes avant de réessayer.', ['n' => $attente]), ['index.php' => t('Retour à la connexion')], 429);
    }
    noter_essai($cle, false, time());
}

/** La premiere visite : tant qu'aucun compte n'existe, seule la creation de l'administrateur est possible. */
function traiter_installation(string $action): never
{
    if ($action !== 'installer') {
        page_installation_admin();
    }
    $v = ['email' => champ_formulaire('email'), 'nom' => champ_formulaire('nom'), 'langue' => champ_formulaire('langue'), 'site_nom' => champ_formulaire('site_nom'), 'expediteur' => champ_formulaire('expediteur')];
    if (!csrf_valide($_POST['csrf'] ?? null)) {
        page_installation_admin($v, t('La page a expiré : saisissez de nouveau le formulaire.'));
    }
    if (!hash_equals(champ_formulaire('mot_de_passe'), champ_formulaire('confirmation'))) {
        page_installation_admin($v, t('Les deux saisies du mot de passe diffèrent : rien n’est enregistré.'));
    }
    $r = installer_administrateur($v['email'], $v['nom'], champ_formulaire('mot_de_passe'), $v['langue'], ['nom' => $v['site_nom'], 'expediteur' => $v['expediteur']]);
    if (isset($r['erreur'])) {
        if ($r['erreur'] === 'existe') {
            page_connexion($r['message'], '', 403);
        }
        page_installation_admin($v, $r['message']);
    }
    ouvrir_session_connectee($r['compte']);
    rediriger('index.php');
}

function traiter_connexion(): never
{
    $email = champ_formulaire('email');
    if (!csrf_valide($_POST['csrf'] ?? null)) {
        page_connexion(t('La page de connexion a expiré : saisissez de nouveau vos identifiants.'), '', 200, [], $email);
    }
    $r = essayer_connexion($email, champ_formulaire('mot_de_passe'), cle_client(), time());
    if (isset($r['ok'])) {
        ouvrir_session_connectee($r['compte']);
        rediriger('index.php');
    }
    if (isset($r['attente'])) {
        page_connexion(t('Trop d’essais : patientez {n} secondes avant de réessayer.', ['n' => $r['attente']]), '', 429, [], $email);
    }
    $suite = (int) ($r['suite'] ?? 0);
    // Le formulaire revient avec son erreur, en 200 : c'est une page a lire, pas une ressource refusee (la limitation, elle, rend 429).
    switch ($r['refus']) {
        case 'a-confirmer':
            page_connexion(t('Confirmez d’abord votre adresse : un lien vous a été envoyé par mail.'), '', 200, [], $email, true);
        case 'en-attente':
            page_connexion(t('Votre compte attend l’approbation d’un administrateur : vous recevrez un mail quand il sera ouvert.'), '', 200, [], $email);
        case 'acces':
            page_connexion(t('Ce compte n’a pas accès au site.'), '', 200, [], $email);
        default:
            page_connexion(t('Adresse ou mot de passe incorrect.') . ($suite > 0 ? ' ' . t('Prochain essai possible dans {n} secondes.', ['n' => $suite]) : ''), '', 200, [], $email);
    }
}

function traiter_inscription(): never
{
    if (!reglage('inscriptions.ouvertes')) {
        page_connexion(t('Les inscriptions sont fermées sur ce site.'), '', 403);
    }
    $v = ['email' => champ_formulaire('email'), 'nom' => champ_formulaire('nom'), 'langue' => champ_formulaire('langue')];
    if (!csrf_valide($_POST['csrf'] ?? null)) {
        page_inscription($v, t('La page a expiré : saisissez de nouveau le formulaire.'));
    }
    if (!hash_equals(champ_formulaire('mot_de_passe'), champ_formulaire('confirmation'))) {
        page_inscription($v, t('Les deux saisies du mot de passe diffèrent : rien n’est enregistré.'));
    }
    limiter_mails();
    $r = creer_compte($v['email'], $v['nom'], champ_formulaire('mot_de_passe'), $v['langue']);
    if (isset($r['erreur']) && $r['erreur'] !== 'existe') {
        page_inscription($v, $r['message']);
    }
    if (isset($r['compte'])) {
        $erreur = mail_confirmation($r['compte']);
        if ($erreur !== null) {
            page_message(t('Le message n’est pas parti'), t('Votre compte est créé, mais le site n’a pas pu envoyer le mail de confirmation. Prévenez l’administrateur, puis demandez un nouveau mail depuis la page de connexion.'), ['index.php' => t('Retour à la connexion')], 500);
        }
    }
    // La meme reponse que l'adresse soit libre ou prise : on n'enumere pas les comptes.
    page_message(t('Message envoyé'), t('Si cette adresse n’a pas déjà un compte, un message vient de partir : ouvrez le lien qu’il contient pour confirmer votre adresse (48 heures).'), ['index.php' => t('Retour à la connexion')]);
}

/** Renvoyer le mail de confirmation a une adresse non confirmee ; la meme reponse quoi qu'il en soit. */
function traiter_renvoi(): never
{
    if (!csrf_valide($_POST['csrf'] ?? null)) {
        page_connexion(t('La page a expiré : réessayez.'), '', 200);
    }
    limiter_mails();
    $compte = compte_par_email(champ_formulaire('email'));
    if ($compte !== null && $compte['etat'] === 'a-confirmer') {
        mail_confirmation($compte);
    }
    page_message(t('Message envoyé'), t('Si cette adresse attend une confirmation, un nouveau message vient de partir.'), ['index.php' => t('Retour à la connexion')]);
}

function traiter_confirmation(mixed $jeton): never
{
    $j = consommer_jeton($jeton, 'confirmation');
    $compte = $j === null ? null : lire_compte($j['compte']);
    if ($compte === null || $compte['etat'] !== 'a-confirmer') {
        if ($compte !== null && $compte['etat'] !== 'a-confirmer') {
            page_message(t('Adresse déjà confirmée'), t('Cette adresse est déjà confirmée.'), ['index.php' => t('Retour à la connexion')]);
        }
        page_confirmation_expiree();
    }
    $compte = modifier_compte($compte['id'], ['etat' => 'en-attente', 'confirmeLe' => maintenant_iso()]) ?? $compte;
    journaliser('comptes', 'confirme id=' . $compte['id']);
    mails_nouvelle_demande($compte);
    page_message(t('Adresse confirmée'), t('Merci : votre adresse est confirmée. Un administrateur doit encore approuver votre compte ; vous recevrez un mail quand il sera ouvert.'), ['index.php' => t('Retour à la connexion')]);
}

function traiter_oubli(): never
{
    $email = champ_formulaire('email');
    if (!csrf_valide($_POST['csrf'] ?? null)) {
        page_oublie(t('La page a expiré : saisissez de nouveau votre adresse.'), $email);
    }
    limiter_mails();
    $compte = compte_par_email($email);
    if ($compte !== null && in_array($compte['etat'], ['actif', 'en-attente'], true)) {
        mail_reinitialisation($compte);
    }
    page_message(t('Message envoyé'), t('Si un compte porte cette adresse, un message vient de partir : ouvrez le lien qu’il contient pour choisir un nouveau mot de passe (1 heure).'), ['index.php' => t('Retour à la connexion')]);
}

function traiter_reinitialisation(): never
{
    $jeton = champ_formulaire('jeton');
    if (!csrf_valide($_POST['csrf'] ?? null)) {
        page_reinitialisation($jeton, t('La page a expiré : saisissez de nouveau le mot de passe, deux fois.'));
    }
    $j = lire_jeton($jeton, 'reinitialisation');
    $compte = $j === null ? null : lire_compte($j['compte']);
    if ($compte === null || !in_array($compte['etat'], ['actif', 'en-attente'], true)) {
        page_message(t('Lien expiré'), t('Ce lien a expiré ou a déjà servi : demandez-en un nouveau.'), ['index.php?oublie' => t('Mot de passe oublié'), 'index.php' => t('Retour à la connexion')], 410);
    }
    $mot = champ_formulaire('mot_de_passe');
    $refus = mot_de_passe_refuse($mot);
    if ($refus !== null) {
        page_reinitialisation($jeton, $refus . ' : ' . t('rien n’est enregistré.'));
    }
    if (!hash_equals($mot, champ_formulaire('confirmation'))) {
        page_reinitialisation($jeton, t('Les deux saisies du mot de passe diffèrent : rien n’est enregistré.'));
    }
    // Le jeton ne sert qu'une fois : consomme ici, apres que le mot de passe a ete juge.
    if (consommer_jeton($jeton, 'reinitialisation') === null) {
        page_message(t('Lien expiré'), t('Ce lien a expiré ou a déjà servi : demandez-en un nouveau.'), ['index.php?oublie' => t('Mot de passe oublié')], 410);
    }
    // Les sessions ouvertes portent l'ancienne marque : chacune se ferme a sa requete suivante, en le disant.
    $compte = poser_mot_de_passe_compte($compte['id'], $mot) ?? $compte;
    journaliser('connexions', 'mot de passe reinitialise compte=' . $compte['id']);
    page_connexion('', t('Mot de passe enregistré : connectez-vous avec lui.'), 200, [], $compte['email']);
}

function entree_index(): never
{
    set_exception_handler(function (Throwable $e): void {
        error_log('index : ' . $e::class . ' : ' . $e->getMessage() . ' (' . $e->getFile() . ':' . $e->getLine() . ')');
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: text/html; charset=utf-8');
        }
        echo '<!doctype html><html lang="fr"><meta charset="utf-8"><title>Erreur</title><p>Le serveur a rencontré une erreur. Réessayez ; si elle persiste, l’administrateur la trouvera dans son journal.</p>';
    });
    entetes_securite();
    $probleme = preparer_donnees();
    if ($probleme !== null) {
        langue_courante(langue_de_la_requete(null));
        page_probleme($probleme);
    }
    // Le selecteur de langue des pages d'avant la connexion : un cookie, puis la meme page sans le parametre.
    if (isset($_GET['langue'])) {
        poser_cookie_langue(is_string($_GET['langue']) ? $_GET['langue'] : '');
        $q = $_GET;
        unset($q['langue']);
        rediriger('index.php' . ($q === [] ? '' : '?' . http_build_query($q)));
    }
    demarrer_session();
    $compte = compte_connecte();
    langue_courante(langue_de_la_requete($compte));
    $action = ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' ? champ_formulaire('action') : '';

    if (!comptes_existent()) {
        traiter_installation($action);
    }
    if ($action === 'installer') {
        page_connexion(t('Le site a déjà un administrateur : connectez-vous.'), '', 403);
    }
    if ($action === 'deconnexion') {
        if (est_connecte() && csrf_valide($_POST['csrf'] ?? null)) {
            fermer_session();
        }
        rediriger('index.php?au-revoir');
    }
    if ($compte !== null) {
        if ($action !== '' || isset($_GET['inscription']) || isset($_GET['oublie'])) {
            rediriger('index.php');
        }
        $avertissements = [avertissement_donnees()];
        page_application($avertissements, $compte);
    }
    switch ($action) {
        case 'connexion':
            traiter_connexion();
        case 'inscription':
            traiter_inscription();
        case 'renvoyer':
            traiter_renvoi();
        case 'oublie':
            traiter_oubli();
        case 'reinitialiser':
            traiter_reinitialisation();
    }
    if (isset($_GET['confirmer'])) {
        traiter_confirmation($_GET['confirmer']);
    }
    if (isset($_GET['reinitialiser'])) {
        $jeton = $_GET['reinitialiser'];
        if (lire_jeton($jeton, 'reinitialisation') === null) {
            page_message(t('Lien expiré'), t('Ce lien a expiré ou a déjà servi : demandez-en un nouveau.'), ['index.php?oublie' => t('Mot de passe oublié'), 'index.php' => t('Retour à la connexion')], 410);
        }
        page_reinitialisation((string) $jeton);
    }
    if (isset($_GET['inscription'])) {
        if (!reglage('inscriptions.ouvertes')) {
            page_connexion(t('Les inscriptions sont fermées sur ce site.'), '', 403);
        }
        page_inscription();
    }
    if (isset($_GET['oublie'])) {
        page_oublie();
    }
    $avis = prendre_avis();
    $info = match (true) {
        isset($_GET['au-revoir']) => t('Vous êtes déconnecté.'),
        $avis === 'change' => t('Votre mot de passe a changé : reconnectez-vous.'),
        $avis === 'expiree' => t('Votre session a expiré : reconnectez-vous.'),
        $avis === 'acces' => t('Votre session a été fermée : ce compte n’a plus accès au site.'),
        default => '',
    };
    page_connexion('', $info, 200);
}
