# ADR-0030 — Le site PHP et le projet JSON : un mot de passe, des projets natifs, le serveur pour seul interlocuteur

**Date :** 25 octobre 2026
**Statut :** acceptée (prolonge les ADR-0001, 0010, 0013, 0014, 0017, 0022, 0025, 0026 et 0028 ; amende la règle « un seul
`fetch` dans `src/` » de l’ADR-0025 et précise « Rien ne s’écrit sans le geste de fin » de l’ADR-0001) ; **aucun octet écrit ne
change** : la page autonome, le bundle d’embarquement et toutes les références d’écriture sont intacts

## Contexte

Demande du propriétaire : « Ajouter un mot de passe pour le login. Le fichier mot de passe est dans data/pwd sous public. Tu peux
sortir les json et les poser en dessous du répertoire public dans un répertoire data/json. Tu appelles le fichier principal index.
En PHP, la sauvegarde et l’ouverture des fichiers se font dans data/projets. Les fonts sont dans data/font. Un projet n’est pas le
SVG mais le JSON natif incluant tout. »

C’est une **nouvelle cible de déploiement**, à côté de la page autonome, qui ne change pas et reste sans serveur : un site PHP, où
l’on retrouve ses projets d’une session à l’autre, protégé par un seul mot de passe. Trois contraintes du dépôt pèsent : l’éditeur
ne connaît aucun magasin (ADR-0010) ; le cœur pur ne touche pas au réseau ; un fichier réécrit l’est à l’identique.

## Décision

### 1. L’arborescence livrée : `data/` à côté de la racine web

`npm run construire` écrit `dist/php/` (`scripts/site-php.mjs`, après la page et ses annexes ; rien n’est commis) :

```
dist/php/
  public/              la racine web : index.php, api.php, config.php, .htaccess, inc/ (le code, refusé en direct),
                       assets/site.js, assets/site.css, assets/vtracer.js, MENTIONS.txt
  data/                hors de la racine web : .htaccess (« Require all denied »), json/, font/, projets/ ;
                       pwd, connexions.json, secret, journal/, sessions/ se créent à l’usage
  outils/mot-de-passe.php
```

« Sous public » est ambigu : par sécurité, `data/` est **à côté** de `public/`, hors de portée du navigateur. Le chemin se règle par
une seule constante, `DATA_DIR` (défaut `__DIR__ . '/../data'`), posée dans `config.local.php` — un fichier que la livraison ne
contient pas, donc qu’une mise à jour n’écrase jamais. Pour un hébergeur qui impose tout sous la racine (`public/data`), le
`.htaccess` de `data/` refuse tout accès direct, et `index.php` **vérifie** que `data/pwd` ne répond pas par HTTP (une requête du
serveur vers lui-même, une fois par heure) : sinon il avertit l’administrateur, en tête de l’application, et dans le journal. Les
deux dispositions sont décrites dans `docs/deploiement-php.md`.

### 2. Un mot de passe, une session

- **Un seul mot de passe** pour le site, sans comptes. Il n’existe sur le serveur qu’en **empreinte** (`password_hash`, argon2id
  quand PHP l’a, bcrypt sinon) dans `data/pwd`, posée par `php outils/mot-de-passe.php` (ligne de commande seulement, saisie
  masquée, dix caractères au moins ; `--stdin` pour un script). Tant que `data/pwd` manque, `index.php` dit à l’administrateur la
  commande, et ne laisse entrer personne.
- `index.php` sans session valide montre le formulaire de connexion, rendu par le serveur (il marche sans JavaScript), en français,
  au vouvoiement, avec les styles et les jetons de la page (`assets/site.css`) ; l’erreur est liée au champ (`aria-describedby`,
  `aria-invalid`, `role="alert"`).
- `password_verify` (temps constant) ; la session : cookie `HttpOnly`, `SameSite=Strict`, `Secure` en HTTPS, identifiant renouvelé
  à la connexion (`session_regenerate_id`), sessions rangées dans `data/sessions` (pas dans un `/tmp` partagé), expiration après
  `SESSION_INACTIVITE` sans requête (deux heures par défaut), déconnexion.
- **Jeton CSRF** de session sur la connexion et sur toute écriture de l’API (en-tête `X-CSRF`, comparé par `hash_equals`) ; une
  requête d’un autre site (`Sec-Fetch-Site`) est refusée. Après une reconnexion dans un autre onglet, le client redemande le jeton
  à la session (`api.php?r=jeton`, lisible par la seule origine) et réessaie une fois : un travail ouvert ne se perd pas.
- **Limitation des essais** : trois essais libres par client, puis un délai qui double (2, 4, 8 s… jusqu’à 15 min), sans même
  regarder le mot de passe pendant l’attente ; comptés dans `data/connexions.json`, journalisés dans `data/journal/connexions.log`,
  où le client est une empreinte salée de son adresse, jamais l’adresse.
- Toute route d’`api.php` exige la session.

### 3. Le projet : le JSON natif, versionné, pur

`model/projet.ts` (types, bornes, validation, migrations) et `engine/projet.ts` (dessin ↔ projet), purs :

```json
{ "format": "editeur-svg/projet", "version": 1, "nom": "Carte de Noël",
  "creeLe": "2026-10-25T10:00:00Z", "modifieLe": "2026-10-25T11:00:00Z",
  "dessin": { "vb": [0, 0, 800, 600], "formes": [ { "id": "f1", "d": "M10 10L90 10L50 70Z", "remplissage": "#c81e28", … } ] },
  "production": { "contexte": "cricut", "machine": "maker", "tapis": "12x12", "materiau": "papier-cartonne", "procede": "decoupe", "unite": "mm" },
  "nuancier": [ { "nom": "Rouge", "hex": "#c81e28" } ],
  "ressources": { "polices": [ { "id": "u-…", "famille": "Ma fonte", "donnees": "<base64>" } ],
                  "images": [ { "role": "source", "nom": "photo", "type": "image/png", "donnees": "<base64>" } ] } }
```

- **Tout l’état utile** : chaque forme champ pour champ (styles, opacités, pointillés, bouts et jonctions, origines et mentions,
  texte vivant complet — chaîne, police `id`/version/famille, taille, interlettrage, interligne, alignement, ligatures, tracé
  Médian, matrice —, opération Cricut, verrouillage, visibilité, ordre), le plan de travail, le contexte de production et son choix,
  le nuancier, le nom, les dates. Une **fonte déposée** employée par un texte est incluse en base64 (son identifiant `u-…` est
  l’empreinte de ses octets : relue, elle est revérifiée) ; une police du catalogue ou livrée se désigne par son identifiant et sa
  version. L’**image source** d’une conversion est gardée quand le projet sort de la voie « Convertir une image ».
- `d` est le chemin en texte, **chaque nombre à sa pleine précision** (le plus court texte que `Number` relit, « -0 » compris) :
  le SVG s’écrit au millième, le projet garde le modèle. **Aller-retour exact** : projet → dessin → projet redonne le même projet et
  le même texte JSON ; le SVG écrit depuis un projet rouvert est celui écrit avant l’enregistrement, octet pour octet (vérifié sur
  toutes les références de `tests/fixtures/svg`).
- **Les dates sont posées par le serveur**, jamais par le cœur pur ; le serveur garde aussi la **révision** (l’ETag du projet).
- `lireProjet` **migre** (`MIGRATIONS`, une fonction par version, chaîne jamais tronquée ; vide tant qu’il n’y a qu’une version),
  **refuse en le nommant** un projet plus récent que le programme (« … format 2 ; cette version lit les projets jusqu’au format 1.
  Mettez le site à jour »), et **valide sans jamais lever** (ADR-0014) : chaque champ, sa forme, ses bornes (200 000 formes,
  24 millions de caractères de tracé, 32 fontes de 8 Mo, 4 images de 16 Mo, des peintures limitées comme à l’écriture), et
  reconstruit le projet dans un ordre de champs fixe — une clé de prototype ou un champ inconnu n’y entrent pas.
- **Le SVG reste un export** (« Télécharger le SVG », « Autres formats ») ; sur le site, « Enregistrer » écrit le projet JSON.

### 4. Les projets dans `data/projets`, par le serveur

`api.php` : lister (nom, dates, taille, révision, vignette facultative), ouvrir, enregistrer, renommer, dupliquer, supprimer. Pour
chaque projet, `<id>.json` (le projet), `<id>.meta.json` (sa fiche), `<id>.svg` (sa vignette). L’**identifiant sur le disque** est
tiré au hasard (16 chiffres hexadécimaux) et seul à fabriquer un chemin ; le nom affiché est à part, assaini (ni caractère de
contrôle ou de mise en forme bidirectionnelle, ni barre, ni points en tête, 120 caractères ; la même règle au client et au serveur).
Écraser demande la révision ouverte (`If-Match`) : celle d’un autre onglet est refusée (409), une absente aussi (428). Toute
écriture passe sous un verrou (`flock`), d’un seul geste (fichier temporaire puis `rename`). Le serveur valide la structure minimale
et le format (le client valide chaque champ), borne la taille (`PROJET_OCTETS_MAX`, 32 Mo), et re-sérialise sans perte
(`serialize_precision = -1`). Supprimer met le projet dans `data/projets/corbeille/`, horodaté ; l’interface demande confirmation
dans la ligne. La vignette est le SVG que l’éditeur écrit, refusée au moindre élément ou attribut actif, servie comme image inerte
(`Content-Security-Policy: …; sandbox`).

### 5. Un hôte de plus : l’éditeur ne connaît toujours aucun magasin

Le site est un **hôte**, comme la page autonome ou l’embarquement : `src/site/` (classé au niveau 6 de
`tests/unit/architecture.test.ts`, avec `zones` et `app`) monte l’éditeur sur un écran « Projets » (ouvrir, nouveau, renommer,
dupliquer, supprimer ; les trois voies de la page — fichier, image, bibliothèque — pour commencer un projet). L’éditeur reçoit de
nouvelles propriétés **facultatives**, sans effet pour les autres hôtes :

- `dessin` : le dessin du modèle à ouvrir tel quel (un projet rouvert), sans relire de SVG ; le contexte vient de `production` ;
- `enregistrer(svg, etat)` reçoit en second argument l’état du modèle (`{ dessin, production }`) : un hôte qui ne veut que le SVG
  l’ignore (le bundle d’embarquement ne le transmet pas) ;
- `enregistrement` : l’état que l’hôte annonce (`enregistre`, `modifie`, `en-cours`, `echec`, et sa phrase), affiché dans la barre
  d’état (« Enregistré », « Modifications non enregistrées »…), qui décide de ce qu’il reste à enregistrer et si fermer demande
  confirmation ; `changement` : chaque changement du dessin ou du contexte, d’où l’hôte déduit l’état (Ctrl+Z jusqu’à l’état
  enregistré redit « Enregistré ») ;
- `ctrlSEnregistre` et `actionsHote` (« Enregistrer sous… » dans le menu Fichier).

Quitter la page avec des modifications non enregistrées : le navigateur demande confirmation (`beforeunload`). Un projet vierge
part d’un plan sans forme, et les états vides le disent sans proposer d’« annuler » ce qui n’a jamais existé.

### 6. Ctrl+S enregistre, sur le site

« Rien ne s’écrit sans le geste de fin » (ADR-0001) devient : **rien ne s’écrit sans un geste explicite d’enregistrement**. Sur le
site, Ctrl+S **est** ce geste : il écrit le projet sur le serveur, sans fermer l’éditeur, comme « Enregistrer » — c’est l’habitude
de tout logiciel de dessin qui garde des documents. L’hôte le déclare (`ctrlSEnregistre`) ; partout ailleurs, Ctrl+S garde toujours
un brouillon et ne ferme jamais (la page, l’embarquement : inchangés). Rien ne s’écrit tout seul : ni à chaque modification, ni à
la fermeture sans le choisir (la confirmation propose « Enregistrer », « Abandonner », « Continuer l’édition »).

### 7. Les JSON et les polices servis par le serveur ; le réseau passe par `io/`

- Les **annexes de données** (bibliothèques, index et aperçus des polices, fontes livrées) sont **sorties en JSON** dans
  `data/json` et servies par `api.php` avec leur ETag, pour la cible PHP seulement : la page autonome garde ses annexes en scripts.
  `io/annexes.ts` reçoit une source de données (`definirSourceDonnees`) que seul le site pose ; une annexe marquée `donnees` s’y lit
  et se valide comme la globale d’un script. Le traceur, du code, reste un script (`assets/vtracer.js`).
- Les **fontes livrées** sont copiées dans `data/font` au build ; la liste `data/json/polices.json` les nomme.
- Une **police du catalogue** choisie se demande **au serveur**, par l’empreinte sha256 de son fichier (`api.php?r=police&sha=…`) :
  il la sert depuis `data/font/catalogue`, ou la première fois la télécharge depuis la source que l’index désigne (jsDelivr, repli
  Bunny ; GitLab, Fontshare — les adresses de `src/model/cataloguePolices.ts`, recalculées, préfixes réglables par
  `POLICES_SOURCES`), sans suivre de redirection, borné à 8 Mo, **vérifie son sha256**, la range, puis la sert. Une empreinte absente
  de l’index est refusée avant toute requête ; une empreinte fausse n’est jamais rangée. Le navigateur revérifie l’empreinte : **il ne
  contacte que le site**.
- La règle « un seul `fetch` dans `src/` » (ADR-0025) devient **« le réseau passe par `io/` »** : `io/policesEnLigne.ts` et
  `io/serveur.ts`, et rien d’autre (`tests/unit/zones/polices-en-ligne.test.ts`).

### 8. Sécurité

`Content-Security-Policy` sans aucun domaine tiers (`default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'
'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self';
frame-ancestors 'none'`), `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `X-Frame-Options`, `Cross-Origin-Opener-Policy`,
HSTS en HTTPS ; aucune erreur PHP affichée, un journal dans `data/journal/erreurs.log` ; `config.php` et `inc/` muets demandés
directement. Le détail est dans `docs/securite.md`, § 9.

## Conséquences

- **Octets** : aucun ne change (`ecriture-stable` vert sans `ACTUALISER_REFERENCES`) ; la page autonome et le bundle ne posent ni
  source de données ni serveur de polices.
- **Tests** : `tests/unit/model/projet.test.ts` (lecture, refus nommés, bornes, migrations, mutations au hasard sans exception),
  `tests/unit/engine/projet.test.ts` (aller-retour exact sur chaque référence d’écriture), `tests/unit/io/serveur.test.ts`,
  `tests/unit/io/annexes.test.ts` et `policesEnLigne.test.ts` (source JSON, serveur de polices de l’hôte),
  `tests/unit/zones/creerActions.test.ts` (Ctrl+S et l’état annoncé) ; **tests PHP** sans dépendance (`npm run test:php` :
  fonctions sur un dossier temporaire, puis le site par HTTP sous `php -S`, une source de polices simulée) ; **navigateur**
  (`tests/e2e/site-php.e2e.ts`, contre `php -S` sur `dist/php`). La CI lance les tests PHP dans le job `verifier`.
- **Pourquoi pas PHPUnit** : le site n’a aucune dépendance PHP, et un hébergement mutualisé n’aura pas composer ; un lanceur de
  cent lignes (`tests/php/outils.php`) suffit à dire l’attendu, et la CI n’a rien à installer.
- **Limites, honnêtement** : un seul mot de passe, donc pas de partage fin ni d’historique par personne ; la limitation des essais
  se compte par client (une attaque répartie sur beaucoup d’adresses n’est ralentie que par le coût de l’empreinte) ; les projets ne
  sont pas chiffrés sur le disque ; la vignette d’un très gros dessin (plus de 200 Ko) n’est pas gardée ; un projet vierge ne
  s’enregistre qu’avec une forme visible (comme « Enregistrer » partout) ; la corbeille ne se vide qu’à la main ; la vérification
  HTTP de `data/pwd` demande cURL ; aucun essai sur un hébergement réel (Apache, nginx, mutualisé) n’a été fait ici.

## Alternatives écartées

- **Le SVG comme projet** : il porte les contours et assez de `data-ed-*` pour rouvrir un texte, mais ni le nuancier, ni une fonte
  déposée, ni l’image source, ni la pleine précision du modèle ; le propriétaire veut le JSON natif.
- **`data/` sous `public/` par défaut**, comme la phrase le laissait lire : un `.htaccess` ignoré (nginx, `AllowOverride None`)
  exposerait l’empreinte du mot de passe et tous les projets. Hors de la racine par défaut, une constante pour l’autre cas, vérifié.
- **Laisser le navigateur télécharger les polices** comme la page autonome : l’adresse de la personne partirait chez un tiers, et la
  politique de sécurité devrait l’autoriser ; le serveur le fait une fois pour tous, vérifie, garde.
- **Enregistrer tout seul** (à chaque modification, ou en quittant) : contraire à l’ADR-0001 ; Ctrl+S et « Enregistrer » suffisent,
  et l’état visible dit ce qui ne l’est pas.
- **Des comptes** : hors de la demande ; un seul mot de passe, une session.
