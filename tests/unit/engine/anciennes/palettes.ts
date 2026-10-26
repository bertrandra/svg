// Les corps d'avant l'etape 13d (ADR-0012, annexe 7 §3, « loi du dessin plat ») des palettes : deux passes de `remplacerCouleur`
// par des jetons intermediaires pour `appliquerPalette`, une passe par couleur pour `uneCouleur`. L'etape 13d les remplace par une
// seule table (un arret de degrade ne sait pas porter « #jeton0 »). Recopies tels quels, sur les remplacements d'avant l'etape 3 ;
// ils ne servent qu'a la loi du dessin plat et disparaissent a la bascule (etape 14).

import type { DessinSvg } from '../../../../src/engine/editionSvg.js';
import { couleursDuDessinAncien, remplacerCouleurAncien } from './couleurs.js';

export function uneCouleurAncien(dessin: DessinSvg, hex: string): DessinSvg {
  return couleursDuDessinAncien(dessin).reduce((d, c) => remplacerCouleurAncien(d, c.couleur, hex), dessin);
}

export function appliquerPaletteAncien(dessin: DessinSvg, couleurs: readonly string[]): DessinSvg {
  if (!couleurs.length) return dessin;
  const presentes = couleursDuDessinAncien(dessin).map(c => c.couleur);
  const jetons = presentes.map((_, i) => '#jeton' + i);
  let d = presentes.reduce((x, c, i) => remplacerCouleurAncien(x, c, jetons[i] ?? c), dessin);
  d = jetons.reduce((x, j, i) => remplacerCouleurAncien(x, j, couleurs[i % couleurs.length] ?? j), d);
  return d;
}
