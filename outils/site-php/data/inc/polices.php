<?php
// Les donnees et les polices servies par le site (ADR-0030). Les JSON sortis des annexes (data/json : bibliotheques, index et
// apercus des polices, liste des fontes livrees) et les fontes livrees (data/font) se servent avec leur ETag. Une police du
// catalogue se demande par l'empreinte sha256 de son fichier : le serveur la sert de data/font/catalogue, ou la premiere fois la
// telecharge depuis la source que l'index designe (jsDelivr, repli Bunny ; GitLab, Fontshare), verifie son empreinte, la range et la
// sert. Le navigateur ne contacte que le site ; une empreinte absente de l'index est refusee avant toute requete.

declare(strict_types=1);

defined('SVG_SITE') || exit;

const MOTIF_SHA256 = '/^[A-Za-z0-9+\/]{43}=$/';

function servir_json(mixed $nom): never
{
    if (!is_string($nom) || preg_match('/^[a-z0-9-]{1,40}$/', $nom) !== 1 || !is_file(donnees('json/' . $nom . '.json'))) {
        repondre_erreur(404, 'introuvable', t('Ces données sont introuvables sur le serveur.'));
    }
    $f = donnees('json/' . $nom . '.json');
    servir_fichier($f, 'application/json; charset=utf-8', '"' . sha1_file($f) . '"', 'private, no-cache');
}

function servir_fonte(mixed $fichier): never
{
    if (!is_string($fichier) || preg_match('/^[a-z0-9-]{1,40}\.(ttf|otf|woff)$/', $fichier, $m) !== 1 || !is_file(donnees('font/' . $fichier))) {
        repondre_erreur(404, 'introuvable', t('Cette fonte est introuvable sur le serveur.'));
    }
    $f = donnees('font/' . $fichier);
    servir_fichier($f, ['ttf' => 'font/ttf', 'otf' => 'font/otf', 'woff' => 'font/woff'][$m[1]], '"' . sha1_file($f) . '"', 'private, max-age=86400');
}

/** L'empreinte sha256 (base64) d'octets. */
function sha256_b64(string $octets): string
{
    return base64_encode(hash('sha256', $octets, true));
}

/** Le type d'un fichier de fonte d'apres ses premiers octets. */
function type_fonte(string $debut): string
{
    return match (substr($debut, 0, 4)) {
        'wOFF' => 'font/woff',
        'OTTO' => 'font/otf',
        default => 'font/ttf',
    };
}

/**
 * Le fichier de l'index qui porte cette empreinte : sa famille, sa variante et son sous-ensemble (le latin, le latin etendu, ou le
 * fichier complet d'un depot qui ne decoupe pas). Les versions remplacees (`anciennes`) comptent : un projet d'hier se recompose.
 */
function trouver_dans_catalogue(string $sha): ?array
{
    $f = donnees('json/polices-catalogue.json');
    $c = is_file($f) ? json_decode((string) file_get_contents($f), true) : null;
    if (!is_array($c)) {
        return null;
    }
    foreach (array_merge($c['familles'] ?? [], $c['anciennes'] ?? []) as $famille) {
        if (!is_array($famille) || !is_array($famille['variantes'] ?? null)) {
            continue;
        }
        foreach ($famille['variantes'] as $v) {
            if (!is_array($v) || count($v) < 4) {
                continue;
            }
            if (($v[2] ?? null) === $sha) {
                return [$famille, $v, ($famille['depot'] ?? '') === 'fontsource' ? 'latin' : 'complet'];
            }
            if (($v[3] ?? null) === $sha) {
                return [$famille, $v, 'latin-ext'];
            }
        }
    }
    return null;
}

/**
 * Les adresses d'un fichier dans l'ordre ou on les essaie : le calcul de la page (src/model/cataloguePolices.ts, `adressesFichier`),
 * avec les prefixes de POLICES_SOURCES. Chaque morceau de l'index est reverifie : un index altere ne fabrique pas d'adresse.
 */
function adresses_fichier(array $f, array $v, string $sous): array
{
    $s = POLICES_SOURCES;
    $id = (string) ($f['id'] ?? '');
    $version = (string) ($f['version'] ?? '');
    $poids = $v[0] ?? null;
    if (!is_int($poids) || !in_array($v[1] ?? null, [0, 1], true)) {
        return [];
    }
    $style = $v[1] === 1 ? 'italic' : 'normal';
    $a = [];
    $depot = $f['depot'] ?? '';
    if ($depot === 'fontsource' && preg_match('/^[a-z0-9][a-z0-9-]{0,63}$/', $id) && preg_match('/^\d{1,4}\.\d{1,4}\.\d{1,4}$/', $version)) {
        $nom = $id . '-' . $sous . '-' . $poids . '-' . $style . '.woff';
        $a[] = $s['jsdelivr'] . $id . '@' . $version . '/files/' . $nom;
        $a[] = $s['bunny'] . $id . '/files/' . $nom;
    } elseif ($depot === 'velvetyne' && is_string($v[4] ?? null) && preg_match('/^\d{1,12}$/', (string) ($f['projet'] ?? '')) && preg_match('/^[0-9a-f]{40}$/', $version)) {
        $a[] = $s['gitlab'] . $f['projet'] . '/repository/files/' . rawurlencode($v[4]) . '/raw?ref=' . $version;
    } elseif ($depot === 'fontshare' && is_string($v[4] ?? null) && preg_match('/^[A-Z0-9]{32}\/[A-Z0-9]{32}\/[A-Z0-9]{32}\.woff$/', $v[4])) {
        $a[] = $s['fontshare'] . $v[4];
    }
    return array_values(array_filter($a, fn(string $u): bool => !str_contains($u, '..') && preg_match('#^https?://#', $u) === 1));
}

/** Les octets d'une adresse, bornes a POLICE_OCTETS_MAX, sans suivre de redirection ; null au moindre ecart. */
function telecharger(string $url): ?string
{
    if (function_exists('curl_init')) {
        $c = curl_init($url);
        $octets = '';
        curl_setopt_array($c, [
            CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 30, CURLOPT_USERAGENT => 'editeur-svg-site',
            CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_WRITEFUNCTION => function ($c, string $morceau) use (&$octets): int {
                $octets .= $morceau;
                return strlen($octets) > POLICE_OCTETS_MAX ? 0 : strlen($morceau);
            },
        ]);
        $ok = curl_exec($c);
        $code = (int) curl_getinfo($c, CURLINFO_RESPONSE_CODE);
        unset($c);
        return $ok === true && $code === 200 && strlen($octets) <= POLICE_OCTETS_MAX ? $octets : null;
    }
    $contexte = stream_context_create(['http' => ['follow_location' => 0, 'timeout' => 30, 'ignore_errors' => true, 'user_agent' => 'editeur-svg-site']]);
    $octets = @file_get_contents($url, false, $contexte, 0, POLICE_OCTETS_MAX + 1);
    $statut = isset($http_response_header[0]) && preg_match('#^HTTP/\S+\s+200\b#', $http_response_header[0]) === 1;
    return is_string($octets) && $statut && strlen($octets) <= POLICE_OCTETS_MAX ? $octets : null;
}

/**
 * Le fichier d'une police du catalogue, par son empreinte : depuis data/font/catalogue s'il y est (et a la bonne empreinte), sinon
 * telecharge, verifie et range. Rend ['chemin'] ou ['statut', 'erreur', 'message'].
 */
function police_du_catalogue(mixed $sha): array
{
    if (!is_string($sha) || preg_match(MOTIF_SHA256, $sha) !== 1) {
        return ['statut' => 400, 'erreur' => 'invalide', 'message' => t('Cette empreinte de police est mal formée.')];
    }
    $chemin = donnees('font/catalogue/' . bin2hex((string) base64_decode($sha, true)) . '.fonte');
    if (is_file($chemin) && sha256_b64((string) file_get_contents($chemin)) === $sha) {
        return ['chemin' => $chemin];
    }
    $trouve = trouver_dans_catalogue($sha);
    if ($trouve === null) {
        journaliser('polices', 'refus hors index sha=' . $sha);
        return ['statut' => 404, 'erreur' => 'hors_index', 'message' => t('Cette police n’est pas dans l’index du site : le serveur ne la télécharge pas.')];
    }
    [$famille, $variante, $sous] = $trouve;
    foreach (adresses_fichier($famille, $variante, $sous) as $url) {
        $octets = telecharger($url);
        if ($octets === null) {
            journaliser('polices', 'echec ' . $url);
            continue;
        }
        if (sha256_b64($octets) !== $sha) {
            journaliser('polices', 'empreinte fausse ' . $url);
            continue;
        }
        ecrire_atomique($chemin, $octets, 0640);
        journaliser('polices', 'rangee ' . $url);
        return ['chemin' => $chemin];
    }
    return ['statut' => 502, 'erreur' => 'source', 'message' => t('Le site n’a pas pu télécharger cette police depuis sa source (ou le fichier reçu n’avait pas l’empreinte attendue).')];
}

function servir_police_catalogue(mixed $sha): never
{
    $r = police_du_catalogue($sha);
    if (isset($r['statut'])) {
        repondre_erreur((int) $r['statut'], (string) $r['erreur'], (string) $r['message']);
    }
    $debut = (string) file_get_contents($r['chemin'], false, null, 0, 4);
    // Le meme fichier pour la meme empreinte, toujours : le navigateur peut le garder.
    servir_fichier($r['chemin'], type_fonte($debut), '"' . (string) $sha . '"', 'private, max-age=31536000, immutable');
}
