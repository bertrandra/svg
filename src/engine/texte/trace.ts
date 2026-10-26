// Le trace d'une forme, parcouru a l'abscisse curviligne (ADR-0031) : ou est le point a une longueur donnee du depart, quelle est
// la tangente en ce point, et quelle longueur mene au point le plus proche d'un autre. Un texte pose sur une forme s'en sert pour
// placer chaque lettre ; un texte pose dans une forme, pour couper ses lignes sur les bords (les polygones du trace).
//
// Chaque courbe est decoupee en un nombre fixe de cordes (PAS_COURBE), chaque corde garde l'intervalle de parametre qu'elle couvre :
// la longueur se lit sur les cordes, le point et la tangente sur la courbe elle-meme, au parametre interpole. Rien que des + - * /
// et des racines carrees (exactes en IEEE 754) : memes entrees, memes nombres, d'un moteur JavaScript a l'autre, sans sinus ni
// cosinus. Memorise par chemin, qui ne change jamais (ADR-0008).

import type { Chemin } from '../editionSvg.js';

export type Pt = readonly [number, number];

/** Les cordes d'une courbe : assez pour une lettre posee sur un cercle (un dix-millieme de rayon d'ecart), bornees pour un long trace. */
export const PAS_COURBE = 48;

/** Un segment du trace : une ligne, une quadratique ou une cubique, par ses points de controle (le premier est le depart). */
interface Segment { readonly pts: readonly Pt[] }

/** Un sous-chemin parcouru : ses cordes (point de depart de chacune, segment et parametres), leurs longueurs cumulees. */
export interface Trace {
  readonly longueur: number;
  readonly ferme: boolean;
  readonly segments: readonly Segment[];
  /** Pour chaque corde k : le segment, le parametre au debut et a la fin, la longueur cumulee a son debut (cumul[n] = longueur). */
  readonly seg: Int32Array;
  readonly t0: Float64Array;
  readonly t1: Float64Array;
  readonly cumul: Float64Array;
  /** Les sommets des cordes (n + 1 points). */
  readonly xs: Float64Array;
  readonly ys: Float64Array;
}

const longueurDe = (ax: number, ay: number, bx: number, by: number): number => Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));

/** Le point d'un segment au parametre t (De Casteljau, ecrit a plat pour 2, 3 ou 4 points). */
function pointSegment(s: Segment, t: number): Pt {
  const p = s.pts, u = 1 - t;
  const a = p[0] ?? [0, 0], b = p[1] ?? a;
  if (p.length === 2) return [a[0] * u + b[0] * t, a[1] * u + b[1] * t];
  const c = p[2] ?? b;
  if (p.length === 3) return [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]];
  const d = p[3] ?? c;
  const uu = u * u, tt = t * t;
  return [uu * u * a[0] + 3 * uu * t * b[0] + 3 * u * tt * c[0] + tt * t * d[0], uu * u * a[1] + 3 * uu * t * b[1] + 3 * u * tt * c[1] + tt * t * d[1]];
}

/** La derivee d'un segment au parametre t (non normee). */
function deriveeSegment(s: Segment, t: number): Pt {
  const p = s.pts, u = 1 - t;
  const a = p[0] ?? [0, 0], b = p[1] ?? a;
  if (p.length === 2) return [b[0] - a[0], b[1] - a[1]];
  const c = p[2] ?? b;
  if (p.length === 3) return [2 * (u * (b[0] - a[0]) + t * (c[0] - b[0])), 2 * (u * (b[1] - a[1]) + t * (c[1] - b[1]))];
  const d = p[3] ?? c;
  return [
    3 * (u * u * (b[0] - a[0]) + 2 * u * t * (c[0] - b[0]) + t * t * (d[0] - c[0])),
    3 * (u * u * (b[1] - a[1]) + 2 * u * t * (c[1] - b[1]) + t * t * (d[1] - c[1]))
  ];
}

/** Les segments de chaque sous-chemin d'un chemin, et s'il est ferme (un Z, ou un retour exact au depart). */
function sousTraces(d: Chemin): Array<{ segments: Segment[]; ferme: boolean }> {
  const r: Array<{ segments: Segment[]; ferme: boolean }> = [];
  let cour: Segment[] = [], x = 0, y = 0, sx = 0, sy = 0, ferme = false;
  const clore = () => {
    if (cour.length) r.push({ segments: cour, ferme: ferme || (x === sx && y === sy) });
    cour = []; ferme = false;
  };
  for (const c of d) {
    const p = c.p;
    if (c.c === 'M') { clore(); x = sx = p[0] ?? 0; y = sy = p[1] ?? 0; continue; }
    if (c.c === 'Z') {
      if (x !== sx || y !== sy) cour.push({ pts: [[x, y], [sx, sy]] });
      x = sx; y = sy; ferme = true;
      clore();
      continue;
    }
    const pts: Pt[] = [[x, y]];
    for (let k = 0; k + 1 < p.length; k += 2) pts.push([p[k] ?? 0, p[k + 1] ?? 0]);
    const fin = pts[pts.length - 1] ?? [x, y];
    cour.push({ pts });
    x = fin[0]; y = fin[1];
  }
  clore();
  return r;
}

/** Un sous-chemin en cordes, avec les longueurs cumulees. Null s'il n'a aucune longueur. */
function construire(segments: readonly Segment[], ferme: boolean): Trace | null {
  const seg: number[] = [], t0: number[] = [], t1: number[] = [], xs: number[] = [], ys: number[] = [], cumul: number[] = [0];
  let total = 0;
  segments.forEach((s, i) => {
    const n = s.pts.length === 2 ? 1 : PAS_COURBE;
    let a = s.pts[0] ?? [0, 0];
    if (!xs.length) { xs.push(a[0]); ys.push(a[1]); }
    for (let k = 1; k <= n; k++) {
      const b = k === n ? s.pts[s.pts.length - 1] ?? a : pointSegment(s, k / n);
      seg.push(i); t0.push((k - 1) / n); t1.push(k / n);
      total += longueurDe(a[0], a[1], b[0], b[1]);
      cumul.push(total);
      xs.push(b[0]); ys.push(b[1]);
      a = b;
    }
  });
  if (!(total > 0)) return null;
  return {
    longueur: total, ferme, segments, seg: Int32Array.from(seg), t0: Float64Array.from(t0), t1: Float64Array.from(t1),
    cumul: Float64Array.from(cumul), xs: Float64Array.from(xs), ys: Float64Array.from(ys)
  };
}

const memoire = new WeakMap<Chemin, Trace[]>();

/** Les sous-chemins d'un chemin, parcourus ; ceux qui n'ont aucune longueur sont laisses de cote. Memorise par chemin. */
export function tracesDe(d: Chemin): Trace[] {
  let r = memoire.get(d);
  if (!r) {
    r = sousTraces(d).map(s => construire(s.segments, s.ferme)).filter((t): t is Trace => t !== null);
    memoire.set(d, r);
  }
  return r;
}

/** Le plus long sous-chemin : celui qui porte un texte pose sur la forme (le pourtour d'un anneau, pas son trou). */
export function traceDe(d: Chemin): Trace | null {
  let meilleur: Trace | null = null;
  for (const t of tracesDe(d)) if (!meilleur || t.longueur > meilleur.longueur) meilleur = t;
  return meilleur;
}

/** L'abscisse ramenee dans le trace : modulo la longueur pour un trace ferme, bornee aux bouts pour un trace ouvert. */
export function ramener(tr: Trace, s: number): number {
  if (!tr.ferme) return Math.min(tr.longueur, Math.max(0, s));
  const r = s - Math.floor(s / tr.longueur) * tr.longueur;
  return r >= tr.longueur ? 0 : r;
}

/** La corde qui contient l'abscisse (deja ramenee) : la derniere dont le debut est avant elle (recherche par moities). */
function corde(tr: Trace, s: number): number {
  let bas = 0, haut = tr.seg.length - 1;
  while (bas < haut) {
    const m = (bas + haut + 1) >> 1;
    if ((tr.cumul[m] ?? 0) <= s) bas = m; else haut = m - 1;
  }
  return bas;
}

/** Le segment et son parametre a cette abscisse. */
function parametre(tr: Trace, s: number): { s: Segment; t: number; k: number } {
  const v = ramener(tr, s), k = corde(tr, v);
  const a = tr.cumul[k] ?? 0, b = tr.cumul[k + 1] ?? a, u = b > a ? (v - a) / (b - a) : 0;
  const t0 = tr.t0[k] ?? 0, t1 = tr.t1[k] ?? 1;
  return { s: tr.segments[tr.seg[k] ?? 0] ?? { pts: [[0, 0], [0, 0]] }, t: t0 + (t1 - t0) * u, k };
}

/** Le point du trace a l'abscisse s (sur la courbe meme, au parametre interpole). */
export function pointA(tr: Trace, s: number): Pt {
  const p = parametre(tr, s);
  return pointSegment(p.s, p.t);
}

/** La tangente unitaire du trace a l'abscisse s, dans le sens du parcours ; celle de la corde la ou la courbe s'arrete (point double). */
export function tangenteA(tr: Trace, s: number): Pt {
  const p = parametre(tr, s);
  let [dx, dy] = deriveeSegment(p.s, p.t);
  let n = Math.sqrt(dx * dx + dy * dy);
  if (!(n > 1e-12)) {
    dx = (tr.xs[p.k + 1] ?? 0) - (tr.xs[p.k] ?? 0); dy = (tr.ys[p.k + 1] ?? 0) - (tr.ys[p.k] ?? 0);
    n = Math.sqrt(dx * dx + dy * dy);
  }
  return n > 1e-12 ? [dx / n, dy / n] : [1, 0];
}

/** L'abscisse du point du trace le plus proche de p (projete sur les cordes ; a egalite, la premiere). */
export function projeter(tr: Trace, p: Pt): number {
  let meilleure = 0, ecart = Infinity;
  for (let k = 0; k < tr.seg.length; k++) {
    const ax = tr.xs[k] ?? 0, ay = tr.ys[k] ?? 0, bx = tr.xs[k + 1] ?? ax, by = tr.ys[k + 1] ?? ay;
    const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
    const u = l2 > 0 ? Math.min(1, Math.max(0, ((p[0] - ax) * vx + (p[1] - ay) * vy) / l2)) : 0;
    const qx = ax + vx * u, qy = ay + vy * u, e = (p[0] - qx) * (p[0] - qx) + (p[1] - qy) * (p[1] - qy);
    if (e < ecart) { ecart = e; meilleure = (tr.cumul[k] ?? 0) + Math.sqrt(l2) * u; }
  }
  return meilleure;
}

/**
 * Le sens d'un trace ferme a l'ecran (Y vers le bas) : 1 s'il tourne dans le sens des aiguilles d'une montre, -1 sinon (aire signee
 * des cordes). 1 pour un trace ouvert.
 */
export function sensHoraire(tr: Trace): 1 | -1 {
  if (!tr.ferme) return 1;
  let aire = 0;
  for (let k = 0; k < tr.seg.length; k++) aire += (tr.xs[k] ?? 0) * (tr.ys[k + 1] ?? 0) - (tr.xs[k + 1] ?? 0) * (tr.ys[k] ?? 0);
  return aire >= 0 ? 1 : -1;
}

/** L'abscisse du point le plus haut du trace (le plus a gauche a egalite), ou du plus bas : le depart d'un texte sur une forme fermee. */
export function abscisseExtreme(tr: Trace, haut: boolean): number {
  let k0 = 0;
  for (let k = 1; k < tr.xs.length - 1; k++) {
    const y = tr.ys[k] ?? 0, y0 = tr.ys[k0] ?? 0, x = tr.xs[k] ?? 0, x0 = tr.xs[k0] ?? 0;
    if (haut ? y < y0 || (y === y0 && x < x0) : y > y0 || (y === y0 && x < x0)) k0 = k;
  }
  return tr.cumul[k0] ?? 0;
}

/** Les polygones d'un chemin (chaque sous-chemin ferme implicitement, comme un remplissage) : les sommets des cordes. */
export function polygonesDe(d: Chemin): Pt[][] {
  return tracesDe(d).map(t => {
    const p: Pt[] = [];
    for (let k = 0; k < t.xs.length; k++) p.push([t.xs[k] ?? 0, t.ys[k] ?? 0]);
    return p;
  });
}
