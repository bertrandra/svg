// Ce que l'arbre des calques dit dans la region vocale (ADR-0011, ADR-0012 annexe 6 §1 et §7) : plier, deplier, deplacer, renommer.
// Les phrases tournent autour du verbe (« passe », « monte », « sort ») pour ne pas accorder un participe au genre d'une forme
// qu'on ne connait pas (« Triangle 3 », « Ellipse 2 », « Groupe « Nuage » »).

import { groupeDe, type DessinSvg, type Groupe } from '../engine/editionSvg.js';
import { numeroDeForme } from '../engine/description.js';
import { pluriel } from '../util/texte.js';
import { genreAffiche } from './aidesEditeur.js';
import { groupeDit, nomDeGroupe } from './phrasesGroupes.js';

/** Le nom court d'un noeud, en tete de phrase : « Triangle 3 », « Groupe « Nuage » », « Groupe 3 ». */
export function nomCourt(d: DessinSvg, id: string): string {
  const g = groupeDe(d, id);
  if (g) return g.nom ? 'Groupe « ' + g.nom + ' »' : nomDeGroupe(g);
  const f = d.formes.find(x => x.id === id);
  return f ? genreAffiche(f) + ' ' + numeroDeForme(f) : id;
}

/** Le sujet d'une phrase de deplacement : le nom d'un noeud seul, ou « 3 éléments ». */
const sujet = (d: DessinSvg, ids: readonly string[]): string => (ids.length === 1 ? nomCourt(d, ids[0] ?? '') : pluriel(ids.length, 'élément'));
/** Le verbe accorde au nombre : « passe » ou « passent ». */
const verbe = (ids: readonly string[], singulier: string, plurielV: string): string => (ids.length === 1 ? singulier : plurielV);

/** Le lieu d'arrivee : « dans le groupe « Nuage » » ou « à la racine ». */
const lieu = (d: DessinSvg, groupe: string | null): string => {
  const g = groupe === null ? undefined : groupeDe(d, groupe);
  return g ? 'dans le ' + groupeDit(g) : 'à la racine';
};

export const phraseDeplie = (g: Groupe, enfants: number): string => nomCourtGroupe(g) + ' déplié : ' + pluriel(enfants, 'élément') + '.';
export const phraseReplie = (g: Groupe): string => nomCourtGroupe(g) + ' replié.';
const nomCourtGroupe = (g: Groupe): string => (g.nom ? 'Groupe « ' + g.nom + ' »' : nomDeGroupe(g));

/** Tous les groupes freres deplies (la touche *). */
export const phraseFreresDeplies = (n: number): string => (n ? pluriel(n, 'groupe') + ' déplié' + (n > 1 ? 's' : '') + '.' : 'Aucun groupe à déplier à ce niveau.');

/** « Triangle 3 passe dans le groupe « Nuage ». » — `d` est le dessin d'avant, qui nomme encore tout. */
export const phraseDeplacement = (d: DessinSvg, ids: readonly string[], vers: string | null): string =>
  sujet(d, ids) + ' ' + verbe(ids, 'passe', 'passent') + ' ' + lieu(d, vers) + '.';

/** Rien ne bouge : deja dans ce groupe. */
export const phraseDejaDans = (d: DessinSvg, ids: readonly string[], vers: string | null): string =>
  sujet(d, ids) + ' ' + verbe(ids, 'est', 'sont') + ' déjà ' + lieu(d, vers) + '.';

/** Ctrl+Maj+Haut ou Bas : « Triangle 3 monte d'un rang. », ou la butee. */
export function phraseRang(d: DessinSvg, ids: readonly string[], sens: 'monte' | 'descend', bouge: boolean): string {
  if (!bouge) return sujet(d, ids) + ' ' + verbe(ids, 'est', 'sont') + ' déjà ' + (sens === 'monte' ? 'au premier plan' : 'à l’arrière-plan') + ' de son niveau.';
  return sujet(d, ids) + ' ' + (sens === 'monte' ? verbe(ids, 'monte', 'montent') : verbe(ids, 'descend', 'descendent')) + ' d’un rang.';
}

/** Ctrl+Maj+Gauche : « Triangle 3 sort du groupe « Nuage » : à la racine. » */
export const phraseSortie = (d: DessinSvg, ids: readonly string[], de: string, vers: string | null): string => {
  const g = groupeDe(d, de);
  return sujet(d, ids) + ' ' + verbe(ids, 'sort', 'sortent') + ' du ' + (g ? groupeDit(g) : 'groupe') + ', ' + lieu(d, vers) + '.';
};

export const phraseDejaRacine = (d: DessinSvg, ids: readonly string[]): string => sujet(d, ids) + ' ' + verbe(ids, 'est', 'sont') + ' déjà à la racine.';
export const PHRASE_PAS_DE_GROUPE_AU_DESSUS = 'Le calque juste au-dessus n’est pas un groupe : rien où entrer.';
export const PHRASE_MEME_GROUPE = 'Choisissez des éléments d’un même groupe pour les sortir ou les faire entrer ensemble.';
export const PHRASE_EN_LUI_MEME = 'Un groupe ne peut pas entrer en lui-même ni dans l’un de ses groupes.';
export const PHRASE_RIEN_A_DEPLACER = 'Rien n’est sélectionné à déplacer.';
export const PHRASE_FEUILLE_SANS_NOM = 'Seul un groupe se renomme : le nom d’une forme vient de son genre et de son numéro.';
export const PHRASE_VERROUILLE = 'Ce calque est verrouillé : déverrouillez-le pour le choisir.';

/** Apres F2 : le nom pose, ou retire (le groupe reprend « Groupe 3 »). */
export function phraseRenomme(g: Groupe, nom: string): string {
  if (nom.trim()) return 'Groupe renommé : « ' + nom.trim() + ' ».';
  const { nom: _n, ...sansNom } = g;
  void _n;
  return 'Nom retiré : ' + nomDeGroupe(sansNom) + '.';
}
