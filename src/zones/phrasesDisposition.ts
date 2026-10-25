// Ce que l'editeur dit d'un texte pose sur ou dans une forme (ADR-0031) : la barre d'etat et la region vocale. Pur : des phrases,
// testees sans navigateur.

import type { DispositionTexte, Forme } from '../engine/editionSvg.js';
import { genreDeForme, nombreFr, numeroDeForme } from '../engine/description.js';
import { pluriel } from '../util/texte.js';

export type ModeDisposition = DispositionTexte['mode'];

/** « cercle 2 » : le nom court d'une forme, tel que les calques le montrent. */
export const nomCourt = (f: Forme): string => genreDeForme(f) + ' ' + numeroDeForme(f);

/** Les libelles des trois dispositions, ceux de la barre de texte et du panneau. */
export const LIBELLES_DISPOSITION = { libre: 'Libre', sur: 'Sur la forme', dans: 'Dans la forme' } as const;

/** Ce que dit la barre d'etat quand on choisit la forme qui portera le texte. */
export const phraseChoixForme = (mode: ModeDisposition, tactile = false): string =>
  (tactile ? 'Touchez' : 'Cliquez') + ' la forme ' + (mode === 'sur' ? 'sur laquelle poser' : 'dans laquelle poser') + ' le texte. Échap annule ; au clavier, Tab parcourt les formes et Entrée choisit.';

/** Le texte depasse le trace, ou ne tient pas dans la forme : ce qu'on en dit (vide si tout est pose). */
export function phraseDepassement(mode: ModeDisposition, depasse: number, nonPlaces: number): string {
  if (mode === 'sur') return depasse > 0 ? 'Le texte dépasse le tracé de ' + pluriel(depasse, 'lettre') + '.' : '';
  return nonPlaces > 0 ? pluriel(nonPlaces, 'mot') + (nonPlaces > 1 ? ' ne tiennent pas' : ' ne tient pas') + ' dans la forme.' : '';
}

/** Le texte vient d'etre pose sur ou dans une forme. */
export function phrasePose(mode: ModeDisposition, base: Forme, depasse: number, nonPlaces: number): string {
  const suite = phraseDepassement(mode, depasse, nonPlaces);
  return (mode === 'sur'
    ? 'Texte posé sur ' + nomCourt(base) + ' : il suit son tracé. La poignée de départ le fait glisser ; Ctrl+Z annule.'
    : 'Texte posé dans ' + nomCourt(base) + ' : il remplit la forme. Ctrl+Z annule.') + (suite ? ' ' + suite : '');
}

/** Aucun mot ne tenait a la taille du texte : elle s'est ajustee a la forme. */
export const PHRASE_TAILLE_AJUSTEE = 'Aucun mot ne tenait à cette taille : la taille s’ajuste à la forme (« Ajuster la taille », dans le panneau Texte).';

/** Le texte redevient libre, a la demande. */
export const PHRASE_LIBRE = 'Le texte redevient libre, en ligne droite. Ctrl+Z annule.';

/** La forme qui portait des textes a disparu : ils redeviennent libres. */
export function phraseFormePerdue(textes: readonly Forme[]): string {
  const premier = textes[0];
  if (!premier) return '';
  return textes.length > 1
    ? 'La forme qui portait ' + textes.length + ' textes n’existe plus : ils redeviennent des textes libres, en ligne droite. Ctrl+Z rend la forme.'
    : 'La forme qui portait le ' + genreDeForme(premier) + ' n’existe plus : il redevient un texte libre, en ligne droite. Ctrl+Z rend la forme.';
}

/** Une forme qui ne peut pas porter le texte (un texte, le texte lui-meme, une forme sans trace). */
export const PHRASE_FORME_REFUSEE = 'Cette forme ne peut pas porter le texte : choisissez une forme qui n’est pas un texte.';

/** Rien ne se dessine sur ou dans la forme choisie (trop petite, ou un mot plus large qu'elle). */
export const phraseRienNeTient = (mode: ModeDisposition): string =>
  mode === 'sur' ? 'Aucune lettre ne tient sur ce tracé : agrandissez la forme ou réduisez la taille du texte.'
    : 'Aucun mot ne tient dans cette forme : agrandissez-la, réduisez la taille du texte, ou cochez « Ajuster la taille ».';

/** La forme candidate, au clavier : « Forme 2 sur 5 : cercle 3. Entrée pose le texte. » */
export const phraseCandidate = (f: Forme, rang: number, total: number): string => 'Forme ' + rang + ' sur ' + total + ' : ' + nomCourt(f) + '. Entrée pose le texte, Échap annule.';

/** Le choix de la forme est abandonne. */
export const PHRASE_CHOIX_ANNULE = 'Choix de la forme annulé : le texte reste tel qu’il était.';

/** Aucune forme ne peut porter le texte. */
export const PHRASE_AUCUNE_CANDIDATE = 'Aucune forme du dessin ne peut porter ce texte : tracez d’abord une forme (un cercle, une courbe…).';

/** La forme de base est montree ou masquee. */
export const phraseFormeVisible = (visible: boolean): string =>
  visible ? 'La forme de base est visible : elle s’écrit dans le fichier.' : 'La forme de base est masquée : elle ne s’écrit pas, seul le texte reste ; le lien est gardé.';

/** Le point de depart a bouge (la poignee, au clavier) : en pour cent du trace. */
export const phraseDepart = (depart: number): string => 'Départ à ' + nombreFr(Math.round(depart * 1000) / 10) + ' % du tracé.';
