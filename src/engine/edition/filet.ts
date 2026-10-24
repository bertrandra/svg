// Le filet d'un angle : l'arc de cercle de rayon donne qui raccorde deux segments (droites ou cubiques)
// en leur etant tangent. Le centre d'un tel cercle est a la distance r de chacun des deux segments, donc
// a l'intersection de leurs courbes paralleles a r : pour deux droites, une formule ; des qu'une courbe
// est en jeu, on resout (a, b) par Newton, parametres des points de tangence, sous un budget (la part
// du segment qu'on accepte de manger). Pur et deterministe : un nombre fixe d'iterations, des differences
// finies a pas fixe, aucune trigonometrie.

import { fois, moins, norme, plus, quart, scalaire, unitaire, vectoriel, type Pt } from './vecteurs.js';

/** Un segment d'un sous-chemin : une droite (c1 = a, c2 = b) ou une cubique. */
export interface Seg {
  readonly droit: boolean;
  readonly a: Pt;
  readonly c1: Pt;
  readonly c2: Pt;
  readonly b: Pt;
}

export function evaluer(s: Seg, u: number): Pt {
  if (s.droit) return plus(s.a, fois(moins(s.b, s.a), u));
  const v = 1 - u, k0 = v * v * v, k1 = 3 * u * v * v, k2 = 3 * u * u * v, k3 = u * u * u;
  return [k0 * s.a[0] + k1 * s.c1[0] + k2 * s.c2[0] + k3 * s.b[0], k0 * s.a[1] + k1 * s.c1[1] + k2 * s.c2[1] + k3 * s.b[1]];
}

/** La derivee en u (non normalisee). */
export function deriver(s: Seg, u: number): Pt {
  if (s.droit) return moins(s.b, s.a);
  const v = 1 - u;
  return plus(plus(fois(moins(s.c1, s.a), 3 * v * v), fois(moins(s.c2, s.c1), 6 * v * u)), fois(moins(s.b, s.c2), 3 * u * u));
}

/** La tangente unitaire en u ; la ou la derivee s'annule (poignee rentree), on la prend un peu plus loin sur la courbe. */
export function tangente(s: Seg, u: number): Pt {
  for (const decalage of [0, 1e-4, 1e-2, 0.1]) {
    const w = u < 0.5 ? u + decalage : u - decalage;
    const d = deriver(s, Math.max(0, Math.min(1, w)));
    if (norme(d) > 1e-12) return unitaire(d);
  }
  return unitaire(moins(s.b, s.a));
}

/** Le segment coupe en u : sa part avant et sa part apres (de Casteljau). */
export function couper(s: Seg, u: number): [Seg, Seg] {
  const m = evaluer(s, u);
  if (s.droit) return [{ ...s, b: m, c2: m }, { ...s, a: m, c1: m }];
  const lerp = (p: Pt, q: Pt): Pt => plus(p, fois(moins(q, p), u));
  const ab = lerp(s.a, s.c1), bc = lerp(s.c1, s.c2), cd = lerp(s.c2, s.b), abc = lerp(ab, bc), bcd = lerp(bc, cd);
  return [{ droit: false, a: s.a, c1: ab, c2: abc, b: m }, { droit: false, a: m, c1: bcd, c2: cd, b: s.b }];
}

/** La partie du segment entre les parametres `de` et `a` (0 <= de < a <= 1). */
export function tranche(s: Seg, de: number, a: number): Seg {
  const [avant] = a < 1 ? couper(s, a) : [s];
  if (de <= 0) return avant;
  const [, apres] = couper(avant, de / (a < 1 ? a : 1));
  return apres;
}

/** Ce qu'une solution de filet donne : les parametres de tangence, leurs points et tangentes, le centre et le rayon. */
export interface Filet {
  readonly rayon: number;
  /** Le parametre de tangence sur le segment entrant (< 1) et sur le sortant (> 0). */
  readonly a: number;
  readonly b: number;
  readonly p1: Pt;
  readonly p2: Pt;
  readonly t1: Pt;
  readonly t2: Pt;
  readonly centre: Pt;
  /** Le sens du virage : +1 si le trace tourne vers sa gauche (quart de tour positif), -1 sinon. */
  readonly sens: 1 | -1;
}

/** Les parts maximales de chaque segment qu'un filet peut consommer. */
export interface Budget { readonly entrant: number; readonly sortant: number }

const SIN_LISSE = 1e-3;

/** Le virage entre deux tangentes : null si le trace continue (lisse) ou fait demi-tour (pas de filet possible). */
export function virage(t1: Pt, t2: Pt): { sens: 1 | -1; sinus: number; cosinus: number } | null {
  const c = vectoriel(t1, t2), pd = scalaire(t1, t2);
  if (pd > 0 && Math.abs(c) <= SIN_LISSE) return null;
  if (pd < -1 + 1e-6) return null;
  return { sens: c >= 0 ? 1 : -1, sinus: Math.abs(c), cosinus: pd };
}

/** Deux droites : le filet de rayon `r`, ramene a ce que le budget permet. Rend le rayon retenu. */
function filetDroit(s: Seg, t: Seg, r: number, budget: Budget): Filet | null {
  const t1 = tangente(s, 1), t2 = tangente(t, 0), v = virage(t1, t2);
  if (!v) return null;
  const tan = v.sinus / (1 + v.cosinus);
  const ls = norme(moins(s.b, s.a)), lt = norme(moins(t.b, t.a));
  const rayon = Math.min(r, (budget.entrant * ls) / tan, (budget.sortant * lt) / tan);
  if (!(rayon > 0)) return null;
  const longueur = rayon * tan, p = s.b;
  const p1 = moins(p, fois(t1, longueur)), p2 = plus(p, fois(t2, longueur));
  const centre = plus(p1, fois(quart(t1), v.sens * rayon));
  return { rayon, a: 1 - longueur / ls, b: longueur / lt, p1, p2, t1, t2, centre, sens: v.sens };
}

const H = 1e-6;
const ITERATIONS = 40;

/** Le centre du cercle de rayon r tangent a `s` au parametre u, du cote du virage. */
const centreSur = (s: Seg, u: number, r: number, sens: number): Pt => plus(evaluer(s, u), fois(quart(tangente(s, u)), sens * r));

/** Un filet de rayon exactement `r` entre deux segments dont l'un au moins est courbe, ou null s'il ne tient pas dans le budget. */
function filetCourbe(s: Seg, t: Seg, r: number, budget: Budget): Filet | null {
  const t1 = tangente(s, 1), t2 = tangente(t, 0), v = virage(t1, t2);
  if (!v) return null;
  const sens = v.sens;
  const vitesseS = Math.max(norme(deriver(s, 1)), 1e-9), vitesseT = Math.max(norme(deriver(t, 0)), 1e-9);
  const depart = (r * v.sinus) / (1 + v.cosinus);
  const minA = 1 - budget.entrant, maxB = budget.sortant;
  let a = Math.max(minA, 1 - depart / vitesseS), b = Math.min(maxB, depart / vitesseT);
  const ecart = (x: number, y: number): Pt => moins(centreSur(s, x, r, sens), centreSur(t, y, r, sens));
  let e = ecart(a, b);
  for (let i = 0; i < ITERATIONS && norme(e) > 1e-10 * Math.max(1, r); i++) {
    const da = moins(ecart(Math.min(1, a + H), b), ecart(Math.max(minA, a - H), b)), db = moins(ecart(a, Math.min(maxB, b + H)), ecart(a, Math.max(0, b - H)));
    const pa = (Math.min(1, a + H) - Math.max(minA, a - H)), pb = (Math.min(maxB, b + H) - Math.max(0, b - H));
    const ja = fois(da, 1 / pa), jb = fois(db, 1 / pb), det = vectoriel(ja, jb);
    if (Math.abs(det) < 1e-14) return null;
    // Resolution de [ja jb] (da, db) = -e.
    const dA = -vectoriel(e, jb) / det, dB = -vectoriel(ja, e) / det;
    a = Math.max(minA, Math.min(1, a + dA));
    b = Math.max(0, Math.min(maxB, b + dB));
    e = ecart(a, b);
  }
  if (norme(e) > 1e-7 * Math.max(1, r) || !(a < 1 - 1e-9) || !(b > 1e-9)) return null;
  const p1 = evaluer(s, a), p2 = evaluer(t, b), ta = tangente(s, a), tb = tangente(t, b);
  // Le filet tourne dans le meme sens que l'angle, de moins d'un demi-tour.
  if (vectoriel(ta, tb) * sens <= 0 || scalaire(ta, tb) < -1 + 1e-6) return null;
  return { rayon: r, a, b, p1, p2, t1: ta, t2: tb, centre: centreSur(s, a, r, sens), sens };
}

const BISSECTIONS = 18;

/**
 * Le filet de rayon `r` entre le segment entrant et le sortant, ramene au plus grand rayon que le budget
 * permet : droites, formule ; courbes, bissection sur le rayon. Null quand le coin ne se laisse pas
 * arrondir (trace continu, demi-tour, ou rayon admissible negligeable).
 */
export function filetEntre(s: Seg, t: Seg, r: number, budget: Budget): Filet | null {
  if (s.droit && t.droit) return filetDroit(s, t, r, budget);
  const plein = filetCourbe(s, t, r, budget);
  if (plein) return plein;
  let bas = 0, haut = r, meilleur: Filet | null = null;
  for (let i = 0; i < BISSECTIONS; i++) {
    const m = (bas + haut) / 2, f = filetCourbe(s, t, m, budget);
    if (f) { bas = m; meilleur = f; } else haut = m;
  }
  return meilleur && meilleur.rayon > r * 1e-3 ? meilleur : null;
}
