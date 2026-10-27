<?php
// Les pages du site (ADR-0041) : installation de l'administrateur, connexion, inscription, confirmation, reinitialisation, puis
// l'application. Tout le code vit dans data/inc (data/ dans ce dossier, sinon a cote) ; ce fichier ne fait que l'appeler.

declare(strict_types=1);

define('SVG_SITE', true);
$data = is_dir(__DIR__ . '/data') ? __DIR__ . '/data' : __DIR__ . '/../data';
require $data . '/inc/amorce.php';
entree_index();
