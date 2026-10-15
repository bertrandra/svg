// Recolorer un dessin en masse (ADR-0004) : une seule couleur pour toutes les formes, ou une palette
// de quelques couleurs posee sur les couleurs du dessin, les plus presentes d'abord. Les palettes
// d'evenements sont des propositions ; la personne garde la main.

import { couleursDuDessin, remplacerCouleur, type DessinSvg } from './editionSvg.js';

export interface Palette { id: string; nom: string; evenement?: string; couleurs: readonly string[] }

export const PALETTES: readonly Palette[] = [
  { id: 'noel', nom: 'Noël', evenement: 'noel', couleurs: ['#b3202c', '#1f5f3f', '#d4a537', '#f4efe6'] },
  { id: 'halloween', nom: 'Halloween', evenement: 'halloween', couleurs: ['#f26b1d', '#1b1b1f', '#6a2c91', '#9bd62c'] },
  { id: 'paques', nom: 'Pâques', evenement: 'paques', couleurs: ['#f6c6d7', '#bfe3c0', '#fff1a8', '#b8d8f2'] },
  { id: 'saint-valentin', nom: 'Saint-Valentin', evenement: 'saint-valentin', couleurs: ['#d61f45', '#f28cab', '#fde6ec', '#5a1f2b'] },
  { id: 'anniversaire', nom: 'Anniversaire', evenement: 'anniversaire', couleurs: ['#ff5d8f', '#ffc53d', '#3fb0ff', '#7bdc6b'] },
  { id: 'mariage', nom: 'Mariage', evenement: 'mariage', couleurs: ['#c9a66b', '#f7f3ee', '#8a9a7b', '#4a4a4a'] },
  { id: 'naissance', nom: 'Naissance', evenement: 'naissance', couleurs: ['#bfe0f5', '#f7c8d6', '#fff4c2', '#d9f2d0'] },
  { id: 'concert', nom: 'Concert', evenement: 'concert', couleurs: ['#111118', '#ff2e63', '#08d9d6', '#eaeaea'] },
  { id: 'quatorze-juillet', nom: '14 Juillet', evenement: 'quatorze-juillet', couleurs: ['#0a2a8a', '#ffffff', '#d7262d'] },
  { id: 'ete', nom: 'Été', evenement: 'ete', couleurs: ['#ffb703', '#219ebc', '#fb8500', '#8ecae6'] },
  { id: 'automne', nom: 'Automne', evenement: 'automne', couleurs: ['#b5542d', '#d98e32', '#6b4226', '#e9c46a'] },
  { id: 'hiver', nom: 'Hiver', evenement: 'hiver', couleurs: ['#1d3557', '#457b9d', '#a8dadc', '#f1faee'] },
  { id: 'encre', nom: 'Encre', couleurs: ['#15181d'] },
  { id: 'gris', nom: 'Nuances de gris', couleurs: ['#15181d', '#555c66', '#9aa3ad', '#cfd4da'] },
  { id: 'sepia', nom: 'Sépia', couleurs: ['#4a3728', '#8c6a4f', '#c9ad8f', '#f0e6d8'] }
];

export const palette = (id: string): Palette | undefined => PALETTES.find(p => p.id === id);

/** Toutes les formes visibles prennent cette couleur de remplissage ; les contours la prennent aussi. */
export function uneCouleur(dessin: DessinSvg, hex: string): DessinSvg {
  return couleursDuDessin(dessin).reduce((d, c) => remplacerCouleur(d, c.couleur, hex), dessin);
}

/**
 * Pose la palette sur les couleurs du dessin : la plus presente prend la premiere couleur, la
 * suivante la deuxieme, et ainsi de suite en boucle. Deux couleurs du dessin ne fusionnent pas si la
 * palette est assez longue ; sinon elles partagent une couleur, et c'est voulu.
 */
export function appliquerPalette(dessin: DessinSvg, couleurs: readonly string[]): DessinSvg {
  if (!couleurs.length) return dessin;
  const presentes = couleursDuDessin(dessin).map(c => c.couleur);
  // Deux passes par des jetons intermediaires : remplacer A par B puis B par C ne doit pas enchainer.
  const jetons = presentes.map((_, i) => '#jeton' + i);
  let d = presentes.reduce((x, c, i) => remplacerCouleur(x, c, jetons[i] ?? c), dessin);
  d = jetons.reduce((x, j, i) => remplacerCouleur(x, j, couleurs[i % couleurs.length] ?? j), d);
  return d;
}
