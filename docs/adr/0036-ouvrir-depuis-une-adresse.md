# ADR-0036 — Ouvrir depuis une adresse : le type sur les octets, la lecture d’un inconnu, le serveur gardé contre la SSRF

**Date :** 25 octobre 2026
**Statut :** acceptée (prolonge les ADR-0002, 0014, 0018, 0020, 0024, 0025 et 0030 ; amende la liste des fichiers où passe le
réseau, « le réseau passe par `io/` » de l’ADR-0030) ; **aucun octet écrit ne change** : rien de l’écriture, des exports ni des
références n’est touché

## Contexte

Demande du propriétaire : « Je peux ouvrir une image, un SVG ou un PDF à partir d’une URL. »

Jusqu’ici, un dessin entrait par un fichier choisi ou déposé, du code collé, l’exemple ou la bibliothèque. Une adresse est une porte
d’entrée de plus, avec trois difficultés propres :

- **ce qu’un serveur renvoie ne se croit pas** : une adresse en `.png` peut servir un SVG à script, une adresse en `.svg` une page
  d’erreur HTML, et le `Content-Type` se choisit aussi librement que l’extension ;
- **la page autonome n’a pas de serveur** : le navigateur va chercher l’adresse lui-même, et beaucoup de sites refusent la lecture
  entre origines (CORS) ; et elle promet que rien ne part sans un geste (ADR-0025) ;
- **le site PHP a un serveur**, qui contourne le CORS, mais une requête qu’un serveur émet à la demande d’un client est la porte
  classique de la falsification de requête côté serveur (SSRF) : métadonnées d’un hébergeur (169.254.169.254), services internes,
  rebinding DNS, redirections vers l’intérieur.

## Décision

### 1. Le champ, et les gestes qui demandent

- **« Ouvrir depuis une adresse »** : un champ (`type="url"`, sans validation native : la nôtre parle français) et un bouton
  « Ouvrir », secondaire (la voie garde son action pleine, ADR-0006), dans la voie « Ouvrir un SVG ou un PDF » **et** dans la voie
  « Convertir une image » (`zones/OuvrirAdresse.tsx`). Pendant le téléchargement : « Téléchargement depuis exemple.fr… » (une région
  `status` toujours présente, l’hôte seul, jamais le chemin), le champ en lecture seule, « Annuler » ; à la fin, le focus revient au
  champ s’il était sur « Annuler ».
- **Rien ne part avant le geste** : taper n’envoie rien. Trois gestes demandent le fichier : « Ouvrir » (ou Entrée), **un lien glissé**
  sur la zone de dépôt (`text/uri-list`, ou un texte qui n’est qu’une adresse), **une adresse collée seule** dans la zone de code
  (coller est un geste aussi délibéré que « Ouvrir » ; un code SVG collé reste un code).
- **Le champ n’existe que chez un hôte qui l’a posé** (`definirOuvertureAdresse`, `io/adresse.ts`) : la page autonome
  (`zones/demarrer.tsx`) et le site (`site/demarrer.tsx`) ; l’embarquement ne le pose pas, l’éditeur d’un hôte n’a ni champ ni entrée
  de menu.
- **Dans l’éditeur** : Fichier → « Insérer depuis une adresse… » (`zones/InsererAdresse.tsx`) insère un SVG, ou la première page d’un
  PDF, au centre du plan (`insererForme`, comme une forme de la bibliothèque). **Une image ne s’insère pas** : l’éditeur ne garde que
  des formes vectorielles (ADR-0001), et la vectoriser demande l’atelier de la voie « Convertir une image » ; la boîte le dit. C’était
  la partie « si c’est simple » de la demande : le SVG et le PDF le sont, l’image non.

### 2. L’adresse : `https://`, validée avant toute requête

`model/adresse.ts`, pur : `https://` seulement ; une adresse sans schéma reçoit `https://` ; tout autre schéma (`javascript:`,
`data:`, `file:`, `blob:`, `ftp:`…) est refusé **en le nommant** ; ni identifiant ni mot de passe dans l’adresse (ils partiraient) ;
2 048 caractères au plus ; le fragment retiré. **`http://` est refusé** dans la page autonome, avec une phrase qui propose `https://` :
un fichier en clair peut être réécrit en chemin, et une page servie en https ne le lirait pas. Sur le site, l’administrateur peut le
permettre (`ADRESSE_HTTP`, annoncé à la page par `data-adresse-http`).

Le **nom** du dessin est le dernier segment du chemin, décodé, sans extension, nettoyé par `nomDeFichier` ; l’hôte faute de segment ;
**jamais les paramètres**, qui portent souvent un jeton.

### 3. Le type se décide sur les octets

`engine/natureOctets.ts`, pur : une signature d’image en tête (PNG, JPEG, GIF, WebP, BMP — « BM » seulement avec une taille d’en-tête
DIB connue), puis `%PDF-` en tête, puis un texte qui commence par `<` (après la marque d’ordre des octets et les blancs) : `svg` si la
racine `<svg` (ou `<préfixe:svg`) vient avant toute marque HTML (`<!doctype html`, `<html`, `<head`, `<body`), `html` sinon, puis
`%PDF-` dans le premier kilo-octet. Seuls les 256 premiers Ko sont lus. **Jamais l’extension, jamais le `Content-Type`.**

La nature décide de la voie, quelle que soit celle où l’on a tapé l’adresse (`useReception`) : une image va au convertisseur, qui
passe au premier plan et la lit comme une image déposée ; un SVG ou un PDF à la voie d’ouverture, qui l’ouvre dans l’éditeur (un PDF
de plusieurs pages propose sa page, comme un fichier). Une page HTML est refusée en le disant (« Cette adresse renvoie une page web,
pas un fichier… ») ; un fichier vide ou d’un autre type aussi.

### 4. La lecture reste celle d’un fichier d’inconnu (ADR-0014)

Les octets reçus passent par **les mêmes fonctions** qu’un fichier déposé : `TextDecoder` comme `File.text()`, `nettoyerSvgNomme`,
les lettres d’un texte, `lireDessin` ; `lirePdf` par `ouvrirPdf` ; le décodeur d’images de `io/image.ts`. Mêmes bornes, aucune entité
développée, refus nommé sans lever. **Un SVG venu d’une adresse n’a pas plus de droits** : ses `<use href="https://…">` et ses images
distantes restent refusés, comme aujourd’hui ; l’adresse d’origine n’est pas une base pour résoudre quoi que ce soit.

### 5. Page autonome : le navigateur va chercher, au seul geste

`io/adresse.ts` : `fetch` en `GET`, `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, `mode: 'cors'`, `cache: 'no-store'`,
`redirect: 'follow'` (le navigateur borne les redirections à 20, la norme Fetch, et n’en suit aucune hors de http(s) : la page n’a pas
la main dessus) ; le corps lu **morceau par morceau** sous la borne de 100 Mo (celle d’un PDF ouvert, la plus haute qu’un fichier
accepte ; un SVG est ensuite borné à 64 Mo par la lecture), une taille annoncée plus grande refusée sans rien lire ; 60 secondes au
plus ; « Annuler » coupe la requête.

**Un refus CORS** se voit comme une panne (`TypeError`). Pour le dire juste, une seconde demande **opaque** (`HEAD`, `mode: 'no-cors'`,
sans cookie ni référent, rien n’est lu) vise la même adresse, au titre du même geste : si elle aboutit, le serveur répond mais refuse
la lecture, et la page dit « Ce site ne permet pas à la page de lire le fichier. Téléchargez-le, puis ouvrez-le ou déposez-le ici. » ;
sinon, « Le serveur de cette adresse ne répond pas ». **Aucun mandataire tiers, jamais.**

La règle « le réseau passe par `io/` » (ADR-0030) admet un troisième fichier : `io/adresse.ts`, à côté de `io/policesEnLigne.ts` et
`io/serveur.ts` (`tests/unit/zones/polices-en-ligne.test.ts`).

### 6. Site PHP : le serveur va chercher, gardé contre la SSRF

`io/serveur.ts` (`telechargerAdresse`) demande `POST api.php?r=adresse` `{ adresse }`, avec le jeton CSRF (repris de la session et
réessayé une fois après une reconnexion), et lit la réponse sous la même borne. `inc/adresse.php` :

- la route exige **la session, POST, du JSON, le jeton CSRF et le même site** (`corps_ecriture`) ;
- **`https` seulement** (`http` si `ADRESSE_HTTP`), un port de `ADRESSE_PORTS` (443 ; 80 si http est permis), un nom DNS dont le
  dernier label porte une lettre (ni `2130706433`, ni `0x7f.1`, ni `127.1`) ou une IP littérale, ni identifiant, ni blanc, ni
  barre oblique inverse, l’ASCII visible seulement ; l’adresse que cURL lit est **recomposée** de ces morceaux vérifiés, port explicite ;
- le nom est **résolu par le serveur** (A et AAAA), et **toutes** ses adresses doivent être publiques : refus des réseaux privés, de
  bouclage, lien-local, partagés, multicast, réservés et de documentation en IPv4 ; en IPv6, seule la plage mondiale `2000::/3` moins
  ses exceptions ; une IPv4 **mappée**, NAT64 ou 6to4 jugée sur l’IPv4 qu’elle porte (`ip_interdite`) ; `ADRESSE_RESEAUX_PERMIS`
  ouvre un réseau choisi par l’administrateur, et lui seul ;
- la connexion est **épinglée** à l’adresse vérifiée (`CURLOPT_RESOLVE`), sans mandataire (`CURLOPT_PROXY` vide, `CURLOPT_NOPROXY`) :
  un DNS qui change de réponse entre la vérification et la connexion (rebinding) n’a pas d’effet ;
- les **redirections se suivent à la main**, 3 au plus, chacune revue comme la première (schéma, port, nom, résolution, adresses) ;
  `CURLOPT_PROTOCOLS` limité à HTTPS (et HTTP s’il est permis) : ni `file://`, ni `gopher://`, ni `dict://` ;
- **temps et taille bornés en flux** : `ADRESSE_DELAI` (30 s, redirections comprises) par `CURLOPT_TIMEOUT_MS` et
  `CURLOPT_PROGRESSFUNCTION`, `ADRESSE_OCTETS_MAX` (100 Mo) par `CURLOPT_WRITEFUNCTION`, une taille annoncée trop grande coupée à
  l’en-tête ; le corps d’une redirection ou d’une erreur est jeté (64 Ko au plus) ; le fichier passe par `php://temp` (au-delà de
  2 Mo, un fichier temporaire), jamais entier en mémoire PHP ;
- **aucun cookie**, aucun référent, un seul en-tête (`Accept`), l’agent `editeur-svg-site` ;
- la réponse : les **octets bruts**, `application/octet-stream`, `Content-Disposition: attachment`, `nosniff`, `no-store` ; le
  navigateur les lit comme un fichier déposé (§ 3, § 4) ; une erreur en JSON, avec son code et sa phrase en français ;
- **le journal** (`data/journal/adresses.log`) garde l’hôte (et l’hôte final après une redirection), la taille et le résultat,
  **jamais le chemin ni les paramètres** : un lien signé y porte son jeton, et un journal se lit plus largement qu’on ne croit ;
- **cURL est requis** : ces garanties tiennent à `CURLOPT_RESOLVE` ; sans cURL, la route répond que la fonction est indisponible.
  `ADRESSE_OUVERTURE` faux éteint tout (le champ disparaît, la route répond 404).

Pour les tests, la résolution se remplace par une table (`ADRESSE_RESOLUTION_ESSAI`, jamais définie en production) : aucun test ne
touche le vrai réseau.

## Conséquences

- **Octets** : aucun ne change ; `ecriture-stable` vert sans `ACTUALISER_REFERENCES`.
- **Tests** : unitaires — `model/adresse.test.ts` (validation, nom), `engine/natureOctets.test.ts` (chaque signature, HTML, fenêtre
  bornée), `io/adresse.test.ts` (options de la requête, CORS distingué d’une panne, statut, taille annoncée et flux coupés — un flux
  de 300 Mo lu jusqu’à 101 Mo —, délai, annulation), `io/serveur.test.ts` (POST et jeton, refus dits, jeton repris),
  `zones/ouvrirAdresse.test.ts` (reconnaissance, lien glissé, insertion) ; un **corpus hostile propre à l’adresse**
  (`tests/fixtures/hostile-adresse/`, 11 fichiers et leur `index.json` : « image » qui est un SVG à script, SVG à `<use>` distant, PDF
  tronqué, PDF à JavaScript nommé `.svg`, pages d’erreur HTML, texte brut, polyglotte GIF + SVG, entités et XXE ;
  `tests/unit/securite/corpus-adresse.test.ts`) ; PHP — `tests/php/adresse.php` (tables IPv4 et IPv6, noms numériques, découpage, puis
  par HTTP : session et CSRF, adresses privées littérales et par le DNS, rebinding, redirections, schémas, ports, taille, délai,
  en-têtes, journal) ; navigateur — `tests/e2e/ouvrir-adresse.e2e.ts` et `tests/e2e/site-php.e2e.ts`, en Chromium, Firefox et WebKit.
- `tests/e2e/menus.e2e.ts` compte une entrée de plus au menu Fichier de la page.
- **Limites, honnêtement** : la page autonome ne voit pas les redirections du navigateur ; la seconde demande opaque coûte une
  requête au serveur visé ; Playwright ne soumet pas une réponse servie par `route.fulfill` au contrôle CORS, le test rend donc ce que
  la page en voit (la demande lisible échoue, l’opaque aboutit) ; sur le site, la protection vise le réseau du serveur, pas le
  contenu (un fichier public quelconque se télécharge, comme la personne le ferait elle-même), et aucune limite de fréquence n’est
  propre à la route ; « Annuler » coupe le navigateur, le serveur finit sa requête dans ses bornes ; un service interne publié sous un
  nom et une adresse publics reste joignable (un pare-feu sortant reste la seconde ligne de défense) ; aucun essai sur un hébergement
  réel n’a été fait.

## Alternatives écartées

- **Décider le type sur l’extension ou le `Content-Type`** : l’un et l’autre se choisissent librement ; c’est précisément le vecteur
  « image qui est un SVG à script ».
- **Un mandataire tiers** (un service CORS public) pour la page autonome : l’adresse, l’IP et le fichier partiraient chez un inconnu,
  contre la promesse de l’ADR-0017 ; on dit le refus et on propose le téléchargement.
- **Accepter `http://`** dans la page autonome : un fichier réécrit en chemin, et un contenu mixte qu’une page en https refuserait
  de toute façon.
- **Suivre les redirections avec `CURLOPT_FOLLOWLOCATION`** : cURL résoudrait lui-même chaque nouvel hôte, sans notre vérification ;
  le rebinding et la redirection vers l’intérieur redeviendraient possibles.
- **Vérifier l’adresse puis laisser cURL résoudre** : la fenêtre entre les deux résolutions est celle du rebinding ; d’où
  `CURLOPT_RESOLVE`.
- **Une liste noire seule en IPv6** : on admet la plage mondiale `2000::/3` et on retire ses exceptions ; ce qui n’est pas
  explicitement public est refusé.
- **Insérer une image dans l’éditeur** en la vectorisant d’office : le réglage (fond, couleurs, finesse) est l’affaire de l’atelier ;
  le faire en silence donnerait un résultat qu’on n’a pas choisi.
