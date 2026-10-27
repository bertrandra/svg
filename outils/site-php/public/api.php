<?php
// L'API du site (ADR-0030, ADR-0041) : les projets du compte connecte, les donnees de data/json, les fontes, les polices du
// catalogue, le compte, les comptes et les reglages (administrateur). Les routes sont decrites en tete de data/inc/entree-api.php.
// Tout le code vit dans data/inc (data/ dans ce dossier, sinon a cote) ; ce fichier ne fait que l'appeler.

declare(strict_types=1);

define('SVG_SITE', true);
$data = is_dir(__DIR__ . '/data') ? __DIR__ . '/data' : __DIR__ . '/../data';
require $data . '/inc/amorce.php';
entree_api();
