// Les tailles physiques d'un export : une unite (mm, pouce, px), une largeur voulue pour le dessin, et ce
// qu'il en coute en facteur d'echelle pour chaque format. Pur. Un « px » est celui du CSS : 96 au pouce,
// parce que c'est ce que veut dire une longueur sans unite dans un SVG.

import type { DessinSvg } from '../engine/editionSvg.js';

export type Unite = 'mm' | 'in' | 'px';
export const UNITES: readonly Unite[] = ['mm', 'in', 'px'];

export const PX_PAR_POUCE = 96;
export const MM_PAR_POUCE = 25.4;
export const PT_PAR_POUCE = 72;

/** La largeur voulue du dessin, dans une unite ; la hauteur suit les proportions du plan. */
export interface Taille { readonly largeur: number; readonly unite: Unite }

/** Une longueur dans `unite`, en pouces. */
export function enPouces(valeur: number, unite: Unite): number {
  return unite === 'in' ? valeur : unite === 'mm' ? valeur / MM_PAR_POUCE : valeur / PX_PAR_POUCE;
}

/** Une longueur en pouces, dans `unite`. */
export function depuisPouces(pouces: number, unite: Unite): number {
  return unite === 'in' ? pouces : unite === 'mm' ? pouces * MM_PAR_POUCE : pouces * PX_PAR_POUCE;
}

/** Une taille utilisable : finie et strictement positive ; sinon null, jamais une valeur devinee. */
export function tailleValide(t: Taille | null | undefined): Taille | null {
  return t && Number.isFinite(t.largeur) && t.largeur > 0 && t.largeur <= 1e6 ? t : null;
}

/**
 * Les pouces que vaut une unite du plan : la taille voulue repartie sur la largeur du plan, ou 1/96 (un px
 * CSS) sans taille. C'est le facteur de base de tous les formats ; chacun le convertit dans sa propre unite.
 */
export function poucesParUnite(vb: DessinSvg['vb'], taille: Taille | null | undefined): number {
  const t = tailleValide(taille), l = vb[2];
  return t && l > 0 ? enPouces(t.largeur, t.unite) / l : 1 / PX_PAR_POUCE;
}

/** La hauteur correspondante a une largeur voulue, dans la meme unite (proportions du plan). */
export function hauteurPour(vb: DessinSvg['vb'], taille: Taille): number {
  return vb[2] > 0 ? (taille.largeur * vb[3]) / vb[2] : 0;
}

/** La largeur en pixels d'un raster qui fait `taille` a `dpi` points par pouce. */
export function largeurPixels(taille: Taille, dpi: number): number {
  return Math.max(1, Math.round(enPouces(taille.largeur, taille.unite) * dpi));
}
