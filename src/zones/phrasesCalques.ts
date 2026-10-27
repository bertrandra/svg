// Ce que l'arbre des calques dit dans la region vocale (ADR-0011, ADR-0012 annexe 6 §1 et §7) : plier, deplier, deplacer, renommer.
// Les phrases tournent autour du verbe (« passe », « monte », « sort ») pour ne pas accorder un participe au genre d'une forme
// qu'on ne connait pas (« Triangle 3 », « Ellipse 2 », « Groupe « Nuage » »). Chaque phrase est une cle entiere de `t` (ADR-0042) :
// le verbe au singulier et au pluriel sont deux cles, puisqu'une autre langue ne les accorde pas au meme endroit.

import { groupeDe, type DessinSvg, type Groupe } from '../engine/editionSvg.js';
import { numeroDeForme } from '../engine/description.js';
import { t } from '../util/i18n.js';
import { pluriel } from '../util/texte.js';
import { genreAffiche } from './aidesEditeur.js';
import { groupeDit, nomDeGroupe } from './phrasesGroupes.js';

/** Le nom court d'un noeud, en tete de phrase : « Triangle 3 », « Groupe « Nuage » », « Groupe 3 ». */
export function nomCourt(d: DessinSvg, id: string): string {
  const g = groupeDe(d, id);
  if (g) return nomCourtGroupe(g);
  const f = d.formes.find(x => x.id === id);
  return f ? genreAffiche(f) + ' ' + numeroDeForme(f) : id;
}

/** Le sujet d'une phrase de deplacement : le nom d'un noeud seul, ou « 3 éléments ». */
const sujet = (d: DessinSvg, ids: readonly string[]): string => (ids.length === 1 ? nomCourt(d, ids[0] ?? '') : pluriel(ids.length, 'élément'));

/** Le lieu d'arrivee : « dans le groupe « Nuage » » ou « à la racine ». */
const lieu = (d: DessinSvg, groupe: string | null): string => {
  const g = groupe === null ? undefined : groupeDe(d, groupe);
  return g ? t('dans le {groupe}', { groupe: groupeDit(g) }) : t('à la racine');
};

export const phraseDeplie = (g: Groupe, enfants: number): string => t('{groupe} déplié : {elements}.', { groupe: nomCourtGroupe(g), elements: pluriel(enfants, 'élément') });
export const phraseReplie = (g: Groupe): string => t('{groupe} replié.', { groupe: nomCourtGroupe(g) });
const nomCourtGroupe = (g: Groupe): string => (g.nom ? t('Groupe « {nom} »', { nom: g.nom }) : nomDeGroupe(g));

/** Tous les groupes freres deplies (la touche *). */
export const phraseFreresDeplies = (n: number): string =>
  (n > 1 ? t('{groupes} dépliés.', { groupes: pluriel(n, 'groupe') }) : n === 1 ? t('{groupes} déplié.', { groupes: pluriel(n, 'groupe') }) : t('Aucun groupe à déplier à ce niveau.'));

/** « Triangle 3 passe dans le groupe « Nuage ». » — `d` est le dessin d'avant, qui nomme encore tout. */
export const phraseDeplacement = (d: DessinSvg, ids: readonly string[], vers: string | null): string => {
  const v = { sujet: sujet(d, ids), lieu: lieu(d, vers) };
  return ids.length === 1 ? t('{sujet} passe {lieu}.', v) : t('{sujet} passent {lieu}.', v);
};

/** Rien ne bouge : deja dans ce groupe. */
export const phraseDejaDans = (d: DessinSvg, ids: readonly string[], vers: string | null): string => {
  const v = { sujet: sujet(d, ids), lieu: lieu(d, vers) };
  return ids.length === 1 ? t('{sujet} est déjà {lieu}.', v) : t('{sujet} sont déjà {lieu}.', v);
};

/** Ctrl+Maj+Haut ou Bas : « Triangle 3 monte d'un rang. », ou la butee. */
export function phraseRang(d: DessinSvg, ids: readonly string[], sens: 'monte' | 'descend', bouge: boolean): string {
  const seul = ids.length === 1, s = sujet(d, ids);
  if (!bouge) {
    const v = { sujet: s, ou: sens === 'monte' ? t('au premier plan') : t('à l’arrière-plan') };
    return seul ? t('{sujet} est déjà {ou} de son niveau.', v) : t('{sujet} sont déjà {ou} de son niveau.', v);
  }
  if (sens === 'monte') return seul ? t('{sujet} monte d’un rang.', { sujet: s }) : t('{sujet} montent d’un rang.', { sujet: s });
  return seul ? t('{sujet} descend d’un rang.', { sujet: s }) : t('{sujet} descendent d’un rang.', { sujet: s });
}

/** Ctrl+Maj+Gauche : « Triangle 3 sort du groupe « Nuage » : à la racine. » */
export const phraseSortie = (d: DessinSvg, ids: readonly string[], de: string, vers: string | null): string => {
  const g = groupeDe(d, de);
  const v = { sujet: sujet(d, ids), groupe: g ? groupeDit(g) : t('groupe'), lieu: lieu(d, vers) };
  return ids.length === 1 ? t('{sujet} sort du {groupe}, {lieu}.', v) : t('{sujet} sortent du {groupe}, {lieu}.', v);
};

export const phraseDejaRacine = (d: DessinSvg, ids: readonly string[]): string =>
  (ids.length === 1 ? t('{sujet} est déjà à la racine.', { sujet: sujet(d, ids) }) : t('{sujet} sont déjà à la racine.', { sujet: sujet(d, ids) }));
export const PHRASE_PAS_DE_GROUPE_AU_DESSUS = t('Le calque juste au-dessus n’est pas un groupe : rien où entrer.');
export const PHRASE_MEME_GROUPE = t('Choisissez des éléments d’un même groupe pour les sortir ou les faire entrer ensemble.');
export const PHRASE_EN_LUI_MEME = t('Un groupe ne peut pas entrer en lui-même ni dans l’un de ses groupes.');
export const PHRASE_RIEN_A_DEPLACER = t('Rien n’est sélectionné à déplacer.');
export const PHRASE_FEUILLE_SANS_NOM = t('Seul un groupe se renomme : le nom d’une forme vient de son genre et de son numéro.');
export const PHRASE_VERROUILLE = t('Ce calque est verrouillé : déverrouillez-le pour le choisir.');

/** Apres F2 : le nom pose, ou retire (le groupe reprend « Groupe 3 »). */
export function phraseRenomme(g: Groupe, nom: string): string {
  if (nom.trim()) return t('Groupe renommé : « {nom} ».', { nom: nom.trim() });
  const { nom: _n, ...sansNom } = g;
  void _n;
  return t('Nom retiré : {groupe}.', { groupe: nomDeGroupe(sansNom) });
}
