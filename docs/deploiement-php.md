# Installer le site PHP

Le site PHP (ADR-0030) est l’éditeur SVG avec des projets enregistrés sur un serveur, derrière un mot de passe. La page autonome
(`dist/editeur-svg.html`) reste disponible à part : elle ne demande aucun serveur.

## Ce qu’il faut

- **PHP 8.1 ou plus**, avec les extensions `session`, `json`, `mbstring` et, de préférence, `curl` (sans cURL, le serveur télécharge
  les polices par les flux de PHP, la vérification que `data/` ne se lit pas depuis le Web n’est pas faite, et **« Ouvrir depuis une
  adresse » est indisponible** : ses protections demandent cURL, voir plus bas). Aucune base de données, aucune dépendance à
  installer (pas de composer). Le gestionnaire de votre hébergeur dit la version de PHP et ses extensions ; il permet souvent de les
  choisir.
- Un hébergement qui exécute PHP : un hébergement mutualisé (Apache, avec les `.htaccess` appliqués), ou votre serveur (Apache,
  nginx + PHP-FPM).
- **HTTPS** : sans lui, le mot de passe et le cookie de session circulent en clair. La vérification des polices dans le navigateur
  (`crypto.subtle`) demande aussi un contexte sécurisé (HTTPS, ou `localhost`). La plupart des hébergeurs offrent un certificat
  gratuit (Let’s Encrypt) à activer dans leur gestionnaire.

## Construire

```bash
npm ci
npm run construire        # écrit dist/php/, à côté de la page autonome
```

```
dist/php/
  public/                ← LE dossier à envoyer : son contenu va à la racine du site
    index.php            ← le fichier principal : le premier mot de passe, la connexion, puis l’application
    api.php              ← les projets, les données JSON, les polices
    config.php           ← les réglages par défaut (rien à régler ; pour changer un réglage : config.local.php)
    .htaccess            ← la sécurité de base (Apache)
    inc/                 ← le code, refusé en accès direct ; inc/mot-de-passe.php (ligne de commande) ;
                           inc/serveur-local.php (pour essayer avec `php -S`)
    assets/              ← site.js, site.css, vtracer.js
    MENTIONS.txt         ← les licences des composants redistribués (à garder accessible)
    data/                ← les données : jamais servies par HTTP
      .htaccess          ← « Require all denied » : tout accès direct refusé
      json/              ← les bibliothèques, l’index et les aperçus des polices, la liste des fontes
      font/              ← les dix fontes livrées ; font/catalogue/ : les polices que le serveur a téléchargées
      projets/           ← les projets enregistrés ; projets/corbeille/ : les projets supprimés
```

Le mot de passe n’est jamais dans ce qui est construit : vous le choisissez à l’installation. `data/pwd` (l’empreinte du mot de
passe), `data/secret`, `data/connexions.json`, `data/journal/` et `data/sessions/` se créent à l’usage.

## Installation par FTP, un seul dossier (la disposition par défaut)

C’est l’installation d’un hébergement sans ligne de commande : il n’y a rien à configurer.

1. **Envoyez le contenu de `dist/php/public/`** par FTP (FileZilla, Cyberduck, le gestionnaire de fichiers de l’hébergeur…) à la
   racine du site (souvent `www/`, `htdocs/` ou `public_html/`), ou dans un sous-dossier (`www/dessins/`). Envoyez **aussi les
   fichiers qui commencent par un point** (`.htaccess`, `data/.htaccess`) : certains clients FTP les cachent ; dans FileZilla, menu
   Serveur → « Forcer l’affichage des fichiers cachés ». (Le site réécrit `data/.htaccess` s’il manque, mais pas `.htaccess`.)
2. **Vérifiez que le serveur peut écrire dans `data/`** et ses sous-dossiers : dans le gestionnaire de l’hébergeur ou le client FTP
   (clic droit → « Droits d’accès au fichier »), `755` ou `775` pour les dossiers selon l’hébergeur, `644` pour les fichiers. Si
   `data/` ne s’écrit pas, la page le dit au lieu de s’ouvrir.
3. **Ouvrez le site tout de suite, et choisissez le mot de passe** : à la première visite, tant qu’aucun mot de passe n’existe, la
   page demande « Choisissez le mot de passe du site » (dix caractères au moins, deux fois). Le site en garde l’empreinte dans
   `data/pwd` et vous entrez directement. **Faites-le juste après l’envoi** : tant que le mot de passe n’est pas choisi, le premier
   visiteur pourrait le faire à votre place (si cela arrivait, voir « Changer le mot de passe » : `data/password` reprend la main).
   - **Ou, avant d’ouvrir le site**, créez sur votre ordinateur un fichier texte nommé `password` (sans extension), qui contient
     le mot de passe sur une ligne, et envoyez-le dans `data/` (`data/password`). À la première requête, le site en écrit
     l’empreinte dans `data/pwd`, puis **supprime** `data/password` ; la page de connexion dit « Mot de passe enregistré, et le
     fichier data/password supprimé ». Les blancs et fins de ligne aux extrémités ne comptent pas ; le fichier doit être en UTF-8
     (le Bloc-notes de Windows l’est) ; moins de dix caractères, il est refusé, et la page le dit sans rien changer.
4. **Vérifiez la protection de `data/`** : `https://votre-site/data/pwd` doit répondre 403 ou 404. Le site le vérifie aussi de
   lui-même (une fois par heure, par une requête du serveur vers lui-même ; cURL requis) et, si `data/pwd` ou `data/password` se
   lit, affiche un avertissement en tête de l’application et l’écrit dans `data/journal/erreurs.log`.

**Le risque accepté** : dans cette disposition, `data/` est sous la racine web et ne tient que par son `.htaccess`. Un hébergement
qui ignore les `.htaccess` (nginx, ou Apache avec `AllowOverride None`) servirait l’empreinte du mot de passe, les projets et les
sessions : d’où la vérification et l’avertissement ci-dessus. Sous nginx, ajoutez à la configuration du site :

```nginx
location ^~ /data/ { return 404; }      # ou /dessins/data/ dans un sous-dossier
location ^~ /inc/  { return 404; }
location ~ /\.     { return 404; }
```

Si vous avez la main sur le serveur, préférez la disposition suivante.

## Disposition « data/ hors de la racine web » (si vous avez la main sur le serveur)

`data/` est alors hors de portée du navigateur, quoi que fassent les `.htaccess`. Sur le serveur, par exemple dans
`/srv/editeur-svg/`, posez `public/` **sans** son `data/`, et `data/` à côté :

```bash
mkdir -p /srv/editeur-svg
cp -r dist/php/public /srv/editeur-svg/public
mv /srv/editeur-svg/public/data /srv/editeur-svg/data
```

`config.php` prend `public/data` s’il existe, sinon `../data` : rien à régler. (Pour un autre emplacement, posez
`define('DATA_DIR', '/chemin/vers/data');` dans `public/config.local.php`.) Faites pointer le site sur `/srv/editeur-svg/public` :

```apache
<VirtualHost *:443>
  ServerName dessins.exemple.fr
  DocumentRoot /srv/editeur-svg/public
  <Directory /srv/editeur-svg/public>
    AllowOverride All
    Require all granted
  </Directory>
  # … SSLEngine, certificats
</VirtualHost>
```

```nginx
server {
  listen 443 ssl;
  server_name dessins.exemple.fr;
  root /srv/editeur-svg/public;
  index index.php;
  client_max_body_size 40m;                 # au moins PROJET_OCTETS_MAX
  location ~ ^/(inc/|data/|config(\.local)?\.php) { return 404; }
  location ~ /\. { return 404; }
  location ~ \.php$ { include fastcgi_params; fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name; fastcgi_pass unix:/run/php/php8.3-fpm.sock; }
}
```

Les droits : le serveur web (l’utilisateur de PHP : `www-data`, `apache`, `nginx`…) doit **écrire** dans `data/` et ses
sous-dossiers, et seulement là :

```bash
sudo chown -R www-data:www-data /srv/editeur-svg/data
sudo find /srv/editeur-svg/data -type d -exec chmod 750 {} \;
sudo find /srv/editeur-svg/data -type f -exec chmod 640 {} \;
# public/ : lisible par le serveur, non modifiable par lui
sudo chown -R root:www-data /srv/editeur-svg/public && sudo chmod -R g-w,o-rwx /srv/editeur-svg/public
```

Le mot de passe se choisit à la première visite comme plus haut, ou par `data/password`, ou en ligne de commande :

```bash
cd /srv/editeur-svg/public
sudo -u www-data php inc/mot-de-passe.php          # demande le mot de passe deux fois, sans l’afficher
# ou, dans un script d’installation :
printf '%s\n' "$MOT_DE_PASSE" | sudo -u www-data php inc/mot-de-passe.php --stdin
```

L’outil ne s’exécute qu’en ligne de commande : demandé par le Web, il ne fait rien (et `inc/` est refusé en accès direct).

## Le mot de passe

Seule son **empreinte** (argon2id, ou bcrypt si PHP n’a pas argon2) est écrite dans `data/pwd`, avec les droits 640, jamais le mot de
passe ; il compte au moins dix caractères. Trois façons de le poser, qui aboutissent au même fichier :

- **la page, à la première visite** : seulement tant que `data/pwd` n’existe pas (vérifié sous verrou au moment d’écrire) ; dès
  qu’il existe, ce formulaire n’existe plus, et un envoi direct est refusé (« Un mot de passe a déjà été posé ») ;
- **`data/password` par FTP** : converti puis supprimé à la requête suivante (page ou API) ;
- **la ligne de commande** : `php inc/mot-de-passe.php`.

**Changer le mot de passe** : déposez un nouveau `data/password` (ou relancez l’outil) ; il **remplace** l’ancien. Toutes les
sessions ouvertes sont alors fermées (chaque session porte la marque de l’empreinte de sa connexion) : chacun se reconnecte avec le
nouveau mot de passe, et la page dit « Le mot de passe du site a changé : reconnectez-vous ».

Si le site ne peut pas supprimer `data/password` (un fichier qui appartient à l’utilisateur FTP, dans un dossier qui l’interdit à
PHP), l’empreinte est quand même posée, et la page affiche « Supprimez le fichier data/password par FTP : le mot de passe y est
lisible en clair » tant qu’il reste ; c’est écrit aussi dans `data/journal/erreurs.log`. Le mot de passe n’est jamais écrit dans un
journal ni affiché. Les changements se notent dans `data/journal/connexions.log`.

Si `data/pwd` existe mais ne contient pas une empreinte reconnue (un fichier abîmé), personne n’entre et la page le dit : déposez
`data/password`, ou supprimez `data/pwd` pour revenir au choix de la première visite.

## Les réglages (`config.local.php`)

Aucun réglage n’est nécessaire. Pour en changer un, créez `public/config.local.php` (jamais livré, donc jamais écrasé par une mise à
jour) ; chaque constante non définie prend la valeur de `config.php` :

| Constante | Défaut | Rôle |
|---|---|---|
| `DATA_DIR` | `__DIR__ . '/data'` s’il existe, sinon `__DIR__ . '/../data'` | Le dossier des données |
| `SESSION_INACTIVITE` | `7200` | Secondes sans requête avant que la session expire |
| `CONNEXION_ESSAIS_LIBRES` | `3` | Échecs d’un même client avant le premier délai |
| `CONNEXION_DELAI_MAX` | `900` | Le délai maximal entre deux essais (il double : 2, 4, 8 s…) |
| `PROJET_OCTETS_MAX` | `33554432` (32 Mo) | La taille maximale d’un projet (fontes déposées et image source comprises) |
| `VIGNETTE_OCTETS_MAX` | `262144` | La taille maximale de la vignette d’un projet |
| `POLICES_SOURCES` | jsDelivr, Bunny, GitLab, Fontshare | Les sources des polices du catalogue, que le serveur contacte |
| `POLICE_OCTETS_MAX` | `8388608` | La taille maximale d’un fichier de police téléchargé |
| `HTTPS_FORCE` | `false` | Vrai derrière un mandataire qui termine HTTPS sans le dire à PHP (cookie `Secure`, HSTS) |
| `ADRESSE_OUVERTURE` | `true` | « Ouvrir depuis une adresse » : faux l’éteint (le champ disparaît, la route répond 404) |
| `ADRESSE_HTTP` | `false` | Vrai permet les adresses `http://` (en clair) en plus de `https://` |
| `ADRESSE_PORTS` | `[443]` (`[443, 80]` si `ADRESSE_HTTP`) | Les ports que le serveur accepte de contacter |
| `ADRESSE_OCTETS_MAX` | `104857600` (100 Mo) | La taille maximale d’un fichier ouvert depuis une adresse (la borne d’un fichier ouvert dans le navigateur) |
| `ADRESSE_DELAI` | `30` | Le temps total, en secondes, redirections comprises |
| `ADRESSE_RESEAUX_PERMIS` | `[]` | Des réseaux privés autorisés quand même, en CIDR (`['10.20.0.0/16']`) : un serveur de fichiers de l’intranet |

PHP doit accepter des requêtes de la taille d’un projet : `post_max_size` (8 Mo par défaut) au moins égal à `PROJET_OCTETS_MAX`, et
de même `LimitRequestBody` (Apache) ou `client_max_body_size` (nginx) ; sur un mutualisé, le gestionnaire de l’hébergeur règle
souvent `post_max_size`. Les erreurs PHP ne s’affichent jamais (`display_errors` est coupé par le site) ; elles vont dans
`data/journal/erreurs.log`.

## Le réseau sortant

Le navigateur ne contacte **que le site**. Le serveur, lui, contacte les sources de polices **la première fois** qu’une personne
choisit une police du catalogue : `cdn.jsdelivr.net` (repli `fonts.bunny.net`), `gitlab.com`, `cdn.fontshare.com`, en HTTPS, sans
redirection. Chaque fichier est vérifié par l’empreinte sha256 de l’index avant d’être rangé dans `data/font/catalogue/`, puis servi
depuis là. Un serveur sans accès sortant marche : les dix fontes livrées restent, et une police du catalogue choisie dit qu’elle n’a
pas pu être téléchargée. Vous pouvez aussi déposer vous-même les fichiers dans `data/font/catalogue/` (nommés par l’empreinte en
hexadécimal, extension `.fonte`).

### Ouvrir depuis une adresse (ADR-0036)

Une personne connectée peut ouvrir un SVG, un PDF ou une image **à partir d’une adresse** : le serveur va chercher le fichier pour
elle (`api.php?r=adresse`, sous session et jeton CSRF), ce qui contourne le refus de lecture entre origines (CORS) que beaucoup de
sites opposent à une page. Le serveur émet donc des requêtes vers des adresses choisies par les personnes connectées ; ses protections
(détail dans `docs/securite.md`, § 10) :

- `https://` seulement (`http://` si `ADRESSE_HTTP`), sur un port de `ADRESSE_PORTS` ; ni identifiant ni mot de passe dans l’adresse ;
- le nom est résolu par le serveur, et **toutes** ses adresses doivent être publiques : aucune adresse privée (10/8, 172.16/12,
  192.168/16, fc00::/7), de bouclage (127/8, ::1), lien-local (169.254/16, dont les métadonnées d’un hébergeur infonuagique, fe80::/10),
  partagée (100.64/10), multicast ou réservée, en IPv4 comme en IPv6 (une IPv4 mappée, NAT64 ou 6to4 est jugée sur l’IPv4 qu’elle
  porte) ;
- cURL se connecte à l’adresse vérifiée (`CURLOPT_RESOLVE`), sans mandataire : un DNS qui changerait de réponse entre-temps n’a pas
  d’effet ;
- trois redirections au plus, chacune revue comme la première ; temps et taille bornés pendant le transfert ; aucun cookie, un seul
  en-tête (`Accept`) ;
- le fichier est rendu en octets bruts (`application/octet-stream`, `attachment`, `nosniff`) ; le navigateur le lit comme un fichier
  déposé, avec les mêmes contrôles.

**cURL est requis** (`php -m | grep curl`) ; sans lui, la route répond que la fonction est indisponible. Le journal
`data/journal/adresses.log` garde, par demande, l’hôte, la taille et le résultat, **jamais le chemin ni les paramètres** de l’adresse
(un lien signé y porte souvent un jeton). Si votre serveur est dans un réseau où des services internes sont joignables par un nom
public, ou si vous ne voulez pas qu’il émette ces requêtes, posez `define('ADRESSE_OUVERTURE', false);`. Un pare-feu sortant qui
n’autorise que le port 443 est une seconde ligne de défense bienvenue. Pour qu’un serveur de fichiers de l’intranet soit joignable,
nommez son réseau dans `ADRESSE_RESEAUX_PERMIS` (et lui seul).

## Mettre à jour

1. `npm run construire` sur la nouvelle version.
2. **Par FTP** : envoyez le contenu du nouveau `dist/php/public/` **par-dessus** l’ancien, en remplaçant les fichiers existants et
   **sans rien supprimer** : `data/json/` et les dix fontes de `data/font/` sont remplacés ; `config.local.php`, `data/pwd`,
   `data/projets/`, `data/secret`, `data/sessions/`, `data/journal/` et `data/font/catalogue/` ne sont pas dans la livraison, donc
   restent.
3. **`data/` hors de la racine** : remplacez `public/` (gardez `public/config.local.php`, ne recopiez pas `public/data/`), puis
   remplacez `data/json/` et les dix fontes de `data/font/` (pas `data/font/catalogue/`). Ne touchez pas `data/pwd`,
   `data/projets/`, `data/secret`, `data/sessions/`, `data/journal/`.

Un projet enregistré par une version plus ancienne s’ouvre et se complète (chaîne de migration) ; un projet d’une version plus
récente est refusé en le disant, jamais lu « au mieux ».

## Sauvegarder

Tout l’état du site est dans `data/` : sauvegardez `data/projets/` (et `data/pwd`, `data/secret`), par exemple en téléchargeant
`data/` par FTP. Un projet est un fichier JSON autonome (`<id>.json`) ; `<id>.meta.json` porte son nom et ses dates. La corbeille
(`data/projets/corbeille/`) garde les projets supprimés, horodatés : pour en reprendre un, remettez ses trois fichiers dans
`data/projets/` sans le préfixe de date. Elle ne se vide qu’à la main.

## Essayer en local

```bash
npm run construire
PHP_CLI_SERVER_WORKERS=4 php -S 127.0.0.1:8080 -t dist/php/public dist/php/public/inc/serveur-local.php
# puis http://127.0.0.1:8080/ : choisissez le mot de passe
```

`php -S` n’applique pas les `.htaccess` : le routeur `inc/serveur-local.php` refuse à leur place `data/`, `inc/`, les réglages et
les fichiers cachés (il ne fait rien ailleurs que sous `php -S`). Plusieurs travailleurs permettent au site de se demander à
lui-même si `data/` se lit.

## Vérifier l’installation

1. `https://…/` montre « Choisissez le mot de passe du site » à la première visite, puis « Éditeur SVG — Ce site est réservé » et
   le champ « Mot de passe ».
2. `https://…/data/pwd`, `https://…/data/password`, `https://…/config.php`, `https://…/inc/amorce.php` ne rendent rien (403, 404, ou
   une page vide).
3. Les en-têtes de `https://…/` portent `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`.
4. Connecté, « Nouveau projet », une forme, « Enregistrer » : le projet apparaît dans `data/projets/`, et « Mes projets » le liste.
5. Aucun avertissement en tête de l’application (« le dossier des données est lisible depuis le Web », « Supprimez le fichier
   data/password »).
6. `npm run test:php` sur votre machine de construction passe (les mêmes fichiers que ceux que vous déployez).
