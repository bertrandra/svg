# ADR-0012 — Modèle v2 : groupes, masques, dégradés, texte vivant, effets

**Date :** 24 octobre 2026
**Statut :** proposée (remplace en partie l'ADR-0001, « un dessin à plat, pas un DOM » ; précise l'ADR-0004 §2 et
la règle « une forme par lettre » ; prolonge l'ADR-0009) ; **événement de version majeure**

**Avancement (25 octobre 2026) :**

- Les étapes 10 et 11, **texte vivant (moteur et interface), sont faites** sur le modèle à plat d'aujourd'hui, sans attendre les
  groupes : voir l'[ADR-0022](0022-le-texte-vivant-la-vectorisation-et-le-trait-unique.md), qui précise le §4 et l'annexe 4
  (texte entièrement encodé en pourcentage ; pas de `<title>` ; « Vectoriser le texte » en trois modes plutôt qu'un groupe d'une
  forme par lettre ; une matrice de composition qui suit chaque transformation ; une garde qui vectorise le texte quand un outil
  change son tracé sans le connaître), puis les ADR-0027 (saisie sur la toile), 0031 (texte sur et dans une forme, le « texte sur
  tracé » que le §4 reportait après la bascule) et 0032 (texte déformé).
- **L'étape 0, coutures, est faite** (aucun comportement ne change, aucun octet écrit ne bouge) : toute la surface de types,
  l'arbre dérivé et ses invariants (`edition/arbre.ts`), les points d'extension de la lecture, de l'écriture et des
  transformations (`edition/fonctionnalites.ts`, `catalogue.ts`), l'écriture riche en squelette (`ecritureRiche.ts`), les
  définitions par empreinte (`definitions.ts`), la descente (`engine/aplatir.ts`) et les gardes-fous (manifeste des références
  v1, loi du dessin plat, contrat des fonctionnalités, harnais `ecriture-stable-v2`, extensions de l'écriture permise, champs du
  projet). Le détail est à l'annexe 8 §0.
- **Révision du plan** (annexe 8 §0 et §3) : ce que les ADR fusionnés depuis ont rendu caduc ou déjà fait (texte vivant,
  `util/empreinte.ts`, `<text>` étranger lu en lettres, corpus hostile, CI à trois moteurs, exports DXF/EPS/PDF CMJN), ce
  qu'ils ont ajouté (le projet JSON de l'ADR-0030 doit porter le modèle v2 ; la prise par le calcul de l'ADR-0029 ; les deux
  groupes « À couper / À écrire » de l'ADR-0028 dans les calques ; la vignette du site PHP), les vagues revues (vague 1 : étapes
  1, 3, 12 ; vague 2 : 2, 4, 5, 7) et les consignes de chaque paquet d'agent (annexe 8 §5). Les autres étapes restent proposées.
- **L'étape 12, images, est faite pour le moteur** (26 octobre 2026, annexe 8 §5.3) : `<image>` en `data:` lue en mode `riche`
  en une feuille (son rectangle en `d`), vérifiée sur ses octets (nature, en-tête, 4 Mo, 16 Mo, 64 millions de pixels ; une
  « image » SVG ou une adresse extérieure refusées en les nommant), écrite en `xlink:href` (mêmes entrées, mêmes octets), qui suit
  ses transformations, abandonnée et dite par la descente des exporteurs de tracés. Restent, chacun à son étape : l'affichage sur la
  toile et le refus des points (étape 2), le branchement dans le projet JSON (après l'étape 1, fonctions prêtes), l'image native du
  PDF (13a), et une interface d'insertion qu'aucune étape ne prévoit encore (annexe 8 §0).

Les annexes, dans [`0012-annexes/`](0012-annexes/), portent les types, les tables et le plan ; cette page porte
les décisions et leurs raisons.

## Contexte

Le propriétaire a validé, en entier, l'extension de l'éditeur aux besoins d'un outil professionnel : **groupes
imbriqués**, **masques de découpe et d'opacité**, **dégradés et motifs**, **texte vivant** (modifiable, converti en
contours sur demande) et **effets** (flou, ombre portée), sans rien perdre de ce qui fait la confiance du
projet : « un SVG réécrit aujourd'hui doit l'être à l'identique demain » (`CLAUDE.md`), des opérations pures sur
des états immuables, un SVG déterministe, 27 SVG de référence et 4 134 empreintes de bibliothèque qui ne
bougent pas, l'accessibilité de l'ADR-0011 et la tenue sur des milliers de formes de l'ADR-0008.

Ce qu'on lit dans le code :

- **Le dessin est `{ vb, formes }`**, une liste ordonnée de chemins absolus M, L, C, Q, Z dans le repère du
  plan (`edition/types.ts`). La lecture (`lecture.ts`, `parcours.ts`) **fond** les groupes, cuit leur matrice
  dans les chemins, y multiplie l'opacité de groupe sur chaque forme, déplie les `<use>`. Elle **refuse** en le
  nommant tout ce qui ne se ramène pas à des chemins pleins : `clip-path`, `mask`, `filter` (`heritage.ts`,
  `refusDe`), `url(…)` en peinture, `text`, `image`, `svg` imbriqué, `switch` (`parcours.ts`, `NON_PRIS`).
- **L'écriture est un seul endroit** (`ecriture.ts`) : un `<path>` par forme visible, aucun `<g>`, aucun
  `<defs>`, **aucun `id`**, un ordre d'attributs fixe, un cache par forme (`cacheEcriture`, ADR-0008).
- **L'historique** (`util/historique.ts`) est une pile d'états immuables ; une opération qui ne change rien rend
  le même objet.
- **L'étendue du changement** : 97 fichiers (`src` et `tests`) importent `Forme`, `DessinSvg` ou `editionSvg` ; 39
  fichiers de `src` lisent `.formes` (110 occurrences ; 62 dans `engine/`, 2 dans `export/`, 46 dans 20 fichiers de
  `zones/`). Une `Forme` ne se construit de toutes pièces qu'à **quatre** endroits (mesure par essai de typage,
  annexe 1 §7).
- **Dix des 27 SVG d'entrée de référence contiennent `<g>`.** Une lecture qui garderait les groupes ferait
  bouger leurs références : la politique d'octets doit donc distinguer **ce qu'on lit** de **ce qu'on écrit**.
- `util/svg.ts` (`nettoyerSvg`) passe des expressions régulières sur tout le texte, valeurs d'attribut comprises :
  tout texte saisi par l'utilisateur et écrit dans un attribut en subit les effets (annexe 2 §6).
- `grep` ne trouve aucune lecture de `mix-blend-mode`, `isolation` ni `paint-order` : ils se perdent
  aujourd'hui sans être dits (ADR-0009 : « fidèle, ou dit ce qu'elle perd »).

## Décision

### 1. Le modèle : des feuilles à plat, des groupes en index, des valeurs en ligne

`dessin.formes` reste **la liste ordonnée des feuilles** (ordre de peinture = parcours en profondeur). On ajoute :
`Forme.parent?`, une table `DessinSvg.groupes?` (`Record<id, Groupe>`, absente d'un dessin plat), des champs
facultatifs de feuille (`peintureRemplissage`, `peintureContour`, `effets`, `texte`, `image`) et, sur les groupes,
`opacite`, `decoupe`, `masque`, `effets`, `visible`, `verrouille`, `nom`. `DessinSvg extends Contenu` où
`Contenu = { formes, groupes? }`, le même type servant de contenu à une découpe, un masque ou une tuile de motif
(les mêmes opérations s'y appliquent). **Invariants** (annexe 1 §5) : ids uniques, arbre sans cycle de profondeur
≤ 64, **contiguïté** des feuilles d'un groupe dans `formes`, pas de groupe vide, couleur de repli non nulle
sous une peinture non unie, et « un dessin sans `groupes` ni champ v2 est plat et se comporte à l'identique ».
L'arbre est une **vue dérivée** mémoïsée (`arbreDe`) pour l'interface.

Quatre points de conception qui en découlent, chacun avec ses raisons (annexe 1) :

- **Transformations cuites, pas de matrice vivante** : un groupe n'a pas de `transform`. Tout reste dans le repère
  du plan ; boîtes, aimants, booléens, points, PDF ne changent pas. Les peintures, découpes, masques et effets
  d'un groupe se transforment avec lui (« règle de la fermeture », annexe 1 §9).
- **Pas de table de définitions** : dégradés, motifs, découpes, masques et effets sont des **valeurs en ligne**
  de l'élément qui les emploie ; le partage SVG (`id`, `url(#…)`) n'existe qu'à la lecture et à l'écriture.
- **Unités du plan seulement** : `objectBoundingBox` et consorts se résolvent à la lecture ; l'écriture est
  toujours `userSpaceOnUse`. Une relecture d'un fichier écrit est un point fixe.
- **Couleur de repli** : sous une peinture non unie, `remplissage` vaut une couleur plausible (moyenne OKLab) ;
  tout code qui ne connaît que les couleurs unies (descriptions, PDF, palettes) continue de compiler et de
  produire quelque chose de raisonnable.

**Choix de l'agencement** (annexe 1 §7 et annexe 3) :

| Option | Verdict |
|---|---|
| **A. Arbre complet** (`racine: Noeud`, groupes contenant des enfants) | Rejetée comme **base**. Sémantiquement la plus nette, mais 39 fichiers de `src` et 97 importeurs changent d'un coup, toutes les opérations se réécrivent, il n'y a pas d'étape « verte » intermédiaire (la migration serait une seule branche longue, sans filet d'octets), et chaque opération par id demande un index id→chemin à reconstruire. Garder l'arbre **dérivé** donne ses avantages d'interface sans ce coût. |
| **B. Feuilles à plat + `parent` + table de groupes** | **Retenue.** Un champ facultatif ne casse rien (essai : 0 erreur de type) ; chaque opération qui agit par id sur des feuilles reste correcte ; les autres se corrigent derrière `estPlat`, étape par étape ; un dessin plat prend littéralement l'ancien chemin. |
| **C. Feuilles à plat + `chemin: string[]`** (les ancêtres recopiés dans chaque feuille) | Rejetée : même information que B, mais déplacer ou renommer un groupe réécrit toutes ses feuilles. |
| **D. Groupes comme feuilles à `membres`** | Rejetée : l'ordre de peinture devient ambigu et la contiguïté n'a plus de garde. |

**Comportement sur les groupes** (annexe 3 §2, tableau complet) : une sélection est un tableau d'ids de nœuds ;
transformer, aligner, ordonner, dupliquer, supprimer, masquer et verrouiller agissent sur le **nœud** (un groupe
est une unité) ; modifier une peinture sur un groupe l'applique à ses feuilles ; `combiner` et les booléens exigent
des feuilles de **même parent** et le disent sinon ; `regrouper` ne réunit que des voisines de même parent ;
visibilité et verrou **s'héritent** sans écrire dans les enfants ; les remplacements de couleur descendent dans
les groupes mais pas dans les masques ; l'isolement affiche aussi les ancêtres.

### 2. Lecture et écriture : deux modes, une garde, des identifiants par empreinte

- **`lireDessin(svg, { modele })`** : `plat` (défaut de l'API, **le contrat actuel, figé**) ou `riche`. L'écriture n'a
  pas de mode : elle écrit ce que le modèle contient.
- **Garde de forme plate** : `ecrireDessin` commence par `estPlat(d)` ; si vrai, c'est le corps actuel, sans une ligne
  partagée avec le chemin riche. Pas de `<g>` sans groupe, pas de `<defs>` sans définition employée, aucun `id`
  hors des définitions, même ordre d'attributs, même `nb` ; les nouveautés **s'ajoutent après** les attributs
  actuels. Les 27 références, les 4 134 empreintes et le PDF/SVG de découpe d'un dessin plat n'ont aucune raison
  de bouger, et un manifeste d'empreintes (`references-v1.sha256`) l'impose (annexe 7 §2).
- **Identifiants de définition par empreinte du contenu** (`ed-<genre>-<14 hex>`, hachage 53 bits pur) : jamais de
  collision avec un `id` existant (l'écriture n'en pose pas d'autre), ni entre deux SVG insérés dans une même
  page (même `id` ⇒ même contenu), dédoublonnage gratuit, déterministe.
- **Marqueur `data-ed-modele="2"`** sur `<svg>`, posé seulement quand le dessin n'est pas plat, justifié : un
  marqueur plus récent que le programme est **refusé** (jamais lu « au mieux »), et il signe l'origine du fichier.
  Il n'est pas requis pour lire.
- **Ce qui change d'octets, seulement** : un fichier à `<g>` ouvert en `riche` se réécrit **avec** ses groupes
  (décision de version majeure, ADR-0009 ; 10 références reçoivent un jumeau `riche`, annexe 2 §3) ; tout ce qui
  était refusé devient écrivible. Une exportation **« SVG à plat »** rend à tout moment les octets de l'ancien
  contrat.
- **`<use>`** : on **garde le dépliage** (cibles indépendantes, bornes de l'ADR-0009). En `riche`, la structure de
  la cible (ses `<g>`) est gardée. Les symboles et instances préservés exigeraient une table de définitions
  partagées, une identité de définition dans l'historique et une interface d'instances, pour un gain qui ne se
  voit pas dans le SVG écrit (annexe 2 §2).
- **`<image>`** : une feuille (son rectangle en `d`), `data:` seulement, plafonds de taille et de pixels lus dans
  l'en-tête (annexe 4 C). Format complet, ordre des attributs, nombres : annexe 2 §3 à §5.

### 3. Refus et `ignores`

Le mode `plat` refuse exactement comme aujourd'hui. Le mode `riche` **prend en charge** : groupes, découpes,
masques, dégradés, motifs, flou et ombre, images `data:`, texte vivant ; puis `<text>` basique et `<svg>`
imbriqué (étape 13). Il **refuse en nommant** : une primitive de filtre hors sous-ensemble (« un filtre
(feTurbulence) »), une découpe en forme CSS, `mask-image`, un cycle (découpe, masque, motif, dégradé), des
bornes dépassées, un renvoi externe, `foreignObject`, `switch`, `textPath`. Il **dit** (`ignores`) : fusion et
ordre de peinture (aujourd'hui perdus sans être dits : dans les deux modes), `vector-effect`, arrêts au-delà de
64, espace colorimétrique, région de filtre rognante, écart borné, flou anisotrope sous rotation, style de
portion de texte, fonte substituée, données d'édition de texte illisibles. Tables et bornes : annexe 5.

### 4. Le texte vivant

Un texte vivant est **une feuille** : `texte` (chaîne, fonte par id ou par empreinte, taille, interlettrage,
interligne, alignement, boîte, ligatures, matrice) + `d` = ses contours composés. Il s'écrit en **contours avec
des attributs `data-ed-*` qui permettent de le rouvrir** (`<path … data-ed-texte="…"><title>…</title></path>`,
`role="img"`). Quatre options pesées (annexe 4 A §2) : `<text>` sans fonte (non portable, non déterministe),
`<text>` + `@font-face` en `data:` (portabilité moyenne, licence délicate : un sous-ensemble de fonte est une
version modifiée, une fonte déposée a une licence inconnue), contours + attributs (**retenue** : rendu
identique partout, octets déterministes, aucun fichier de fonte ne sort), contours + commentaire (rejetée, les
commentaires se retirent). Le texte est encodé en pourcentage pour survivre à `nettoyerSvg`.

**Amendement** de `CLAUDE.md` (« Le texte est une forme par lettre … Jamais de `<text>` dans un SVG écrit ») et de
l'ADR-0004 §2, à reporter par le chef de chantier à l'étape 14 : *un texte vivant est UNE forme (contours composés
et attributs d'édition) ; « Convertir en contours » donne un groupe d'une forme par lettre ; jamais de `<text>`
dans un SVG écrit*. La lecture n'efface pas `d` à l'ouverture (pas de recomposition, donc pas de dépendance à la
fonte présente) ; l'édition demande la composition à `io/polices` et passe le résultat à une opération pure.
Une fonte absente se dit. Texte sur tracé : après la bascule.

### 5. Les effets

Un sous-ensemble **borné et portable** : au plus un **flou** (`feGaussianBlur`, isotrope ou non) et une **ombre
portée**, sur une feuille ou un groupe, écrits en primitives décomposées (`feGaussianBlur` sur `SourceAlpha`,
`feOffset`, `feFlood`, `feComposite`, `feMerge`) que lisent aussi Illustrator et les Inkscape anciens (pas de
`feDropShadow`), avec une région explicite calculée et `color-interpolation-filters="sRGB"`. L'ombre est dans le
repère du plan (la lumière ne tourne pas). Toute autre primitive est refusée en la nommant ; les idiomes de
Figma, Sketch et Illustrator sont reconnus par des reconnaisseurs à fixture (étape 13). La toile et l'écriture
appellent les mêmes fonctions pures. PNG : le navigateur dessine le SVG. **PDF** : rastérisation des seuls nœuds à
effet par `io` (non reproductible à l'octet d'un navigateur à l'autre, dit ; option « ignorer les effets »).
DXF, EPS, SVG de découpe : effets abandonnés, dits. `ajusterPlan` et les boîtes visuelles incluent l'étendue des
effets et l'intersection avec les découpes.

### 6. Les exports : une seule descente

Un exporteur ne lit pas `formes` d'un dessin riche. `aplatirPour(dessin, capacites)` (`engine/aplatir.ts`) rend un
**`DessinPlat`** (type marqué) et la liste de ce qu'il a approché : opacité de groupe répartie, découpe appliquée
par intersection booléenne des remplissages (`polygon-clipping`), masque ignoré ou rastérisé, peinture non unie →
couleur de repli, effets abandonnés ou rastérisés. Chaque exporteur déclare ses `Capacites` ; PDF, SVG de
découpe, DXF, EPS (chantiers concurrents) reçoivent un `DessinPlat`, et un dessin plat passe par la fonction
identité. Aucune fonctionnalité ne fusionne sans sa règle de descente (annexe 5 §4).

### 7. L'interface (conception, annexe 6)

Les calques deviennent un **`treegrid`** (`aria-level`, `aria-setsize`, `aria-posinset`, `aria-expanded`,
`aria-rowindex`) fenêtré sur les **lignes visibles** (seuil 150), un seul arrêt de tabulation, Tab en sort ;
flèches, Début/Fin, Entrée, Espace, `*`, F2 ; alternatives au glisser par **Ctrl+Maj+flèches** et « Déplacer
vers… » (Alt+Maj est exclu : Windows l'emploie pour changer de clavier). Un **contexte d'édition** (état
d'interface) permet d'entrer dans un groupe, un masque ou un motif ; Tab, Ctrl+A et les aimants ne voient que les
frères du contexte ; Échap défait mode points, sélection, puis un niveau. Dégradés : liste d'arrêts **complète
sans la toile**, poignées en plus (curseurs ARIA, pas de 1 % au clavier, 40 px au doigt). Masques et effets
au menu Objet et dans l'inspecteur, commandes indisponibles grisées avec leur raison. Texte : panneau-formulaire,
action rare et destructrice (« Convertir en contours ») secondaire. Phrases parlées nouvelles, jetons nouveaux
(4,5:1 / 3:1, `forced-colors`), axe sur tous les écrans nouveaux.

### 8. Livraison

Quinze étapes (0 à 14), chacune fusionnable seule, CI verte, **octets v1 inchangés** (annexe 8) : **0** coutures
(toute la surface de types, six registres, harnais de lois, manifeste), **1** groupes (moteur), **2** groupes
(interface), **3** dégradés (infrastructure de définitions et moteur), **4** dégradés (interface), **5**
découpes, **6** masques d'opacité, **7** effets, **8** interface découpes/masques/effets, **9** motifs, **10**
texte vivant (moteur), **11** texte vivant (interface), **12** images, **13** exports natifs et idiomes
d'éditeurs (quatre lots), **14** bascule (défaut `riche` dans la page ; l'embarquement garde `plat` tant que
l'hôte ne le demande pas). Jusqu'à quatre arbres de travail en parallèle (vague 1 : étapes 1, 3, 10, 12), carte
des conflits en annexe 8 §3. *Révisé le 25 octobre 2026 : 10 et 11 sont faites ; vague 1 = 1, 3, 12 ; vague 2 = 2, 4, 5, 7
(annexe 8 §0, §2, §5).*

## Conséquences

- **Octets.** Aucun dessin plat ne change, en mode `plat` comme en mode `riche` ; seuls changent les fichiers à `<g>`
  ouverts en `riche` (réécrits avec leurs groupes) et ce qui était refusé. Un manifeste d'empreintes empêche
  qu'une référence v1 soit réécrite sans apparaître en revue.
- **Prix du modèle.** Les transformations d'un groupe ne sont pas réversibles (pas de matrice vivante) ; l'ombre
  ne tourne pas avec sa forme ; pas de modes de fusion ; pas de symboles liés. Ces limites sont dites et
  peuvent se lever par des ADR ultérieurs.
- **Charge.** Six registres et un fichier par fonctionnalité à l'étape 0 pour que 13 étapes ne se disputent pas les mêmes
  corps de fonction ; la loi du dessin plat et son dossier `anciennes/` sont du code de test à maintenir jusqu'à la
  version majeure suivante.
- **Dette de test assumée** : aucun lecteur d'écran réel ni Inkscape/Illustrator en CI ; une revue manuelle est une
  condition de l'étape 14. Seul Chromium est exercé aujourd'hui ; Firefox et WebKit entrent dans la matrice de
  l'agent de la CI multi-navigateurs et deviennent bloquants à la bascule.
- **Dépendances externes** : le nettoyage (`util/svg.ts`) doit admettre la liste blanche de l'annexe 2 §6 ; les
  chantiers d'export (DXF, EPS, PDF CMYK, PNG DPI) consomment un `DessinPlat` ; l'attribution de licence
  (`Forme.origine`) s'étend à `Groupe.origine`.
- **Questions ouvertes** pour le propriétaire (annexe 9 §3) : Ctrl+G, conservation des `<g>` à l'enregistrement,
  défaut de l'embarquement, PDF avec effets rastérisé, texte natif en export, fontes déposées, plafonds d'image,
  noms du marqueur, confirmation juridique des fontes sous licence propriétaire.

## Annexes

1. [Le modèle de données](0012-annexes/01-modele-de-donnees.md) — types, invariants, mesure du coût de `parent`
2. [Correspondance SVG ↔ modèle et politique d'octets](0012-annexes/02-correspondance-svg-et-octets.md)
3. [Impact des opérations et des fichiers](0012-annexes/03-impact-des-operations-et-des-fichiers.md)
4. [Texte vivant, effets, images](0012-annexes/04-texte-vivant-effets-images.md)
5. [Compatibilité, refus, exports, retour en arrière](0012-annexes/05-compatibilite-refus-exports-et-retour-arriere.md)
6. [Interface et accessibilité](0012-annexes/06-interface-et-accessibilite.md)
7. [Stratégie de test, corpus, performance, sécurité](0012-annexes/07-strategie-de-test-et-corpus.md)
8. [Plan de livraison et carte des conflits](0012-annexes/08-plan-de-livraison.md)
9. [Risques et questions ouvertes](0012-annexes/09-risques-et-questions.md)
