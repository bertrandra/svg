<?php
// Pose le mot de passe du site (ADR-0030) : son empreinte (`password_hash`, argon2id quand PHP l'a, bcrypt sinon) dans data/pwd,
// jamais le mot de passe lui-meme. En ligne de commande seulement :
//
//   php outils/mot-de-passe.php            demande le mot de passe deux fois, sans l'afficher
//   php outils/mot-de-passe.php --stdin    le lit sur l'entree standard (une ligne), pour un script d'installation
//
// Relancer l'outil change le mot de passe ; les sessions ouvertes restent valides jusqu'a leur expiration.

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

define('SVG_SITE', true);
require __DIR__ . '/../public/inc/amorce.php';
require __DIR__ . '/../public/inc/connexion.php';

const LONGUEUR_MIN = 10;

function lire_cache(string $invite): string
{
    fwrite(STDOUT, $invite);
    $tty = function_exists('posix_isatty') && posix_isatty(STDIN);
    if ($tty) {
        shell_exec('stty -echo');
    }
    $ligne = fgets(STDIN);
    if ($tty) {
        shell_exec('stty echo');
        fwrite(STDOUT, "\n");
    }
    return rtrim((string) $ligne, "\r\n");
}

$stdin = in_array('--stdin', $argv, true);
if ($stdin) {
    $mot = rtrim((string) fgets(STDIN), "\r\n");
} else {
    $mot = lire_cache('Mot de passe du site : ');
    if ($mot !== lire_cache('Le même, de nouveau : ')) {
        fwrite(STDERR, "Les deux saisies diffèrent : rien n’est changé.\n");
        exit(1);
    }
}
if (mb_strlen($mot) < LONGUEUR_MIN) {
    fwrite(STDERR, 'Le mot de passe doit compter au moins ' . LONGUEUR_MIN . " caractères : rien n’est changé.\n");
    exit(1);
}

$racine = donnees();
if (!is_dir($racine) && !mkdir($racine, 0750, true) && !is_dir($racine)) {
    fwrite(STDERR, 'Le dossier des données (' . $racine . ") ne peut pas être créé.\n");
    exit(1);
}
try {
    poser_mot_de_passe($mot);
} catch (Throwable $e) {
    fwrite(STDERR, 'L’empreinte n’a pas pu être écrite dans ' . fichier_mot_de_passe() . ' : ' . $e->getMessage() . "\n");
    exit(1);
}
$algo = password_get_info(trim((string) file_get_contents(fichier_mot_de_passe())))['algoName'];
fwrite(STDOUT, 'Mot de passe enregistré : ' . fichier_mot_de_passe() . ' (empreinte ' . $algo . ").\n");
fwrite(STDOUT, "Vérifiez que le serveur web peut lire ce fichier, et que personne d’autre ne le peut (chmod 640, propriétaire ou groupe du serveur).\n");
