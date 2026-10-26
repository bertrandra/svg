// Ce que l'editeur dit d'un texte pose sur ou dans une forme (ADR-0031), ou deforme dans une forme (ADR-0032) : la barre d'etat et
// la region vocale. Pur : des phrases, testees sans navigateur. Les tables de libelles sont des accesseurs : le dictionnaire de la
// langue est pose apres le chargement des modules (ADR-0042), le texte se traduit donc a la lecture, pas a l'import.

import type { DispositionTexte, Forme } from '../engine/editionSvg.js';
import type { RefusEnveloppe } from '../engine/texte/pose.js';
import { genreDeForme, nombreFr, numeroDeForme } from '../engine/description.js';
import { t } from '../util/i18n.js';
import { pluriel } from '../util/texte.js';

export type ModeDisposition = DispositionTexte['mode'];

/** Les deux facons de remplir une forme (ADR-0032) : en deformant les lettres (la barre « Dans la forme »), ou en lignes. */
export type ModeRemplir = Extract<ModeDisposition, 'enveloppe' | 'dans'>;

/** Vrai pour un texte dans la forme, deforme ou en lignes : le choix « Dans la forme » de la barre. */
export const remplit = (mode: ModeDisposition | undefined): mode is ModeRemplir => mode === 'dans' || mode === 'enveloppe';

/** Les libelles du choix « Remplir » du panneau. */
export const LIBELLES_REMPLIR: Readonly<Record<ModeRemplir, string>> = {
  get enveloppe() { return t('En déformant les lettres'); },
  get dans() { return t('En lignes'); }
};

/** « cercle 2 » : le nom court d'une forme, tel que les calques le montrent. */
export const nomCourt = (f: Forme): string => genreDeForme(f) + ' ' + numeroDeForme(f);

/** Les libelles des trois dispositions, ceux de la barre de texte et du panneau. */
export const LIBELLES_DISPOSITION: Readonly<Record<'libre' | 'sur' | 'dans', string>> = {
  get libre() { return t('Libre'); },
  get sur() { return t('Sur la forme'); },
  get dans() { return t('Dans la forme'); }
};

/** Ce que dit la barre d'etat quand on choisit la forme qui portera le texte. */
export const phraseChoixForme = (mode: ModeDisposition, tactile = false): string => {
  const verbe = tactile ? t('Touchez') : t('Cliquez');
  return mode === 'sur'
    ? t('{verbe} la forme sur laquelle poser le texte. Échap annule ; au clavier, Tab parcourt les formes et Entrée choisit.', { verbe })
    : t('{verbe} la forme dans laquelle poser le texte. Échap annule ; au clavier, Tab parcourt les formes et Entrée choisit.', { verbe });
};

/** Ce que dit un texte deforme qui ne se deforme pas (ADR-0032). */
export const PHRASES_REFUS_ENVELOPPE: Readonly<Record<RefusEnveloppe, string>> = {
  get 'texte-vide'() { return t('Ce texte ne dessine rien : il ne peut pas se déformer.'); },
  get 'forme-sans-aire'() { return t('Cette forme n’a pas d’intérieur : le texte ne peut pas s’y déformer. Choisissez une forme fermée (un cercle, un cœur…).'); },
  get marge() { return t('La marge ne laisse rien de la forme : réduisez-la, ou agrandissez la forme.'); }
};

/** Le texte depasse le trace, ou ne tient pas dans la forme : ce qu'on en dit (vide si tout est pose). */
export function phraseDepassement(mode: ModeDisposition, depasse: number, nonPlaces: number): string {
  // Un texte deforme remplit toujours toute la forme : rien ne depasse.
  if (mode === 'enveloppe') return '';
  if (mode === 'sur') return depasse > 0 ? t('Le texte dépasse le tracé de {lettres}.', { lettres: pluriel(depasse, 'lettre') }) : '';
  if (nonPlaces <= 0) return '';
  return nonPlaces > 1 ? t('{mots} ne tiennent pas dans la forme.', { mots: pluriel(nonPlaces, 'mot') }) : t('{mots} ne tient pas dans la forme.', { mots: pluriel(nonPlaces, 'mot') });
}

/** Le texte vient d'etre pose sur ou dans une forme. */
export function phrasePose(mode: ModeDisposition, base: Forme, depasse: number, nonPlaces: number): string {
  const suite = phraseDepassement(mode, depasse, nonPlaces), forme = nomCourt(base);
  return (mode === 'sur'
    ? t('Texte posé sur {forme} : il suit son tracé. La poignée de départ le fait glisser ; Ctrl+Z annule.', { forme })
    : mode === 'enveloppe' ? t('Texte déformé dans {forme} : il en prend la silhouette. « Plus d’options » le remplit en lignes ; Ctrl+Z annule.', { forme })
      : t('Texte posé dans {forme} : il remplit la forme en lignes. Ctrl+Z annule.', { forme })) + (suite ? ' ' + suite : '');
}

/** Aucun mot ne tenait a la taille du texte : elle s'est ajustee a la forme. */
export const PHRASE_TAILLE_AJUSTEE = t('Aucun mot ne tenait à cette taille : la taille s’ajuste à la forme (« Ajuster la taille », dans le panneau Texte).');

/** Pourquoi le champ de la taille est inactif : la taille s'ajuste aux lignes, ou la forme la donne au texte deforme (ADR-0032). */
export const RAISON_TAILLE_AJUSTEE = t('La taille s’ajuste à la forme : décochez « Ajuster la taille » pour la régler.');
export const RAISON_TAILLE_ENVELOPPE = t('La forme donne la taille du texte déformé : agrandissez la forme pour agrandir le texte.');

/** Le texte redevient libre, a la demande. */
export const PHRASE_LIBRE = t('Le texte redevient libre, en ligne droite. Ctrl+Z annule.');

/** La forme qui portait des textes a disparu : ils redeviennent libres. */
export function phraseFormePerdue(textes: readonly Forme[]): string {
  const premier = textes[0];
  if (!premier) return '';
  return textes.length > 1
    ? t('La forme qui portait {n} textes n’existe plus : ils redeviennent des textes libres, en ligne droite. Ctrl+Z rend la forme.', { n: textes.length })
    : t('La forme qui portait le {genre} n’existe plus : il redevient un texte libre, en ligne droite. Ctrl+Z rend la forme.', { genre: genreDeForme(premier) });
}

/** Une forme qui ne peut pas porter le texte (un texte, le texte lui-meme, une forme sans trace). */
export const PHRASE_FORME_REFUSEE = t('Cette forme ne peut pas porter le texte : choisissez une forme qui n’est pas un texte.');

/** Rien ne se dessine sur ou dans la forme choisie (trop petite, un mot plus large qu'elle, ou un texte qui ne se deforme pas). */
export const phraseRienNeTient = (mode: ModeDisposition, refus?: RefusEnveloppe): string =>
  (mode === 'sur' ? t('Aucune lettre ne tient sur ce tracé : agrandissez la forme ou réduisez la taille du texte.')
    : mode === 'enveloppe' ? PHRASES_REFUS_ENVELOPPE[refus ?? 'forme-sans-aire']
      : t('Aucun mot ne tient dans cette forme : agrandissez-la, réduisez la taille du texte, ou cochez « Ajuster la taille ».'));

/** Le texte remplit sa forme autrement (ADR-0032) : deforme, ou en lignes. */
export const phraseRemplir = (mode: ModeRemplir): string =>
  (mode === 'enveloppe' ? t('Le texte se déforme pour prendre la silhouette de la forme. Ctrl+Z annule.')
    : t('Le texte remplit la forme en lignes, ses lettres droites. Ctrl+Z annule.'));

/** La forme candidate, au clavier : « Forme 2 sur 5 : cercle 3. Entrée pose le texte. » */
export const phraseCandidate = (f: Forme, rang: number, total: number): string =>
  t('Forme {rang} sur {total} : {forme}. Entrée pose le texte, Échap annule.', { rang, total, forme: nomCourt(f) });

/** Le choix de la forme est abandonne. */
export const PHRASE_CHOIX_ANNULE = t('Choix de la forme annulé : le texte reste tel qu’il était.');

/** Aucune forme ne peut porter le texte. */
export const PHRASE_AUCUNE_CANDIDATE = t('Aucune forme du dessin ne peut porter ce texte : tracez d’abord une forme (un cercle, une courbe…).');

/** La forme de base est montree ou masquee. */
export const phraseFormeVisible = (visible: boolean): string =>
  (visible ? t('La forme de base est visible : elle s’écrit dans le fichier.') : t('La forme de base est masquée : elle ne s’écrit pas, seul le texte reste ; le lien est gardé.'));

/** Le point de depart a bouge (la poignee, au clavier) : en pour cent du trace. */
export const phraseDepart = (depart: number): string => t('Départ à {pourcent} % du tracé.', { pourcent: nombreFr(Math.round(depart * 1000) / 10) });
