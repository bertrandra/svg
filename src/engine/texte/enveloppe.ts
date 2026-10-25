// Le texte deforme dans une forme (ADR-0032), comme une « deformation par enveloppe » : le bloc entier (toutes ses lignes, a sa
// taille) est etire et courbe pour remplir le contour exterieur de la forme ; les lettres sont deformees, le bloc prend la
// silhouette de la forme (un cœur, un cercle, une etoile).
//
// La correspondance est une enveloppe VERTICALE. Le texte compose en ligne droite a une boite (celle de ses contours pleins). Un
// point d'abscisse relative u et d'ordonnee relative v dans cette boite va a l'abscisse X = x0 + u (x1 - x0) de la forme (sa boite,
// retrecie de la marge), puis entre le bord haut et le bord bas de la forme a cette abscisse : Y = haut(X) + v (bas(X) - haut(X)).
// Le haut et le bas sont les deux intersections de la verticale avec le contour exterieur (rapprochees de la marge) : un « profil »
// lu une fois par forme. Sur un rectangle, c'est une mise a l'echelle ; chaque colonne du texte reste une colonne, les lignes de
// base se courbent avec les bords. C'est exact sur toute forme que chaque verticale ne rencontre que deux fois (cœur, cercle,
// ellipse, bulle, polygone convexe).
//
// Une forme repliee (les branches du bas d'une etoile, la queue d'une bulle) coupe certaines verticales en plusieurs morceaux : on
// garde celui qui est le plus proche de la ligne du milieu de la forme, et la ou ses bords sautent d'un morceau a l'autre (au pied
// d'une branche), le saut s'adoucit en une rampe de pente fixe, du cote ou le morceau s'elargit : le texte reste d'un seul tenant et
// dans la forme, il descend dans la branche sans se dechirer.
//
// Le contour exterieur est le polygone (trace.ts : chaque courbe en cordes) de plus grande aire ; les trous et les autres morceaux
// sont ignores. Sur une tranche entre deux abscisses de sommets, les aretes d'un polygone simple sont des droites qui ne se croisent
// pas : chaque bord y est une seule arete, lue une fois. Le profil est donc exact et se lit par dichotomie.
//
// Les contours se deforment segment par segment : chaque segment (droit, quadratique ou cubique) est echantillonne, ses points
// envoyes dans la forme, puis rebati en cubiques (`ajusterCubiques`, celui des booleens et de la ligne mediane), a une tolerance
// fixe en part de la taille ; les tangentes des bouts sont celles du segment, envoyees par la meme enveloppe : un coin reste un
// coin, une jonction lisse reste lisse. En trace « Median », c'est la ligne mediane de la lettre droite qui se deforme (une seule
// source de calcul), dans la boite des lettres pleines. Pur et deterministe : des + - * /, des racines, des tris stables.

import type { Chemin, Commande, Forme } from '../editionSvg.js';
import { boiteChemin } from '../edition/geometrie.js';
import { ajusterCubiques, distanceSegment2, type PieceCubique } from '../edition/ajustement.js';
import type { Glyphes, Lettre } from '../texte.js';
import { au } from '../../util/tableaux.js';
import { composerBloc, type ReglagesBloc } from './bloc.js';
import { BAS_CURSEUR, HAUT_CURSEUR, ligneDe, miseEnPage, xAuIndex } from './curseur.js';
import { polygonesDe, type Pt } from './trace.js';
import type { Caret, Pose, RefusEnveloppe } from './pose.js';

/** Ce qu'un texte deforme lit de son texte vivant. */
export type ReglagesEnveloppe = Omit<ReglagesBloc, 'taille'> & { readonly marge: number };

export type { RefusEnveloppe } from './pose.js';

/** Le pas d'echantillonnage d'un segment, en part de la taille (dans le plan, apres deformation). */
export const PAS_ENVELOPPE = 0.03;
/** L'ecart permis aux cubiques rebaties, en part de la taille : deux millemes d'un cadratin. */
export const TOLERANCE_ENVELOPPE = 0.002;
/** Les bornes du nombre de pas par segment : assez pour voir un segment droit se courber, borne pour un tres grand texte. */
const PAS_MIN = 4, PAS_MAX = 48;
/** La taille de reference de la mesure du bloc : assez grande pour que l'arrondi des contours au millieme n'y pese pas. */
const TAILLE_MESURE = 1000;

// ---------------------------------------------------------------- le profil d'une forme

/**
 * La pente d'une rampe, la ou le bord de la forme saute (le pied d'une branche d'etoile) : deux unites de hauteur par unite de
 * largeur. Assez raide pour suivre la branche, assez douce pour qu'une lettre a cheval ne se dechire pas.
 */
export const PENTE_RAMPE = 2;

/** Un saut du bord haut ou du bord bas a l'abscisse x : la rampe part de `depuis` et va vers la droite (sens 1) ou la gauche (-1). */
interface Saut { readonly x: number; readonly depuis: number; readonly sens: 1 | -1 }

/**
 * Le profil vertical d'une forme : les abscisses de ses sommets (croissantes, sans doublon), pour chaque tranche entre deux
 * abscisses l'ordonnee du bord haut et du bord bas a ses deux bouts, et les sauts de ces bords, adoucis en rampes.
 */
export interface Profil {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly xs: Float64Array;
  /** Pour la tranche k : le haut en xs[k] et en xs[k + 1], le bas de meme. */
  readonly haut0: Float64Array;
  readonly haut1: Float64Array;
  readonly bas0: Float64Array;
  readonly bas1: Float64Array;
  readonly sautsHaut: readonly Saut[];
  readonly sautsBas: readonly Saut[];
}

/** L'aire signee d'un polygone (formule du lacet). */
function aire(p: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const u = au(p, i), v = au(p, (i + 1) % p.length); a += u[0] * v[1] - v[0] * u[1]; }
  return a / 2;
}

/** Le contour exterieur d'un chemin : le polygone de plus grande aire (a egalite, le premier) ; null si aucun n'a d'aire. */
export function contourExterieur(d: Chemin): Pt[] | null {
  let meilleur: Pt[] | null = null, plus = 0;
  for (const p of polygonesDe(d)) { const a = Math.abs(aire(p)); if (a > plus) { plus = a; meilleur = p; } }
  return meilleur;
}

/** Une arete non verticale du polygone, de gauche a droite. */
interface Arete { readonly xa: number; readonly ya: number; readonly xb: number; readonly yb: number }
const yArete = (e: Arete, x: number): number => e.ya + ((x - e.xa) / (e.xb - e.xa)) * (e.yb - e.ya);

/** L'ecart en dessous duquel deux ordonnees de part et d'autre d'un sommet sont le meme point du bord (pas un saut). */
const JOINT = 1e-9;

function construireProfil(poly: readonly Pt[]): Profil | null {
  const aretes: Arete[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = au(poly, i), b = au(poly, (i + 1) % poly.length);
    if (a[0] === b[0]) continue;
    aretes.push(a[0] < b[0] ? { xa: a[0], ya: a[1], xb: b[0], yb: b[1] } : { xa: b[0], ya: b[1], xb: a[0], yb: a[1] });
  }
  const xs = [...new Set(poly.map(p => p[0]))].sort((a, b) => a - b);
  if (xs.length < 2 || !aretes.length) return null;
  const ys = poly.map(p => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys), milieu = (y0 + y1) / 2;
  // Un balayage : les aretes rangees par leur bout gauche entrent dans la liste active, en sortent passe leur bout droit.
  aretes.sort((a, b) => a.xa - b.xa || a.xb - b.xb);
  const n = xs.length - 1, haut0 = new Float64Array(n), haut1 = new Float64Array(n), bas0 = new Float64Array(n), bas1 = new Float64Array(n);
  let suivante = 0, actives: Arete[] = [];
  for (let k = 0; k < n; k++) {
    const g = au(xs, k), d = au(xs, k + 1), m = (g + d) / 2;
    while (suivante < aretes.length && au(aretes, suivante).xa < m) actives.push(au(aretes, suivante++));
    actives = actives.filter(e => e.xb > m);
    // Les morceaux de la verticale dans la forme (pair-impair : un seul contour, simple), et celui qu'on garde : le plus proche
    // de la ligne du milieu de la forme (une branche d'etoile detachee, la queue d'une bulle, ne prennent pas la colonne).
    const coupes = actives.map(e => ({ e, y: yArete(e, m) })).sort((a, b) => a.y - b.y);
    let h: Arete | null = null, b: Arete | null = null, ecart = Infinity;
    for (let i = 0; i + 1 < coupes.length; i += 2) {
      const a = au(coupes, i), z = au(coupes, i + 1), e = milieu < a.y ? a.y - milieu : milieu > z.y ? milieu - z.y : 0;
      if (e < ecart) { ecart = e; h = a.e; b = z.e; }
    }
    // Une tranche sans morceau (impossible sur un polygone ferme) reprend la precedente.
    haut0[k] = h ? yArete(h, g) : haut1[k - 1] ?? milieu; haut1[k] = h ? yArete(h, d) : haut0[k] ?? milieu;
    bas0[k] = b ? yArete(b, g) : bas1[k - 1] ?? milieu; bas1[k] = b ? yArete(b, d) : bas0[k] ?? milieu;
  }
  // Les sauts : la ou le bord change de morceau d'une tranche a la suivante. La rampe part du cote le moins profond et descend (ou
  // monte) vers le plus profond : elle reste dans la forme, du cote ou le morceau s'elargit.
  const sautsHaut: Saut[] = [], sautsBas: Saut[] = [];
  for (let k = 0; k + 1 < n; k++) {
    const x = au(xs, k + 1), hg = haut1[k] ?? 0, hd = haut0[k + 1] ?? 0, bg = bas1[k] ?? 0, bd = bas0[k + 1] ?? 0;
    if (hd < hg - JOINT) sautsHaut.push({ x, depuis: hg, sens: 1 }); else if (hd > hg + JOINT) sautsHaut.push({ x, depuis: hd, sens: -1 });
    if (bd > bg + JOINT) sautsBas.push({ x, depuis: bg, sens: 1 }); else if (bd < bg - JOINT) sautsBas.push({ x, depuis: bd, sens: -1 });
  }
  return { x0: au(xs, 0), x1: au(xs, n), y0, y1, xs: Float64Array.from(xs), haut0, haut1, bas0, bas1, sautsHaut, sautsBas };
}

const PROFILS = new WeakMap<Chemin, Profil | null>();

/** Le profil vertical du contour exterieur d'une forme, ou null si elle n'a pas d'aire. Memorise par chemin (ADR-0008). */
export function profilDe(d: Chemin): Profil | null {
  if (PROFILS.has(d)) return PROFILS.get(d) ?? null;
  const p = contourExterieur(d), r = p ? construireProfil(p) : null;
  PROFILS.set(d, r);
  return r;
}

/** La tranche qui contient x (borne au profil) : la derniere dont le debut est avant lui, par dichotomie. */
function tranche(p: Profil, x: number): number {
  let bas = 0, haut = p.xs.length - 2;
  while (bas < haut) {
    const m = (bas + haut + 1) >> 1;
    if ((p.xs[m] ?? 0) <= x) bas = m; else haut = m - 1;
  }
  return bas;
}

/**
 * Le bord haut et le bord bas de la forme a l'abscisse x (bornee a la forme) : le morceau de la verticale le plus proche du milieu
 * de la forme, chaque saut de ses bords adouci en rampe (le haut ne remonte, le bas ne descend, qu'a la pente PENTE_RAMPE depuis
 * le saut). Exact (sans rampe) sur une forme dont chaque verticale ne rencontre le contour que deux fois.
 */
export function bordsA(p: Profil, x: number): readonly [number, number] {
  const v = Math.min(p.x1, Math.max(p.x0, x)), k = tranche(p, v);
  const g = p.xs[k] ?? 0, d = p.xs[k + 1] ?? g, t = d > g ? (v - g) / (d - g) : 0;
  const h0 = p.haut0[k] ?? 0, h1 = p.haut1[k] ?? 0, b0 = p.bas0[k] ?? 0, b1 = p.bas1[k] ?? 0;
  let haut = h0 + (h1 - h0) * t, bas = b0 + (b1 - b0) * t;
  for (const s of p.sautsHaut) { const e = (v - s.x) * s.sens; if (e >= 0) haut = Math.max(haut, s.depuis - PENTE_RAMPE * e); }
  for (const s of p.sautsBas) { const e = (v - s.x) * s.sens; if (e >= 0) bas = Math.min(bas, s.depuis + PENTE_RAMPE * e); }
  return [haut, bas];
}

// ---------------------------------------------------------------- la correspondance

/** L'enveloppe : un point du texte droit (dans le plan) vers son point dans la forme. */
export type Enveloppe = (x: number, y: number) => Pt;

/** Une boite, dans le plan. */
interface BoiteTexte { readonly x: number; readonly y: number; readonly l: number; readonly h: number }

/** Le nombre de colonnes ou l'on cherche si la marge laisse quelque chose de la forme. */
const COLONNES_ESSAI = 64;

/**
 * L'enveloppe verticale de la boite `b` dans la forme, a la marge `m` (dans le plan) : l'abscisse relative va dans la boite de la
 * forme retrecie de la marge, l'ordonnee relative entre son haut et son bas a cette abscisse, rapproches de la marge (une colonne
 * plus etroite que deux marges se reduit a son milieu). Null si la marge mange la forme. Un point hors de la boite se prolonge.
 */
export function enveloppeDe(p: Profil, b: BoiteTexte, m: number): Enveloppe | null {
  const x0 = p.x0 + m, x1 = p.x1 - m;
  if (!(x1 > x0) || !(b.l > 0) || !(b.h > 0)) return null;
  // Une forme dont aucune colonne n'est plus haute que deux marges ne laisserait qu'un trait : refusee.
  let ouverte = false;
  for (let k = 0; k <= COLONNES_ESSAI && !ouverte; k++) { const [h, s] = bordsA(p, x0 + ((x1 - x0) * k) / COLONNES_ESSAI); ouverte = s - h > 2 * m; }
  if (!ouverte) return null;
  const kx = (x1 - x0) / b.l;
  return (x, y) => {
    const X = x0 + (x - b.x) * kx, v = (y - b.y) / b.h, [h, s] = bordsA(p, X);
    let haut = h + m, bas = s - m;
    if (bas < haut) { const c = (h + s) / 2; haut = c; bas = c; }
    return [X, haut + v * (bas - haut)];
  };
}

// ---------------------------------------------------------------- la deformation d'un chemin

const arrondi = (v: number): number => Number(v.toFixed(3));
const unitaire = (x: number, y: number): Pt => { const l = Math.sqrt(x * x + y * y); return l > 0 ? [x / l, y / l] : [0, 0]; };

/** Le point d'un segment (2, 3 ou 4 points de controle) au parametre t (De Casteljau, a plat). */
function pointSegment(p: readonly Pt[], t: number): Pt {
  const u = 1 - t, a = au(p, 0), b = p[1] ?? a;
  if (p.length === 2) return [a[0] * u + b[0] * t, a[1] * u + b[1] * t];
  const c = p[2] ?? b;
  if (p.length === 3) return [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]];
  const d = p[3] ?? c, uu = u * u, tt = t * t;
  return [uu * u * a[0] + 3 * uu * t * b[0] + 3 * u * tt * c[0] + tt * t * d[0], uu * u * a[1] + 3 * uu * t * b[1] + 3 * u * tt * c[1] + tt * t * d[1]];
}

/** La direction d'un segment a son depart et a son arrivee (dans le sens du trace) : celle du premier point de controle distinct. */
function directions(p: readonly Pt[]): readonly [Pt, Pt] {
  const a = au(p, 0), z = au(p, p.length - 1);
  let debut: Pt = [0, 0], fin: Pt = [0, 0];
  for (let i = 1; i < p.length; i++) { const q = au(p, i); if (q[0] !== a[0] || q[1] !== a[1]) { debut = unitaire(q[0] - a[0], q[1] - a[1]); break; } }
  for (let i = p.length - 2; i >= 0; i--) { const q = au(p, i); if (q[0] !== z[0] || q[1] !== z[1]) { fin = unitaire(z[0] - q[0], z[1] - q[1]); break; } }
  return [debut, fin];
}

/** Les reglages d'une deformation : l'enveloppe, le pas d'echantillonnage et la tolerance dans le plan, le pas des tangentes. */
export interface Deformation { readonly f: Enveloppe; readonly pas: number; readonly tolerance: number; readonly h: number }

/** La direction, apres deformation, d'une direction `t` prise au point `p` (une difference centree, la meme des deux cotes d'un nœud). */
function tangenteDeformee(def: Deformation, p: Pt, t: Pt): Pt | undefined {
  if (t[0] === 0 && t[1] === 0) return undefined;
  const a = def.f(p[0] + def.h * t[0], p[1] + def.h * t[1]), b = def.f(p[0] - def.h * t[0], p[1] - def.h * t[1]);
  const u = unitaire(a[0] - b[0], a[1] - b[1]);
  return u[0] === 0 && u[1] === 0 ? undefined : u;
}

const estDroite = (depart: Pt, p: PieceCubique, tolerance: number): boolean => {
  const t2 = tolerance * tolerance;
  return distanceSegment2(p.c1, depart, p.fin) <= t2 && distanceSegment2(p.c2, depart, p.fin) <= t2;
};

/** Les commandes d'un segment deforme (sans son point de depart) : des cubiques ajustees, des droites ou, a defaut, ses points. */
function segmentDeforme(def: Deformation, p: readonly Pt[]): Commande[] {
  const envoyes = p.map(q => def.f(q[0], q[1]));
  let l = 0;
  for (let i = 1; i < envoyes.length; i++) { const a = au(envoyes, i - 1), b = au(envoyes, i); l += Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])); }
  const n = Math.max(PAS_MIN, Math.min(PAS_MAX, Math.ceil(l / def.pas)));
  const pts: Pt[] = [];
  for (let k = 0; k <= n; k++) pts.push(k === 0 ? au(envoyes, 0) : k === n ? au(envoyes, envoyes.length - 1) : (q => def.f(q[0], q[1]))(pointSegment(p, k / n)));
  const fin = au(pts, n), depart = au(pts, 0);
  const [td, tf] = directions(p);
  const tanDebut = tangenteDeformee(def, au(p, 0), td), tanArrivee = tangenteDeformee(def, au(p, p.length - 1), tf);
  const pieces = ajusterCubiques(pts, def.tolerance, tanDebut, tanArrivee ? [-tanArrivee[0], -tanArrivee[1]] : undefined);
  if (!pieces) return pts.slice(1).map(q => ({ c: 'L', p: [arrondi(q[0]), arrondi(q[1])] }));
  let avant = depart;
  return pieces.map((piece, i): Commande => {
    const bout = i === pieces.length - 1 ? fin : piece.fin;
    const c: Commande = estDroite(avant, piece, def.tolerance) ? { c: 'L', p: [arrondi(bout[0]), arrondi(bout[1])] }
      : { c: 'C', p: [arrondi(piece.c1[0]), arrondi(piece.c1[1]), arrondi(piece.c2[0]), arrondi(piece.c2[1]), arrondi(bout[0]), arrondi(bout[1])] };
    avant = bout;
    return c;
  });
}

/** Un chemin (M, L, C, Q, Z absolus) deforme : chaque segment rebati, chaque sous-chemin ferme le reste. */
export function deformerChemin(d: Chemin, def: Deformation): Commande[] {
  const r: Commande[] = [];
  let x = 0, y = 0, sx = 0, sy = 0;
  for (const c of d) {
    const p = c.p;
    if (c.c === 'M') {
      x = sx = p[0] ?? 0; y = sy = p[1] ?? 0;
      const q = def.f(x, y);
      r.push({ c: 'M', p: [arrondi(q[0]), arrondi(q[1])] });
      continue;
    }
    if (c.c === 'Z') {
      // Le retour au depart : le Z le trace quand il reste droit ; courbe, il s'ecrit avant le Z.
      const retour = x !== sx || y !== sy ? segmentDeforme(def, [[x, y], [sx, sy]]) : [];
      if (retour.length !== 1 || retour[0]?.c !== 'L') r.push(...retour);
      r.push({ c: 'Z', p: [] });
      x = sx; y = sy;
      continue;
    }
    const pts: Pt[] = [[x, y]];
    for (let k = 0; k + 1 < p.length; k += 2) pts.push([p[k] ?? 0, p[k + 1] ?? 0]);
    r.push(...segmentDeforme(def, pts));
    const z = au(pts, pts.length - 1);
    x = z[0]; y = z[1];
  }
  return r;
}

// ---------------------------------------------------------------- le texte deforme

const dessine = (d: Chemin): boolean => d.some(c => c.c !== 'M' && c.c !== 'Z');

/** La boite des contours pleins du texte droit a cette taille (dans le plan), ou null s'il ne dessine rien. */
function boiteDuBloc(r: ReglagesEnveloppe, glyphes: Glyphes, taille: number): BoiteTexte | null {
  const d = composerBloc({ ...r, taille }, glyphes).flatMap(l => l.d);
  const b = dessine(d) ? boiteChemin(d) : null;
  return b && b.l > 0 && b.h > 0 ? b : null;
}

/**
 * La taille d'un texte deforme (en unites de composition, au centieme vers le bas, la taille dans le plan etant celle-ci fois
 * `echelle`) : la hauteur de la forme sur la hauteur du bloc (ses contours pleins, mesures une fois a une grande taille). Les
 * lettres de la plus haute colonne ont ainsi a peu pres leur taille ; la marge et les tolerances se lisent en part d'elle. La
 * taille du texte si rien ne se mesure (texte vide, forme sans aire).
 */
export function tailleEnveloppe(r: ReglagesEnveloppe & { readonly taille: number }, base: Forme, glyphes: Glyphes, echelle = 1): number {
  const p = profilDe(base.d), b = boiteDuBloc(r, glyphes, TAILLE_MESURE);
  if (!p || !b || !(echelle > 0)) return r.taille;
  const t = Math.floor(((p.y1 - p.y0) / (b.h / TAILLE_MESURE) / echelle) * 100) / 100;
  return t > 0.01 ? t : 0.01;
}

/** La pose d'un texte qui ne se deforme pas : aucune lettre, tous les curseurs au meme point, et la raison. */
function refusee(texte: string, ou: Pt, taille: number, refus: RefusEnveloppe): Pose {
  const c: Caret = [[ou[0], ou[1] + BAS_CURSEUR * taille], [ou[0], ou[1] - HAUT_CURSEUR * taille]];
  const n = texte.length + 1;
  return { lettres: [], carets: Array.from({ length: n }, () => c), lignes: Array.from({ length: n }, () => 0), taille, ancre: ou, depasse: 0, nonPlaces: 0, refus };
}

/**
 * Deforme un texte dans sa forme, a la taille donnee dans le plan : `glyphes` sont celles de la police (la boite du bloc se lit
 * toujours sur les lettres pleines), `trace` celles qui dessinent (les memes, ou leur ligne mediane). Les curseurs de la saisie
 * sont ceux du texte droit, envoyes par la meme enveloppe. Un refus (texte vide, forme sans aire, marge trop grande) rend une pose
 * sans lettre, qui le nomme.
 */
export function poserEnveloppe(r: ReglagesEnveloppe, base: Forme, glyphes: Glyphes, trace: Glyphes, taille: number): Pose {
  const p = profilDe(base.d);
  if (!p) { const b = boiteChemin(base.d); return refusee(r.texte, b ? [b.x, b.y + b.h / 2] : [0, 0], taille, 'forme-sans-aire'); }
  const centre: Pt = [(p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2];
  const boite = boiteDuBloc(r, glyphes, taille);
  if (!boite) return refusee(r.texte, centre, taille, 'texte-vide');
  const f = enveloppeDe(p, boite, r.marge * taille);
  if (!f) return refusee(r.texte, centre, taille, 'marge');
  const def: Deformation = { f, pas: PAS_ENVELOPPE * taille, tolerance: TOLERANCE_ENVELOPPE * taille, h: 1e-4 * taille };
  const reglages: ReglagesBloc = { ...r, taille };
  const lettres: Lettre[] = [];
  for (const l of composerBloc(reglages, trace)) {
    const d = deformerChemin(l.d, def);
    if (dessine(d)) lettres.push({ caractere: l.caractere, d });
  }
  // Les curseurs du texte droit (ses lignes, ses abscisses), du bas au haut du cadratin, envoyes dans la forme.
  const mp = miseEnPage(reglages, glyphes), carets: Caret[] = [], lignes: number[] = [];
  for (let i = 0; i <= r.texte.length; i++) {
    const k = ligneDe(mp, i), x = xAuIndex(mp, i), y = au(mp.lignes, k).base;
    carets.push([f(x, y + BAS_CURSEUR * taille), f(x, y - HAUT_CURSEUR * taille)]);
    lignes.push(k);
  }
  return { lettres, carets, lignes, taille, ancre: f(0, 0), depasse: 0, nonPlaces: 0 };
}
