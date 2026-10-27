<?php
// Les constantes avancees du site (ADR-0030, ADR-0041, docs/deploiement-php.md). Aucune n'est a regler pour installer le site :
// les reglages ordinaires (nom du site, langue, inscriptions, courrier) vivent dans data/config/config.json, ecrit a l'installation
// et modifiable dans l'ecran « Reglages du site » (inc/reglages.php). Ne modifiez pas ce fichier : une mise a jour le remplace.
// Posez vos constantes dans data/config/config.local.php (jamais livre, donc jamais ecrase) : chaque constante n'est definie ici
// que si config.local.php ne l'a pas deja fait. Exemple :
//
//   <?php
//   define('HTTPS_FORCE', true);
//   define('ADRESSE_OUVERTURE', false);
//
// Ce fichier ne produit rien : demande directement, il ne dit rien.

declare(strict_types=1);

if (!defined('SVG_SITE')) {
    http_response_code(404);
    exit;
}

if (is_file(DATA_DIR . '/config/config.local.php')) {
    require DATA_DIR . '/config/config.local.php';
}

// La session expire apres ce temps sans aucune requete (en secondes : 30 jours) ; config.json (sessions.inactivite) a le dernier mot,
// et « Reglages du site » le change. Le cookie d'une session connectee vit aussi longtemps : fermer le navigateur ne deconnecte pas.
defined('SESSION_INACTIVITE') || define('SESSION_INACTIVITE', 30 * 86400);

// Les essais de connexion libres par client et par compte, puis le delai double a chaque echec, jusqu'a ce plafond (en secondes).
defined('CONNEXION_ESSAIS_LIBRES') || define('CONNEXION_ESSAIS_LIBRES', 3);
defined('CONNEXION_DELAI_MAX') || define('CONNEXION_DELAI_MAX', 15 * 60);
// Les demandes qui font partir un mail (inscription, renvoi, mot de passe oublie) libres par client, avant le meme delai qui double.
defined('COURRIER_DEMANDES_LIBRES') || define('COURRIER_DEMANDES_LIBRES', 5);

// La duree de vie d'un lien de confirmation d'adresse (48 h) et d'un lien de reinitialisation du mot de passe (1 h), en secondes.
defined('JETON_CONFIRMATION_DUREE') || define('JETON_CONFIRMATION_DUREE', 48 * 3600);
defined('JETON_REINITIALISATION_DUREE') || define('JETON_REINITIALISATION_DUREE', 3600);

// Le client SMTP : le delai de connexion et de chaque reponse (en secondes), et la verification du certificat du serveur de courrier
// (a ne couper que pour un essai contre un serveur local).
defined('COURRIER_DELAI') || define('COURRIER_DELAI', 15);
defined('COURRIER_TLS_VERIFIER') || define('COURRIER_TLS_VERIFIER', true);

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
