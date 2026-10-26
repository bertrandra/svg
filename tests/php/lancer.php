<?php
// Lance les tests PHP du site (ADR-0030) : `php tests/php/lancer.php`, ou `npm run test:php`. Sans dependance : PHP 8.1 ou plus,
// avec cURL (le client des tests) et mbstring, comme sur un hebergement ordinaire. Chaque groupe tourne dans son processus, parce que
// les reglages du site sont des constantes.
//
//   1. la syntaxe de chaque fichier PHP livre ;
//   2. l'outil du mot de passe (ligne de commande) et le dossier des donnees par defaut (public/data, sinon ../data) ;
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

echo "L'outil du mot de passe, et le dossier des donnees par defaut dans les deux dispositions\n";
/** Une copie de ce que l'outil et les reglages lisent, dans `$public` ; `data/` dedans si `$dedans`. */
function copie_outil(string $depot, string $public, bool $dedans): void
{
    mkdir($public . '/inc', 0700, true);
    foreach (['config.php', 'inc/amorce.php', 'inc/connexion.php', 'inc/mot-de-passe.php'] as $f) {
        copy($depot . '/outils/site-php/public/' . $f, $public . '/' . $f);
    }
    if ($dedans) {
        mkdir($public . '/data', 0700);
    }
}
/** Le DATA_DIR que config.php choisit, tel qu'un script du site le voit. */
function data_dir(string $public): string
{
    $script = $public . '/lire-data-dir.php';
    file_put_contents($script, "<?php define('SVG_SITE', true); require __DIR__ . '/config.php'; echo realpath(DATA_DIR) ?: DATA_DIR;");
    [, $sortie] = executer([PHP_BINARY, $script]);
    unlink($script);
    return $sortie;
}
$t = sys_get_temp_dir() . '/site-outil-' . bin2hex(random_bytes(4));
copie_outil($depot, $t . '/public', false);
$outil = $t . '/public/inc/mot-de-passe.php';
[$code, $sortie] = executer([PHP_BINARY, $outil, '--stdin'], "court\n");
$attendus = [[$code === 1 && str_contains($sortie, 'au moins 10 caractères') && !is_file($t . '/data/pwd'), 'un mot de passe trop court est refuse, rien n est ecrit']];
[$code, $sortie] = executer([PHP_BINARY, $outil, '--stdin'], "un mot de passe correct\n");
$empreinte = is_file($t . '/data/pwd') ? trim((string) file_get_contents($t . '/data/pwd')) : '';
$attendus[] = [$code === 0 && password_verify('un mot de passe correct', $empreinte) && !str_contains($empreinte, 'correct'), 'le mot de passe est pose en empreinte dans data/pwd, jamais en clair'];
$attendus[] = [is_file($t . '/data/pwd') && ((fileperms($t . '/data/pwd') & 0o077) === 0o040 || (fileperms($t . '/data/pwd') & 0o077) === 0), 'data/pwd n est lisible que par son proprietaire et son groupe'];
$attendus[] = [data_dir($t . '/public') === realpath($t . '/data'), 'sans public/data, DATA_DIR est ../data (data/ hors de la racine web)'];
// La disposition livree : data/ dans public/, un seul dossier envoye par FTP.
$u = sys_get_temp_dir() . '/site-outil-' . bin2hex(random_bytes(4));
copie_outil($depot, $u . '/public', true);
$attendus[] = [data_dir($u . '/public') === realpath($u . '/public/data'), 'avec public/data, DATA_DIR est public/data (la disposition livree)'];
[$code] = executer([PHP_BINARY, $u . '/public/inc/mot-de-passe.php', '--stdin'], "un autre mot de passe\n");
$attendus[] = [$code === 0 && is_file($u . '/public/data/pwd') && !file_exists($u . '/data'), 'l outil ecrit data/pwd dans public/data, rien a cote'];
file_put_contents($u . '/public/config.local.php', "<?php define('DATA_DIR', " . var_export($t . '/data', true) . ');');
$attendus[] = [data_dir($u . '/public') === realpath($t . '/data'), 'config.local.php fixe toujours DATA_DIR'];
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
