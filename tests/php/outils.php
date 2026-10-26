<?php
// Le petit lanceur des tests PHP du site (ADR-0030) : sans dependance (ni PHPUnit ni composer), parce que le site n'en a aucune et
// qu'un hebergement mutualise n'en aura pas davantage ; quelques fonctions suffisent a dire ce qui est attendu et ce qui ne l'est pas.
// Les tests se lancent par `php tests/php/lancer.php` (npm run test:php).

declare(strict_types=1);

final class EchecTest extends Exception
{
}

$GLOBALS['tests'] = [];

function test(string $nom, callable $faire): void
{
    $GLOBALS['tests'][] = [$nom, $faire];
}

function affirmer(bool $vrai, string $message): void
{
    if (!$vrai) {
        throw new EchecTest($message);
    }
}

function egal(mixed $attendu, mixed $obtenu, string $message = ''): void
{
    if ($attendu !== $obtenu) {
        throw new EchecTest(($message !== '' ? $message . ' : ' : '') . 'attendu ' . var_export($attendu, true) . ', obtenu ' . var_export($obtenu, true));
    }
}

function contient(string $aiguille, string $meule, string $message = ''): void
{
    if (!str_contains($meule, $aiguille)) {
        throw new EchecTest(($message !== '' ? $message . ' : ' : '') . '« ' . $aiguille . ' » absent de « ' . mb_substr($meule, 0, 400) . ' »');
    }
}

/** Lance les tests enregistres ; rend le nombre d'echecs. */
function lancer_tests(string $groupe): int
{
    $echecs = 0;
    foreach ($GLOBALS['tests'] as [$nom, $faire]) {
        try {
            $faire();
            echo "  ok    $nom\n";
        } catch (Throwable $e) {
            $echecs++;
            echo "  ECHEC $nom\n        " . $e->getMessage() . ($e instanceof EchecTest ? '' : ' (' . $e::class . ' ' . basename($e->getFile()) . ':' . $e->getLine() . ')') . "\n";
        }
    }
    echo $groupe . ' : ' . count($GLOBALS['tests']) . ' tests, ' . $echecs . " echec(s).\n";
    $GLOBALS['tests'] = [];
    return $echecs;
}

/** Un dossier temporaire neuf. */
function dossier_temporaire(string $prefixe): string
{
    $d = sys_get_temp_dir() . '/' . $prefixe . '-' . bin2hex(random_bytes(6));
    mkdir($d, 0700, true);
    return $d;
}

function effacer(string $chemin): void
{
    if (is_link($chemin) || is_file($chemin)) {
        unlink($chemin);
        return;
    }
    if (!is_dir($chemin)) {
        return;
    }
    foreach (scandir($chemin) ?: [] as $n) {
        if ($n !== '.' && $n !== '..') {
            effacer($chemin . '/' . $n);
        }
    }
    rmdir($chemin);
}

function copier(string $source, string $cible): void
{
    if (is_dir($source)) {
        if (!is_dir($cible)) {
            mkdir($cible, 0700, true);
        }
        foreach (scandir($source) ?: [] as $n) {
            if ($n !== '.' && $n !== '..') {
                copier($source . '/' . $n, $cible . '/' . $n);
            }
        }
        return;
    }
    copy($source, $cible);
}

/** Un port libre de la boucle locale. */
function port_libre(): int
{
    $s = stream_socket_server('tcp://127.0.0.1:0');
    $nom = stream_socket_get_name($s, false);
    fclose($s);
    return (int) substr((string) $nom, strrpos((string) $nom, ':') + 1);
}

/**
 * Un serveur `php -S` sur `$racine`, arrete a la fin du processus. Rend son adresse. `$routeur` : inc/serveur-local.php, qui imite
 * les .htaccess ; plusieurs travailleurs quand le site doit se demander a lui-meme si data/ se lit par HTTP.
 */
function serveur_php(string $racine, ?string $routeur = null, int $travailleurs = 1): string
{
    $port = port_libre();
    $journal = sys_get_temp_dir() . '/serveur-php-' . $port . '.log';
    $commande = array_merge([PHP_BINARY, '-S', '127.0.0.1:' . $port, '-t', $racine], $routeur === null ? [] : [$routeur]);
    $env = $travailleurs > 1 ? array_merge(getenv(), ['PHP_CLI_SERVER_WORKERS' => (string) $travailleurs]) : null;
    $p = proc_open($commande, [0 => ['pipe', 'r'], 1 => ['file', $journal, 'a'], 2 => ['file', $journal, 'a']], $tubes, null, $env);
    if (!is_resource($p)) {
        throw new RuntimeException('php -S ne demarre pas');
    }
    register_shutdown_function(function () use ($p): void { proc_terminate($p); proc_close($p); });
    $adresse = 'http://127.0.0.1:' . $port;
    for ($i = 0; $i < 100; $i++) {
        $c = @fsockopen('127.0.0.1', $port, $no, $err, 0.1);
        if ($c) {
            fclose($c);
            return $adresse;
        }
        usleep(50000);
    }
    throw new RuntimeException('php -S ne repond pas sur ' . $adresse);
}

/** Un client HTTP qui garde ses cookies, comme un navigateur (un fichier de cookies par client). */
final class Client
{
    private string $jar;

    public function __construct(private string $base)
    {
        $this->jar = tempnam(sys_get_temp_dir(), 'cookies-');
    }

    /** Rend [statut, en-tetes (minuscules), corps]. */
    public function requete(string $methode, string $chemin, array $entetes = [], ?string $corps = null): array
    {
        $c = curl_init($this->base . '/' . ltrim($chemin, '/'));
        $recus = [];
        curl_setopt_array($c, [
            CURLOPT_CUSTOMREQUEST => $methode, CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $this->jar, CURLOPT_COOKIEFILE => $this->jar,
            CURLOPT_HTTPHEADER => $entetes, CURLOPT_FOLLOWLOCATION => false, CURLOPT_TIMEOUT => 30,
            CURLOPT_HEADERFUNCTION => function ($c, string $ligne) use (&$recus): int {
                $morceaux = explode(':', $ligne, 2);
                if (count($morceaux) === 2) {
                    $recus[strtolower(trim($morceaux[0]))] = trim($morceaux[1]);
                }
                return strlen($ligne);
            },
        ]);
        if ($corps !== null) {
            curl_setopt($c, CURLOPT_POSTFIELDS, $corps);
        }
        $texte = curl_exec($c);
        $statut = (int) curl_getinfo($c, CURLINFO_RESPONSE_CODE);
        return [$statut, $recus, is_string($texte) ? $texte : ''];
    }

    public function get(string $chemin, array $entetes = []): array
    {
        return $this->requete('GET', $chemin, $entetes);
    }

    /** Un formulaire, comme le navigateur l'envoie. */
    public function formulaire(string $chemin, array $champs): array
    {
        return $this->requete('POST', $chemin, ['Content-Type: application/x-www-form-urlencoded'], http_build_query($champs));
    }

    /** Une ecriture de l'API : du JSON, et le jeton CSRF quand on le donne. */
    public function ecrire(string $chemin, mixed $corps, ?string $csrf, array $entetes = []): array
    {
        $h = array_merge(['Content-Type: application/json'], $csrf === null ? [] : ['X-CSRF: ' . $csrf], $entetes);
        return $this->requete('POST', $chemin, $h, is_string($corps) ? $corps : json_encode($corps));
    }

    /** Le jeton CSRF que porte la page (formulaire de connexion ou conteneur de l'application). */
    public function jeton(): string
    {
        [, , $page] = $this->get('index.php');
        return preg_match('/(?:name="csrf" value|data-csrf)="([a-f0-9]{64})"/', $page, $m) === 1 ? $m[1] : '';
    }

    public function connecter(string $mot): array
    {
        return $this->formulaire('index.php', ['action' => 'connexion', 'csrf' => $this->jeton(), 'mot_de_passe' => $mot]);
    }
}
