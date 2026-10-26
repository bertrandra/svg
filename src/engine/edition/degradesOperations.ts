// Les operations sur les degrades (ADR-0012, etape 4, annexe 6 §4) : poser un degrade sur le fond ou le contour d'une selection, le
// retirer, et regler ses arrets (ajouter, retirer, couleur, position, opacite, ordre), son etalement, son angle (lineaire), son centre
// et son rayon (radial), ses extremites (les poignees de la toile). Chacune est pure, rend un nouveau dessin (le meme objet quand rien
// ne change, l'historique s'en sert), et recalcule la couleur de repli comme la lecture : `couleurDeRepli` des arrets, dans
// `remplissage` ou `contour` (annexe 1 §6 : tout ce qui ne connait que les couleurs unies voit une couleur plausible).
//
// Une selection peut nommer des groupes (etape 1) : l'operation va a leurs feuilles, comme une couleur (`modifier`). Une image n'a ni
// fond ni contour : elle est laissee. Les operations d'arret ne touchent que les feuilles qui ont un degrade de ce cote, et l'arret
// d'un rang qu'elles ont : plusieurs formes choisies gardent chacune sa geometrie et ses arrets.
//
// Les valeurs sont rangees comme l'ecriture les ecrit (positions et opacites au millieme, couleurs #rrggbb) : le dessin du modele et
// le fichier relu disent la meme chose, et le projet JSON ne garde rien que le SVG perdrait. Un arret ne double jamais son voisin en
// glissant : sa position est bornee par celles de ses voisins, son rang ne change que par `echangerArrets` (l'ordre), ce qui garde a
// l'interface et a la toile le meme « Arret 2 sur 3 » pendant tout un geste.
//
// Poser un degrade rend un dessin plat riche (`estPlat` devient faux, l'ecriture pose `data-ed-modele="2"`) : l'interface ne le
// propose que si le reglage du modele vaut `riche`, ou si le dessin l'est deja (zones/EditeurDegrade.tsx).

import { depuisOklch, lireHex, versHex, versOklab, type Oklab } from '../../util/couleur.js';
import { au } from '../../util/tableaux.js';
import { feuillesDe } from './arbre.js';
import { ARRETS_MAX, couleurDeRepli, estDegrade, lineaireDansLePlan, transformerDegrade } from './degrades.js';
import { boiteForme, echelle, multiplier, translation } from './geometrie.js';
import { surFormes } from './operations.js';
import type { ArretDegrade, Degrade, DegradeLineaire, DegradeRadial, DessinSvg, Forme, Matrice } from './types.js';

/** Le cote peint : le fond ou le contour. */
export type CoteDegrade = 'remplissage' | 'contour';
export type GenreDegrade = Degrade['genre'];
/** L'etalement tel que l'interface le choisit : « pad » est l'absence d'etalement dans le modele. */
export type EtalementDegrade = 'pad' | 'reflect' | 'repeat';

/** Un degrade garde au moins deux arrets : en dessous, ce ne serait plus qu'une couleur unie. */
export const ARRETS_MIN = 2;

/** Ce qu'un reglage d'arret peut changer. */
export interface ReglageArret {
  readonly couleur?: string;
  readonly position?: number;
  readonly opacite?: number;
}

const champPeinture = (cote: CoteDegrade) => (cote === 'remplissage' ? 'peintureRemplissage' : 'peintureContour') as 'peintureRemplissage' | 'peintureContour';

/** Le degrade d'un cote d'une forme, ou null (une couleur unie, rien, ou un motif). */
export function degradeDe(f: Forme, cote: CoteDegrade): Degrade | null {
  const p = f[champPeinture(cote)];
  return estDegrade(p) ? p : null;
}

/** Les formes d'une selection (groupes compris) qu'une peinture peut toucher : toutes sauf les images. */
const feuillesPeignables = (d: DessinSvg, ids: readonly string[]): string[] => {
  const voulus = new Set(feuillesDe(d, ids));
  return d.formes.filter(f => voulus.has(f.id) && f.image === undefined).map(f => f.id);
};

// ---------------------------------------------------------------- valeurs rangees comme l'ecriture

const millieme = (v: number): number => Math.round(v * 1000) / 1000;
const borne = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
/** Une position ou une opacite dans [0 ; 1], au millieme (l'ecriture ecrit trois decimales). */
const fraction = (v: number): number => millieme(borne(Number.isFinite(v) ? v : 0, 0, 1));
/** Un code #rrggbb en minuscules, ou null si ce n'en est pas un. */
const hex = (c: string): string | null => {
  const rgb = lireHex(c.trim());
  return rgb ? versHex(rgb) : null;
};
/** Un arret range : sans opacite quand elle vaut 1 (ce que l'ecriture n'ecrit pas). */
const arret = (position: number, couleur: string, opacite: number): ArretDegrade =>
  opacite < 1 ? { position, couleur, opacite } : { position, couleur };

/** L'objet sans un champ facultatif (absent plutot que `undefined` : l'egalite profonde et l'ecriture le voient pareil). */
function sansChamp<T extends object, K extends keyof T>(o: T, k: K): Omit<T, K> {
  const r: Partial<T> = { ...o };
  delete r[k];
  return r as Omit<T, K>;
}

// ---------------------------------------------------------------- une forme repeinte

/** La forme dont le cote prend ce degrade, la couleur de repli recalculee ; la meme si le degrade est le meme objet. */
function repeindre(f: Forme, cote: CoteDegrade, g: Degrade): Forme {
  const champ = champPeinture(cote);
  if (f[champ] === g) return f;
  const repli = couleurDeRepli(g.arrets);
  if (cote === 'remplissage') return { ...f, peintureRemplissage: g, remplissage: repli };
  // Un trait qui apparait prend une epaisseur visible, comme une couleur de contour posee (`modifier`).
  return { ...f, peintureContour: g, contour: repli, ...(f.contour === null && !(f.epaisseur > 0) ? { epaisseur: 1 } : {}) };
}

/** Applique `regler` au degrade du cote de chaque feuille choisie qui en a un ; une forme sans degrade, ou que `regler` rend telle, ne change pas. */
function surDegrades(d: DessinSvg, ids: readonly string[], cote: CoteDegrade, regler: (g: Degrade) => Degrade): DessinSvg {
  return surFormes(d, feuillesPeignables(d, ids), f => {
    const g = degradeDe(f, cote);
    if (!g) return f;
    const n = regler(g);
    return n === g ? f : repeindre(f, cote, n);
  });
}

/** Les arrets remplaces ; le meme degrade si rien ne change. */
function avecArrets(g: Degrade, arrets: readonly ArretDegrade[]): Degrade {
  const memes = arrets.length === g.arrets.length && arrets.every((a, i) => {
    const b = g.arrets[i];
    return !!b && a.position === b.position && a.couleur === b.couleur && (a.opacite ?? 1) === (b.opacite ?? 1);
  });
  return memes ? g : { ...g, arrets };
}

// ---------------------------------------------------------------- poser, retirer

/** La couleur d'arrivee d'un degrade pose sur une couleur : le blanc, ou le noir sur une couleur deja tres claire. */
function couleurOpposee(c: string): string {
  const rgb = lireHex(c);
  return rgb && versOklab(rgb).l > 0.85 ? '#000000' : '#ffffff';
}

/** Un degrade neuf dans la boite de la forme : lineaire de gauche a droite par son milieu, radial de son centre a son plus grand demi-cote. */
function geometrieNeuve(f: Forme, genre: GenreDegrade, arrets: readonly ArretDegrade[], etalement?: 'reflect' | 'repeat'): Degrade | null {
  const b = boiteForme(f);
  if (!b) return null;
  const commun = { arrets, ...(etalement ? { etalement } : {}) };
  if (genre === 'lineaire') return { genre, x1: b.x, y1: b.y + b.h / 2, x2: b.x + b.l, y2: b.y + b.h / 2, ...commun };
  return { genre, cx: b.x + b.l / 2, cy: b.y + b.h / 2, r: Math.max(b.l, b.h) / 2, ...commun };
}

/**
 * Pose un degrade du genre voulu sur un cote des formes choisies. Une forme qui a deja un degrade de ce genre ne change pas ; un
 * degrade de l'autre genre garde ses arrets et son etalement, dans une geometrie neuve ; une couleur unie (ou rien) devient le premier
 * arret, le blanc (ou le noir sur une couleur tres claire) le second. Une forme sans etendue (aucun point) est laissee.
 */
export function poserDegrade(d: DessinSvg, ids: readonly string[], cote: CoteDegrade, genre: GenreDegrade): DessinSvg {
  return surFormes(d, feuillesPeignables(d, ids), f => {
    const avant = degradeDe(f, cote);
    if (avant?.genre === genre) return f;
    const depart = hex((cote === 'remplissage' ? f.remplissage : f.contour) ?? '#000000') ?? '#000000';
    const arrets = avant ? avant.arrets : [arret(0, depart, 1), arret(1, couleurOpposee(depart), 1)];
    const g = geometrieNeuve(f, genre, arrets, avant?.etalement);
    return g ? repeindre(f, cote, g) : f;
  });
}

/** Retire le degrade d'un cote : la forme garde sa couleur de repli, unie (« Uni »). */
export function retirerDegrade(d: DessinSvg, ids: readonly string[], cote: CoteDegrade): DessinSvg {
  const champ = champPeinture(cote);
  return surFormes(d, feuillesPeignables(d, ids), f => {
    if (!degradeDe(f, cote)) return f;
    return sansChamp(f, champ);
  });
}

// ---------------------------------------------------------------- arrets

/** L'interpolation OKLab de deux couleurs #rrggbb (annexe 6 §4 : un arret ajoute prend la couleur du degrade a sa place). */
function melanger(a: string, b: string, t: number): string {
  const p = versOklab(lireHex(a) ?? { r: 0, g: 0, b: 0 }), q = versOklab(lireHex(b) ?? { r: 0, g: 0, b: 0 });
  const m: Oklab = { l: p.l + (q.l - p.l) * t, a: p.a + (q.a - p.a) * t, b: p.b + (q.b - p.b) * t };
  const h = (Math.atan2(m.b, m.a) * 180) / Math.PI;
  return versHex(depuisOklch({ l: m.l, c: Math.hypot(m.a, m.b), h: h < 0 ? h + 360 : h }));
}

/** Le rang de l'arret qu'ajoute `ajouterArret(…, apres)` dans une liste de `n` arrets. */
export const rangAjoute = (n: number, apres: number): number => (apres < n - 1 ? apres + 1 : n - 1);

/**
 * Ajoute un arret a mi-chemin entre l'arret `apres` et le suivant (entre l'avant-dernier et le dernier quand `apres` est le dernier),
 * a la couleur et a l'opacite du degrade a cette place (OKLab). Au-dela de 64 arrets (ARRETS_MAX), rien ne change.
 */
export function ajouterArret(d: DessinSvg, ids: readonly string[], cote: CoteDegrade, apres: number): DessinSvg {
  return surDegrades(d, ids, cote, g => {
    const n = g.arrets.length;
    if (n >= ARRETS_MAX || n < 1 || !Number.isInteger(apres) || apres < 0 || apres >= n) return g;
    const i = n === 1 ? 0 : apres < n - 1 ? apres : n - 2, a = au(g.arrets, i), b = g.arrets[i + 1] ?? a;
    const neuf = arret(millieme((a.position + b.position) / 2), melanger(a.couleur, b.couleur, 0.5), millieme(((a.opacite ?? 1) + (b.opacite ?? 1)) / 2));
    return { ...g, arrets: [...g.arrets.slice(0, i + 1), neuf, ...g.arrets.slice(i + 1)] };
  });
}

/** Retire l'arret `i` ; un degrade de deux arrets les garde (ARRETS_MIN). */
export function retirerArret(d: DessinSvg, ids: readonly string[], cote: CoteDegrade, i: number): DessinSvg {
  return surDegrades(d, ids, cote, g => (g.arrets.length <= ARRETS_MIN || !g.arrets[i] ? g : { ...g, arrets: g.arrets.filter((_, k) => k !== i) }));
}

/**
 * Regle l'arret `i` : sa couleur (#rrggbb), sa position (bornee par ses voisins : il ne les double pas, son rang ne change pas) et son
 * opacite, au millieme. Une valeur illisible est ignoree.
 */
export function modifierArret(d: DessinSvg, ids: readonly string[], cote: CoteDegrade, i: number, r: ReglageArret): DessinSvg {
  return surDegrades(d, ids, cote, g => {
    const a = g.arrets[i];
    if (!a) return g;
    const couleur = r.couleur !== undefined ? hex(r.couleur) ?? a.couleur : a.couleur;
    const avant = g.arrets[i - 1]?.position ?? 0, apres = g.arrets[i + 1]?.position ?? 1;
    const position = r.position !== undefined && Number.isFinite(r.position) ? borne(fraction(r.position), avant, apres) : a.position;
    const opacite = r.opacite !== undefined && Number.isFinite(r.opacite) ? fraction(r.opacite) : a.opacite ?? 1;
    return avecArrets(g, g.arrets.map((x, k) => (k === i ? arret(position, couleur, opacite) : x)));
  });
}

/**
 * L'ordre des arrets : l'arret `i` echange sa couleur et son opacite avec celles de l'arret `j`, les positions restent (le degrade
 * reste trie). C'est « monter » ou « descendre » un arret dans la liste.
 */
export function echangerArrets(d: DessinSvg, ids: readonly string[], cote: CoteDegrade, i: number, j: number): DessinSvg {
  return surDegrades(d, ids, cote, g => {
    const a = g.arrets[i], b = g.arrets[j];
    if (!a || !b || i === j) return g;
    return avecArrets(g, g.arrets.map((x, k) => (k === i ? arret(x.position, b.couleur, b.opacite ?? 1) : k === j ? arret(x.position, a.couleur, a.opacite ?? 1) : x)));
  });
}

/** Inverse le degrade : le premier arret devient le dernier, chaque position p devient 1 − p. */
export function inverserArrets(d: DessinSvg, ids: readonly string[], cote: CoteDegrade): DessinSvg {
  return surDegrades(d, ids, cote, g => avecArrets(g, [...g.arrets].reverse().map(a => arret(fraction(1 - a.position), a.couleur, a.opacite ?? 1))));
}

/** L'etalement au-dela des extremites : prolonger (« pad », l'absence), refleter ou repeter. */
export function reglerEtalement(d: DessinSvg, ids: readonly string[], cote: CoteDegrade, e: EtalementDegrade): DessinSvg {
  return surDegrades(d, ids, cote, g => {
    if ((g.etalement ?? 'pad') === e) return g;
    if (e === 'pad') return sansChamp(g, 'etalement') as Degrade;
    return { ...g, etalement: e };
  });
}

// ---------------------------------------------------------------- geometrie : l'axe, l'angle, le centre, le rayon

/** Un point du plan. */
export type PointDegrade = readonly [number, number];

const appliquer = (m: Matrice | undefined, x: number, y: number): PointDegrade => (m ? [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] : [x, y]);

/** L'inverse d'une matrice, ou null si elle est degeneree. */
function inverse(m: Matrice): Matrice | null {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!(Math.abs(det) > 0)) return null;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

/**
 * L'axe du degrade dans le plan, la ou la toile pose ses poignees : d'une extremite a l'autre pour un lineaire (sa forme canonique,
 * celle que l'ecriture ecrit : les lignes de meme couleur y sont perpendiculaires), du centre au bord de droite pour un radial.
 */
export function axeDegrade(g: Degrade): { readonly de: PointDegrade; readonly a: PointDegrade } {
  if (g.genre === 'lineaire') {
    const [x1, y1, x2, y2] = lineaireDansLePlan(g);
    return { de: [x1, y1], a: [x2, y2] };
  }
  return { de: appliquer(g.matrice, g.cx, g.cy), a: appliquer(g.matrice, g.cx + g.r, g.cy) };
}

/** Le point de l'axe a la position `t` (la ou se pose la poignee d'un arret). */
export function pointSurAxe(g: Degrade, t: number): PointDegrade {
  if (g.genre === 'radial') return appliquer(g.matrice, g.cx + g.r * t, g.cy);
  const { de, a } = axeDegrade(g);
  return [de[0] + (a[0] - de[0]) * t, de[1] + (a[1] - de[1]) * t];
}

/**
 * La position (dans [0 ; 1], au millieme) qu'un point du plan donne a un arret qu'on glisse : sa projection sur l'axe d'un lineaire,
 * sa distance au centre rapportee au rayon d'un radial (dans le repere du degrade, exacte sous une matrice).
 */
export function positionSurAxe(g: Degrade, x: number, y: number): number {
  if (g.genre === 'radial') {
    const inv = g.matrice ? inverse(g.matrice) : null;
    const [lx, ly] = g.matrice ? (inv ? appliquer(inv, x, y) : [g.cx, g.cy]) : [x, y];
    return g.r > 0 ? fraction(Math.hypot(lx - g.cx, ly - g.cy) / g.r) : 0;
  }
  const { de, a } = axeDegrade(g), vx = a[0] - de[0], vy = a[1] - de[1], v2 = vx * vx + vy * vy;
  return v2 > 0 ? fraction(((x - de[0]) * vx + (y - de[1]) * vy) / v2) : 0;
}

/** L'angle d'un degrade lineaire, en degres dans [0 ; 360), dans le sens horaire du plan (0 : de gauche a droite). */
export function angleDegrade(g: DegradeLineaire): number {
  const { de, a } = axeDegrade(g);
  const deg = (Math.atan2(a[1] - de[1], a[0] - de[0]) * 180) / Math.PI;
  return millieme(((deg % 360) + 360) % 360) % 360;
}

/** Un lineaire pose par ses deux extremites dans le plan, sans matrice (ce que l'ecriture en ferait de toute facon). */
function lineaireEntre(g: DegradeLineaire, x1: number, y1: number, x2: number, y2: number): DegradeLineaire {
  return { ...sansChamp(g, 'matrice'), x1, y1, x2, y2 };
}

/** Tourne un degrade lineaire jusqu'a l'angle voulu, autour du milieu de son axe, a la meme longueur. */
export function reglerAngle(d: DessinSvg, ids: readonly string[], cote: CoteDegrade, degres: number): DessinSvg {
  if (!Number.isFinite(degres)) return d;
  return surDegrades(d, ids, cote, g => {
    if (g.genre !== 'lineaire' || angleDegrade(g) === millieme(((degres % 360) + 360) % 360) % 360) return g;
    const { de, a } = axeDegrade(g), mx = (de[0] + a[0]) / 2, my = (de[1] + a[1]) / 2, demi = Math.hypot(a[0] - de[0], a[1] - de[1]) / 2;
    const t = (degres * Math.PI) / 180, dx = Math.cos(t) * demi, dy = Math.sin(t) * demi;
    return lineaireEntre(g, mx - dx, my - dy, mx + dx, my + dy);
  });
}

/** Le centre et le rayon d'un radial dans le plan (sous une matrice qui n'est pas une similitude, le rayon moyen). */
export function centreRayon(g: DegradeRadial): { readonly cx: number; readonly cy: number; readonly r: number } {
  const [cx, cy] = appliquer(g.matrice, g.cx, g.cy), m = g.matrice;
  return { cx, cy, r: m ? g.r * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) : g.r };
}

/**
 * Le radial dont le rayon est multiplie par `k` autour de son centre : sans matrice, le rayon et le foyer changent directement (le
 * modele reste simple) ; sous une matrice, l'echelle se compose autour du centre dans le plan (une ellipse garde sa proportion).
 */
function rayonFois(g: DegradeRadial, k: number): DegradeRadial {
  if (!g.matrice) {
    const fx = g.fx, fy = g.fy;
    return {
      ...g, r: g.r * k, ...(g.fr !== undefined ? { fr: g.fr * k } : {}),
      ...(fx !== undefined ? { fx: g.cx + (fx - g.cx) * k } : {}), ...(fy !== undefined ? { fy: g.cy + (fy - g.cy) * k } : {})
    };
  }
  const c = centreRayon(g);
  return { ...g, matrice: multiplier(echelle(k, k, c.cx, c.cy), g.matrice) };
}

/** Deplace le centre d'un radial (son foyer le suit) au point voulu du plan. */
export function reglerCentre(d: DessinSvg, ids: readonly string[], cote: CoteDegrade, cx: number, cy: number): DessinSvg {
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return d;
  return surDegrades(d, ids, cote, g => {
    if (g.genre !== 'radial') return g;
    const c = centreRayon(g), dx = cx - c.cx, dy = cy - c.cy;
    return dx === 0 && dy === 0 ? g : transformerDegrade(g, translation(dx, dy));
  });
}

/** Regle le rayon d'un radial dans le plan, autour de son centre (une ellipse garde sa proportion). Un rayon nul ou negatif est ignore. */
export function reglerRayon(d: DessinSvg, ids: readonly string[], cote: CoteDegrade, r: number): DessinSvg {
  if (!(r > 0) || !Number.isFinite(r)) return d;
  return surDegrades(d, ids, cote, g => {
    if (g.genre !== 'radial') return g;
    const c = centreRayon(g);
    if (!(c.r > 0) || c.r === r) return g;
    return rayonFois(g, r / c.r);
  });
}

/** Une extremite de l'axe : le debut (premier arret ; le centre d'un radial) ou la fin (dernier arret ; le bord d'un radial). */
export type ExtremiteDegrade = 'debut' | 'fin';

/**
 * Deplace une extremite de l'axe au point voulu du plan (la poignee de la toile). Un lineaire est repose par ses deux extremites ; un
 * radial deplace son centre (debut) ou regle son rayon a la distance du centre (fin). Deux extremites confondues sont refusees : rien
 * ne change.
 */
export function deplacerExtremite(d: DessinSvg, ids: readonly string[], cote: CoteDegrade, extremite: ExtremiteDegrade, x: number, y: number): DessinSvg {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return d;
  return surDegrades(d, ids, cote, g => {
    const { de, a } = axeDegrade(g);
    if (g.genre === 'lineaire') {
      const [x1, y1, x2, y2] = extremite === 'debut' ? [x, y, a[0], a[1]] : [de[0], de[1], x, y];
      if (x1 === x2 && y1 === y2) return g;
      if (x1 === de[0] && y1 === de[1] && x2 === a[0] && y2 === a[1]) return g;
      return lineaireEntre(g, x1, y1, x2, y2);
    }
    if (extremite === 'debut') {
      const dx = x - de[0], dy = y - de[1];
      return dx === 0 && dy === 0 ? g : transformerDegrade(g, translation(dx, dy));
    }
    const r = Math.hypot(x - de[0], y - de[1]), actuel = Math.hypot(a[0] - de[0], a[1] - de[1]);
    if (!(r > 0) || !(actuel > 0) || r === actuel) return g;
    return rayonFois(g, r / actuel);
  });
}

// ---------------------------------------------------------------- lire le dessin

/** Les formes visibles dont un cote (ou celui voulu) porte un degrade : la ligne « Dégradés » des listes de couleurs. */
export function formesADegrade(d: DessinSvg, sur: 'tout' | CoteDegrade = 'tout'): string[] {
  return d.formes.filter(f => f.visible && ((sur !== 'contour' && degradeDe(f, 'remplissage')) || (sur !== 'remplissage' && degradeDe(f, 'contour')))).map(f => f.id);
}

/** Le nombre de degrades distincts (par leurs arrets et leur genre) parmi ces formes : ce que la ligne « Dégradés » compte. */
export function degradesDistincts(d: DessinSvg, ids: readonly string[], sur: 'tout' | CoteDegrade = 'tout'): number {
  const voulus = new Set(ids), vus = new Set<string>();
  for (const f of d.formes) {
    if (!voulus.has(f.id)) continue;
    for (const cote of ['remplissage', 'contour'] as const) {
      const g = sur === 'tout' || sur === cote ? degradeDe(f, cote) : null;
      if (g) vus.add(g.genre + ' ' + g.arrets.map(a => a.position + a.couleur + (a.opacite ?? 1)).join(' '));
    }
  }
  return vus.size;
}
