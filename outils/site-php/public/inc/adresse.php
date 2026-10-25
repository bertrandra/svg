<?php
// Ouvrir depuis une adresse (ADR-0036) : le serveur va chercher un fichier pour la personne connectee, ce qui contourne le refus
// de lecture entre origines (CORS) qu'opposent beaucoup de sites a une page. C'est donc une requete que le serveur emet sur ordre
// d'un client : tout ce qui suit protege le reseau du serveur (falsification de requete cote serveur, SSRF ; docs/securite.md § 10).
//
//   - https seulement (http si ADRESSE_HTTP), un port de ADRESSE_PORTS, un nom d'hote ou une adresse IP litterale, ni identifiant
//     ni mot de passe, aucun caractere hors de l'ASCII visible (ni blanc, ni barre oblique inverse) : l'adresse que cURL lit est
//     celle qu'on a verifiee, recomposee a partir de ses morceaux ;
//   - le nom est resolu ICI, et TOUTES ses adresses doivent etre publiques : ni privee, ni bouclage, ni lien-local, ni multicast,
//     ni reservee ou de documentation, en IPv4 comme en IPv6 (une IPv4 mappee, NAT64 ou 6to4 est jugee sur l'IPv4 qu'elle porte) ;
//   - cURL se connecte a l'adresse verifiee (CURLOPT_RESOLVE) : un DNS qui changerait de reponse entre la verification et la
//     connexion (rebinding) n'a aucun effet ; aucun mandataire (CURLOPT_PROXY vide) ne s'interpose ;
//   - les redirections se suivent a la main, 3 au plus, chacune revue comme la premiere (schema, port, resolution, adresses) ;
//   - le temps total et la taille sont bornes pendant le transfert (CURLOPT_PROGRESSFUNCTION, CURLOPT_WRITEFUNCTION) ;
//   - aucun cookie, aucun referent, un seul en-tete (Accept) et un agent neutre ;
//   - le journal ne garde que l'hote, la taille et le resultat : le chemin et les parametres d'une adresse peuvent porter un jeton.

declare(strict_types=1);

defined('SVG_SITE') || exit;

const ADRESSE_REDIRECTIONS_MAX = 3;
const ADRESSE_LONGUEUR_MAX = 2048;

/** Les reseaux IPv4 que le serveur ne contacte jamais (RFC 6890 et suivantes) : prives, bouclage, lien-local, partages, reserves. */
const RESEAUX_INTERDITS_V4 = [
    '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24',
    '192.31.196.0/24', '192.52.193.0/24', '192.88.99.0/24', '192.168.0.0/16', '192.175.48.0/24', '198.18.0.0/15', '198.51.100.0/24',
    '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4',
];
/**
 * En IPv6, seule la plage mondiale 2000::/3 est admise (ce qui ecarte ::, ::1, fc00::/7, fe80::/10, ff00::/8…), moins ces exceptions :
 * les attributions de protocole (Teredo, ORCHID, bancs d'essai), la documentation.
 */
const RESEAUX_INTERDITS_V6 = ['2001::/23', '2001:db8::/32', '3fff::/20'];

/** Un refus : son statut HTTP, son code, sa phrase. */
function adresse_refus(int $statut, string $code, string $message): array
{
    return ['statut' => $statut, 'erreur' => $code, 'message' => $message];
}

/** Vrai si les octets d'une adresse IP (4 ou 16) sont dans le reseau CIDR (de la meme famille). */
function ip_dans(string $octets, string $cidr): bool
{
    $morceaux = explode('/', $cidr, 2);
    $reseau = @inet_pton($morceaux[0]);
    if ($reseau === false || strlen($reseau) !== strlen($octets)) {
        return false;
    }
    $bits = isset($morceaux[1]) && preg_match('/^\d{1,3}$/', $morceaux[1]) === 1 ? (int) $morceaux[1] : strlen($reseau) * 8;
    if ($bits > strlen($reseau) * 8) {
        return false;
    }
    $pleins = intdiv($bits, 8);
    if (substr($octets, 0, $pleins) !== substr($reseau, 0, $pleins)) {
        return false;
    }
    $reste = $bits % 8;
    if ($reste === 0) {
        return true;
    }
    $masque = (0xff << (8 - $reste)) & 0xff;
    return (ord($octets[$pleins]) & $masque) === (ord($reseau[$pleins]) & $masque);
}

/**
 * Vrai si le serveur ne doit pas contacter cette adresse IP. `$permis` : des reseaux que l'administrateur autorise quand meme
 * (ADRESSE_RESEAUX_PERMIS). Une adresse illisible est interdite.
 */
function ip_interdite(string $ip, array $permis = []): bool
{
    $o = @inet_pton($ip);
    if ($o === false) {
        return true;
    }
    foreach ($permis as $cidr) {
        if (is_string($cidr) && ip_dans($o, $cidr)) {
            return false;
        }
    }
    if (strlen($o) === 4) {
        foreach (RESEAUX_INTERDITS_V4 as $c) {
            if (ip_dans($o, $c)) {
                return true;
            }
        }
        return false;
    }
    // Une IPv6 qui porte une IPv4 (mappee ::ffff:a.b.c.d, NAT64 64:ff9b::a.b.c.d, 6to4 2002:aabb:ccdd::) mene a cette IPv4.
    if (ip_dans($o, '::ffff:0:0/96') || ip_dans($o, '64:ff9b::/96')) {
        return ip_interdite((string) inet_ntop(substr($o, 12, 4)), $permis);
    }
    if (ip_dans($o, '2002::/16')) {
        return ip_interdite((string) inet_ntop(substr($o, 2, 4)), $permis);
    }
    if (!ip_dans($o, '2000::/3')) {
        return true;
    }
    foreach (RESEAUX_INTERDITS_V6 as $c) {
        if (ip_dans($o, $c)) {
            return true;
        }
    }
    return false;
}

/**
 * Vrai pour un nom d'hote DNS en ASCII (un nom international arrive deja en punycode, le navigateur l'y met), dont le dernier
 * label porte une lettre : « 2130706433 », « 0x7f.1 » ou « 127.1 », qu'un resolveur lirait comme une IPv4, sont refuses.
 */
function nom_hote_valide(string $hote): bool
{
    if (strlen($hote) > 253 || preg_match('/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.?$/', $hote) !== 1) {
        return false;
    }
    $labels = explode('.', rtrim($hote, '.'));
    return preg_match('/[a-z]/', (string) end($labels)) === 1 && preg_match('/^0x[0-9a-f]*$/', (string) end($labels)) !== 1;
}

/**
 * Decoupe et verifie une adresse : schema, hote, port, chemin. Rend ['schema', 'hote', 'port', 'chemin', 'ip'] (`ip` : l'adresse IP
 * litterale, ou null pour un nom), ou un refus.
 */
function adresse_decouper(mixed $url): array
{
    if (!is_string($url) || $url === '' || strlen($url) > ADRESSE_LONGUEUR_MAX || preg_match('/[^\x21-\x7e]/', $url) === 1 || str_contains($url, '\\')) {
        return adresse_refus(400, 'adresse_invalide', 'Cette adresse n’est pas valide : elle doit ressembler à « https://exemple.fr/dessin.svg ».');
    }
    $p = parse_url($url);
    $schema = is_array($p) && isset($p['scheme']) ? strtolower($p['scheme']) : (preg_match('/^([a-z][a-z0-9+.-]*):/i', $url, $m) === 1 ? strtolower($m[1]) : '');
    if ($schema === 'http' && !ADRESSE_HTTP) {
        return adresse_refus(403, 'schema', 'Ce site n’ouvre que les adresses « https:// » : un fichier envoyé en clair peut être modifié en chemin.');
    }
    if ($schema !== '' && $schema !== 'https' && $schema !== 'http') {
        return adresse_refus(403, 'schema', 'Seules les adresses web « https:// » s’ouvrent ici (« ' . $schema . ': » est refusé).');
    }
    if (!is_array($p) || $schema === '' || !isset($p['host'])) {
        return adresse_refus(400, 'adresse_invalide', 'Cette adresse n’est pas valide : elle doit ressembler à « https://exemple.fr/dessin.svg ».');
    }
    if (isset($p['user']) || isset($p['pass'])) {
        return adresse_refus(400, 'adresse_invalide', 'Une adresse qui porte un identifiant ou un mot de passe ne s’ouvre pas ici.');
    }
    $hote = strtolower($p['host']);
    $nu = str_starts_with($hote, '[') && str_ends_with($hote, ']') ? substr($hote, 1, -1) : $hote;
    $ip = filter_var($nu, FILTER_VALIDATE_IP) !== false ? $nu : null;
    if (($ip === null && !nom_hote_valide($nu)) || ($ip !== null && str_contains($ip, ':') && $nu === $hote)) {
        return adresse_refus(400, 'adresse_invalide', 'Le nom de serveur de cette adresse n’est pas valide.');
    }
    $port = $p['port'] ?? ($schema === 'https' ? 443 : 80);
    if (!in_array($port, ADRESSE_PORTS, true)) {
        return adresse_refus(403, 'port', 'Ce site n’ouvre que les adresses sur le port ' . implode(' ou ', ADRESSE_PORTS) . ' (ici : ' . $port . ').');
    }
    $chemin = $p['path'] ?? '';
    if ($chemin === '' || $chemin[0] !== '/') {
        $chemin = '/' . $chemin;
    }
    // Le fragment (#…) ne part jamais vers un serveur.
    return ['schema' => $schema, 'hote' => rtrim($nu, '.'), 'port' => $port, 'chemin' => $chemin . (isset($p['query']) ? '?' . $p['query'] : ''), 'ip' => $ip];
}

/** L'adresse recomposee de ses morceaux verifies : celle que cURL lira, port explicite. */
function adresse_recomposer(array $d): string
{
    $hote = $d['ip'] !== null && str_contains($d['ip'], ':') ? '[' . $d['ip'] . ']' : $d['hote'];
    return $d['schema'] . '://' . $hote . ':' . $d['port'] . $d['chemin'];
}

/**
 * Les adresses IP d'un nom (A puis AAAA). Les tests remplacent le DNS par une table (ADRESSE_RESOLUTION_ESSAI : nom => liste de
 * reponses successives, la derniere repetee), jamais definie en production ; un nom absent de la table ne se resout pas.
 */
function resoudre_nom(string $hote): array
{
    if (defined('ADRESSE_RESOLUTION_ESSAI')) {
        static $tours = [];
        $reponses = ADRESSE_RESOLUTION_ESSAI[$hote] ?? [[]];
        $i = $tours[$hote] ?? 0;
        $tours[$hote] = $i + 1;
        return array_values($reponses[min($i, count($reponses) - 1)] ?? []);
    }
    $ips = [];
    foreach ([DNS_A => 'ip', DNS_AAAA => 'ipv6'] as $type => $cle) {
        $r = @dns_get_record($hote, $type);
        foreach (is_array($r) ? $r : [] as $e) {
            if (is_array($e) && isset($e[$cle]) && is_string($e[$cle])) {
                $ips[] = $e[$cle];
            }
        }
    }
    if (!$ips) {
        $l = @gethostbynamel($hote);
        $ips = is_array($l) ? $l : [];
    }
    return array_values(array_unique($ips));
}

/** L'adresse IP a laquelle se connecter, apres verification de TOUTES celles du nom ; ou un refus. */
function adresse_ip_verifiee(array $d): string|array
{
    $ips = $d['ip'] !== null ? [$d['ip']] : resoudre_nom($d['hote']);
    if (!$ips) {
        return adresse_refus(502, 'injoignable', 'Le nom de serveur « ' . $d['hote'] . ' » ne se trouve pas : vérifiez l’adresse.');
    }
    foreach ($ips as $ip) {
        if (ip_interdite($ip, ADRESSE_RESEAUX_PERMIS)) {
            return adresse_refus(403, 'adresse_interdite', 'Cette adresse mène à un réseau privé, local ou réservé : le site ne la demande pas.');
        }
    }
    foreach ($ips as $ip) {
        if (!str_contains($ip, ':')) {
            return $ip;
        }
    }
    return $ips[0];
}

/** L'adresse d'une redirection (`Location`), absolue ou relative a l'adresse courante ; null si elle est illisible. */
function adresse_suivante(array $d, string $location): ?string
{
    $l = trim($location);
    if ($l === '' || strlen($l) > ADRESSE_LONGUEUR_MAX || preg_match('/[^\x21-\x7e]/', $l) === 1 || str_contains($l, '\\')) {
        return null;
    }
    if (preg_match('#^[a-z][a-z0-9+.-]*:#i', $l) === 1) {
        return $l;
    }
    if (str_starts_with($l, '//')) {
        return $d['schema'] . ':' . $l;
    }
    $origine = preg_replace('#^([a-z]+://[^/]+).*$#', '$1', adresse_recomposer($d));
    if (str_starts_with($l, '/')) {
        return $origine . $l;
    }
    $chemin = explode('?', $d['chemin'], 2)[0];
    if (str_starts_with($l, '?')) {
        return $origine . $chemin . $l;
    }
    return $origine . substr($chemin, 0, (int) strrpos($chemin, '/') + 1) . $l;
}

/**
 * Un saut : une requete GET a l'adresse verifiee, connectee a `$ip`, le corps d'une reponse 200 ecrit dans `$sortie`. Rend
 * ['code', 'location', 'octets'], ou un refus (delai, taille, serveur injoignable).
 */
function adresse_un_saut(array $d, string $ip, $sortie, float $fin): array
{
    $restant = (int) max(1, ($fin - microtime(true)) * 1000);
    $max = ADRESSE_OCTETS_MAX;
    $code = 0;
    $location = null;
    $octets = 0;
    $trop = false;
    $hors = false;
    $ignores = 0;
    $protocoles = ADRESSE_HTTP ? (CURLPROTO_HTTPS | CURLPROTO_HTTP) : CURLPROTO_HTTPS;
    $c = curl_init();
    curl_setopt_array($c, [
        CURLOPT_URL => adresse_recomposer($d),
        // La connexion va a l'adresse verifiee, et a elle seule : le nom n'est plus resolu par cURL.
        CURLOPT_RESOLVE => $d['ip'] === null ? [$d['hote'] . ':' . $d['port'] . ':' . (str_contains($ip, ':') ? '[' . $ip . ']' : $ip)] : [],
        CURLOPT_PROTOCOLS => $protocoles,
        CURLOPT_REDIR_PROTOCOLS => $protocoles,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROXY => '',
        CURLOPT_NOPROXY => '*',
        CURLOPT_HTTPGET => true,
        CURLOPT_HTTPHEADER => ['Accept: image/svg+xml, application/pdf, image/*;q=0.9, */*;q=0.5'],
        CURLOPT_USERAGENT => 'editeur-svg-site',
        CURLOPT_CONNECTTIMEOUT_MS => min(10000, $restant),
        CURLOPT_TIMEOUT_MS => $restant,
        CURLOPT_NOSIGNAL => true,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_HEADERFUNCTION => function ($c, string $ligne) use (&$code, &$location, &$trop, $max): int {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $ligne, $m) === 1) {
                $code = (int) $m[1];
                $location = null;
            } elseif (preg_match('/^location:\s*(.*)$/i', rtrim($ligne, "\r\n"), $m) === 1) {
                $location = $m[1];
            } elseif ($code === 200 && preg_match('/^content-length:\s*(\d+)/i', $ligne, $m) === 1 && (float) $m[1] > $max) {
                // Une taille annoncee trop grande : on coupe avant le premier octet du corps.
                $trop = true;
                return -1;
            }
            return strlen($ligne);
        },
        CURLOPT_WRITEFUNCTION => function ($c, string $morceau) use (&$code, &$octets, &$trop, &$ignores, $max, $sortie): int {
            $n = strlen($morceau);
            if ($code !== 200) {
                // Le corps d'une redirection ou d'une erreur ne sert a rien : lu, jete, borne a 64 Ko.
                $ignores += $n;
                return $ignores > 65536 ? 0 : $n;
            }
            $octets += $n;
            if ($octets > $max) {
                $trop = true;
                return 0;
            }
            return fwrite($sortie, $morceau) === $n ? $n : 0;
        },
        CURLOPT_NOPROGRESS => false,
        CURLOPT_PROGRESSFUNCTION => function ($c, $attendus, $recus) use ($fin, $max, &$trop, &$hors): int {
            if (microtime(true) > $fin) {
                $hors = true;
                return 1;
            }
            if ($recus > $max) {
                $trop = true;
                return 1;
            }
            return 0;
        },
    ]);
    curl_exec($c);
    $erreur = curl_errno($c);
    unset($c);
    if ($trop) {
        return adresse_refus(413, 'trop_gros', 'Ce fichier dépasse ' . round(ADRESSE_OCTETS_MAX / 1048576, 1) . ' Mo : il est trop gros pour être ouvert ici.');
    }
    if ($hors || $erreur === CURLE_OPERATION_TIMEDOUT) {
        return adresse_refus(504, 'delai', 'Le fichier n’est pas arrivé en ' . ADRESSE_DELAI . ' secondes : le site a arrêté le téléchargement.');
    }
    if ($erreur !== 0 && !($code !== 0 && $code !== 200 && $erreur === CURLE_WRITE_ERROR)) {
        $tls = in_array($erreur, [35, 51, 53, 54, 58, 59, 60, 64, 66, 77, 80, 82, 83, 90, 91], true);
        return adresse_refus(502, 'injoignable', $tls
            ? 'Le serveur de cette adresse n’a pas présenté de certificat valide : le site ne lit pas le fichier.'
            : 'Le serveur de cette adresse ne répond pas : vérifiez l’adresse, puis réessayez.');
    }
    return ['code' => $code, 'location' => $location, 'octets' => $octets];
}

/**
 * Telecharge une adresse dans `$sortie` (un flux), redirections suivies a la main et revues a chaque saut. Rend ['octets', 'hote',
 * 'sauts'], ou un refus.
 */
function telecharger_adresse(mixed $url, $sortie): array
{
    if (!function_exists('curl_init') || !defined('CURLOPT_RESOLVE')) {
        return adresse_refus(503, 'indisponible', 'Ce site ne peut pas ouvrir une adresse : l’extension cURL de PHP manque (voir docs/deploiement-php.md).');
    }
    $fin = microtime(true) + ADRESSE_DELAI;
    $courante = $url;
    for ($saut = 0; $saut <= ADRESSE_REDIRECTIONS_MAX; $saut++) {
        $d = adresse_decouper($courante);
        if (isset($d['statut'])) {
            return $d;
        }
        $ip = adresse_ip_verifiee($d);
        if (is_array($ip)) {
            return $ip;
        }
        ftruncate($sortie, 0);
        rewind($sortie);
        $r = adresse_un_saut($d, $ip, $sortie, $fin);
        if (isset($r['statut'])) {
            return $r;
        }
        if ($r['code'] === 200) {
            return ['octets' => $r['octets'], 'hote' => $d['hote'], 'sauts' => $saut];
        }
        if (in_array($r['code'], [301, 302, 303, 307, 308], true)) {
            $suivante = $r['location'] === null ? null : adresse_suivante($d, $r['location']);
            if ($suivante === null) {
                return adresse_refus(502, 'statut', 'Le serveur redirige vers une adresse illisible : le site ne la suit pas.');
            }
            $courante = $suivante;
            continue;
        }
        return adresse_refus(502, 'statut', 'Le serveur a répondu par une erreur (statut ' . $r['code'] . ')'
            . (in_array($r['code'], [404, 410], true) ? ' : aucun fichier à cette adresse.' : (in_array($r['code'], [401, 403], true) ? ' : ce fichier n’est pas public.' : ' : vérifiez l’adresse, puis réessayez.')));
    }
    return adresse_refus(502, 'redirections', 'Cette adresse redirige plus de ' . ADRESSE_REDIRECTIONS_MAX . ' fois : le site ne la suit pas plus loin.');
}

/** L'hote d'une adresse pour le journal (jamais son chemin ni ses parametres, qui peuvent porter un jeton), ou « ? ». */
function hote_pour_journal(mixed $url): string
{
    $h = is_string($url) ? parse_url($url, PHP_URL_HOST) : null;
    return is_string($h) && preg_match('/^[\[\]a-z0-9.:-]{1,255}$/i', $h) === 1 ? strtolower($h) : '?';
}

/** La route : le fichier, en octets bruts a lire comme un fichier depose ; ou l'erreur, en JSON, avec sa phrase. */
function servir_adresse(object $corps): never
{
    if (!ADRESSE_OUVERTURE) {
        repondre_erreur(404, 'indisponible', 'Ouvrir depuis une adresse est désactivé sur ce site.');
    }
    $url = $corps->adresse ?? null;
    @set_time_limit(ADRESSE_DELAI + 30);
    $sortie = fopen('php://temp/maxmemory:2097152', 'w+b');
    if ($sortie === false) {
        repondre_erreur(500, 'serveur', 'Le serveur a rencontré une erreur.');
    }
    $r = telecharger_adresse($url, $sortie);
    $hote = hote_pour_journal($url);
    if (isset($r['statut'])) {
        fclose($sortie);
        journaliser('adresses', 'hote=' . $hote . ' resultat=' . $r['erreur']);
        repondre_erreur((int) $r['statut'], (string) $r['erreur'], (string) $r['message']);
    }
    journaliser('adresses', 'hote=' . $hote . ($r['sauts'] > 0 ? ' final=' . $r['hote'] : '') . ' octets=' . $r['octets'] . ' resultat=ok');
    // Des octets a lire, jamais une page a afficher : ni type devine, ni rendu, ni cache.
    header('Content-Type: application/octet-stream');
    header('Content-Disposition: attachment; filename="fichier"');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
    header('Content-Length: ' . (string) $r['octets']);
    rewind($sortie);
    fpassthru($sortie);
    fclose($sortie);
    exit;
}
