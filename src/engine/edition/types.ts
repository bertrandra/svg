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
  /**
   * Ce que la machine fait de la forme en contexte de production (ADR-0028) : la lame la decoupe, ou le stylo l'ecrit. ABSENT
   * tant que personne ne l'a choisie : la forme suit alors la regle de proposition (engine/preparation/operations.ts). Le
   * fichier ne la porte (`data-ed-operation`) qu'en contexte Cricut et quand elle differe de ce que la regle proposerait.
   */
  readonly operation?: Operation;
  readonly regle: 'nonzero' | 'evenodd';
  readonly visible: boolean;
  readonly verrouille: boolean;

  // Le modele v2 (ADR-0012, annexe 1 §3) : des champs facultatifs, ABSENTS de tout dessin plat (arbre.ts, `estPlat`). Une forme qui
  // n'en porte aucun s'ecrit, se transforme et s'exporte exactement comme avant ; chacun n'est pose que par la lecture riche ou par
  // l'operation de l'etape qui le livre.

  /** Le groupe parent (`Groupe.id`) ; absent a la racine et dans tout dessin plat. */
  readonly parent?: string;
  /**
   * Une peinture non unie du fond (degrade, motif). Quand elle est la, `remplissage` vaut sa COULEUR DE REPLI (jamais null) : tout
   * code qui ne connait que les couleurs unies voit une couleur plausible (annexe 1 §6).
   */
  readonly peintureRemplissage?: Peinture;
  /** Idem pour le contour : `contour` vaut alors la couleur de repli. */
  readonly peintureContour?: Peinture;
  /** Le flou et l'ombre portee de la forme ; absent : aucun. */
  readonly effets?: Effets;
  /** Une image raster integree : `d` est alors le rectangle de l'image, `remplissage` et `contour` sont null (annexe 4, partie C). */
  readonly image?: ImageIntegree;
}

// ---------------------------------------------------------------- le modele v2 (ADR-0012, annexe 1)
// Ces types sont fixes a l'etape 0 pour que les etapes suivantes n'aient plus a editer ce fichier. Tout est dans le repere du plan :
// les unites de boite (`objectBoundingBox`…) se resolvent a la lecture, l'ecriture est toujours `userSpaceOnUse`.

/** Un arret de degrade : position dans [0 ; 1], croissante (la lecture trie et borne, comme un navigateur). */
export interface ArretDegrade {
  readonly position: number;
  /** #rrggbb. */
  readonly couleur: string;
  /** stop-opacity ; absente : 1. */
  readonly opacite?: number;
}

interface DegradeCommun {
  /** De 2 a 64 arrets ; au-dela, la lecture garde les 64 premiers et le dit. */
  readonly arrets: readonly ArretDegrade[];
  /** gradientTransform, deja compose avec la matrice de l'element (repere du plan) ; absente : identite. */
  readonly matrice?: Matrice;
  /** spreadMethod ; absent : pad. */
  readonly etalement?: 'reflect' | 'repeat';
}

export interface DegradeLineaire extends DegradeCommun {
  readonly genre: 'lineaire';
  readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number;
}

export interface DegradeRadial extends DegradeCommun {
  readonly genre: 'radial';
  readonly cx: number; readonly cy: number; readonly r: number;
  /** Le foyer ; absents : le centre et un rayon nul. */
  readonly fx?: number; readonly fy?: number; readonly fr?: number;
}

export type Degrade = DegradeLineaire | DegradeRadial;

/** Un motif : une tuile en unites du plan (patternUnits et patternContentUnits resolus, viewBox cuit dans le contenu). */
export interface Motif {
  readonly genre: 'motif';
  readonly x: number; readonly y: number; readonly l: number; readonly h: number;
  /** patternTransform compose ; absente : identite. */
  readonly matrice?: Matrice;
  readonly contenu: Contenu;
}

export type Peinture = Degrade | Motif;

/** Un flou gaussien : ecart-type en unites du plan, isotrope sans `ecartY`. */
export interface Flou {
  readonly ecart: number;
  readonly ecartY?: number;
}

/** Une ombre portee : decalage dans le repere du PLAN (la lumiere ne tourne pas avec la forme), ecart, couleur #rrggbb, opacite 0..1. */
export interface OmbrePortee {
  readonly dx: number; readonly dy: number;
  readonly ecart: number;
  readonly couleur: string;
  readonly opacite: number;
}

/** Au plus un flou et une ombre : l'ombre (de la silhouette nette) sous la forme floutee. Un effet de plus est un champ de plus. */
export interface Effets {
  readonly flou?: Flou;
  readonly ombre?: OmbrePortee;
}

/** Une image raster integree : `data:image/(png|jpeg|gif|webp);base64,…` seulement, jamais une adresse. */
export interface ImageIntegree {
  readonly donnees: string;
  readonly x: number; readonly y: number; readonly l: number; readonly h: number;
  /** Rotation, inclinaison, composees ; absente : identite. */
  readonly matrice?: Matrice;
  /** preserveAspectRatio ; absent : « xMidYMid meet ». */
  readonly aspect?: string;
}

/** Un groupe : un noeud de l'arbre, sans matrice vivante (les transformations sont cuites dans les feuilles, annexe 1 §1). */
export interface Groupe {
  /** 'g' et un numero, d'un compteur a part de celui des feuilles. */
  readonly id: string;
  /** Le groupe parent ; absent a la racine. */
  readonly parent?: string;
  readonly nom?: string;
  readonly visible: boolean;
  readonly verrouille: boolean;
  /** Composition reelle du groupe (pas une multiplication sur les feuilles) ; absente : 1. */
  readonly opacite?: number;
  readonly decoupe?: Decoupe;
  readonly masque?: Masque;
  readonly effets?: Effets;
  /** La provenance d'une insertion de plusieurs formes creditees, comme `Forme.origine` (ADR-0017, annexe 5 §5). */
  readonly origine?: readonly string[];
}

/** Ce qui est commun au dessin, a la tuile d'un motif, a une decoupe et a un masque : des feuilles et leurs groupes. */
export interface Contenu {
  /** Les feuilles, dans l'ordre de peinture (le parcours en profondeur de l'arbre). */
  readonly formes: readonly Forme[];
  /** Les groupes par identifiant ; ABSENTE d'un contenu plat (jamais une table vide). */
  readonly groupes?: Readonly<Record<string, Groupe>>;
}

/** Une decoupe (<clipPath>) : de la geometrie seulement ; la peinture des feuilles est ignoree, `regle` sert de clip-rule. */
export interface Decoupe {
  readonly contenu: Contenu;
}

/** Un masque d'opacite (<mask>), sa region dans le repere du plan. */
export interface Masque {
  readonly contenu: Contenu;
  readonly type: 'luminance' | 'alpha';
  readonly region: Boite;
}

/** Ce que la machine fait d'une forme (ADR-0028) : la decouper a la lame, ou l'ecrire (la dessiner) au stylo. */
export type Operation = 'decoupe' | 'ecriture';

/** L'alignement des lignes d'un texte vivant sur son point d'ancrage. */
export type AlignementTexte = 'gauche' | 'centre' | 'droite';

/**
 * La police d'un texte vivant : son identifiant (une fonte livree, `u-` et l'empreinte d'une fonte deposee, ou `c-` et l'empreinte
 * d'une variante du catalogue telechargeable, ADR-0025), sa version, son nom lisible.
 */
export interface PoliceTexte {
  readonly id: string;
  /** L'empreinte de la fonte qui a compose le texte (14 chiffres hexadecimaux) ; absente quand on ne la connait pas. */
  readonly version?: string;
  /** Le nom de famille, pour une fonte deposee ou une police du catalogue : de quoi dire « Police absente : … » sans l'index. */
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
  /**
   * Le trace des lettres (ADR-0027) : absent, celui de la police (des lettres pleines pour une police a contour, sa ligne pour
   * une police a trait unique) ; `median`, une police a contour se dessine en une seule ligne au milieu du trait, pour le stylo.
   */
  readonly trace?: 'median';
  readonly matrice: Matrice;
  /**
   * Le texte pose sur le trace d'une forme, ou dans son interieur (ADR-0031) : ABSENT pour un texte libre, donc sans effet sur
   * les octets de tout texte d'avant. Quand il est la, `matrice` ne porte plus que l'echelle du texte (la taille dans le plan est
   * `taille` fois l'echelle de la matrice) et un point d'ancrage (le debut du texte pose) : les lettres suivent la forme.
   */
  readonly disposition?: DispositionTexte;
}

/**
 * Le texte sur le trace d'une forme ou dans son interieur (ADR-0031), ou deforme pour en prendre la silhouette (ADR-0032), et la
 * forme qui le porte, par son identifiant.
 */
export type DispositionTexte = DispositionSurForme | DispositionDansForme | DispositionEnveloppe;

/** Le cote d'un texte sur un trace : au-dessus d'un trace ouvert (a l'exterieur d'une forme fermee), ou dessous (a l'interieur). */
export type CoteTexte = 'dessus' | 'dessous';

export interface DispositionSurForme {
  readonly mode: 'sur';
  /** L'identifiant de la forme qui porte le texte. */
  readonly forme: string;
  /** Ou se pose le point d'alignement du texte, en part de la longueur du trace : dans [0 ; 1[ sur une forme fermee (0 : son point le plus haut a l'exterieur, le plus bas a l'interieur), dans [0 ; 1] sur un trace ouvert (0 : son debut) ; 0 par defaut. */
  readonly depart: number;
  /** `dessus` par defaut. */
  readonly cote: CoteTexte;
  /** Repartir les lettres sur tout le trace ; faux par defaut. */
  readonly repartir: boolean;
}

export interface DispositionDansForme {
  readonly mode: 'dans';
  readonly forme: string;
  /** La marge interieure, en part de la taille du texte ; 0,25 par defaut. */
  readonly marge: number;
  /** Prendre la plus grande taille qui tient dans la forme ; faux par defaut. */
  readonly ajuster: boolean;
  /** Justifier les lignes pleines ; faux par defaut. */
  readonly justifier: boolean;
}

/**
 * Le texte deforme dans une forme (ADR-0032) : le bloc entier est etire et courbe pour en remplir le contour exterieur, ses lettres
 * deformees (une enveloppe verticale). La taille du texte s'y calcule (la hauteur de la forme sur celle du bloc) : elle ne sert qu'a
 * la marge et aux tolerances.
 */
export interface DispositionEnveloppe {
  readonly mode: 'enveloppe';
  readonly forme: string;
  /** La marge interieure, en part de la taille du texte ; 0,05 par defaut. */
  readonly marge: number;
}

/** Le dessin : un plan de travail et un contenu. Sans `groupes` ni champ v2 sur ses feuilles, il est plat (ADR-0001). */
export interface DessinSvg extends Contenu { readonly vb: readonly [number, number, number, number] }
export interface Boite { x: number; y: number; l: number; h: number }
export type Matrice = readonly [number, number, number, number, number, number];

export const IDENTITE: Matrice = [1, 0, 0, 1, 0, 0];
