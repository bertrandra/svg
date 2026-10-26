// Les cas d'ecriture des imbrications (ADR-0012, etape 13c ; annexe 7 §2) : un <svg> imbrique lu en groupe, sa fenetre en decoupe, et
// un <text> lu en lettres (avec des fontes factices, v2/polices.ts) qui devient un groupe ou se posent sa decoupe, son masque, son
// filtre ; chaque entree de `tests/fixtures/svg/v2/imbrications-*.svg` ecrite comme « Enregistrer », comparee a sa reference et relue
// en point fixe (ecriture-stable-v2.test.ts) ; les transformations (la fenetre suit son groupe) ; un fichier du corpus d'acceptation.

import { lireDessin, rotation, translation, transformer, dupliquer, type DessinSvg } from '../../../../src/engine/editionSvg.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CasV2 } from './cas.js';
import { policesFactices } from './polices.js';

const texte = (nom: string): string => readFileSync(resolve(__dirname, '../../../fixtures/svg/v2', nom + '.svg'), 'utf8');
const lire = (svg: string, avecPolices: boolean): DessinSvg => {
  const r = lireDessin(svg, { modele: 'riche', ...(avecPolices ? { polices: policesFactices } : {}) });
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
/** Une entree a texte : lue en riche avec les fontes factices (la relecture du point fixe, elle, n'a plus de texte). */
const avecTexte = (nom: string) => (): DessinSvg => lire(texte(nom), true);
const tous = (d: DessinSvg): string[] => d.formes.map(f => f.id);
const groupesDe = (d: DessinSvg): string[] => Object.keys(d.groupes ?? {});

export const CAS: readonly CasV2[] = [
  // <svg> imbrique : cadre, viewBox, preserveAspectRatio, pourcentages, fenetre
  { nom: 'imbrications-svg-viewbox', entree: 'imbrications-svg-viewbox' },
  { nom: 'imbrications-svg-aspect', entree: 'imbrications-svg-aspect' },
  { nom: 'imbrications-svg-visible', entree: 'imbrications-svg-visible' },
  { nom: 'imbrications-svg-emboites', entree: 'imbrications-svg-emboites' },
  { nom: 'imbrications-svg-prises', entree: 'imbrications-svg-prises' },
  { nom: 'imbrications-svg-use', entree: 'imbrications-svg-use' },
  // La fenetre suit son groupe (regle de la fermeture) ; une copie ne reprend aucun identifiant
  { nom: 'imbrications-svg-tourner', dessin: () => lire(texte('imbrications-svg-viewbox'), false), operation: d => transformer(d, tous(d), rotation(20, 100, 60)) },
  { nom: 'imbrications-svg-dupliquer', dessin: () => lire(texte('imbrications-svg-viewbox'), false), operation: d => dupliquer(d, groupesDe(d), 10, 10).dessin },
  // <text> lu en groupe de lettres
  { nom: 'imbrications-texte', dessin: avecTexte('imbrications-texte') },
  { nom: 'imbrications-texte-prises', dessin: avecTexte('imbrications-texte-prises') },
  { nom: 'imbrications-texte-dans-decoupe', dessin: avecTexte('imbrications-texte-dans-decoupe') },
  { nom: 'imbrications-texte-deplacer', dessin: avecTexte('imbrications-texte-prises'), operation: d => transformer(d, tous(d), translation(-6, 4.5)) },
  // Le corpus d'acceptation (annexe 7 §7)
  { nom: 'corpus-illustrator-svg-imbrique', entree: '../corpus/illustrator-svg-imbrique' }
];
