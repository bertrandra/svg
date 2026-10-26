// Les cas d'ecriture des decoupes (ADR-0012, etape 5 ; annexe 7 §2, annexe 8 §5.6) : chaque entree de
// `tests/fixtures/svg/v2/decoupes-*.svg` lue en mode riche, ecrite comme « Enregistrer », comparee a sa reference et relue en point
// fixe (ecriture-stable-v2.test.ts) ; les transformations (une decoupe suit son groupe quand il est dans la fermeture, pas quand une
// feuille seule bouge), la copie, la creation et la liberation ; trois fichiers du corpus d'acceptation (`tests/fixtures/svg/corpus/`).

import { lireDessin, rotation, translation, transformer, dupliquer, creerDecoupe, liberer, type DessinSvg } from '../../../../src/engine/editionSvg.js';
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

/** Un dessin plat a trois formes : un fond, une vague, et une etoile au-dessus, qui decoupera les deux autres. */
const aDecouper = (): DessinSvg => lire('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120">'
  + '<rect x="0" y="0" width="200" height="120" fill="#1f5fb0"/>'
  + '<path d="M0 80C50 40 100 120 150 80C170 64 185 64 200 80L200 120L0 120Z" fill="#f2b705" stroke="#15181d" stroke-width="3"/>'
  + '<path d="M100 5L126 70L195 70L139 108L160 118L100 92L40 118L61 108L5 70L74 70Z" fill="#c81e28" fill-rule="evenodd"/></svg>', 'plat');

const sauf = (f: (d: DessinSvg) => { dessin: DessinSvg; erreur?: string }) => (d: DessinSvg): DessinSvg => {
  const r = f(d);
  if (r.erreur) throw new Error(r.erreur);
  return r.dessin;
};

export const CAS: readonly CasV2[] = [
  // Lecture puis ecriture
  { nom: 'decoupes-groupe', entree: 'decoupes-groupe' },
  { nom: 'decoupes-feuille', entree: 'decoupes-feuille' },
  { nom: 'decoupes-boite', entree: 'decoupes-boite' },
  { nom: 'decoupes-transformees', entree: 'decoupes-transformees' },
  { nom: 'decoupes-use', entree: 'decoupes-use' },
  { nom: 'decoupes-regles', entree: 'decoupes-regles' },
  { nom: 'decoupes-imbriquees', entree: 'decoupes-imbriquees' },
  { nom: 'decoupes-partagees', entree: 'decoupes-partagees' },
  { nom: 'decoupes-ignorees', entree: 'decoupes-ignorees' },
  { nom: 'decoupes-css', entree: 'decoupes-css' },
  { nom: 'decoupes-opacite', entree: 'decoupes-opacite' },
  // Une decoupe suit son groupe (regle de la fermeture) ; une feuille seule deplacee bouge sous une decoupe immobile
  { nom: 'decoupes-deplacer', dessin: () => riche('decoupes-groupe'), operation: d => transformer(d, tous(d), translation(-12, 6.5)) },
  { nom: 'decoupes-tourner', dessin: () => riche('decoupes-imbriquees'), operation: d => transformer(d, tous(d), rotation(25, 100, 60)) },
  { nom: 'decoupes-feuille-seule', dessin: () => riche('decoupes-groupe'), operation: d => transformer(d, [d.formes[0]?.id ?? ''], translation(30, 0)) },
  { nom: 'decoupes-dupliquer', dessin: () => riche('decoupes-feuille'), operation: d => dupliquer(d, groupesDe(d), 10, 10).dessin },
  // Creer et liberer
  { nom: 'decoupes-creer', dessin: aDecouper, operation: sauf(d => creerDecoupe(d, tous(d))) },
  { nom: 'decoupes-liberer', dessin: () => riche('decoupes-groupe'), operation: sauf(d => liberer(d, groupesDe(d)[0] ?? '')) },
  // Le corpus d'acceptation (annexe 7 §7)
  { nom: 'corpus-inkscape-decoupe', entree: '../corpus/inkscape-decoupe' },
  { nom: 'corpus-figma-cadre-decoupe', entree: '../corpus/figma-cadre-decoupe' },
  { nom: 'corpus-illustrator-degrade-decoupe', entree: '../corpus/illustrator-degrade-decoupe' }
];
