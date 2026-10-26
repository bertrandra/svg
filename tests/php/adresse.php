<?php
// Ouvrir depuis une adresse par le serveur du site (ADR-0036), et ses protections contre la falsification de requete cote serveur
// (SSRF, docs/securite.md § 10). Jamais le vrai reseau : une source simulee par un `php -S` local, et la resolution DNS remplacee
// par une table (ADRESSE_RESOLUTION_ESSAI). Deux parties :
//
//   1. les fonctions, appelees directement (https seulement, comme en production) : adresses IP interdites en IPv4 et IPv6 (mappees,
//      NAT64, 6to4 comprises), noms d'hote, schemas, ports, redirections relatives ;
//   2. le site par HTTP, sous `php -S`, `http` permis vers la seule source locale : octets bruts et en-tetes, session et jeton CSRF
//      exiges, adresses privees refusees (litterales ou par le DNS), rebinding sans effet, redirections revues a chaque saut et
//      bornees a 3, schemas et ports interdits apres une redirection, taille et delai bornes en flux, aucun cookie ni en-tete de
//      trop, un journal qui ne garde que l'hote.

declare(strict_types=1);

require __DIR__ . '/outils.php';

$depot = dirname(__DIR__, 2);

// ---------------------------------------------------------------------------------------------------------------------------------
// 1. Les fonctions
// ---------------------------------------------------------------------------------------------------------------------------------

$racine = dossier_temporaire('site-adresse-unitaires');
register_shutdown_function(fn() => effacer($racine));
define('SVG_SITE', true);
define('DATA_DIR', $racine . '/data');
define('ADRESSE_RESOLUTION_ESSAI', [
    'public.essai' => [['93.184.215.14']], 'prive.essai' => [['10.0.0.7']], 'mixte.essai' => [['93.184.215.14', '192.168.1.10']],
    'v6.essai' => [['2606:2800:220:1:248:1893:25c8:1946']], 'v6prive.essai' => [['fd00::1']], 'mappe.essai' => [['::ffff:10.0.0.1']],
]);
mkdir(DATA_DIR, 0700, true);
require $depot . '/outils/site-php/data/inc/amorce.php';

test('les adresses IPv4 privees, de bouclage, lien-local, partagees, multicast, reservees ou de documentation sont interdites', function (): void {
    foreach (['127.0.0.1', '127.255.255.254', '10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '100.127.255.255',
        '0.0.0.0', '0.1.2.3', '192.0.0.8', '192.0.2.1', '198.18.0.1', '198.19.255.255', '198.51.100.7', '203.0.113.9', '224.0.0.1', '239.255.255.250', '240.0.0.1', '255.255.255.255'] as $ip) {
        affirmer(ip_interdite($ip), $ip . ' devait etre interdite');
    }
    foreach (['93.184.215.14', '8.8.8.8', '1.1.1.1', '172.15.255.255', '172.32.0.1', '100.63.255.255', '100.128.0.1', '11.0.0.1', '192.169.0.1', '223.255.255.255'] as $ip) {
        affirmer(!ip_interdite($ip), $ip . ' devait etre permise');
    }
});

test('en IPv6, seule la plage mondiale est permise ; une IPv4 mappee, NAT64 ou 6to4 est jugee sur l IPv4 qu elle porte', function (): void {
    foreach (['::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'fec0::1', 'ff02::1', 'ff05::2', '2001:db8::1', '2001::1', '2001:2::1', '2001:10::1', '3fff::1', '100::1', '::ffff:127.0.0.1',
        '::ffff:10.0.0.1', '::ffff:169.254.169.254', '::ffff:7f00:1', '64:ff9b::10.0.0.1', '64:ff9b::a9fe:a9fe', '2002:c0a8:0101::1', '2002:7f00:0001::', '::127.0.0.1', '::10.0.0.1', 'pas une ip', ''] as $ip) {
        affirmer(ip_interdite($ip), $ip . ' devait etre interdite');
    }
    foreach (['2606:2800:220:1:248:1893:25c8:1946', '2a00:1450:4007:80c::200e', '::ffff:93.184.215.14', '64:ff9b::808:808', '2002:5db8:d70e::1'] as $ip) {
        affirmer(!ip_interdite($ip), $ip . ' devait etre permise');
    }
});

test('ADRESSE_RESEAUX_PERMIS ouvre un reseau prive choisi, et lui seul (son IPv4 mappee comprise)', function (): void {
    affirmer(!ip_interdite('10.20.1.2', ['10.20.0.0/16']), 'le reseau permis');
    affirmer(ip_interdite('10.21.1.2', ['10.20.0.0/16']), 'le reseau voisin');
    affirmer(!ip_interdite('::ffff:10.20.1.2', ['10.20.0.0/16']), 'mappee dans le reseau permis');
    affirmer(!ip_interdite('fd12:3456::9', ['fd12:3456::/48']), 'ULA permise');
    affirmer(ip_interdite('fd12:3457::9', ['fd12:3456::/48']), 'ULA voisine');
    affirmer(ip_interdite('127.0.0.1', ['pas un reseau', '10.0.0.0/99']), 'un reseau mal ecrit ne permet rien');
});

test('un nom d hote lu comme une IPv4 par un resolveur (decimal, hexadecimal, abrege) est refuse', function (): void {
    foreach (['2130706433', '0x7f.1', '127.1', '0177.0.0.1', '0x7f000001', '1.2.3', 'a..b', '-a.fr', 'a_b.fr', str_repeat('a', 64) . '.fr', ''] as $h) {
        affirmer(!nom_hote_valide($h), $h . ' devait etre refuse');
    }
    foreach (['exemple.fr', 'www.exemple.fr', 'xn--nol-bma.fr', 'a.b.c.d.exemple', 'cdn1.exemple.fr.', 'localhost'] as $h) {
        affirmer(nom_hote_valide($h), $h . ' devait etre accepte');
    }
});

test('une adresse se decoupe en morceaux verifies : https seulement, port 443, ni identifiant, ni blanc, ni barre inverse', function (): void {
    $d = adresse_decouper('https://Exemple.FR/dessins/logo.svg?v=2#haut');
    egal(['schema' => 'https', 'hote' => 'exemple.fr', 'port' => 443, 'chemin' => '/dessins/logo.svg?v=2', 'ip' => null], $d);
    egal('https://exemple.fr:443/dessins/logo.svg?v=2', adresse_recomposer($d));
    egal('https://[2606:2800:220:1:248:1893:25c8:1946]:443/', adresse_recomposer(adresse_decouper('https://[2606:2800:220:1:248:1893:25c8:1946]')));
    $refus = [
        'http://exemple.fr/a.svg' => 'schema', 'file:///etc/passwd' => 'schema', 'gopher://exemple.fr/' => 'schema', 'ftp://exemple.fr/a' => 'schema',
        'dict://exemple.fr:11211/' => 'schema', 'ldap://exemple.fr/' => 'schema', 'javascript:alert(1)' => 'schema', 'data:text/plain,x' => 'schema',
        'https://exemple.fr:8443/a' => 'port', 'https://exemple.fr:22/a' => 'port', 'https://moi:secret@exemple.fr/' => 'adresse_invalide',
        'https://exemple.fr/a b' => 'adresse_invalide', "https://exemple.fr/\r\nHost: x" => 'adresse_invalide', 'https://exemple.fr\\@prive.essai/' => 'adresse_invalide',
        'https://2130706433/' => 'adresse_invalide', 'https://0x7f.1/' => 'adresse_invalide', 'https://exemple.fr/é' => 'adresse_invalide', '//exemple.fr/a' => 'adresse_invalide',
        'https:///a' => 'adresse_invalide', '' => 'adresse_invalide', 'https://' . str_repeat('a', 2050) . '.fr/' => 'adresse_invalide',
    ];
    foreach ($refus as $url => $code) {
        $r = adresse_decouper($url);
        egal($code, $r['erreur'] ?? null, $url);
    }
    egal('adresse_invalide', adresse_decouper(['https://exemple.fr/'])['erreur'] ?? null, 'un tableau');
});

test('toutes les adresses d un nom doivent etre publiques ; une seule privee suffit a refuser', function (): void {
    egal('93.184.215.14', adresse_ip_verifiee(adresse_decouper('https://public.essai/a.svg')));
    egal('2606:2800:220:1:248:1893:25c8:1946', adresse_ip_verifiee(adresse_decouper('https://v6.essai/a.svg')));
    foreach (['https://prive.essai/', 'https://mixte.essai/', 'https://v6prive.essai/', 'https://mappe.essai/', 'https://127.0.0.1/', 'https://[::1]/', 'https://[::ffff:127.0.0.1]/', 'https://169.254.169.254/', 'https://0.0.0.0/'] as $u) {
        egal('adresse_interdite', adresse_ip_verifiee(adresse_decouper($u))['erreur'] ?? null, $u);
    }
    egal('injoignable', adresse_ip_verifiee(adresse_decouper('https://inconnu.essai/'))['erreur'] ?? null, 'un nom qui ne se resout pas');
});

test('une redirection relative se resout contre l adresse courante', function (): void {
    $d = adresse_decouper('https://exemple.fr/a/b/c.svg?x=1');
    egal('https://exemple.fr:443/a/b/d.svg', adresse_suivante($d, 'd.svg'));
    egal('https://exemple.fr:443/z.svg', adresse_suivante($d, '/z.svg'));
    egal('https://autre.fr/z.svg', adresse_suivante($d, '//autre.fr/z.svg'));
    egal('https://exemple.fr:443/a/b/c.svg?y=2', adresse_suivante($d, '?y=2'));
    egal('file:///etc/passwd', adresse_suivante($d, 'file:///etc/passwd'));
    egal(null, adresse_suivante($d, "https://exemple.fr/\x00a"));
    egal(null, adresse_suivante($d, "/a b"));
    egal(null, adresse_suivante($d, ''));
});

test('le journal ne retient que l hote d une adresse', function (): void {
    egal('exemple.fr', hote_pour_journal('https://Exemple.fr/secret/chemin?jeton=abc'));
    egal('?', hote_pour_journal(['x']));
    egal('?', hote_pour_journal('pas une adresse'));
});

$echecs = lancer_tests('Ouvrir depuis une adresse : les fonctions');

// ---------------------------------------------------------------------------------------------------------------------------------
// 2. Le site par HTTP
// ---------------------------------------------------------------------------------------------------------------------------------

// La source simulee : un `php -S` a plusieurs travailleurs (une reponse lente n'en bloque pas d'autres), avec un routeur.
$source = dossier_temporaire('source-adresses');
register_shutdown_function(fn() => effacer($source));
$portSource = port_libre();
$svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="5" height="5" fill="#c81e28"/></svg>';
$png = "\x89PNG\r\n\x1a\n" . random_bytes(64);
file_put_contents($source . '/svg.bin', $svg);
file_put_contents($source . '/png.bin', $png);
file_put_contents($source . '/routeur.php', <<<'PHP'
<?php
$port = (int) $_SERVER['SERVER_PORT'];
$chemin = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$aller = function (string $ou, int $code = 302): void { header('Location: ' . $ou, true, $code); echo 'redirection'; };
switch ($chemin) {
    case '/dessin.svg': case '/logo.png': header('Content-Type: image/png'); readfile(__DIR__ . '/svg.bin'); break;
    case '/image.png': header('Content-Type: text/html'); readfile(__DIR__ . '/png.bin'); break;
    case '/echo': header('Content-Type: application/json'); echo json_encode(getallheaders()); break;
    case '/gros': for ($i = 0; $i < 40; $i++) { echo str_repeat('x', 10000); flush(); } break;
    case '/gros-annonce': header('Content-Length: 999999999'); echo 'x'; break;
    case '/lent': sleep(5); readfile(__DIR__ . '/svg.bin'); break;
    case '/lent-flux': for ($i = 0; $i < 20; $i++) { echo '<'; flush(); usleep(400000); } break;
    case '/vers-prive': $aller('http://prive.essai:' . $port . '/dessin.svg'); break;
    case '/vers-ip-privee': $aller('http://10.0.0.1:' . $port . '/dessin.svg'); break;
    case '/vers-metadonnees': $aller('http://169.254.169.254:' . $port . '/latest/meta-data/'); break;
    case '/vers-mappee': $aller('http://[::ffff:127.0.0.2]:' . $port . '/dessin.svg'); break;
    case '/vers-rebond': $aller('/dessin.svg'); break;
    case '/vers-relatif': $aller('dessin.svg', 301); break;
    case '/vers-file': $aller('file:///etc/passwd'); break;
    case '/vers-gopher': $aller('gopher://public.essai:' . $port . '/_x'); break;
    case '/vers-port': $aller('http://public.essai:22/'); break;
    case '/r3': $aller('/r2', 307); break;
    case '/r2': $aller('/r1', 308); break;
    case '/r1': $aller('/dessin.svg', 303); break;
    case '/r4': $aller('/r3'); break;
    case '/boucle': $aller('/boucle'); break;
    case '/cookie': header('Set-Cookie: suivi=1; Path=/'); $aller('/echo'); break;
    case '/erreur': http_response_code(404); echo '<!DOCTYPE html><html><body>Not Found</body></html>'; break;
    default: http_response_code(404);
}
PHP);
$journalSource = sys_get_temp_dir() . '/source-adresses-' . $portSource . '.log';
$p = proc_open([PHP_BINARY, '-S', '127.0.0.1:' . $portSource, '-t', $source, $source . '/routeur.php'], [0 => ['pipe', 'r'], 1 => ['file', $journalSource, 'a'], 2 => ['file', $journalSource, 'a']], $tubes, null, array_merge(getenv(), ['PHP_CLI_SERVER_WORKERS' => '4']));
register_shutdown_function(function () use ($p): void { proc_terminate($p); proc_close($p); });
for ($i = 0; $i < 100 && !@fsockopen('127.0.0.1', $portSource, $no, $err, 0.1); $i++) {
    usleep(50000);
}

// Le site : http permis vers la seule source locale (127.0.0.1/32, son port), un DNS simule, des bornes courtes.
$site = dossier_temporaire('site-adresse');
register_shutdown_function(fn() => effacer($site));
copier($depot . '/outils/site-php/public', $site . '/public');
copier($depot . '/outils/site-php/data', $site . '/data');
mkdir($site . '/data/json', 0700, true);
$reglages = [
    'ADRESSE_HTTP' => true, 'ADRESSE_PORTS' => [$portSource], 'ADRESSE_RESEAUX_PERMIS' => ['127.0.0.1/32'], 'ADRESSE_OCTETS_MAX' => 300000, 'ADRESSE_DELAI' => 2,
    'ADRESSE_RESOLUTION_ESSAI' => [
        'public.essai' => [['127.0.0.1']], 'prive.essai' => [['10.0.0.7']], 'mixte.essai' => [['127.0.0.1', '192.168.1.10']],
        'rebond.essai' => [['127.0.0.1'], ['10.1.2.3']], 'epingle.essai' => [['127.0.0.1'], ['10.9.9.9']],
        'v6prive.essai' => [['fd00::1']], 'mappe.essai' => [['::ffff:10.0.0.1']], 'lien.essai' => [['fe80::1']], 'nat64.essai' => [['64:ff9b::a00:1']],
    ],
];
$lignes = ['<?php'];
foreach ($reglages as $nom => $valeur) {
    $lignes[] = 'define(' . var_export($nom, true) . ', ' . var_export($valeur, true) . ');';
}
mkdir($site . '/data/config', 0700, true);
file_put_contents($site . '/data/config/config.local.php', implode("\n", $lignes) . "\n");
ecrire_config($site . '/data');
creer_admin($site . '/data');
$url = serveur_php($site . '/public');
$s = 'http://public.essai:' . $portSource;

/** Un client connecte, et son jeton CSRF. */
function client_connecte(string $url): array
{
    $c = new Client($url);
    [$statut] = $c->connecter(ADMIN_EMAIL, MOT);
    egal(303, $statut, 'connexion');
    return [$c, $c->jeton()];
}

/** Demande une adresse au site ; rend [statut, en-tetes, corps, code d'erreur ou null]. */
function demander_adresse(Client $c, string $csrf, string $adresse): array
{
    [$statut, $h, $corps] = $c->ecrire('api.php?r=adresse', ['adresse' => $adresse], $csrf);
    $json = str_starts_with($h['content-type'] ?? '', 'application/json') ? json_decode($corps, true) : null;
    return [$statut, $h, $corps, is_array($json) ? ($json['erreur'] ?? null) : null, is_array($json) ? ($json['message'] ?? '') : ''];
}

[$client, $csrf] = client_connecte($url);

test('la page annonce l ouverture par adresse et ce que l administrateur permet', function () use ($url): void {
    [$c] = client_connecte($url);
    [, , $page] = $c->get('index.php');
    contient('data-adresse="1"', $page);
    contient('data-adresse-http="1"', $page);
});

test('le site rend les octets bruts, en application/octet-stream, attachment, nosniff, jamais mis en cache', function () use ($client, $csrf, $s, $svg, $png): void {
    [$statut, $h, $corps] = demander_adresse($client, $csrf, $s . '/dessin.svg');
    egal(200, $statut);
    egal($svg, $corps);
    egal('application/octet-stream', $h['content-type'] ?? '');
    contient('attachment', $h['content-disposition'] ?? '');
    egal('nosniff', $h['x-content-type-options'] ?? '');
    egal('no-store', $h['cache-control'] ?? '');
    // Le type annonce par la source (image/png pour un SVG, text/html pour une PNG) ne passe pas : le navigateur decide sur les octets.
    [, , $corps] = demander_adresse($client, $csrf, $s . '/image.png');
    egal($png, $corps);
});

test('la route exige la session, POST, le jeton CSRF et le meme site', function () use ($url, $csrf, $s): void {
    $anonyme = new Client($url);
    egal(401, $anonyme->ecrire('api.php?r=adresse', ['adresse' => $s . '/dessin.svg'], $csrf)[0]);
    [$c, $jeton] = client_connecte($url);
    egal(405, $c->get('api.php?r=adresse&adresse=' . urlencode($s . '/dessin.svg'))[0]);
    [$statut, , $corps] = $c->ecrire('api.php?r=adresse', ['adresse' => $s . '/dessin.svg'], null);
    egal(403, $statut);
    contient('"csrf"', $corps);
    egal(403, $c->ecrire('api.php?r=adresse', ['adresse' => $s . '/dessin.svg'], 'faux')[0]);
    egal(403, $c->ecrire('api.php?r=adresse', ['adresse' => $s . '/dessin.svg'], $jeton, ['Sec-Fetch-Site: cross-site'])[0]);
    egal(415, $c->requete('POST', 'api.php?r=adresse', ['X-CSRF: ' . $jeton, 'Content-Type: text/plain'], 'adresse=' . $s)[0]);
    egal(200, $c->ecrire('api.php?r=adresse', ['adresse' => $s . '/dessin.svg'], $jeton)[0]);
});

test('une adresse privee est refusee, litterale ou par le DNS, en IPv4 comme en IPv6, avant toute connexion', function () use ($client, $csrf, $portSource): void {
    $p = ':' . $portSource;
    foreach (['http://127.0.0.2' . $p . '/', 'http://10.0.0.1' . $p . '/', 'http://169.254.169.254' . $p . '/latest/meta-data/', 'http://0.0.0.0' . $p . '/', 'http://[::1]' . $p . '/',
        'http://[::ffff:127.0.0.2]' . $p . '/', 'http://[fe80::1]' . $p . '/', 'http://prive.essai' . $p . '/', 'http://mixte.essai' . $p . '/dessin.svg', 'http://v6prive.essai' . $p . '/',
        'http://mappe.essai' . $p . '/', 'http://lien.essai' . $p . '/', 'http://nat64.essai' . $p . '/'] as $u) {
        [$statut, , , $code] = demander_adresse($client, $csrf, $u);
        egal([403, 'adresse_interdite'], [$statut, $code], $u);
    }
});

test('un schema, un port, une adresse illisible ou un nom numerique sont refuses', function () use ($client, $csrf, $portSource): void {
    $cas = ['file:///etc/passwd' => 'schema', 'gopher://public.essai:' . $portSource . '/' => 'schema', 'ftp://public.essai/' => 'schema', 'dict://public.essai:11211/' => 'schema',
        'http://public.essai:22/' => 'port', 'http://public.essai/' => 'port', 'http://moi:mdp@public.essai:' . $portSource . '/' => 'adresse_invalide',
        'http://2130706433:' . $portSource . '/' => 'adresse_invalide', 'http://0x7f.1:' . $portSource . '/' => 'adresse_invalide', 'pas une adresse' => 'adresse_invalide'];
    foreach ($cas as $u => $attendu) {
        [, , , $code] = demander_adresse($client, $csrf, $u);
        egal($attendu, $code, $u);
    }
    [$statut, , $corps] = $client->ecrire('api.php?r=adresse', ['adresse' => 42], $csrf);
    egal(400, $statut);
    contient('adresse_invalide', $corps);
});

test('rebinding : la connexion va a l adresse verifiee ; un second tour de DNS qui change est refuse a la redirection', function () use ($client, $csrf, $portSource, $svg): void {
    // epingle.essai se resout d'abord en 127.0.0.1 (permis), puis en 10.9.9.9 : cURL ne le resout jamais lui-meme (le nom
    // n'existe pas dans le vrai DNS), il se connecte a l'adresse verifiee, et le fichier arrive.
    [$statut, , $corps] = demander_adresse($client, $csrf, 'http://epingle.essai:' . $portSource . '/dessin.svg');
    egal([200, $svg], [$statut, $corps]);
    // rebond.essai redirige vers lui-meme : le second saut se resout de nouveau, en 10.1.2.3, et il est refuse.
    [$statut, , , $code] = demander_adresse($client, $csrf, 'http://rebond.essai:' . $portSource . '/vers-rebond');
    egal([403, 'adresse_interdite'], [$statut, $code]);
});

test('les redirections se suivent a la main, revues a chaque saut, trois au plus', function () use ($client, $csrf, $s, $svg): void {
    [$statut, , $corps] = demander_adresse($client, $csrf, $s . '/vers-relatif');
    egal([200, $svg], [$statut, $corps], 'une redirection relative');
    [$statut, , $corps] = demander_adresse($client, $csrf, $s . '/r3');
    egal([200, $svg], [$statut, $corps], 'trois redirections');
    foreach (['/r4' => 'redirections', '/boucle' => 'redirections', '/vers-prive' => 'adresse_interdite', '/vers-ip-privee' => 'adresse_interdite', '/vers-metadonnees' => 'adresse_interdite',
        '/vers-mappee' => 'adresse_interdite', '/vers-file' => 'schema', '/vers-gopher' => 'schema', '/vers-port' => 'port'] as $chemin => $attendu) {
        [, , , $code] = demander_adresse($client, $csrf, $s . $chemin);
        egal($attendu, $code, $chemin);
    }
});

test('aucun cookie, aucun referent, un seul en-tete et un agent neutre ; un cookie pose par une redirection n est pas rendu', function () use ($client, $csrf, $s): void {
    [$statut, , $corps] = demander_adresse($client, $csrf, $s . '/cookie');
    egal(200, $statut);
    $entetes = array_change_key_case((array) json_decode($corps, true), CASE_LOWER);
    egal(['accept', 'host', 'user-agent'], (function (array $k): array { sort($k); return $k; })(array_keys($entetes)));
    egal('editeur-svg-site', $entetes['user-agent'] ?? '');
});

test('la taille est bornee en flux, annoncee ou non ; le delai aussi, reponse lente ou flux qui traine', function () use ($client, $csrf, $s): void {
    [$statut, , , $code] = demander_adresse($client, $csrf, $s . '/gros');
    egal([413, 'trop_gros'], [$statut, $code]);
    [$statut, , , $code] = demander_adresse($client, $csrf, $s . '/gros-annonce');
    egal([413, 'trop_gros'], [$statut, $code]);
    foreach (['/lent', '/lent-flux'] as $chemin) {
        $debut = microtime(true);
        [$statut, , , $code] = demander_adresse($client, $csrf, $s . $chemin);
        egal([504, 'delai'], [$statut, $code], $chemin);
        affirmer(microtime(true) - $debut < 4.5, $chemin . ' : coupe a 2 s (' . round(microtime(true) - $debut, 1) . ' s)');
    }
});

test('une erreur de la source est dite avec son statut ; un nom inconnu, comme injoignable', function () use ($client, $csrf, $s, $portSource): void {
    [$statut, , , $code, $message] = demander_adresse($client, $csrf, $s . '/erreur');
    egal([502, 'statut'], [$statut, $code]);
    contient('statut 404', $message);
    [$statut, , , $code] = demander_adresse($client, $csrf, 'http://inconnu.essai:' . $portSource . '/');
    egal([502, 'injoignable'], [$statut, $code]);
});

test('le journal garde l hote, la taille et le resultat, jamais le chemin ni les parametres', function () use ($client, $csrf, $s, $site): void {
    demander_adresse($client, $csrf, $s . '/dessin.svg?jeton=secret-du-lien');
    $journal = (string) @file_get_contents($site . '/data/journal/adresses.log');
    contient('hote=public.essai', $journal);
    contient('resultat=ok', $journal);
    contient('resultat=adresse_interdite', $journal);
    affirmer(!str_contains($journal, 'secret-du-lien') && !str_contains($journal, 'dessin.svg') && !str_contains($journal, '/latest/meta-data'), 'le journal ne garde que l hote');
});

$echecs += lancer_tests('Ouvrir depuis une adresse : le site par HTTP');
exit($echecs > 0 ? 1 : 0);
