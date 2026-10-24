// Arrondir les angles : chaque coin d'un chemin (droite contre droite, droite contre courbe, courbe
// contre courbe, la ou les tangentes different) est remplace par un arc de cercle de rayon donne, ecrit
// en cubiques d'au plus un quart de tour. Un nœud lisse (tangentes continues) ne bouge pas. Un coin
// dont les segments sont trop courts pour le rayon demande prend le plus grand rayon possible, et le
// dit : chaque segment ne livre a ses deux coins que sa moitie (la totalite quand son autre bout n'est pas
// un coin), donc deux filets voisins ne se recouvrent jamais.

import type { Chemin, Commande } from './types.js';
import { filetEntre, tangente, tranche, virage, type Budget, type Filet, type Seg } from './filet.js';
import { fois, plus, quart, scalaire, unitaire, vectoriel, type Pt } from './vecteurs.js';

export interface ResultatArrondi {
  readonly chemin: Chemin;
  /** Le nombre de coins arrondis. */
  readonly angles: number;
  /** Parmi eux, ceux qui ont du prendre un rayon plus petit que demande (segments trop courts). */
  readonly reduits: number;
  /** Le plus petit rayon effectivement pose (0 quand aucun coin n'a ete arrondi). */
  readonly rayonMin: number;
}

/** Un sous-chemin ramene a des segments : `orig` est la commande d'origine, gardee telle quelle quand le segment n'est pas touche. */
interface Contour { readonly segs: readonly Seg[]; readonly origs: readonly (Commande | null)[]; readonly ferme: boolean; readonly fermeture: boolean }

const egaux = (p: Pt, q: Pt) => Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9;
const pt = (c: Commande, k: number): Pt => [c.p[k] ?? 0, c.p[k + 1] ?? 0];

/** Un sous-chemin (de son M a son Z eventuel) en segments ; les droites de longueur nulle disparaissent. */
function contourDe(sous: readonly Commande[]): Contour | null {
  const debut = sous[0];
  if (!debut || debut.c !== 'M') return null;
  const segs: Seg[] = [], origs: (Commande | null)[] = [];
  let courant = pt(debut, 0);
  const premierPoint = courant;
  const ferme = sous.some(c => c.c === 'Z');
  for (const c of sous.slice(1)) {
    if (c.c === 'L') {
      const b = pt(c, 0);
      if (egaux(courant, b)) continue;
      segs.push({ droit: true, a: courant, c1: courant, c2: b, b }); origs.push(c);
      courant = b;
    } else if (c.c === 'C') {
      const b = pt(c, 4);
      segs.push({ droit: false, a: courant, c1: pt(c, 0), c2: pt(c, 2), b }); origs.push(c);
      courant = b;
    } else if (c.c === 'Q') {
      // Une quadratique est une cubique : c1 = a + 2/3 (q - a), c2 = b + 2/3 (q - b), sans changer la courbe.
      const q = pt(c, 0), b = pt(c, 2);
      segs.push({ droit: false, a: courant, c1: plus(courant, fois([q[0] - courant[0], q[1] - courant[1]], 2 / 3)), c2: plus(b, fois([q[0] - b[0], q[1] - b[1]], 2 / 3)), b }); origs.push(c);
      courant = b;
    }
  }
  if (!segs.length) return null;
  let fermeture = false;
  if (ferme && !egaux(courant, premierPoint)) {
    segs.push({ droit: true, a: courant, c1: courant, c2: premierPoint, b: premierPoint }); origs.push(null);
    fermeture = true;
  }
  return { segs, origs, ferme, fermeture };
}

/** Est-ce qu'un coin existe au sommet entre deux segments ? */
const estCoin = (s: Seg, t: Seg): boolean => virage(tangente(s, 1), tangente(t, 0)) !== null;

/** Les commandes d'un arc de filet, en cubiques d'au plus un quart de tour, de `f.p1` a `f.p2`. */
function arcDe(f: Filet): Commande[] {
  const r = f.rayon, sens = f.sens;
  const rayonnant = (p: Pt): Pt => fois([p[0] - f.centre[0], p[1] - f.centre[1]], 1 / r);
  const piece = (u: Pt, v: Pt, p0: Pt, p3: Pt): Commande[] => {
    const cos = scalaire(u, v);
    if (cos < -1e-9) {
      const w = unitaire(plus(u, v)), m = plus(f.centre, fois(w, r));
      return [...piece(u, w, p0, m), ...piece(w, v, m, p3)];
    }
    const demi = Math.abs(vectoriel(u, v)) / (1 + cos), quartDeTour = demi / (1 + Math.sqrt(1 + demi * demi)), h = (4 / 3) * quartDeTour * r;
    const c1 = plus(p0, fois(fois(quart(u), sens), h)), c2 = plus(p3, fois(fois(quart(v), -sens), h));
    return [{ c: 'C', p: [c1[0], c1[1], c2[0], c2[1], p3[0], p3[1]] }];
  };
  return piece(rayonnant(f.p1), rayonnant(f.p2), f.p1, f.p2);
}

/** La commande d'un segment (taille d'origine si intact, sinon recalculee). */
function commandeDe(s: Seg, orig: Commande | null, intact: boolean): Commande {
  if (intact && orig) return orig;
  return s.droit ? { c: 'L', p: [s.b[0], s.b[1]] } : { c: 'C', p: [s.c1[0], s.c1[1], s.c2[0], s.c2[1], s.b[0], s.b[1]] };
}

/**
 * Arrondit un contour ; rend ses commandes et ses comptes, ou null si aucun coin ne s'arrondit. Le sommet j
 * est le depart du segment j : le coin y raccorde le segment j-1 au segment j (un contour ouvert n'en a pas
 * au sommet 0, ni a son arrivee).
 */
function arrondirContour(k: Contour, rayon: number): { commandes: Commande[]; angles: number; reduits: number; rayonMin: number } | null {
  const { segs } = k, n = segs.length;
  const paire = (j: number): [Seg, Seg] | null => {
    const s = segs[(j + n - 1) % n], t = segs[j];
    return s && t && (k.ferme || j > 0) && estCoin(s, t) ? [s, t] : null;
  };
  const coins = Array.from({ length: n }, (_, j) => paire(j));
  const filets = coins.map((c, j): Filet | null => {
    if (!c) return null;
    // Un segment ne livre a chacun de ses deux coins que sa moitie, et tout quand son autre bout n'est pas un coin.
    const budget: Budget = { entrant: coins[(j + n - 1) % n] ? 0.5 : 0.999, sortant: coins[(j + 1) % n] ? 0.5 : 0.999 };
    return filetEntre(c[0], c[1], rayon, budget);
  });
  const poses = filets.filter((f): f is Filet => f !== null);
  if (!poses.length) return null;
  const commandes: Commande[] = [];
  for (let j = 0; j < n; j++) {
    const s = segs[j];
    if (!s) continue;
    const de = filets[j]?.b ?? 0, a = filets[(j + 1) % n]?.a ?? 1, intact = de === 0 && a === 1;
    const morceau = intact ? s : tranche(s, de, a);
    if (j === 0) commandes.push({ c: 'M', p: [morceau.a[0], morceau.a[1]] });
    // Une fermeture implicite que rien n'entame se laisse a Z.
    if (!(intact && k.fermeture && j === n - 1)) commandes.push(commandeDe(morceau, k.origs[j] ?? null, intact));
    const f = filets[(j + 1) % n];
    if (f && (k.ferme || j < n - 1)) commandes.push(...arcDe(f));
  }
  if (k.ferme) commandes.push({ c: 'Z', p: [] });
  const reduits = poses.filter(f => f.rayon < rayon * (1 - 1e-9)).length;
  return { commandes, angles: poses.length, reduits, rayonMin: Math.min(...poses.map(f => f.rayon)) };
}

/** Les sous-chemins d'un chemin : chacun commence a un M. */
function decouper(d: Chemin): Commande[][] {
  const r: Commande[][] = [];
  for (const c of d) {
    if (c.c === 'M' || !r.length) r.push([]);
    r[r.length - 1]?.push(c);
  }
  return r;
}

/**
 * Arrondit les coins du chemin au rayon donne. Le meme chemin (la meme reference) quand aucun coin ne
 * s'arrondit : rayon nul, chemin sans angle, ou coins trop proches pour le moindre filet.
 */
export function arrondirAngles(chemin: Chemin, rayon: number): ResultatArrondi {
  const rien: ResultatArrondi = { chemin, angles: 0, reduits: 0, rayonMin: 0 };
  if (!(rayon > 0) || !Number.isFinite(rayon)) return rien;
  let angles = 0, reduits = 0, rayonMin = Infinity, change = false;
  const sortie: Commande[] = [];
  for (const sous of decouper(chemin)) {
    const contour = contourDe(sous);
    const r = contour ? arrondirContour(contour, rayon) : null;
    if (!r) { sortie.push(...sous); continue; }
    change = true; angles += r.angles; reduits += r.reduits; rayonMin = Math.min(rayonMin, r.rayonMin);
    sortie.push(...r.commandes);
  }
  return change ? { chemin: sortie, angles, reduits, rayonMin } : rien;
}
