// Les phrases des outils de trace (contour en forme, decalage, angles arrondis, nœuds, jonctions), dites a
// voix haute et affichees dans la barre d'etat. Pures : ce que l'operation a fait en entree, une phrase en
// sortie. Elles disent aussi ce qui a ete laisse de cote ou ramene, parce qu'on ne le voit pas toujours.

import type { TypeNoeud } from '../engine/editionSvg.js';
import { nombreFr } from '../engine/description.js';
import { pluriel } from '../util/texte.js';

const accord = (n: number, mot: string): string => mot + (n > 1 ? 's' : '');

/** « 2 contours transformés en formes. » ; les formes sans contour utile sont comptees a part. */
export function phraseContourEnForme(etendus: number, ignorees: number): string {
  const fait = etendus < 2 ? 'Contour transformé en forme.' : pluriel(etendus, 'contour') + ' transformés en formes.';
  const reste = ignorees ? ' ' + pluriel(ignorees, 'forme') + ' sans contour utile ' + (ignorees > 1 ? 'laissées' : 'laissée') + ' telle' + (ignorees > 1 ? 's' : '') + ' quelle' + (ignorees > 1 ? 's' : '') + '.' : '';
  return fait + reste;
}

/** « Contour décalé de 5 vers l’extérieur. » ; ce qui a disparu faute de place est dit avec la facon de le rendre. */
export function phraseDecalage(decalees: number, distance: number, retirees: number): string {
  const sens = distance >= 0 ? 'l’extérieur' : 'l’intérieur';
  const fait = decalees === 0 ? '' : (decalees < 2 ? 'Contour décalé' : pluriel(decalees, 'contour') + ' ' + 'décalés') + ' de ' + nombreFr(Math.abs(distance)) + ' vers ' + sens + '.';
  const perdu = retirees ? (fait ? ' ' : '') + pluriel(retirees, 'forme') + ' ' + (retirees > 1 ? 'n’avaient' : 'n’avait') + ' plus de place et ' + (retirees > 1 ? 'ont disparu' : 'a disparu') + ' : Ctrl+Z ' + (retirees > 1 ? 'les rend' : 'la rend') + '.' : '';
  return (fait + perdu).trim();
}

/** « 4 angles arrondis au rayon 10. », ou ce qui a du baisser faute de place. */
export function phraseArrondi(angles: number, reduits: number, rayon: number, rayonMin: number): string {
  if (!angles) return 'Aucun angle à arrondir : les points sont tous lisses, ou trop proches pour le rayon.';
  const fait = pluriel(angles, 'angle') + ' ' + accord(angles, 'arrondi') + ' au rayon ' + nombreFr(rayon) + '.';
  if (!reduits) return fait;
  return pluriel(angles, 'angle') + ' ' + accord(angles, 'arrondi') + ' ; ' + pluriel(reduits, 'angle') + ' ' + (reduits > 1 ? 'ramenés' : 'ramené')
    + ' à un rayon plus petit, ' + nombreFr(rayonMin) + ' au minimum, faute de place sur les côtés.';
}

const TYPES: Readonly<Record<TypeNoeud, { nom: string; suite: string }>> = {
  angle: { nom: 'angle', suite: 'poignées rentrées, à tirer une à une' },
  lisse: { nom: 'lisse', suite: 'poignées alignées' },
  symetrique: { nom: 'symétrique', suite: 'poignées alignées et de même longueur' }
};

/** Le type d'un point, tel que l'inspecteur le montre et que la region vocale le dit. */
export const nomDeType = (t: TypeNoeud): string => TYPES[t].nom;

/** « Point converti en lisse : poignées alignées. » ; « Ce point est déjà symétrique. » quand rien ne bouge. */
export function phraseConversion(type: TypeNoeud, change: boolean): string {
  const { nom, suite } = TYPES[type];
  return change ? 'Point converti en ' + nom + ' : ' + suite + '.' : 'Ce point est déjà ' + nom + '.';
}

/** « Tracé cassé en deux. » ; un tracé fermé s'ouvre au point choisi. */
export const phraseCasse = (morceaux: number): string => (morceaux > 1 ? 'Tracé cassé en deux au point choisi.' : 'Tracé ouvert au point choisi : ses deux bouts s’y superposent.');

/** « Deux tracés joints en un. » ; « 2 tracés fermés. » */
export function phraseJonction(genre: 'ferme' | 'joint', n = 1): string {
  return genre === 'joint' ? 'Deux tracés joints en un seul.' : n < 2 ? 'Tracé fermé.' : pluriel(n, 'tracé') + ' fermés.';
}

/** « Sens du tracé inversé. » ; « 3 formes : sens du tracé inversé. » */
export const phraseInversion = (n: number): string => (n < 2 ? 'Sens du tracé inversé.' : pluriel(n, 'forme') + ' : sens du tracé inversé.');

/** Un point retire en gardant la courbe. */
export const phraseSuppressionFidele = 'Point retiré, courbe conservée.';
