// D'une polyligne de centres de pixels a un chemin du modele a plat (ADR-0021) : l'escalier des pixels se
// lisse (une moyenne [1, 2, 1] / 4, bouts tenus), Ramer-Douglas-Peucker dit ou sont les coins (un virage de
// plus de 60 degres entre deux cordes), et chaque troncon entre deux coins s'ajuste en cubiques
// (`ajusterCubiques`, celui qui rebatit les booleens, verifie dans les deux sens). Un troncon qu'on ne sait
// pas ajuster, ou que les cubiques n'allegent pas, garde les segments de Ramer-Douglas-Peucker. Rien que
// des + - * / et des racines : le meme trace rend les memes commandes.

import { ajusterCubiques, distanceSegment2, simplifierPolyligne, type PieceCubique } from '../edition/ajustement.js';
import type { Commande } from '../edition/types.js';
import type { Pt } from './graphe.js';

/** Au-dela de 60 degres de virage d'une corde a la suivante, un sommet est un coin. */
const COS_COIN = 0.5;

const egaux = (a: Pt | undefined, b: Pt | undefined): boolean => Boolean(a && b && a[0] === b[0] && a[1] === b[1]);

/** Les points sans doublon consecutif. */
function sansDoublons(pts: readonly Pt[]): Pt[] {
  const r: Pt[] = [];
  for (const p of pts) if (!egaux(r[r.length - 1], p)) r.push(p);
  return r;
}

/** `passes` moyennes [1, 2, 1] / 4 ; les bouts d'une polyligne ouverte restent ou ils sont, un anneau tourne. */
export function lisser(pts: readonly Pt[], ferme: boolean, passes: number): Pt[] {
  let cour = [...pts];
  const n = cour.length;
  if (n < 3) return cour;
  for (let k = 0; k < passes; k++) {
    cour = cour.map((p, i) => {
      if (!ferme && (i === 0 || i === n - 1)) return p;
      const a = cour[(i + n - 1) % n] ?? p, b = cour[(i + 1) % n] ?? p;
      return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4] as Pt;
    });
  }
  return cour;
}

/** Vrai si le virage en `q` (de p vers r) depasse 60 degres. */
function estCoin(p: Pt, q: Pt, r: Pt): boolean {
  const ax = q[0] - p[0], ay = q[1] - p[1], bx = r[0] - q[0], by = r[1] - q[1];
  const la = Math.sqrt(ax * ax + ay * ay), lb = Math.sqrt(bx * bx + by * by);
  return la > 0 && lb > 0 && ax * bx + ay * by < COS_COIN * la * lb;
}

/** Les indices des coins parmi les sommets gardes par Ramer-Douglas-Peucker (sans les bouts). */
function coins(pts: readonly Pt[], gardes: readonly number[]): number[] {
  const r: number[] = [];
  for (let k = 1; k < gardes.length - 1; k++) {
    const p = pts[gardes[k - 1] ?? 0], q = pts[gardes[k] ?? 0], s = pts[gardes[k + 1] ?? 0];
    if (p && q && s && estCoin(p, q, s)) r.push(gardes[k] ?? 0);
  }
  return r;
}

const ligne = (p: Pt): Commande => ({ c: 'L', p: [p[0], p[1]] });

/** Une piece cubique droite, a la tolerance pres, s'ecrit en segment. */
function estDroite(depart: Pt, p: PieceCubique, tolerance: number): boolean {
  const t2 = tolerance * tolerance;
  return distanceSegment2(p.c1, depart, p.fin) <= t2 && distanceSegment2(p.c2, depart, p.fin) <= t2;
}

/** Les commandes d'un troncon (de `de` a `a` inclus, entre deux coins), sans son point de depart. */
function troncon(pts: readonly Pt[], de: number, a: number, gardes: readonly number[], tolerance: number, tanDebut?: Pt, tanFin?: Pt): Commande[] {
  const sommets = gardes.filter(i => i > de && i <= a);
  const droit = () => sommets.map(i => ligne(pts[i] ?? [0, 0]));
  if (a - de < 3 || sommets.length < 2) return droit();
  const pieces = ajusterCubiques(pts.slice(de, a + 1), tolerance, tanDebut, tanFin);
  // Des courbes plutot que des cordes (un stylo trace mieux une courbe qu'un polygone), tant qu'elles ne sont pas plus
  // nombreuses que les segments de Ramer-Douglas-Peucker qu'elles remplacent.
  if (!pieces || pieces.length > sommets.length) return droit();
  let depart = pts[de] ?? [0, 0];
  return pieces.map(p => {
    const c: Commande = estDroite(depart, p, tolerance) ? ligne(p.fin) : { c: 'C', p: [p.c1[0], p.c1[1], p.c2[0], p.c2[1], p.fin[0], p.fin[1]] };
    depart = p.fin;
    return c;
  });
}

/** La tangente d'un anneau lisse en son premier point, dans le sens du trace. */
function tangenteAnneau(pts: readonly Pt[]): Pt {
  const a = pts[pts.length - 2] ?? [0, 0], b = pts[1] ?? [0, 0], x = b[0] - a[0], y = b[1] - a[1], l = Math.sqrt(x * x + y * y);
  return l > 0 ? [x / l, y / l] : [1, 0];
}

/**
 * Le chemin d'une polyligne : M, puis L et C, et Z pour un trace ferme. Un point seul donne un trait de
 * longueur nulle (M p L p), qu'un bout rond dessine en point. `tolerance` est l'ecart permis, en pixels.
 */
export function versChemin(brut: readonly Pt[], ferme: boolean, tolerance: number, passes: number): Commande[] {
  let pts = sansDoublons(brut);
  if (ferme && pts.length > 1 && egaux(pts[0], pts[pts.length - 1])) pts = pts.slice(0, -1);
  const premier = pts[0];
  if (!premier) return [];
  if (pts.length === 1) return [{ c: 'M', p: [premier[0], premier[1]] }, ligne(premier)];
  if (ferme && pts.length < 3) ferme = false;
  pts = lisser(pts, ferme, passes);
  // Un anneau se traite ouvert, son premier point repete a la fin ; s'il a un coin, il commence par lui.
  if (ferme) {
    const ouvert = [...pts, pts[0] ?? premier];
    const c = coins(ouvert, simplifierPolyligne(ouvert, tolerance));
    const d = pts[pts.length - 1], s = pts[1], p0 = pts[0];
    const departCoin = d && s && p0 && estCoin(d, p0, s);
    if (!departCoin && c.length) pts = [...pts.slice(c[0] ?? 0), ...pts.slice(0, c[0] ?? 0)];
  }
  const travail = ferme ? [...pts, pts[0] ?? premier] : pts;
  const gardes = simplifierPolyligne(travail, tolerance);
  const lesCoins = coins(travail, gardes);
  const bornes = [0, ...lesCoins, travail.length - 1];
  const debut = travail[0] ?? premier;
  // Un anneau sans coin se ferme sans pli : les tangentes du premier et du dernier troncon sont celles du point de depart.
  const lisse = ferme && !lesCoins.length && !estCoin(travail[travail.length - 2] ?? debut, debut, travail[1] ?? debut);
  const tan = lisse ? tangenteAnneau(travail) : undefined;
  const commandes: Commande[] = [{ c: 'M', p: [debut[0], debut[1]] }];
  for (let k = 0; k + 1 < bornes.length; k++) {
    const de = bornes[k] ?? 0, a = bornes[k + 1] ?? 0;
    const tDebut = tan && k === 0 ? tan : undefined, tFin = tan && k === bornes.length - 2 ? ([-tan[0], -tan[1]] as Pt) : undefined;
    commandes.push(...troncon(travail, de, a, gardes, tolerance, tDebut, tFin));
  }
  if (ferme) commandes.push({ c: 'Z', p: [] });
  return commandes;
}
