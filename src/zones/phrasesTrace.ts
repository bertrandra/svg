// Les phrases des outils de trace (contour en forme, decalage, angles arrondis, nœuds, jonctions), dites a
// voix haute et affichees dans la barre d'etat. Pures : ce que l'operation a fait en entree, une phrase en
// sortie. Elles disent aussi ce qui a ete laisse de cote ou ramene, parce qu'on ne le voit pas toujours.
// Chaque accord (une forme, plusieurs) est une cle entiere de `t` (ADR-0042).

import type { TypeNoeud } from '../engine/editionSvg.js';
import { nombreFr } from '../engine/description.js';
import { t } from '../util/i18n.js';
import { pluriel } from '../util/texte.js';

/** « 2 contours transformés en formes. » ; les formes sans contour utile sont comptees a part. */
export function phraseContourEnForme(etendus: number, ignorees: number): string {
  const fait = etendus < 2 ? t('Contour transformé en forme.') : t('{contours} transformés en formes.', { contours: pluriel(etendus, 'contour') });
  if (!ignorees) return fait;
  const formes = pluriel(ignorees, 'forme');
  return fait + ' ' + (ignorees > 1 ? t('{formes} sans contour utile laissées telles quelles.', { formes }) : t('{formes} sans contour utile laissée telle quelle.', { formes }));
}

/** « Contour décalé de 5 vers l’extérieur. » ; ce qui a disparu faute de place est dit avec la facon de le rendre. */
export function phraseDecalage(decalees: number, distance: number, retirees: number, refusees = 0): string {
  const v = { contours: pluriel(decalees, 'contour'), distance: nombreFr(Math.abs(distance)), sens: distance >= 0 ? t('l’extérieur') : t('l’intérieur') };
  const fait = decalees === 0 ? '' : decalees < 2 ? t('Contour décalé de {distance} vers {sens}.', v) : t('{contours} décalés de {distance} vers {sens}.', v);
  const perdu = !retirees ? '' : retirees > 1
    ? t('{formes} n’avaient plus de place et ont disparu : Ctrl+Z les rend.', { formes: pluriel(retirees, 'forme') })
    : t('{formes} n’avait plus de place et a disparu : Ctrl+Z la rend.', { formes: pluriel(retirees, 'forme') });
  const reste = !refusees ? '' : refusees > 1
    ? t('{formes} laissées telles quelles : un tracé ouvert n’a pas d’intérieur.', { formes: pluriel(refusees, 'forme') })
    : t('{formes} laissée telle quelle : un tracé ouvert n’a pas d’intérieur.', { formes: pluriel(refusees, 'forme') });
  return [fait, perdu, reste].filter(Boolean).join(' ');
}

/** « 4 angles arrondis au rayon 10. », ou ce qui a du baisser faute de place. */
export function phraseArrondi(angles: number, reduits: number, rayon: number, rayonMin: number): string {
  if (!angles) return t('Aucun angle à arrondir : les points sont tous lisses, ou trop proches pour le rayon.');
  const v = { angles: pluriel(angles, 'angle'), rayon: nombreFr(rayon) };
  if (!reduits) return angles > 1 ? t('{angles} arrondis au rayon {rayon}.', v) : t('{angles} arrondi au rayon {rayon}.', v);
  const tete = angles > 1 ? t('{angles} arrondis', v) : t('{angles} arrondi', v);
  const w = { reduits: pluriel(reduits, 'angle'), rayon: nombreFr(rayonMin) };
  const suite = reduits > 1
    ? t('{reduits} ramenés à un rayon plus petit, {rayon} au minimum, faute de place sur les côtés.', w)
    : t('{reduits} ramené à un rayon plus petit, {rayon} au minimum, faute de place sur les côtés.', w);
  return tete + t(' ; ') + suite;
}

/** Le nom d'un type de point, et ce que la conversion fait de ses poignees. */
function typeDit(type: TypeNoeud): { nom: string; suite: string } {
  switch (type) {
    case 'angle': return { nom: t('angle'), suite: t('poignées rentrées, à tirer une à une') };
    case 'lisse': return { nom: t('lisse'), suite: t('poignées alignées') };
    case 'symetrique': return { nom: t('symétrique'), suite: t('poignées alignées et de même longueur') };
  }
}

/** Le type d'un point, tel que l'inspecteur le montre et que la region vocale le dit. */
export const nomDeType = (type: TypeNoeud): string => typeDit(type).nom;

/** « Point converti en lisse : poignées alignées. » ; « Ce point est déjà symétrique. » quand rien ne bouge. */
export function phraseConversion(type: TypeNoeud, change: boolean): string {
  const { nom, suite } = typeDit(type);
  return change ? t('Point converti en {nom} : {suite}.', { nom, suite }) : t('Ce point est déjà {nom}.', { nom });
}

/** « Tracé cassé en deux. » ; un tracé fermé s'ouvre au point choisi. */
export const phraseCasse = (morceaux: number): string => (morceaux > 1 ? t('Tracé cassé en deux au point choisi.') : t('Tracé ouvert au point choisi : ses deux bouts s’y superposent.'));

/** « Deux tracés joints en un. » ; « 2 tracés fermés. » */
export function phraseJonction(genre: 'ferme' | 'joint', n = 1): string {
  return genre === 'joint' ? t('Deux tracés joints en un seul.') : n < 2 ? t('Tracé fermé.') : t('{traces} fermés.', { traces: pluriel(n, 'tracé') });
}

/** « Sens du tracé inversé. » ; « 3 formes : sens du tracé inversé. » */
export const phraseInversion = (n: number): string => (n < 2 ? t('Sens du tracé inversé.') : t('{formes} : sens du tracé inversé.', { formes: pluriel(n, 'forme') }));

/** Un point retire en gardant la courbe. */
export const phraseSuppressionFidele = t('Point retiré, courbe conservée.');
