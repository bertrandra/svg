// Un texte pose sur ou dans une forme (ADR-0031), tel que la composition le rend : ses lettres dans le plan, et, pour la saisie sur la
// toile (ADR-0027), le curseur devant chacun de ses caracteres, deja pose dans le plan (un trait du bas au haut du cadratin, tourne
// avec la lettre). Les fonctions du curseur d'un texte libre (curseur.ts) lisent une ligne droite ; celles-ci lisent ces traits :
// l'index sous un point, la fleche vers le haut ou le bas, les quadrilateres d'une selection, la boite du texte. Pur.

import type { Lettre } from '../texte.js';
import { au } from '../../util/tableaux.js';
import type { Pt } from './trace.js';

/** Le curseur devant un caractere : son pied (un peu sous la ligne de base) et sa tete (le haut du cadratin), dans le plan. */
export type Caret = readonly [Pt, Pt];

export interface Pose {
  /** Les lettres posees, dans le plan ; celles qui depassent le trace ou ne tiennent pas dans la forme n'y sont pas. */
  readonly lettres: readonly Lettre[];
  /** Le curseur devant chaque index du texte (unites UTF-16, comme `selectionStart`), de 0 a sa longueur comprise. */
  readonly carets: readonly Caret[];
  /** La ligne de chaque curseur (toujours 0 sur un trace). */
  readonly lignes: readonly number[];
  /** La taille des lettres dans le plan. */
  readonly taille: number;
  /** Le debut du texte pose : sa premiere ligne de base, la ou il commence (l'ancrage de sa matrice). */
  readonly ancre: Pt;
  /** Combien de lettres depassent le trace (sur une forme) ; 0 sinon. */
  readonly depasse: number;
  /** Combien de mots ne tiennent pas dans la forme (dans une forme) ; 0 sinon. */
  readonly nonPlaces: number;
}

/** L'index UTF-16 de chaque point de code d'une chaine, et sa longueur en unites a la fin. */
export function unitesDe(texte: string): number[] {
  const r: number[] = [];
  let u = 0;
  for (const c of texte) { r.push(u); u += c.length; }
  r.push(u);
  return r;
}

const distance2Segment = (p: Pt, a: Pt, b: Pt): number => {
  const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy;
  const u = l2 > 0 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2)) : 0;
  const dx = p[0] - a[0] - vx * u, dy = p[1] - a[1] - vy * u;
  return dx * dx + dy * dy;
};

/** L'index dont le curseur est le plus proche du point (a egalite, le premier). */
export function indexAuPointPose(p: Pose, q: Pt): number {
  let meilleur = 0, ecart = Infinity;
  p.carets.forEach((c, i) => { const e = distance2Segment(q, c[0], c[1]); if (e < ecart) { ecart = e; meilleur = i; } });
  return meilleur;
}

const milieu = (c: Caret): Pt => [(c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2];

/**
 * Ou mene une fleche vers le haut (-1) ou le bas (1) : le curseur de la ligne voisine le plus proche du point voulu (celui du
 * curseur, ou celui qu'on gardait d'une fleche a l'autre). Au-dela de la premiere ligne, le debut ; de la derniere, la fin.
 */
export function indexVerticalPose(p: Pose, i: number, sens: -1 | 1, vise: Pt = milieu(au(p.carets, Math.min(i, p.carets.length - 1)))): number {
  const k = (p.lignes[i] ?? 0) + sens;
  let meilleur = -1, ecart = Infinity;
  p.carets.forEach((c, j) => {
    if (p.lignes[j] !== k) return;
    const m = milieu(c), e = Math.abs(m[0] - vise[0]);
    if (e < ecart) { ecart = e; meilleur = j; }
  });
  if (meilleur >= 0) return meilleur;
  return sens < 0 ? 0 : p.carets.length - 1;
}

/** Les quadrilateres d'une selection : un par caractere choisi, du curseur devant lui au suivant, sur la meme ligne. */
export function selectionPose(p: Pose, a: number, b: number): Pt[][] {
  const r: Pt[][] = [];
  for (let i = Math.min(a, b); i < Math.max(a, b); i++) {
    const c = p.carets[i], d = p.carets[i + 1];
    if (!c || !d || p.lignes[i] !== p.lignes[i + 1]) continue;
    r.push([c[0], c[1], d[1], d[0]]);
  }
  return r;
}

/** La boite des curseurs, dans le plan (le cadre de la saisie) ; une marge en part de la taille. */
export function boitePose(p: Pose, marge = 0): { x: number; y: number; l: number; h: number } {
  const xs = p.carets.flatMap(c => [c[0][0], c[1][0]]), ys = p.carets.flatMap(c => [c[0][1], c[1][1]]);
  const e = marge * p.taille, x = Math.min(...xs) - e, y = Math.min(...ys) - e;
  return { x, y, l: Math.max(...xs) + e - x, h: Math.max(...ys) + e - y };
}

/** Vrai si le point tombe pres du texte : a moins d'une demi-taille de l'un de ses curseurs. */
export function presDuTexte(p: Pose, q: Pt): boolean {
  const r2 = (0.6 * p.taille) * (0.6 * p.taille);
  return p.carets.some(c => distance2Segment(q, c[0], c[1]) <= r2);
}
