// Le contexte d'edition (ADR-0012, annexe 6 §2) vu du moteur : on edite a la racine (null) ou dans un groupe, et seuls les noeuds
// de ce niveau (les freres du contexte) se prennent, se choisissent par une zone et servent d'aimants. Une feuille touchee remonte a
// l'enfant du contexte qui la contient, comme dans tout logiciel de dessin ; une feuille hors du contexte ne se prend pas. Pur.
//
// Sur un dessin plat, il n'y a qu'un niveau, la racine, et chaque feuille y est sa propre unite : l'interface garde alors ses
// chemins d'avant (estPlat), ces aides ne servent qu'aux dessins riches.

import type { Contenu } from './types.js';
import { ancetres, arbreDe, verrouilleEffectif, visibleEffectif, type NoeudArbre } from './arbre.js';

/** Le groupe du contexte s'il existe dans le contenu ; sinon la racine (null) : un groupe defait ou annule fait revenir a la racine. */
export function contexteValide(d: Contenu, groupe: string | null | undefined): string | null {
  return groupe !== null && groupe !== undefined && d.groupes && Object.prototype.hasOwnProperty.call(d.groupes, groupe) ? groupe : null;
}

/**
 * L'unite d'un noeud au niveau du contexte : le noeud lui-meme si son parent est le contexte (la racine : sans parent), sinon son
 * ancetre dont le parent est le contexte. Null si le noeud n'est pas dans le contexte, ou s'il est le contexte lui-meme.
 */
export function uniteDans(d: Contenu, id: string, contexte: string | null): string | null {
  if (id === contexte) return null;
  const chaine = [id, ...ancetres(d, id)];
  if (contexte === null) return chaine[chaine.length - 1] ?? null;
  const i = chaine.indexOf(contexte);
  return i > 0 ? chaine[i - 1] ?? null : null;
}

/** Les noeuds du niveau du contexte : les enfants de son groupe, ou la racine. Vide pour un groupe inconnu. */
export function noeudsDuNiveau(d: Contenu, contexte: string | null): readonly NoeudArbre[] {
  const a = arbreDe(d);
  if (contexte === null) return a.racine;
  const n = a.parId.get(contexte);
  return n?.genre === 'groupe' ? n.enfants : [];
}

const memoUnites = new WeakMap<Contenu, Map<string, readonly (string | null)[]>>();

/**
 * Pour chaque feuille (par rang dans `formes`), l'unite qu'un clic ou une zone y prend dans ce contexte, ou null : feuille hors du
 * contexte, masquee ou verrouillee, elle ou un de ses ancetres (la visibilite et le verrou s'heritent). Memorise par contenu et par
 * contexte : un geste ne recalcule rien.
 */
export function unitesPrenables(d: Contenu, contexte: string | null): readonly (string | null)[] {
  let parContexte = memoUnites.get(d);
  if (!parContexte) { parContexte = new Map(); memoUnites.set(d, parContexte); }
  const cle = contexte ?? '';
  let u = parContexte.get(cle);
  if (!u) {
    u = d.formes.map(f => (f.visible && !f.verrouille && visibleEffectif(d, f.id) && !verrouilleEffectif(d, f.id) ? uniteDans(d, f.id, contexte) : null));
    parContexte.set(cle, u);
  }
  return u;
}

/** Les noeuds sur le chemin du contexte : son groupe et ses ancetres (vide a la racine). Ni estompes ni voiles sur la toile. */
export const cheminDuContexte = (d: Contenu, contexte: string | null): readonly string[] => (contexte === null ? [] : [contexte, ...ancetres(d, contexte)]);
