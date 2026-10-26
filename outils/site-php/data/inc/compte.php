<?php
// L'outil de ligne de commande des comptes (ADR-0041 §1) : creer un administrateur, changer un mot de passe. Depuis le dossier du
// site (celui d'index.php) :
//
//   php data/inc/compte.php --admin                      demande l'adresse, le nom, le mot de passe (deux fois, sans l'afficher), la langue
//   php data/inc/compte.php --admin --stdin              les lit sur l'entree standard, une par ligne : adresse, nom, mot de passe,
//                                                        langue (fr ou en ; facultative, fr par defaut), pour un script d'installation
//   php data/inc/compte.php --mot-de-passe <adresse>     demande le nouveau mot de passe de ce compte (deux fois)
//   php data/inc/compte.php --mot-de-passe <adresse> --stdin   le lit sur l'entree standard (une ligne)
//
// Tant qu'aucun compte n'existe, --admin fait l'installation complete (config.json, migration des projets d'un site d'avant,
// suppression du mot de passe unique) ; ensuite, il ajoute un administrateur actif. Changer un mot de passe ferme les sessions du
// compte a leur requete suivante. Le mot de passe n'est jamais affiche ni journalise. Ce fichier ne fait rien hors de la ligne de
// commande.

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

define('SVG_SITE', true);
require __DIR__ . '/amorce.php';

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

function lire_ligne(string $invite): string
{
    fwrite(STDOUT, $invite);
    return trim((string) fgets(STDIN));
}

function echouer(string $message): never
{
    fwrite(STDERR, $message . "\n");
    exit(1);
}

$probleme = preparer_donnees();
if ($probleme !== null) {
    echouer($probleme);
}
$stdin = in_array('--stdin', $argv, true);

if (in_array('--admin', $argv, true)) {
    if ($stdin) {
        $email = trim((string) fgets(STDIN));
        $nom = trim((string) fgets(STDIN));
        $mot = rtrim((string) fgets(STDIN), "\r\n");
        $langue = trim((string) fgets(STDIN));
    } else {
        $email = lire_ligne('Adresse de courrier : ');
        $nom = lire_ligne('Nom : ');
        $mot = lire_cache('Mot de passe : ');
        if ($mot !== lire_cache('Le même, de nouveau : ')) {
            echouer('Les deux saisies diffèrent : rien n’est changé.');
        }
        $langue = lire_ligne('Langue (fr ou en, fr par défaut) : ');
    }
    $langue = $langue === '' ? 'fr' : $langue;
    $r = comptes_existent() ? creer_compte($email, $nom, $mot, $langue, 'admin', 'actif') : installer_administrateur($email, $nom, $mot, $langue);
    if (isset($r['erreur'])) {
        echouer($r['message'] . ' Rien n’est changé.');
    }
    fwrite(STDOUT, 'Administrateur créé : ' . $r['compte']['email'] . ' (' . $r['compte']['id'] . ")\n");
    exit(0);
}

$i = array_search('--mot-de-passe', $argv, true);
if ($i !== false) {
    $email = (string) ($argv[$i + 1] ?? '');
    $compte = compte_par_email($email);
    if ($compte === null) {
        echouer('Aucun compte ne porte cette adresse.');
    }
    if ($stdin) {
        $mot = rtrim((string) fgets(STDIN), "\r\n");
    } else {
        $mot = lire_cache('Nouveau mot de passe : ');
        if ($mot !== lire_cache('Le même, de nouveau : ')) {
            echouer('Les deux saisies diffèrent : rien n’est changé.');
        }
    }
    $refus = mot_de_passe_refuse($mot);
    if ($refus !== null) {
        echouer($refus . ' : rien n’est changé.');
    }
    poser_mot_de_passe_compte($compte['id'], $mot);
    journaliser('connexions', 'mot de passe change en ligne de commande compte=' . $compte['id']);
    fwrite(STDOUT, 'Mot de passe changé pour ' . $compte['email'] . " ; ses sessions ouvertes se ferment à leur prochaine requête.\n");
    exit(0);
}

fwrite(STDERR, "Usage : php data/inc/compte.php --admin [--stdin] | --mot-de-passe <adresse> [--stdin]\n");
exit(2);
