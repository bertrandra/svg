// La grille magnetique : un pas lisible pour le plan de travail, et l'aimantation d'une valeur sur elle.

import type { DessinSvg } from './types.js';

/** Le pas d'une grille lisible sur ce plan : 1, 2 ou 5 fois une puissance de dix, vingt pas environ. */
export function pasGrille(vb: DessinSvg['vb']): number {
  const brut = Math.max(vb[2], vb[3]) / 20;
  if (!(brut > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(brut)), r = brut / p;
  return (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * p;
}

/** La valeur la plus proche sur la grille de pas `pas`, a partir de l'origine `o`. */
export const aimanter = (v: number, pas: number, o = 0): number => (pas > 0 ? o + Math.round((v - o) / pas) * pas : v);
