<?php
// Les reglages du site (ADR-0030, docs/deploiement-php.md). Aucun n'est a faire pour installer le site : tout a des valeurs par
// defaut. Ne modifiez pas ce fichier : une mise a jour le remplace. Posez vos reglages dans config.local.php, a cote (jamais livre,
// donc jamais ecrase) : chaque constante n'est definie ici que si config.local.php ne l'a pas deja fait. Exemple :
//
//   <?php
//   define('DATA_DIR', '/srv/editeur-svg/data');      // le dossier des donnees ailleurs
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

// Le dossier des donnees : mot de passe, projets, polices, JSON, journaux, sessions. Par defaut `data/` a cote de ce fichier, comme
// le livre le build : un seul dossier a envoyer par FTP. Sous la racine web, il ne tient que par son .htaccess (« Require all
// denied », reecrit s'il manque) ; index.php verifie par HTTP que data/pwd et data/password ne se lisent pas, et avertit sinon. Sans
// ce dossier, `../data`, hors de la racine web : la disposition recommandee quand on a la main sur le serveur.
defined('DATA_DIR') || define('DATA_DIR', is_dir(__DIR__ . '/data') ? __DIR__ . '/data' : __DIR__ . '/../data');

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

// Ouvrir depuis une adresse (ADR-0036, docs/securite.md § 10) : le serveur va chercher un SVG, un PDF ou une image pour la personne
// connectee. Il refuse toute adresse qui mene a un reseau prive, de bouclage, lien-local, multicast ou reserve (IPv4 et IPv6), se
// connecte a l'adresse IP verifiee, suit au plus 3 redirections en verifiant chacune, borne la taille et le temps. cURL est requis.
defined('ADRESSE_OUVERTURE') || define('ADRESSE_OUVERTURE', true);
// `http://` (en clair) refuse par defaut : seulement https.
defined('ADRESSE_HTTP') || define('ADRESSE_HTTP', false);
// Les ports admis : 443 ; et 80 quand http est permis.
defined('ADRESSE_PORTS') || define('ADRESSE_PORTS', ADRESSE_HTTP ? [443, 80] : [443]);
// La taille d'un fichier (la meme borne que l'ouverture d'un fichier dans le navigateur) et le temps total, redirections comprises.
defined('ADRESSE_OCTETS_MAX') || define('ADRESSE_OCTETS_MAX', 100 * 1024 * 1024);
defined('ADRESSE_DELAI') || define('ADRESSE_DELAI', 30);
// Des reseaux prives que l'administrateur autorise quand meme (un serveur de fichiers de l'intranet), en notation CIDR :
// `['10.20.0.0/16', 'fd12:3456::/48']`. Vide par defaut : aucun.
defined('ADRESSE_RESEAUX_PERMIS') || define('ADRESSE_RESEAUX_PERMIS', []);

// Vrai derriere un mandataire qui termine HTTPS sans le dire a PHP : le cookie de session part alors toujours en `Secure`.
defined('HTTPS_FORCE') || define('HTTPS_FORCE', false);
