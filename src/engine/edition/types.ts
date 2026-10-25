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
  /**
   * Le texte vivant (ADR-0022) : `d` est alors les contours composes de ce texte, poses par `texte.matrice`. ABSENT de
   * toute autre forme, donc sans effet sur ses octets. Une operation qui change `d` sans connaitre le texte (booleen,
   * points, contour en forme) le perd : la forme redevient un chemin ordinaire (`garderTextes`, texteVivant.ts).
   */
  readonly texte?: TexteVivant;
  readonly regle: 'nonzero' | 'evenodd';
  readonly visible: boolean;
  readonly verrouille: boolean;
}

/** L'alignement des lignes d'un texte vivant sur son point d'ancrage. */
export type AlignementTexte = 'gauche' | 'centre' | 'droite';

/** La police d'un texte vivant : son identifiant (une fonte livree, ou `u-` et l'empreinte d'une fonte deposee), sa version, son nom lisible. */
export interface PoliceTexte {
  readonly id: string;
  /** L'empreinte de la fonte qui a compose le texte (14 chiffres hexadecimaux) ; absente quand on ne la connait pas. */
  readonly version?: string;
  /** Le nom de famille, seulement pour une fonte deposee : de quoi dire « Police absente : … ». */
  readonly famille?: string;
}

/**
 * Ce qui fait d'une forme un texte modifiable. Les longueurs sont dans le repere de composition (la premiere ligne de
 * base passe par l'origine, Y vers le bas) ; `matrice` porte ce repere dans le plan, et suit chaque transformation de
 * la forme : retaper le texte le recompose a la meme place, a la meme echelle, au meme angle.
 */
export interface TexteVivant {
  readonly texte: string;
  readonly police: PoliceTexte;
  readonly taille: number;
  /** En part de la taille, comme `OptionsTexte.interlettrage`. */
  readonly interlettrage: number;
  /** En part de la taille ; 1,2 par defaut. */
  readonly interligne: number;
  readonly alignement: AlignementTexte;
  readonly ligatures: boolean;
  readonly matrice: Matrice;
}

export interface DessinSvg { readonly vb: readonly [number, number, number, number]; readonly formes: readonly Forme[] }
export interface Boite { x: number; y: number; l: number; h: number }
export type Matrice = readonly [number, number, number, number, number, number];

export const IDENTITE: Matrice = [1, 0, 0, 1, 0, 0];
