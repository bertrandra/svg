# ADR-0012, annexe 1 — Le modèle de données

Esquisse en TypeScript (commentaires sans accents, comme dans le code source). `readonly` partout,
compatible avec `exactOptionalPropertyTypes` (un champ facultatif est **absent**, jamais `undefined`) et
`noUncheckedIndexedAccess` (`tsconfig.json`). Ces types sont une cible : les noms définitifs se fixent à
l'étape 0, les invariants, eux, sont la décision.

## 1. Ce qui reste tel quel

`Commande`, `Chemin`, `Matrice`, `Boite`, et tous les champs actuels de `Forme`
(`src/engine/edition/types.ts`) : `id`, `d`, `remplissage`, `contour`, `epaisseur`, `opacite`,
`opaciteRemplissage`, `opaciteContour`, `pointilles`, `decalagePointilles`, `bout`, `jonction`,
`limiteMitre`, `regle`, `visible`, `verrouille`. Un chemin est toujours absolu, en commandes M, L, C, Q, Z,
**dans le repère du plan de travail** (ADR-0001). Le modèle v2 n'ajoute que des champs **facultatifs** et
des structures **absentes** d'un dessin plat.

## 2. Identifiants

```ts
/** 'f12' : feuille ; 'g3' : groupe. Un seul espace de numeros par dessin, contenus de decoupes et de masques compris. */
export type IdNoeud = string;
```

- Les feuilles gardent `'f' + n` (c'est ce que `prochainId` lit : `/^f(\d+)$/` dans `operations.ts`).
  Les groupes sont `'g' + n`, d'un compteur séparé par préfixe. Aucune collision possible entre les deux
  espaces, donc une sélection (`string[]`) mélange sans ambiguïté feuilles et groupes.
- **Les identifiants du modèle ne sont jamais écrits** dans le SVG : l'écriture actuelle ne pose aucun
  `id` (`composerForme`, `ecrireDessin` dans `ecriture.ts`), le modèle v2 non plus. Seules les définitions
  référencées (`<clipPath>`, `<mask>`, dégradés, motifs, filtres) reçoivent un `id`, calculé à l'écriture
  par empreinte de leur contenu (annexe 2, §4).
- `prochainId` (aujourd'hui : plus grand `fN` des seules `dessin.formes`) devient `prochainNumero(dessin,
  'f' | 'g')` et parcourt aussi les contenus de découpes, de masques et de motifs ; mémoïsé par dessin
  (`WeakMap`, ADR-0008).

## 3. Feuilles (`Forme`)

```ts
export interface Forme {
  // ... tous les champs actuels, inchanges ...

  /** Groupe parent ; absent a la racine et dans tout dessin plat. */
  readonly parent?: string;

  /**
   * Peinture non unie. Quand elle est presente, `remplissage` (resp. `contour`) vaut la COULEUR DE REPLI
   * (jamais null) : moyenne OKLab ponderee des arrets, ou couleur dominante de la tuile d'un motif.
   * Tout code qui ne connait que les couleurs unies voit donc une couleur plausible.
   */
  readonly peintureRemplissage?: Peinture;
  readonly peintureContour?: Peinture;

  /** Effets (flou, ombre). Absent = aucun. */
  readonly effets?: Effets;

  /** Texte vivant : `d` est alors les contours composes de ce texte (annexe 4). */
  readonly texte?: TexteVivant;

  /** Image raster integree : `d` est alors le rectangle de l'image (annexe 4, §6). */
  readonly image?: ImageIntegree;
}
```

Aucune feuille n'a de matrice de transformation « vivante » : les transformations sont cuites dans `d`
comme aujourd'hui. Les seules matrices du modèle sont des **paramètres** de peinture, de texte ou d'image
(`Degrade.matrice`, `Motif.matrice`, `TexteVivant.matrice`, `ImageIntegree.matrice`), composées avec
chaque transformation appliquée à la feuille (annexe 3).

### Peintures

```ts
export type Peinture = Degrade | Motif;

export interface ArretDegrade {
  readonly position: number;      // 0..1, croissante (la lecture trie et borne, comme un navigateur)
  readonly couleur: string;       // #rrggbb
  readonly opacite?: number;      // stop-opacity ; absent = 1
}

interface DegradeCommun {
  readonly arrets: readonly ArretDegrade[];   // 2 a 64 ; au-dela, la lecture garde 64 et le dit
  /** gradientTransform, deja compose avec la matrice de l'element (repere du plan). Absent = identite. */
  readonly matrice?: Matrice;
  readonly etalement?: 'reflect' | 'repeat';  // absent = pad
}
export interface DegradeLineaire extends DegradeCommun {
  readonly genre: 'lineaire';
  readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number;   // repere du plan, avant `matrice`
}
export interface DegradeRadial extends DegradeCommun {
  readonly genre: 'radial';
  readonly cx: number; readonly cy: number; readonly r: number;
  readonly fx?: number; readonly fy?: number; readonly fr?: number;     // foyer ; absents = centre / 0
}
export type Degrade = DegradeLineaire | DegradeRadial;

export interface Motif {
  readonly genre: 'motif';
  /** La tuile, en unites du plan : origine et taille (patternUnits/patternContentUnits resolues a la lecture). */
  readonly x: number; readonly y: number; readonly l: number; readonly h: number;
  readonly matrice?: Matrice;               // patternTransform compose
  readonly contenu: Contenu;                // les formes de la tuile, dans le repere du plan
}
```

**Tout est en unités du plan.** `gradientUnits="objectBoundingBox"`, `patternUnits`,
`patternContentUnits`, `clipPathUnits`, `maskUnits`, `maskContentUnits`, `primitiveUnits` et `filterUnits`
sont **résolus à la lecture** (la boîte de l'élément est connue à ce moment-là, puisque ses formes sont
déjà cuites) et jamais conservés. À l'écriture, tout est `userSpaceOnUse`. Conséquence : une peinture ne
dépend d'aucune boîte, redimensionner une feuille transforme sa peinture avec elle, et la relecture d'un
fichier écrit est un point fixe.

**Pas de table de définitions.** Une peinture, une découpe, un masque ou un effet est une **valeur en
ligne** de la feuille ou du groupe qui l'emploie (une référence JavaScript partagée quand un même objet
sert à plusieurs, ce qui ne coûte rien en mémoire). Le partage SVG (`id` + `url(#id)`) n'existe qu'à la
lecture (résolution) et à l'écriture (dédoublonnage par empreinte).

### Effets

```ts
/** Au plus un flou et une ombre : le resultat est ombre (de la silhouette nette) sous la forme floutee. */
export interface Effets {
  readonly flou?: Flou;
  readonly ombre?: OmbrePortee;
}
export interface Flou {
  readonly ecart: number;          // ecart-type horizontal, unites du plan, 0 < ecart <= ECART_MAX
  readonly ecartY?: number;        // absent = ecart (flou isotrope)
}
export interface OmbrePortee {
  readonly dx: number; readonly dy: number;     // decalage, REPERE DU PLAN (la lumiere ne tourne pas avec la forme)
  readonly ecart: number;
  readonly couleur: string;                     // #rrggbb
  readonly opacite: number;                     // 0..1
}
```

Un objet plutôt qu'une liste : deux effets, indépendants, sans ordre à arbitrer (une liste ordonnée
promettrait des chaînes de filtres que le sous-ensemble portable ne tient pas). Un effet de plus (lueur,
ombre interne) est un champ de plus.

### Texte vivant et image

```ts
export interface PoliceRef {
  readonly id: string;             // identifiant d'une des fontes livrees, ou 'u:' + empreinte d'une fonte deposee
  readonly famille: string;        // nom lisible, pour dire « Police absente : … »
}
export interface TexteVivant {
  readonly texte: string;          // retours a la ligne = '\n'
  readonly police: PoliceRef;
  readonly taille: number;         // unites du plan
  readonly interlettrage: number;  // en part de la taille (comme OptionsTexte.interlettrage)
  readonly interligne: number;     // en part de la taille (1.2 par defaut, comme composer)
  readonly alignement: 'gauche' | 'centre' | 'droite';
  readonly ligatures: boolean;
  readonly largeurBoite?: number;  // absent = texte libre (pas de retour automatique)
  readonly origine: readonly [number, number];   // coin de la boite / point d'ancrage de la premiere ligne
  readonly matrice?: Matrice;      // rotation / inclinaison / echelle du bloc, composees
}
export interface ImageIntegree {
  readonly donnees: string;        // data:image/png|jpeg|gif|webp;base64,... (jamais d'adresse)
  readonly x: number; readonly y: number; readonly l: number; readonly h: number;
  readonly matrice?: Matrice;
  readonly aspect?: string;        // preserveAspectRatio ; absent = « xMidYMid meet »
}
```

## 4. Groupes et contenus

```ts
export interface Groupe {
  readonly id: string;                         // 'g3'
  readonly parent?: string;                    // absent = racine
  readonly nom?: string;
  readonly visible: boolean;
  readonly verrouille: boolean;
  readonly opacite?: number;                   // absent = 1 ; composition reelle du groupe (pas de multiplication sur les feuilles)
  readonly decoupe?: Decoupe;
  readonly masque?: Masque;
  readonly effets?: Effets;
}

/** Ce qui est commun au dessin, a la tuile d'un motif, a une decoupe et a un masque : des feuilles et leurs groupes. */
export interface Contenu {
  readonly formes: readonly Forme[];                           // feuilles, ordre de peinture (parcours en profondeur)
  readonly groupes?: Readonly<Record<string, Groupe>>;         // absent = plat
}

export interface Decoupe {                      // <clipPath> ; rien d'autre que de la geometrie
  readonly contenu: Contenu;                     // la peinture des feuilles est ignoree, `regle` sert de clip-rule
}
export interface Masque {                       // <mask>
  readonly contenu: Contenu;
  readonly type: 'luminance' | 'alpha';
  readonly region: Boite;                        // repere du plan ; borne la zone visible
}

export interface DessinSvg extends Contenu {
  readonly vb: readonly [number, number, number, number];
}
```

`DessinSvg extends Contenu` garde le type actuel `{ vb, formes }` valide tel quel : `groupes` est un champ
facultatif de plus. **Tout le code existant qui lit `dessin.formes` continue de compiler et de s'exécuter**
(§7 : mesure). Une opération écrite pour `DessinSvg` s'applique au contenu d'une découpe, d'un masque ou
d'une tuile en l'enveloppant : `{ vb, ...contenu }` (c'est ce qui permet « modifier le masque » avec les
mêmes outils).

## 5. Invariants (vérifiés par `verifierDessin`, pur)

| # | Invariant | Pourquoi |
|---|---|---|
| I1 | Les identifiants de feuilles et de groupes sont uniques dans tout le dessin, contenus imbriqués compris. | Une sélection est un tableau d'ids ; le contexte d'édition d'un masque ne doit pas créer d'ambiguïté. |
| I2 | `parent` d'une feuille, et `Groupe.parent`, désignent un groupe du **même** `Contenu` ; pas de cycle ; profondeur ≤ 64. | Arbre bien formé ; borne de lecture (annexe 5). |
| I3 | **Contiguïté** : les feuilles descendantes d'un groupe occupent un intervalle contigu de `formes`, et l'ordre de `formes` est le parcours en profondeur de l'arbre (les groupes frères sont ordonnés par leur première feuille). | C'est ce qui rend l'ordre de peinture lisible dans une liste plate, et chaque groupe une simple tranche. |
| I4 | Aucun groupe n'est vide. | Un groupe sans feuille n'a ni rang ni boîte ; l'écriture ne le saurait pas placer. |
| I5 | Si `peintureRemplissage` est présente, `remplissage !== null` (idem contour). | Repli pour tout le code qui ne connaît que les couleurs unies (§6). |
| I6 | Un dessin sans `groupes` et dont aucune feuille ne porte un champ v2 est **plat** (`estPlat`) ; il se comporte et s'écrit exactement comme le dessin actuel. | La politique d'octets. |
| I7 | Les valeurs sont immuables ; une opération qui ne change rien rend le **même objet** (`===`). | L'historique l'exige (`avancer` ignore un état identique, `util/historique.ts`). |
| I8 | `normaliser(d)` est idempotent et rend `d` lui-même s'il est déjà normal. | Filet après toute opération qui déplace des feuilles. |

`normaliser` : retire les groupes vides (en cascade vers le haut), rétablit la contiguïté en suivant l'arbre de
`parent`, et ne renumérote rien. Il ne dissout jamais un groupe voulu, même à un seul enfant et sans rien
porter. Sur un dessin plat : `return d` en première ligne (zéro coût).

## 6. Pourquoi la couleur de repli plutôt qu'un `remplissage` qui devient `string | Peinture`

`remplissage: string | null` est lu comme **une couleur** par au moins : `couleurs.ts`
(`couleursDuDessin`, `groupesDeCouleur`, `remplacerCouleur`), `description.ts` (« fond rouge #c81e28 »),
`phrasesSelection.ts`, `LigneCouleur*.tsx`, `export/pdf.ts` (`composantes(hex)`), `Toile.tsx`
(`fill={f.remplissage ?? 'none'}`), `palettes.ts`, `extraction.ts`. Changer son type casserait tout cela d'un
coup. Avec un repli, le type ne bouge pas, les exports qui ne savent pas peindre un dégradé écrivent une
couleur raisonnable **sans code nouveau**, et la phrase parlée dit « fond dégradé rouge vers bleu » en
ajoutant une branche, pas en réécrivant toutes les autres.

Règle de couleur : les listes et remplacements de couleurs (`couleursDuDessin`, `groupesDeCouleur`,
`remplacerCouleur`, palettes) **ignorent** les feuilles à peinture non unie à l'étape 3 (elles ne comptent
pas, ne changent pas), et les reprennent à l'étape 13 (arrêts de dégradé traités comme des couleurs) ;
jamais de demi-mesure où le repli changerait sans que le dégradé change.

## 7. Mesure : ce que coûte `parent`

Essai jetable dans l'arbre de travail (annulé ensuite), `tsc --noEmit` complet :

| Essai | Erreurs de type |
|---|---|
| `readonly parent?: string` ajouté à `Forme` | **0** |
| `readonly parent: string \| null` (obligatoire) | **4** : `engine/texte.ts` (`ajouterTexte`), `edition/parcours.ts` (`poserForme`), `edition/formes.ts` (`ajouterForme`), `tests/unit/engine/couleurs-proches-equivalence.test.ts` |

Autrement dit, seules **quatre** expressions construisent une `Forme` de toutes pièces ; toutes les autres
la copient par `{ ...f, … }`, ce qui propage `parent`, `effets`, `peintureRemplissage`… sans y toucher
(c'est aussi le piège : une copie qui devrait **retirer** `parent` doit le dire, voir `combiner`,
`separer`, `inserer`, annexe 3). Comptes de l'état actuel : 97 fichiers (`src` et `tests`) importent
`Forme`, `DessinSvg` ou `editionSvg` ; 39 fichiers de `src` lisent `.formes` (110 occurrences : 62 dans
`engine/`, 2 dans `export/`, 46 dans 20 fichiers de `zones/`) ; aucun dans `io/`, `model/` ni `util/`.

## 8. Vue en arbre dérivée

```ts
export type NoeudArbre =
  | { readonly genre: 'groupe'; readonly groupe: Groupe; readonly enfants: readonly NoeudArbre[]; readonly debut: number; readonly fin: number }
  | { readonly genre: 'feuille'; readonly forme: Forme; readonly index: number };

export interface Arbre {
  readonly racine: readonly NoeudArbre[];
  readonly parId: ReadonlyMap<string, NoeudArbre>;      // feuilles et groupes
}
/** Memoisee par dessin (WeakMap). Dessin plat : racine = une feuille par forme, sans parcours de `groupes`. */
export function arbreDe(d: Contenu): Arbre;
```

`debut`/`fin` sont l'intervalle de `formes` du groupe (I3) : les feuilles d'un groupe sont
`d.formes.slice(debut, fin)`, sans parcours. L'interface (liste des calques, rendu de la toile, navigation)
lit l'arbre ; les opérations lisent `formes`.

## 9. Aides du moteur (pures, dans `engine/edition/arbre.ts`)

```ts
feuillesDe(d, ids): string[]            // ids de feuilles couvertes par des feuilles et/ou des groupes, dans l'ordre du dessin
unites(d, ids): string[]                // noeuds choisis moins ceux dont un ancetre est aussi choisi (les « racines » de la selection)
promouvoir(d, ids): string[]            // ajoute tout groupe dont TOUTES les feuilles sont choisies (regle de la fermeture, ci-dessous)
visibleEffectif(d, id): boolean         // visible ET tous les ancetres visibles
verrouilleEffectif(d, id): boolean      // verrouille OU un ancetre verrouille
profondeur(d, id): number
ancetres(d, id): string[]
estPlat(d): boolean                     // memoise
verifierDessin(d): string[]             // liste des invariants violes ; [] = bon
```

**Règle de la fermeture** : une opération qui transforme (déplacer, redimensionner, tourner, retourner,
numérique) déplace aussi la découpe, le masque, les effets et la peinture d'un groupe **quand le groupe est
dans la sélection**, c'est-à-dire quand le groupe est choisi, ou quand **toutes** ses feuilles le sont
(`promouvoir`). Une feuille seule déplacée hors d'un groupe découpé sort de sa découpe, comme dans un
logiciel de dessin ; mais « tout sélectionner » puis déplacer ne fait jamais glisser le contenu sous une
découpe immobile.
