# Installer le site PHP

Le site PHP (ADR-0030, ADR-0041) est l’éditeur SVG avec des comptes et des projets enregistrés sur un serveur : chaque personne
retrouve ses projets, un administrateur approuve les inscriptions. La page autonome (`dist/editeur-svg.html`) reste disponible à
part : elle ne demande aucun serveur.

## Ce qu’il faut

- **PHP 8.1 ou plus**, avec les extensions `json`, `mbstring` et, de préférence, `curl` (sans cURL, le serveur télécharge les polices
  par les flux de PHP, la vérification que `data/` ne se lit pas depuis le Web n’est pas faite, et **« Ouvrir depuis une adresse »
  est indisponible** : ses protections demandent cURL, voir plus bas) ; `openssl` pour un serveur SMTP en TLS. Aucune base de
  données, aucune dépendance à installer (pas de composer). Le gestionnaire de votre hébergeur dit la version de PHP et ses
  extensions ; il permet souvent de les choisir.
- Un hébergement qui exécute PHP : un hébergement mutualisé (Apache, avec les `.htaccess` appliqués), ou votre serveur (Apache,
  nginx + PHP-FPM).
- **Du courrier sortant** : l’inscription en libre-service, l’approbation et le mot de passe oublié passent par des mails. La
  fonction `mail()` de l’hébergeur suffit souvent ; sinon un serveur SMTP se règle dans « Réglages du site ». Sans courrier,
  l’administrateur crée les comptes à la main (écran Comptes, « Créer un compte… »).
- **HTTPS** : sans lui, les mots de passe et le cookie de session circulent en clair. La vérification des polices dans le navigateur
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
    index.php            ← les pages : installation, connexion, inscription, confirmation, mot de passe oublié, puis l’application
    api.php              ← l’API : projets, compte, comptes et réglages (administrateur), données, polices
    .htaccess            ← la sécurité de base (Apache)
    assets/              ← site.js, site.css, vtracer.js
    aide/                ← les documentations du menu Aide
    MENTIONS.txt         ← les licences des composants redistribués (à garder accessible)
    data/                ← tout le reste : jamais servi par HTTP
      .htaccess          ← « Require all denied » : tout accès direct refusé
      inc/               ← le code PHP entier ; inc/compte.php (ligne de commande) ; inc/serveur-local.php (pour `php -S`)
      config/            ← config.json (écrit à l’installation) ; config.local.php facultatif (les constantes avancées)
      comptes/           ← un fichier JSON par compte
      sessions/ jetons/  ← les sessions par jeton, les jetons des mails (confirmation, réinitialisation)
      json/              ← les bibliothèques, l’index et les aperçus des polices, la liste des fontes, le dictionnaire anglais
      font/              ← les dix fontes livrées ; font/catalogue/ : les polices que le serveur a téléchargées
      projets/           ← un dossier par compte (sa corbeille dedans) ; projets/corbeille-comptes/ : ceux des comptes supprimés
      partages.json      ← les projets partagés en lecture (titulaire, projet, destinataire), écrit au premier partage
      journal/           ← erreurs.log, connexions.log, comptes.log, courrier.log ; courrier/ : les mails en mode « fichier »
```

Aucun compte n’est dans ce qui est construit : l’administrateur se crée à l’installation. `index.php` et `api.php` ne font qu’appeler
`data/inc/amorce.php` : `data/` est cherché dans le dossier d’`index.php`, sinon à côté (`../data`).

## Installation par FTP, un seul dossier (la disposition par défaut)

C’est l’installation d’un hébergement sans ligne de commande : il n’y a rien à configurer.

1. **Envoyez le contenu de `dist/php/public/`** par FTP (FileZilla, Cyberduck, le gestionnaire de fichiers de l’hébergeur…) à la
   racine du site (souvent `www/`, `htdocs/` ou `public_html/`), ou dans un sous-dossier (`www/dessins/`). Envoyez **aussi les
   fichiers qui commencent par un point** (`.htaccess`, `data/.htaccess`) : certains clients FTP les cachent ; dans FileZilla, menu
   Serveur → « Forcer l’affichage des fichiers cachés ». (Le site réécrit `data/.htaccess` s’il manque, mais pas `.htaccess`.)
2. **Vérifiez que le serveur peut écrire dans `data/`** et ses sous-dossiers : dans le gestionnaire de l’hébergeur ou le client FTP
   (clic droit → « Droits d’accès au fichier »), `755` ou `775` pour les dossiers selon l’hébergeur, `644` pour les fichiers. Si
   `data/` ne s’écrit pas, la page le dit au lieu de s’ouvrir.
3. **Ouvrez le site tout de suite, et créez le compte administrateur** : à la première visite, tant qu’aucun compte n’existe, la
   page demande « Créer le compte administrateur » : votre adresse, votre nom, un mot de passe (dix caractères au moins, deux fois),
   votre langue, le nom du site et l’adresse d’expédition des mails (vide : la vôtre). Le site écrit `data/config/config.json` et
   votre compte, et vous entrez directement. **Faites-le juste après l’envoi** : tant que le compte n’est pas créé, le premier
   visiteur pourrait le faire à votre place (si cela arrivait, supprimez par FTP le fichier de `data/comptes/` et recommencez, ou
   créez le vôtre en ligne de commande, voir plus bas).
4. **Vérifiez la protection de `data/`** : `https://votre-site/data/config/config.json` doit répondre 403 ou 404. Le site le vérifie
   aussi de lui-même (une fois par heure, par une requête du serveur vers lui-même ; cURL requis) et, si le fichier se lit, affiche
   un avertissement en tête de l’application et l’écrit dans `data/journal/erreurs.log`.
5. **Envoyez un mail d’essai** : menu du compte (en haut à droite) → « Réglages du site » → « Envoyer un mail d’essai ». S’il
   n’arrive pas, réglez un serveur SMTP (voir « Le courrier »).

**Le risque accepté** : dans cette disposition, `data/` est sous la racine web et ne tient que par son `.htaccess`. Un hébergement
qui ignore les `.htaccess` (nginx, ou Apache avec `AllowOverride None`) servirait le code, les réglages (dont le mot de passe SMTP),
les comptes (en empreintes), les projets et les sessions : d’où la vérification et l’avertissement ci-dessus. Sous nginx, ajoutez à
la configuration du site :

```nginx
location ^~ /data/ { return 404; }      # ou /dessins/data/ dans un sous-dossier
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

`index.php` prend `public/data` s’il existe, sinon `../data` : rien à régler. Faites pointer le site sur `/srv/editeur-svg/public` :

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
  location ^~ /data/ { return 404; }
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

L’administrateur se crée à la première visite comme plus haut, ou en ligne de commande :

```bash
cd /srv/editeur-svg
sudo -u www-data php data/inc/compte.php --admin          # demande l’adresse, le nom, le mot de passe (deux fois, sans l’afficher), la langue
# ou, dans un script d’installation : une ligne par valeur (adresse, nom, mot de passe, langue facultative : fr ou en)
printf '%s\n' "$EMAIL" "$NOM" "$MOT_DE_PASSE" fr | sudo -u www-data php data/inc/compte.php --admin --stdin
```

Tant qu’aucun compte n’existe, `--admin` fait l’installation complète (il écrit `config.json`, reprend les projets d’un site
d’avant) ; ensuite, il ajoute un administrateur actif. `php data/inc/compte.php --mot-de-passe <adresse>` (ou `--stdin`) change le
mot de passe d’un compte. L’outil ne s’exécute qu’en ligne de commande : demandé par le Web, il ne fait rien (et `data/` est refusé).

## Les comptes

- **L’administrateur** : le premier compte, créé à l’installation. Il approuve ou refuse les demandes (écran « Comptes », trois
  onglets : en attente, actifs, autres), suspend, réactive, promeut un autre administrateur, change une adresse, supprime un
  compte (ses projets partent dans `data/projets/corbeille-comptes/<horodatage>-<compte>/`), crée un compte à la main (actif
  d’emblée, avec un mot de passe provisoire). On ne rétrograde ni ne supprime jamais le dernier administrateur actif, ni soi-même.
- **Une personne** s’inscrit (adresse, nom, mot de passe, langue), confirme son adresse par le lien reçu (48 h), puis attend
  l’approbation d’un administrateur, prévenu par mail ; approuvée, elle est prévenue et se connecte. Ses projets sont les siens :
  `data/projets/<compte>/`, un administrateur n’en voit que le nombre.
- **Partager un projet** (ADR-0043) : « Partager » dans la ligne d’un projet, l’adresse d’une personne qui a un compte actif, puis
  « Envoyer une copie » (le projet est recopié dans ses projets) ou « Partager en lecture » (elle le voit sous « Partagés avec moi »,
  sans pouvoir l’écrire). Elle reçoit un mail. Les partages en lecture vivent dans `data/partages.json` ; un projet mis à la corbeille
  ou un compte supprimé perdent les leurs. Supprimer ce fichier retire tous les partages en lecture (les copies envoyées restent).
- **Le mot de passe** : dix caractères au moins, gardé en empreinte seulement (argon2id, ou bcrypt si PHP n’a pas argon2). Oublié :
  « Mot de passe oublié ? » envoie un lien d’une heure, à usage unique. Changé (profil, lien, ligne de commande) : les autres sessions
  du compte se ferment à leur requête suivante.
- **Les états** : `a-confirmer` (adresse non confirmée) → `en-attente` (à approuver) → `actif` ; `refuse` ; `suspendu` (réactivable).
  Seul `actif` se connecte ; un compte suspendu ou supprimé perd ses sessions à la requête suivante.
- **La langue** : chaque compte a la sienne (français ou anglais), que le profil change ; les pages d’avant la connexion ont un
  sélecteur FR / EN en haut à droite (cookie `svg_langue`) ; un mail part dans la langue de son destinataire.
- **La limitation des essais** : trois essais de connexion libres, puis un délai qui double (2, 4, 8 s… jusqu’à 15 min), par client
  et par compte ; cinq demandes de mail libres par client (inscription, renvoi, mot de passe oublié), puis le même délai. Le
  journal `data/journal/connexions.log` ne garde ni adresse IP, ni adresse de courrier, ni mot de passe.

## Les réglages (`data/config/config.json`)

Écrit à l’installation, modifiable dans « Réglages du site » (menu du compte, administrateur), relu et validé à chaque requête : un
fichier absent ou illisible vaut les valeurs par défaut, un champ mal formé vaut son défaut, et l’écran le dit.

```json
{ "format": "editeur-svg/config", "version": 1,
  "site": { "nom": "Éditeur SVG", "langue": "fr", "adresse": "https://exemple.org/svg/" },
  "inscriptions": { "ouvertes": true },
  "courrier": { "expediteur": "no-reply@exemple.org", "nom": "Éditeur SVG", "mode": "mail",
                "smtp": { "hote": "", "port": 587, "securite": "starttls", "utilisateur": "", "motDePasse": "" } },
  "sessions": { "inactivite": 2592000 } }
```

| Réglage | Rôle |
|---|---|
| `site.nom`, `site.langue` | Le nom du site (pages, mails) ; la langue des pages d’avant la connexion sans cookie (`fr` ou `en`) |
| `site.adresse` | L’adresse publique du site, pour les liens des mails ; vide : celle de la requête |
| `inscriptions.ouvertes` | Faux ferme l’inscription en libre-service (l’administrateur crée les comptes) |
| `courrier.expediteur`, `courrier.nom` | L’adresse et le nom d’expédition des mails |
| `courrier.mode` | `mail` (la fonction de l’hébergeur), `smtp` (le serveur réglé dessous), `fichier` (rien ne part : chaque message s’écrit dans `data/journal/courrier/`, pour un essai) |
| `courrier.smtp.*` | Hôte, port, sécurité (`starttls`, `ssl` implicite, `aucune`), utilisateur et mot de passe (AUTH PLAIN ou LOGIN) ; le mot de passe n’est jamais renvoyé par l’API, et le formulaire le laisse vide pour « inchangé » |
| `sessions.inactivite` | Secondes sans visite avant que la session expire (2 592 000 : trente jours ; « Réglages du site » propose 2 h, 8 h, 1 jour, 7 jours, 30 jours). Le cookie de connexion vit aussi longtemps (plus un jour) et chaque visite repousse l’échéance : fermer le navigateur ne déconnecte pas ; sur un ordinateur partagé, « Se déconnecter » |

### Le courrier

Les mails sont du texte brut UTF-8, les liens en clair. En mode `smtp`, le client du site se connecte, demande STARTTLS (ou SSL
implicite sur 465), s’authentifie si un utilisateur est réglé, et s’arrête net si le serveur refuse STARTTLS : rien ne part en
clair. Le certificat du serveur de courrier est vérifié. « Envoyer un mail d’essai » dit l’erreur telle quelle (connexion, STARTTLS,
authentification, destinataire refusé) ; elle va aussi dans `data/journal/erreurs.log`, sans jamais le mot de passe.

## Les constantes avancées (`data/config/config.local.php`)

Aucune n’est nécessaire. Pour en changer une, créez `data/config/config.local.php` (jamais livré, donc jamais écrasé par une mise à
jour) ; chaque constante non définie prend la valeur de `data/inc/config.php` :

| Constante | Défaut | Rôle |
|---|---|---|
| `SESSION_INACTIVITE` | `2592000` | Le défaut de `sessions.inactivite` quand config.json ne le dit pas (30 jours) |
| `CONNEXION_ESSAIS_LIBRES` | `3` | Échecs d’un même client ou sur un même compte avant le premier délai |
| `CONNEXION_DELAI_MAX` | `900` | Le délai maximal entre deux essais (il double : 2, 4, 8 s…) |
| `COURRIER_DEMANDES_LIBRES` | `5` | Demandes de mail (inscription, renvoi, mot de passe oublié) libres par client avant le même délai |
| `JETON_CONFIRMATION_DUREE` | `172800` (48 h) | La durée de vie d’un lien de confirmation d’adresse |
| `JETON_REINITIALISATION_DUREE` | `3600` (1 h) | La durée de vie d’un lien de réinitialisation |
| `COURRIER_DELAI` | `15` | Le délai de connexion et de chaque réponse du serveur SMTP, en secondes |
| `COURRIER_TLS_VERIFIER` | `true` | La vérification du certificat du serveur SMTP (à ne couper que pour un essai local) |
| `PROJET_OCTETS_MAX` | `33554432` (32 Mo) | La taille maximale d’un projet (fontes déposées et image source comprises) |
| `VIGNETTE_OCTETS_MAX` | `262144` | La taille maximale de la vignette d’un projet |
| `POLICES_SOURCES` | jsDelivr, Bunny, GitLab, Fontshare | Les sources des polices du catalogue, que le serveur contacte |
| `POLICE_OCTETS_MAX` | `8388608` | La taille maximale d’un fichier de police téléchargé |
| `HTTPS_FORCE` | `false` | Vrai derrière un mandataire qui termine HTTPS sans le dire à PHP (cookies `Secure`, HSTS) |
| `ADRESSE_OUVERTURE` | `true` | « Ouvrir depuis une adresse » : faux l’éteint (le champ disparaît, la route répond 404) |
| `ADRESSE_HTTP` | `false` | Vrai permet les adresses `http://` (en clair) en plus de `https://` |
| `ADRESSE_PORTS` | `[443]` (`[443, 80]` si `ADRESSE_HTTP`) | Les ports que le serveur accepte de contacter |
| `ADRESSE_OCTETS_MAX` | `104857600` (100 Mo) | La taille maximale d’un fichier ouvert depuis une adresse |
| `ADRESSE_DELAI` | `30` | Le temps total, en secondes, redirections comprises |
| `ADRESSE_RESEAUX_PERMIS` | `[]` | Des réseaux privés autorisés quand même, en CIDR (`['10.20.0.0/16']`) : un serveur de fichiers de l’intranet |

PHP doit accepter des requêtes de la taille d’un projet : `post_max_size` (8 Mo par défaut) au moins égal à `PROJET_OCTETS_MAX`, et
de même `LimitRequestBody` (Apache) ou `client_max_body_size` (nginx) ; sur un mutualisé, le gestionnaire de l’hébergeur règle
souvent `post_max_size`. Les erreurs PHP ne s’affichent jamais (`display_errors` est coupé par le site) ; elles vont dans
`data/journal/erreurs.log`.

## Le réseau sortant

Le navigateur ne contacte **que le site**. Le serveur, lui, contacte votre serveur de courrier (mode `smtp`), et les sources de
polices **la première fois** qu’une personne choisit une police du catalogue : `cdn.jsdelivr.net` (repli `fonts.bunny.net`),
`gitlab.com`, `cdn.fontshare.com`, en HTTPS, sans redirection. Chaque fichier est vérifié par l’empreinte sha256 de l’index avant
d’être rangé dans `data/font/catalogue/`, puis servi depuis là. Un serveur sans accès sortant marche : les dix fontes livrées
restent, et une police du catalogue choisie dit qu’elle n’a pas pu être téléchargée. Vous pouvez aussi déposer vous-même les
fichiers dans `data/font/catalogue/` (nommés par l’empreinte en hexadécimal, extension `.fonte`).

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
   **sans rien supprimer** : `data/inc/`, `data/json/` et les dix fontes de `data/font/` sont remplacés ; `data/config/`,
   `data/comptes/`, `data/projets/`, `data/sessions/`, `data/jetons/`, `data/secret`, `data/journal/` et `data/font/catalogue/` ne
   sont pas dans la livraison, donc restent.
3. **`data/` hors de la racine** : remplacez `public/` (ne recopiez pas `public/data/`), puis remplacez `data/inc/`, `data/json/` et
   les dix fontes de `data/font/` (pas `data/font/catalogue/`). Ne touchez pas au reste de `data/`.

**Depuis un site d’avant les comptes** (ADR-0030 : un seul mot de passe dans `data/pwd`) : envoyez le nouveau `public/`, puis
supprimez par FTP les anciens `public/inc/` et `public/config.php` (le code vit désormais dans `data/inc/`) ; un `config.local.php`
d’avant se déplace dans `data/config/` (sans `DATA_DIR`, qui n’existe plus). À la première visite, la page demande de **créer le compte
administrateur** : les projets existants lui sont rattachés, et `data/pwd`, `data/password` et `data/connexions.json` sont supprimés :
**le mot de passe unique n’existe plus**, chacun a le sien.

Un projet enregistré par une version plus ancienne s’ouvre et se complète (chaîne de migration) ; un projet d’une version plus
récente est refusé en le disant, jamais lu « au mieux ».

## Sauvegarder

Tout l’état du site est dans `data/` : sauvegardez `data/comptes/`, `data/config/`, `data/projets/` et `data/partages.json` (et
`data/secret`), par exemple
en téléchargeant `data/` par FTP. Un projet est un fichier JSON autonome (`<id>.json`) ; `<id>.meta.json` porte son nom et ses dates.
La corbeille d’un compte (`data/projets/<compte>/corbeille/`) garde ses projets supprimés, horodatés : pour en reprendre un, remettez
ses trois fichiers dans `data/projets/<compte>/` sans le préfixe de date. Un compte supprimé est entier dans
`data/projets/corbeille-comptes/<horodatage>-<compte>/` (ses projets, sa corbeille, et `compte.json`). Rien ne se vide tout seul.

## Essayer en local

```bash
npm run construire
PHP_CLI_SERVER_WORKERS=4 php -S 127.0.0.1:8080 -t dist/php/public dist/php/public/data/inc/serveur-local.php
# puis http://127.0.0.1:8080/ : créez le compte administrateur
```

`php -S` n’applique pas les `.htaccess` : le routeur `data/inc/serveur-local.php` refuse à leur place `data/` et les fichiers cachés
(il ne fait rien ailleurs que sous `php -S`). Plusieurs travailleurs permettent au site de se demander à lui-même si `data/` se lit.
Pour essayer les mails sans en envoyer, posez `"mode": "fichier"` dans `data/config/config.json` : chaque message s’écrit dans
`data/journal/courrier/`.

## Vérifier l’installation

1. `https://…/` montre « Créer le compte administrateur » à la première visite, puis la connexion (adresse, mot de passe, « Créer un
   compte », « Mot de passe oublié ? », le sélecteur FR / EN).
2. `https://…/data/config/config.json`, `https://…/data/inc/amorce.php`, `https://…/data/comptes/` ne rendent rien (403, 404, ou
   une page vide).
3. Les en-têtes de `https://…/` portent `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`.
4. Connecté, « Nouveau projet », une forme, « Enregistrer » : le projet apparaît dans `data/projets/<compte>/`, et « Mes projets »
   le liste.
5. « Réglages du site » → « Envoyer un mail d’essai » arrive ; une inscription d’essai reçoit son lien, et l’administrateur son
   mail de demande.
6. Aucun avertissement en tête de l’application (« le dossier des données est lisible depuis le Web »).
7. `npm run test:php` sur votre machine de construction passe (les mêmes fichiers que ceux que vous déployez).
