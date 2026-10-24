# ADR-0012, annexe 8 — Plan de livraison : 15 étapes, paquets d'agent, carte des conflits

Principe : **chaque étape se fusionne seule, CI verte (portes G1 à G8 de l'annexe 7), sans que le produit visible
change tant que le réglage `modele` reste à `plat`** (défaut jusqu'à l'étape 14). Une étape de fonctionnalité
livre ensemble sa lecture, son écriture, ses opérations, son rendu de toile, **sa règle de descente** (annexe 5
§4) et ses cas hostiles ; l'interface a ses propres étapes, parce que c'est elle qui coûte en accessibilité.
Les tailles sont des estimations d'ordre de grandeur, non mesurées : **P** (≈ une demi-journée d'agent), **M**
(1 à 2 jours), **G** (2 à 4 jours).

## 1. Les étapes

### Étape 0 — Coutures (aucun comportement ne change) · taille M · risque faible

- **Toute la surface de types, d'avance** (annexe 1) : champs facultatifs de `Forme`, `Groupe`, `Contenu`,
  `Peinture`, `Effets`, `TexteVivant`, `ImageIntegree`, `DessinSvg extends Contenu`. Mesuré : 0 erreur de type
  pour un champ facultatif. Cela vide `types.ts` de tout conflit futur.
- `edition/arbre.ts` : `estPlat` (toujours vrai pour l'instant), `arbreDe`, `feuillesDe`, `unites`,
  `verifierDessin`, `normaliser` (identité sur un dessin plat).
- **Six registres vides**, pour que les étapes ajoutent des fichiers au lieu d'éditer des corps de fonction :
  (1) lecteurs d'éléments (`parcours.ts`), (2) fonctions prises en charge (`heritage.ts` : `refusDe`
  consulte un ensemble, vide), (3) écrivains d'attributs de feuille (`ecriture.ts`), (4) écrivains de
  définitions, (5) transformateurs de feuille et de groupe (`operations.ts` : `transformer` passe par
  `transformerFeuille`), (6) phrases d'`ignores` et règles de descente. Chaque registre se remplit **un fichier
  par fonctionnalité**.
- Sections délimitées dans la façade `editionSvg.ts` (un bloc par fonctionnalité).
- `OptionsLecture` (ignorée), `lireDessinMemo` à clé de mode.
- `engine/aplatir.ts` (identité), `Capacites`, `DessinPlat` (alias), signatures de `export/pdf.ts` et
  `export/svgs.ts`. `util/empreinte.ts`. `poidsDessin` (égal à `formes.length`) branché sur `limitePourTaille`.
- **Garde-fous livrés d'emblée** : manifeste `references-v1.sha256` et son test ; harnais de la loi du dessin
  plat et dossier `anciennes/` ; test d'architecture « `export/*` ne lit pas `groupes` ».
- Paquets : **A** types + arbre + invariants (P) ; **B** registres + options de lecture + façade (M) ;
  **C** descente + `DessinPlat` + signatures + architecture (P) ; **D** empreinte + gel des références + harnais (P).
  A d'abord (il tient `types.ts`) ; B, C, D ensuite en parallèle.
- Octets : **zéro différence** (G3). Retour : `git revert`.

### Étape 1 — Groupes : le moteur · taille G · risque moyen (le cœur du modèle)

- Lecture `riche` des `<g>`/`<a>` et de la structure des `<use>` (annexe 2) ; opacité de groupe ; noms ;
  bornes ; phrases `ignores` de `mix-blend-mode`/`paint-order`/`vector-effect` (deux modes).
- Écriture riche et marqueur ; `<g>` seulement ; pas de `<defs>`.
- Toutes les opérations du tableau de l'annexe 3 §2 + `grouper`, `degrouper`, `deplacerDans`, `renommer` ;
  isolement ; poids d'historique ; `DessinPlat` verrouillé par une marque de type ; règle de descente « groupe ».
- Fixtures `v2/groupes-*`, `v2/riche-*` (les 10), cas hostiles de profondeur et de bombes de groupes ; corpus
  `inkscape-calques`, `illustrator-calque`.
- Aucune interface : le mode ne s'atteint que par l'API et les tests.
- Paquets : **A** lecture + écriture (G) ; **B** opérations et lois (G) ; **C** descente, fixtures, hostiles,
  budgets `arbreDe` (M). A et B en parallèle (fichiers différents, interface fixée par l'étape 0), C ensuite.

### Étape 2 — Groupes : l'interface · taille G · risque élevé (accessibilité)

- Réglage `modele` (menu Édition, gardé par le `stockage` injecté) et propriété de l'éditeur.
- Contexte d'édition (état d'`Interface`), rendu récursif de la toile, `Gestes.ts` (clic → nœud du
  contexte), aimants et sélection au cadre au niveau du contexte.
- Calques en `treegrid` fenêtré, clavier complet, alternatives au glisser, « Déplacer vers… ».
- Commandes Grouper, Dégrouper, Entrer, Sortir ; fil d'Ariane ; phrases ; jetons ; « SVG à plat » (Fichier) ;
  décision Ctrl+G.
- e2e clavier, axe (écrans de l'annexe 6 §9), budgets de l'annexe 7 §4.
- Paquets : **0** les champs d'`Interface` et leurs verbes (P, d'abord) ; **A** toile + gestes + contexte (G) ;
  **B** calques en arbre + fenêtrage (G) ; **C** clavier, menus, phrases, jetons (M) ; **D** e2e, axe, perf (M).
  A, B, C en parallèle après 0 ; D à la fin.

### Étape 3 — Peinture : infrastructure des définitions, dégradés · taille G · risque moyen

- `edition/resolution.ts` (`url(#id)`, cycles, chaînes `href`), `edition/definitions.ts` (collecte, empreinte,
  dédoublonnage, `<defs>`), écrivain et lecteur de dégradés (unités, transformations, étalements, pourcentages),
  couleur de repli (OKLab), composition de matrice dans `transformerFeuille`, couleurs qui ignorent les
  peintures non unies, rendu de la toile (`<defs>` + `fill="url(#…)"` par les mêmes fonctions que l'écriture),
  règle de descente « repli », phrases.
- Fixtures dégradés ; hostiles (cycle de `href`, arrêts massifs, matrice nulle) ; corpus `figma-degrade`,
  `sketch-degrade-pourcent`, `inkscape-degrade-chaine`, `illustrator-degrade-decoupe` (moitié).
- Paquets : **A** résolution + définitions (M, d'abord) ; **B** dégradés lecture/écriture/opérations (G) ;
  **C** rendu de la toile + descente + fixtures (M). B et C en parallèle après A.

### Étape 4 — Dégradés : l'interface · taille M

Section Remplissage/Contour, liste d'arrêts, champs, poignées de la toile (curseur-glisseur), clavier, phrases,
jetons, axe, e2e. Paquets : **A** panneau + liste (M) ; **B** poignées de toile + clavier (M).

### Étape 5 — Découpes · taille G

`Decoupe`, lecture de `<clipPath>` (unités, transformations, imbrication, `<use>`), écriture, `creerDecoupe`/`liberer`,
fermeture à la transformation, `boiteVisuelle` (découpe) et `ajusterPlan`, rendu de la toile, **descente exacte
par intersection booléenne** des remplissages (`aplatir.ts`), fixtures, hostiles (cycles, bombes), corpus
`inkscape-decoupe`, `figma-cadre-decoupe`, `illustrator-degrade-decoupe` (reste). Paquets : **A** lecture/écriture (G) ;
**B** opérations + boîtes (M) ; **C** descente + toile (M).

### Étape 6 — Masques d'opacité · taille M

`Masque` (luminance, alpha, région), lecture de `<mask>`, écriture, création/libération/inversion, rendu,
descente (ignoré et dit, ou image), corpus `figma-trait-interieur`, `sketch-masque-use`. Après 5 (contenu et
région partagent son infrastructure).

### Étape 7 — Effets · taille G · risque moyen (performance)

`Effets`, lecture du sous-ensemble (annexe 4 B §3), écriture des formes exactes, région calculée, `boiteVisuelle`
(effets) et `ajusterPlan`, rendu de la toile avec mode brouillon pendant les gestes, plafonds, descente
(abandonnés, dits ; PDF raster à l'étape 13 si l'agent des exports a livré le DPI), mesures et budgets,
corpus `inkscape-flou`. Paquets : **A** moteur (G) ; **B** toile + brouillon + mesures (M).

### Étape 8 — Découpes, masques, effets : l'interface · taille G

Menu Objet, contextes `decoupe`/`masque`, section Effets, phrases, jetons, axe, e2e. Après 5, 6, 7 et 2.
Paquets : **A** menus + contextes (M) ; **B** section Effets (M) ; **C** e2e/axe (M).

### Étape 9 — Motifs · taille M

`Motif` (unités, viewBox, `patternTransform`, `href`), lecture/écriture, rendu, descente « repli », « Créer un
motif depuis la sélection » (contexte `motif`), corpus `motif-hachures`. Après 5.

### Étape 10 — Texte vivant : moteur et lecteur de fonte · taille G

`TexteVivant`, `composerBloc`, `poserTexte`, `convertirEnContours`, lecture/écriture `data-ed-*` et encodage,
`PoliceRef` (fontes livrées par id, fonte déposée par empreinte), bornes, hostiles (annexe 7 §5), fixtures,
`dessinableEnPoints`. Peut **commencer dès l'étape 0** (le moteur de texte ne dépend pas des groupes) ;
`convertirEnContours` attend l'étape 1. Paquets : **A** `composerBloc` + `TexteVivant` (M) ; **B** lecture/écriture
+ encodage (M) ; **C** `io/polices` : id, empreinte, fonte absente (M).

### Étape 11 — Texte vivant : l'interface · taille M

Panneau d'un texte vivant, « Fonte absente », « Convertir en contours », phrases, axe, e2e. Après 10 et 2.

### Étape 12 — Images · taille M

`ImageIntegree`, `dimensionsImage`, lecture/écriture (`xmlns:xlink`), toile, bornes, poids d'historique, descente,
ouverture des SVG « enveloppés tel quel ». Peut commencer dès l'étape 0.

### Étape 13 — Exports natifs et idiomes d'éditeurs · taille G, quatre lots indépendants

- **13a PDF natif** : `shading` axial/radial, découpe `W n`, masque doux, motif de pavage, image XObject,
  raster des effets ; avec l'agent des exports (même fichier `export/pdf.ts`) · après 3, 5, 6, 12.
- **13b Reconnaisseurs d'idiomes de filtres** (Figma, Sketch, Illustrator `Adobe_OpacityMaskFilter`) · après 6, 7.
- **13c `<text>` étranger** (liste `aComposer`, substitution dite) et **`<svg>` imbriqué** · après 10.
- **13d Couleurs** : arrêts de dégradé et motifs traités par `remplacerCouleur`, palettes et listes · après 3, 9.

### Étape 14 — Bascule · taille P, risque : de communication

`modele: 'riche'` par défaut **dans la page** (le défaut de l'embarquement ne change pas : question 3), revue
manuelle d'un lecteur d'écran, matrice multi-navigateurs bloquante, Inkscape/resvg sur un échantillon, README,
`docs/integration.md`, amendements de `CLAUDE.md` (texte vivant ; exemples de décisions), ADR-0012 « acceptée »,
CHANGELOG (version majeure : les SVG à `<g>` se réécrivent avec leurs groupes ; nouvelles fonctions), numéro de
version. Un seul commit de valeurs par défaut : le retour en arrière est un `git revert`.

## 2. Dépendances et vagues

```
S0 ─┬─ S1 ─┬─ S2 ──────────────┬─ S8 ─┐
    │      ├─ S3 ─┬─ S4        │      │
    │      │      ├─ S5 ─┬─ S6 ┤      ├─ S13a..d ─ S14
    │      │      │      └─ S9 ┘      │
    │      │      └─ S7 ──────────────┘
    ├─ S10 ──── S11 (avec S2)
    └─ S12
```

| Vague | Étapes qui peuvent tourner en parallèle, chacune dans son arbre de travail |
|---|---|
| 0 | S0 (seul) |
| 1 | S1, S3, S10, S12 (quatre arbres ; S3 fusionne après S1, S10 attend S1 pour `convertirEnContours`) |
| 2 | S2, S4 (après S3), S5, S7 |
| 3 | S6, S9 (après S5), S11 (après S10 et S2) |
| 4 | S8 (après S5, S6, S7, S2), S13a à S13d (selon leurs prérequis) |
| 5 | S14 |

**Obligatoirement en série** : S0 avant tout ; S1 avant S2 ; S3 avant S4, S5, S7 ; S5 avant S6 et S9 ;
S5, S6, S7 avant S8 ; S10 avant S11 ; tout avant S14. Au-delà de quatre arbres simultanés, le coût des
fusions dépasse le gain (voir la carte).

## 3. Carte des conflits

« ● » : l'étape édite ce fichier (au-delà d'une ligne d'enregistrement). « · » : une ligne d'enregistrement
dans un registre ou un bloc de façade. Après l'étape 0, les fichiers des registres sont **un par fonctionnalité**
(`lecteurs/degrades.ts`, `ecrivains/decoupes.ts`…) ; les seuls fichiers partagés sont ceux du tableau.

| Fichier | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 | S10 | S11 | S12 | S13 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `edition/types.ts` | | | | | | | | | | | | | |
| `edition/parcours.ts` (dispatch) | ● | | · | | · | · | · | | · | | | · | · |
| `edition/heritage.ts` (`refusDe`) | · | | · | | · | · | · | | · | | | · | |
| `edition/ecriture.ts` | ● | | · | | · | · | · | | · | · | | · | |
| `edition/operations.ts` | ● | | · | | · | | · | | | · | | · | |
| `edition/assemblage.ts`, `nettoyage.ts`, `isolement.ts`, `formes.ts` | ● | | | | | | | | | | | | |
| `edition/lecture.ts` | ● | | | | | | | | | | | | · |
| `edition/ignores.ts` | · | | · | | · | · | · | | · | · | | · | · |
| `editionSvg.ts` (façade) | · | | · | | · | · | · | | · | · | | · | |
| `engine/aplatir.ts` | ● | | · | | ● | · | · | | · | | | · | · |
| `engine/texte.ts` | | | | | | | | | | ● | | | |
| `engine/description.ts`, `navigation.ts` | ● | ● | | · | | | | · | | | · | | |
| `export/pdf.ts` | | | | | | | | | | | | | ● |
| `zones/Toile.tsx` | | ● | · | · | · | · | · | | · | | | · | |
| `zones/Calques.tsx` | | ● | | | | | | | | | | | |
| `zones/Inspecteur.tsx`, `PanneauDessin.tsx` | | | | ● | | | | ● | | | ● | | |
| `zones/Texte.tsx` | | | | | | | | | | | ● | | |
| `zones/Clavier*.ts`, `Gestes.ts` | | ● | | · | | | | · | | | · | | |
| `zones/contexteEditeur.tsx`, `etatEditeur.ts`, `creerActions.ts` | | ● | | | | | | · | | | | | |
| `zones/phrasesSelection.ts`, `annonces.ts` | | ● | | · | | | | · | | | · | | |
| `src/styles/jetons.ts` (+ `docs/jetons.md` à régénérer après fusion) | | ● | | ● | | | | ● | | | ● | | |
| `util/svg.ts` | | | | | | | | | | | | | agent « hostiles » |
| `tests/unit/engine/ecriture-stable-v2.test.ts`, `references-v1.sha256` | ● | | · | | · | · | · | | · | · | | · | · |
| `CHANGELOG.md` | chef de chantier, à chaque fusion |

Lecture de la carte :

- **S1 est le seul foyer lourd du moteur** (sept fichiers d'`edition/`) : on ne lui fait rien d'autre à côté
  qui édite ces fichiers, d'où S3, S10, S12 en parallèle seulement parce qu'ils entrent par les registres.
- **`Toile.tsx`** est partagé par sept étapes : à l'étape 2, on le découpe en un rendu par nœud et un registre de
  rendus de peinture/effet (même schéma que le moteur), de sorte que les étapes 3 à 12 ajoutent un fichier.
- **`jetons.ts`** : les étapes d'interface (2, 4, 8, 11) ne tournent pas en parallèle sur ce fichier ; `docs/jetons.md`
  se régénère après la fusion (`ACTUALISER_REFERENCES=1 npx vitest run tests/unit/styles`), jamais à la main.
- **`ecriture-stable-v2.test.ts`** : chaque étape ajoute ses cas dans un tableau par fonctionnalité (un fichier
  de cas par étape, importé par le test) pour que les ajouts ne se rencontrent pas.
- Chantiers concurrents : `export/pdf.ts` (S13a) appartient d'abord à l'agent des exports ; `util/svg.ts` à
  l'agent des SVG hostiles ; `Forme.origine` (licence) ne touche que `types.ts`, qui n'est plus édité après l'étape 0
  (ils le font **avant**, ils fusionnent sur `main` avant notre premier code).

## 4. Définition de « terminé » d'une étape

Les huit portes de l'annexe 7 §1 ; la règle de descente de la fonctionnalité ; ses fixtures, relues ; ses cas
hostiles ; ses phrases parlées ; son retour en arrière décrit en une ligne dans la PR ; aucune référence v1
modifiée ; le mode `plat` inchangé (loi du dessin plat) ; pour une étape d'interface, axe et e2e clavier.
