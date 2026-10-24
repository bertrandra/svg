// Les phrases que l'editeur dit aux lecteurs d'ecran (une seule region « polite », voir RegionVocale.tsx).
// Pures : le dessin et ce qui a change en entree, une phrase en sortie. Courtes, parce qu'on les entend
// a chaque Tab ; le detail est dans l'inspecteur.

import { ancre, boiteDe, type DessinSvg, type Forme } from '../engine/editionSvg.js';
import { genreDeForme, mesuresDites, nombreFr, numeroDeForme, peintureDite } from '../engine/description.js';
import { boiteDeDeuxCoins, indicesDePoints, type PointPlan } from '../engine/navigation.js';
import { pluriel } from '../util/texte.js';
import type { Outil } from './typesEditeur.js';

/** Une annonce a faire : le texte, et un rang qui change a chaque fois, meme pour un texte identique. */
export interface Annonce { texte: string; rang: number }

/** « Forme 3 sélectionnée : rectangle, fond rouge #c81e28, 120 × 80 à 40, 60. » ; « 4 formes sélectionnées. » */
export function phraseSelection(d: DessinSvg, sel: readonly string[], ajout = false): string {
  if (!sel.length) return 'Sélection vidée.';
  const choisies = d.formes.filter(f => sel.includes(f.id));
  const f = choisies[0];
  if (choisies.length !== 1 || !f) return pluriel(sel.length, 'forme') + ' sélectionnée' + (sel.length > 1 ? 's' : '') + '.';
  const mesures = mesuresDites(f);
  return 'Forme ' + numeroDeForme(f) + (ajout ? ' ajoutée et sélectionnée' : ' sélectionnée') + ' : ' + genreDeForme(f) + ', ' + peintureDite(f) + (mesures ? ', ' + mesures : '') + '.';
}

/** Ce que l'outil change au clavier : la phrase dite quand on le prend. */
export function phraseOutil(outil: Outil): string {
  switch (outil) {
    case 'selection': return 'Outil sélection : Tab passe à la forme suivante, flèches déplacent, Alt et flèches redimensionnent, Ctrl et flèches tournent.';
    case 'points': return 'Outil points : Tab passe au point suivant, flèches déplacent le point.';
    case 'main': return 'Outil main : déplacer la vue à la souris ou au doigt.';
    case 'texte': return 'Outil texte : Entrée ouvre le champ de saisie du panneau, puis Tab mène à « Ajouter le texte ».';
    case 'plume': return 'Outil plume : flèches déplacent le réticule, Entrée pose un point, Maj et Entrée termine le tracé, Échap abandonne.';
    default: return 'Outil ' + outil + ' : flèches déplacent le réticule, Entrée pose la forme, Espace pose un coin puis l’autre.';
  }
}

const GENRE_POINT: Record<string, string> = { M: 'départ', L: 'angle', C: 'courbe', Q: 'courbe' };

/** « Point 3 sur 8 : courbe, à 40, 60. » : le rang parmi les points de la forme, sa nature, sa place. */
export function phrasePoint(f: Forme, indice: number): string {
  const c = f.d[indice], a = c ? ancre(c) : null, pts = indicesDePoints(f.d);
  if (!c || !a) return 'Aucun point actif.';
  return 'Point ' + (pts.indexOf(indice) + 1) + ' sur ' + pts.length + ' : ' + (GENRE_POINT[c.c] ?? 'point') + ', à ' + nombreFr(a[0]) + ', ' + nombreFr(a[1]) + '.';
}

/** Ou se trouve la selection apres un deplacement : « À 41, 60. » */
export function phrasePosition(d: DessinSvg, ids: readonly string[]): string {
  const b = boiteDe(d, ids);
  return b ? 'À ' + nombreFr(b.x) + ', ' + nombreFr(b.y) + '.' : '';
}

/** La taille de la selection apres un redimensionnement : « 130 × 80. » */
export function phraseTaille(d: DessinSvg, ids: readonly string[]): string {
  const b = boiteDe(d, ids);
  return b ? nombreFr(b.l) + ' × ' + nombreFr(b.h) + '.' : '';
}

/** Une rotation : « Tournée de 15° vers la droite. » */
export const phraseRotation = (degres: number): string => 'Tournée de ' + nombreFr(Math.abs(degres)) + '° vers la ' + (degres > 0 ? 'droite' : 'gauche') + '.';

/** Le reticule du clavier, dit par sa place sur le plan. */
export const phraseReticule = (p: PointPlan): string => 'Réticule à ' + nombreFr(p[0]) + ', ' + nombreFr(p[1]) + '.';

/** Le zoom, en pourcentage entier. */
export const phraseZoom = (zoom: number): string => 'Zoom ' + Math.round(zoom * 100) + ' %.';

/** Le premier coin d'une forme a deux coins vient d'etre pose : de quoi continuer sans voir l'ecran. */
export const phrasePremierCoin = (p: PointPlan): string =>
  'Premier coin posé à ' + nombreFr(p[0]) + ', ' + nombreFr(p[1]) + '. Flèches : déplacer l’autre coin. Espace ou Entrée : le poser. Échap : annuler.';

/** L'autre coin se deplace : sa place et ce que la forme mesure maintenant, « Coin opposé à 80, 90 : 40 × 30. » */
export function phraseCoinOppose(premier: PointPlan, autre: PointPlan): string {
  const b = boiteDeDeuxCoins(premier, autre);
  return 'Coin opposé à ' + nombreFr(autre[0]) + ', ' + nombreFr(autre[1]) + ' : ' + nombreFr(b.l) + ' × ' + nombreFr(b.h) + '.';
}

export const PHRASE_COIN_ANNULE = 'Premier coin annulé : l’outil reste pris.';
export const PHRASE_COINS_TROP_PROCHES = 'Les deux coins sont trop proches : déplacez l’autre coin, ou Échap annule.';

/** Ce que Maj et Page suivante, ou Espace, ont fait a la selection : « Forme 4 ajoutée : 3 formes sélectionnées. » */
export function phraseBascule(id: string, etat: 'ajoutee' | 'retiree' | 'deja', total: number): string {
  const dit = { ajoutee: 'ajoutée', retiree: 'retirée', deja: 'déjà sélectionnée' }[etat];
  const reste = total === 0 ? 'plus aucune forme sélectionnée' : pluriel(total, 'forme') + ' sélectionnée' + (total > 1 ? 's' : '');
  return 'Forme ' + id.slice(1) + ' ' + dit + ' : ' + reste + '.';
}

/** Espace sans forme au curseur : dire comment en avoir une. */
export const PHRASE_SANS_CURSEUR = 'Aucune forme au curseur : Page suivante en choisit une, Maj et Page suivante en ajoute une.';

/** Entree avec l'outil texte : le champ du panneau a pris le focus. */
export const PHRASE_CHAMP_TEXTE = 'Champ Texte : saisissez le texte, puis Tab mène à « Ajouter le texte ».';
export const PHRASE_PANNEAU_TEXTE = 'Panneau de l’inspecteur ouvert : Tab mène au champ Texte, puis à « Ajouter le texte ».';
