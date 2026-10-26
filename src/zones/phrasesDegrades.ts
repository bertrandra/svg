// Ce que l'editeur dit des degrades (ADR-0012, etape 4, annexe 6 §4 et §7) : un arret (« Arrêt 2 sur 3, rouge #c81e28, à 40 % »),
// un arret qu'on deplace (« Arrêt 2 : 55 %. »), une extremite, le genre pose, un arret ajoute ou retire. La couleur se nomme avant son
// code (ADR-0011). Les mots du degrade dans la description d'une forme sont dans engine/description.ts (`degradeDit`).

import { couleurDite, nombreFr } from '../engine/description.js';
import type { CoteDegrade, Degrade, ExtremiteDegrade, GenreDegrade, PointDegrade } from '../engine/editionSvg.js';
import { pluriel } from '../util/texte.js';

/** Une position ou une opacite en pour cent, comme on la dit : « 40 », « 33,3 ». */
export const pourCent = (v: number): string => nombreFr(Math.round(v * 1000) / 10);

/** Le cote dit dans une phrase : « remplissage » ou « contour ». */
export const coteDit = (cote: CoteDegrade): string => (cote === 'remplissage' ? 'remplissage' : 'contour');

/** « Arrêt 2 sur 3 » : le nom court d'un arret (son rang de 1). */
export const nomArret = (i: number, n: number): string => 'Arrêt ' + (i + 1) + ' sur ' + n;

/** « Arrêt 2 sur 3, rouge #c81e28, à 40 % » (et son opacite quand elle n'est pas pleine) : la valeur d'une poignee, une option de la liste. */
export function phraseArret(g: Degrade, i: number): string {
  const a = g.arrets[i];
  if (!a) return nomArret(i, g.arrets.length);
  return nomArret(i, g.arrets.length) + ', ' + couleurDite(a.couleur) + ', à ' + pourCent(a.position) + ' %' + (a.opacite !== undefined && a.opacite < 1 ? ', opacité ' + pourCent(a.opacite) + ' %' : '');
}

/** « Arrêt 2 : 55 %. » : ce que dit un arret qu'on deplace (annexe 6 §4). */
export const phrasePositionArret = (i: number, position: number): string => 'Arrêt ' + (i + 1) + ' : ' + pourCent(position) + ' %.';

/** Le nom d'une extremite de l'axe, selon le genre : le debut et la fin d'un lineaire, le centre et le bord d'un radial. */
export const nomExtremite = (genre: GenreDegrade, e: ExtremiteDegrade): string =>
  genre === 'radial' ? (e === 'debut' ? 'Centre du dégradé' : 'Bord du dégradé') : e === 'debut' ? 'Début du dégradé' : 'Fin du dégradé';

/** « Début du dégradé : 30, 100. » */
export const phraseExtremite = (genre: GenreDegrade, e: ExtremiteDegrade, p: PointDegrade): string => nomExtremite(genre, e) + ' : ' + nombreFr(p[0]) + ', ' + nombreFr(p[1]) + '.';

/** Le genre d'une peinture tel que le groupe de boutons le nomme. */
export const nomGenre = (genre: GenreDegrade | 'uni'): string => (genre === 'uni' ? 'Uni' : genre === 'lineaire' ? 'Dégradé linéaire' : 'Dégradé radial');

/** « Remplissage : dégradé linéaire. » ; « Contour : couleur unie. » */
export const phraseGenre = (cote: CoteDegrade, genre: GenreDegrade | 'uni'): string =>
  (cote === 'remplissage' ? 'Remplissage' : 'Contour') + ' : ' + (genre === 'uni' ? 'couleur unie' : genre === 'lineaire' ? 'dégradé linéaire' : 'dégradé radial') + '.';

/** « Arrêt ajouté : 3 sur 4. » */
export const phraseArretAjoute = (i: number, n: number): string => 'Arrêt ajouté : ' + (i + 1) + ' sur ' + n + '.';

/** « Arrêt retiré : 2 arrêts restent. » */
export const phraseArretRetire = (n: number): string => 'Arrêt retiré : ' + pluriel(n, 'arrêt') + ' reste' + (n > 1 ? 'nt' : '') + '.';

/** Ce qu'une poignee de la toile dit d'elle-meme en plus de sa valeur : comment la mouvoir. */
export const AIDE_POIGNEE_ARRET = 'Flèches : 1 %, Maj et flèches : 10 %. Suppr : retirer l’arrêt.';
export const AIDE_POIGNEE_EXTREMITE = 'Flèches : déplacer, Maj et flèches : dix fois plus.';

/** Un degrade garde deux arrets : la raison du bouton « Retirer » grise. */
export const RAISON_DEUX_ARRETS = 'Un dégradé garde au moins deux arrêts.';
/** Au-dela de 64 arrets : la raison du bouton « Ajouter » grise. */
export const RAISON_ARRETS_MAX = 'Un dégradé compte au plus 64 arrêts.';
