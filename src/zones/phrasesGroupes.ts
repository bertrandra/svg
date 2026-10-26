// Ce que l'editeur dit des groupes (ADR-0012, annexe 6 §7) : entrer dans un groupe, en sortir, grouper, degrouper, et le nom d'un
// groupe pris sur la toile. Les briques (nom, detail) sont dans engine/description.ts, pures comme celles des formes ; ici, les
// phrases entieres que la region vocale dit.

import { arbreDe, type DessinSvg, type NoeudArbre } from '../engine/editionSvg.js';
import { groupeDit, nomDeGroupe } from '../engine/description.js';
import { t } from '../util/i18n.js';
import { pluriel } from '../util/texte.js';

export { groupeDit, nomDeGroupe };

/** La phrase d'entree dans un groupe (son nom, le nombre de ses elements) ; null si `id` n'est pas un groupe du dessin. */
export function phraseEntreeGroupe(d: DessinSvg, id: string): string | null {
  const n = arbreDe(d).parId.get(id);
  if (n?.genre !== 'groupe') return null;
  return t('Dans le {groupe}, {elements}.', { groupe: groupeDit(n.groupe), elements: pluriel(n.enfants.length, 'élément') });
}

export const PHRASE_RACINE = t('Retour à la racine.');

/** « 3 formes » quand il n'y a que des feuilles, « 3 éléments » des qu'un groupe en est : ce qu'on compte se nomme juste. */
export function elementsDits(d: DessinSvg, ids: readonly string[]): string {
  const a = arbreDe(d), groupe = ids.some(id => a.parId.get(id)?.genre === 'groupe');
  return groupe ? pluriel(ids.length, 'élément') : pluriel(ids.length, 'forme');
}

/** « Groupe créé : 3 formes. » (annexe 6 §7) ; `ids` sont les noeuds qu'il a reunis, lus dans le dessin d'avant. */
export const phraseGroupeCree = (avant: DessinSvg, ids: readonly string[]): string => t('Groupe créé : {elements}.', { elements: elementsDits(avant, ids) });

/**
 * « Groupe défait : 3 formes. », « 2 groupes défaits : 5 éléments. » ; `enfants` sont les noeuds remontes, lus dans le dessin d'apres.
 * Un groupe qui portait une opacite, une decoupe, un masque ou des effets les perd : la phrase le dit, puisque rien ne le montre.
 */
export function phraseGroupeDefait(apres: DessinSvg, n: number, enfants: readonly string[], porteurs: number): string {
  const v = { tete: n > 1 ? t('{n} groupes défaits', { n }) : t('Groupe défait'), elements: elementsDits(apres, enfants) };
  const phrase = t('{tete} : {elements}.', v);
  if (!porteurs) return phrase;
  return phrase + ' ' + (porteurs > 1
    ? t('L’opacité, la découpe, le masque ou les effets de ces groupes sont retirés ; Ctrl+Z les rend.')
    : t('L’opacité, la découpe, le masque ou les effets du groupe sont retirés ; Ctrl+Z les rend.'));
}

/** Le chemin du contexte, de la racine au groupe ou l'on est : les groupes, du plus haut au plus proche (vide a la racine). */
export function cheminGroupes(d: DessinSvg, contexte: string | null): NoeudArbre[] {
  const a = arbreDe(d), out: NoeudArbre[] = [];
  const vus = new Set<string>();
  for (let id = contexte; id !== null && !vus.has(id);) {
    const n = a.parId.get(id);
    if (n?.genre !== 'groupe') break;
    vus.add(id);
    out.unshift(n);
    id = n.groupe.parent ?? null;
  }
  return out;
}

/** La phrase du niveau ou l'on arrive : « Dans le groupe « Nuage », 2 éléments. », ou « Retour à la racine. ». */
export const phraseNiveau = (d: DessinSvg, contexte: string | null): string => (contexte !== null ? phraseEntreeGroupe(d, contexte) : null) ?? PHRASE_RACINE;
