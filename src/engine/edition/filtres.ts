// L'evaluation d'un filtre et la reconnaissance de ce qu'il calcule (ADR-0012, etapes 7 et 13b ; annexe 4 B §3) : chaque primitive lue
// devient une image intermediaire symbolique (le graphique, son alpha, un aplat, un flou, un decalage, une composition, une pile de
// couches), simplifiee a mesure par ce qu'un navigateur calcule exactement : un aplat transparent ne laisse rien, une fusion avec une
// image transparente rend l'autre image quel que soit son mode, une matrice de couleurs identite ne change rien, une matrice qui ne pose
// qu'une couleur et un facteur d'alpha teint une silhouette, un facteur d'alpha au-dela de 1 la durcit. L'image finale se reconnait
// ensuite : le graphique, flou ou non, et au plus une ombre portee dessous. Les idiomes des editeurs (Figma : aplat transparent
// « BackgroundImageFix », alpha durci par une matrice x127, fusions `normal` ; Sketch : alpha decale, flou, teint par une matrice,
// fusionne sous le graphique ; Illustrator : `AI_Shadow`, et `Adobe_OpacityMaskFilter`, une matrice identite) se reconnaissent ainsi
// par ce qu'ils calculent, jamais par le texte de leurs attributs ; leur nom ne sert qu'a dire ce qui est refuse.
//
// Pur : aucune lecture de noeud ici (effets.ts lit les attributs et la cascade, puis appelle ces fonctions).

import { gamma, lineaire, versHex } from '../../util/couleur.js';
import { arrondirOpacite } from './opacites.js';
import { t } from '../../util/i18n.js';

// ---------------------------------------------------------------- phrases

/**
 * Ce que la lecture riche refuse en le nommant, pour un filtre dont les primitives sont admises mais dont le calcul ne se ramene pas a
 * un flou et une ombre portee (apres « Ce SVG contient … ») ; l'idiome reconnu s'y ajoute entre parentheses (`avecIdiome`). Des
 * accesseurs : la phrase est celle de la langue de l'interface au moment ou on la lit.
 */
export const REFUS_IDIOMES = {
  get interieure(): string { return t('une ombre intérieure'); },
  get plusieurs(): string { return t('plusieurs ombres portées'); },
  get flouCalque(): string { return t('un flou appliqué à la forme et à son ombre ensemble'); },
  get couleurs(): string { return t('un filtre qui change les couleurs de la forme'); },
  get inverse(): string { return t('un filtre qui inverse les couleurs de la forme'); },
  get matrice(): string { return t('une matrice de couleurs illisible (feColorMatrix)'); },
  get fond(): string { return t('un fond de couleur posé par un filtre'); },
  get efface(): string { return t('un filtre qui efface la forme'); },
  get transparente(): string { return t('une ombre portée calculée sur la forme pleine, sous une forme en partie transparente'); }
};

/** Un mode de fusion qui n'est pas `normal`, entre deux images qui se voient toutes les deux. */
export const refusFusion = (mode: string): string => t('un mode de fusion autre que normal ({mode})', { mode: mode.slice(0, 20) });

/** Les editeurs dont un idiome se reconnait (pour dire ce qui est refuse, jamais pour accepter). */
export type Idiome = 'Figma' | 'Sketch' | 'Illustrator';

/** Une phrase de refus suivie de l'idiome reconnu : « une ombre intérieure (Figma) », « un filtre (feMorphology, Figma) ». */
export function avecIdiome(phrase: string, idiome: Idiome | undefined): string {
  if (!idiome) return phrase;
  return phrase.endsWith(')') ? phrase.slice(0, -1) + ', ' + idiome + ')' : phrase + ' (' + idiome + ')';
}

// ---------------------------------------------------------------- les images

/** Une image intermediaire d'un filtre, en unites de primitive (pas encore dans le plan). */
export type Image =
  | { readonly k: 'source' }
  | { readonly k: 'alpha' }
  | { readonly k: 'vide' }
  | { readonly k: 'aplat'; readonly couleur: string; readonly opacite: number }
  | { readonly k: 'flou'; readonly de: Image; readonly sx: number; readonly sy: number; readonly lineaire: boolean }
  | { readonly k: 'decalage'; readonly de: Image; readonly dx: number; readonly dy: number }
  /** `a` compose dans l'alpha de `b` (feComposite in). */
  | { readonly k: 'dans'; readonly a: Image; readonly b: Image }
  /** `a` hors de l'alpha de `b` (feComposite out). */
  | { readonly k: 'hors'; readonly a: Image; readonly b: Image }
  /** L'alpha de `de` multiplie par `f` > 1 et borne a 1 : une silhouette durcie (l'alpha x127 de Figma). */
  | { readonly k: 'dur'; readonly de: Image; readonly f: number }
  /** Une composition arithmetique (k1 a b + k2 a + k3 b + k4) : gardee pour etre nommee. */
  | { readonly k: 'arith'; readonly a: Image; readonly b: Image; readonly k2: number; readonly k3: number }
  /** Des couches, de bas en haut, chacune posee sur les precedentes (feMerge, feComposite over, feBlend normal). */
  | { readonly k: 'pile'; readonly couches: readonly Image[] };

export const SOURCE: Image = { k: 'source' };
export const ALPHA: Image = { k: 'alpha' };
export const VIDE: Image = { k: 'vide' };

/** Un aplat ; transparent, il ne laisse rien. */
export const aplat = (couleur: string, opacite: number): Image => (opacite > 0 ? { k: 'aplat', couleur, opacite } : VIDE);

/** Un flou : un ecart negatif, ou deux ecarts nuls, desactivent la primitive (son resultat est son entree), comme le dit la specification. */
export const flou = (de: Image, sx: number, sy: number, lineaire: boolean): Image =>
  de.k === 'vide' || sx < 0 || sy < 0 || (sx === 0 && sy === 0) ? de : { k: 'flou', de, sx, sy, lineaire };

export const decalage = (de: Image, dx: number, dy: number): Image => (de.k === 'vide' || (dx === 0 && dy === 0) ? de : { k: 'decalage', de, dx, dy });

export const dans = (a: Image, b: Image): Image => (a.k === 'vide' || b.k === 'vide' ? VIDE : { k: 'dans', a, b });

export const hors = (a: Image, b: Image): Image => (a.k === 'vide' ? VIDE : b.k === 'vide' ? a : { k: 'hors', a, b });

/** Les couches d'une pile aplatie, au plus : au-dela, elle reste emboitee (seize fusions de seize couches feraient 16^16 couches). */
const PILE_MAX = 32;

/**
 * Une pile (de bas en haut) : les piles emboitees s'aplatissent (dans la limite de `PILE_MAX` couches), les couches transparentes
 * partent ; une seule couche est cette couche.
 */
export function pile(couches: readonly Image[]): Image {
  const visibles = couches.filter(c => c.k !== 'vide');
  const total = visibles.reduce((n, c) => n + (c.k === 'pile' ? c.couches.length : 1), 0);
  const plates = total <= PILE_MAX ? visibles.flatMap(c => (c.k === 'pile' ? c.couches : [c])) : visibles;
  return plates.length === 0 ? VIDE : plates.length === 1 ? (plates[0] ?? VIDE) : { k: 'pile', couches: plates };
}

/**
 * Une composition arithmetique `k1 a b + k2 a + k3 b + k4`, simplifiee quand elle ne rend que l'une des deux images ; sinon gardee,
 * pour etre nommee (l'ombre interieure de Figma et de Sketch : k2 = -1, k3 = 1).
 */
export function arithmetique(a: Image, b: Image, k1: number, k2: number, k3: number, k4: number): Image {
  if (k1 === 0 && k4 === 0 && k2 === 1 && k3 === 0) return a;
  if (k1 === 0 && k4 === 0 && k2 === 0 && k3 === 1) return b;
  if (k1 === 0 && k2 === 0 && k3 === 0 && k4 === 0) return VIDE;
  return { k: 'arith', a, b, k2, k3 };
}

// ---------------------------------------------------------------- feBlend

/** Les modes de fusion de Filter Effects et de Compositing ; une autre valeur est invalide et vaut `normal` (la valeur de repli). */
const MODES: ReadonlySet<string> = new Set([
  'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion',
  'hue', 'saturation', 'color', 'luminosity', 'plus-darker', 'plus-lighter'
]);

/**
 * Une fusion `in` sur `in2`. En mode `normal`, `in` se pose sur `in2`. Dans tout autre mode, la formule de composition
 * (Cr = (1 - ab) Cs + (1 - as) Cb + as ab B(Cs, Cb)) rend l'une des deux images quand l'autre est transparente : c'est le cas de
 * l'aplat transparent « BackgroundImageFix » de Figma, qui fait de la fusion de l'ombre une identite, quel que soit son mode.
 */
export function fusion(dessus: Image, dessous: Image, mode: string | undefined): Image | { readonly refus: string } {
  const m = (mode ?? 'normal').trim().toLowerCase();
  if (!MODES.has(m) || dessous.k === 'vide' || dessus.k === 'vide') return pile([dessous, dessus]);
  return { refus: refusFusion(m) };
}

// ---------------------------------------------------------------- feColorMatrix

/** Une matrice de couleurs 4 x 5, par lignes (R, G, B, A), la cinquieme colonne etant le decalage (sur [0 ; 1]). */
export type Matrice45 = readonly number[];

const IDENTITE_45: Matrice45 = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
const INVERSE_45: Matrice45 = [-1, 0, 0, 0, 1, 0, -1, 0, 0, 1, 0, 0, -1, 0, 1, 0, 0, 0, 1, 0];
const egales = (a: Matrice45, b: Matrice45): boolean => a.length === 20 && a.every((v, i) => Math.abs(v - (b[i] ?? NaN)) < 1e-9);
const m = (x: Matrice45, ligne: number, colonne: number): number => x[ligne * 5 + colonne] ?? 0;

/** Les nombres d'une liste d'attribut (blancs ou virgules) ; null si l'un ne se lit pas. */
function nombres(v: string): number[] | null {
  const t = v.trim();
  if (t === '') return [];
  const r: number[] = [];
  for (const x of t.split(/[\s,]+/)) {
    const n = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(x) ? Number(x) : NaN;
    if (!Number.isFinite(n)) return null;
    r.push(n);
  }
  return r;
}

/**
 * La matrice d'un feColorMatrix (Filter Effects 1, 15.11) : `matrix` (vingt nombres ; absente, l'identite), `saturate` (un nombre,
 * 1 par defaut), `hueRotate` (des degres, 0 par defaut), `luminanceToAlpha` ; null si elle ne se lit pas (le refus la nomme).
 */
export function matriceCouleurs(type: string | undefined, values: string | undefined): Matrice45 | null {
  const t = (type ?? 'matrix').trim();
  const v = values === undefined ? null : nombres(values);
  if (values !== undefined && v === null) return null;
  switch (t) {
    case 'matrix':
      if (!v || v.length === 0) return IDENTITE_45;
      return v.length === 20 ? v : null;
    case 'saturate': {
      if (v && v.length > 1) return null;
      const s = v?.[0] ?? 1;
      return [
        0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0, 0,
        0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0, 0,
        0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s, 0, 0,
        0, 0, 0, 1, 0
      ];
    }
    case 'hueRotate': {
      if (v && v.length > 1) return null;
      const a = ((v?.[0] ?? 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      return [
        0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928, 0, 0,
        0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283, 0, 0,
        0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072, 0, 0,
        0, 0, 0, 1, 0
      ];
    }
    case 'luminanceToAlpha':
      return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.2125, 0.7154, 0.0721, 0, 0];
    default:
      return null;
  }
}

/** Vrai si la matrice ne fait que poser une couleur (le decalage) et multiplier l'alpha : la teinte d'une silhouette (Sketch, Figma). */
export const matriceDeTeinte = (x: Matrice45): boolean =>
  [0, 1, 2].every(l => [0, 1, 2, 3].every(c => m(x, l, c) === 0)) && [0, 1, 2].every(c => m(x, 3, c) === 0) && m(x, 3, 4) === 0;

/** La couleur uniforme d'une image (composantes sRVB sur [0 ; 1]) ; null si ses couleurs varient (le graphique). */
function couleurUniforme(i: Image): readonly [number, number, number] | null {
  switch (i.k) {
    case 'alpha': case 'vide': return [0, 0, 0];
    case 'aplat': {
      const n = parseInt(i.couleur.slice(1), 16);
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }
    case 'dans': case 'hors': return couleurUniforme(i.a);
    case 'flou': case 'decalage': case 'dur': return couleurUniforme(i.de);
    default: return null;
  }
}

const borne = (v: number): number => Math.max(0, Math.min(1, v));

/** Une silhouette teinte : la couleur `c` (sRVB sur [0 ; 1]), l'alpha de `de` multiplie par `f` (durci au-dela de 1). */
function teinte(de: Image, c: readonly [number, number, number], f: number): Image {
  const hex = versHex({ r: borne(c[0]) * 255, g: borne(c[1]) * 255, b: borne(c[2]) * 255 });
  if (!(f > 0)) return VIDE;
  return f <= 1 ? dans(aplat(hex, arrondirOpacite(f)), de) : dans(aplat(hex, 1), { k: 'dur', de, f });
}

/**
 * Un feColorMatrix applique a une image, calcule en RVB lineaire si `enLineaire` (la matrice agit sur les couleurs non premultipliees
 * converties ; une image d'alpha seul est noire, ce qui ne depend pas de l'espace). L'identite rend l'image ; une image de couleur
 * uniforme reste uniforme tant que ses couleurs ne dependent pas de l'alpha et que l'alpha n'en depend pas ; le graphique ne se teint
 * que par une matrice de teinte. Le reste est refuse en le nommant.
 */
export function appliquerMatrice(de: Image, x: Matrice45, enLineaire: boolean): Image | { readonly refus: string } {
  if (egales(x, IDENTITE_45) || de.k === 'vide') return de;
  const versLin = (v: number): number => (enLineaire ? lineaire(v * 255) : v);
  const versSrvb = (v: number): number => (enLineaire ? gamma(borne(v)) / 255 : v);
  const u = couleurUniforme(de);
  if (!u) {
    if (matriceDeTeinte(x)) return teinte(de, [versSrvb(m(x, 0, 4)), versSrvb(m(x, 1, 4)), versSrvb(m(x, 2, 4))], m(x, 3, 3));
    return { refus: egales(x, INVERSE_45) ? REFUS_IDIOMES.inverse : REFUS_IDIOMES.couleurs };
  }
  // Une couleur qui depend de l'alpha, ou un alpha qui ne s'annule pas hors de la silhouette, ne se represente pas.
  if ([0, 1, 2].some(l => m(x, l, 3) !== 0) || m(x, 3, 4) !== 0) return { refus: REFUS_IDIOMES.couleurs };
  const lin = u.map(versLin) as [number, number, number];
  if (Math.abs(m(x, 3, 0) * lin[0] + m(x, 3, 1) * lin[1] + m(x, 3, 2) * lin[2]) > 1e-9) return { refus: REFUS_IDIOMES.couleurs };
  const sortie = [0, 1, 2].map(l => versSrvb(borne(m(x, l, 0) * lin[0] + m(x, l, 1) * lin[1] + m(x, l, 2) * lin[2] + m(x, l, 4)))) as [number, number, number];
  return teinte(de, sortie, m(x, 3, 3));
}

// ---------------------------------------------------------------- la reconnaissance

/** Une couche d'une pile, decrite : sa couleur (null : celles du graphique), son facteur d'alpha, ce qui a deforme son alpha. */
interface Couche {
  readonly couleur: string | null;
  readonly opacite: number;
  readonly flou?: { readonly sx: number; readonly sy: number; readonly lineaire: boolean };
  readonly decalage?: { readonly dx: number; readonly dy: number };
  /** L'alpha du graphique durci (x127 de Figma) : egal a l'alpha d'un graphique opaque, a l'anticrenelage pres. */
  readonly dur: boolean;
  /** Retiree sous le graphique (feComposite out) : invisible sous un graphique opaque. */
  readonly decoupee: boolean;
}

/** Une couche : le graphique, ou une silhouette du graphique (au plus un flou, un decalage, un durcissement, une decoupe), teinte ou non. */
function couche(i: Image, n = 0): Couche | null {
  if (n > 16) return null;
  switch (i.k) {
    case 'source': return { couleur: null, opacite: 1, dur: false, decoupee: false };
    case 'alpha': return { couleur: '#000000', opacite: 1, dur: false, decoupee: false };
    case 'dans': {
      // Une composition `in` ne lit que l'alpha de `b` : la couleur est celle de l'aplat.
      if (i.a.k !== 'aplat') return null;
      const c = couche(i.b, n + 1);
      return c ? { ...c, couleur: i.a.couleur, opacite: c.opacite * i.a.opacite } : null;
    }
    case 'hors': {
      const c = couche(i.a, n + 1), d = couche(i.b, n + 1);
      // Ce qu'on retire est le graphique lui-meme, a sa place, plein (son alpha, durci ou non).
      if (!c || !d || c.decoupee || d.flou || d.decalage || d.decoupee || d.opacite !== 1) return null;
      return { ...c, decoupee: true };
    }
    case 'dur': {
      const c = couche(i.de, n + 1);
      if (!c || c.flou || c.decalage || c.decoupee || c.dur) return null;
      const g = i.f * c.opacite;
      return g <= 1 ? { ...c, opacite: g } : { ...c, opacite: 1, dur: true };
    }
    case 'flou': {
      // Un flou d'une couleur uniforme la garde (le flou agit sur les couleurs premultipliees) : seul l'alpha s'etale.
      const c = couche(i.de, n + 1);
      return c && !c.flou && !c.decoupee ? { ...c, flou: { sx: i.sx, sy: i.sy, lineaire: i.lineaire } } : null;
    }
    case 'decalage': {
      const c = couche(i.de, n + 1);
      return c && !c.decalage && !c.decoupee ? { ...c, decalage: { dx: i.dx, dy: i.dy } } : null;
    }
    default: return null;
  }
}

/** Des effets reconnus, en unites de primitive. */
export interface EffetsBruts {
  readonly flou?: { readonly sx: number; readonly sy: number; readonly lineaire: boolean };
  readonly ombre?: { readonly sx: number; readonly sy: number; readonly dx: number; readonly dy: number; readonly couleur: string; readonly opacite: number };
  /**
   * L'ombre est calculee sur la forme pleine (alpha durci) ou retiree sous elle (Figma) : elle n'equivaut a l'ombre du modele que sous
   * une forme opaque, ce que la lecture verifie sur les feuilles.
   */
  readonly pleine?: true;
}

const graphique = (c: Couche | null): c is Couche => c !== null && c.couleur === null && c.opacite === 1 && !c.decalage && !c.dur && !c.decoupee;

/**
 * Vrai si l'image contient une composition arithmetique qui retranche une image de l'autre (l'ombre interieure). Chaque image n'est vue
 * qu'une fois : les resultats se partagent (un graphe, pas un arbre), le parcours reste lineaire.
 */
function retranche(i: Image, vues = new Set<Image>()): boolean {
  if (vues.has(i)) return false;
  vues.add(i);
  switch (i.k) {
    case 'arith': return i.k2 * i.k3 < 0 || retranche(i.a, vues) || retranche(i.b, vues);
    case 'dans': case 'hors': return retranche(i.a, vues) || retranche(i.b, vues);
    case 'flou': case 'decalage': case 'dur': return retranche(i.de, vues);
    case 'pile': return i.couches.some(c => retranche(c, vues));
    default: return false;
  }
}

/** La phrase d'une image finale qui n'est pas du sous-ensemble, la plus precise possible. */
function phraseDe(r: Image): string {
  if (retranche(r)) return REFUS_IDIOMES.interieure;
  if (r.k === 'vide') return REFUS_IDIOMES.efface;
  if (r.k === 'flou' && r.de.k === 'pile' && r.de.couches.some(c => graphique(couche(c)))) return REFUS_IDIOMES.flouCalque;
  if (r.k === 'pile' && r.couches.some(c => c.k === 'aplat')) return REFUS_IDIOMES.fond;
  return t('un filtre qui n’est ni un flou ni une ombre portée');
}

/**
 * Les effets que calcule l'image finale d'un filtre (annexe 4 B §3) : le graphique, flou ou non, et au plus une ombre portee dessous ;
 * sinon la phrase qui nomme ce qu'elle calcule (sans l'idiome, que l'appelant ajoute).
 */
export function reconnaitre(r: Image): EffetsBruts | { readonly refus: string } {
  const couches = r.k === 'pile' ? r.couches : r.k === 'vide' ? [] : [r];
  const dernier = couches[couches.length - 1];
  const haut = dernier ? couche(dernier) : null;
  if (!graphique(haut)) return { refus: phraseDe(r) };
  const flouLu = haut.flou ? { flou: haut.flou } : {};
  if (couches.length === 1) return flouLu;
  const ombres = couches.slice(0, -1).map(c => couche(c));
  if (ombres.some(o => !o || o.couleur === null)) return { refus: phraseDe(r) };
  if (ombres.length > 1) return { refus: REFUS_IDIOMES.plusieurs };
  const o = ombres[0];
  if (!o || o.couleur === null) return { refus: phraseDe(r) };
  const pleine = o.dur || o.decoupee;
  // Sous un graphique flou, ce qu'on a retire sous la forme nette se verrait : ce n'est plus l'ombre du modele.
  if (pleine && haut.flou) return { refus: phraseDe(r) };
  return {
    ...flouLu,
    ombre: { sx: o.flou?.sx ?? 0, sy: o.flou?.sy ?? 0, dx: o.decalage?.dx ?? 0, dy: o.decalage?.dy ?? 0, couleur: o.couleur, opacite: arrondirOpacite(o.opacite) },
    ...(pleine ? { pleine: true as const } : {})
  };
}
