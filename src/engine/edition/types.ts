// Les types du dessin a plat (ADR-0001) : une liste de formes, du plus bas au plus haut plan, chacune
// un chemin en commandes absolues. Aucun calcul ici, pour que chaque module d'edition puisse les
// importer sans s'importer entre eux.

export type Lettre = 'M' | 'L' | 'C' | 'Q' | 'Z';
export interface Commande { readonly c: Lettre; readonly p: readonly number[] }
export type Chemin = readonly Commande[];

/** Le bout d'un trait ouvert ou d'un tiret. Le bout plat (`butt`) est celui qui s'ecrivait deja : il n'est pas un champ. */
export type BoutNonPlat = 'round' | 'square';
/** La jonction de deux segments. La ronde est celle que l'ecriture posait toujours : elle n'est pas un champ. */
export type JonctionNonRonde = 'miter' | 'bevel';

export interface Forme {
  readonly id: string;
  readonly d: Chemin;
  readonly remplissage: string | null;
  readonly contour: string | null;
  readonly epaisseur: number;
  /** L'opacite de la forme entiere (attribut `opacity`, celui des groupes qui la portent). */
  readonly opacite: number;
  /**
   * L'opacite propre au remplissage (alpha de la couleur lue, `fill-opacity`), 1 si absente. Un champ
   * a part de `opacite` : un fond a demi transparent n'estompe pas son contour. Facultatif pour que
   * toute forme sans alpha s'ecrive exactement comme avant.
   */
  readonly opaciteRemplissage?: number;
  /** Idem pour le contour (alpha de la couleur du trait, `stroke-opacity`). */
  readonly opaciteContour?: number;
  /**
   * Le style du trait, au-dela de sa couleur et de son epaisseur (suite de l'ADR-0009). Tous facultatifs et ABSENTS quand
   * ils valent ce que l'ecriture posait deja (trait plein, bout plat, jonction ronde, limite 4) : toute forme
   * sans eux garde les memes champs et les memes octets.
   * `pointilles` est le motif trait/blanc/trait/blanc… en unites du plan, toujours de longueur paire (un motif
   * impair se repete une fois, comme le dit la specification), sans valeur negative et sans etre tout nul.
   */
  readonly pointilles?: readonly number[];
  /** Ou le motif commence ; absent pour 0, et sans effet sans `pointilles`. */
  readonly decalagePointilles?: number;
  readonly bout?: BoutNonPlat;
  readonly jonction?: JonctionNonRonde;
  /** Le rapport de pointe a epaisseur au-dela duquel une jonction `miter` est biseautee ; absent pour 4, et sans effet hors `miter`. */
  readonly limiteMitre?: number;
  /**
   * La provenance de la forme : les origines creditees dont elle vient (`game-icons:3d-glasses`), triees et sans
   * doublon, jamais vide. ABSENTE pour toute forme dessinee ici ou lue sans marque : elle ne change alors aucun
   * octet ecrit. Une forme qui en porte fait ecrire `data-origine` et l'element <metadata> d'attribution
   * (provenance.ts) ; un assemblage (combiner, booleens, regrouper) garde l'union des origines de ses parties.
   */
  readonly origine?: readonly string[];
  readonly regle: 'nonzero' | 'evenodd';
  readonly visible: boolean;
  readonly verrouille: boolean;
}

export interface DessinSvg { readonly vb: readonly [number, number, number, number]; readonly formes: readonly Forme[] }
export interface Boite { x: number; y: number; l: number; h: number }
export type Matrice = readonly [number, number, number, number, number, number];

export const IDENTITE: Matrice = [1, 0, 0, 1, 0, 0];
