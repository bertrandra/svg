// Les cas d'ecriture des masques d'opacite (ADR-0012, etape 6 ; annexe 7 §2, annexe 8 §1) : chaque entree de
// `tests/fixtures/svg/v2/masques-*.svg` lue en mode riche, ecrite comme « Enregistrer », comparee a sa reference et relue en point
// fixe (ecriture-stable-v2.test.ts) ; les transformations (un masque suit son groupe quand il est dans la fermeture, contenu et region,
// pas quand une feuille seule bouge), la copie, la creation, la liberation et l'inversion ; deux fichiers du corpus d'acceptation
// (`tests/fixtures/svg/corpus/`).

import {
  creerMasque, dupliquer, inverserMasque, libererMasque, lireDessin, rotation, transformer, translation, type DessinSvg
} from '../../../../src/engine/editionSvg.js';
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
const groupesDe = (d: DessinSvg): string[] => Object.keys(d.groupes ?? {});
/** Le premier groupe masque. */
const masque = (d: DessinSvg): string => Object.values(d.groupes ?? {}).find(g => g.masque)?.id ?? '';

/** Un dessin plat a trois formes : un fond, une vague, et un disque blanc au-dessus, qui masquera les deux autres. */
const aMasquer = (): DessinSvg => lire('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120">'
  + '<rect x="0" y="0" width="200" height="120" fill="#1f5fb0"/>'
  + '<path d="M0 80C50 40 100 120 150 80C170 64 185 64 200 80L200 120L0 120Z" fill="#f2b705" stroke="#15181d" stroke-width="3"/>'
  + '<circle cx="100" cy="60" r="50" fill="#ffffff"/></svg>', 'plat');

/** Un fond sous un groupe de deux disques : le dessus est un groupe, qui devient le contenu du masque, ses identifiants gardes. */
const aMasquerParUnGroupe = (): DessinSvg => lire('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120"><rect x="0" y="0" width="200" height="120" fill="#1f5fb0"/>'
  + '<g><circle cx="100" cy="60" r="50" fill="#ffffff"/><circle cx="100" cy="60" r="25" fill="#606060"/></g></svg>', 'riche');

const sauf = (f: (d: DessinSvg) => { dessin: DessinSvg; erreur?: string }) => (d: DessinSvg): DessinSvg => {
  const r = f(d);
  if (r.erreur) throw new Error(r.erreur);
  return r.dessin;
};

export const CAS: readonly CasV2[] = [
  // Lecture puis ecriture
  { nom: 'masques-groupe', entree: 'masques-groupe' },
  { nom: 'masques-feuille', entree: 'masques-feuille' },
  { nom: 'masques-alpha', entree: 'masques-alpha' },
  { nom: 'masques-region', entree: 'masques-region' },
  { nom: 'masques-contenu-boite', entree: 'masques-contenu-boite' },
  { nom: 'masques-degrade', entree: 'masques-degrade' },
  { nom: 'masques-transformes', entree: 'masques-transformes' },
  { nom: 'masques-use', entree: 'masques-use' },
  { nom: 'masques-imbriques', entree: 'masques-imbriques' },
  { nom: 'masques-ignores', entree: 'masques-ignores' },
  { nom: 'masques-partages', entree: 'masques-partages' },
  // Une image dans le seul contenu d'un masque : la racine declare xmlns:xlink (l'ecriture le decide apres les definitions)
  { nom: 'masques-image', entree: 'masques-image' },
  { nom: 'masques-image-deplacer', dessin: () => riche('masques-image'), operation: d => transformer(d, tous(d), translation(-12, 6.5)) },
  // Un masque suit son groupe (regle de la fermeture), degrades du contenu compris ; une feuille seule deplacee bouge sous un masque immobile
  { nom: 'masques-deplacer', dessin: () => riche('masques-degrade'), operation: d => transformer(d, tous(d), translation(-12, 6.5)) },
  { nom: 'masques-tourner', dessin: () => riche('masques-groupe'), operation: d => transformer(d, tous(d), rotation(25, 100, 60)) },
  { nom: 'masques-feuille-seule', dessin: () => riche('masques-groupe'), operation: d => transformer(d, [d.formes[0]?.id ?? ''], translation(30, 0)) },
  { nom: 'masques-dupliquer', dessin: () => riche('masques-use'), operation: d => dupliquer(d, groupesDe(d), 10, 10).dessin },
  // Creer, liberer, inverser
  { nom: 'masques-creer', dessin: aMasquer, operation: sauf(d => creerMasque(d, tous(d))) },
  { nom: 'masques-creer-groupe', dessin: aMasquerParUnGroupe, operation: sauf(d => creerMasque(d, ['f1', ...groupesDe(d)])) },
  { nom: 'masques-liberer', dessin: () => riche('masques-use'), operation: sauf(d => libererMasque(d, masque(d))) },
  { nom: 'masques-inverser', dessin: () => riche('masques-degrade'), operation: sauf(d => inverserMasque(d, masque(d))) },
  { nom: 'masques-inverser-alpha', dessin: () => riche('masques-alpha'), operation: sauf(d => inverserMasque(d, masque(d))) },
  // Le corpus d'acceptation (annexe 7 §7)
  { nom: 'corpus-figma-trait-interieur', entree: '../corpus/figma-trait-interieur' },
  { nom: 'corpus-sketch-masque-use', entree: '../corpus/sketch-masque-use' }
];
