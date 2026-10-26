// Les cas d'ecriture des images integrees (ADR-0012, etape 12) : PNG, JPEG, GIF, WebP, type corrige, l'enveloppe du convertisseur,
// et les transformations (deplacer plie la translation dans le cadre, tourner garde la matrice, retourner l'ecrit en miroir).

import { deplacer, redimensionner, retourner, tourner, type DessinSvg } from '../../../../src/engine/editionSvg.js';
import type { CasV2 } from './cas.js';

const idsImages = (d: DessinSvg): string[] => d.formes.filter(f => f.image).map(f => f.id);

export const CAS: readonly CasV2[] = [
  { nom: 'images-png', entree: 'images-png' },
  { nom: 'images-jpeg', entree: 'images-jpeg' },
  { nom: 'images-rotation', entree: 'images-rotation' },
  { nom: 'images-gif-webp', entree: 'images-gif-webp' },
  { nom: 'images-type-corrige', entree: 'images-type-corrige' },
  { nom: 'images-enveloppe', entree: 'images-enveloppe' },
  { nom: 'images-deplacees', entree: 'images-png', operation: d => deplacer(d, idsImages(d), 7.25, -3) },
  { nom: 'images-tournees', entree: 'images-png', operation: d => tourner(d, idsImages(d), 90) },
  { nom: 'images-retournees', entree: 'images-png', operation: d => retourner(d, idsImages(d), 'h') },
  { nom: 'images-redimensionnees', entree: 'images-rotation', operation: d => redimensionner(d, idsImages(d), { x: 5, y: 5, l: 50, h: 40 }) }
];
