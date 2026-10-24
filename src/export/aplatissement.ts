// Aplatir un chemin en polylignes pour les formats qui ne savent pas (ou pas bien) les courbes, comme le
// DXF R12. A la difference de `aplatir` du moteur (qui sert aux booleens et rend toujours des anneaux
// fermes), on garde ici ce qu'un fichier de decoupe doit savoir : un trace ouvert reste ouvert, un trace
// ferme reste ferme. Pur.

import type { Chemin } from '../engine/editionSvg.js';

export type Point = readonly [number, number];
export interface Polyligne { readonly points: readonly Point[]; readonly ferme: boolean }

/** Une courbe n'a rien a gagner a depasser ce nombre de segments, et une droite en demande un. */
const SEGMENTS_MAX = 512;
/** Deux extremites a moins de cet ecart (relatif a l'echelle du dessin) sont la meme : le trace est ferme. */
const COINCIDENCE = 1e-9;

/**
 * Le nombre de segments egaux (en t) qui tient une courbe de Bezier de degre `degre` a `tolerance` pres :
 * l'ecart a la corde est borne par d(d-1)/8 * M / n^2 (Wang), M etant la plus grande seconde difference des
 * points de controle. Le meme raisonnement que le moteur de booleens, ecrit ici pour ne pas en dependre.
 */
function nombreDeSegments(degre: 2 | 3, secondeDifference: number, tolerance: number): number {
  const n = Math.ceil(Math.sqrt((degre * (degre - 1) * secondeDifference) / (8 * Math.max(tolerance, 1e-9))));
  return Math.max(1, Math.min(SEGMENTS_MAX, n));
}

const seconde = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) => Math.hypot(x0 - 2 * x1 + x2, y0 - 2 * y1 + y2);
const cubique = (a: number, b: number, c: number, d: number, t: number) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d;
const quadratique = (a: number, b: number, c: number, t: number) => (1 - t) ** 2 * a + 2 * (1 - t) * t * b + t * t * c;

/** Les polylignes d'un chemin, les courbes aplaties a `tolerance` pres (en unites du plan). */
export function polylignes(d: Chemin, tolerance: number): Polyligne[] {
  const out: Polyligne[] = [];
  let points: Point[] = [], debut: Point = [0, 0], courant: Point = [0, 0], echelle = 1;
  for (const c of d) for (const v of c.p) echelle = Math.max(echelle, Math.abs(v));
  const fermer = (ferme: boolean) => {
    let pts = points;
    points = [];
    if (pts.length < 2) return;
    const premier = pts[0], dernier = pts[pts.length - 1];
    const memePoint = premier !== undefined && dernier !== undefined && Math.hypot(premier[0] - dernier[0], premier[1] - dernier[1]) <= COINCIDENCE * echelle;
    // Un trace qui revient a son point de depart est ferme, avec ou sans Z : une decoupe ne doit pas avoir de jour.
    if (memePoint && (ferme || pts.length >= 3)) { pts = pts.slice(0, -1); ferme = true; }
    if (pts.length >= 2) out.push({ points: pts, ferme });
  };
  const pousser = (x: number, y: number) => {
    if (points.length === 0) points.push(courant);
    points.push([x, y]);
    courant = [x, y];
  };
  for (const c of d) {
    const p = c.p;
    if (c.c === 'M') { fermer(false); debut = courant = [p[0] ?? 0, p[1] ?? 0]; }
    else if (c.c === 'Z') { fermer(true); courant = debut; }
    else if (c.c === 'L') pousser(p[0] ?? 0, p[1] ?? 0);
    else if (c.c === 'C') {
      const [x0, y0] = courant, [x1, y1, x2, y2, x3, y3] = [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 0, p[4] ?? 0, p[5] ?? 0];
      const n = nombreDeSegments(3, Math.max(seconde(x0, y0, x1, y1, x2, y2), seconde(x1, y1, x2, y2, x3, y3)), tolerance);
      for (let k = 1; k <= n; k++) pousser(k === n ? x3 : cubique(x0, x1, x2, x3, k / n), k === n ? y3 : cubique(y0, y1, y2, y3, k / n));
    } else {
      const [x0, y0] = courant, [x1, y1, x2, y2] = [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 0];
      const n = nombreDeSegments(2, seconde(x0, y0, x1, y1, x2, y2), tolerance);
      for (let k = 1; k <= n; k++) pousser(k === n ? x2 : quadratique(x0, x1, x2, k / n), k === n ? y2 : quadratique(y0, y1, y2, k / n));
    }
  }
  fermer(false);
  return out;
}
