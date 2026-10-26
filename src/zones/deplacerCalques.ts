// Les deplacements de l'arbre des calques (ADR-0012, annexe 6 §1) : les alternatives au glisser. Ctrl+Maj+Haut et Bas montent et
// descendent parmi les freres, Ctrl+Maj+Gauche sort du groupe (le noeud devient frere de son parent, juste sous lui), Ctrl+Maj+Droite
// entre dans le frere juste au-dessus s'il est un groupe (tout en bas de ses enfants : l'ordre de peinture ne change pas, et
// Ctrl+Maj+Gauche l'en ressort a la meme place) ; « Déplacer vers… » et le glisser-deposer passent au premier plan d'un groupe.
//
// Pur : chaque fonction rend le dessin d'apres (le meme quand rien ne bouge), la phrase a dire et les groupes a deplier pour que le
// noeud deplace reste visible dans l'arbre. Les operations sont celles du moteur (edition/groupes.ts) ; rien n'est ecrit ici.

import { ancetres, deplacerDans, groupeDe, ordonnerNoeuds, renommer, unites, type DessinSvg } from '../engine/editionSvg.js';
import { enfantsDe, idNoeud, parentDe } from './lignesCalques.js';
import {
  PHRASE_EN_LUI_MEME, PHRASE_MEME_GROUPE, PHRASE_PAS_DE_GROUPE_AU_DESSUS, PHRASE_RIEN_A_DEPLACER, phraseDejaDans, phraseDejaRacine, phraseDeplacement, phraseRang, phraseRenomme,
  phraseSortie
} from './phrasesCalques.js';

export interface Deplacement {
  readonly dessin: DessinSvg;
  readonly phrase: string;
  /** Les groupes a deplier pour voir les noeuds a leur nouvelle place (la destination et ses ancetres). */
  readonly deplier: readonly string[];
}

const rien = (d: DessinSvg, phrase: string): Deplacement => ({ dessin: d, phrase, deplier: [] });
const ouvrir = (d: DessinSvg, groupe: string | null): string[] => (groupe === null ? [] : [groupe, ...ancetres(d, groupe)]);

/**
 * Les noeuds sur lesquels agit un geste fait sur la ligne `id` : la selection si la ligne en est (on agit sur ce qu'on a choisi),
 * sinon la ligne seule. Les unites seulement : un enfant d'un groupe choisi part avec lui.
 */
export function ciblesDe(d: DessinSvg, id: string, sel: readonly string[]): string[] {
  return sel.includes(id) ? unites(d, sel) : [id];
}

/** Ctrl+Maj+Haut (`monte`, vers le premier plan) ou Ctrl+Maj+Bas, chaque noeud parmi ses freres. */
export function changerDeRang(d: DessinSvg, ids: readonly string[], sens: 'monte' | 'descend'): Deplacement {
  if (!ids.length) return rien(d, PHRASE_RIEN_A_DEPLACER);
  const apres = ordonnerNoeuds(d, ids, sens === 'monte' ? 'avant' : 'arriere');
  return { dessin: apres, phrase: phraseRang(d, ids, sens, apres !== d), deplier: [] };
}

/** Les noeuds qui partagent le parent de `ref` (ceux qui peuvent sortir ou entrer ensemble), `ref` compris. */
function freresDe(d: DessinSvg, ref: string, ids: readonly string[]): string[] {
  const p = parentDe(d, ref);
  const t = ids.filter(id => parentDe(d, id) === p);
  return t.includes(ref) ? t : [ref, ...t];
}

/**
 * Ctrl+Maj+Gauche : les noeuds sortent de leur groupe et deviennent freres de lui, juste sous lui dans la liste (derriere lui a la
 * peinture). S'ils etaient tous ses enfants, le groupe disparait (aucun groupe n'est vide) et ils prennent sa place.
 */
export function sortirDuGroupe(d: DessinSvg, ref: string, ids: readonly string[]): Deplacement {
  const cibles = freresDe(d, ref, ids);
  if (cibles.length !== ids.length && ids.length > 1) return rien(d, PHRASE_MEME_GROUPE);
  const parent = parentDe(d, ref);
  if (parent === null) return rien(d, phraseDejaRacine(d, cibles));
  const grand = parentDe(d, parent);
  const choisis = new Set(cibles);
  const restent = enfantsDe(d, parent).some(n => !choisis.has(idNoeud(n)));
  let avant: string | undefined = parent;
  if (!restent) {
    // Le groupe va disparaitre : se poser sous le frere qui est juste au-dessus de lui, c'est prendre sa place.
    const freres = enfantsDe(d, grand), k = freres.findIndex(n => idNoeud(n) === parent);
    const dessus = k >= 0 ? freres[k + 1] : undefined;
    avant = dessus ? idNoeud(dessus) : undefined;
  }
  const apres = deplacerDans(d, cibles, grand ?? undefined, avant);
  return apres === d ? rien(d, phraseDejaDans(d, cibles, grand)) : { dessin: apres, phrase: phraseSortie(d, cibles, parent, grand), deplier: [] };
}

/**
 * Ctrl+Maj+Droite : les noeuds entrent dans le frere juste au-dessus du plus haut d'entre eux, s'il est un groupe, tout en bas de ses
 * enfants : ils restaient derriere tout le groupe, ils y restent.
 */
export function entrerAuDessus(d: DessinSvg, ref: string, ids: readonly string[]): Deplacement {
  const cibles = freresDe(d, ref, ids);
  if (cibles.length !== ids.length && ids.length > 1) return rien(d, PHRASE_MEME_GROUPE);
  const freres = enfantsDe(d, parentDe(d, ref)), choisis = new Set(cibles);
  let haut = -1;
  freres.forEach((n, k) => { if (choisis.has(idNoeud(n))) haut = k; });
  const dessus = haut >= 0 ? freres[haut + 1] : undefined;
  if (dessus?.genre !== 'groupe') return rien(d, PHRASE_PAS_DE_GROUPE_AU_DESSUS);
  const fond = dessus.enfants[0];
  const apres = deplacerDans(d, cibles, dessus.groupe.id, fond ? idNoeud(fond) : undefined);
  return apres === d ? rien(d, phraseDejaDans(d, cibles, dessus.groupe.id)) : { dessin: apres, phrase: phraseDeplacement(d, cibles, dessus.groupe.id), deplier: ouvrir(d, dessus.groupe.id) };
}

/**
 * « Déplacer vers… » et le depot sur une ligne de groupe : les noeuds passent au premier plan du groupe `vers` (null : la racine).
 * `avant` : se poser juste sous ce noeud (un enfant de `vers`), le depot sur une ligne de feuille.
 */
export function deplacerVers(d: DessinSvg, ids: readonly string[], vers: string | null, avant?: string): Deplacement {
  const cibles = unites(d, ids);
  if (!cibles.length) return rien(d, PHRASE_RIEN_A_DEPLACER);
  if (vers !== null && !groupeDe(d, vers)) return rien(d, PHRASE_RIEN_A_DEPLACER);
  if (vers !== null && [vers, ...ancetres(d, vers)].some(g => cibles.includes(g))) return rien(d, PHRASE_EN_LUI_MEME);
  if (avant !== undefined && cibles.includes(avant)) return rien(d, phraseDejaDans(d, cibles, vers));
  const apres = deplacerDans(d, cibles, vers ?? undefined, avant);
  return apres === d ? rien(d, phraseDejaDans(d, cibles, vers)) : { dessin: apres, phrase: phraseDeplacement(d, cibles, vers), deplier: ouvrir(d, vers) };
}

/** F2 : renommer un groupe ; un nom vide le retire. Null si ce n'est pas un groupe ou si rien ne change. */
export function renommerGroupe(d: DessinSvg, id: string, nom: string): { dessin: DessinSvg; phrase: string } | null {
  const g = groupeDe(d, id);
  if (!g) return null;
  const apres = renommer(d, id, nom);
  return apres === d ? null : { dessin: apres, phrase: phraseRenomme(g, nom) };
}
