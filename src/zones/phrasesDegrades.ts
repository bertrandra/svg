// Ce que l'editeur dit des degrades (ADR-0012, etape 4, annexe 6 §4 et §7) : un arret (« Arrêt 2 sur 3, rouge #c81e28, à 40 % »),
// un arret qu'on deplace (« Arrêt 2 : 55 %. »), une extremite, le genre pose, un arret ajoute ou retire. La couleur se nomme avant son
// code (ADR-0011). Les mots du degrade dans la description d'une forme sont dans engine/description.ts (`degradeDit`).

import { couleurDite, nombreFr } from '../engine/description.js';
import type { CoteDegrade, Degrade, ExtremiteDegrade, GenreDegrade, PointDegrade } from '../engine/editionSvg.js';
import { t } from '../util/i18n.js';
import { pluriel } from '../util/texte.js';

/** Une position ou une opacite en pour cent, comme on la dit : « 40 », « 33,3 ». */
export const pourCent = (v: number): string => nombreFr(Math.round(v * 1000) / 10);

/** Le cote en tete de phrase : « Remplissage » ou « Contour ». */
const coteNomme = (cote: CoteDegrade): string => (cote === 'remplissage' ? t('Remplissage') : t('Contour'));

/**
 * Le cote dit dans une phrase : « remplissage » ou « contour ». La minuscule se prend sur le nom traduit : « contour » tout court
 * est deja le mot du contour en forme (`pluriel`, « outline »), et le trait d'un degrade est un « stroke ».
 */
export const coteDit = (cote: CoteDegrade): string => coteNomme(cote).toLowerCase();

/** « Arrêt 2 sur 3 » : le nom court d'un arret (son rang de 1). */
export const nomArret = (i: number, n: number): string => t('Arrêt {rang} sur {total}', { rang: i + 1, total: n });

/** « Arrêt 2 sur 3, rouge #c81e28, à 40 % » (et son opacite quand elle n'est pas pleine) : la valeur d'une poignee, une option de la liste. */
export function phraseArret(g: Degrade, i: number): string {
  const a = g.arrets[i];
  if (!a) return nomArret(i, g.arrets.length);
  const v = { arret: nomArret(i, g.arrets.length), couleur: couleurDite(a.couleur), position: pourCent(a.position) };
  return a.opacite !== undefined && a.opacite < 1
    ? t('{arret}, {couleur}, à {position} %, opacité {opacite} %', { ...v, opacite: pourCent(a.opacite) })
    : t('{arret}, {couleur}, à {position} %', v);
}

/** « Arrêt 2 : 55 %. » : ce que dit un arret qu'on deplace (annexe 6 §4). */
export const phrasePositionArret = (i: number, position: number): string => t('Arrêt {rang} : {position} %.', { rang: i + 1, position: pourCent(position) });

/** Le nom d'une extremite de l'axe, selon le genre : le debut et la fin d'un lineaire, le centre et le bord d'un radial. */
export const nomExtremite = (genre: GenreDegrade, e: ExtremiteDegrade): string =>
  (genre === 'radial' ? (e === 'debut' ? t('Centre du dégradé') : t('Bord du dégradé')) : e === 'debut' ? t('Début du dégradé') : t('Fin du dégradé'));

/** « Début du dégradé : 30, 100. » */
export const phraseExtremite = (genre: GenreDegrade, e: ExtremiteDegrade, p: PointDegrade): string =>
  t('{extremite} : {x}, {y}.', { extremite: nomExtremite(genre, e), x: nombreFr(p[0]), y: nombreFr(p[1]) });

/** Le genre d'une peinture tel que le groupe de boutons le nomme. */
export const nomGenre = (genre: GenreDegrade | 'uni'): string => (genre === 'uni' ? t('Uni') : genre === 'lineaire' ? t('Dégradé linéaire') : t('Dégradé radial'));

/** « Remplissage : dégradé linéaire. » ; « Contour : couleur unie. » */
export const phraseGenre = (cote: CoteDegrade, genre: GenreDegrade | 'uni'): string =>
  t('{cote} : {genre}.', {
    cote: coteNomme(cote),
    genre: genre === 'uni' ? t('couleur unie') : genre === 'lineaire' ? t('dégradé linéaire') : t('dégradé radial')
  });

/** « Arrêt ajouté : 3 sur 4. » */
export const phraseArretAjoute = (i: number, n: number): string => t('Arrêt ajouté : {rang} sur {total}.', { rang: i + 1, total: n });

/** « Arrêt retiré : 2 arrêts restent. » */
export const phraseArretRetire = (n: number): string =>
  (n > 1 ? t('Arrêt retiré : {arrets} restent.', { arrets: pluriel(n, 'arrêt') }) : t('Arrêt retiré : {arrets} reste.', { arrets: pluriel(n, 'arrêt') }));

/** Ce qu'une poignee de la toile dit d'elle-meme en plus de sa valeur : comment la mouvoir. */
export const AIDE_POIGNEE_ARRET = t('Flèches : 1 %, Maj et flèches : 10 %. Suppr : retirer l’arrêt.');
export const AIDE_POIGNEE_EXTREMITE = t('Flèches : déplacer, Maj et flèches : dix fois plus.');

/** Un degrade garde deux arrets : la raison du bouton « Retirer » grise. */
export const RAISON_DEUX_ARRETS = t('Un dégradé garde au moins deux arrêts.');
/** Au-dela de 64 arrets : la raison du bouton « Ajouter » grise. */
export const RAISON_ARRETS_MAX = t('Un dégradé compte au plus 64 arrêts.');
