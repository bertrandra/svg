<?php
// Le site par HTTP, comme un navigateur le voit (ADR-0030, ADR-0041) : `php -S` sur une copie de outils/site-php, un dossier de
// donnees temporaire, le courrier en mode fichier (rien ne part), et une source de polices simulee par un second `php -S` (jamais le
// vrai reseau). Installation de l'administrateur (puis la route fermee, la migration d'un site d'avant), connexion (adresse et mot
// de passe, CSRF, limitation, expiration, refus par etat), inscription → mail → confirmation → mail aux administrateurs → approbation
// → mail → connexion, reinitialisation (1 h, usage unique), profil et mot de passe (les autres sessions fermees), l'API
// d'administration (role relu, dernier administrateur, soi-meme, reglages, mail d'essai), projets bornes au compte, suppression d'un
// compte, disposition livree (data/ dans public/ sous le routeur), en-tetes, data/inc et data/config jamais servis, langue par
// cookie, configuration illisible, chemins hostiles, JSON geant ou invalide, controle de version, polices.

declare(strict_types=1);

require __DIR__ . '/outils.php';

$depot = dirname(__DIR__, 2);

/**
 * Une copie du site, data/ a cote de public/ (avec un config.local.php dans data/config), le courrier en mode fichier, et
 * l'administrateur cree en ligne de commande (sauf `$avecAdmin` faux). Rend ['racine', 'data', 'url'].
 */
function installer(string $depot, array $constantes = [], bool $avecAdmin = true, array $config = []): array
{
    $t = dossier_temporaire('site-http');
    register_shutdown_function(fn() => effacer($t));
    copier($depot . '/outils/site-php/public', $t . '/public');
    copier($depot . '/outils/site-php/data', $t . '/data');
    mkdir($t . '/data/json', 0700, true);
    mkdir($t . '/data/config', 0700, true);
    $lignes = ['<?php'];
    foreach ($constantes as $nom => $valeur) {
        $lignes[] = 'define(' . var_export($nom, true) . ', ' . var_export($valeur, true) . ');';
    }
    file_put_contents($t . '/data/config/config.local.php', implode("\n", $lignes) . "\n");
    ecrire_config($t . '/data', $config);
    if ($avecAdmin) {
        creer_admin($t . '/data');
    }
    return ['racine' => $t, 'data' => $t . '/data', 'url' => serveur_php($t . '/public')];
}

/**
 * La disposition livree, telle qu'on l'envoie par FTP : public/ seul, data/ dedans (code et .htaccess compris), aucun config.local.php,
 * aucun compte. `php -S` n'applique pas les .htaccess : avec `$routeur`, data/inc/serveur-local.php refuse data/ a leur place ; sans,
 * data/ se sert comme un fichier ordinaire (un .htaccess ignore). Rend la racine web, data/ et l'adresse.
 */
function installer_livre(string $depot, bool $routeur = true): array
{
    $t = dossier_temporaire('site-livre');
    register_shutdown_function(fn() => effacer($t));
    copier($depot . '/outils/site-php/public', $t . '/public');
    copier($depot . '/outils/site-php/data', $t . '/public/data');
    mkdir($t . '/public/data/json', 0700, true);
    $public = $t . '/public';
    return ['public' => $public, 'data' => $public . '/data', 'url' => serveur_php($public, $routeur ? $public . '/data/inc/serveur-local.php' : null, 4)];
}

// La source de polices simulee : un fichier juste (400) et un faux (700) aux adresses de jsDelivr et de Bunny.
$source = dossier_temporaire('source-polices');
register_shutdown_function(fn() => effacer($source));
$juste = 'wOFF' . random_bytes(200);
$faux = 'wOFF' . random_bytes(200);
foreach (['npm/@fontsource/essai@5.3.0/files', 'bunny/essai/files'] as $d) {
    mkdir($source . '/' . $d, 0700, true);
    file_put_contents($source . '/' . $d . '/essai-latin-400-normal.woff', $juste);
    file_put_contents($source . '/' . $d . '/essai-latin-700-normal.woff', $faux);
}
$urlSource = serveur_php($source);
$shaJuste = base64_encode(hash('sha256', $juste, true));
$shaAttendu700 = base64_encode(hash('sha256', 'ce que l index attend pour la 700', true));

$site = installer($depot, [
    'POLICES_SOURCES' => ['jsdelivr' => $urlSource . '/npm/@fontsource/', 'bunny' => $urlSource . '/bunny/', 'gitlab' => $urlSource . '/gitlab/', 'fontshare' => $urlSource . '/wf/'],
    'PROJET_OCTETS_MAX' => 200000,
    // Tous les clients des tests viennent de 127.0.0.1 : la limitation des demandes de mail se teste a part.
    'COURRIER_DEMANDES_LIBRES' => 1000,
]);
file_put_contents($site['data'] . '/json/polices-catalogue.json', json_encode(['format' => 1, 'instantane' => '2026-10-25', 'familles' => [[
    'id' => 'essai', 'nom' => 'Essai', 'depot' => 'fontsource', 'source' => 'google', 'categorie' => 'lineale', 'licence' => 'OFL-1.1', 'version' => '5.3.0', 'ecritures' => ['latin'],
    'variantes' => [[400, 0, $shaJuste, null], [700, 0, $shaAttendu700, null]],
]], 'anciennes' => []]));
file_put_contents($site['data'] . '/json/bibliotheque.json', '{"entrees":[]}');
$url = $site['url'];
$data = $site['data'];

function projet_json(string $nom = 'Carte'): array
{
    return [
        'format' => 'editeur-svg/projet', 'version' => 1, 'nom' => $nom,
        'dessin' => ['vb' => [0, 0, 100, 80], 'formes' => [['id' => 'f1', 'd' => 'M10 10L90 10L50 70Z', 'remplissage' => '#c81e28', 'contour' => null, 'epaisseur' => 1, 'opacite' => 1, 'regle' => 'nonzero', 'visible' => true, 'verrouille' => false]]],
        'production' => ['contexte' => 'generique'], 'nuancier' => [], 'ressources' => ['polices' => [], 'images' => []],
    ];
}

/** Un client connecte (l'administrateur par defaut), et son jeton CSRF. */
function connecte(string $url, string $email = ADMIN_EMAIL, string $mot = MOT): array
{
    $c = new Client($url);
    [$statut, , $page] = $c->connecter($email, $mot);
    egal(303, $statut, 'connexion de ' . $email . ' : ' . mb_substr(strip_tags($page), 0, 200));
    return [$c, $c->jeton()];
}

/** Le jeton CSRF du formulaire de la page courante. */
function jeton_de(string $page): string
{
    return preg_match('/name="csrf" value="([a-f0-9]{64})"/', $page, $m) === 1 ? $m[1] : '';
}

/** Le JSON d'une reponse, ou []. */
function json_de(string $corps): array
{
    $j = json_decode($corps, true);
    return is_array($j) ? $j : [];
}

/** Un compte actif de plus, cree par l'administrateur (API) ; rend sa fiche. */
function creer_utilisateur(string $url, string $email, string $nom = 'Personne', string $mot = 'le mot de passe de la personne', string $langue = 'fr'): array
{
    [$a, $csrf] = connecte($url);
    [$statut, , $corps] = $a->ecrire('api.php?r=compte-creer', ['email' => $email, 'nom' => $nom, 'langue' => $langue, 'motDePasse' => $mot], $csrf);
    egal(200, $statut, $corps);
    return json_de($corps)['compte'];
}

/** Une inscription en libre-service, jusqu'a l'etat demande ('a-confirmer', 'en-attente' ou 'actif') ; rend [fiche, mot de passe]. */
function inscrire(string $url, string $data, string $email, string $etat, string $nom = 'Nouvelle', string $langue = 'fr'): array
{
    $mot = 'le mot de passe de ' . $email;
    $c = new Client($url);
    [, , $page] = $c->get('index.php?inscription');
    [$statut, , $r] = $c->formulaire('index.php', ['action' => 'inscription', 'csrf' => jeton_de($page), 'email' => $email, 'nom' => $nom, 'mot_de_passe' => $mot, 'confirmation' => $mot, 'langue' => $langue]);
    egal(200, $statut, mb_substr(strip_tags($r), 0, 200));
    if ($etat !== 'a-confirmer') {
        $jeton = jeton_du_mail(dernier_mail($data, $email), 'confirmer');
        affirmer($jeton !== '', 'le mail de confirmation est ecrit pour ' . $email);
        egal(200, $c->get('index.php?confirmer=' . $jeton)[0]);
    }
    [$a, $csrf] = connecte($url);
    $fiche = null;
    foreach (json_de($a->get('api.php?r=comptes')[2])['comptes'] ?? [] as $f) {
        if ($f['email'] === $email) {
            $fiche = $f;
        }
    }
    affirmer($fiche !== null, 'le compte existe');
    if ($etat === 'actif') {
        [$statut, , $corps] = $a->ecrire('api.php?r=compte-approuver&id=' . $fiche['id'], new stdClass(), $csrf);
        egal(200, $statut, $corps);
        $fiche = json_de($corps)['compte'];
    }
    return [$fiche, $mot];
}

// ---------------------------------------------------------------------------------------------------------------------------------
// L'installation
// ---------------------------------------------------------------------------------------------------------------------------------

test('sans aucun compte, la page cree l administrateur : CSRF exige, saisies jugees, puis la session s ouvre ; ensuite la route n existe plus', function () use ($depot): void {
    $s = installer($depot, [], false);
    // Un site d'avant : des projets a plat, un mot de passe unique, aucun config.json (la page l'ecrit).
    unlink($s['data'] . '/config/config.json');
    file_put_contents($s['data'] . '/pwd', "\$2y\$10\$x\n");
    file_put_contents($s['data'] . '/connexions.json', '{}');
    mkdir($s['data'] . '/projets', 0700, true);
    foreach (['.json' => json_encode(projet_json('Ancien')), '.meta.json' => json_encode(['id' => '0123456789abcdef', 'nom' => 'Ancien', 'creeLe' => '2026-01-01T00:00:00Z', 'modifieLe' => '2026-01-01T00:00:00Z', 'revision' => 1])] as $suffixe => $contenu) {
        file_put_contents($s['data'] . '/projets/0123456789abcdef' . $suffixe, $contenu);
    }
    $c = new Client($s['url']);
    [$statut, , $page] = $c->get('index.php');
    egal(200, $statut);
    contient('<h2 id="titre-installation">Créer le compte administrateur</h2>', $page);
    contient('autocomplete="new-password"', $page);
    contient('php data/inc/compte.php --admin', $page);
    egal(false, str_contains($page, 'name="action" value="connexion"'), 'pas de formulaire de connexion');
    [$statut, , $corps] = $c->get('api.php?r=projets');
    egal(503, $statut);
    egal('installation', json_de($corps)['erreur'] ?? null);
    $champs = ['action' => 'installer', 'email' => 'admin@exemple.org', 'nom' => 'Admin', 'mot_de_passe' => MOT, 'confirmation' => MOT, 'langue' => 'fr', 'site_nom' => 'Mon atelier', 'expediteur' => 'no-reply@exemple.org'];
    [, , $page] = $c->formulaire('index.php', $champs);
    contient('La page a expiré', $page, 'sans jeton');
    egal([], glob($s['data'] . '/comptes/*.json') ?: [], 'rien n est ecrit');
    $jeton = jeton_de($c->get('index.php')[2]);
    [, , $page] = $c->formulaire('index.php', ['csrf' => $jeton, 'confirmation' => 'autre chose'] + $champs);
    contient('Les deux saisies du mot de passe diffèrent', $page);
    contient('role="alert" id="erreur-installation"', $page);
    [, , $page] = $c->formulaire('index.php', ['csrf' => $jeton, 'mot_de_passe' => 'court', 'confirmation' => 'court'] + $champs);
    contient('au moins 10 caractères', $page);
    [, , $page] = $c->formulaire('index.php', ['csrf' => $jeton, 'email' => 'pas une adresse'] + $champs);
    contient('n’est pas valide', $page);
    egal([], glob($s['data'] . '/comptes/*.json') ?: [], 'aucun refus n a rien ecrit');
    [$statut, $h] = $c->formulaire('index.php', ['csrf' => $jeton] + $champs);
    egal(303, $statut);
    contient('svg_session=', $h['set-cookie'] ?? '', 'une nouvelle session');
    [, , $app] = $c->get('index.php');
    contient('<div id="site" data-csrf="', $app, 'la session est ouverte : l application');
    contient('data-compte="', $app);
    contient('&quot;role&quot;:&quot;admin&quot;', $app);
    contient('&quot;nom&quot;:&quot;Mon atelier&quot;', $app);
    $comptes = glob($s['data'] . '/comptes/*.json') ?: [];
    egal(1, count($comptes));
    $compte = json_decode((string) file_get_contents($comptes[0]), true);
    egal(['admin', 'actif', 'admin@exemple.org'], [$compte['role'], $compte['etat'], $compte['email']]);
    egal(false, str_contains((string) file_get_contents($comptes[0]), MOT), 'jamais en clair');
    $config = json_decode((string) file_get_contents($s['data'] . '/config/config.json'), true);
    egal('Mon atelier', $config['site']['nom'] ?? null);
    egal('no-reply@exemple.org', $config['courrier']['expediteur'] ?? null);
    // La migration : les projets d'avant sont a l'administrateur, le mot de passe unique n'existe plus.
    egal(true, is_file($s['data'] . '/projets/' . $compte['id'] . '/0123456789abcdef.json'));
    egal(false, file_exists($s['data'] . '/pwd') || file_exists($s['data'] . '/connexions.json'));
    [, , $liste] = $c->get('api.php?r=projets');
    egal(['Ancien'], array_column(json_de($liste)['projets'] ?? [], 'nom'));
    // Un autre visiteur voit la connexion ; un envoi direct est refuse.
    $autre = new Client($s['url']);
    [, , $page] = $autre->get('index.php');
    contient('name="action" value="connexion"', $page);
    egal(false, str_contains($page, 'Créer le compte administrateur'));
    [$statut, , $page] = $autre->formulaire('index.php', ['csrf' => jeton_de($page), 'email' => 'pirate@exemple.org'] + $champs);
    egal(403, $statut);
    contient('Le site a déjà un administrateur', $page);
    egal(1, count(glob($s['data'] . '/comptes/*.json') ?: []));
    egal(303, $autre->connecter('admin@exemple.org', MOT)[0], 'la connexion marche avec le compte cree');
});

// ---------------------------------------------------------------------------------------------------------------------------------
// La connexion
// ---------------------------------------------------------------------------------------------------------------------------------

test('la page de connexion : en-tetes de securite, cookie HttpOnly et SameSite=Strict, les champs, les liens, aucune erreur PHP', function () use ($url): void {
    [$statut, $h, $page] = (new Client($url))->get('index.php');
    egal(200, $statut);
    contient("default-src 'none'", $h['content-security-policy'] ?? '');
    contient("frame-ancestors 'none'", $h['content-security-policy'] ?? '');
    egal(false, str_contains($h['content-security-policy'] ?? '', 'http'), 'aucun domaine tiers');
    egal('nosniff', $h['x-content-type-options'] ?? '');
    egal('no-referrer', $h['referrer-policy'] ?? '');
    egal(false, isset($h['x-powered-by']), 'pas de X-Powered-By');
    contient('HttpOnly', $h['set-cookie'] ?? '');
    contient('SameSite=Strict', $h['set-cookie'] ?? '');
    contient('<html lang="fr">', $page);
    contient('<h1>Site d’essai</h1>', $page);
    contient('<label class="champ" for="email">', $page);
    contient('autocomplete="current-password"', $page);
    contient('index.php?inscription', $page);
    contient('index.php?oublie', $page);
    contient('class="site-langue"', $page);
    egal(false, (bool) preg_match('/Warning|Notice|Fatal|Deprecated/', $page), 'aucune erreur PHP affichee');
});

test('un mauvais mot de passe ou une adresse inconnue sont refuses de la meme facon ; le bon ouvre une nouvelle session et l application', function () use ($url): void {
    $c = new Client($url);
    $avant = $c->jeton();
    [$statut, , $page] = $c->formulaire('index.php', ['action' => 'connexion', 'csrf' => $avant, 'email' => ADMIN_EMAIL, 'mot_de_passe' => 'faux']);
    egal(200, $statut);
    contient('Adresse ou mot de passe incorrect.', $page);
    contient('role="alert" id="erreur-connexion"', $page);
    contient('aria-invalid="true"', $page);
    contient('value="admin@exemple.org"', $page, 'l adresse reste dans le champ');
    [, , $page2] = $c->formulaire('index.php', ['action' => 'connexion', 'csrf' => $c->jeton(), 'email' => 'personne@exemple.org', 'mot_de_passe' => 'faux']);
    contient('Adresse ou mot de passe incorrect.', $page2, 'la meme phrase pour une adresse inconnue');
    [$statut, $h] = $c->connecter(ADMIN_EMAIL, MOT);
    egal(303, $statut);
    contient('svg_session=', $h['set-cookie'] ?? '', 'un nouvel identifiant de session');
    [, , $app] = $c->get('index.php');
    contient('<div id="site" data-csrf="', $app);
    contient('data-site="', $app);
    contient('<script src="assets/site.js" defer></script>', $app);
    affirmer($c->jeton() !== $avant, 'un nouveau jeton CSRF apres la connexion');
    egal(303, $c->connecter(ADMIN_EMAIL, 'faux')[0], 'connecte, une nouvelle connexion ramene a l application');
});

test('une connexion sans jeton CSRF de la session est refusee', function () use ($url): void {
    $c = new Client($url);
    $c->get('index.php');
    [$statut, , $page] = $c->formulaire('index.php', ['action' => 'connexion', 'csrf' => str_repeat('0', 64), 'email' => ADMIN_EMAIL, 'mot_de_passe' => MOT]);
    egal(200, $statut);
    contient('a expiré', $page);
    [$statut, , $page] = $c->formulaire('index.php', ['action' => 'connexion', 'email' => ADMIN_EMAIL, 'mot_de_passe' => MOT]);
    contient('a expiré', $page);
    [, , $page] = $c->get('index.php');
    egal(false, str_contains($page, 'data-csrf'), 'toujours pas connecte');
});

test('apres trois echecs, chaque essai attend un delai qui double, meme avec le bon mot de passe ; le journal ne garde ni adresse ni mot de passe', function () use ($depot): void {
    $s = installer($depot, []);
    $c = new Client($s['url']);
    for ($i = 0; $i < 3; $i++) {
        [, , $page] = $c->formulaire('index.php', ['action' => 'connexion', 'csrf' => $c->jeton(), 'email' => ADMIN_EMAIL, 'mot_de_passe' => 'faux ' . $i]);
        contient('Adresse ou mot de passe incorrect.', $page, 'essai libre ' . $i);
    }
    [$statut, , $page] = $c->connecter(ADMIN_EMAIL, MOT);
    egal(429, $statut, 'retenu');
    contient('Trop d’essais : patientez', $page);
    sleep(3);
    [, , $page] = $c->formulaire('index.php', ['action' => 'connexion', 'csrf' => $c->jeton(), 'email' => ADMIN_EMAIL, 'mot_de_passe' => 'encore faux']);
    contient('Prochain essai possible dans 4 secondes', $page);
    sleep(5);
    [$statut] = $c->connecter(ADMIN_EMAIL, MOT);
    egal(303, $statut, 'le bon mot de passe passe une fois le delai ecoule');
    $journal = (string) file_get_contents($s['data'] . '/journal/connexions.log');
    contient('retenue client=', $journal);
    egal(false, str_contains($journal, '127.0.0.1') || str_contains($journal, 'exemple.org') || str_contains($journal, 'faux'), 'le journal ne garde ni adresse, ni courrier, ni mot de passe');
});

test('la deconnexion (formulaire et API) ferme la session ; une session inactive expire', function () use ($url, $depot): void {
    [$c, $csrf] = connecte($url);
    [$statut, $h] = $c->formulaire('index.php', ['action' => 'deconnexion', 'csrf' => $csrf]);
    egal(303, $statut);
    contient('au-revoir', $h['location'] ?? '');
    egal(401, $c->get('api.php?r=projets')[0]);
    contient('Vous êtes déconnecté.', $c->get('index.php?au-revoir')[2]);
    [$c, $csrf] = connecte($url);
    egal(200, $c->ecrire('api.php?r=deconnexion', new stdClass(), $csrf)[0]);
    egal(401, $c->get('api.php?r=projets')[0]);

    $court = installer($depot, [], true, ['sessions' => ['inactivite' => 1]]);
    [$d] = connecte($court['url']);
    egal(200, $d->get('api.php?r=projets')[0]);
    sleep(3);
    egal(401, $d->get('api.php?r=projets')[0]);
    contient('Votre session a expiré', $d->get('index.php')[2]);
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Le circuit d'une personne : inscription, confirmation, approbation, connexion ; refus par etat ; renvoi
// ---------------------------------------------------------------------------------------------------------------------------------

test('inscription → mail (fichier) → lien → confirmation → mail aux administrateurs → approbation → mail → connexion', function () use ($url, $data): void {
    $c = new Client($url);
    [$statut, , $page] = $c->get('index.php?inscription');
    egal(200, $statut);
    contient('<h2 id="titre-inscription">Créer un compte</h2>', $page);
    $jeton = jeton_de($page);
    $champs = ['action' => 'inscription', 'csrf' => $jeton, 'email' => 'anne@exemple.org', 'nom' => 'Anne', 'mot_de_passe' => 'le mot de passe d’Anne', 'confirmation' => 'le mot de passe d’Anne', 'langue' => 'en'];
    [, , $page] = $c->formulaire('index.php', ['csrf' => 'x'] + $champs);
    contient('La page a expiré', $page);
    [, , $page] = $c->formulaire('index.php', ['confirmation' => 'autre'] + $champs);
    contient('Les deux saisies du mot de passe diffèrent', $page);
    [, , $page] = $c->formulaire('index.php', ['mot_de_passe' => 'court', 'confirmation' => 'court'] + $champs);
    contient('au moins 10 caractères', $page);
    egal(null, dernier_mail($data, 'anne@exemple.org'), 'aucun mail sur un refus');
    [$statut, , $page] = $c->formulaire('index.php', $champs);
    egal(200, $statut);
    contient('Si cette adresse n’a pas déjà un compte, un message vient de partir', $page);
    $mail = dernier_mail($data, 'anne@exemple.org');
    affirmer($mail !== null, 'le mail de confirmation est ecrit');
    egal('Confirm your address — Site d’essai', $mail['sujet'], 'dans la langue choisie');
    contient('Hello Anne,', $mail['corps']);
    $jetonMail = jeton_du_mail($mail, 'confirmer');
    affirmer($jetonMail !== '', 'un lien de confirmation');
    // La meme adresse de nouveau : la meme reponse, mais aucun nouveau mail (on n'enumere pas les comptes).
    $n = count(mails_ecrits($data));
    [, , $page] = $c->formulaire('index.php', ['csrf' => jeton_de($c->get('index.php?inscription')[2])] + $champs);
    contient('Si cette adresse n’a pas déjà un compte, un message vient de partir', $page);
    egal($n, count(mails_ecrits($data)), 'pas de second mail');
    // Avant la confirmation : la connexion le dit, et propose de renvoyer le mail.
    [, , $page] = $c->connecter('anne@exemple.org', 'le mot de passe d’Anne');
    contient('Confirmez d’abord votre adresse', $page);
    contient('name="action" value="renvoyer"', $page);
    [, , $page] = $c->formulaire('index.php', ['action' => 'renvoyer', 'csrf' => jeton_de($page), 'email' => 'anne@exemple.org']);
    contient('un nouveau message vient de partir', $page);
    $renvoye = dernier_mail($data, 'anne@exemple.org');
    $jetonRenvoye = jeton_du_mail($renvoye, 'confirmer');
    affirmer($jetonRenvoye !== '' && $jetonRenvoye !== $jetonMail, 'un nouveau lien');
    [$statut, , $page] = $c->get('index.php?confirmer=' . $jetonMail);
    egal(410, $statut, 'l ancien lien ne vaut plus');
    contient('Lien expiré', $page);
    contient('name="action" value="renvoyer"', $page, 'et propose de renvoyer');
    // Le lien : l'adresse est confirmee, les administrateurs sont prevenus, dans leur langue.
    [$statut, , $page] = $c->get('index.php?confirmer=' . $jetonRenvoye);
    egal(200, $statut);
    contient('<h2 id="titre-message">Adresse confirmée</h2>', $page);
    contient('Un administrateur doit encore approuver votre compte', $page);
    $admin = dernier_mail($data, ADMIN_EMAIL);
    affirmer($admin !== null, 'mail a l administrateur');
    contient('Nouvelle demande : Anne (anne@exemple.org)', $admin['corps']);
    egal('Nouvelle demande de compte : Anne', $admin['sujet']);
    egal(410, $c->get('index.php?confirmer=' . $jetonRenvoye)[0], 'un lien consomme ne vaut plus');
    [, , $page] = $c->connecter('anne@exemple.org', 'le mot de passe d’Anne');
    contient('Votre compte attend l’approbation d’un administrateur', $page);
    // L'administrateur approuve ; la personne est prevenue, puis entre.
    [$a, $csrf] = connecte($url);
    [, , $corps] = $a->get('api.php?r=compte');
    egal(1, json_de($corps)['admin']['enAttente'] ?? null);
    $fiche = null;
    foreach (json_de($a->get('api.php?r=comptes')[2])['comptes'] ?? [] as $f) {
        if ($f['email'] === 'anne@exemple.org') {
            $fiche = $f;
        }
    }
    egal('en-attente', $fiche['etat'] ?? null);
    affirmer(isset($fiche['confirmeLe']), 'confirmeLe');
    [$statut, , $corps] = $a->ecrire('api.php?r=compte-approuver&id=' . $fiche['id'], new stdClass(), $csrf);
    egal(200, $statut, $corps);
    egal('actif', json_de($corps)['compte']['etat'] ?? null);
    egal('Your account is open — Site d’essai', dernier_mail($data, 'anne@exemple.org')['sujet'] ?? null);
    egal(409, $a->ecrire('api.php?r=compte-approuver&id=' . $fiche['id'], new stdClass(), $csrf)[0], 'approuver deux fois : etat');
    [$statut] = $c->connecter('anne@exemple.org', 'le mot de passe d’Anne');
    egal(303, $statut);
    [, , $app] = $c->get('index.php');
    contient('<html lang="en">', $app, 'la langue du compte');
    contient('&quot;role&quot;:&quot;utilisateur&quot;', $app);
    [, , $corps] = $c->get('api.php?r=compte');
    egal(false, isset(json_de($corps)['admin']), 'pas d admin pour un utilisateur');
    egal(403, $c->get('api.php?r=comptes')[0]);
    egal('role', json_de($c->get('api.php?r=comptes')[2])['erreur'] ?? null);
});

test('un compte refuse ou suspendu ne se connecte pas et perd ses sessions ; les inscriptions peuvent se fermer', function () use ($url, $data, $depot): void {
    [$fiche, $mot] = inscrire($url, $data, 'refusee@exemple.org', 'en-attente', 'Refusée');
    [$a, $csrf] = connecte($url);
    [$statut, , $corps] = $a->ecrire('api.php?r=compte-refuser&id=' . $fiche['id'], ['raison' => 'Adresse inconnue de l’association'], $csrf);
    egal(200, $statut, $corps);
    egal('refuse', json_de($corps)['compte']['etat'] ?? null);
    $mail = dernier_mail($data, 'refusee@exemple.org');
    contient('Raison donnée : Adresse inconnue de l’association', $mail['corps'] ?? '');
    contient('Ce compte n’a pas accès au site.', (new Client($url))->connecter('refusee@exemple.org', $mot)[2]);
    // Un compte actif, connecte, puis suspendu : sa session se ferme a la requete suivante.
    [$fiche2, $mot2] = inscrire($url, $data, 'suspendue@exemple.org', 'actif', 'Suspendue');
    [$u] = connecte($url, 'suspendue@exemple.org', $mot2);
    egal(200, $u->get('api.php?r=projets')[0]);
    egal(200, $a->ecrire('api.php?r=compte-suspendre&id=' . $fiche2['id'], new stdClass(), $csrf)[0]);
    egal(401, $u->get('api.php?r=projets')[0], 'la session est fermee');
    contient('ce compte n’a plus accès au site', $u->get('index.php')[2]);
    contient('Ce compte n’a pas accès au site.', $u->connecter('suspendue@exemple.org', $mot2)[2]);
    egal(200, $a->ecrire('api.php?r=compte-reactiver&id=' . $fiche2['id'], new stdClass(), $csrf)[0]);
    egal(303, $u->connecter('suspendue@exemple.org', $mot2)[0], 'reactive, il entre');
    // Les inscriptions fermees.
    $ferme = installer($depot, [], true, ['inscriptions' => ['ouvertes' => false]]);
    $c = new Client($ferme['url']);
    [, , $page] = $c->get('index.php');
    egal(false, str_contains($page, 'index.php?inscription'), 'pas de lien');
    egal(403, $c->get('index.php?inscription')[0]);
    [$statut, , $page] = $c->formulaire('index.php', ['action' => 'inscription', 'csrf' => jeton_de($page), 'email' => 'x@exemple.org', 'nom' => 'X', 'mot_de_passe' => MOT, 'confirmation' => MOT, 'langue' => 'fr']);
    egal(403, $statut);
    contient('Les inscriptions sont fermées', $page);
});

test('mot de passe oublie : un lien d une heure, a usage unique, qui ferme les autres sessions ; la meme reponse pour une adresse inconnue', function () use ($url, $data): void {
    [$fiche, $mot] = inscrire($url, $data, 'oublieuse@exemple.org', 'actif', 'Oublieuse');
    [$autreSession] = connecte($url, 'oublieuse@exemple.org', $mot);
    $c = new Client($url);
    [, , $page] = $c->get('index.php?oublie');
    contient('<h2 id="titre-oublie">Mot de passe oublié</h2>', $page);
    $n = count(mails_ecrits($data));
    [, , $page] = $c->formulaire('index.php', ['action' => 'oublie', 'csrf' => jeton_de($page), 'email' => 'inconnue@exemple.org']);
    contient('Si un compte porte cette adresse, un message vient de partir', $page);
    egal($n, count(mails_ecrits($data)), 'aucun mail pour une adresse inconnue');
    [, , $page] = $c->formulaire('index.php', ['action' => 'oublie', 'csrf' => jeton_de($c->get('index.php?oublie')[2]), 'email' => 'oublieuse@exemple.org']);
    contient('Si un compte porte cette adresse, un message vient de partir', $page);
    $mail = dernier_mail($data, 'oublieuse@exemple.org');
    egal('Réinitialiser votre mot de passe — Site d’essai', $mail['sujet'] ?? null);
    $jeton = jeton_du_mail($mail, 'reinitialiser');
    affirmer($jeton !== '', 'un lien');
    egal(410, $c->get('index.php?reinitialiser=' . strrev($jeton))[0], 'un faux jeton');
    [$statut, , $page] = $c->get('index.php?reinitialiser=' . $jeton);
    egal(200, $statut);
    contient('<h2 id="titre-reinitialisation">Nouveau mot de passe</h2>', $page);
    $csrf = jeton_de($page);
    [, , $page] = $c->formulaire('index.php', ['action' => 'reinitialiser', 'csrf' => $csrf, 'jeton' => $jeton, 'mot_de_passe' => 'le nouveau mot de passe', 'confirmation' => 'autre']);
    contient('Les deux saisies du mot de passe diffèrent', $page);
    [, , $page] = $c->formulaire('index.php', ['action' => 'reinitialiser', 'csrf' => $csrf, 'jeton' => $jeton, 'mot_de_passe' => 'court', 'confirmation' => 'court']);
    contient('au moins 10 caractères', $page);
    egal(200, $c->get('index.php?reinitialiser=' . $jeton)[0], 'un refus ne consomme pas le lien');
    [$statut, , $page] = $c->formulaire('index.php', ['action' => 'reinitialiser', 'csrf' => $csrf, 'jeton' => $jeton, 'mot_de_passe' => 'le nouveau mot de passe', 'confirmation' => 'le nouveau mot de passe']);
    egal(200, $statut);
    contient('Mot de passe enregistré : connectez-vous avec lui.', $page);
    egal(410, $c->get('index.php?reinitialiser=' . $jeton)[0], 'usage unique');
    egal(401, $autreSession->get('api.php?r=projets')[0], 'les autres sessions sont fermees');
    contient('Votre mot de passe a changé', $autreSession->get('index.php')[2]);
    contient('Adresse ou mot de passe incorrect.', $c->connecter('oublieuse@exemple.org', $mot)[2]);
    egal(303, $c->connecter('oublieuse@exemple.org', 'le nouveau mot de passe')[0]);
    // Un jeton expire (une heure) est refuse et supprime.
    [, , $page] = $c->formulaire('index.php', ['action' => 'oublie', 'csrf' => jeton_de((new Client($url))->get('index.php?oublie')[2]), 'email' => 'oublieuse@exemple.org']);
    $d = new Client($url);
    [, , $page] = $d->formulaire('index.php', ['action' => 'oublie', 'csrf' => jeton_de($d->get('index.php?oublie')[2]), 'email' => 'oublieuse@exemple.org']);
    $jeton = jeton_du_mail(dernier_mail($data, 'oublieuse@exemple.org'), 'reinitialiser');
    $f = $data . '/jetons/' . hash('sha256', $jeton) . '.json';
    egal(true, is_file($f), 'range hache');
    $j = json_decode((string) file_get_contents($f), true);
    affirmer($j['expire'] - $j['creeLe'] <= 3600, 'une heure');
    $j['expire'] = time() - 1;
    file_put_contents($f, json_encode($j));
    egal(410, $d->get('index.php?reinitialiser=' . $jeton)[0]);
    clearstatcache(true, $f);
    egal(false, is_file($f), 'supprime');
});

test('les demandes de mail sont limitees par client', function () use ($depot): void {
    $s = installer($depot, []);
    $c = new Client($s['url']);
    for ($i = 0; $i < 5; $i++) {
        [$statut] = $c->formulaire('index.php', ['action' => 'oublie', 'csrf' => jeton_de($c->get('index.php?oublie')[2]), 'email' => 'x' . $i . '@exemple.org']);
        egal(200, $statut, 'demande libre ' . $i);
    }
    egal(200, $c->connecter(ADMIN_EMAIL, 'faux')[0], 'la connexion a sa propre limite : trois essais libres, et celui-ci est le premier');
    [$statut, , $page] = $c->formulaire('index.php', ['action' => 'oublie', 'csrf' => jeton_de($c->get('index.php?oublie')[2]), 'email' => 'x@exemple.org']);
    egal(429, $statut);
    contient('Trop de demandes', $page);
    [$statut] = $c->formulaire('index.php', ['action' => 'inscription', 'csrf' => jeton_de($c->get('index.php?inscription')[2]), 'email' => 'y@exemple.org', 'nom' => 'Y', 'mot_de_passe' => MOT, 'confirmation' => MOT, 'langue' => 'fr']);
    egal(429, $statut, 'l inscription compte dans la meme limite');
    egal([], glob($s['data'] . '/comptes/*.json', GLOB_NOSORT) === false ? [] : array_filter(glob($s['data'] . '/comptes/*.json') ?: [], fn(string $f): bool => str_contains((string) file_get_contents($f), 'y@exemple.org')), 'rien n est cree');
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Le compte connecte : profil, mot de passe, langue
// ---------------------------------------------------------------------------------------------------------------------------------

test('le profil change le nom et la langue (les messages de l API suivent) ; le mot de passe exige l ancien et ferme les autres sessions', function () use ($url, $data): void {
    [$fiche, $mot] = inscrire($url, $data, 'profil@exemple.org', 'actif', 'Profil');
    [$c, $csrf] = connecte($url, 'profil@exemple.org', $mot);
    [$autre] = connecte($url, 'profil@exemple.org', $mot);
    [$statut, , $corps] = $c->ecrire('api.php?r=profil', ['nom' => " Nouveau \u{202E}nom ", 'langue' => 'en'], $csrf);
    egal(200, $statut, $corps);
    egal(['nom' => 'Nouveau nom', 'langue' => 'en'], ['nom' => json_de($corps)['compte']['nom'] ?? null, 'langue' => json_de($corps)['compte']['langue'] ?? null]);
    egal(400, $c->ecrire('api.php?r=profil', ['nom' => ''], $csrf)[0]);
    egal(400, $c->ecrire('api.php?r=profil', ['langue' => 'de'], $csrf)[0]);
    [$statut, , $corps] = $c->get('api.php?r=projet&id=0123456789abcdef');
    egal(404, $statut);
    egal('This project no longer exists on the server.', json_de($corps)['message'] ?? null, 'le message dans la langue du compte');
    contient('<html lang="en">', $c->get('index.php')[2]);
    // Le mot de passe.
    [$statut, , $corps] = $c->ecrire('api.php?r=mot-de-passe', ['ancien' => 'faux', 'nouveau' => 'un tout nouveau mot de passe'], $csrf);
    egal(400, $statut);
    egal('invalide', json_de($corps)['erreur'] ?? null);
    contient('old password', json_de($corps)['message'] ?? '');
    [$statut, , $corps] = $c->ecrire('api.php?r=mot-de-passe', ['ancien' => $mot, 'nouveau' => 'court'], $csrf);
    egal(400, $statut);
    contient('at least 10', json_de($corps)['message'] ?? '');
    egal(200, $autre->get('api.php?r=projets')[0], 'rien n a change');
    [$statut, , $corps] = $c->ecrire('api.php?r=mot-de-passe', ['ancien' => $mot, 'nouveau' => 'un tout nouveau mot de passe'], $csrf);
    egal(200, $statut, $corps);
    egal(200, $c->get('api.php?r=projets')[0], 'la session qui change le mot de passe reste ouverte');
    egal(401, $autre->get('api.php?r=projets')[0], 'les autres sessions sont fermees');
    egal(303, (new Client($url))->connecter('profil@exemple.org', 'un tout nouveau mot de passe')[0]);
});

test('la langue des pages d avant la connexion : le selecteur pose un cookie, la page et ses textes suivent', function () use ($url): void {
    $c = new Client($url);
    [$statut, $h] = $c->get('index.php?langue=en');
    egal(303, $statut);
    contient('svg_langue=en', $h['set-cookie'] ?? '');
    [, , $page] = $c->get('index.php');
    contient('<html lang="en">', $page);
    contient('>Sign in</button>', $page);
    contient('aria-current="true">English</a>', $page);
    contient('Forgotten password?', $page);
    [, , $page] = $c->get('index.php?inscription');
    contient('Create an account', $page);
    [$statut, , $page] = $c->formulaire('index.php', ['action' => 'connexion', 'csrf' => jeton_de($page), 'email' => ADMIN_EMAIL, 'mot_de_passe' => 'faux']);
    contient('Incorrect address or password.', $page);
    [, , $page] = $c->get('index.php?langue=xx');
    contient('<html lang="en">', $c->get('index.php')[2], 'une langue inconnue ne change rien');
    $c->get('index.php?langue=fr');
    contient('<html lang="fr">', $c->get('index.php')[2]);
});

// ---------------------------------------------------------------------------------------------------------------------------------
// L'administration
// ---------------------------------------------------------------------------------------------------------------------------------

test('l API d administration : le role est relu a chaque requete ; promouvoir, retrograder, dernier administrateur, soi-meme, adresse, renvoyer, creer', function () use ($url, $data): void {
    [$a, $csrf] = connecte($url);
    $moi = json_de($a->get('api.php?r=compte')[2])['compte']['id'];
    $fiche = creer_utilisateur($url, 'collegue@exemple.org', 'Collègue');
    egal(['actif', 'utilisateur', 0], [$fiche['etat'], $fiche['role'], $fiche['projets']]);
    affirmer(isset($fiche['creeLe'], $fiche['approuveLe']), 'une fiche complete');
    egal(409, $a->ecrire('api.php?r=compte-creer', ['email' => 'COLLEGUE@exemple.org', 'nom' => 'X', 'langue' => 'fr', 'motDePasse' => MOT], $csrf)[0], 'adresse prise');
    egal(400, $a->ecrire('api.php?r=compte-creer', ['email' => 'x@exemple.org', 'nom' => 'X', 'langue' => 'fr', 'motDePasse' => 'court'], $csrf)[0]);
    egal(303, (new Client($url))->connecter('collegue@exemple.org', 'le mot de passe de la personne')[0], 'un compte cree par l administrateur entre d emblee');
    // Soi-meme et le dernier administrateur.
    foreach (['suspendre', 'retrograder', 'supprimer'] as $action) {
        [$statut, , $corps] = $a->ecrire('api.php?r=compte-' . $action . '&id=' . $moi, new stdClass(), $csrf);
        egal(409, $statut, $action);
        egal('soi-meme', json_de($corps)['erreur'] ?? null, $action);
    }
    // Promouvoir le collegue, puis le second administrateur peut retrograder le premier… mais pas le dernier.
    [$statut, , $corps] = $a->ecrire('api.php?r=compte-promouvoir&id=' . $fiche['id'], new stdClass(), $csrf);
    egal(200, $statut, $corps);
    egal('admin', json_de($corps)['compte']['role'] ?? null);
    egal(409, $a->ecrire('api.php?r=compte-promouvoir&id=' . $fiche['id'], new stdClass(), $csrf)[0], 'deja administrateur');
    [$b, $csrfB] = connecte($url, 'collegue@exemple.org', 'le mot de passe de la personne');
    egal(200, $b->get('api.php?r=comptes')[0], 'le role est relu dans le fichier : le collegue administre sans se reconnecter');
    [$statut, , $corps] = $b->ecrire('api.php?r=compte-retrograder&id=' . $moi, new stdClass(), $csrfB);
    egal(200, $statut, $corps);
    egal('utilisateur', json_de($corps)['compte']['role'] ?? null);
    egal(403, $a->get('api.php?r=comptes')[0], 'retrograde, l ancien administrateur perd l API admin tout de suite');
    [$statut, , $corps] = $b->ecrire('api.php?r=compte-retrograder&id=' . $fiche['id'], new stdClass(), $csrfB);
    egal(409, $statut);
    egal('soi-meme', json_de($corps)['erreur'] ?? null);
    // Le premier redevient administrateur ; le collegue, retrograde, ne peut plus rien.
    [$statut] = $b->ecrire('api.php?r=compte-promouvoir&id=' . $moi, new stdClass(), $csrfB);
    egal(200, $statut);
    egal(200, $a->ecrire('api.php?r=compte-retrograder&id=' . $fiche['id'], new stdClass(), $csrf)[0]);
    egal(403, $b->ecrire('api.php?r=compte-retrograder&id=' . $moi, new stdClass(), $csrfB)[0]);
    egal(409, $a->ecrire('api.php?r=compte-retrograder&id=' . $fiche['id'], new stdClass(), $csrf)[0], 'pas administrateur');
    // Le dernier administrateur ne se suspend ni ne se supprime, meme par un autre administrateur… il n'y en a qu'un : soi-meme.
    // Avec deux administrateurs dont un suspendu, le dernier actif est protege.
    egal(200, $a->ecrire('api.php?r=compte-promouvoir&id=' . $fiche['id'], new stdClass(), $csrf)[0]);
    egal(200, $a->ecrire('api.php?r=compte-suspendre&id=' . $fiche['id'], new stdClass(), $csrf)[0]);
    [$statut, , $corps] = $b->get('api.php?r=comptes');
    egal(401, $statut, 'suspendu : plus de session');
    [$b, $csrfB] = [null, null];
    egal(200, $a->ecrire('api.php?r=compte-reactiver&id=' . $fiche['id'], new stdClass(), $csrf)[0]);
    [$b, $csrfB] = connecte($url, 'collegue@exemple.org', 'le mot de passe de la personne');
    egal(200, $b->ecrire('api.php?r=compte-suspendre&id=' . $moi, new stdClass(), $csrfB)[0], 'deux administrateurs : l un suspend l autre');
    [$statut, , $corps] = $b->ecrire('api.php?r=compte-suspendre&id=' . $fiche['id'], new stdClass(), $csrfB);
    egal('soi-meme', json_de($corps)['erreur'] ?? null);
    [$a2, $csrfA2] = [null, null];
    egal(200, $b->ecrire('api.php?r=compte-reactiver&id=' . $moi, new stdClass(), $csrfB)[0]);
    [$a, $csrf] = connecte($url);
    egal(200, $a->ecrire('api.php?r=compte-retrograder&id=' . $fiche['id'], new stdClass(), $csrf)[0]);
    // L'adresse.
    egal(400, $a->ecrire('api.php?r=compte-email&id=' . $fiche['id'], ['email' => 'pas une adresse'], $csrf)[0]);
    [$statut, , $corps] = $a->ecrire('api.php?r=compte-email&id=' . $fiche['id'], ['email' => ADMIN_EMAIL], $csrf);
    egal(409, $statut);
    egal('existe', json_de($corps)['erreur'] ?? null);
    [$statut, , $corps] = $a->ecrire('api.php?r=compte-email&id=' . $fiche['id'], ['email' => 'nouvelle@exemple.org'], $csrf);
    egal(200, $statut, $corps);
    egal('nouvelle@exemple.org', json_de($corps)['compte']['email'] ?? null);
    egal(303, (new Client($url))->connecter('nouvelle@exemple.org', 'le mot de passe de la personne')[0]);
    // Renvoyer le mail a un compte non confirme ; pas a un autre.
    [$nonConfirmee] = inscrire($url, $data, 'lente@exemple.org', 'a-confirmer', 'Lente');
    $n = count(mails_ecrits($data));
    egal(200, $a->ecrire('api.php?r=compte-renvoyer&id=' . $nonConfirmee['id'], new stdClass(), $csrf)[0]);
    egal($n + 1, count(mails_ecrits($data)));
    egal(409, $a->ecrire('api.php?r=compte-renvoyer&id=' . $fiche['id'], new stdClass(), $csrf)[0]);
    egal(404, $a->ecrire('api.php?r=compte-approuver&id=ffffffffffffffff', new stdClass(), $csrf)[0]);
    egal(400, $a->ecrire('api.php?r=compte-approuver&id=../x', new stdClass(), $csrf)[0]);
    egal(405, $a->get('api.php?r=compte-approuver&id=' . $fiche['id'])[0]);
    egal(403, $a->ecrire('api.php?r=compte-approuver&id=' . $fiche['id'], new stdClass(), null)[0], 'CSRF');
    $journal = (string) file_get_contents($data . '/journal/comptes.log');
    contient('promu id=' . $fiche['id'], $journal);
    egal(false, str_contains($journal, 'mot de passe de la personne'));
});

test('les reglages du site : lus sans le mot de passe SMTP, ecrits valides (un champ refuse est nomme), le mot de passe vide garde l ancien ; le mail d essai', function () use ($url, $data): void {
    [$a, $csrf] = connecte($url);
    [$statut, , $corps] = $a->get('api.php?r=reglages');
    egal(200, $statut);
    $r = json_de($corps);
    egal('fichier', $r['reglages']['courrier']['mode'] ?? null);
    egal(false, isset($r['reglages']['courrier']['smtp']['motDePasse']));
    egal(false, $r['smtpMotDePassePose']);
    egal(true, $r['fichier']);
    egal([], $r['problemes']);
    $reglages = $r['reglages'];
    $reglages['site']['langue'] = 'de';
    [$statut, , $corps] = $a->ecrire('api.php?r=reglages', ['reglages' => $reglages], $csrf);
    egal(400, $statut);
    contient('site.langue', json_de($corps)['message'] ?? '');
    $reglages['site']['langue'] = 'fr';
    $reglages['site']['nom'] = 'Atelier renommé';
    $reglages['courrier']['smtp'] = ['hote' => 'smtp.exemple.org', 'port' => 465, 'securite' => 'ssl', 'utilisateur' => 'robot', 'motDePasse' => 'le secret smtp'];
    [$statut, , $corps] = $a->ecrire('api.php?r=reglages', ['reglages' => $reglages], $csrf);
    egal(200, $statut, $corps);
    $r = json_de($corps);
    egal('Atelier renommé', $r['reglages']['site']['nom'] ?? null);
    egal(true, $r['smtpMotDePassePose']);
    egal(false, isset($r['reglages']['courrier']['smtp']['motDePasse']));
    egal('le secret smtp', json_decode((string) file_get_contents($data . '/config/config.json'), true)['courrier']['smtp']['motDePasse'] ?? null);
    $reglages['courrier']['smtp']['motDePasse'] = '';
    $reglages['courrier']['smtp']['port'] = 587;
    egal(200, $a->ecrire('api.php?r=reglages', ['reglages' => $reglages], $csrf)[0]);
    egal('le secret smtp', json_decode((string) file_get_contents($data . '/config/config.json'), true)['courrier']['smtp']['motDePasse'] ?? null, 'vide : inchange');
    contient('<h1>Atelier renommé</h1>', (new Client($url))->get('index.php')[2]);
    egal(403, $a->ecrire('api.php?r=reglages', ['reglages' => $reglages], 'faux')[0]);
    // Le mail d'essai : en mode fichier, il s'ecrit ; en SMTP vers un serveur absent, l'erreur est nommee.
    [$statut, , $corps] = $a->ecrire('api.php?r=courrier-essai', new stdClass(), $csrf);
    egal(200, $statut, $corps);
    egal('Message d’essai — Atelier renommé', dernier_mail($data, ADMIN_EMAIL)['sujet'] ?? null);
    egal(200, $a->ecrire('api.php?r=courrier-essai', ['destinataire' => 'ailleurs@exemple.org'], $csrf)[0]);
    egal('Message d’essai — Atelier renommé', dernier_mail($data, 'ailleurs@exemple.org')['sujet'] ?? null);
    egal(400, $a->ecrire('api.php?r=courrier-essai', ['destinataire' => 'pas une adresse'], $csrf)[0]);
    $reglages['courrier']['mode'] = 'smtp';
    $reglages['courrier']['smtp']['hote'] = '127.0.0.1';
    $reglages['courrier']['smtp']['port'] = 9;
    $reglages['courrier']['smtp']['securite'] = 'aucune';
    egal(200, $a->ecrire('api.php?r=reglages', ['reglages' => $reglages], $csrf)[0]);
    [$statut, , $corps] = $a->ecrire('api.php?r=courrier-essai', new stdClass(), $csrf);
    egal(502, $statut);
    egal('courrier', json_de($corps)['erreur'] ?? null);
    contient('SMTP', json_de($corps)['message'] ?? '');
    egal(false, str_contains((string) file_get_contents($data . '/journal/erreurs.log'), 'le secret smtp'), 'le mot de passe SMTP n entre dans aucun journal');
    // Retour au mode fichier et au nom d'avant, pour la suite.
    $reglages['courrier']['mode'] = 'fichier';
    $reglages['site']['nom'] = 'Site d’essai';
    egal(200, $a->ecrire('api.php?r=reglages', ['reglages' => $reglages], $csrf)[0]);
    // Un utilisateur ordinaire ne lit ni n'ecrit les reglages.
    [$u, $csrfU] = connecte($url, 'nouvelle@exemple.org', 'le mot de passe de la personne');
    egal(403, $u->get('api.php?r=reglages')[0]);
    egal(403, $u->ecrire('api.php?r=reglages', ['reglages' => $reglages], $csrfU)[0]);
    egal(403, $u->ecrire('api.php?r=courrier-essai', new stdClass(), $csrfU)[0]);
});

test('une configuration illisible vaut les defauts, le site marche, et l API le dit', function () use ($depot): void {
    $s = installer($depot, []);
    file_put_contents($s['data'] . '/config/config.json', '{pas du json');
    [$statut, , $page] = (new Client($s['url']))->get('index.php');
    egal(200, $statut);
    contient('<h1>Éditeur SVG</h1>', $page, 'le nom par defaut');
    [$a] = connecte($s['url']);
    $r = json_de($a->get('api.php?r=reglages')[2]);
    egal(['fichier'], $r['problemes'] ?? null);
    egal(false, $r['fichier']);
    egal('mail', $r['reglages']['courrier']['mode'] ?? null);
    file_put_contents($s['data'] . '/config/config.json', json_encode(['format' => 'editeur-svg/config', 'version' => 1, 'site' => ['nom' => 'Partiel', 'langue' => 'xx']]));
    $r = json_de($a->get('api.php?r=reglages')[2]);
    egal('Partiel', $r['reglages']['site']['nom'] ?? null);
    egal(['site.langue'], $r['problemes'] ?? null, 'le champ refuse est nomme, les autres valent leur defaut');
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Les projets, bornes au compte ; l'API comme avant
// ---------------------------------------------------------------------------------------------------------------------------------

test('toute route de l API exige la session', function () use ($url): void {
    $c = new Client($url);
    foreach (['compte', 'comptes', 'reglages', 'projets', 'projet&id=0123456789abcdef', 'json&f=bibliotheque', 'fonte&f=inter.ttf', 'police&sha=' . urlencode(str_repeat('A', 43) . '='), 'vignette&id=0123456789abcdef', 'inconnue'] as $r) {
        [$statut, , $corps] = $c->get('api.php?r=' . $r);
        egal(401, $statut, $r);
        egal('session', json_de($corps)['erreur'] ?? null, $r);
    }
    [$statut] = $c->ecrire('api.php?r=enregistrer', ['projet' => projet_json()], 'x');
    egal(401, $statut);
    egal(401, $c->ecrire('api.php?r=compte-approuver&id=0123456789abcdef', new stdClass(), 'x')[0]);
});

test('une ecriture exige POST, du JSON, le jeton CSRF de la session, et pas un autre site', function () use ($url): void {
    [$c, $csrf] = connecte($url);
    egal(403, $c->ecrire('api.php?r=enregistrer', ['projet' => projet_json()], null)[0], 'sans jeton');
    egal(403, $c->ecrire('api.php?r=enregistrer', ['projet' => projet_json()], str_repeat('a', 64))[0], 'mauvais jeton');
    egal(403, $c->ecrire('api.php?r=enregistrer', ['projet' => projet_json()], $csrf, ['Sec-Fetch-Site: cross-site'])[0], 'autre site');
    egal(405, $c->get('api.php?r=enregistrer', ['X-CSRF: ' . $csrf])[0], 'GET');
    egal(415, $c->requete('POST', 'api.php?r=enregistrer', ['X-CSRF: ' . $csrf, 'Content-Type: text/plain'], '{}')[0], 'pas du JSON');
    egal(200, $c->ecrire('api.php?r=enregistrer', ['projet' => projet_json()], $csrf)[0], 'tout y est');
});

test('le jeton CSRF de la session se relit apres une reconnexion, et seulement sous session', function () use ($url): void {
    [$c, $csrf] = connecte($url);
    [$statut, $h, $corps] = $c->get('api.php?r=jeton');
    egal(200, $statut);
    egal($csrf, json_de($corps)['csrf'] ?? null);
    egal(false, isset($h['access-control-allow-origin']), 'aucune autorisation CORS');
    egal(401, (new Client($url))->get('api.php?r=jeton')[0]);
});

test('creer, lister, ouvrir (ETag), ecraser avec la revision ; un autre onglet est refuse', function () use ($url): void {
    [$c, $csrf] = connecte($url);
    [$statut, , $corps] = $c->ecrire('api.php?r=enregistrer', ['projet' => projet_json('Ma carte'), 'vignette' => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0Z"/></svg>'], $csrf);
    egal(200, $statut, $corps);
    $m = json_de($corps)['meta'];
    egal(1, $m['revision']);
    [, , $liste] = $c->get('api.php?r=projets');
    affirmer(in_array($m['id'], array_column(json_de($liste)['projets'], 'id'), true), 'liste');
    [$statut, $h, $projet] = $c->get('api.php?r=projet&id=' . $m['id']);
    egal(200, $statut);
    egal('"1"', $h['etag'] ?? '');
    egal('no-store', $h['cache-control'] ?? '');
    $p = json_decode($projet, true);
    egal('Ma carte', $p['nom']);
    egal($m['creeLe'], $p['creeLe']);
    [$statut, $h, $svg] = $c->get('api.php?r=vignette&id=' . $m['id']);
    egal(200, $statut);
    egal('image/svg+xml', $h['content-type'] ?? '');
    contient('sandbox', $h['content-security-policy'] ?? '');
    contient('<path', $svg);
    [$statut, , $corps] = $c->ecrire('api.php?r=enregistrer&id=' . $m['id'], ['projet' => projet_json('Onglet A')], $csrf, ['If-Match: "1"']);
    egal(200, $statut, $corps);
    egal(2, json_de($corps)['meta']['revision']);
    [$statut, , $corps] = $c->ecrire('api.php?r=enregistrer&id=' . $m['id'], ['projet' => projet_json('Onglet B')], $csrf, ['If-Match: "1"']);
    egal(409, $statut);
    egal('conflit', json_de($corps)['erreur']);
    egal(2, json_de($corps)['meta']['revision']);
    egal(428, $c->ecrire('api.php?r=enregistrer&id=' . $m['id'], ['projet' => projet_json()], $csrf)[0], 'sans revision');
    egal('Onglet A', json_decode($c->get('api.php?r=projet&id=' . $m['id'])[2], true)['nom']);
    [$statut, , $corps] = $c->ecrire('api.php?r=enregistrer&id=' . $m['id'], ['projet' => projet_json('Onglet C')], $csrf, ['If-Match: W/"2"']);
    egal(200, $statut, $corps);
    egal(3, json_de($corps)['meta']['revision']);
});

test('les projets sont bornes au compte : ceux d un autre sont introuvables, et chacun a son dossier et sa corbeille', function () use ($url, $data): void {
    [$a, $csrfA] = connecte($url);
    $idA = json_de($a->get('api.php?r=compte')[2])['compte']['id'];
    $m = json_de($a->ecrire('api.php?r=enregistrer', ['projet' => projet_json('Secret de A')], $csrfA)[2])['meta'];
    egal(true, is_file($data . '/projets/' . $idA . '/' . $m['id'] . '.json'));
    [$b, $csrfB] = connecte($url, 'nouvelle@exemple.org', 'le mot de passe de la personne');
    egal([], json_de($b->get('api.php?r=projets')[2])['projets'] ?? null, 'B ne voit rien');
    egal(404, $b->get('api.php?r=projet&id=' . $m['id'])[0], 'introuvable, pas interdit');
    egal(404, $b->get('api.php?r=vignette&id=' . $m['id'])[0]);
    egal(404, $b->ecrire('api.php?r=renommer&id=' . $m['id'], ['nom' => 'Pirate'], $csrfB)[0]);
    egal(404, $b->ecrire('api.php?r=dupliquer&id=' . $m['id'], new stdClass(), $csrfB)[0]);
    egal(404, $b->ecrire('api.php?r=supprimer&id=' . $m['id'], new stdClass(), $csrfB)[0]);
    egal(404, $b->ecrire('api.php?r=enregistrer&id=' . $m['id'], ['projet' => projet_json('Pirate')], $csrfB, ['If-Match: "1"'])[0]);
    egal('Secret de A', json_decode($a->get('api.php?r=projet&id=' . $m['id'])[2], true)['nom'], 'rien n a bouge');
    $mB = json_de($b->ecrire('api.php?r=enregistrer', ['projet' => projet_json('Projet de B')], $csrfB)[2])['meta'];
    egal(200, $b->ecrire('api.php?r=supprimer&id=' . $mB['id'], new stdClass(), $csrfB)[0]);
    $idB = json_de($b->get('api.php?r=compte')[2])['compte']['id'];
    egal(1, count(glob($data . '/projets/' . $idB . '/corbeille/*-' . $mB['id'] . '.json') ?: []), 'la corbeille de B');
    // L'administrateur voit le nombre de projets, pas les projets.
    $comptes = json_de($a->get('api.php?r=comptes')[2])['comptes'];
    $fiches = array_column($comptes, 'projets', 'id');
    affirmer($fiches[$idA] >= 1 && $fiches[$idB] === 0, 'le nombre de projets : ' . json_encode($fiches));
});

test('supprimer un compte emporte ses projets dans corbeille-comptes, ferme sa session ; il ne se connecte plus', function () use ($url, $data): void {
    $fiche = creer_utilisateur($url, 'ephemere@exemple.org', 'Éphémère');
    [$u, $csrfU] = connecte($url, 'ephemere@exemple.org', 'le mot de passe de la personne');
    $m = json_de($u->ecrire('api.php?r=enregistrer', ['projet' => projet_json('Le projet')], $csrfU)[2])['meta'];
    [$a, $csrf] = connecte($url);
    [$statut, , $corps] = $a->ecrire('api.php?r=compte-supprimer&id=' . $fiche['id'], new stdClass(), $csrf);
    egal(200, $statut, $corps);
    egal(['ok' => true], json_de($corps));
    egal(401, $u->get('api.php?r=projets')[0]);
    contient('Adresse ou mot de passe incorrect.', $u->connecter('ephemere@exemple.org', 'le mot de passe de la personne')[2]);
    $corbeilles = glob($data . '/projets/corbeille-comptes/*-' . $fiche['id']) ?: [];
    egal(1, count($corbeilles));
    egal(true, is_file($corbeilles[0] . '/' . $m['id'] . '.json') && is_file($corbeilles[0] . '/compte.json'));
    egal(false, is_dir($data . '/projets/' . $fiche['id']));
    egal(false, is_file($data . '/comptes/' . $fiche['id'] . '.json'));
    egal(404, $a->ecrire('api.php?r=compte-supprimer&id=' . $fiche['id'], new stdClass(), $csrf)[0]);
});

test('renommer, dupliquer, supprimer par l API', function () use ($url): void {
    [$c, $csrf] = connecte($url);
    $m = json_de($c->ecrire('api.php?r=enregistrer', ['projet' => projet_json('A renommer')], $csrf)[2])['meta'];
    [$statut, , $corps] = $c->ecrire('api.php?r=renommer&id=' . $m['id'], ['nom' => "../Nouveau\u{0007}"], $csrf);
    egal(200, $statut);
    egal('-Nouveau', json_de($corps)['meta']['nom']);
    [$statut, , $corps] = $c->ecrire('api.php?r=dupliquer&id=' . $m['id'], new stdClass(), $csrf);
    egal(200, $statut);
    $copie = json_de($corps)['meta'];
    egal('-Nouveau (copie)', $copie['nom']);
    egal(200, $c->ecrire('api.php?r=supprimer&id=' . $m['id'], new stdClass(), $csrf)[0]);
    egal(404, $c->get('api.php?r=projet&id=' . $m['id'])[0]);
    egal(404, $c->ecrire('api.php?r=supprimer&id=' . $m['id'], new stdClass(), $csrf)[0]);
    egal(200, $c->get('api.php?r=projet&id=' . $copie['id'])[0]);
});

test('des chemins hostiles ne sortent jamais de data/', function () use ($url): void {
    [$c, $csrf] = connecte($url);
    foreach (['../pwd', '..%2Fpwd', '0123456789abcdef%00', '0123456789ABCDEF', '0123456789abcdef/../../pwd'] as $id) {
        egal(400, $c->get('api.php?r=projet&id=' . $id)[0], 'projet ' . $id);
        egal(400, $c->ecrire('api.php?r=supprimer&id=' . $id, new stdClass(), $csrf)[0], 'supprimer ' . $id);
    }
    foreach (['../pwd', '../../data/pwd', 'polices-catalogue.json', 'POLICES', 'a/b'] as $f) {
        egal(404, $c->get('api.php?r=json&f=' . urlencode($f))[0], 'json ' . $f);
    }
    foreach (['../pwd', 'inter.ttf/../../pwd', 'x.php', 'catalogue'] as $f) {
        egal(404, $c->get('api.php?r=fonte&f=' . urlencode($f))[0], 'fonte ' . $f);
    }
    egal(400, $c->get('api.php?r=police&sha=' . urlencode('../../pwd'))[0]);
});

test('un JSON invalide, qui n est pas un projet, ou trop gros est refuse sans rien ecrire', function () use ($url): void {
    [$c, $csrf] = connecte($url);
    $avant = json_de($c->get('api.php?r=projets')[2])['projets'];
    egal(400, $c->ecrire('api.php?r=enregistrer', '{"projet": ', $csrf)[0], 'JSON tronque');
    egal(400, $c->ecrire('api.php?r=enregistrer', '[1,2,3]', $csrf)[0], 'pas un objet');
    egal(400, $c->ecrire('api.php?r=enregistrer', ['projet' => ['format' => 'autre']], $csrf)[0], 'pas un projet');
    egal(400, $c->ecrire('api.php?r=enregistrer', str_repeat('[', 1000) . str_repeat(']', 1000), $csrf)[0], 'trop profond');
    $geant = projet_json();
    $geant['dessin']['formes'][0]['d'] = 'M0 0' . str_repeat('L1 1', 100000);
    egal(413, $c->ecrire('api.php?r=enregistrer', ['projet' => $geant], $csrf)[0], 'trop gros');
    egal($avant, json_de($c->get('api.php?r=projets')[2])['projets'], 'rien n a ete ecrit');
});

test('une police du catalogue : servie par le site apres verification, une empreinte fausse refusee, hors index refusee', function () use ($url, $data, $shaJuste, $shaAttendu700, $juste, $source): void {
    [$c] = connecte($url);
    [$statut, $h, $octets] = $c->get('api.php?r=police&sha=' . urlencode($shaJuste));
    egal(200, $statut);
    egal($juste, $octets);
    egal('font/woff', $h['content-type'] ?? '');
    egal(1, count(glob($data . '/font/catalogue/*.fonte') ?: []), 'rangee dans data/font');
    effacer($source . '/npm');
    effacer($source . '/bunny');
    egal(200, $c->get('api.php?r=police&sha=' . urlencode($shaJuste))[0]);
    [$statut, , $corps] = $c->get('api.php?r=police&sha=' . urlencode($shaAttendu700));
    egal(502, $statut, 'les deux sources servent un autre fichier');
    egal('source', json_de($corps)['erreur'] ?? null);
    [$statut, , $corps] = $c->get('api.php?r=police&sha=' . urlencode(base64_encode(hash('sha256', 'nulle part', true))));
    egal(404, $statut);
    egal('hors_index', json_de($corps)['erreur'] ?? null);
    egal(1, count(glob($data . '/font/catalogue/*.fonte') ?: []), 'rien d autre n est range');
});

test('les donnees JSON se servent avec leur ETag (304 ensuite)', function () use ($url): void {
    [$c] = connecte($url);
    [$statut, $h, $corps] = $c->get('api.php?r=json&f=bibliotheque');
    egal(200, $statut);
    egal('{"entrees":[]}', $corps);
    egal(304, $c->get('api.php?r=json&f=bibliotheque', ['If-None-Match: ' . ($h['etag'] ?? '')])[0]);
});

test('le dictionnaire de l interface se sert en script d amorce (type, ETag, 304), pour une langue traduite et livree seulement ; la page l amorce en anglais', function () use ($url, $data): void {
    [$c] = connecte($url);
    [$statut, , $corps] = $c->get('api.php?r=langue&l=en');
    egal(404, $statut, 'le build ne l a pas encore livre');
    egal('introuvable', json_de($corps)['erreur'] ?? null);
    file_put_contents($data . '/json/langue-en.json', '{"Annuler":"Cancel","a</b":"x"}' . "\n");
    [$statut, $h, $corps] = $c->get('api.php?r=langue&l=en');
    egal(200, $statut);
    egal('text/javascript; charset=utf-8', $h['content-type'] ?? '');
    egal('private, max-age=3600', $h['cache-control'] ?? '');
    egal('nosniff', $h['x-content-type-options'] ?? '');
    egal('window.__langueSvgLangue="en";window.__langueSvg_en={"Annuler":"Cancel","a<\/b":"x"};', $corps, 'la langue, puis la table, sans fin de balise possible');
    egal(304, $c->get('api.php?r=langue&l=en', ['If-None-Match: ' . ($h['etag'] ?? '')])[0]);
    foreach (['fr', 'de', 'EN', '../pwd', ''] as $l) {
        [$statut, , $corps] = $c->get('api.php?r=langue&l=' . urlencode($l));
        egal(400, $statut, 'langue ' . $l);
        egal('invalide', json_de($corps)['erreur'] ?? null, 'langue ' . $l);
    }
    egal(401, (new Client($url))->get('api.php?r=langue&l=en')[0], 'sous session comme les autres');
    // La page de l'application : rien en francais ; en anglais, l'amorce AVANT site.js.
    [, , $app] = $c->get('index.php');
    egal(false, str_contains($app, 'r=langue'), 'un compte en francais ne charge aucun dictionnaire');
    creer_utilisateur($url, 'anglophone@exemple.org', 'Anglophone', 'le mot de passe de la personne', 'en');
    [$e] = connecte($url, 'anglophone@exemple.org', 'le mot de passe de la personne');
    [, , $app] = $e->get('index.php');
    contient('<html lang="en">', $app);
    $amorce = strpos($app, '<script src="api.php?r=langue&l=en"></script>');
    egal(true, $amorce !== false, 'l amorce est dans la page');
    egal(true, $amorce < strpos($app, '<script src="assets/site.js" defer></script>'), 'avant le script de l application');
    unlink($data . '/json/langue-en.json');
});

// ---------------------------------------------------------------------------------------------------------------------------------
// La disposition livree
// ---------------------------------------------------------------------------------------------------------------------------------

test('la disposition livree : data/ dans public/, l administrateur cree dans la page, data/ (code, reglages, comptes) ne se lit pas par HTTP', function () use ($depot): void {
    $s = installer_livre($depot);
    $c = new Client($s['url']);
    [, , $page] = $c->get('index.php');
    contient('Créer le compte administrateur', $page);
    [$statut] = $c->formulaire('index.php', ['action' => 'installer', 'csrf' => jeton_de($page), 'email' => ADMIN_EMAIL, 'nom' => 'Admin', 'mot_de_passe' => MOT, 'confirmation' => MOT, 'langue' => 'fr', 'site_nom' => '', 'expediteur' => '']);
    egal(303, $statut);
    egal(true, is_file($s['data'] . '/config/config.json'), 'config.json dans public/data/config');
    egal(1, count(glob($s['data'] . '/comptes/*.json') ?: []));
    [, , $app] = $c->get('index.php');
    contient('<div id="site"', $app);
    egal(false, str_contains($app, 'site-avertissement'), 'la verification HTTP de data/ passe : aucun avertissement');
    $vu = json_decode((string) file_get_contents($s['data'] . '/journal/verification-http.json'), true);
    egal(false, $vu['lisible'] ?? null, 'le site s est demande data/config/config.json, et le serveur a refuse');
    $compte = basename((glob($s['data'] . '/comptes/*.json') ?: [''])[0]);
    foreach (['data/config/config.json', 'data/config/config.local.php', 'data/comptes/' . $compte, 'data/comptes/', 'data/sessions/', 'data/.htaccess', 'data/secret', 'data/journal/connexions.log', 'DATA/config/config.json', 'assets/../data/config/config.json', 'data%2Fconfig%2Fconfig.json', 'data/inc/amorce.php', 'data/inc/compte.php', 'data/inc/serveur-local.php', 'data/inc/entree-api.php'] as $f) {
        [$statut, , $corps] = (new Client($s['url']))->get($f);
        affirmer(in_array($statut, [403, 404], true), $f . ' : ' . $statut);
        egal(false, str_contains($corps, 'editeur-svg/') || str_contains($corps, '$argon2') || str_contains($corps, '$2y$') || str_contains($corps, '<?php'), $f . ' ne dit rien');
    }
});

test('sans .htaccess applique, la disposition livree avertit que data/ se lit par HTTP', function () use ($depot): void {
    $s = installer_livre($depot, false);
    ecrire_config($s['data']);
    creer_admin($s['data']);
    [$c] = connecte($s['url']);
    [, , $app] = $c->get('index.php');
    contient('le dossier des données est lisible depuis le Web', $app);
    contient('se lit par HTTP', (string) file_get_contents($s['data'] . '/journal/erreurs.log'));
});

test('les fichiers de data/inc demandes directement, hors de php -S et sans routeur, ne disent rien', function () use ($depot): void {
    $s = installer_livre($depot, false);
    $c = new Client($s['url']);
    foreach (['data/inc/amorce.php', 'data/inc/comptes.php', 'data/inc/session.php', 'data/inc/compte.php', 'data/inc/serveur-local.php', 'data/inc/config.php', 'data/inc/entree-index.php'] as $f) {
        [$statut, , $corps] = $c->get($f);
        affirmer($corps === '', $f . ' a repondu : ' . mb_substr($corps, 0, 80));
        affirmer($statut === 404 || $statut === 200, $f . ' : ' . $statut);
    }
});

exit(lancer_tests('Le site par HTTP') > 0 ? 1 : 0);
