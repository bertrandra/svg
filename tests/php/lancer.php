<?php
// Lance les tests PHP du site (ADR-0030, ADR-0041) : `php tests/php/lancer.php`, ou `npm run test:php`. Sans dependance : PHP 8.1 ou plus,
// avec cURL (le client des tests) et mbstring, comme sur un hebergement ordinaire. Chaque groupe tourne dans son processus, parce que
// les reglages du site sont des constantes.
//
//   1. la syntaxe de chaque fichier PHP livre ;
//   2. l'outil des comptes (ligne de commande : data/inc/compte.php) et le dossier des donnees (public/data, sinon ../data) ;
//   3. les fonctions du site sur un dossier de donnees temporaire (tests/php/unitaires.php) ;
//   4. le site par HTTP, sous `php -S` (tests/php/http.php) ;
//   5. ouvrir depuis une adresse et ses protections anti-SSRF, fonctions puis HTTP (tests/php/adresse.php).

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit(1);
}
if (version_compare(PHP_VERSION, '8.1.0', '<') || !function_exists('curl_init') || !function_exists('mb_strlen')) {
    fwrite(STDERR, "Les tests du site demandent PHP 8.1 ou plus, avec cURL et mbstring.\n");
    exit(1);
}

require __DIR__ . '/outils.php';

$depot = dirname(__DIR__, 2);
$echecs = 0;

/** Lance une commande, rend [code, sortie]. */
function executer(array $commande, string $entree = ''): array
{
    $p = proc_open($commande, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $tubes);
    fwrite($tubes[0], $entree);
    fclose($tubes[0]);
    $sortie = stream_get_contents($tubes[1]) . stream_get_contents($tubes[2]);
    return [proc_close($p), $sortie];
}

echo "Syntaxe des fichiers PHP livres\n";
$fichiers = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($depot . '/outils/site-php', FilesystemIterator::SKIP_DOTS));
$n = 0;
foreach ($fichiers as $f) {
    if ($f->getExtension() !== 'php') {
        continue;
    }
    $n++;
    [$code, $sortie] = executer([PHP_BINARY, '-l', $f->getPathname()]);
    if ($code !== 0) {
        $echecs++;
        echo '  ECHEC ' . $f->getPathname() . "\n        " . trim($sortie) . "\n";
    }
}
echo "  $n fichiers lus.\n";

echo "L'outil de ligne de commande des comptes, et le dossier des donnees dans les deux dispositions\n";
/** Une copie du site dans `$racine` : public/ et data/ (dedans si `$dedans`, a cote sinon). Rend le dossier des donnees. */
function copie_site(string $depot, string $racine, bool $dedans): string
{
    copier($depot . '/outils/site-php/public', $racine . '/public');
    $data = $dedans ? $racine . '/public/data' : $racine . '/data';
    copier($depot . '/outils/site-php/data', $data);
    return $data;
}
/** Lance l'outil des comptes avec ces lignes sur l'entree standard ; rend [code, sortie]. */
function outil_comptes(string $data, array $arguments, string $entree): array
{
    return executer(array_merge([PHP_BINARY, $data . '/inc/compte.php'], $arguments), $entree);
}
/** Le dossier des donnees que public/index.php choisit, tel qu'un script du site le voit. */
function data_dir(string $public): string
{
    $script = $public . '/lire-data-dir.php';
    file_put_contents($script, "<?php define('SVG_SITE', true); \$data = is_dir(__DIR__ . '/data') ? __DIR__ . '/data' : __DIR__ . '/../data'; require \$data . '/inc/amorce.php'; echo donnees();");
    [, $sortie] = executer([PHP_BINARY, $script]);
    unlink($script);
    return $sortie;
}
$t = sys_get_temp_dir() . '/site-outil-' . bin2hex(random_bytes(4));
$dataT = copie_site($depot, $t, false);
[$code, $sortie] = outil_comptes($dataT, ['--admin', '--stdin'], "admin@exemple.org\nAdmin\ncourt\nfr\n");
$attendus = [[$code === 1 && str_contains($sortie, 'au moins 10 caractères') && glob($dataT . '/comptes/*.json') === [], 'un mot de passe trop court est refuse, rien n est ecrit']];
[$code, $sortie] = outil_comptes($dataT, ['--admin', '--stdin'], "pas une adresse\nAdmin\nun mot de passe correct\nfr\n");
$attendus[] = [$code === 1 && str_contains($sortie, 'n’est pas valide') && glob($dataT . '/comptes/*.json') === [], 'une adresse invalide est refusee'];
[$code, $sortie] = outil_comptes($dataT, ['--admin', '--stdin'], "admin@exemple.org\nAdmin\nun mot de passe correct\nen\n");
$comptes = glob($dataT . '/comptes/*.json') ?: [];
$compte = $comptes === [] ? [] : (json_decode((string) file_get_contents($comptes[0]), true) ?: []);
$attendus[] = [$code === 0 && count($comptes) === 1 && ($compte['role'] ?? '') === 'admin' && ($compte['etat'] ?? '') === 'actif' && ($compte['langue'] ?? '') === 'en', 'l administrateur est cree, actif, dans sa langue : ' . trim($sortie)];
$attendus[] = [isset($compte['empreinte']) && password_verify('un mot de passe correct', $compte['empreinte']) && !str_contains((string) file_get_contents($comptes[0] ?: '/dev/null'), 'correct'), 'le mot de passe est en empreinte, jamais en clair'];
$attendus[] = [$comptes !== [] && ((fileperms($comptes[0]) & 0o077) === 0o040 || (fileperms($comptes[0]) & 0o077) === 0), 'le fichier du compte n est lisible que par son proprietaire et son groupe'];
$config = json_decode((string) @file_get_contents($dataT . '/config/config.json'), true);
$attendus[] = [($config['site']['langue'] ?? '') === 'en' && ($config['courrier']['expediteur'] ?? '') === 'admin@exemple.org', 'config.json est ecrit a l installation'];
[$code, $sortie] = outil_comptes($dataT, ['--admin', '--stdin'], "admin@exemple.org\nBis\nun autre mot de passe\n");
$attendus[] = [$code === 1 && str_contains($sortie, 'déjà cette adresse') && count(glob($dataT . '/comptes/*.json') ?: []) === 1, 'la meme adresse est refusee'];
[$code, $sortie] = outil_comptes($dataT, ['--admin', '--stdin'], "second@exemple.org\nSecond\nun autre mot de passe\n");
$attendus[] = [$code === 0 && count(glob($dataT . '/comptes/*.json') ?: []) === 2, 'un second administrateur s ajoute (langue fr par defaut)'];
[$code, $sortie] = outil_comptes($dataT, ['--mot-de-passe', 'admin@exemple.org', '--stdin'], "le mot de passe change\n");
$compte = json_decode((string) file_get_contents($comptes[0]), true);
$attendus[] = [$code === 0 && password_verify('le mot de passe change', $compte['empreinte'] ?? ''), 'le mot de passe se change en ligne de commande'];
[$code, $sortie] = outil_comptes($dataT, ['--mot-de-passe', 'inconnu@exemple.org', '--stdin'], "le mot de passe change\n");
$attendus[] = [$code === 1 && str_contains($sortie, 'Aucun compte'), 'une adresse inconnue est refusee'];
[$code] = outil_comptes($dataT, [], '');
$attendus[] = [$code === 2, 'sans argument, l usage'];
$attendus[] = [data_dir($t . '/public') === realpath($t . '/data'), 'sans public/data, les donnees sont ../data (data/ hors de la racine web)'];
// La disposition livree : data/ dans public/, un seul dossier envoye par FTP.
$u = sys_get_temp_dir() . '/site-outil-' . bin2hex(random_bytes(4));
$dataU = copie_site($depot, $u, true);
$attendus[] = [data_dir($u . '/public') === realpath($u . '/public/data'), 'avec public/data, les donnees sont public/data (la disposition livree)'];
[$code] = outil_comptes($dataU, ['--admin', '--stdin'], "admin@exemple.org\nAdmin\nun mot de passe correct\n");
$attendus[] = [$code === 0 && count(glob($dataU . '/comptes/*.json') ?: []) === 1 && !file_exists($u . '/data'), 'l outil ecrit dans public/data, rien a cote'];
foreach ($attendus as [$ok, $nom]) {
    echo ($ok ? '  ok    ' : '  ECHEC ') . $nom . "\n";
    $echecs += $ok ? 0 : 1;
}
effacer($t);
effacer($u);

foreach (['unitaires.php', 'http.php', 'adresse.php'] as $groupe) {
    [$code, $sortie] = executer([PHP_BINARY, __DIR__ . '/' . $groupe]);
    echo $sortie;
    $echecs += $code === 0 ? 0 : 1;
}

echo $echecs === 0 ? "Tests PHP : tout est vert.\n" : "Tests PHP : $echecs echec(s).\n";
exit($echecs === 0 ? 0 : 1);
