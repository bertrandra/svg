# ADR-0012, annexe 7 — Stratégie de test, corpus, performance, sécurité

## 1. Les portes de chaque étape

Une étape ne fusionne que si **toutes** passent (CI `verifier`, `navigateur`, et les portes ajoutées) :

| Porte | Contenu |
|---|---|
| G1 | `npm run verifier` (typecheck, lint, cliquet, tests) et `npm run construire` |
| G2 | `npm run e2e` (plus de 270 tests de Chromium) vert |
| G3 | **Références v1 gelées** : voir §2 |
| G4 | **Loi du dessin plat** : voir §3 |
| G5 | Accessibilité : axe 0 grave / 0 autre / 0 « à relire » sur les écrans de l'étape |
| G6 | Performance : aucun budget du §4 dépassé |
| G7 | Pour une étape de fonctionnalité : fixtures de la fonctionnalité, **règle de descente** (annexe 5 §4), cas hostiles (§5) |
| G8 | Entrée de `CHANGELOG.md` (par le chef de chantier) ; le mode `plat` inchangé |

## 2. Les octets : gel des références v1

- Les 27 SVG d'entrée de `tests/fixtures/svg`, leurs `*.attendu.svg` et `bibliotheque.empreintes.txt` (4 134
  empreintes) **ne sont jamais réécrits par une étape de ce chantier.** `ACTUALISER_REFERENCES=1` reste l'outil
  des décisions de version majeure, mais le chantier v2 ajoute un **manifeste** committé
  (`tests/fixtures/svg/references-v1.sha256`, une empreinte par fichier de référence) et un test
  (`references-v1-gelees.test.ts`) qui compare : réécrire une référence v1 exige d'éditer le manifeste, donc
  d'apparaître dans la revue, avec une phrase de CHANGELOG. Aucune étape 0 à 13 ne le fait.
- Les nouvelles références vivent à côté, par fonctionnalité : `tests/fixtures/svg/v2/<fonction>-<cas>.svg` et
  `.attendu.svg`, jouées par un second fichier `tests/unit/engine/ecriture-stable-v2.test.ts` (mêmes helpers :
  lecture, opération, écriture à la précision 3, puis `nettoyerSvg`, exactement le chemin de « Enregistrer »).
  `ACTUALISER_REFERENCES=1` n'y réécrit **que** `v2/`.
- Les 10 entrées v1 qui contiennent `<g>` reçoivent, à l'étape 1, une référence `riche` :
  `tests/fixtures/svg/v2/riche-<cas>.attendu.svg`, relue une à une dans la PR.
- Fixtures par fonctionnalité (minimum) : groupes (imbriqués, opacité, nom, masqué, verrouillé, `<use>` d'un
  `<g>`), dégradés (linéaire, radial, foyer, `fr`, `href` en chaîne, unités de boîte, pourcentages, étalements,
  `stop-opacity`, sur fond et sur contour), découpes (unités, imbriquées, transformées, règle pair-impair,
  `<use>` dedans), masques (luminance, alpha, dégradé dedans, région), motifs (unités, viewBox, rotation),
  effets (flou, ombre, les deux, sous rotation, sous échelle non uniforme), texte vivant (aller-retour, fonte
  absente, boîte et alignement, encodage des caractères piégeux : `on a=1`, `javascript:`, `url(`, `@import`,
  retour à la ligne, émoji), images (PNG 1×1, JPEG, rotation), et une fixture **par reconnaisseur d'idiome**.

## 3. Lois, propriétés, invariants (tests unitaires, sans navigateur)

1. **Loi du dessin plat.** Pour chaque fonction nouvelle ou modifiée `f` et chaque entrée plate : `f_nouvelle(x)`
   rend un résultat profondément égal à `f_ancienne(x)` et **le même objet** quand l'ancienne rendait le même
   objet. Les « anciennes » sont figées dans `tests/unit/engine/anciennes/` (copie du corps d'avant l'étape),
   retirée à la bascule.
2. **Aller-retour et point fixe.** Pour toute fixture et tout dessin aléatoire valide `d` :
   `lire(ecrire(d), riche)` est profondément égal à `normaliser(d)` (aux arrondis de la précision), et
   `ecrire(lire(ecrire(d))) == ecrire(d)`.
3. **Invariants.** `verifierDessin` rend `[]` après la lecture de chaque fixture, et après **chaque** opération
   d'une suite aléatoire (graine imprimée à l'échec ; générateur pseudo-aléatoire à graine **dans les tests**,
   le cœur pur n'en emploie pas) : 100 opérations tirées parmi grouper, dégrouper, déplacer, redimensionner,
   ordonner, dupliquer, supprimer, combiner, séparer, booléens, masquer, verrouiller, régler un dégradé, poser un
   effet, annuler, rétablir.
4. **Lois de groupe.** `degrouper(grouper(d, ids))` redonne `d` aux ids de groupe près et **aux octets près en
   mode plat** ; `redimensionner(g)` = `redimensionner(feuilles de g)` pour les feuilles, et déplace en plus la
   découpe, le masque, les effets et les peintures ; `annuler` après une opération redonne l'état **par
   référence** (`===`).
5. **Descente.** Pour tout dessin riche et chaque `Capacites`, `aplatirPour` rend un dessin dont
   `verifierDessin` est vide, sans groupe ni champ v2, et dont l'écriture se relit en `plat` sans refus.
6. **Texte.** La réunion des lettres de `convertirEnContours` a les mêmes commandes que `d` ; `composerBloc` à
   boîte nulle égale `composer` ; les cas texte de `ecriture-stable.test.ts` sont inchangés.
7. **Identifiants.** Deux écritures de deux dessins qui partagent une définition produisent le même `id` ; deux
   éditeurs dans une même page n'entrent jamais en collision (e2e).
8. **Encodage.** `nettoyerSvg(ecrire(d))` conserve `data-ed-texte` (fixtures piégeuses de §2).
9. **Mode `plat`.** Chaque fixture v2 lue en `plat` est refusée **avec la phrase d'aujourd'hui** (l'ancien
   `refusDe` / `NON_PRIS`).

## 4. Budgets de performance (méthode de l'ADR-0008 : Chromium, tâches du fil principal, médiane de trois, avant/après entrelacés)

Les trois dessins de l'ADR-0008 (photo à 120 couleurs, logo, 2 000 couleurs ; 5 000 formes) sont les
**témoins plats** : aucun chiffre ne se dégrade de plus de 10 % (ouvrir ≈ 859 ms, Ctrl+A ≈ 443 ms, glisser une
forme ≈ 33 ms par mouvement, DOM ≈ 8 900 nœuds sur 5 000 formes). Nouveaux témoins :

| Témoin | Budget |
|---|---|
| 5 000 feuilles dans 500 groupes sur 3 niveaux, tout replié | ouvrir ≤ 1,2 × le témoin plat ; DOM de la grille ≤ 400 nœuds ; Ctrl+A ≤ 1,2 × |
| Idem, glisser **une feuille** | ≤ 40 ms par mouvement |
| Idem, glisser **un groupe** de 100 feuilles | ≤ 60 ms par mouvement |
| `arbreDe` sur 5 000 feuilles / 500 groupes | ≤ 2 ms |
| Tout déplier / replier (500 groupes) | ≤ 100 ms |
| 5 000 feuilles au même dégradé | écriture ≤ 1,2 × la plate ; une seule définition écrite |
| 200 feuilles à dégradés tous différents | ouvrir ≤ 150 ms de plus que le plat |
| 20 nœuds à ombre, 1 920 × 1 080 | geste ≥ 30 images/s (effets rendus au repos au-delà) |
| Historique : 5 000 feuilles + 500 groupes, 200 gestes | mémoire ≤ celle du témoin plat × 1,2 (poids, annexe 3 §5) |
| Image de 2 Mo | ouvrir ≤ 300 ms de plus ; historique non multiplié |

Laissé à mesurer (et seulement alors corrigé) : le rendu des sous-arbres mémoïsé par groupe, la composition
de `Toile.tsx`. Aucune optimisation préalable.

## 5. Sécurité et fuzz

Le chantier « SVG hostiles » construit `tests/fixtures/hostile` et fixe les invariants généraux (la lecture ne
lève jamais, termine vite, la sortie est propre). Ce chantier **ajoute** sous `tests/fixtures/hostile/v2/`, dès
que le dossier existe, un cas par borne et par piège, tous soumis aux mêmes invariants :

- Profondeur : 10 000 `<g>` emboîtés ; 64 + 1 niveaux exactement ; défs emboîtées à 9 niveaux.
- Cycles : `clip-path` d'un `<clipPath>` sur lui-même ; deux masques qui s'emploient ; motif peint par un
  élément de sa propre tuile ; dégradés dont le `href` boucle (a→b→a) ; `<use>` dans un `<clipPath>` qui
  renvoie au `<clipPath>`.
- Bombes : 20 000 `<use>` vers un `<clipPath>` ; `<mask>` contenant 100 000 formes ; 1 000 000 d'arrêts ;
  `stdDeviation="1e308"`, `NaN`, `-5` ; région de filtre infinie ; `dx` énorme ; texte de 10⁷ caractères dans
  `data-ed-texte` ; taille de police 10⁹ ; matrice de dégradé nulle ; `patternUnits` avec tuile de largeur 0 ou
  1e-9 (un motif qui se répète 10²⁰ fois : on ne **dessine** pas la tuile côté moteur, le navigateur le fait,
  mais l'export PDF borne le nombre de répétitions).
- Images : `data:` géant ; PNG de 65 000 × 65 000 pour 200 octets ; `data:image/svg+xml` ; MIME mensonger ;
  `<image href="https://…">` ; `<image href="javascript:…">`.
- Injection : `data-ed-texte="… onload=…"` ; `data-ed-nom="javascript:…"` ; `stop-color="url(http://…)"` ;
  `fill="url(http://…)"` ; `filter="url(//…)"` ; `feImage` ; `xlink:href` externe sur dégradé ; `style` qui
  réintroduit `url(…)` ; entités numériques qui composent `javascript:`.
- Références : `url(#inexistant)` (peinture absente, dite) ; `url(#a)` vers un élément d'un autre genre ;
  `id` en double (le premier l'emporte, comme un navigateur).

Invariants ajoutés : (H1) la lecture ne lève jamais, en `plat` comme en `riche` ; (H2) terminaison sous 2 s pour
tout fichier ≤ 5 Mo, sous 200 ms pour ≤ 100 Ko (mesurés sans navigateur) ; (H3) le nombre de nœuds
construits est borné par les constantes de l'annexe 5 §2 ; (H4) la sortie `nettoyerSvg(ecrire(d))` ne contient
ni `<script`, ni `on…=`, ni `href`/`url(` non fragment, ni `javascript:` ; (H5) toute lecture réussie vérifie
`verifierDessin == []` et le point fixe ; (H6) tout refus porte une phrase de la table de l'annexe 5 ; (H7) la
mémoire reste sous un plafond fixe (mesure `process.memoryUsage` dans un test dédié, pas dans le cœur).

## 6. Rendu, navigateurs, équivalence

- **Équivalence pixel.** Un e2e (`rendu-v2.e2e.ts`) charge dans Chromium l'original puis le SVG réécrit, les dessine
  sur un canevas de même taille, et compare : au plus 0,5 % de pixels différents, aucun écart de canal > 8/255.
  C'est le critère de « s'ouvre fidèlement » pour tout le corpus (§7), et pour les 10 entrées v1 à `<g>`
  (le rendu `riche` doit égaler le rendu d'origine, ce que le `plat` n'a jamais prouvé pour l'opacité de groupe).
- **Multi-navigateurs.** Chromium aujourd'hui seul. Le sous-ensemble `rendu-v2` (et lui seul, pas les 270
  tests) s'exécute sous Firefox et WebKit dans la matrice de l'agent de la CI multi-navigateurs ; d'abord
  informatif, bloquant à la bascule (étape 14). Points à surveiller, connus : filtres sur un `<g>` avec région
  explicite (WebKit), `mask-type`, `fr` des dégradés radiaux, anti-crénelage des motifs, `clipPath` imbriqué.
- **Aucun lecteur extérieur** (Inkscape, Illustrator) n'est lancé en CI ; les formes écrites sont celles du
  plus petit commun dénominateur (décomposition des filtres, `xlink:href`, unités du plan) précisément pour
  cela, et une revue manuelle d'un échantillon dans Inkscape et resvg précède la bascule.

## 7. Le corpus d'acceptation « s'ouvre fidèlement »

Fichiers **reconstruits à la main** d'après les idiomes d'exportation connus, sur
`tests/fixtures/svg/corpus/<source>-<cas>.svg`, avec leur `.attendu.svg` (riche) et, quand il y en a, la
liste d'`ignores` attendue. Contenu **géométrique simple et original** : aucun tracé d'icône réelle n'est
repris, ni sous licence tierce, ni propriétaire ; seul l'idiome (structure, attributs, ordre, ids, styles)
compte. Chaque fichier cite la version de l'outil qu'il imite. Critères : (a) pas de refus, hors cas déclaré ;
(b) `ignores` égal à la liste déclarée ; (c) octets = référence ; (d) équivalence pixel §6 ; (e) point fixe.

| Fichier | Idiome reconstitué | Passe à l'étape |
|---|---|---|
| `feather-trait`, `lucide-formes` | `fill="none" stroke="currentColor"`, `stroke-linecap`, `<rect rx>`, classe `lucide` | maintenant |
| `heroicons-outline`, `heroicons-solid` | `stroke-width="1.5"`, `aria-hidden`, `fill-rule`/`clip-rule` en évidence | maintenant |
| `material-24`, `material-symbols` | `<path d="M0 0h24v24H0z" fill="none"/>` ; `viewBox="0 -960 960 960"` | maintenant |
| `bootstrap-16`, `fontawesome-512` | `width="16"` + `class="bi"` ; commentaire de licence en tête, `viewBox 0 0 512 512` | maintenant |
| `simple-icons-titre` | `<title>` + un `<path>`, `role="img"` | maintenant |
| `inkscape-calques` | `sodipodi:namedview`, `<g inkscape:groupmode="layer" inkscape:label>`, `transform` de calque, `<metadata>` RDF | 1 |
| `inkscape-degrade-chaine` | `linearGradient` à arrêts + second `linearGradient xlink:href` à coordonnées, `inkscape:collect`, `gradientTransform` | 3 |
| `inkscape-decoupe` | `<clipPath id="clipPath1234">` + `clip-path="url(#…)"` sur un groupe transformé | 5 |
| `inkscape-flou` | `<filter style="color-interpolation-filters:sRGB">` + `feGaussianBlur stdDeviation` | 7 |
| `inkscape-texte-ligne` | `<text xml:space="preserve" style="font-size…"><tspan sodipodi:role="line" x y>` | 13 |
| `illustrator-calque` | `<style>.st0{…}</style>`, `<g id="Layer_1">`, `enable-background`, `xml:space` | 1 |
| `illustrator-degrade-decoupe` | `id="SVGID_1_"`, `<clipPath><use xlink:href="#SVGID_2_" style="overflow:visible"/></clipPath>`, `gradientUnits="userSpaceOnUse"` + `gradientTransform="matrix(1 0 0 -1 …)"` | 3 et 5 |
| `illustrator-masque-opacite` | `<mask><g style="filter:url(#Adobe_OpacityMaskFilter)"><…/></g></mask>` | 13 |
| `illustrator-texte` | `<text transform="matrix(1 0 0 1 x y)" class="st1 st2">` | 13 |
| `figma-cadre-decoupe` | `<g clip-path="url(#clip0_1_2)">` + `<clipPath><rect width height fill="white"/></clipPath>` | 5 |
| `figma-degrade` | `paint0_linear`, `gradientUnits="userSpaceOnUse"`, `stop-opacity="0"` | 3 |
| `figma-ombre` | `<filter id="filter0_d_1_2" … color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feColorMatrix …/><feOffset dy="4"/><feGaussianBlur stdDeviation="2"/><feColorMatrix …/><feBlend …/><feBlend …/>` | 13 |
| `figma-trait-interieur` | `<mask id="path-1-inside-1_1_2" fill="white">` portant le tracé, appliqué à un contour | 6 |
| `sketch-ombre` | `<use filter="url(#filter-3)" xlink:href="#path-2">`, `<filter x="-50%" y="-50%" width="200%" height="200%" filterUnits="objectBoundingBox">` : `feOffset`, `feGaussianBlur`, `feColorMatrix` d'alpha | 13 |
| `sketch-degrade-pourcent` | `x1="50%" y1="0%" x2="50%" y2="100%"` | 3 |
| `sketch-masque-use` | `<mask id="mask-2" fill="white"><use xlink:href="#path-1"/></mask>` | 6 |
| `motif-hachures` | `<pattern patternTransform="rotate(45)" patternUnits="userSpaceOnUse">` | 9 |
| `image-png-1x1` | `<image xlink:href="data:image/png;base64,…">`, rotation | 12 |
| `texte-vivant-aller-retour` | notre propre sortie | 10 |

## 8. Retour en arrière, vérifié

Un test lit chaque fixture v2 en mode `plat` et attend la phrase de refus d'aujourd'hui ; un autre ouvre un
brouillon et une version à fonctions v2 en mode `plat` et attend le message de l'annexe 5 §3 (et la
conservation de la version). Chaque étape documente sa commande de retour (`git revert -m 1 <merge>`) et le
test de loi du dessin plat prouve qu'après retour rien d'un dessin plat n'a changé.
