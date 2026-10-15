// Les operations booleennes entre formes (ADR-0004) : union, soustraction, intersection,
// exclusion. Les courbes sont aplaties en segments fins, les polygones passent par un moteur de
// decoupe (polygon-clipping, algorithme de Martinez, pur et deterministe), et le resultat est une
// forme en segments droits, les trous en anneaux interieurs. Le remplissage d'une forme se lit comme
// un navigateur le peint : pair-impair, ou selon le sens du trace.

import clipping, { type MultiPolygon, type Pair, type Polygon, type Ring } from 'polygon-clipping';
import { ancre, depart, prochainId, type Chemin, type Commande, type DessinSvg, type Forme } from './editionSvg.js';

export type Booleen = 'union' | 'soustraction' | 'intersection' | 'exclusion';
export const BOOLEENS: readonly Booleen[] = ['union', 'soustraction', 'intersection', 'exclusion'];

const cubique = (a: number, b: number, c: number, d: number, t: number) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d;
const quadratique = (a: number, b: number, c: number, t: number) => (1 - t) ** 2 * a + 2 * (1 - t) * t * b + t * t * c;

/** Le nombre de segments pour une courbe : sa longueur de controle, divisee par la tolerance, 64 au plus. */
const segments = (longueur: number, tolerance: number) => Math.max(2, Math.min(64, Math.ceil(longueur / Math.max(tolerance, 1e-9) / 4)));

/** Les anneaux d'un chemin, aplatis a `tolerance` pres : un anneau par sous-chemin, fermes. */
export function aplatir(d: Chemin, tolerance: number): Ring[] {
  const anneaux: Ring[] = [];
  let courant: Ring = [];
  const pousser = (x: number, y: number) => { courant.push([x, y]); };
  const clore = () => { if (courant.length >= 3) anneaux.push(courant); courant = []; };
  d.forEach((c, i) => {
    if (c.c === 'M') { clore(); pousser(c.p[0] ?? 0, c.p[1] ?? 0); return; }
    if (c.c === 'Z') { clore(); const debut = anneaux[anneaux.length - 1]?.[0]; if (debut && d[i + 1] && d[i + 1]?.c !== 'M') pousser(debut[0], debut[1]); return; }
    if (c.c === 'L') { pousser(c.p[0] ?? 0, c.p[1] ?? 0); return; }
    const [x0, y0] = depart(d, i), p = c.p;
    if (c.c === 'C') {
      const [x1, y1, x2, y2, x3, y3] = [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 0, p[4] ?? 0, p[5] ?? 0];
      const n = segments(Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2), tolerance);
      for (let k = 1; k <= n; k++) pousser(cubique(x0, x1, x2, x3, k / n), cubique(y0, y1, y2, y3, k / n));
    } else {
      const [x1, y1, x2, y2] = [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 0];
      const n = segments(Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1), tolerance);
      for (let k = 1; k <= n; k++) pousser(quadratique(x0, x1, x2, k / n), quadratique(y0, y1, y2, k / n));
    }
  });
  clore();
  return anneaux;
}

/** L'aire signee d'un anneau : positive dans le sens horaire a l'ecran (y vers le bas). */
export function aireSignee(r: Ring): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i] ?? [0, 0], q = r[(i + 1) % r.length] ?? [0, 0];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

const vide: MultiPolygon = [];
const unirTous = (polys: Polygon[]): MultiPolygon => (polys.length ? clipping.union(polys[0] ?? [], ...polys.slice(1)) : vide);

/**
 * La region peinte d'une forme, en multipolygone. Pair-impair : l'exclusion de ses anneaux. Selon le
 * sens du trace : l'union des anneaux d'un sens, moins celle des anneaux de l'autre sens, ce qui
 * creuse un trou dessine a contresens et garde pleins deux anneaux emboites de meme sens.
 */
export function regionDeForme(f: Forme, tolerance: number): MultiPolygon {
  const anneaux = aplatir(f.d, tolerance).filter(r => Math.abs(aireSignee(r)) > 1e-12);
  if (!anneaux.length) return vide;
  if (f.regle === 'evenodd') return anneaux.length === 1 ? [[anneaux[0] ?? []]] : clipping.xor([anneaux[0] ?? []], ...anneaux.slice(1).map(r => [r]));
  const horaires = anneaux.filter(r => aireSignee(r) > 0).map(r => [r]), autres = anneaux.filter(r => aireSignee(r) < 0).map(r => [r]);
  if (!horaires.length || !autres.length) return unirTous(horaires.length ? horaires : autres);
  const a = unirTous(horaires), b = unirTous(autres);
  return clipping.xor(a, b);
}

/** Le chemin d'un multipolygone : chaque anneau ferme, en segments droits. */
export function cheminDeRegion(region: MultiPolygon, precision = 3): Commande[] {
  const out: Commande[] = [];
  const arrondi = (v: number) => Number(v.toFixed(precision));
  for (const poly of region) for (const anneau of poly) {
    const pts: Pair[] = anneau.length > 1 && anneau[0]?.[0] === anneau[anneau.length - 1]?.[0] && anneau[0]?.[1] === anneau[anneau.length - 1]?.[1] ? anneau.slice(0, -1) : anneau;
    if (pts.length < 3) continue;
    pts.forEach((p, i) => out.push({ c: i ? 'L' : 'M', p: [arrondi(p[0]), arrondi(p[1])] }));
    out.push({ c: 'Z', p: [] });
  }
  return out;
}

/** Vrai si la forme a une aire : une ligne nue (contour seul) ne se combine pas. */
const pleine = (f: Forme) => f.remplissage !== null;

/**
 * Applique l'operation aux formes choisies, dans l'ordre de l'empilement : pour la soustraction, la
 * plus basse moins toutes les autres. Le resultat prend le style et la place de la plus basse ; les
 * autres disparaissent. Rend le dessin inchange, avec sa raison, si l'operation ne s'applique pas.
 */
export function appliquerBooleen(dessin: DessinSvg, ids: readonly string[], op: Booleen, tolerance = Math.max(dessin.vb[2], dessin.vb[3]) / 2000): { dessin: DessinSvg; id: string | null; erreur?: string } {
  const voulus = new Set(ids);
  const choisies = dessin.formes.filter(f => voulus.has(f.id) && !f.verrouille && f.visible);
  if (choisies.length < 2) return { dessin, id: null, erreur: 'Choisissez au moins deux formes visibles et déverrouillées.' };
  if (!choisies.every(pleine)) return { dessin, id: null, erreur: 'Une forme sans remplissage n’a pas d’aire : donnez-lui une couleur, ou retirez-la de la sélection.' };
  const regions = choisies.map(f => regionDeForme(f, tolerance));
  const [premiere, ...autres] = regions;
  if (!premiere) return { dessin, id: null };
  let resultat: MultiPolygon;
  if (op === 'union') resultat = clipping.union(premiere, ...autres);
  else if (op === 'intersection') resultat = clipping.intersection(premiere, ...autres);
  else if (op === 'soustraction') resultat = clipping.difference(premiere, ...autres);
  else resultat = clipping.xor(premiere, ...autres);
  const d = cheminDeRegion(resultat);
  const basse = choisies[0];
  if (!basse) return { dessin, id: null };
  if (!d.length) {
    // Rien ne reste : la forme la plus basse disparait avec les autres, comme dans un logiciel de dessin.
    return { dessin: { ...dessin, formes: dessin.formes.filter(f => !voulus.has(f.id) || f.verrouille || !f.visible) }, id: null };
  }
  const forme: Forme = { ...basse, id: 'f' + prochainId(dessin), d, regle: 'nonzero' };
  const formes = dessin.formes.flatMap(f => (f === basse ? [forme] : voulus.has(f.id) && !f.verrouille && f.visible ? [] : [f]));
  return { dessin: { ...dessin, formes }, id: forme.id };
}

/** Le dernier point d'un chemin, pour les tests et l'affichage. */
export const dernierPoint = (d: Chemin): [number, number] | null => { for (let i = d.length - 1; i >= 0; i--) { const a = ancre(d[i] ?? { c: 'Z', p: [] }); if (a) return a; } return null; };
