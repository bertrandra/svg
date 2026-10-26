# CLAUDE.md — svg

Consignes pour travailler dans ce dépôt. Le contexte est dans `README.md` et `docs/adr/`.

## Le projet en une phrase

Un éditeur SVG autonome et embarquable, un convertisseur d'image en SVG, et une bibliothèque de
formes classées par événement. **Un SVG réécrit aujourd'hui doit l'être à l'identique demain** : un
changement qui déplace une coordonnée, un tracé ou un octet écrit est un événement de version
majeure, jamais une correction discrète (dans le même modèle de lecture : l'embarquement garde `plat`, la page lit en `riche`
depuis l'ADR-0012).

## Vérifier avant de pousser

Ce que lance la CI (`.github/workflows/ci.yml`, job `verifier`) — tout doit passer en local d'abord :

```bash
npm run verifier     # typecheck && lint && cliquet && test
npm run construire   # la page, la bibliothèque et les fontes se construisent
npm run test:php     # les tests du site PHP (tests/php/)
```

- `tests/unit/architecture.test.ts` impose les couches : `util/shell` → `geometry` →
  `model/plateforme` → `engine` → `core/io/render/export/interaction` → `ui` → `app/zones`. Une
  couche n'importe jamais une couche plus haute ; un dossier nouveau se classe dans `NIVEAU` avant
  d'exister.
- Le cœur pur (`util`, `model`, `engine`) ne touche ni au DOM, ni à l'horloge, ni au hasard, ni au
  réseau. L'appel à vtracer et au navigateur vit dans `io`.
- `tests/unit/model/bibliotheque.test.ts` lit le jeu d'icônes entier : chaque forme doit s'ouvrir
  dans l'éditeur, chaque événement garder au moins dix formes, et moins de 3 % des noms porter un
  mot anglais.

## Circuit d'une modification

1. Branche `claude/<sujet>` depuis `origin/main`. **Jamais de push direct sur `main`.**
2. `npm run verifier`.
3. Entrée dans `CHANGELOG.md`, sous `## [Non publié]` (Ajouté / Modifié / Corrigé), en français.
4. PR vers `main`, CI `verifier` et `navigateur` vertes, merge (commit de merge, pas de squash).
5. Un agent travaille dans un worktree sous `.claude/worktrees/` (ignoré par git) ; on le supprime, avec
   sa branche, dès que son travail est fusionné (`git worktree remove`, `git branch -d`). Un lien
   `node_modules` n'est jamais commité : `.gitignore` l'ignore, lien compris.

## Conventions

- Code et commentaires en français ; commentaires **sans accents** dans le code source, qui
  expliquent pourquoi. Textes de l'interface en français, avec accents, au vouvoiement.
- Messages de commit en français : un titre court, puis le pourquoi.
- Les tests vivent dans `tests/unit/<couche>/`, miroir de `src/`.
- Un index qu'on sait valide se lit par `au` (`util/tableaux.ts`), jamais par `!`.

## Décisions déjà prises

- **Un dessin en feuilles, pas un DOM** (ADR-0001, amendé par l'ADR-0012) : `engine/editionSvg.ts` lit un SVG (`util/xml.ts`,
  sans DOM) en feuilles de chemins absolus M, L, C, Q, Z dans les coordonnées du plan de travail ; les groupes sont un index
  (`parent`, `groupes`), les dégradés, motifs, découpes, masques et effets des valeurs en ligne. En lecture `plat`, ce qui ne s'y
  ramène pas est refusé en le nommant ; en `riche`, ce qui sort du sous-ensemble de l'annexe 5 l'est aussi ; un `<use>` se déplie
  (en riche, la structure de sa cible est gardée), cycles et renvois externes refusés.
- **Chaque opération est pure** et rend un nouveau dessin ; l'historique (`util/historique.ts`) est
  une pile d'états immuables, deux cents au plus, un geste continu fondu par sa clé.
- **L'éditeur ne connaît aucun magasin** : il reçoit un SVG, un nuancier, une bibliothèque et un `stockage`
  facultatifs (`io/stockage.ts`), rend un SVG à `enregistrer`. Ce qui est propre à la page vit dans
  `zones/Application.tsx`. Son état se partage par trois contextes (dessin, interface, actions ; ADR-0010).
- **Une forme de base est un chemin ordinaire, fait en pur** (ADR-0033) : `engine/edition/formesDeBase.ts` construit 26 formes dans
  la boîte du tracé à deux coins, avec des réglages bornés qui ne sont que de la session ; la forme posée ne garde pas ses réglages ;
  le nom se lit sur la géométrie ; une forme neuve ajoute un modèle, une icône, une place dans `GROUPES_FORMES` et une ligne à la
  référence `formes-de-base`, jamais un nouveau SVG d'entrée (il changerait le corpus du fuzzing).
- **Les proportions se verrouillent pour la session** : un bouton « Conserver les proportions » entre L et H (`zones/SectionPositionTaille.tsx`),
  coupé par défaut et retenu jusqu'à la fermeture (`etatEditeur.ts`, jamais écrit) ; posé, le coin, les champs et Alt+flèches gardent la
  proportion de la référence (`engine/proportions.ts`, pur : la boîte au moment du verrou ou du changement de sélection, gardée tant
  que la boîte la respecte, pour qu'une suite de frappes ne dérive pas) et Maj libère le temps du geste ; coupé, Maj garde les
  proportions comme avant ; une ligne (un côté nul) n'est pas contrainte.
- **Les gestes vivent dans le composant React**, par les évènements de pointeur de la toile ; le
  calcul reste dans le cœur pur.
- **Une forme se prend par le calcul, pas par le DOM** (ADR-0029) : `engine/prise.ts` (pur, mémorisé par forme) rend les
  candidates d'un point, avec une tolérance et une cible minimale en pixels d'écran (6 et 12 px à la souris, 12 et 24 au doigt) ;
  le clic, le double-clic et le survol l'appellent par `zones/PriseToile.tsx` ; Alt+clic passe dessous ; le curseur `move` n'est
  jamais posé sur la toile au survol (il restylerait chaque forme) ; le liseré de survol est en `--cyan` sur `--panneau`.
- **Choisir par une zone se calcule sur le tracé réel** (ADR-0035) : `engine/selection.ts` (pur, mémorisé par forme via
  `prise.ts`) prend toute forme dont la surface ou l'encre touche le cadre ou le lasso (« touchée », défaut) ou y tient entière
  (« dedans », `regleZone`) ; l'outil Cadre (B) commence même sur une forme, le Lasso (Q) ; Maj ajoute, Alt retire ; le geste vit
  hors de l'état de React (`zones/GesteZone.ts`, `ZoneToile.tsx`) ; les commandes qui choisissent vivent dans
  `zones/commandesSelection.ts`. F ouvre la palette des formes (ADR-0033), M les aimants.
- **Rien ne s'écrit sans le geste de fin** (« Enregistrer », le libellé de l'hôte par `libelleEnregistrer`, « Terminer »
  dans la page) ; Ctrl+S ne garde qu'un brouillon et ne ferme jamais ; récupérer un fichier (« Télécharger le SVG »,
  « Autres formats ») n'est pas un enregistrement ; le SVG réécrit passe par `nettoyerSvg` ; sur le site PHP, Ctrl+S est ce
  geste et enregistre le projet sans fermer (`ctrlSEnregistre`, ADR-0030).
- **La vectorisation est vtracer en WASM, épinglé, chargé à la demande** (ADR-0002) ; le réglage
  est pur et déterministe ; une image entièrement détourée n'est jamais tracée.
- **Les réglages fins du traceur ne sont que ce qu'on a touché** (ADR-0005) : une valeur égale à celle
  du mode se retire ; les valeurs par défaut se calculent (`valeursParDefaut`), elles ne se recopient
  pas dans l'interface ; le temps d'un essai se mesure dans `io`, jamais dans le moteur.
- **Les exports sont purs, le prétraitement n'existe que touché** (ADR-0018) : PDF, EPS, DXF, PNG `pHYs` et ZIP
  s'écrivent à la main, mêmes entrées mêmes octets ; les options d'export sont de session, jamais stockées, et partent
  neutres ; sans réglage de prétraitement, le traceur voit la source à l'octet (15 empreintes), dans un ordre d'étapes fixe.
- **La ligne médiane est du moteur pur** (ADR-0021) : masque d'Otsu, squelette de Guo-Hall, graphe élagué, cubiques ajustées ;
  aucun appel à vtracer ; des réglages qui ne sont que ce qu'on a touché, aux défauts mesurés sur l'image.
- **Les booléens aplatissent, l'éditeur rebâtit** (ADR-0004) : le moteur rend des segments droits, au style
  de la forme la plus basse ; l'éditeur rebâtit les courbes par défaut (`lisserBooleens`, réglage de session) ; `polygon-clipping` et `opentype.js` sont épinglés exactement.
- **Un bord de tracé se déduit d'une union, il ne se suit pas** (ADR-0015) : contour en forme et décalage unissent des
  morceaux qui partagent leurs arêtes exactes ; le type d'un nœud se lit sur la géométrie ; un échec réessaie à
  tolérance ×3 puis ×9, puis refuse en le nommant ; un outil neuf ajoute des références, n'en réécrit aucune.
- **Le texte reste vivant, le fichier porte des contours** (ADR-0022) : `Forme.texte` garde de quoi recomposer, composé en pur
  (`engine/texte.ts`) au-dessus d'une interface `Glyphes` ; le lecteur de fonte vit dans `io/polices.ts` (crénage GPOS, ligatures
  GSUB en option). Un texte vivant est une feuille ; jamais de `<text>` dans un SVG écrit ; vectoriser en trois modes, « lettres
  séparées » donnant en riche un groupe « Texte « … » » d'une forme par lettre (à plat, des formes à la racine) ; un `<text>` lu en
  riche devient un groupe de lettres (étape 13c) ; au stylo, rien ne se remplit.
- **Le texte se tape sur la toile** (ADR-0027) : un `<textarea>` transparent posé sur le texte porte le focus, la sélection et
  l'IME ; le curseur et la sélection se dessinent d'après `engine/texte/curseur.ts` (pur) ; une frappe est un geste d'historique,
  un texte vide n'est pas créé, Échap termine ; la barre de texte (`zones/BarreTexte.tsx`) porte le fréquent, le panneau garde
  tout ; le tracé « Médian » (`data-ed-trace`, seulement quand il vaut Médian) passe par la ligne médiane de l'ADR-0021 sur la
  glyphe rasterisée en pur, mémorisé par glyphe et par police.
- **Le texte épouse une forme, pur et lié par identifiant** (ADR-0031) : `TexteVivant.disposition` (sur ou dans, avec l'id de la
  forme) est absente d'un texte libre ; le calcul est pur dans `engine/texte/` (`trace.ts`, `surTrace.ts` : chaque lettre au milieu
  de son avance, tournée, jamais déformée ; `dansForme.ts` : largeur sur toute la bande de la ligne, dichotomie bornée), mémorisé
  par forme ; le texte se recompose quand sa forme change (même entrée d'historique), une forme disparue le rend libre ; le
  fichier écrit le rang de la forme, ou son tracé encodé si elle est masquée, seulement quand le lien existe.
- **Le texte déformé prend la silhouette de sa forme** (ADR-0032) : `disposition.mode: 'enveloppe'` (`forme`, `marge` 0,05 par
  défaut), calcul pur dans `engine/texte/enveloppe.ts` : une enveloppe verticale sur le contour extérieur (trous ignorés), exacte
  quand chaque verticale ne croise le contour que deux fois, le morceau du milieu et des rampes de pente fixe sinon ; contours
  rebâtis par `ajusterCubiques` ; curseurs et ligne médiane passent par la même enveloppe ; `dans` ne change pas d'un octet.
- **Les polices libres se téléchargent au choix, vérifiées** (ADR-0025) : un registre en données (`model/sourcesPolices.ts`,
  liste blanche OFL, Apache, UFL, CC0, ITF FFL avec badge) et un index commis (`data/catalogue-polices.json`, rafraîchi à la
  main par `scripts/catalogue-polices.mjs`, jamais au build) ; le choix d'une police non livrée vaut demande, et rien ne part
  sans ce geste (ouvrir la liste, chercher, voir les aperçus : aucune requête ; `policesEnLigne` faux chez un hôte) ; chaque
  fichier est vérifié par sha256 dans `io` avant d'être lu ; une variante s'écrit `c-…` avec sa version ; le réseau passe par `io/` (`policesEnLigne.ts`, `serveur.ts`, `adresse.ts`).
- **Une police se voit avant de se télécharger, une ligne par famille** (ADR-0026) : le nom se dessine dans sa fonte, calculé
  sur place pour une police disponible (`engine/texte/apercuNom.ts`), préparé pour le catalogue dans `data/apercus-polices.json`
  (commis, refait à la main par `scripts/apercus-polices.mjs` après l'index, chaque fichier vérifié par sha256, jamais au
  build), livré dans l'annexe facultative `polices-apercus.js` validée sans lever ; l'aperçu est décoratif (`aria-hidden`,
  `currentColor`) ; une famille de plusieurs sources ne montre que la mieux placée de `PREFERENCE_SOURCES`, sauf filtre de source.
- **Une seule liste de polices, avec tout, ce qui reste à télécharger marqué** (ADR-0034) : `zones/ChoixPoliceListe.tsx` (combobox
  et listbox ARIA, posée par un portail à la racine de l'éditeur), le calcul pur dans `zones/lignesPolices.ts` ; une police est
  locale si elle est livrée, déposée, lue ou gardée en cache (seules les clés se lisent) ; la marque est une icône et des mots,
  jamais la seule couleur ; seul le choix télécharge ; les tests passent par `tests/e2e/polices.ts`.
- **Le site PHP est un hôte, le projet est le JSON natif** (ADR-0030) : `dist/php/public/`, un seul dossier à envoyer par FTP, sans
  réglage (`data/` dedans, tenu par son `.htaccess` réécrit s'il manque et vérifié par HTTP, ou à côté : `index.php` le cherche
  dans son dossier, sinon en `../data` ; `data/inc/serveur-local.php` imite les `.htaccess` sous `php -S`) ; `src/site/` monte
  l'éditeur, qui ne connaît toujours aucun magasin (`dessin`, `enregistrement`, `changement` facultatifs) ; le projet
  (`model/projet.ts`, `engine/projet.ts`) garde tout le modèle à pleine précision en un seul format (`VERSION_PROJET = 1`,
  migrations vides, toute autre version refusée en la nommant), se valide sans lever et réécrit le même SVG à l'octet ;
  les annexes de données passent par `definirSourceDonnees`, les polices du catalogue par le serveur, qui les vérifie ; toute
  route sous session, toute écriture sous jeton CSRF et révision.
- **Les comptes du site** (ADR-0041) : `public/` ne garde que `index.php`, `api.php`, `.htaccess`, `assets/`, `aide/`, `MENTIONS.txt` et
  `data/` ; tout le code PHP vit dans `data/inc/` (entrées `entree-index.php` et `entree-api.php`, amorce, `comptes`, `session`,
  `jetons`, `courrier`, `langues`, `reglages`, `limitation`, `pages`, `projets`, `polices`, `adresse`, `compte.php` en ligne de
  commande), les constantes avancées dans `data/inc/config.php` et `data/config/config.local.php`, les réglages dans
  `data/config/config.json` (validé champ par champ, défauts, écrit à l'installation, « Réglages du site » pour un administrateur,
  mot de passe SMTP jamais renvoyé) ; un compte est un fichier `data/comptes/<id>.json` validé à la lecture (`compte_valide`, jamais
  lu au mieux), adresse unique normalisée, mot de passe en empreinte seule (argon2id, bcrypt sinon, dix caractères), rôle `admin` ou
  `utilisateur`, état `a-confirmer` → `en-attente` → `actif`, `refuse`, `suspendu` ; le premier administrateur se crée à la première
  visite tant qu'aucun compte n'existe (ou `php data/inc/compte.php --admin [--stdin]` : adresse, nom, mot de passe, langue, une par
  ligne), reprend les projets d'un site d'avant et supprime `data/pwd`, `data/password`, `data/connexions.json` : le mot de passe unique
  n'existe plus ; les sessions sont des jetons en fichier (`data/sessions/<sha256>.json`, cookie `svg_session`, anonyme pour le CSRF
  des formulaires, nouveau jeton à la connexion, marque de l'empreinte, état et rôle relus à chaque requête) ; les jetons des mails
  (`data/jetons/`, confirmation 48 h, réinitialisation 1 h à usage unique) sont rangés hachés ; le courrier part par `mail`, `smtp`
  (client minimal : STARTTLS ou SSL, AUTH PLAIN ou LOGIN, délais, rien en clair si STARTTLS est refusé) ou `fichier` (tests :
  `data/journal/courrier/*.eml`) ; les pages d'avant la connexion et les mails passent par `t()` (`langues.php`, dictionnaire
  `langues-en.php`, un test de couverture), langue du compte, sinon cookie `svg_langue`, sinon `site.langue` ; les projets vivent
  dans `data/projets/<compte>/` (corbeille dedans ; `corbeille-comptes/` à la suppression), un identifiant d'un autre compte est
  introuvable ; la limitation compte par client et par compte (`data/essais.json`), les demandes de mail par client ; l'API admin
  (`comptes`, `compte-*`, `reglages`, `courrier-essai`) refuse `dernier-admin` et `soi-meme` ; les erreurs sont `{erreur, message}`,
  codes en tête d'`entree-api.php` ; un vecteur nouveau entre dans `tests/php/` (unitaires, HTTP, faux SMTP).
- **Ouvrir depuis une adresse, le type sur les octets** (ADR-0036) : rien ne part sans « Ouvrir », un lien glissé ou une adresse
  collée seule ; le champ n'existe que si l'hôte pose `definirOuvertureAdresse` (page, site ; jamais l'embarquement) ; https
  seulement (`model/adresse.ts`) ; la nature se lit sur les octets (`engine/natureOctets.ts`), puis la lecture d'un fichier
  d'inconnu ; sur le site, `api.php?r=adresse` sous session et CSRF, anti-SSRF dans `inc/adresse.php` (toutes les adresses
  publiques, `CURLOPT_RESOLVE`, redirections à la main, journal limité à l'hôte) ; un vecteur nouveau entre dans
  `tests/fixtures/hostile-adresse/`.
- **Le nuancier se tire du dessin** (ADR-0037) : `DessinSvg.nuancier` (provenance, teintes, opacité à part) est posé à l'ouverture
  dans l'état initial (ce n'est pas une modification), vit dans l'historique, est gardé par le projet JSON, jamais écrit dans le
  SVG ; calcul pur dans `engine/nuancier.ts` (surface peinte, fusion OKLab ≤ 0,02 vers la couleur la plus large, plafond 24) ; le
  nuancier de la page ou de l'hôte reste un groupe à part ; Maj+N et Alt+Maj+N sont pris.
- **Le modèle v2 entre par des crochets, un dessin plat ne bouge pas** (ADR-0012, étape 0) : `estPlat` garde l'écriture d'avant,
  sans ligne commune avec `ecritureRiche.ts` ; une fonctionnalité est un fichier `engine/edition/fonctions/<nom>.ts` et une ligne de
  `catalogue.ts`, sa descente `engine/descente/<nom>.ts` ; la lecture `plat` (défaut de l'API et de l'embarquement) ne consulte aucune fonctionnalité ; un
  exporteur reçoit un `DessinPlat` par `aplatirPour` ; les références v1 sont gelées par `references-v1.sha256` ; le plan et les
  consignes des vagues sont dans `docs/adr/0012-annexes/08-plan-de-livraison.md`.
- **Les repères sont un réglage du document, les répétitions des formes ordinaires** (ADR-0038) : `DessinSvg.reperes` (au millième,
  triés, absent sans repère ; comme le nuancier, il ne rend pas le dessin non plat) passe par l'historique, s'écrit en
  `data-ed-reperes` sur la racine par `svgDocument` seulement s'il y en a, se garde dans le projet, jamais dans un export ; règles,
  visibilité et verrou sont de la session ; grille, radiale et symétrie sont pures (`engine/edition/repetition.ts`) ; la largeur
  variable est une conversion (`engine/contour/largeur.ts`), pas un style.
- **Les groupes sont des feuilles à `parent` et une table** (ADR-0012, étape 1) : `Forme.parent` nomme le groupe, `Dessin.groupes`
  porte nom, visibilité, verrou et opacité, sans matrice vivante (la transformation est cuite dans les feuilles) ; l'arbre se
  vérifie (`verifierDessin`) et `normaliser` le garde contigu ; les groupes descendent en dernier dans `REGLES_DESCENTE` (opacité
  multipliée) ; le projet les porte comme tout champ v2.
- **Une découpe est de la géométrie, rangée sur un groupe** (ADR-0012, étape 5) : `Groupe.decoupe` garde des feuilles canoniques
  (`feuilleDeDecoupe`) dans le repère du plan, une feuille découpée s'enveloppe dans un groupe ; l'écriture pose
  `<clipPath id="ed-c-…">` par empreinte ; la découpe suit la fermeture et rogne la boîte visuelle ; la descente rogne les
  remplissages par intersection booléenne, garde un trait entier et le dit ; une copie renumérote les contenus
  (`renumeroterContenus`) ; un vecteur nouveau entre dans `tests/fixtures/hostile/v2-decoupes-*`.
- **Les idiomes de filtres se reconnaissent par le calcul** (ADR-0012, étape 13b) : `edition/filtres.ts` (pur) évalue `feColorMatrix`,
  `feBlend`, `out` et `arithmetic`, jamais écrits, en simplifications exactes (aplat transparent, fusion avec une image transparente,
  identité, teinte en RVB linéaire si le filtre l'est, alpha durci), puis reconnaît flou et ombre ; l'ombre pleine de Figma exige des
  feuilles opaques (`verifierPleines`) ; un refus nomme l'idiome (`avecIdiome`), un nom qui n'accepte jamais rien.
- **Un masque d'opacité est un contenu peint, rangé sur un groupe** (ADR-0012, étape 6) : `Groupe.masque` garde type, région (boîte
  du plan) et contenu entier, lu par `edition/contenus.ts` (pile, tables et budget communs aux définitions) ; une feuille masquée
  s'enveloppe dans un groupe ; l'écriture pose `<mask id="ed-m-…" maskUnits="userSpaceOnUse">` par empreinte ; le contenu suit la
  fermeture par les `OutilsTransformation` du crochet `groupe` ; la descente l'ignore et le dit ; un vecteur nouveau entre dans
  `tests/fixtures/hostile/v2-masques-*`.
- **Un effet est un flou et une ombre, écrits aux formes exactes** (ADR-0012, étape 7) : `edition/fonctions/effets.ts` évalue les
  primitives et reconnaît le sous-ensemble (flou du graphique, ombre décomposée ou `feDropShadow`, les deux fusionnés), refuse toute
  autre primitive en la nommant ; l'ombre vit dans le repère du plan, le flou suit la matrice ; l'écriture pose
  `<filter id="ed-f-…" filterUnits="userSpaceOnUse">` sur une région mesurée sur la géométrie telle qu'elle s'écrit ; la descente
  les abandonne et le dit ; une prise posée hors d'une feuille ou d'un groupe est refusée en disant où (`refusHorsFeuille`) ;
  `ContexteEcriture.courant()` donne le contenu à mesurer ; un vecteur nouveau entre dans `tests/fixtures/hostile/v2-effets-*`.
- **Le modèle riche se règle et se voit par les crochets** (ADR-0012, étape 2) : le réglage `modele` (`svg.modele` dans le stockage
  injecté ; sans réglage lisible, `riche` dans la page et le site, `plat` ailleurs ; fixé, `plat` par défaut, chez un hôte qui embarque) ne décide que de la lecture ; la toile d'un dessin
  riche se rend par `engine/edition/rendu.ts` avec les crochets de l'écriture (ce qui se voit est ce qui s'écrit, définitions dans
  le même ordre), un dessin plat garde son DOM d'avant ; le contexte d'édition (`ui.contexte`) restreint prise, cadre, lasso et
  aimants aux frères (`candidatesDans`, `noeudsDansZone`, `ciblesAimants`) ; double-clic entre, Échap sort.
- **Le modèle riche est le défaut de la page, jamais celui de l'embarquement** (ADR-0012, étape 14, la bascule) : `MODELE_PAGE =
  'riche'` (`zones/modele.ts`) est le seul défaut de la page autonome et du site PHP, qu'ils passent par `modeleParDefaut` ; un
  stockage sans réglage lisible vaut ce défaut, la case « Groupes, dégradés, effets » du menu Édition ramène à plat (`svg.modele`) ;
  `EditeurSvg.ouvrir`, `estEditable` et le composant sans `modele` ni `modeleParDefaut` lisent `plat`, et le défaut de
  l'embarquement ne change pas d'une version à l'autre ; un refus propre au riche dit que la lecture à plat l'ouvrirait
  (`refusAvecRepli`) ; le corpus hostile porte `attenduRiche` et se lit dans les deux modèles ; un test de navigateur qui exerce un
  modèle le pose par l'option `modele` de session (après le chargement, jamais par un script d'amorce) ; le retour en arrière est le
  revert d'un seul commit.
- **Le contenu d'une découpe ou d'un masque se modifie par une lentille pure** (ADR-0012, paquet 8-D) : `engine/edition/lentilles.ts`
  (`contenuEnDessin`, `reposerContenu` : même objet sans changement, I1 renuméroté par `renommagesDe`, feuilles de découpe refixées,
  région d'un masque qui la suivait recalculée, plan jamais changé) ; contexte `{ groupe, dans, sous? }` lu par `niveauEdition`
  (`zones/lentille.ts`) ; dans une lentille, `dessin` est le dessin de travail et `complet` celui de l'historique (enregistrer, exporter
  et la production lisent `complet`) ; un geste reste une entrée d'historique ; un contenu vide refuse la sortie.
- **Le PDF écrit ce qu'il sait, par une scène native** (ADR-0012, étape 13a) : `CAPACITES_PDF` déclare natifs les dégradés, motifs,
  découpes, masques, images et groupes ; `aplatirPour` rend alors une `scene` (`engine/descente/scene.ts`) que `export/pdfNatif.ts`
  écrit (shading, pavage, `W n`, `/SMask`, groupe de transparence isolé, XObject) ; les PNG se décodent en pur, leur décompression
  injectée par `io/exportPdf.ts`, et se recompressent par `export/deflate.ts`, déterministe ; sans scène, le PDF d'avant à l'octet ;
  `phrasePertes(pertes, perdus)` dit « approché » ou « perdu » ; les effets restent abandonnés tant que le PDF n'a pas de résolution
  d'export.
- **Découpes, masques et effets se commandent en riche seulement** (ADR-0012, étape 8) : menu Édition sans raccourci ni bouton,
  commandes grisées avec leur raison (`zones/commandesContenus.ts`) ; libérer rend le contenu choisi dans le groupe devenu le
  contexte ; section Effets sur `poserEffets` (pur, bornes de la lecture, feuilles et groupes) ; pastilles des groupes en icônes puis
  mots ; « Insérer une image… » et le dépôt passent par `insererImage` (octets vérifiés comme à la lecture) ; le contenu d'un masque
  s'écrit en contours ; les contextes `decoupe`/`masque` restent à faire (8-D).
- **Les couleurs d'un dégradé ou d'un motif sont des couleurs du dessin** (ADR-0012, étape 13d) : listes, sélection, remplacements,
  nuances proches et palettes lisent les arrêts et les feuilles visibles de la tuile, jamais le repli, par `couleursDuCote`
  (`edition/couleurs.ts`) ; un remplacement passe par `remplacerCouleurs` (une table, une passe), garde partagée une peinture
  partagée et recalcule le repli comme la lecture ; un arrêt reste `#rrggbb` ; « même couleur » demande toutes les couleurs du modèle
  sur le même côté ; le contenu d'un masque n'y entre pas.
- **Un motif est une peinture en ligne, sa tuile un contenu à part** (ADR-0012, étape 9) : `edition/fonctions/motifs.ts` lit `<pattern>`
  par `contenus.ts`, le contenu dans le repère de la tuile, origine au coin (x, y) ; l'écriture pose
  `<pattern id="ed-p-…" patternUnits="userSpaceOnUse">` par empreinte ; la couleur de repli est la moyenne OKLab de la tuile ; ses
  identifiants forment un espace à part (pas de renumérotation, `verifierDessin` juge chaque tuile) ; `creerMotif` fait de la
  sélection la tuile ; la descente rend la couleur de repli et le dit ; un vecteur nouveau entre dans `tests/fixtures/hostile/v2-motifs-*`.
- **Un `<svg>` imbriqué et un `<text>` lu sont des groupes en riche** (ADR-0012, étape 13c) : `edition/fonctions/imbrications.ts` lit
  `svg` (cadre, viewBox et aspect cuits dans les feuilles par `matriceCadre`, fenêtre en découpe sauf `overflow` visible ou auto) et
  `text` (ses lettres en groupe « Texte « … » », ses prises posées par leurs fonctionnalités, la boîte des lettres par
  `poserBoiteConnue`) ; les écarts entre navigateurs sont dits (`MSG_IMBRICATIONS`) ; en plat, rien ne change ; un vecteur nouveau
  entre dans `tests/fixtures/hostile/v2-imbrications-*`.
- **Un dégradé se règle à l'inspecteur, la toile n'est qu'un raccourci** (ADR-0012, étape 4) : Uni / Linéaire / Radial seulement en
  modèle riche ou sur un dessin déjà riche ; opérations pures dans `engine/edition/degradesOperations.ts` (repli recalculé, positions
  bornées par les voisins, valeurs au millième) ; listbox des arrêts dans `zones/EditeurDegrade.tsx` ; poignées `role="slider"` dans
  `zones/PoigneesDegrade.tsx` (Tab y entre, flèches ±1 %, Maj ±10 %, Suppr) ; au-delà de 20 nœuds à effet, `data-brouillon` retire
  les filtres pendant un geste (`zones/brouillon.ts`) ; la toile rend une définition par élément, à la clé de son empreinte.
- **Les calques d'un dessin riche sont un arbre, ceux d'un dessin plat ne bougent pas** (ADR-0012, étape 2-B) : `zones/ArbreCalques.tsx`
  (treegrid, un seul arrêt de Tab, clavier de l'annexe 6 §1, Ctrl+Maj+flèches et « Déplacer vers… » en alternative au glisser), calcul
  pur dans `zones/lignesCalques.ts` et `zones/deplacerCalques.ts` ; fenêtré sur les lignes visibles (seuil 150, ligne active épinglée) ;
  choisir une ligne amène le contexte au groupe commun ; en Cricut, « À couper / À écrire » d'abord, l'arbre dessous pour un dessin
  riche ; le DOM de la liste plate est gardé par empreinte (`tests/fixtures/calques/plat.sha256.json`).
- **Les groupes se commandent en riche seulement** (ADR-0012, étape 2-C) : `zones/commandesGroupes.ts` (`groupesActifs` : le réglage
  riche ou un dessin déjà riche) porte Grouper (Ctrl+G), Dégrouper (Ctrl+Maj+G), Entrer (Entrée), Sortir (Maj+Entrée, Échap, clic hors
  du contexte) et « Télécharger le SVG à plat » (Fichier, pas un enregistrement) ; Combiner et Séparer y perdent leur raccourci ; Tab,
  Page suivante et Ctrl+A passent par `noeudsChoisissables(d, contexte)`, la liste d'avant pour un dessin plat ; le fil d'Ariane
  (`FilAriane.tsx`) rend le focus à la toile ; en plat, rien n'apparaît.
- **Un dégradé est une valeur en ligne, écrite par empreinte** (ADR-0012, étape 3) : `peintureRemplissage`/`peintureContour` gardent
  la couleur de repli (moyenne OKLab des arrêts) dans `remplissage`/`contour` ; la lecture `riche` résout `url(#…)` par
  `edition/resolution.ts` (chaîne `href` ≤ 16, 64 arrêts) ; l'écriture est canonique, dédoublonnée en `ed-d-<14 hex>` ; la descente
  rend la couleur de repli ; le projet le porte comme tout champ v2, ajouté par une ligne de
  `model|engine/projetV2/champs.ts`.
- **Une image intégrée est une feuille, vérifiée sur ses octets** (ADR-0012, étape 12) : `edition/fonctions/images.ts` ne lit qu'un
  `data:image/(png|jpeg|gif|webp);base64` en mode `riche`, nature et dimensions prises sur les octets ; une « image » SVG ou une
  adresse extérieure sont refusées en le nommant ; 4 Mo, 16 Mo par dessin, 64 millions de pixels ; la descente l'abandonne et le
  dit ; un vecteur nouveau entre dans `tests/fixtures/hostile/v2-images-*`.
- **Le stockage du navigateur ne porte que des conforts** (brouillon, versions, corrections) ; la page
  marche sans lui, et le cœur pur ne le voit jamais.
- **Une action primaire par panneau, le rare dans les menus** (ADR-0006) : un bouton est secondaire
  par défaut, seul `.primaire` est plein ; la barre garde l'outil fréquent, les menus (`Menu.tsx`) le
  reste avec son raccourci ; un panneau se range en `Section` ; au doigt, 40 px et `prefers-reduced-motion`
  respecté. Seule l'action de l'instant est pleine : un menu ou une confirmation ouverts, ou un contexte de
  production, rendent les autres secondaires (classes du cadre, sens inchangé).
- **Une couleur d'interface est un jeton** (ADR-0007) : `src/styles/jetons.ts` est la seule source (rôle, valeur
  claire et sombre, description) ; le CSS des variables se génère au build, la page n'écrit aucune couleur,
  un test confronte registre, page et code, et chaque texte sur son fond tient 4,5:1 dans les deux thèmes.
  `docs/jetons.md` se régénère par `ACTUALISER_REFERENCES=1 npx vitest run tests/unit/styles`.
  Une taille de texte aussi : cinq rôles en rem (`src/styles/typographie.ts`, `--texte-*`), et un espacement, un
  rayon ou une couche (`src/styles/espaces.ts`) : rien d'écrit en dur ; le système visuel est décrit dans `DESIGN.md`, le produit dans `PRODUCT.md`.
- **L'accueil guidé mène à la première retouche** (ADR-0019) : une visite de cinq étapes sur le vrai éditeur, qui avance sur le
  geste réel, sans voile, bulle sur la toile ; elle ne s'ouvre que demandée (accueil, menu Aide, `visite: true` chez un hôte) et
  se retient par `svg.guide` dans le stockage injecté ; un repère est une note dans le flux, jamais répétée ; un état vide dit ce
  qui viendra et propose un geste discret (`commun/EtatVide.tsx`).
- **Un accueil par public** (ADR-0024) : « Pour quoi dessinez-vous ? » ne ferme aucune porte (« Passer », les trois voies
  toujours dessous) ; la réponse se retient par `svg.accueil` dans le stockage injecté et ne fait que ranger : le circuit,
  l'ordre des voies, le contexte de départ de l'éditeur (`production`, qu'une marque du fichier remplace ; aucun octet sans
  geste). La visite reste en Générique ; les tests voient la première visite, `publicAccueil` (`tests/e2e/aide.ts`) pose une réponse.
- **La lecture est fidèle, ou dit ce qu'elle perd** (ADR-0009) : l'alpha, les noms de couleur et une épaisseur
  de trait nulle sont gardés ; `lireDessin` rend `ignores` et la page le dit à l'ouverture. Les octets
  changent par décision relue (`ACTUALISER_REFERENCES=1`), jamais par effet de bord.
- **Un SVG d'inconnu se lit, il ne se nettoie pas** (ADR-0014) : analyse linéaire bornée qui ne développe aucune
  entité, liste blanche réémise (`util/assainirSvg.ts`), lecture qui refuse sans jamais lever ; stockage et options
  d'hôte validés ; un vecteur nouveau entre dans `tests/fixtures/hostile/` avec sa ligne d'`index.json`.
- **Un PDF se lit en formes, le texte en lettres** (ADR-0020) : lecture pure et bornée, décompression injectée par `io`, une
  police absente est remplacée par la règle de `model/polices.ts` et c'est dit ; ce qui n'est pas repris passe par `ignores`.
- **On mesure avant de corriger la performance** (ADR-0008) : une liste longue se fenêtre (seuil 150), ce qui
  dépend d'une forme immuable se mémorise par forme, et l'historique limite ses états sur un gros dessin.
- **L'éditeur se pilote et se lit sans souris** (ADR-0011) : un geste d'édition a son équivalent clavier (Tab,
  Alt+flèches, réticule), une seule région vocale `polite` le dit, Tab ne piège jamais le focus, et
  `axe-core` échoue sur toute violation grave en test de navigateur ; aucune règle d'audit n'est désactivée.
- **Les navigateurs promis sont un texte qu'un test relit** (ADR-0016) : `docs/navigateurs.md` liste chaque fonctionnalité
  et son repli ; une garde de démarrage nomme ce qui manque ; ni `:has()` ni lookbehind, `color-mix()` doublé d'un jeton
  `repli-*` ; la CI joue chromium, firefox et webkit ; chromium et firefox bloquent, webkit pas avant son premier passage vert en CI ;
  aucun test ne saute (le contraste forcé s'émule dans les trois) ; un focus déplacé par une touche passe par `focusAuClavier`.
- **Un contexte de production configure et juge, il n'invente pas d'outil** (ADR-0013) : un profil en données
  (`model/contextes.ts`, valeurs incertaines marquées `aVerifier`) règle les outils existants et rend des constats
  purs (`engine/preparation.ts`), chacun avec sa correction annulable ; « Générique » n'écrit aucun octet de plus,
  le contexte se garde en `data-ed-*` sur la racine ; seul l'export écrit des unités physiques. Millimètre par défaut, pouce retenu ;
  un point « à corriger » demande une confirmation, jamais un bloquant de plus.
- **Le tapis fixe, la feuille et « Dupliquer sur la feuille »** (ADR-0039, révisé le 26 octobre 2026 : le tapis fixe est le défaut) :
  `ChoixMachine.recalage?: true` (case « Recalage automatique », décochée par défaut ; cochée, le gabarit suit le dessin et l'export est
  celui d'avant à l'octet) ; sans recalage, le plan est le tapis (`engine/preparation/tapis.ts` : `planPourChoix` au choix du contexte,
  une entrée d'historique ; `planDOuverture` dans l'état initial d'un fichier ouvert en Cricut, pas une modification ; un plan déjà de
  la taille du tapis est gardé, sinon le dessin à 2 mm du coin de la zone utile ; Générique ne change rien), le tapis se fixe au coin
  du plan (`cadreFixe`, `gabaritDuTapis`), `hors-tapis` dit une forme hors de la feuille, jamais déplacée en silence ;
  `ChoixMachine.feuille?` (depuis le coin du tapis, absente pour le tapis entier, jeton `--feuille-tapis`) ; `data-ed-recalage="oui"`
  (un ancien « non » se lit décoché et ne se réécrit pas) et `data-ed-feuille` sur la racine seulement hors du défaut, dans le projet,
  jamais dans un export ; sans recalage, l'export pose le tapis pour plan et un cadre de repérage par couleur (`export/reperage.ts`),
  à attacher puis passer en « Guide » (`DESIGN_SPACE_POSITION`, témoin 10, le cas par défaut, `aVerifier`) ; « Dupliquer sur la
  feuille » est pur (`engine/preparation/placement.ts` : simple par boîtes, avancée sur les contours réels qui rend le meilleur des
  deux), par tranches d'essais dont `io/placement.ts` mesure le temps, une seule entrée d'historique.
- **Les liens des îlots se calculent, ils ne se dessinent pas** (ADR-0040) : un îlot est un anneau intérieur de la région peinte d'une
  forme pleine à couper (ni à écrire, ni miette sous 0,5 mm, ni trou bouché par une forme de même couleur) ; `engine/preparation/liens.ts`
  (pur, mémorisé par forme) pose `nombre` liens de `largeur` (2 mm et 3 par défaut, de 0,5 à 10 mm et de 1 à 12) au plus court, loin
  des coins, rognés à la seule matière de leur polygone ; `ajouterLiens` est une entrée d'historique sur toutes les formes choisies ;
  le constat `ilot` (à corriger, « Ajouter des liens » ou « Régler les liens… », `zones/PanneauLiens.tsx`) dit aussi qu'un autocollant
  peut l'ignorer ; tant qu'on n'ajoute pas de lien, aucun octet ne bouge.
- **L'aide est une icône, les documentations des pages livrées** : le menu Aide (`zones/AideEditeur.tsx`) est un point d'interrogation à
  droite, avant Fichier ; il porte la visite, les raccourcis et les documentations que l'hôte pose (`zones/documentation.ts`,
  `definirDocumentation` : la page et le site seulement, jamais l'embarquement), ouvertes dans un nouvel onglet (`noopener`) ; le guide
  et le mode Cricut s'écrivent dans `outils/aide/` (texte, `src="img:<nom>"`, captures `images/*.webp` refaites à la main sur
  l'application), `scripts/documentation.mjs` les rend d'un seul tenant dans `dist/aide/` (images et fontes en data: URI, aucune
  requête), le site les sert dans `public/aide/` ; chaque page passe axe-core sans violation (`tests/e2e/documentation.e2e.ts`).
- **L'interface en français et en anglais** (ADR-0042) : la clé d'un texte est la phrase française (`t('Annuler')`, `util/i18n.ts`,
  `{valeurs}` interpolées, repli sur la clé), `pluriel(n, mot, plurielIrrégulier?)` passe par `t`, `nombre` et `locale` formatent selon la
  langue (plus un seul `'fr-FR'` dans `src/`) ; `fr` par défaut partout, la langue est un état de module posé avant tout rendu par
  `preparerLangue` (`io/langue.ts`) et **aucun octet écrit n'en dépend** ; un dictionnaire par langue dans `src/i18n/en/<dossier>.json`
  (clés triées, `npm run langues` les fusionne en l'annexe `langue-en.js`, chargée seulement en `en`, absente : français et c'est dit) ;
  réglage `svg.langue` (page : accueil et menu Aide, puis `location.reload()`), option et prop `langue` chez un hôte, le geste de
  changement posé par l'hôte (`definirChangementLangue`, jamais l'embarquement) ; `tests/unit/i18n/couverture.test.ts` exige la
  traduction de chaque clé de `t` et de `pluriel`, refuse les orphelines, et tient le cliquet des textes français hors `t`
  (`tests/fixtures/i18n/restes.json`, baissé par `ACTUALISER_REFERENCES=1`, jamais remonté ; `npm run i18n:restes`) ; les données
  (événements, machines, formes de base, lexiques, jetons) sont exclues du cliquet (`tests/fixtures/i18n/exclus.json`) et se traduisent
  à l'affichage ; un test de navigateur pose la langue par l'option `langue` de session.
- **Couper ou écrire se choisit par forme** (ADR-0028) : `Forme.operation` est absente tant qu'on ne l'a pas choisie, une règle
  pure la propose (`engine/preparation/operations.ts` : au stylo tout s'écrit, sans fond ou texte à trait unique s'écrit, plein
  se coupe) ; le fichier ne garde `data-ed-operation` qu'en Cricut et hors de la proposition, jamais dans un export ; un dessin
  mêlé s'exporte en archive (à couper, à écrire, combiné), son comportement dans Design Space reste `aVerifier` ; l'aperçu de la
  machine est une vue, jamais écrite.
- **La bibliothèque est game-icons.net, pas des emoji** (ADR-0003) : des silhouettes pleines, un
  nom traduit par le lexique (`model/lexique.ts`, un mot inconnu reste en anglais et s'ajoute là),
  un classement par règles (`model/bibliotheque.ts`, mots-clés et exclusions), jamais à la main.
  Elle se construit dans `dist/`, rien n'est commis.
- **D'autres sources libres sont des données** (ADR-0023) : `model/sourcesFormes.ts` décrit chacune (paquet épinglé, licence
  MIT, ISC, Apache 2.0, CC0 ou CC BY seulement, variantes `plein` ou `ligne`, exclusions de marques) ; une annexe par source,
  chargée à la demande ; le lexique des sources libres ne change aucun nom de game-icons ; moins de 3 % d'anglais par source.
- **La mention voyage avec la forme, les licences ne se recopient pas** (ADR-0017) : `Forme.origine`, un `<metadata>`
  CC BY 3.0 et `data-origine` n'existent que pour une forme créditée ; `THIRD-PARTY-NOTICES.md` se génère depuis
  `model/credits.ts` et le `package-lock.json` ; le projet est propriétaire ; la page autonome ne contacte aucun serveur sans un geste qui le demande (ADR-0025).
