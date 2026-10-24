// Ce que le panneau de production montre en permanence : les couches (une couleur de remplissage, un tapis)
// et l'etendue du dessin visible, trait compris. Pur.

import { boiteAvecTrait, unir, type Boite, type DessinSvg, type Forme } from '../editionSvg.js';

/** Une couche de decoupe : une couleur de remplissage, et les formes visibles qui la portent. */
export interface Couche { readonly couleur: string; readonly ids: readonly string[] }

/** Les formes qui comptent pour la production : visibles, et peintes (un fond, ou un trait d'epaisseur visible). */
export const formesPeintes = (dessin: DessinSvg): Forme[] => dessin.formes.filter(f => f.visible && (f.remplissage !== null || (f.contour !== null && f.epaisseur > 0)));

/**
 * Les couches du dessin, dans l'ordre de leur premiere apparition (du bas vers le haut) : une par couleur de
 * remplissage, la casse ignoree. Un trait n'en fait pas une : il n'est pas decoupe tel quel (voir le constat).
 */
export function couchesDe(dessin: DessinSvg): Couche[] {
  const parCouleur = new Map<string, string[]>();
  for (const f of dessin.formes) {
    if (!f.visible || f.remplissage === null) continue;
    const c = f.remplissage.toLowerCase();
    const l = parCouleur.get(c);
    if (l) l.push(f.id); else parCouleur.set(c, [f.id]);
  }
  return [...parCouleur].map(([couleur, ids]) => ({ couleur, ids }));
}

/** L'etendue des formes peintes, trait compris : la taille finale du dessin ; null s'il n'y a rien a voir. */
export function etendueVisible(dessin: DessinSvg): Boite | null {
  return unir(formesPeintes(dessin).map(boiteAvecTrait));
}

/** Vrai si une boite tient dans une zone, telle quelle (`tourner` faux) ou couchee d'un quart de tour. */
export function tientDans(l: number, h: number, zl: number, zh: number, tourner: boolean): boolean {
  const marge = 1e-6 * Math.max(zl, zh);
  return (l <= zl + marge && h <= zh + marge) || (tourner && l <= zh + marge && h <= zl + marge);
}
