// Les cas d'ecriture des effets (ADR-0012, etape 7 ; annexe 7 §2, annexe 8 §5.7, paquet 7-A) : chaque entree de
// `tests/fixtures/svg/v2/effets-*.svg` lue en mode riche, ecrite comme « Enregistrer », comparee a sa reference et relue en point fixe
// (ecriture-stable-v2.test.ts) ; des transformations (le flou suit la matrice, l'ombre garde sa direction dans le plan) ; le fichier
// du corpus d'acceptation `inkscape-flou` (l'idiome d'Inkscape reconstitue sur des formes originales).

import { deplacer, dupliquer, echelle, lireDessin, rotation, transformer, type DessinSvg } from '../../../../src/engine/editionSvg.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CasV2 } from './cas.js';

const riche = (nom: string): DessinSvg => {
  const r = lireDessin(readFileSync(resolve(__dirname, '../../../fixtures/svg/v2', nom + '.svg'), 'utf8'), { modele: 'riche' });
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
const tous = (d: DessinSvg): string[] => d.formes.map(f => f.id);

export const CAS: readonly CasV2[] = [
  // Lecture puis ecriture
  { nom: 'effets-flou', entree: 'effets-flou' },
  { nom: 'effets-ombre', entree: 'effets-ombre' },
  { nom: 'effets-flou-ombre', entree: 'effets-flou-ombre' },
  { nom: 'effets-rotation', entree: 'effets-rotation' },
  { nom: 'effets-echelle', entree: 'effets-echelle' },
  { nom: 'effets-image', entree: 'effets-image' },
  // Les effets suivent leur forme (annexe 3 §2)
  { nom: 'effets-deplacer', dessin: () => riche('effets-ombre'), operation: d => deplacer(d, tous(d), 6.5, -4) },
  { nom: 'effets-tourner', dessin: () => riche('effets-flou'), operation: d => transformer(d, tous(d), rotation(90, 120, 60)) },
  { nom: 'effets-tourner-ombre', dessin: () => riche('effets-ombre'), operation: d => transformer(d, tous(d), rotation(30, 120, 70)) },
  { nom: 'effets-echelle-non-uniforme', dessin: () => riche('effets-flou'), operation: d => transformer(d, tous(d), echelle(1.5, 0.6, 120, 60)) },
  { nom: 'effets-groupe-transforme', dessin: () => riche('effets-flou-ombre'), operation: d => transformer(d, tous(d), echelle(0.5, 0.5, 0, 0)) },
  { nom: 'effets-dupliquer', dessin: () => riche('effets-flou-ombre'), operation: d => dupliquer(d, tous(d), 10, 10).dessin },
  // Le corpus d'acceptation (annexe 7 §7)
  { nom: 'corpus-inkscape-flou', entree: '../corpus/inkscape-flou' }
];
