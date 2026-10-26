// Les cas d'ecriture de l'interface des decoupes, des masques, des effets et des images (ADR-0012, etape 8) : poser, regler et retirer
// des effets (sur un dessin plat qui devient riche, sur un groupe, sur des effets lus), inserer une image (a sa taille, reduite au plan,
// dans un groupe), et creer un masque dont le dessus est un texte vivant (le fichier n'en ecrit que les contours). Chaque cas s'ecrit
// comme « Enregistrer », se compare a sa reference `tests/fixtures/svg/v2/<nom>.attendu.svg` et se relit en point fixe
// (ecriture-stable-v2.test.ts).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { creerMasque, insererImage, lireDessin, poserEffets, type DessinSvg } from '../../../../src/engine/editionSvg.js';
import type { CasV2 } from './cas.js';

export const lire = (chemin: string, modele: 'plat' | 'riche'): DessinSvg => {
  const r = lireDessin(readFileSync(resolve(__dirname, '../../../fixtures/svg', chemin + '.svg'), 'utf8'), { modele });
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
const tous = (d: DessinSvg): string[] => d.formes.map(f => f.id);
const premierGroupe = (d: DessinSvg): string => {
  const [id] = Object.keys(d.groupes ?? {});
  if (id === undefined) throw new Error('pas de groupe');
  return id;
};

/** Un PNG de `l` x `h` pixels reduit a sa signature et a son en-tete (les dimensions se lisent dans l'en-tete, jamais plus loin). */
export function pngDe(l: number, h: number): string {
  const o = Buffer.alloc(8 + 25 + 12);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(o, 0);
  o.writeUInt32BE(13, 8);
  o.write('IHDR', 12, 'latin1');
  o.writeUInt32BE(l, 16);
  o.writeUInt32BE(h, 20);
  o.set([8, 2, 0, 0, 0], 24);
  o.writeUInt32BE(0, 29);
  o.writeUInt32BE(0, 33);
  o.write('IEND', 37, 'latin1');
  o.writeUInt32BE(0xae426082, 41);
  return 'data:image/png;base64,' + o.toString('base64');
}

/** Le PNG de 4 x 3 pixels des references de l'etape 12 (`v2/images-png`). */
export const PNG_4_3 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAGUlEQVR42mMQ0VhwQk4DQjLAWSIaCxiQZQDf+wt9qZvCzAAAAABJRU5ErkJggg==';

const inserer = (d: DessinSvg, donnees: string, centre: { x: number; y: number }, parent?: string): DessinSvg => {
  const r = insererImage(d, donnees, centre, parent);
  if ('refus' in r) throw new Error(r.refus);
  return r.dessin;
};

/** Le texte vivant de la lecture de reference, et la forme de fond sous lui : le dessus d'un masque sera le texte. */
function masqueParUnTexte(d: DessinSvg): DessinSvg {
  const texte = [...d.formes].reverse().find(f => f.texte && f.parent === undefined);
  const fond = d.formes[0];
  if (!texte || !fond) throw new Error('pas de texte vivant');
  const r = creerMasque(d, [fond.id, texte.id]);
  if (r.id === null) throw new Error(r.erreur);
  return r.dessin;
}

export const CAS: readonly CasV2[] = [
  // Poser des effets : un dessin plat devient riche ; un groupe porte son ombre ; regler des effets lus ; les retirer
  { nom: 'effets-op-flou-plat', dessin: () => lire('peintures', 'plat'), operation: d => poserEffets(d, tous(d).slice(0, 2), { flou: {} }) },
  { nom: 'effets-op-ombre-groupe', dessin: () => lire('v2/groupes-imbriques', 'riche'), operation: d => poserEffets(d, [premierGroupe(d)], { ombre: { dx: 3, dy: -2, ecart: 1.5, couleur: '#1F5FB0', opacite: 0.4 } }) },
  { nom: 'effets-op-regler', dessin: () => lire('v2/effets-flou-ombre', 'riche'), operation: d => poserEffets(d, tous(d), { flou: { ecart: 2, ecartY: null }, ombre: { opacite: 0.25 } }) },
  { nom: 'effets-op-retirer', dessin: () => lire('v2/effets-flou', 'riche'), operation: d => poserEffets(d, tous(d), { flou: null }) },
  // Inserer une image : a sa taille au centre ; plus grande que le plan, reduite ; dans un groupe (le contexte d'edition)
  { nom: 'images-op-inserer', dessin: () => lire('peintures', 'plat'), operation: d => inserer(d, PNG_4_3, { x: d.vb[0] + d.vb[2] / 2, y: d.vb[1] + d.vb[3] / 2 }) },
  { nom: 'images-op-inserer-reduite', dessin: () => lire('v2/groupes-imbriques', 'riche'), operation: d => inserer(d, pngDe(1000, 400), { x: 0, y: 0 }, premierGroupe(d)) },
  // Un masque dont le dessus est un texte vivant : le modele le garde vivant, le fichier n'en ecrit que les contours
  { nom: 'masques-op-texte-vivant', dessin: () => lire('texte-vivant-lecture', 'riche'), operation: masqueParUnTexte }
];
