<?php
// Le site par HTTP, comme un navigateur le voit (ADR-0030) : `php -S` sur une copie de outils/site-php, un dossier de donnees
// temporaire, et une source de polices simulee par un second `php -S` (jamais le vrai reseau). Connexion (bon et mauvais mot de
// passe, CSRF, limitation, expiration), premier mot de passe choisi dans la page, data/password par FTP, disposition livree (data/
// dans public/, sous le routeur qui imite les .htaccess), en-tetes, toute route sous session, ecritures sous jeton, chemins
// hostiles, JSON geant ou invalide, controle de version, polices hors index et empreinte fausse.

declare(strict_types=1);

require __DIR__ . '/outils.php';

const MOT = 'un mot de passe assez long';
$depot = dirname(__DIR__, 2);

/** Une copie du site, data/ a cote de public/ (avec un config.local.php), data/ vide ; et ses reglages. */
function installer(string $depot, array $reglages, bool $avecMotDePasse = true): array
{
    $t = dossier_temporaire('site-http');
    register_shutdown_function(fn() => effacer($t));
    copier($depot . '/outils/site-php/public', $t . '/public');
    mkdir($t . '/data/json', 0700, true);
    $lignes = ["<?php"];
    foreach ($reglages as $nom => $valeur) {
        $lignes[] = 'define(' . var_export($nom, true) . ', ' . var_export($valeur, true) . ');';
    }
    file_put_contents($t . '/public/config.local.php', implode("\n", $lignes) . "\n");
    if ($avecMotDePasse) {
        $p = proc_open([PHP_BINARY, $t . '/public/inc/mot-de-passe.php', '--stdin'], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $tubes);
        fwrite($tubes[0], MOT . "\n");
        fclose($tubes[0]);
        $sortie = stream_get_contents($tubes[1]) . stream_get_contents($tubes[2]);
        $code = proc_close($p);
        if ($code !== 0) {
            throw new RuntimeException('mot-de-passe.php : ' . $sortie);
        }
    }
    return ['racine' => $t, 'url' => serveur_php($t . '/public')];
}

/**
 * La disposition livree, telle qu'on l'envoie par FTP : public/ seul, data/ dedans (avec son .htaccess), aucun config.local.php,
 * aucun mot de passe. `php -S` n'applique pas les .htaccess : avec `$routeur`, inc/serveur-local.php refuse data/ a leur place ;
 * sans, data/ se sert comme un fichier ordinaire (un .htaccess ignore). Rend la racine web, data/ et l'adresse.
 */
function installer_livre(string $depot, bool $routeur = true): array
{
    $t = dossier_temporaire('site-livre');
    register_shutdown_function(fn() => effacer($t));
    copier($depot . '/outils/site-php/public', $t . '/public');
    mkdir($t . '/public/data/json', 0700, true);
    copy($depot . '/outils/site-php/data/.htaccess', $t . '/public/data/.htaccess');
    $public = $t . '/public';
    return ['public' => $public, 'data' => $public . '/data', 'url' => serveur_php($public, $routeur ? $public . '/inc/serveur-local.php' : null, 4)];
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
]);
file_put_contents($site['racine'] . '/data/json/polices-catalogue.json', json_encode(['format' => 1, 'instantane' => '2026-10-25', 'familles' => [[
    'id' => 'essai', 'nom' => 'Essai', 'depot' => 'fontsource', 'source' => 'google', 'categorie' => 'lineale', 'licence' => 'OFL-1.1', 'version' => '5.3.0', 'ecritures' => ['latin'],
    'variantes' => [[400, 0, $shaJuste, null], [700, 0, $shaAttendu700, null]],
]], 'anciennes' => []]));
file_put_contents($site['racine'] . '/data/json/bibliotheque.json', '{"entrees":[]}');
$url = $site['url'];

function projet_json(string $nom = 'Carte'): array
{
    return [
        'format' => 'editeur-svg/projet', 'version' => 1, 'nom' => $nom,
        'dessin' => ['vb' => [0, 0, 100, 80], 'formes' => [['id' => 'f1', 'd' => 'M10 10L90 10L50 70Z', 'remplissage' => '#c81e28', 'contour' => null, 'epaisseur' => 1, 'opacite' => 1, 'regle' => 'nonzero', 'visible' => true, 'verrouille' => false]]],
        'production' => ['contexte' => 'generique'], 'nuancier' => [], 'ressources' => ['polices' => [], 'images' => []],
    ];
}

/** Un client connecte, et son jeton CSRF. */
function connecte(string $url): array
{
    $c = new Client($url);
    [$statut] = $c->connecter(MOT);
    egal(303, $statut, 'connexion');
    return [$c, $c->jeton()];
}

test('la page de connexion : en-tetes de securite, cookie HttpOnly et SameSite=Strict, aucun message d erreur PHP', function () use ($url): void {
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
    contient('<label class="champ" for="mot-de-passe">', $page);
    contient('autocomplete="current-password"', $page);
    egal(false, (bool) preg_match('/Warning|Notice|Fatal|Deprecated/', $page), 'aucune erreur PHP affichee');
});

test('un mauvais mot de passe est refuse, le bon ouvre une nouvelle session et l application', function () use ($url): void {
    $c = new Client($url);
    $avant = $c->jeton();
    [$statut, , $page] = $c->formulaire('index.php', ['action' => 'connexion', 'csrf' => $avant, 'mot_de_passe' => 'faux']);
    egal(200, $statut);
    contient('Mot de passe incorrect.', $page);
    contient('role="alert" id="erreur-connexion"', $page);
    contient('aria-invalid="true"', $page);
    [$statut, $h] = $c->connecter(MOT);
    egal(303, $statut);
    contient('svg_session=', $h['set-cookie'] ?? '', 'un nouvel identifiant de session');
    [, , $app] = $c->get('index.php');
    contient('<div id="site" data-csrf="', $app);
    contient('<script src="assets/site.js" defer></script>', $app);
    affirmer($c->jeton() !== $avant, 'un nouveau jeton CSRF apres la connexion');
});

test('une connexion sans jeton CSRF de la session est refusee', function () use ($url): void {
    $c = new Client($url);
    $c->get('index.php');
    [$statut, , $page] = $c->formulaire('index.php', ['action' => 'connexion', 'csrf' => str_repeat('0', 64), 'mot_de_passe' => MOT]);
    egal(200, $statut);
    contient('a expiré', $page);
    [$statut, , $page] = $c->formulaire('index.php', ['action' => 'connexion', 'mot_de_passe' => MOT]);
    contient('a expiré', $page);
    [, , $page] = $c->get('index.php');
    egal(false, str_contains($page, 'data-csrf'), 'toujours pas connecte');
});

test('apres trois echecs, chaque essai attend un delai qui double, meme avec le bon mot de passe', function () use ($depot): void {
    $s = installer($depot, []);
    $c = new Client($s['url']);
    for ($i = 0; $i < 3; $i++) {
        [, , $page] = $c->formulaire('index.php', ['action' => 'connexion', 'csrf' => $c->jeton(), 'mot_de_passe' => 'faux ' . $i]);
        contient('Mot de passe incorrect.', $page, 'essai libre ' . $i);
    }
    [$statut, , $page] = $c->connecter(MOT);
    egal(429, $statut, 'retenu');
    contient('Trop d’essais : patientez', $page);
    sleep(3);
    [, , $page] = $c->formulaire('index.php', ['action' => 'connexion', 'csrf' => $c->jeton(), 'mot_de_passe' => 'encore faux']);
    contient('Prochain essai possible dans 4 secondes', $page);
    sleep(5);
    [$statut] = $c->connecter(MOT);
    egal(303, $statut, 'le bon mot de passe passe une fois le delai ecoule');
    $journal = (string) file_get_contents($s['racine'] . '/data/journal/connexions.log');
    contient('retenue client=', $journal);
    egal(false, str_contains($journal, '127.0.0.1'), 'le journal ne garde pas l adresse');
});

/** Le jeton CSRF du formulaire de la page courante. */
function jeton_de(string $page): string
{
    return preg_match('/name="csrf" value="([a-f0-9]{64})"/', $page, $m) === 1 ? $m[1] : '';
}

test('sans aucun mot de passe, la page le fait choisir, dit les autres voies, et personne n entre autrement', function () use ($depot): void {
    $s = installer($depot, [], false);
    $c = new Client($s['url']);
    [$statut, , $page] = $c->get('index.php');
    egal(200, $statut);
    contient('<h2 id="titre-choix">Choisissez le mot de passe du site</h2>', $page);
    contient('autocomplete="new-password"', $page);
    contient('data/password', $page);
    contient('php inc/mot-de-passe.php', $page);
    egal(false, str_contains($page, 'name="action" value="connexion"'), 'pas de formulaire de connexion');
    [$statut, , $page] = $c->formulaire('index.php', ['action' => 'connexion', 'csrf' => $c->jeton(), 'mot_de_passe' => 'nimporte quoi de long']);
    egal(200, $statut);
    contient('Choisissez le mot de passe du site', $page, 'une connexion sans mot de passe ramene au choix');
    [$statut, , $corps] = $c->get('api.php?r=projets');
    egal(401, $statut);
    egal('session', json_decode($corps, true)['erreur'] ?? null);
});

test('le premier mot de passe : CSRF exige, saisies differentes ou trop courtes refusees sans rien ecrire, puis la session s ouvre', function () use ($depot): void {
    $s = installer($depot, [], false);
    $pwd = $s['racine'] . '/data/pwd';
    $c = new Client($s['url']);
    [, , $page] = $c->get('index.php');
    $jeton = jeton_de($page);
    [$statut, , $page] = $c->formulaire('index.php', ['action' => 'choisir', 'mot_de_passe' => 'un premier mot de passe', 'confirmation' => 'un premier mot de passe']);
    egal(200, $statut);
    contient('La page a expiré', $page);
    egal(false, file_exists($pwd), 'sans jeton, rien n est ecrit');
    [, , $page] = $c->formulaire('index.php', ['action' => 'choisir', 'csrf' => str_repeat('0', 64), 'mot_de_passe' => 'un premier mot de passe', 'confirmation' => 'un premier mot de passe']);
    contient('La page a expiré', $page);
    [, , $page] = $c->formulaire('index.php', ['action' => 'choisir', 'csrf' => $jeton, 'mot_de_passe' => 'un premier mot de passe', 'confirmation' => 'un autre mot de passe']);
    contient('Les deux saisies diffèrent', $page);
    contient('role="alert" id="erreur-choix"', $page);
    contient('aria-invalid="true"', $page);
    [, , $page] = $c->formulaire('index.php', ['action' => 'choisir', 'csrf' => $jeton, 'mot_de_passe' => 'court', 'confirmation' => 'court']);
    contient('au moins 10 caractères', $page);
    egal(false, file_exists($pwd), 'aucun refus n a rien ecrit');
    [$statut, $h] = $c->formulaire('index.php', ['action' => 'choisir', 'csrf' => $jeton, 'mot_de_passe' => 'un premier mot de passe', 'confirmation' => 'un premier mot de passe']);
    egal(303, $statut);
    contient('svg_session=', $h['set-cookie'] ?? '', 'un nouvel identifiant de session');
    affirmer(password_verify('un premier mot de passe', trim((string) file_get_contents($pwd))), 'l empreinte est ecrite');
    egal(true, (fileperms($pwd) & 0o077) === 0o040 || (fileperms($pwd) & 0o077) === 0, 'memes droits que l outil');
    [, , $app] = $c->get('index.php');
    contient('<div id="site" data-csrf="', $app, 'la session est ouverte : l application');
    egal(200, $c->get('api.php?r=projets')[0]);
    contient('mot de passe pose depuis la page de premiere visite', (string) file_get_contents($s['racine'] . '/data/journal/connexions.log'));
    // Le formulaire n'existe plus : un autre visiteur voit la connexion, et un envoi direct est refuse.
    $autre = new Client($s['url']);
    [, , $page] = $autre->get('index.php');
    contient('name="action" value="connexion"', $page);
    egal(false, str_contains($page, 'Choisissez le mot de passe'), 'plus de formulaire de choix');
    $empreinte = file_get_contents($pwd);
    [$statut, , $page] = $autre->formulaire('index.php', ['action' => 'choisir', 'csrf' => jeton_de($page), 'mot_de_passe' => 'le mot de passe pirate', 'confirmation' => 'le mot de passe pirate']);
    egal(403, $statut);
    contient('Un mot de passe a déjà été posé', $page);
    egal($empreinte, file_get_contents($pwd), 'le mot de passe reste');
    egal(303, $autre->connecter('un premier mot de passe')[0], 'la connexion marche avec le mot de passe choisi');
});

test('un data/pwd mal forme ne rouvre pas le choix : l administrateur lit quoi faire', function () use ($depot): void {
    $s = installer($depot, [], false);
    file_put_contents($s['racine'] . '/data/pwd', "pas une empreinte\n");
    [$statut, , $page] = (new Client($s['url']))->get('index.php');
    egal(503, $statut);
    contient('ne contient pas d’empreinte reconnue', $page);
    contient('data/password', $page);
});

test('la disposition livree : data/ dans public/, data/password par FTP devient le mot de passe, data/ ne se lit pas par HTTP', function () use ($depot): void {
    $s = installer_livre($depot);
    $c = new Client($s['url']);
    contient('Choisissez le mot de passe du site', $c->get('index.php')[2]);
    file_put_contents($s['data'] . '/password', "court\n");
    [$statut, , $page] = $c->get('index.php');
    egal(503, $statut, 'trop court : refuse');
    contient('data/password est refusé', $page);
    egal(true, is_file($s['data'] . '/password'));
    egal(false, is_file($s['data'] . '/pwd'));
    file_put_contents($s['data'] . '/password', "  le mot de passe par FTP\r\n");
    [$statut, , $page] = $c->get('index.php');
    egal(200, $statut);
    contient('Mot de passe enregistré, et le fichier data/password supprimé', $page);
    egal(false, file_exists($s['data'] . '/password'), 'le fichier en clair a disparu');
    affirmer(password_verify('le mot de passe par FTP', trim((string) file_get_contents($s['data'] . '/pwd'))), 'empreinte dans public/data/pwd');
    egal(303, $c->connecter('le mot de passe par FTP')[0]);
    [, , $app] = $c->get('index.php');
    contient('<div id="site"', $app);
    egal(false, str_contains($app, 'site-avertissement'), 'la verification HTTP de data/ passe : aucun avertissement');
    $vu = json_decode((string) file_get_contents($s['data'] . '/journal/verification-http.json'), true);
    egal(false, $vu['lisible'] ?? null, 'le site s est demande data/pwd, et le serveur a refuse');
    file_put_contents($s['data'] . '/password', 'un fichier oublie');
    foreach (['data/pwd', 'data/password', 'data/.htaccess', 'data/secret', 'data/journal/connexions.log', 'DATA/pwd', 'assets/../data/pwd', 'data%2Fpwd', 'inc/mot-de-passe.php', 'inc/serveur-local.php'] as $f) {
        [$statut, , $corps] = (new Client($s['url']))->get($f);
        affirmer(in_array($statut, [403, 404], true), $f . ' : ' . $statut);
        egal(false, str_contains($corps, 'oublie') || str_contains($corps, '$argon2') || str_contains($corps, '$2y$'), $f . ' ne dit rien');
    }
});

test('sans .htaccess applique, la disposition livree avertit que data/ se lit par HTTP', function () use ($depot): void {
    $s = installer_livre($depot, false);
    $c = new Client($s['url']);
    file_put_contents($s['data'] . '/password', 'un mot de passe assez long');
    $c->get('index.php');
    egal(303, $c->connecter('un mot de passe assez long')[0]);
    [, , $app] = $c->get('index.php');
    contient('le dossier des données est lisible depuis le Web', $app);
    contient('se lit par HTTP', (string) file_get_contents($s['data'] . '/journal/erreurs.log'));
});

test('changer le mot de passe par data/password ferme les sessions ouvertes, l API comprise', function () use ($depot): void {
    $s = installer($depot, []);
    [$c] = connecte($s['url']);
    egal(200, $c->get('api.php?r=projets')[0]);
    file_put_contents($s['racine'] . '/data/password', "le nouveau mot de passe\n");
    egal(401, $c->get('api.php?r=projets')[0], 'l API ferme la session sans que personne ne recharge la page');
    egal(false, file_exists($s['racine'] . '/data/password'), 'converti par l API');
    contient('Le mot de passe du site a changé : reconnectez-vous.', $c->get('index.php')[2]);
    $d = new Client($s['url']);
    contient('Mot de passe incorrect.', $d->connecter(MOT)[2] ?? '');
    egal(303, $d->connecter('le nouveau mot de passe')[0]);
    egal(200, $d->get('api.php?r=projets')[0]);
});

test('toute route de l API exige la session', function () use ($url): void {
    $c = new Client($url);
    foreach (['projets', 'projet&id=0123456789abcdef', 'json&f=bibliotheque', 'fonte&f=inter.ttf', 'police&sha=' . urlencode(str_repeat('A', 43) . '='), 'vignette&id=0123456789abcdef', 'inconnue'] as $r) {
        [$statut, , $corps] = $c->get('api.php?r=' . $r);
        egal(401, $statut, $r);
        egal('session', json_decode($corps, true)['erreur'] ?? null, $r);
    }
    [$statut] = $c->ecrire('api.php?r=enregistrer', ['projet' => projet_json()], 'x');
    egal(401, $statut);
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
    egal($csrf, json_decode($corps, true)['csrf'] ?? null);
    egal(false, isset($h['access-control-allow-origin']), 'aucune autorisation CORS');
    egal(401, (new Client($url))->get('api.php?r=jeton')[0]);
});

test('creer, lister, ouvrir (ETag), ecraser avec la revision ; un autre onglet est refuse', function () use ($url): void {
    [$c, $csrf] = connecte($url);
    [$statut, , $corps] = $c->ecrire('api.php?r=enregistrer', ['projet' => projet_json('Ma carte'), 'vignette' => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0Z"/></svg>'], $csrf);
    egal(200, $statut, $corps);
    $m = json_decode($corps, true)['meta'];
    egal(1, $m['revision']);
    [, , $liste] = $c->get('api.php?r=projets');
    affirmer(in_array($m['id'], array_column(json_decode($liste, true)['projets'], 'id'), true), 'liste');
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
    // Deux onglets ont ouvert la revision 1 ; le premier enregistre, le second est refuse au lieu d'ecraser.
    [$statut, , $corps] = $c->ecrire('api.php?r=enregistrer&id=' . $m['id'], ['projet' => projet_json('Onglet A')], $csrf, ['If-Match: "1"']);
    egal(200, $statut, $corps);
    egal(2, json_decode($corps, true)['meta']['revision']);
    [$statut, , $corps] = $c->ecrire('api.php?r=enregistrer&id=' . $m['id'], ['projet' => projet_json('Onglet B')], $csrf, ['If-Match: "1"']);
    egal(409, $statut);
    egal('conflit', json_decode($corps, true)['erreur']);
    egal(2, json_decode($corps, true)['meta']['revision']);
    egal(428, $c->ecrire('api.php?r=enregistrer&id=' . $m['id'], ['projet' => projet_json()], $csrf)[0], 'sans revision');
    egal('Onglet A', json_decode($c->get('api.php?r=projet&id=' . $m['id'])[2], true)['nom']);
    // Une etiquette affaiblie par un mandataire (W/"2") vaut la revision 2.
    [$statut, , $corps] = $c->ecrire('api.php?r=enregistrer&id=' . $m['id'], ['projet' => projet_json('Onglet C')], $csrf, ['If-Match: W/"2"']);
    egal(200, $statut, $corps);
    egal(3, json_decode($corps, true)['meta']['revision']);
    egal('Onglet C', json_decode($c->get('api.php?r=projet&id=' . $m['id'])[2], true)['nom']);
});

test('renommer, dupliquer, supprimer par l API', function () use ($url): void {
    [$c, $csrf] = connecte($url);
    $m = json_decode($c->ecrire('api.php?r=enregistrer', ['projet' => projet_json('A renommer')], $csrf)[2], true)['meta'];
    [$statut, , $corps] = $c->ecrire('api.php?r=renommer&id=' . $m['id'], ['nom' => "../Nouveau\u{0007}"], $csrf);
    egal(200, $statut);
    egal('-Nouveau', json_decode($corps, true)['meta']['nom']);
    [$statut, , $corps] = $c->ecrire('api.php?r=dupliquer&id=' . $m['id'], new stdClass(), $csrf);
    egal(200, $statut);
    $copie = json_decode($corps, true)['meta'];
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
    $avant = json_decode($c->get('api.php?r=projets')[2], true)['projets'];
    egal(400, $c->ecrire('api.php?r=enregistrer', '{"projet": ', $csrf)[0], 'JSON tronque');
    egal(400, $c->ecrire('api.php?r=enregistrer', '[1,2,3]', $csrf)[0], 'pas un objet');
    egal(400, $c->ecrire('api.php?r=enregistrer', ['projet' => ['format' => 'autre']], $csrf)[0], 'pas un projet');
    egal(400, $c->ecrire('api.php?r=enregistrer', str_repeat('[', 1000) . str_repeat(']', 1000), $csrf)[0], 'trop profond');
    $geant = projet_json();
    $geant['dessin']['formes'][0]['d'] = 'M0 0' . str_repeat('L1 1', 100000);
    egal(413, $c->ecrire('api.php?r=enregistrer', ['projet' => $geant], $csrf)[0], 'trop gros');
    egal($avant, json_decode($c->get('api.php?r=projets')[2], true)['projets'], 'rien n a ete ecrit');
});

test('une police du catalogue : servie par le site apres verification, une empreinte fausse refusee, hors index refusee', function () use ($url, $site, $shaJuste, $shaAttendu700, $juste, $source): void {
    [$c] = connecte($url);
    [$statut, $h, $octets] = $c->get('api.php?r=police&sha=' . urlencode($shaJuste));
    egal(200, $statut);
    egal($juste, $octets);
    egal('font/woff', $h['content-type'] ?? '');
    egal(1, count(glob($site['racine'] . '/data/font/catalogue/*.fonte') ?: []), 'rangee dans data/font');
    // La source disparait : le site sert toujours ce qu'il a range.
    effacer($source . '/npm');
    effacer($source . '/bunny');
    egal(200, $c->get('api.php?r=police&sha=' . urlencode($shaJuste))[0]);
    [$statut, , $corps] = $c->get('api.php?r=police&sha=' . urlencode($shaAttendu700));
    egal(502, $statut, 'les deux sources servent un autre fichier');
    egal('source', json_decode($corps, true)['erreur'] ?? null);
    [$statut, , $corps] = $c->get('api.php?r=police&sha=' . urlencode(base64_encode(hash('sha256', 'nulle part', true))));
    egal(404, $statut);
    egal('hors_index', json_decode($corps, true)['erreur'] ?? null);
    egal(1, count(glob($site['racine'] . '/data/font/catalogue/*.fonte') ?: []), 'rien d autre n est range');
});

test('les donnees JSON se servent avec leur ETag (304 ensuite)', function () use ($url): void {
    [$c] = connecte($url);
    [$statut, $h, $corps] = $c->get('api.php?r=json&f=bibliotheque');
    egal(200, $statut);
    egal('{"entrees":[]}', $corps);
    egal(304, $c->get('api.php?r=json&f=bibliotheque', ['If-None-Match: ' . ($h['etag'] ?? '')])[0]);
});

test('la deconnexion ferme la session ; une session inactive expire', function () use ($url, $depot): void {
    [$c, $csrf] = connecte($url);
    [$statut, $h] = $c->formulaire('index.php', ['action' => 'deconnexion', 'csrf' => $csrf]);
    egal(303, $statut);
    contient('au-revoir', $h['location'] ?? '');
    egal(401, $c->get('api.php?r=projets')[0]);
    contient('Vous êtes déconnecté.', $c->get('index.php?au-revoir')[2]);

    $court = installer($depot, ['SESSION_INACTIVITE' => 1]);
    [$d] = connecte($court['url']);
    egal(200, $d->get('api.php?r=projets')[0]);
    sleep(3);
    egal(401, $d->get('api.php?r=projets')[0]);
    contient('Votre session a expiré', $d->get('index.php')[2]);
});

test('config.php, inc/ et l outil du mot de passe ne disent rien demandes directement', function () use ($url): void {
    $c = new Client($url);
    foreach (['config.php', 'config.local.php', 'inc/amorce.php', 'inc/projets.php', 'inc/session.php', 'inc/connexion.php', 'inc/mot-de-passe.php', 'inc/serveur-local.php'] as $f) {
        [$statut, , $corps] = $c->get($f);
        affirmer($corps === '', $f . ' a repondu : ' . mb_substr($corps, 0, 80));
        affirmer($statut === 404 || $statut === 200, $f . ' : ' . $statut);
    }
});

exit(lancer_tests('Le site par HTTP') > 0 ? 1 : 0);
