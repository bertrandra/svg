# Installer le site PHP

Le site PHP (ADR-0030) est l’éditeur SVG avec des projets enregistrés sur un serveur, derrière un mot de passe. La page autonome
(`dist/editeur-svg.html`) reste disponible à part : elle ne demande aucun serveur.

## Ce qu’il faut

- **PHP 8.1 ou plus**, avec les extensions `session`, `json`, `mbstring` et, de préférence, `curl` (sans cURL, le serveur télécharge
  les polices par les flux de PHP, et la vérification de `data/` sous la racine web n’est pas faite). Aucune base de données, aucune
  dépendance à installer (pas de composer).
- Un serveur web qui exécute PHP : Apache (avec `AllowOverride` pour que les `.htaccess` s’appliquent), nginx + PHP-FPM, ou un
  hébergement mutualisé.
- **HTTPS** en production : sans lui, le mot de passe et le cookie de session circulent en clair. La vérification des polices dans le
  navigateur (`crypto.subtle`) demande aussi un contexte sécurisé (HTTPS, ou `localhost`).

## Construire

```bash
npm ci
npm run construire        # écrit dist/php/, à côté de la page autonome
```

```
dist/php/
  public/                ← la racine web (DocumentRoot)
    index.php            ← le fichier principal : la connexion, puis l’application
    api.php              ← les projets, les données JSON, les polices
    config.php           ← les réglages par défaut (ne pas modifier : config.local.php)
    .htaccess, inc/      ← la sécurité de base, le code (refusé en accès direct)
    assets/              ← site.js, site.css, vtracer.js
    MENTIONS.txt         ← les licences des composants redistribués (à garder accessible)
  data/                  ← HORS de la racine web
    .htaccess            ← « Require all denied » (le filet si data/ doit vivre sous public/)
    json/                ← les bibliothèques, l’index et les aperçus des polices, la liste des fontes
    font/                ← les dix fontes livrées ; font/catalogue/ : les polices que le serveur a téléchargées
    projets/             ← les projets enregistrés ; projets/corbeille/ : les projets supprimés
  outils/mot-de-passe.php
```

## Où poser `public/` et `data/`

### Disposition recommandée : `data/` à côté de la racine web

Copiez **tout** `dist/php/` sur le serveur, par exemple dans `/srv/editeur-svg/`, et faites pointer le site sur
`/srv/editeur-svg/public` :

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
  location ~ ^/(inc/|config(\.local)?\.php) { return 404; }
  location ~ /\. { return 404; }
  location ~ \.php$ { include fastcgi_params; fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name; fastcgi_pass unix:/run/php/php8.3-fpm.sock; }
}
```

`data/` est alors hors de portée du navigateur, quoi que fassent les `.htaccess`. Rien à régler : `config.php` cherche
`__DIR__ . '/../data'`.

### Si l’hébergeur impose tout sous la racine web

Certains hébergements mutualisés n’offrent qu’un dossier public. Placez alors `data/` **dans** `public/` (`public/data/`), et
créez `public/config.local.php` :

```php
<?php
define('DATA_DIR', __DIR__ . '/data');
```

Le `data/.htaccess` livré refuse tout accès direct (Apache 2.4, et 2.2 en repli) ; il faut que l’hébergeur applique les `.htaccess`.
Sous nginx, ajoutez `location ^~ /data/ { return 404; }`. **Vérifiez** : `https://dessins.exemple.fr/data/pwd` doit répondre 403 ou
404. `index.php` le vérifie aussi de lui-même (une fois par heure, par une requête du serveur vers lui-même) et, si `data/pwd` se
lit, affiche un avertissement en tête de l’application et l’écrit dans `data/journal/erreurs.log`.

## Les droits d’écriture

Le serveur web (l’utilisateur de PHP : `www-data`, `apache`, `nginx`… ou le vôtre sur un mutualisé) doit **écrire** dans `data/` et
ses sous-dossiers, et seulement là :

```bash
sudo chown -R www-data:www-data /srv/editeur-svg/data
sudo find /srv/editeur-svg/data -type d -exec chmod 750 {} \;
sudo find /srv/editeur-svg/data -type f -exec chmod 640 {} \;
# public/ et outils/ : lisibles par le serveur, non modifiables par lui
sudo chown -R root:www-data /srv/editeur-svg/public /srv/editeur-svg/outils && sudo chmod -R g-w,o-rwx /srv/editeur-svg/public
```

Les dossiers qui manquent dans `data/` (journal, sessions, corbeille…) se créent au premier passage. Si `data/` ne s’écrit pas,
`index.php` le dit au lieu de la page de connexion.

## Poser le mot de passe

Sur le serveur, dans le dossier du site :

```bash
cd /srv/editeur-svg
sudo -u www-data php outils/mot-de-passe.php          # demande le mot de passe deux fois, sans l’afficher
# ou, dans un script d’installation :
printf '%s\n' "$MOT_DE_PASSE" | sudo -u www-data php outils/mot-de-passe.php --stdin
```

Le mot de passe compte au moins dix caractères. Seule son **empreinte** (argon2id, ou bcrypt si PHP n’a pas argon2) est écrite dans
`data/pwd`, avec les droits 640. Relancer l’outil change le mot de passe ; les sessions ouvertes restent valides jusqu’à leur
expiration (pour les fermer toutes : videz `data/sessions/`). Tant que `data/pwd` manque, `index.php` affiche cette commande et ne
laisse entrer personne. L’outil ne s’exécute qu’en ligne de commande : demandé par le Web, il ne fait rien (et `outils/` est hors de
la racine web).

## Les réglages (`config.local.php`)

Posez vos réglages dans `public/config.local.php` (jamais livré, donc jamais écrasé par une mise à jour) ; chaque constante non
définie prend la valeur de `config.php` :

| Constante | Défaut | Rôle |
|---|---|---|
| `DATA_DIR` | `__DIR__ . '/../data'` | Le dossier des données |
| `SESSION_INACTIVITE` | `7200` | Secondes sans requête avant que la session expire |
| `CONNEXION_ESSAIS_LIBRES` | `3` | Échecs d’un même client avant le premier délai |
| `CONNEXION_DELAI_MAX` | `900` | Le délai maximal entre deux essais (il double : 2, 4, 8 s…) |
| `PROJET_OCTETS_MAX` | `33554432` (32 Mo) | La taille maximale d’un projet (fontes déposées et image source comprises) |
| `VIGNETTE_OCTETS_MAX` | `262144` | La taille maximale de la vignette d’un projet |
| `POLICES_SOURCES` | jsDelivr, Bunny, GitLab, Fontshare | Les sources des polices du catalogue, que le serveur contacte |
| `POLICE_OCTETS_MAX` | `8388608` | La taille maximale d’un fichier de police téléchargé |
| `HTTPS_FORCE` | `false` | Vrai derrière un mandataire qui termine HTTPS sans le dire à PHP (cookie `Secure`, HSTS) |

PHP doit accepter des requêtes de la taille d’un projet : `post_max_size` (8 Mo par défaut) au moins égal à `PROJET_OCTETS_MAX`, et
de même `LimitRequestBody` (Apache) ou `client_max_body_size` (nginx). Les erreurs PHP ne s’affichent jamais (`display_errors` est
coupé par le site) ; elles vont dans `data/journal/erreurs.log`.

## Le réseau sortant

Le navigateur ne contacte **que le site**. Le serveur, lui, contacte les sources de polices **la première fois** qu’une personne
choisit une police du catalogue : `cdn.jsdelivr.net` (repli `fonts.bunny.net`), `gitlab.com`, `cdn.fontshare.com`, en HTTPS, sans
redirection. Chaque fichier est vérifié par l’empreinte sha256 de l’index avant d’être rangé dans `data/font/catalogue/`, puis servi
depuis là. Un serveur sans accès sortant marche : les dix fontes livrées restent, et une police du catalogue choisie dit qu’elle n’a
pas pu être téléchargée. Vous pouvez aussi déposer vous-même les fichiers dans `data/font/catalogue/` (nommés par l’empreinte en
hexadécimal, extension `.fonte`).

## Mettre à jour

1. `npm run construire` sur la nouvelle version.
2. Remplacez `public/` et `outils/` sur le serveur (gardez `public/config.local.php`).
3. Remplacez `data/json/` et les dix fontes de `data/font/` (pas `data/font/catalogue/`).
4. **Ne touchez pas** `data/pwd`, `data/projets/`, `data/secret`, `data/sessions/`, `data/journal/`.

Un projet enregistré par une version plus ancienne s’ouvre et se complète (chaîne de migration) ; un projet d’une version plus
récente est refusé en le disant, jamais lu « au mieux ».

## Sauvegarder

Tout l’état du site est dans `data/` : sauvegardez `data/projets/` (et `data/pwd`, `data/secret`). Un projet est un fichier JSON
autonome (`<id>.json`) ; `<id>.meta.json` porte son nom et ses dates. La corbeille (`data/projets/corbeille/`) garde les projets
supprimés, horodatés : pour en reprendre un, remettez ses trois fichiers dans `data/projets/` sans le préfixe de date. Elle ne se
vide qu’à la main.

## Essayer en local

```bash
npm run construire
printf '%s\n' 'un mot de passe assez long' | php dist/php/outils/mot-de-passe.php --stdin
php -S 127.0.0.1:8080 -t dist/php/public
# puis http://127.0.0.1:8080/
```

`php -S` n’applique pas les `.htaccess` : `data/` doit rester à côté de `public/` (la disposition par défaut).

## Vérifier l’installation

1. `https://…/` montre « Éditeur SVG — Ce site est réservé » et le champ « Mot de passe ».
2. `https://…/data/pwd`, `https://…/config.php`, `https://…/inc/amorce.php` ne rendent rien (403, 404, ou une page vide).
3. Les en-têtes de `https://…/` portent `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`.
4. Connecté, « Nouveau projet », une forme, « Enregistrer » : le projet apparaît dans `data/projets/`, et « Mes projets » le liste.
5. `npm run test:php` sur votre machine de construction passe (les mêmes fichiers que ceux que vous déployez).
