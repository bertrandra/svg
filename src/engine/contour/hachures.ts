// Les hachures (ADR-0022) : remplir une forme de lignes paralleles, pour un stylo qui ne sait pas remplir. Les lignes sont
// espacees de la largeur du stylo (elles se touchent bord a bord : la forme parait pleine), a l'angle voulu, et restent DANS
// la forme : la region peinte (sa regle, trous compris) est celle des booleens, et chaque ligne de balayage n'en garde que
// les intervalles interieurs. Les lignes vont et viennent (en boustrophedon) pour que la pointe voyage le moins possible.
// Pur et deterministe ; un angle multiple de 45 degres se calcule sans trigonometrie (ADR-0015, « Deterministe »).

import type { MultiPolygon } from 'polygon-clipping';
import type { Chemin, Commande, DessinSvg, Forme } from '../editionSvg.js';
import { regionDeForme, toleranceBooleen } from '../booleens.js';
import { nombre } from '../../util/i18n.js';

export interface OptionsHachures {
  /** L'ecart entre deux lignes, d'axe en axe, en unites du plan : la largeur du stylo. */
  readonly ecart: number;
  /** L'angle des lignes, en degres, dans le sens horaire a l'ecran ; 45 par defaut. */
  readonly angle?: number;
  readonly tolerance?: number;
}

/** Au-dela, une forme demanderait trop de lignes pour un stylo (une forme immense, ou un ecart minuscule) : refusee, nommee. */
export const LIGNES_MAX = 20_000;

/** Le cosinus et le sinus d'un angle : exacts pour les multiples de 45 degres, qui sont les angles proposes. */
function direction(degres: number): readonly [number, number] {
  const a = ((degres % 360) + 360) % 360, s2 = Math.SQRT1_2;
  const exacts: Readonly<Record<number, readonly [number, number]>> = { 0: [1, 0], 45: [s2, s2], 90: [0, 1], 135: [-s2, s2], 180: [-1, 0], 225: [-s2, -s2], 270: [0, -1], 315: [s2, -s2] };
  return exacts[a] ?? [Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180)];
}

const arrondi = (v: number): number => { const r = Number(v.toFixed(3)); return Object.is(r, -0) ? 0 : r; };

/**
 * Les lignes de hachure d'une region : dans le repere tourne de -angle, des horizontales espacees de `ecart`, la premiere a
 * un demi-ecart du bord (les lignes se touchent bord a bord, sans deborder d'un demi-trait au-dela du pourtour), coupees
 * par la regle pair-impair sur les anneaux (ceux d'une region peinte ne se croisent pas : exterieurs et trous alternent).
 */
export function lignesDeHachure(region: MultiPolygon, o: OptionsHachures): Array<readonly [readonly [number, number], readonly [number, number]]> | { erreur: string } {
  const [c, s] = direction(o.angle ?? 45);
  // Le repere tourne : u le long des lignes, v en travers. Un point (x, y) y vaut (x c + y s, -x s + y c).
  const anneaux = region.flatMap(poly => poly.map(r => r.map(([x, y]) => [x * c + y * s, -x * s + y * c] as const)));
  const vs = anneaux.flatMap(r => r.map(p => p[1]));
  if (!vs.length || !(o.ecart > 0)) return [];
  const vMin = Math.min(...vs), vMax = Math.max(...vs);
  const n = Math.floor((vMax - vMin) / o.ecart + 0.5);
  if (n > LIGNES_MAX) return { erreur: 'Ces hachures demanderaient plus de ' + nombre(LIGNES_MAX) + ' lignes : élargissez l’écart, ou réduisez la forme.' };
  const lignes: Array<readonly [readonly [number, number], readonly [number, number]]> = [];
  for (let k = 0; k < n; k++) {
    const v = vMin + o.ecart / 2 + k * o.ecart;
    const xs: number[] = [];
    for (const r of anneaux) for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      // Demi-ouvert en v : un sommet pile sur la ligne ne compte qu'une fois.
      if (a && b && (a[1] > v) !== (b[1] > v)) xs.push(a[0] + ((v - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    }
    xs.sort((p, q) => p - q);
    const segments: Array<readonly [number, number]> = [];
    for (let i = 0; i + 1 < xs.length; i += 2) { const u0 = xs[i] ?? 0, u1 = xs[i + 1] ?? 0; if (u1 - u0 > 1e-9) segments.push([u0, u1]); }
    // Une ligne sur deux se parcourt a l'envers : la pointe repart d'ou elle s'est arretee.
    if (k % 2 === 1) segments.reverse();
    for (const [u0, u1] of segments) {
      const [ua, ub] = k % 2 === 1 ? [u1, u0] : [u0, u1];
      lignes.push([[ua * c - v * s, ua * s + v * c], [ub * c - v * s, ub * s + v * c]]);
    }
  }
  return lignes;
}

/** Le chemin des hachures d'une forme : un sous-chemin ouvert (M, L) par ligne, au millieme. */
export function hachuresDeForme(f: Forme, o: OptionsHachures): { d: Commande[]; lignes: number } | { erreur: string } {
  const r = lignesDeHachure(regionDeForme(f, o.tolerance ?? 0.01), o);
  if ('erreur' in r) return r;
  const d: Commande[] = r.flatMap(([a, b]) => [{ c: 'M' as const, p: [arrondi(a[0]), arrondi(a[1])] }, { c: 'L' as const, p: [arrondi(b[0]), arrondi(b[1])] }]);
  return { d, lignes: r.length };
}

export interface ResultatHachures {
  readonly dessin: DessinSvg;
  readonly ids: string[];
  readonly hachurees: number;
  readonly erreur?: string;
}

/**
 * Hachure les formes pleines choisies, pour le stylo : chacune devient son pourtour et ses hachures, en un seul trace de
 * la couleur de son fond, sans fond, a l'epaisseur du stylo. Une forme sans fond, masquee ou verrouillee ne bouge pas.
 * Le meme dessin quand rien n'est hachure.
 */
export function hachurerFormes(dessin: DessinSvg, ids: readonly string[], largeur: number, angle = 45): ResultatHachures {
  const voulus = new Set(ids), tolerance = toleranceBooleen(dessin);
  let hachurees = 0, erreur: string | undefined;
  const produits: string[] = [];
  const formes = dessin.formes.map(f => {
    if (!voulus.has(f.id) || f.remplissage === null || !f.visible || f.verrouille) return f;
    const h = hachuresDeForme(f, { ecart: largeur, angle, tolerance });
    if ('erreur' in h) { erreur ??= h.erreur; return f; }
    hachurees++;
    const { texte: _texte, opaciteRemplissage: _o, ...reste } = f;
    void _texte; void _o;
    produits.push(f.id);
    const pourtour: Chemin = f.d;
    return { ...reste, d: [...pourtour, ...h.d], remplissage: null, contour: f.remplissage, epaisseur: largeur, bout: 'round' as const };
  });
  if (!hachurees) return { dessin, ids: [], hachurees, ...(erreur ? { erreur } : {}) };
  return { dessin: { ...dessin, formes }, ids: produits, hachurees };
}
