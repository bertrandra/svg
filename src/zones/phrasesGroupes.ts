// Ce que l'editeur dit des groupes (ADR-0012, annexe 6 §7), le minimum du paquet 2-A : entrer dans un groupe, en sortir, et le nom
// d'un groupe pris sur la toile. Le paquet 2-C (commandes, fil d'Ariane, phrases de la selection) les completera ici.

import { arbreDe, type DessinSvg, type Groupe } from '../engine/editionSvg.js';
import { pluriel } from '../util/texte.js';

/** Le nom d'un groupe tel qu'on le dit : le sien, sinon « Groupe 3 » (le numero de son identifiant `g3`). */
export const nomDeGroupe = (g: Groupe): string => g.nom ?? 'Groupe ' + (/^g(\d+)$/.exec(g.id)?.[1] ?? g.id);

/** « groupe « Nuage » » : un groupe nomme dans une phrase. */
export const groupeDit = (g: Groupe): string => (g.nom ? 'groupe « ' + g.nom + ' »' : nomDeGroupe(g).toLowerCase());

/** La phrase d'entree dans un groupe (son nom, le nombre de ses elements) ; null si `id` n'est pas un groupe du dessin. */
export function phraseEntreeGroupe(d: DessinSvg, id: string): string | null {
  const n = arbreDe(d).parId.get(id);
  if (n?.genre !== 'groupe') return null;
  return 'Dans le ' + groupeDit(n.groupe) + ', ' + pluriel(n.enfants.length, 'élément') + '.';
}

export const PHRASE_RACINE = 'Retour à la racine.';
