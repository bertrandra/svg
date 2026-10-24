# ADR-0012, annexe 2 — Correspondance SVG ↔ modèle, et politique d'octets

## 1. Les deux modes de lecture

```ts
export interface OptionsLecture { readonly modele?: 'plat' | 'riche' }       // defaut : 'plat'
export function lireDessin(svg: string, options?: OptionsLecture): LectureDessin;
```

| Mode | Ce qu'il fait | Où il vit |
|---|---|---|
| `plat` (**défaut de l'API**) | Exactement `lireDessin` d'aujourd'hui (`edition/lecture.ts`, `parcours.ts`) : les groupes se fondent, `clip-path`/`mask`/`filter`/dégradé/motif/`<text>`/`<image>` sont **refusés en le nommant**. | Le moteur, pour toujours : c'est le contrat figé de l'ADR-0001 et la référence des tests d'octets. |
| `riche` | Garde les groupes et lit les nouveautés des tables ci-dessous. | L'éditeur, derrière la propriété `modele` (page : réglage ; hôte embarqué : `modele: 'riche'`). Défaut de la page et de l'embarquement à l'étape 14. |

`lireDessinMemo` (ADR-0008) inclut le mode dans sa clé de mémorisation. L'écriture n'a **pas** de mode : elle
écrit ce que le modèle contient (§3). Un dessin lu en `plat` n'a ni `groupes`, ni champ v2 : c'est un dessin
plat, écrit comme avant.

## 2. Éléments

| SVG | Modèle | `plat` | `riche` | Étape |
|---|---|---|---|---|
| `<g>`, `<a>` sans effet | `Groupe` (nom : `id`, `data-name`, `inkscape:label`, `data-ed-nom`) ; la peinture héritée, la matrice et `class`/`style` sont résolus sur les feuilles comme aujourd'hui | fondu (inchangé) | gardé | 1 |
| `<g opacity>` | `Groupe.opacite` ; **pas** multipliée sur les feuilles (composition réelle) | multipliée sur chaque feuille (inchangé, approximation connue) | gardée | 1 |
| `<g transform>` | cuite dans les feuilles (et dans la découpe, le masque, les peintures, les effets du groupe) | cuite | cuite | 1 |
| `<g display:none>` | retiré (comme aujourd'hui `preparer` rend null) | retiré | retiré | — |
| `<g visibility:hidden>` | feuilles non lues (comme `poserForme`) | idem | idem | — |
| `clip-path="url(#c)"` sur `g` ou forme | `Groupe.decoupe` (une forme seule est enveloppée dans un groupe) | refusé « une découpe » | gardé | 5 |
| `<clipPath>` (`clipPathUnits` des deux sortes, `transform`, enfants `path/rect/circle/…`, `<use>` déplié, `clip-rule`, `clip-path` imbriqué) | `Decoupe.contenu` | — | lu | 5 |
| `mask="url(#m)"` | `Groupe.masque` | refusé | gardé | 6 |
| `<mask>` (`maskUnits`, `maskContentUnits`, `mask-type`, contenu quelconque dont dégradés) | `Masque` (région résolue en unités du plan) | — | lu | 6 |
| `fill`/`stroke="url(#d)"` | `Forme.peintureRemplissage` / `peintureContour` + couleur de repli | refusé « un dégradé ou un motif » | gardé | 3 |
| `<linearGradient>`, `<radialGradient>` : `gradientUnits`, `gradientTransform`, `spreadMethod`, `x1…`, `cx cy r fx fy fr`, pourcentages, `href`/`xlink:href` (héritage d'attributs **et** d'arrêts, chaîne bornée, cycle refusé) | `Degrade` | — | lu | 3 |
| `<stop>` : `offset`, `stop-color`, `stop-opacity`, classes de feuille | `ArretDegrade` ; positions triées et bornées dans [0, 1] | — | lu | 3 |
| `<pattern>` : `patternUnits`, `patternContentUnits`, `patternTransform`, `viewBox`, `preserveAspectRatio`, `href` | `Motif` (viewBox cuit en matrice de tuile) | refusé | lu | 9 |
| `filter="url(#f)"` | `Forme.effets` / `Groupe.effets` si le filtre est dans le sous-ensemble (annexe 4, §2) | refusé « un filtre » | gardé, sinon refusé en nommant la primitive | 7 |
| `<filter>` sous-ensemble | `Effets` | — | lu | 7 |
| `<image href="data:image/…">` | feuille `image` | refusé « une image » | gardé | 12 |
| `<image href="http…">` | — | refusé | refusé « une image qui renvoie à un fichier ou une adresse extérieurs » (le nettoyage retire déjà le `href`) | 12 |
| `<text>`, `<tspan>` (avec nos `data-ed-*` sur un `<path>` : voir §5) | feuille `texte` | refusé « du texte » | `<path data-ed-texte>` : lu dès l'étape 10. `<text>` étranger : étape 13 | 10, 13 |
| `<svg>` imbriqué | groupe + découpe au cadre | refusé | étape 13 (le cadre se calcule déjà : `clones.ts`, `matriceCadre`) | 13 |
| `<use>` | **déplié en feuilles et groupes indépendants, comme aujourd'hui** | déplié à plat | déplié, la structure de la cible (ses `<g>`) est gardée | 1 |
| `<symbol>`, `<defs>`, `<marker>`, `<title>`, `<desc>`, `<metadata>`, `<style>` | résolus ou ignorés comme aujourd'hui | idem | idem | — |
| `<switch>`, `<foreignObject>` | — | refusé | refusé | — |
| `<animate*>`, `<set>` | — | `ignores` | `ignores` | — |

**`<use>` : on garde le dépliage.** Conserver symboles et instances demanderait une table de définitions
partagées (références, ramasse-miettes, « modifier le maître » contre « détacher »), des identifiants de
définition dans l'historique, et une interface d'instances ; le gain (une planche d'icônes qui reste liée)
ne se voit pas dans le SVG écrit, qui ne porte pas non plus d'`id` aujourd'hui. Le dépliage produit en
`riche` la **structure** de la cible (ses groupes), pas des feuilles à plat : rien de ce que l'ADR-0009 a
fixé ne bouge (bornes `CLONES_MAX`, `PROFONDEUR_USE_MAX`, cycles et renvois externes refusés). Les
« composants » liés sont un chantier ultérieur éventuel, hors de cet ADR.

## 3. La politique d'octets, mécanisme par mécanisme

**Principe** : l'écriture d'un dessin **plat** est, au caractère près, le code actuel. Rien de v2 n'est
atteignable sans qu'une donnée v2 soit présente dans le modèle.

1. **Garde de forme plate.** `ecrireDessin(d, précision)` commence par `estPlat(d)` (`groupes` absent et
   aucune feuille ne porte `parent`, `peinture*`, `effets`, `texte` ni `image` ; mémoïsé par `WeakMap` sur
   le dessin). Si vrai : le corps actuel de `ecrireDessin` (`ecriture.ts`), **inchangé et sans une ligne de
   partage avec le chemin riche**. Les 27 SVG de `tests/fixtures/svg`, les 4 134 empreintes
   (`bibliotheque.empreintes.txt`), `svgDecoupe` et le PDF d'un dessin plat passent par là.
2. **Chemin riche** seulement si `!estPlat(d)` :
   - la balise `<svg>` est celle d'aujourd'hui, suivie de `data-ed-modele="2"` (**dernier attribut**), et de
     `xmlns:xlink` (avant `viewBox`) si, et seulement si, une feuille `image` existe ;
   - `<defs>` : **premier enfant de `<svg>`, et seulement s'il y a une définition employée** ; contenu :
     définitions dédoublonnées par empreinte, dans l'ordre de première apparition au parcours en profondeur,
     dépendances d'abord (un motif dont la tuile emploie un dégradé écrit le dégradé avant) ;
   - le corps parcourt l'arbre : un groupe visible écrit `<g …>` et ses enfants, un groupe masqué n'écrit
     rien (« masquer, à l'enregistrement, c'est retirer », ADR-0001), de même une feuille masquée par un
     ancêtre ;
   - une feuille sans champ v2 s'écrit **par `ecrireForme` actuel** (même cache `cacheEcriture`, mêmes octets) ;
     une feuille v2 ajoute ses attributs **après** les attributs actuels et avant `/>` (§5).
3. **Ordre des attributs d'un groupe** : `opacity`, `clip-path`, `mask`, `filter`, `data-ed-nom`. Un
   groupe n'écrit que ceux qu'il porte ; un groupe nu est `<g>`.
4. **Ordre des attributs d'une feuille v2** (après les actuels : `d`, `fill`, `fill-rule`, `fill-opacity`,
   `stroke`, `stroke-width`, attributs de trait, `stroke-opacity`, `opacity`) : `filter`, `role`, puis `data-ed-*`
   dans l'ordre de l'annexe 4 (partie A, §3). Un texte vivant a pour enfant un `<title>`.
5. **Aucune écriture d'`id` hors des définitions.**
6. **Un fichier plat ne porte jamais le marqueur.** `data-ed-modele` est la signature « ce fichier emploie
   le modèle 2 » ; il sert à refuser un marqueur **supérieur** à celui qu'on connaît (« ce fichier vient
   d'une version plus récente de l'éditeur » : jamais de lecture « au mieux ») et au diagnostic. Il n'est
   pas nécessaire à la lecture (le mode choisit ce qu'on lit), donc un fichier v2 dont l'attribut a été
   retiré se lit pareil.
7. **Point fixe** : pour tout dessin `d` du modèle, `ecrire(lire(ecrire(d), riche)) == ecrire(d)`. Test sur
   toutes les fixtures v2 et sur des dessins aléatoires (annexe 7).

**Ce qui change d'octets, et seulement cela** (décision de version majeure, ADR-0009) : un SVG ouvert en
`riche` qui contient un `<g>` se réécrit avec ses groupes (au lieu d'être aplati) ; un SVG qui contient une
découpe, un masque, un dégradé, un motif, un filtre du sous-ensemble, du texte vivant ou une image **était
refusé** et ne se réécrivait pas du tout. Aucun dessin qui s'ouvrait en `plat` et ne contient pas de `<g>`
ne change : les 17 fixtures d'entrée sans `<g>` (sur 27) restent identiques même en `riche`; les 10 qui en
contiennent (`evenodd-opacite`, `fidelite-lecture`, `lecture-css-selecteurs`, `lecture-use-imbriques`,
`lecture-use-sprite`, `masquees-verrouillees`, `peintures`, `racine-heritage`, `trait-pointilles`,
`transformations`) gardent leur référence `plat` et reçoivent une référence `riche` à part
(`*.riche.attendu.svg`), relue fichier par fichier. Un export **« SVG à plat »** (menu Fichier) rend à tout
moment les octets de l'ancien contrat (annexe 5).

## 4. Identifiants des définitions : par empreinte du contenu

Une définition écrite reçoit `id="ed-" + genre + "-" + empreinte`, `genre` ∈ `c` (découpe), `m` (masque), `d`
(dégradé), `p` (motif), `f` (filtre) ; `empreinte` = 14 chiffres hexadécimaux d'un hachage 53 bits pur
(`cyrb53` ou équivalent, `util/empreinte.ts`) **du texte XML de la définition**, identifiants internes
résolus, à la précision d'écriture.

- **Aucune collision avec les identifiants existants** : le SVG écrit n'a aucun autre `id`, et celui d'un
  fichier lu est oublié (le modèle n'en garde pas). Aucune collision entre deux SVG insérés dans une même
  page hôte (une planche de dix icônes `inline`) : deux définitions de même `id` ont le **même contenu**.
- **Dédoublonnage gratuit** : mille feuilles au même dégradé donnent une seule définition.
- **Stabilité** : déplacer le contenu d'un groupe découpé change les coordonnées de sa découpe, donc son
  `id` ; c'est voulu (le contenu a changé), et le diff d'un SVG versionné reste lisible.
- **Filet** : l'écriture tient une table `id → texte` ; en cas de collision de hachage (ordre de
  10⁻⁷ pour 10⁴ définitions) avec un texte différent, elle suffixe `-2`, `-3`… de façon déterministe.
- `util/empreinte.ts` est pur (pas de `crypto`, que le cœur pur n'a pas à toucher).

Le préfixe `ed-` et le hachage évitent aussi les collisions avec les `id` que le nettoyage laisse intacts
dans une page hôte, et un test de garde le vérifie sur une page à deux éditeurs.

## 5. Formats d'écriture

Précision : celle de `ecrireDessin(d, précision)` (2 par défaut, 3 dans l'application). `nb` est la fonction
d'`edition/chemins.ts` déjà employée par `ecriture.ts`.

| Quantité | Format | Raison |
|---|---|---|
| Coordonnées (`x1 y1 x2 y2 cx cy r fx fy fr`, `x y width height`, `dx dy`, translations de matrice) | `nb(v, précision)` | comme `d` |
| Positions d'arrêt, opacités, `stop-opacity`, `flood-opacity` | `nb(v, 3)` | comme les opacités actuelles (`nb(f.opacite, 3)`) |
| Composantes linéaires d'une matrice (a, b, c, d) | `nb(v, max(précision, 5))` | des rapports sans unité : 3 décimales ruineraient une rotation |
| `stdDeviation` | `nb(v, précision)` | unités du plan |
| Couleurs | `#rrggbb` minuscule, comme `peinture.ts` les rend | |

**Dégradé** : `<linearGradient id="…" gradientUnits="userSpaceOnUse" x1 y1 x2 y2 [gradientTransform="matrix(a b c d e f)"] [spreadMethod]>` puis `<stop offset="…" stop-color="#…" [stop-opacity="…"]/>`. Radial : `cx cy r` puis `fx fy fr` s'ils diffèrent de `cx cy` / 0. Le paint s'écrit `fill="url(#id)"` **à la place** de la couleur, au même rang d'attribut : jamais de repli `url(#id) #rrggbb` (non rendu de la même façon partout).

**Découpe** : `<clipPath id="…"><path d="…" [clip-rule="evenodd"]/>…</clipPath>`, `clipPathUnits` absent
(= `userSpaceOnUse`). Une découpe qui contient des groupes (ceux qui portent eux-mêmes une découpe) pose
`clip-path` sur chaque feuille concernée, car `<clipPath>` n'admet pas `<g>`.

**Masque** : `<mask id="…" maskUnits="userSpaceOnUse" x y width height [style="mask-type:alpha"]>` + contenu.
Une région est toujours écrite.

**Motif** : `<pattern id="…" patternUnits="userSpaceOnUse" x y width height [patternTransform]>` + feuilles.

**Filtre** : annexe 4 §2 (formes exactes).

**Image** : `<image xlink:href="data:image/png;base64,…" x y width height [transform="matrix(…)"] [preserveAspectRatio]/>`
(`xlink:href`, parce que les outils anciens — Inkscape 0.92, Batik, certaines chaînes PDF — ne lisent que lui ;
le nettoyage garde un `data:image/(png|jpeg|gif|webp)`, `util/svg.ts`).

**Texte vivant** : annexe 4 §3.

## 6. Liste blanche pour le nettoyage (`util/svg.ts`) — à l'agent « SVG hostiles »

`nettoyerSvg` est aujourd'hui une suite d'expressions régulières sur le **texte** (`<script>`, `on…=`, `href`
non fragment, `url(` non fragment, `@import`, `javascript:`). L'agent qui durcit le nettoyage et construit
`tests/fixtures/hostile` doit savoir que le modèle 2 **écrit et lit** :

- Éléments : `svg g path rect circle ellipse line polyline polygon defs title desc style symbol use clipPath
  mask linearGradient radialGradient stop pattern filter feGaussianBlur feOffset feFlood feComposite feMerge
  feMergeNode feDropShadow image` ; **en lecture seulement** (reconnaisseurs d'idiomes, étape 13)
  `feColorMatrix feBlend` ; `text tspan` (étape 13). Jamais : `feImage feTile feDisplacementMap feTurbulence
  feMorphology feConvolveMatrix feSpecularLighting feDiffuseLighting script foreignObject`.
- Attributs nouveaux : `clip-path mask filter opacity clip-rule gradientUnits gradientTransform spreadMethod
  x1 y1 x2 y2 cx cy r fx fy fr offset stop-color stop-opacity patternUnits patternContentUnits patternTransform
  maskUnits maskContentUnits clipPathUnits stdDeviation dx dy in in2 result operator flood-color flood-opacity
  color-interpolation-filters filterUnits primitiveUnits preserveAspectRatio xlink:href href(#fragment)`, et
  `data-ed-*`.
- **Le texte d'un texte vivant ne doit pas dépendre du nettoyage.** Les expressions de `nettoyerSvg` courent
  sur les valeurs d'attribut comme sur le reste : une phrase saisie « on a gagné=oui », « javascript: »,
  « url(x) » ou « @import » serait mutilée dans `data-ed-texte`. Le modèle 2 **écrit donc ce texte (et les
  noms de groupe) en pourcentage** pour tout caractère ASCII hors `[A-Za-z0-9._~-]` (l'espace devient `%20`, `=`
  devient `%3D`, `(` devient `%28`, `:` devient `%3A`, `@` devient `%40`) ; les lettres non ASCII
  (« é », « œ ») restent telles quelles, elles ne déclenchent aucune expression. La lecture décode. Cela tient
  quel que soit le durcissement futur du nettoyage, et un test d'aller-retour (`tests/unit/util/svg.test.ts`,
  nouvelle entrée) le garde.
- Après nettoyage, toute référence `url(#…)` pointe un `id` du même document, sinon elle devient `none`
  (comportement actuel), et la lecture traite alors la peinture comme absente en le disant.
