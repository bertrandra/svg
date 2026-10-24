// Les opacites d'une forme : celle de la forme entiere (`opacite`), et celles, facultatives, de son
// remplissage et de son contour. Un seul endroit pour dire « absente = 1 » et pour lire une valeur
// d'opacite telle que CSS l'ecrit, sans quoi chaque module la relirait a sa facon.

import type { Forme } from './types.js';

const borner = (v: number) => Math.max(0, Math.min(1, v));

/** Arrondie au millieme, comme l'opacite ecrite : deux lectures du meme SVG donnent la meme valeur. */
export const arrondirOpacite = (v: number): number => Math.round(borner(v) * 1000) / 1000;

/** L'opacite du remplissage seul, 1 quand la forme n'en porte pas. */
export const opaciteDuRemplissage = (f: Pick<Forme, 'opaciteRemplissage'>): number => f.opaciteRemplissage ?? 1;

/** L'opacite du contour seul, 1 quand la forme n'en porte pas. */
export const opaciteDuContour = (f: Pick<Forme, 'opaciteContour'>): number => f.opaciteContour ?? 1;

/**
 * Une valeur d'opacite CSS : un nombre ou un pourcentage, ramene dans [0, 1]. Une valeur qui ne se
 * lit pas est ignoree par un navigateur (l'opacite reste pleine), pas prise pour 0.
 */
export function lireOpacite(v: string | undefined): number {
  if (v === undefined) return 1;
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%?)\s*$/i.exec(v);
  if (!m) return 1;
  const n = Number(m[1]);
  return Number.isFinite(n) ? borner(m[2] ? n / 100 : n) : 1;
}
