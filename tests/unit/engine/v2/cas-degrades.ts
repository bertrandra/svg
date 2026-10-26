// Les cas d'ecriture des degrades (ADR-0012, etape 3 ; annexe 7 §2, annexe 8 §5.2, paquet 3-C) : chaque entree de
// `tests/fixtures/svg/v2/degrades-*.svg` lue en mode riche, ecrite comme « Enregistrer », comparee a sa reference et relue en point
// fixe (ecriture-stable-v2.test.ts) ; des transformations (un degrade suit sa forme) ; trois fichiers du corpus d'acceptation
// (`tests/fixtures/svg/corpus/`, l'idiome d'un logiciel reconstitue sur des formes originales).

import { lireDessin, rotation, echelle, translation, multiplier, transformer, dupliquer, type DessinSvg } from '../../../../src/engine/editionSvg.js';
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
  { nom: 'degrades-lineaire', entree: 'degrades-lineaire' },
  { nom: 'degrades-radial', entree: 'degrades-radial' },
  { nom: 'degrades-foyer', entree: 'degrades-foyer' },
  { nom: 'degrades-chaine', entree: 'degrades-chaine' },
  { nom: 'degrades-boite', entree: 'degrades-boite' },
  { nom: 'degrades-pourcentages', entree: 'degrades-pourcentages' },
  { nom: 'degrades-etalements', entree: 'degrades-etalements' },
  { nom: 'degrades-opacite', entree: 'degrades-opacite' },
  { nom: 'degrades-contour', entree: 'degrades-contour' },
  { nom: 'degrades-transformes', entree: 'degrades-transformes' },
  { nom: 'degrades-partage', entree: 'degrades-partage' },
  { nom: 'degrades-references', entree: 'degrades-references' },
  // Un degrade suit sa forme
  { nom: 'degrades-deplacer', dessin: () => riche('degrades-lineaire'), operation: d => transformer(d, tous(d), translation(-5, 7.5)) },
  { nom: 'degrades-tourner', dessin: () => riche('degrades-lineaire'), operation: d => transformer(d, tous(d), rotation(30, 100, 60)) },
  { nom: 'degrades-echelle-non-uniforme', dessin: () => riche('degrades-radial'), operation: d => transformer(d, tous(d), echelle(1.5, 0.6, 60, 60)) },
  { nom: 'degrades-incliner', dessin: () => riche('degrades-boite'), operation: d => transformer(d, tous(d), multiplier([1, 0, 0.35, 1, 0, 0], translation(-10, 0))) },
  { nom: 'degrades-retourner-contour', dessin: () => riche('degrades-contour'), operation: d => transformer(d, tous(d), echelle(-1, 1, 110, 0)) },
  { nom: 'degrades-dupliquer', dessin: () => riche('degrades-foyer'), operation: d => dupliquer(d, tous(d), 12, 12).dessin },
  // Le corpus d'acceptation (annexe 7 §7)
  { nom: 'corpus-figma-degrade', entree: '../corpus/figma-degrade' },
  { nom: 'corpus-sketch-degrade-pourcent', entree: '../corpus/sketch-degrade-pourcent' },
  { nom: 'corpus-inkscape-degrade-chaine', entree: '../corpus/inkscape-degrade-chaine' }
];
