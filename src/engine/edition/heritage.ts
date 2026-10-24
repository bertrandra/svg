// L'heritage CSS d'un element vers ses enfants et la peinture d'une forme : ce qui se transmet, ce qui se
// refuse (masque, decoupe, filtre), les opacites et l'epaisseur d'un trait. Pur.

import type { Forme } from './types.js';
import { lirePeintureAlpha, type PeintureLue } from './peinture.js';
import { arrondirOpacite, lireOpacite } from './opacites.js';
import type { Proprietes } from './ignores.js';

// Les proprietes que CSS transmet d'un element a ses enfants (`opacity`, `display`, le masque ne le sont pas).
const HERITEES = [
  'color', 'fill', 'stroke', 'stroke-width', 'fill-rule', 'visibility', 'fill-opacity', 'stroke-opacity',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'marker-start', 'marker-mid', 'marker-end', 'marker'
];

/**
 * Une epaisseur de trait. Zero est une epaisseur (un trait invisible, a garder tel quel), pas une
 * valeur absente ; une valeur absente, illisible ou negative est ignoree par un navigateur : 1.
 */
export function lireEpaisseur(v: string | undefined): number {
  const x = Number.parseFloat(v ?? '');
  return Number.isFinite(x) && x >= 0 ? x : 1;
}

export const peinture = (p: string | undefined, defaut: string | null, courante: PeintureLue): PeintureLue => (p === undefined ? { couleur: defaut, alpha: 1 } : lirePeintureAlpha(p, courante));

/**
 * Les proprietes que les enfants d'un element recoivent : celles de ses parents, recouvertes par les siennes.
 * `inherit` ne recouvre rien (c'est le parent). `color: currentColor` non plus (la couleur du parent) ;
 * `color: none` n'est pas une couleur, un navigateur l'ecarte.
 */
export function heriter(parent: Proprietes, pr: Proprietes): Proprietes {
  const heritees: Proprietes = { ...parent };
  for (const p of HERITEES) {
    const v = pr[p];
    if (v === undefined || v.trim().toLowerCase() === 'inherit') continue;
    if (p === 'color' && ['currentcolor', 'none'].includes(v.trim().toLowerCase())) continue;
    heritees[p] = v;
  }
  return heritees;
}

/** Ce qui change le rendu au point de ne pas s'editer (masque, decoupe, filtre) sur un element, ou null. */
export function refusDe(pr: Proprietes): string | null {
  if ((pr['clip-path'] && pr['clip-path'] !== 'none') || (pr.mask && pr.mask !== 'none')) return 'un masque ou une découpe';
  if (pr.filter && pr.filter !== 'none') return 'un filtre';
  return null;
}

/**
 * Les opacites d'une forme. `opacite` est celle des groupes et de la forme (`opacity`) ; l'alpha de la
 * couleur et `fill-opacity` / `stroke-opacity` vont au remplissage et au contour. Sans contour, forme
 * entiere et remplissage ne font qu'un (rien ne se voit a travers un trait absent) : tout se range
 * dans `opacite`, ce qui garde le SVG ecrit d'avant et le rend stable a la relecture. Avec un contour,
 * fond et trait gardent chacun la leur : un fond a demi transparent n'estompe pas son trait.
 */
export function lireOpacites(opacite: number, h: Proprietes, fond: PeintureLue, trait: PeintureLue): Pick<Forme, 'opacite' | 'opaciteRemplissage' | 'opaciteContour'> {
  const fo = lireOpacite(h['fill-opacity']);
  if (trait.couleur === null) return { opacite: arrondirOpacite(opacite * fo * fond.alpha) };
  const remplissage = arrondirOpacite(fond.alpha * fo);
  const contour = arrondirOpacite(trait.alpha * lireOpacite(h['stroke-opacity']));
  return {
    opacite: arrondirOpacite(opacite),
    ...(fond.couleur !== null && remplissage < 1 ? { opaciteRemplissage: remplissage } : {}),
    ...(contour < 1 ? { opaciteContour: contour } : {})
  };
}

