# ADR-0012, annexe 5 — Compatibilité, refus et `ignores`, exports, retour en arrière

## 1. Ce qui reste refusé, ce qui devient pris en charge, ce qui devient un `ignores`

L'ADR-0009 pose la règle : **fidèle, ou dit ce qu'elle perd** ; ce qui change le rendu au point de ne pas
s'éditer est refusé en le nommant. Les phrases de refus viennent de `heritage.ts` (`refusDe`), `parcours.ts`
(`NON_PRIS`, `p.refus.add(...)`) ; celles d'`ignores` de `ignores.ts`. Les références (`clip-path`, `mask`,
`filter`) se lisent dans les propriétés résolues par la cascade (`proprietesDe`), donc aussi quand elles
viennent d'une feuille `<style>` (`.st0 { clip-path: url(#SVGID_2_) }` à la façon d'Illustrator) ou de
`style="…"`.

### Devient pris en charge (mode `riche`)

Groupes, `clip-path`/`<clipPath>`, `mask`/`<mask>`, dégradés linéaires et radiaux, motifs, flou et ombre
portée du sous-ensemble, `<image>` en `data:`, `<path data-ed-texte>`, puis `<text>` basique et `<svg>`
imbriqué (étape 13). **En mode `plat`, rien de cela ne change : tout reste refusé comme aujourd'hui.**

### Reste refusé, nommé (les deux modes)

| Quoi | Phrase (après « Ce SVG contient … ») | Pourquoi |
|---|---|---|
| Une primitive de filtre hors sous-ensemble | « un filtre (feTurbulence) » (nom de la primitive) | pas de rendu portable, pas d'édition |
| `clip-path` en forme CSS (`circle()`, `polygon()`, `inset()`, `path()`) | « une découpe par forme CSS » | à étudier plus tard ; la forme CSS dépend de la boîte de référence |
| `clip-path`/`mask` vers un fichier ou une adresse extérieurs | « une découpe ou un masque qui renvoie à un fichier extérieur » | comme `<use>` externe |
| `mask-image`, `mask-mode`, `mask-composite`, `mask-border` (CSS Masking niveau 1 en entier) | « un masque CSS (mask-image…) » | hors `<mask>` SVG |
| Un cycle : découpe dans elle-même, masque dont le contenu s'emploie, motif qui se peint de lui-même, dégradé dont le `href` boucle | « un cycle de découpes / de masques / de motifs / de dégradés » | `actifs` comme pour `<use>` |
| Imbrication de définitions au-delà de 8 niveaux, groupes au-delà de 64, définitions au-delà de 20 000 nœuds | « des groupes emboîtés sur plus de 64 niveaux », etc. | bornes de lecture (§2) |
| `<foreignObject>`, `<switch>` | inchangé | |
| `<textPath>`, `writing-mode` vertical | « du texte sur un tracé » | reporté |
| `<image>` à adresse extérieure ou `data:image/svg+xml` | « une image qui renvoie à un fichier ou une adresse extérieurs » | sécurité |
| Une image de plus de 64 millions de pixels, ou de plus de 4 Mo | « une image trop grande (…) » | décompression |
| `<use>` : cycle, renvoi externe, plus de 16 niveaux, plus de 20 000 clones | inchangé (ADR-0009) | |

### Devient un `ignores` (lu, mais pas tout porté ; dit à l'ouverture)

Les phrases nouvelles (accents, vouvoiement n'y est pas : ce sont des constats) :

- « le mode de fusion (`mix-blend-mode`) : les formes se superposent normalement », « l'ordre de peinture
  (`paint-order`) : le contour se peint par-dessus le fond » — **constat d'un manque déjà présent** : `grep`
  dans `src/` et `tests/` ne trouve aucune lecture de `mix-blend-mode`, `isolation` ni `paint-order` (le seul
  `vector-effect` est une sortie de `vectorisation.ts`) ; ils se perdent aujourd'hui **sans être dits**.
  L'étape 1 les ajoute aux phrases, **dans les deux modes** (le message change, jamais les octets écrits ; les
  assertions d'`ignores` des fixtures concernées se relisent).
- « `vector-effect` (trait non mis à l'échelle) : il s'écrit à l'échelle » ;
- « les arrêts de dégradé au-delà de 64 (les derniers sont ignorés) » ;
- « l'espace colorimétrique des dégradés (`color-interpolation`) : toujours sRVB » ;
- « un flou calculé en RVB linéaire se calcule en sRVB (différence légère sur les bords colorés) » ;
- « la région d'un filtre plus étroite que son effet : l'effet s'écrit en entier » ;
- « un flou ou une ombre dont l'écart dépassait la limite : borné à … » ;
- « un flou anisotrope sous une rotation ou un cisaillement : écart moyen » ;
- « le style propre à une portion de texte (`<tspan>`), l'espacement des mots, `textLength` » ;
- « la police « Arial » n'est pas livrée : le texte est composé en Inter » ;
- « les données d'édition d'un texte sont illisibles : il reste en contours » ;
- « un motif dont la tuile déborde (`overflow: visible`) : il est rogné à la tuile » ;
- « les effets de plus de 2 000 formes ou groupes (les suivants sont ignorés) » ;
- « une opacité de groupe composée sur ses formes » (seulement à la **descente**, §4, pas à la lecture) ;
- en mode `plat`, seules les deux premières phrases (fusion, ordre de peinture) et `vector-effect` s'ajoutent ;
  tout le reste est propre au mode `riche`.

## 2. Bornes de lecture (constantes nommées, à l'image de `CLONES_MAX` et `PROFONDEUR_USE_MAX`)

| Constante | Valeur | Rôle |
|---|---|---|
| `PROFONDEUR_GROUPES_MAX` | 64 | groupes emboîtés |
| `GROUPES_MAX` | 20 000 | groupes par contenu |
| `PROFONDEUR_DEFS_MAX` | 8 | un masque qui contient un motif qui contient un masque… |
| `NOEUDS_DEFS_MAX` | 20 000 | feuilles et groupes de tous les contenus de définitions, clones compris (un `<use>` dans un `<clipPath>` compte au budget `CLONES_MAX`) |
| `CHAINE_HREF_MAX` | 16 | héritage `href` d'un dégradé ou d'un motif |
| `ARRETS_MAX` | 64 | arrêts d'un dégradé |
| `TEXTE_MAX` | 10 000 caractères | texte vivant |
| `ECART_MAX` | `max(l, h) / 4` | flou, ombre |
| `NOEUDS_A_EFFET_MAX` | 2 000 | effets lus |
| `IMAGE_OCTETS_MAX`, `IMAGES_OCTETS_MAX`, `IMAGE_PIXELS_MAX` | 4 Mo, 16 Mo, 64 Mpx | images |

Chaque borne a une fixture hostile (annexe 7), une phrase de refus ou d'`ignores`, et un test qui vérifie
que la lecture **termine vite** et ne lève jamais.

## 3. Le mode, le marqueur, le retour en arrière

- **Propriété `modele`** de l'éditeur (`'plat' | 'riche'`), du composant React et de `EditeurSvg.ouvrir`
  (documentée dans `docs/integration.md` par le chef de chantier à l'étape 14). Défaut : `'plat'` jusqu'à la
  bascule. La page lit un réglage (menu Édition, « Groupes, dégradés, effets (bêta) ») gardé par le
  `stockage` injecté (ADR-0010), de sorte que la page marche sans lui, en `plat`.
- **Un hôte embarqué qui stocke les SVG réécrits** (le cas que protège la règle des octets) garde `plat` et
  ne voit **rien** changer, y compris au-delà de la bascule, tant qu'il ne passe pas `modele: 'riche'`.
  C'est la seule vraie promesse d'« à l'identique demain » pour un hôte : **le défaut de l'embarquement ne
  change pas à la bascule** (question 3 : le propriétaire peut décider autrement).
- **`data-ed-modele="2"`** sur `<svg>` : posé par l'écriture de tout dessin non plat. Un marqueur d'une valeur
  **supérieure** à celle que connaît le programme est refusé en le disant (jamais de lecture « au mieux »).
  Un marqueur ≤ à celui connu est lu normalement.
- **Brouillon et versions** (`zones/session.ts`, `Versions.tsx`) gardent des SVG : ils porteront du v2. Quand le
  mode redevient `plat`, un brouillon ou une version à fonctions v2 ne s'ouvre pas : message « Cette version
  emploie des groupes, des dégradés ou des effets ; activez le modèle riche pour l'ouvrir », la version n'est
  **pas** effacée.
- **Exporter « SVG à plat »** (menu Fichier, dès l'étape 2) : `ecrireDessin(aplatirPour(d, CAPACITES_PLAT).dessin)`
  — les octets de l'ancien contrat, avec la liste de ce qui a été approché. C'est l'échappatoire pour tout
  consommateur d'un SVG qui n'a pas migré, et la protection de la promesse historique.
- **Retour en arrière par étape** : chaque étape ajoute du code derrière le mode `riche` et derrière
  `estPlat` ; la retirer (`git revert` du merge) ne touche pas un dessin plat. Les étapes d'interface sont en
  outre masquées par le réglage. La bascule (étape 14) est un unique commit de valeurs par défaut.

## 4. Les exports : une seule descente, `aplatirPour`

Le risque principal d'un modèle plus riche est qu'un exporteur existant (PDF, SVG de découpe) ou à venir
(DXF, EPS, PDF CMYK, PNG à DPI : l'agent des exports) lise `dessin.formes` d'un dessin à groupes et **écrive
faux en silence** : une feuille d'un groupe découpé écrite sans sa découpe, une feuille d'un groupe masqué
écrite en entier. D'où une seule fonction pure, `engine/aplatir.ts`.

```ts
export type Niveau = 'natif' | 'approche' | 'raster' | 'refus';
export interface Capacites {
  readonly groupes: Niveau; readonly decoupes: Niveau; readonly masques: Niveau;
  readonly degrades: Niveau; readonly motifs: Niveau; readonly effets: Niveau;
  readonly texte: Niveau; readonly images: Niveau;
}
declare const plat: unique symbol;
export type DessinPlat = DessinSvg & { readonly [plat]: true };   // une marque de type, pas un champ a l'execution
export function aplatirPour(d: DessinSvg, c: Capacites): { dessin: DessinPlat; pertes: readonly string[] };
```

- `aplatirPour` d'un dessin plat rend **le même objet** (`as DessinPlat`), sans coût et sans octet différent.
- Les exporteurs (`pdf.ts`, `svgs.ts`, DXF, EPS, PNG DPI) prennent un `DessinPlat` : **la signature empêche
  d'oublier la descente** (tant qu'un exporteur reçoit un `DessinSvg`, il ne compile plus ; à l'étape 0 la
  marque n'est qu'un alias, l'étape 1 la verrouille). Un test d'architecture interdit `export/*` de lire
  `groupes`.
- Règles de descente (chacune est **livrée avec la fonctionnalité** qu'elle accompagne : aucune étape de
  fonctionnalité ne fusionne sans la sienne) :

| Fonction | `natif` | `approche` | `raster` | `refus` |
|---|---|---|---|---|
| Groupe | — (le plan est plat) | toujours : feuilles dans l'ordre ; un groupe masqué disparaît ; **l'opacité d'un groupe** est multipliée sur ses feuilles (phrase si elles se recouvrent : approximation) | — | — |
| Découpe | l'exporteur sait rogner | intersection booléenne (`polygon-clipping`, `booleens.ts`) du **remplissage** de chaque feuille avec la découpe ; un **trait** n'est rogné qu'après l'outil de contour des outils de tracé : d'ici là le trait entier est gardé et dit | — | l'export dit non |
| Masque | (PDF : masque doux, étape 13) | ignoré, dit | rendu d'image | |
| Dégradé | (PDF : `shading` axial/radial, étape 13) | couleur de repli | — | |
| Motif | (PDF : motif de pavage, étape 13) | couleur de repli | — | |
| Effets | — | abandonnés, dits | rendu d'image par `io` | |
| Texte | contours (`d`) | — | — | |
| Image | (PDF : XObject, étape 13) | abandonnée, dite | — | |

| Exporteur | groupes | découpes | masques | dégradés | motifs | effets | texte | images |
|---|---|---|---|---|---|---|---|---|
| SVG | natif | natif | natif | natif | natif | natif | natif | natif |
| PNG (navigateur) | natif | natif | natif | natif | natif | natif | natif | natif |
| SVG « à plat » | approche | approche | approche | approche | approche | approche | natif | approche |
| SVG de découpe | approche | approche | approche | approche | approche | approche | natif | approche |
| PDF (aujourd'hui) | approche | approche | approche | approche | approche | raster/approche | natif | approche |
| PDF (étape 13) | approche | natif | natif | natif | natif | raster | natif | natif |
| DXF / EPS | approche | approche | approche | approche (EPS : natif possible) | approche | approche | natif | approche |

Le texte n'a pas de ligne « refus » : ses contours sont dans `d`. `pertes` est affiché à l'export, comme le
message « courbes rebâties » des booléens (ADR-0004).

## 5. Les chantiers parallèles : les coutures

| Chantier | Ce qu'il fait | Notre couture |
|---|---|---|
| Attribution de licence (`Forme.origine`, dialogue de crédits) | un champ sur la feuille, posé à l'insertion d'une forme de la bibliothèque | `Groupe.origine?` réservé du même type ; une insertion multi-feuilles (`inserer`) crée **un groupe** qui porte l'origine une fois en mode `riche`, et la pose sur chaque feuille en mode `plat`, comme eux. Les copies `{ ...f }` la propagent déjà ; `combiner`/booléens suivent la règle qu'ils fixeront (rien d'autre à faire ici). |
| Corpus hostile et durcissement (`tests/fixtures/hostile`, en cours dans un autre arbre) | invariants : la lecture ne lève jamais, termine, la sortie est propre | annexe 2 §6 (liste blanche, texte encodé), annexe 7 §5 (cas v2 à ajouter sous `tests/fixtures/hostile/v2/` dès que le dossier existe) |
| CI multi-navigateurs | exécute le sous-ensemble e2e sous Firefox et WebKit | notre sous-ensemble de rendu pixel (annexe 7 §6) s'inscrit dans leur matrice, il n'en crée pas une seconde |
| Outils de tracé (décalage, expansion, congé, types de nœuds) | opérations sur le chemin d'une **feuille** | elles passent par `surFormes` : correctes pour les groupes. Elles doivent refuser un texte vivant et une image avec la phrase commune de `dessinableEnPoints(f)` (nouvelle garde, une ligne). L'outil d'expansion de trait débloque la descente exacte d'un trait sous une découpe. |
| Formats d'export (DXF, EPS, PDF CMYK, PNG DPI) | nouveaux écrivains | §4 : ils reçoivent un `DessinPlat` et déclarent leurs `Capacites` ; ils peuvent démarrer sur le modèle **actuel** (le type `DessinPlat` est un alias à l'étape 0) et n'ont pas à attendre |
| Prétraitement d'image et lot | produit des dessins plats | aucune : le lot reste en mode `plat` ; `image` ouvre la voie à « enveloppé tel quel » éditable |
