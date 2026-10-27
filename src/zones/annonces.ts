// Les phrases que l'editeur dit aux lecteurs d'ecran (une seule region « polite », voir RegionVocale.tsx).
// Pures : le dessin et ce qui a change en entree, une phrase en sortie. Courtes, parce qu'on les entend
// a chaque Tab ; le detail est dans l'inspecteur.

import { ancre, boiteDe, FICHES_FORMES, type DessinSvg, type Forme } from '../engine/editionSvg.js';
import { detailsGroupe, genreDeForme, mesuresDites, nombreFr, nomDeGroupe, numeroDeForme, peintureDite } from '../engine/description.js';
import { boiteDeDeuxCoins, indicesDePoints, type PointPlan } from '../engine/navigation.js';
import { pluriel } from '../util/texte.js';
import { t } from '../util/i18n.js';
import type { Outil } from './typesEditeur.js';

/** Une annonce a faire : le texte, et un rang qui change a chaque fois, meme pour un texte identique. */
export interface Annonce { texte: string; rang: number }

/**
 * « Forme 3 sélectionnée : rectangle, fond rouge #c81e28, 120 × 80 à 40, 60. » ; « 4 formes sélectionnées. ». Un groupe d'un dessin
 * riche (ADR-0012, annexe 6 §7) : « Groupe « Nuage » sélectionné : 3 formes, 80 × 40 à 10, 20. » ; plusieurs noeuds dont un groupe :
 * « 3 éléments sélectionnés. ». Une selection de feuilles se dit comme avant.
 */
export function phraseSelection(d: DessinSvg, sel: readonly string[], ajout = false): string {
  if (!sel.length) return t('Sélection vidée.');
  const groupe = d.groupes ? sel.find(id => Object.prototype.hasOwnProperty.call(d.groupes, id)) : undefined;
  if (groupe !== undefined && d.groupes) {
    const g = d.groupes[groupe];
    if (sel.length > 1 || !g) return t('{elements} sélectionnés.', { elements: pluriel(sel.length, 'élément') });
    const v = { nom: nomDeGroupe(g), details: detailsGroupe(d, g) };
    return g.nom ? t('Groupe « {nom} » sélectionné : {details}.', v) : t('{nom} sélectionné : {details}.', v);
  }
  const choisies = d.formes.filter(f => sel.includes(f.id));
  const f = choisies[0];
  if (choisies.length !== 1 || !f) return sel.length > 1 ? t('{formes} sélectionnées.', { formes: pluriel(sel.length, 'forme') }) : t('{formes} sélectionnée.', { formes: pluriel(sel.length, 'forme') });
  const mesures = mesuresDites(f);
  const v = { numero: numeroDeForme(f), genre: t(genreDeForme(f)), peinture: peintureDite(f), mesures: mesures ? ', ' + mesures : '' };
  return ajout ? t('Forme {numero} ajoutée et sélectionnée : {genre}, {peinture}{mesures}.', v) : t('Forme {numero} sélectionnée : {genre}, {peinture}{mesures}.', v);
}

/** Ce que l'outil change au clavier : la phrase dite quand on le prend. */
export function phraseOutil(outil: Outil): string {
  switch (outil) {
    case 'selection': return t('Outil sélection : Tab passe à la forme suivante, flèches déplacent, Alt et flèches redimensionnent, Ctrl et flèches tournent.');
    case 'points': return t('Outil points : Tab passe au point suivant, flèches déplacent le point.');
    case 'main': return t('Outil main : déplacer la vue à la souris ou au doigt.');
    case 'texte': return t('Outil texte : flèches déplacent le point d’insertion, Entrée ouvre la saisie sur la toile ; à la souris, cliquez où écrire.');
    case 'plume': return t('Outil plume : flèches déplacent le réticule, Entrée pose un point, Maj et Entrée termine le tracé, Échap abandonne.');
    case 'cadre': return t('Outil cadre de sélection : glissez, même sur une forme ; au clavier, flèches déplacent le réticule, Espace pose un coin, Entrée prend les formes du cadre, Maj et Entrée les ajoute.');
    case 'lasso': return t('Outil lasso : entourez les formes à main levée ; au clavier, flèches déplacent le réticule, Espace pose un point, Entrée ferme le lasso et prend les formes.');
    default: return t('Outil {nom} : flèches déplacent le réticule, Entrée pose la forme, Espace pose un coin puis l’autre.', { nom: t(FICHES_FORMES[outil].nom) });
  }
}

// Dits a l'appel : la langue n'est posee qu'apres le chargement des modules.
const GENRE_POINT: Record<string, () => string> = { M: () => t('départ'), L: () => t('angle'), C: () => t('courbe'), Q: () => t('courbe') };

/** « Point 3 sur 8 : courbe, à 40, 60. » : le rang parmi les points de la forme, sa nature, sa place. */
export function phrasePoint(f: Forme, indice: number): string {
  const c = f.d[indice], a = c ? ancre(c) : null, pts = indicesDePoints(f.d);
  if (!c || !a) return t('Aucun point actif.');
  return t('Point {rang} sur {total} : {genre}, à {x}, {y}.', { rang: pts.indexOf(indice) + 1, total: pts.length, genre: GENRE_POINT[c.c]?.() ?? t('point'), x: nombreFr(a[0]), y: nombreFr(a[1]) });
}

/** Ou se trouve la selection apres un deplacement : « À 41, 60. » */
export function phrasePosition(d: DessinSvg, ids: readonly string[]): string {
  const b = boiteDe(d, ids);
  return b ? t('À {x}, {y}.', { x: nombreFr(b.x), y: nombreFr(b.y) }) : '';
}

/** La taille de la selection apres un redimensionnement : « 130 × 80. » */
export function phraseTaille(d: DessinSvg, ids: readonly string[]): string {
  const b = boiteDe(d, ids);
  return b ? nombreFr(b.l) + ' × ' + nombreFr(b.h) + '.' : '';
}

/** Une rotation : « Tournée de 15° vers la droite. » */
export const phraseRotation = (degres: number): string => (degres > 0 ? t('Tournée de {n}° vers la droite.', { n: nombreFr(Math.abs(degres)) }) : t('Tournée de {n}° vers la gauche.', { n: nombreFr(Math.abs(degres)) }));

/** Le reticule du clavier, dit par sa place sur le plan. */
export const phraseReticule = (p: PointPlan): string => t('Réticule à {x}, {y}.', { x: nombreFr(p[0]), y: nombreFr(p[1]) });

/** Le zoom, en pourcentage entier. */
export const phraseZoom = (zoom: number): string => t('Zoom {n} %.', { n: Math.round(zoom * 100) });

/** Le premier coin d'une forme a deux coins vient d'etre pose : de quoi continuer sans voir l'ecran. */
export const phrasePremierCoin = (p: PointPlan): string =>
  t('Premier coin posé à {x}, {y}. Flèches : déplacer l’autre coin. Espace ou Entrée : le poser. Échap : annuler.', { x: nombreFr(p[0]), y: nombreFr(p[1]) });

/** L'autre coin se deplace : sa place et ce que la forme mesure maintenant, « Coin opposé à 80, 90 : 40 × 30. » */
export function phraseCoinOppose(premier: PointPlan, autre: PointPlan): string {
  const b = boiteDeDeuxCoins(premier, autre);
  return t('Coin opposé à {x}, {y} : {l} × {h}.', { x: nombreFr(autre[0]), y: nombreFr(autre[1]), l: nombreFr(b.l), h: nombreFr(b.h) });
}

export const phraseCoinAnnule = (): string => t('Premier coin annulé : l’outil reste pris.');
export const phraseCoinsTropProches = (): string => t('Les deux coins sont trop proches : déplacez l’autre coin, ou Échap annule.');

/** Ce que Maj et Page suivante, ou Espace, ont fait a la selection : « Forme 4 ajoutée : 3 formes sélectionnées. » */
export function phraseBascule(id: string, etat: 'ajoutee' | 'retiree' | 'deja', total: number): string {
  // Un groupe d'un dessin riche (`g3`, ADR-0012, etape 2) se dit « Groupe 3 », au masculin ; une forme, comme avant.
  if (/^g\d+$/.test(id)) {
    const dit = etat === 'ajoutee' ? t('ajouté') : etat === 'retiree' ? t('retiré') : t('déjà sélectionné');
    const elements = pluriel(total, 'élément');
    const reste = total === 0 ? t('plus rien de sélectionné') : total > 1 ? t('{elements} sélectionnés', { elements }) : t('{elements} sélectionné', { elements });
    return t('Groupe {n} {dit} : {reste}.', { n: id.slice(1), dit, reste });
  }
  const dit = etat === 'ajoutee' ? t('ajoutée') : etat === 'retiree' ? t('retirée') : t('déjà sélectionnée');
  const formes = pluriel(total, 'forme');
  const reste = total === 0 ? t('plus aucune forme sélectionnée') : total > 1 ? t('{formes} sélectionnées', { formes }) : t('{formes} sélectionnée', { formes });
  return t('Forme {n} {dit} : {reste}.', { n: id.slice(1), dit, reste });
}

/** Espace sans forme au curseur : dire comment en avoir une. */
export const phraseSansCurseur = (): string => t('Aucune forme au curseur : Page suivante en choisit une, Maj et Page suivante en ajoute une.');
