// Les cas d'ecriture des motifs (ADR-0012, etape 9 ; annexe 7 §2, annexe 8 §1) : chaque entree de `tests/fixtures/svg/v2/motifs-*.svg`
// lue en mode riche, ecrite comme « Enregistrer », comparee a sa reference et relue en point fixe (ecriture-stable-v2.test.ts) ; les
// transformations (le motif suit sa forme : sa matrice se compose, sa tuile ne bouge pas), la copie, « Créer un motif depuis la
// sélection » (sur une forme choisie, puis sur un rectangle neuf, d'une selection a groupe) ; un fichier du corpus d'acceptation.

import { creerMotif, dupliquer, echelle, lireDessin, rotation, transformer, translation, type DessinSvg } from '../../../../src/engine/editionSvg.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CasV2 } from './cas.js';

const lire = (svg: string, modele: 'plat' | 'riche'): DessinSvg => {
  const r = lireDessin(svg, { modele });
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
const riche = (nom: string): DessinSvg => lire(readFileSync(resolve(__dirname, '../../../fixtures/svg/v2', nom + '.svg'), 'utf8'), 'riche');
const tous = (d: DessinSvg): string[] => d.formes.map(f => f.id);

/** Un dessin plat : un grand fond a peindre, et deux petites formes qui deviendront la tuile. */
const aMotif = (): DessinSvg => lire('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120">'
  + '<rect x="0" y="0" width="200" height="120" fill="#f1faee" stroke="#1d3557" stroke-width="2"/>'
  + '<circle cx="20" cy="20" r="8" fill="#e63946"/>'
  + '<path d="M30 12L44 28L30 28Z" fill="#457b9d" stroke="#1d3557" stroke-width="1"/></svg>', 'plat');

/** Une selection a groupe (lu en riche) : un groupe de deux formes, et une forme seule, au-dessus d'un fond qui reste. */
const aMotifGroupe = (): DessinSvg => lire('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120"><rect x="0" y="0" width="200" height="120" fill="#ffffff"/>'
  + '<g opacity="0.8"><rect x="60" y="40" width="10" height="10" fill="#2a9d8f"/><rect x="70" y="50" width="10" height="10" fill="#264653"/></g>'
  + '<circle cx="85" cy="45" r="4" fill="#e9c46a"/></svg>', 'riche');

const sauf = (f: (d: DessinSvg) => { dessin: DessinSvg; erreur?: string }) => (d: DessinSvg): DessinSvg => {
  const r = f(d);
  if (r.erreur) throw new Error(r.erreur);
  return r.dessin;
};

export const CAS: readonly CasV2[] = [
  // Lecture puis ecriture
  { nom: 'motifs-plan', entree: 'motifs-plan' },
  { nom: 'motifs-boite', entree: 'motifs-boite' },
  { nom: 'motifs-viewbox', entree: 'motifs-viewbox' },
  { nom: 'motifs-transformes', entree: 'motifs-transformes' },
  { nom: 'motifs-href', entree: 'motifs-href' },
  { nom: 'motifs-contour', entree: 'motifs-contour' },
  { nom: 'motifs-imbriques', entree: 'motifs-imbriques' },
  { nom: 'motifs-ignores', entree: 'motifs-ignores' },
  // Le motif suit sa forme (sa matrice se compose) : deplacer, tourner, etirer, copier
  { nom: 'motifs-deplacer', dessin: () => riche('motifs-plan'), operation: d => transformer(d, tous(d), translation(-12, 6.5)) },
  { nom: 'motifs-tourner', dessin: () => riche('motifs-contour'), operation: d => transformer(d, tous(d), rotation(25, 150, 70)) },
  { nom: 'motifs-etirer', dessin: () => riche('motifs-boite'), operation: d => transformer(d, tous(d), echelle(1.5, 0.75, 150, 70)) },
  { nom: 'motifs-dupliquer', dessin: () => riche('motifs-imbriques'), operation: d => dupliquer(d, tous(d), 10, 10).dessin },
  // Creer un motif depuis la selection : sur une forme choisie, sur un rectangle neuf (une selection a groupe)
  { nom: 'motifs-creer-cible', dessin: aMotif, operation: sauf(d => creerMotif(d, ['f2', 'f3'], 'f1')) },
  { nom: 'motifs-creer-rectangle', dessin: aMotifGroupe, operation: sauf(d => creerMotif(d, ['g1', 'f4'])) },
  // Le corpus d'acceptation (annexe 7 §7)
  { nom: 'corpus-motif-hachures', entree: '../corpus/motif-hachures' }
];
