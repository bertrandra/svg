# CLAUDE.md — svg

Consignes pour travailler dans ce dépôt. Le contexte est dans `README.md` et `docs/adr/`.

## Le projet en une phrase

Un éditeur SVG autonome et embarquable, un convertisseur d'image en SVG, et une bibliothèque de
formes classées par événement. **Un SVG réécrit aujourd'hui doit l'être à l'identique demain** : un
changement qui déplace une coordonnée, un tracé ou un octet écrit est un événement de version
majeure, jamais une correction discrète.

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

- **Un dessin à plat, pas un DOM** (ADR-0001) : `engine/editionSvg.ts` lit un SVG (`util/xml.ts`,
  sans DOM) en chemins absolus M, L, C, Q, Z dans les coordonnées du plan de travail. Ce qui ne s'y
  ramène pas est refusé en le nommant ; un `<use>` se déplie en formes plates, cycles et renvois externes refusés.
- **Chaque opération est pure** et rend un nouveau dessin ; l'historique (`util/historique.ts`) est
  une pile d'états immuables, deux cents au plus, un geste continu fondu par sa clé.
- **L'éditeur ne connaît aucun magasin** : il reçoit un SVG, un nuancier, une bibliothèque et un `stockage`
  facultatifs (`io/stockage.ts`), rend un SVG à `enregistrer`. Ce qui est propre à la page vit dans
  `zones/Application.tsx`. Son état se partage par trois contextes (dessin, interface, actions ; ADR-0010).
- **Les gestes vivent dans le composant React**, par les évènements de pointeur de la toile ; le
  calcul reste dans le cœur pur.
- **Une forme se prend par le calcul, pas par le DOM** (ADR-0029) : `engine/prise.ts` (pur, mémorisé par forme) rend les
  candidates d'un point, avec une tolérance et une cible minimale en pixels d'écran (6 et 12 px à la souris, 12 et 24 au doigt) ;
  le clic, le double-clic et le survol l'appellent par `zones/PriseToile.tsx` ; Alt+clic passe dessous ; le curseur `move` n'est
  jamais posé sur la toile au survol (il restylerait chaque forme) ; le liseré de survol est en `--cyan` sur `--panneau`.
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
  GSUB en option). Jamais de `<text>` dans un SVG écrit ; vectoriser en trois modes ; au stylo, rien ne se remplit.
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
  fichier est vérifié par sha256 dans `io` avant d'être lu ; une variante s'écrit `c-…` avec sa version ; le réseau passe par `io/` (`policesEnLigne.ts`, `serveur.ts`).
- **Une police se voit avant de se télécharger, une ligne par famille** (ADR-0026) : le nom se dessine dans sa fonte, calculé
  sur place pour une police disponible (`engine/texte/apercuNom.ts`), préparé pour le catalogue dans `data/apercus-polices.json`
  (commis, refait à la main par `scripts/apercus-polices.mjs` après l'index, chaque fichier vérifié par sha256, jamais au
  build), livré dans l'annexe facultative `polices-apercus.js` validée sans lever ; l'aperçu est décoratif (`aria-hidden`,
  `currentColor`) ; une famille de plusieurs sources ne montre que la mieux placée de `PREFERENCE_SOURCES`, sauf filtre de source.
- **Le site PHP est un hôte, le projet est le JSON natif** (ADR-0030) : `dist/php/` (`public/` racine web, `data/` à côté,
  `DATA_DIR` dans `config.local.php`) ; un seul mot de passe en empreinte dans `data/pwd` ; `src/site/` monte l'éditeur, qui ne
  connaît toujours aucun magasin (`dessin`, `enregistrement`, `changement` facultatifs) ; le projet (`model/projet.ts`,
  `engine/projet.ts`) garde tout le modèle à pleine précision, se migre, se valide sans lever et réécrit le même SVG à l'octet ;
  les annexes de données passent par `definirSourceDonnees`, les polices du catalogue par le serveur, qui les vérifie ; toute
  route sous session, toute écriture sous jeton CSRF et révision.
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
