<?php
// Les reglages du site (ADR-0030, docs/deploiement-php.md). Ne modifiez pas ce fichier : une mise a jour le remplace. Posez vos
// reglages dans config.local.php, a cote (jamais livre, donc jamais ecrase) : chaque constante n'est definie ici que si
// config.local.php ne l'a pas deja fait. Exemple :
//
//   <?php
//   define('DATA_DIR', __DIR__ . '/data');      // un hebergeur qui impose tout sous la racine web
//   define('SESSION_INACTIVITE', 3600);
//
// Ce fichier ne produit rien : demande directement, il ne dit rien.

declare(strict_types=1);

if (!defined('SVG_SITE')) {
    http_response_code(404);
    exit;
}

if (is_file(__DIR__ . '/config.local.php')) {
    require __DIR__ . '/config.local.php';
}

// Le dossier des donnees : mot de passe, projets, polices, JSON, journaux, sessions. Par defaut A COTE de la racine web (public/),
// hors de portee du navigateur. Un hebergeur qui impose tout sous la racine : `__DIR__ . '/data'`, et le .htaccess de data/
// refuse alors tout acces direct (index.php verifie qu'il le fait, et avertit sinon).
defined('DATA_DIR') || define('DATA_DIR', __DIR__ . '/../data');

// La session expire apres ce temps sans aucune requete (en secondes).
defined('SESSION_INACTIVITE') || define('SESSION_INACTIVITE', 2 * 3600);

// Les essais de connexion libres par client, puis le delai double a chaque echec, jusqu'a ce plafond (en secondes).
defined('CONNEXION_ESSAIS_LIBRES') || define('CONNEXION_ESSAIS_LIBRES', 3);
defined('CONNEXION_DELAI_MAX') || define('CONNEXION_DELAI_MAX', 15 * 60);

// La taille maximale d'un projet enregistre (le JSON entier, polices deposees et image source comprises). Le serveur doit accepter
// une requete de cette taille : `post_max_size` de PHP (8 Mo par defaut), `LimitRequestBody` d'Apache, `client_max_body_size` de nginx.
defined('PROJET_OCTETS_MAX') || define('PROJET_OCTETS_MAX', 32 * 1024 * 1024);
// La vignette d'un projet (le SVG du dessin, montre dans la liste) : au-dela, la liste montre une case vide.
defined('VIGNETTE_OCTETS_MAX') || define('VIGNETTE_OCTETS_MAX', 256 * 1024);

// Les sources des polices du catalogue, que le serveur (et lui seul) contacte la premiere fois qu'une police est choisie, avant de
// la ranger dans data/font. Les memes prefixes que la page autonome (src/model/sourcesPolices.ts) ; un test les remplace par un
// petit serveur local.
defined('POLICES_SOURCES') || define('POLICES_SOURCES', [
    'jsdelivr' => 'https://cdn.jsdelivr.net/npm/@fontsource/',
    'bunny' => 'https://fonts.bunny.net/',
    'gitlab' => 'https://gitlab.com/api/v4/projects/',
    'fontshare' => 'https://cdn.fontshare.com/wf/',
]);
defined('POLICE_OCTETS_MAX') || define('POLICE_OCTETS_MAX', 8 * 1024 * 1024);

// Vrai derriere un mandataire qui termine HTTPS sans le dire a PHP : le cookie de session part alors toujours en `Secure`.
defined('HTTPS_FORCE') || define('HTTPS_FORCE', false);
