<?php
// Les reponses de l'API (ADR-0030) : du JSON, jamais mis en cache, et une erreur toujours avec son code et sa phrase en francais.

declare(strict_types=1);

defined('SVG_SITE') || exit;

function repondre_json(int $statut, mixed $donnees, array $entetes = []): never
{
    http_response_code($statut);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    foreach ($entetes as $e) {
        header($e);
    }
    echo json_encode($donnees, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function repondre_erreur(int $statut, string $code, string $message, array $extra = []): never
{
    repondre_json($statut, ['erreur' => $code, 'message' => $message] + $extra);
}

/** Le resultat d'une operation sur un projet (projets.php) : sa fiche, ou son erreur avec son statut. */
function repondre_resultat(array $r): never
{
    if (isset($r['statut'])) {
        repondre_erreur((int) $r['statut'], (string) $r['erreur'], (string) $r['message'], isset($r['meta']) ? ['meta' => $r['meta']] : []);
    }
    repondre_json(200, $r);
}

/** Sert un fichier avec son ETag : un 304 quand le navigateur l'a deja. */
function servir_fichier(string $chemin, string $type, string $etag, string $cache, array $entetes = []): never
{
    header('ETag: ' . $etag);
    header('Cache-Control: ' . $cache);
    header('X-Content-Type-Options: nosniff');
    foreach ($entetes as $e) {
        header($e);
    }
    $vu = (string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? '');
    if ($vu !== '' && in_array($etag, array_map('trim', explode(',', $vu)), true)) {
        http_response_code(304);
        exit;
    }
    header('Content-Type: ' . $type);
    header('Content-Length: ' . (string) filesize($chemin));
    readfile($chemin);
    exit;
}
