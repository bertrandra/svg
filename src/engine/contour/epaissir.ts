// Epaissir une polyligne en anneaux dont l'union est le trace (etendre.ts fait l'union). Le trace est un
// pavage : chaque segment est un quadrilatere coupe, a chaque sommet, par la bissectrice du virage (du
// point interieur d'intersection des bords jusqu'au sommet), et la jonction (pointe, biseau, arc) est
// une cale posee du cote exterieur. Deux morceaux voisins partagent EXACTEMENT les memes sommets et les
// memes aretes : l'union n'a jamais a decider si un point est sur une arete ou a cote, ce qui fait
// echouer polygon-clipping quand on lui donne des rectangles qui se recoupent en leur milieu.
//
// Quand le bord interieur d'un segment est plus court que l'epaisseur (courbe serree, segment court),
// la bissectrice sortirait du segment : ce sommet-la garde alors des extremites perpendiculaires, qui
// se recouvrent franchement (un recouvrement net, pas une incidence), et la cale suffit a combler.

import type { Pair, Ring } from 'polygon-clipping';
import { pointsArc, pointsCercle, pointsDemiTour } from './arcs.js';
import { fois, moins, norme, plus, quart, scalaire, unitaire, vectoriel, type Polyligne, type Pt } from './polylignes.js';

export type Bout = 'butt' | 'round' | 'square';
export type Jonction = 'miter' | 'round' | 'bevel';

export interface ReglageBord {
  /** La demi-epaisseur : la distance du bord a l'axe. */
  readonly demi: number;
  readonly bout: Bout;
  readonly jonction: Jonction;
  /** Le rapport de pointe a epaisseur au-dela duquel une pointe est biseautee (4 en SVG). */
  readonly limite: number;
  /** L'ecart maximal d'un arc a ses cordes. */
  readonly tolerance: number;
}

const anneau = (pts: readonly Pt[]): Ring => pts.map((p): Pair => [p[0], p[1]]);

/** En deca de ce sinus un virage est nul : les deux segments partagent une seule paire de points de bord. */
const SINUS_NUL = 1e-6;

/** Ce qu'un sommet apporte : les extremites des segments qui s'y rejoignent (de gauche a droite) et la cale exterieure. */
interface Sommet { readonly fin: readonly Pt[]; readonly debut: readonly Pt[]; readonly cale: Ring | null }

/** La cale d'une jonction : la region que les deux segments laissent vide du cote exterieur du virage. */
function cale(p: Pt, a: Pt, b: Pt, pd: number, coin: boolean, r: ReglageBord, u: Pt, v: Pt, avant: Pt): Ring | null {
  const mode: Jonction = coin ? r.jonction : 'bevel';
  if (mode === 'round') {
    // Un demi-tour franc n'a pas de petit arc : on passe par l'avant du trace.
    const arc = pd < -1 + 1e-9 ? pointsDemiTour(p, u, avant, r.demi, r.tolerance) : pointsArc(p, u, v, r.demi, r.tolerance);
    return anneau([p, a, ...arc, b]);
  }
  if (mode === 'miter' && pd > -1 + 1e-9) {
    // Longueur de pointe sur epaisseur : 1 / cos(moitie du virage) = racine(2 / (1 + cos virage)).
    if (Math.sqrt(2 / (1 + pd)) <= r.limite) return anneau([p, a, plus(p, fois(plus(moins(a, p), moins(b, p)), 1 / (1 + pd))), b]);
  }
  return anneau([p, a, b]);
}

/** Un sommet d'extremite (trace ouvert) ou d'un trace droit : une seule paire de points de bord. */
function sommetDroit(p: Pt, d: Pt, h: number): Sommet {
  const n = fois(quart(d), h), g = plus(p, n), dr = moins(p, n);
  return { fin: [g, dr], debut: [g, dr], cale: null };
}

/** Un sommet de jonction entre le segment de direction `d1` (longueur `l1`) et celui de direction `d2` (`l2`). */
function sommetJoint(p: Pt, d1: Pt, d2: Pt, l1: number, l2: number, coin: boolean, r: ReglageBord): Sommet {
  const h = r.demi, c = vectoriel(d1, d2), pd = scalaire(d1, d2);
  if (Math.abs(c) < SINUS_NUL && pd > 0) return sommetDroit(p, unitaire(plus(d1, d2)), h);
  const s = c >= 0 ? 1 : -1;
  // Cote exterieur du virage : oppose a celui vers lequel le trace tourne.
  const u = fois(quart(d1), -s), v = fois(quart(d2), -s);
  const a = plus(p, fois(u, h)), b = plus(p, fois(v, h));
  // Le point interieur ou se coupent les bords des deux segments est a h tan(virage / 2) du sommet, le long de chacun.
  const t = pd > -1 + 1e-6 ? (h * Math.abs(c)) / (1 + pd) : Infinity;
  const pavage = t <= 0.5 * Math.min(l1, l2);
  const interieur = pavage ? moins(p, fois(plus(moins(a, p), moins(b, p)), 1 / (1 + pd))) : null;
  const iPrec = interieur ?? plus(p, fois(quart(d1), s * h)), iSuiv = interieur ?? plus(p, fois(quart(d2), s * h));
  const k = cale(p, a, b, pd, coin, r, u, v, d1);
  return s > 0 ? { fin: [iPrec, p, a], debut: [iSuiv, p, b], cale: k } : { fin: [a, p, iPrec], debut: [b, p, iSuiv], cale: k };
}

/** La piece d'un bout ouvert : les points `g` et `dr` (gauche, droite) du bord du trace, le trace partant dans la direction `sortie`. */
function bout(p: Pt, g: Pt, dr: Pt, sortie: Pt, r: ReglageBord): Ring | null {
  if (r.bout === 'butt') return null;
  const h = r.demi;
  if (r.bout === 'square') return anneau([g, plus(g, fois(sortie, h)), plus(dr, fois(sortie, h)), dr]);
  return anneau([g, ...pointsDemiTour(p, quart(sortie), sortie, h, r.tolerance), dr]);
}

/** Un point seul : un disque (bout rond), un carre oriente selon la direction (bout carre), rien (bout plat). */
function point(p: Pt, direction: Pt, r: ReglageBord): Ring | null {
  const h = r.demi;
  if (r.bout === 'round') return anneau(pointsCercle(p, h, r.tolerance));
  if (r.bout === 'square') {
    const d = fois(unitaire(direction), h), n = quart(d);
    return anneau([plus(plus(p, d), n), plus(moins(p, d), n), moins(moins(p, d), n), moins(plus(p, d), n)]);
  }
  return null;
}

/** Les anneaux dont l'union est le trace de la polyligne, epaissie de `r.demi` de chaque cote. */
export function anneauxDeTrait(l: Polyligne, r: ReglageBord): Ring[] {
  const pts = l.pts, n = pts.length, sortie: Ring[] = [];
  const ajouter = (x: Ring | null) => { if (x) sortie.push(x); };
  if (n === 1) { ajouter(point(pts[0] ?? [0, 0], l.direction ?? [1, 0], r)); return sortie; }
  const nSegments = l.ferme ? n : n - 1;
  const directions: Pt[] = [], longueurs: number[] = [];
  for (let k = 0; k < nSegments; k++) {
    const v = moins(pts[(k + 1) % n] ?? [0, 0], pts[k] ?? [0, 0]);
    directions.push(unitaire(v));
    longueurs.push(norme(v));
  }
  const sommets: Sommet[] = pts.map((p, k) => {
    const apres = directions[k % nSegments], avant = directions[(k + nSegments - 1) % nSegments];
    if (!apres || !avant) return sommetDroit(p, [1, 0], r.demi);
    if (!l.ferme && k === 0) return sommetDroit(p, apres, r.demi);
    if (!l.ferme && k === n - 1) return sommetDroit(p, avant, r.demi);
    return sommetJoint(p, avant, apres, longueurs[(k + nSegments - 1) % nSegments] ?? 0, longueurs[k % nSegments] ?? 0, l.coin[k] ?? true, r);
  });
  // Dans l'ordre du trace (bout, segment, cale, segment, ... bout) : l'union fusionne des voisins, qui partagent leurs aretes.
  if (!l.ferme) {
    const premier = sommets[0], p0 = pts[0], d0 = directions[0];
    const g0 = premier?.debut[0], r0 = premier?.debut[1];
    if (p0 && d0 && g0 && r0) ajouter(bout(p0, r0, g0, fois(d0, -1), r));
  }
  for (let k = 0; k < nSegments; k++) {
    const debut = sommets[k], fin = sommets[(k + 1) % n];
    if (debut && fin) sortie.push(anneau([...debut.debut, ...[...fin.fin].reverse()]));
    ajouter(fin?.cale ?? null);
  }
  if (!l.ferme) {
    const dernier = sommets[n - 1], p1 = pts[n - 1], d1 = directions[nSegments - 1];
    const g1 = dernier?.fin[0], r1 = dernier?.fin[1];
    if (p1 && d1 && g1 && r1) ajouter(bout(p1, g1, r1, d1, r));
  }
  return sortie;
}
