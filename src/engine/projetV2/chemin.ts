// Le chemin du modele en texte de projet, et retour (ADR-0030) : « M10 20L30 40Z », chaque nombre a sa pleine precision. A part
// d'engine/projet.ts, qui le reexporte, pour que les champs v2 qui portent un trace (les feuilles d'une decoupe, etape 5) s'en
// servent sans cycle d'import. Pur.

import type { Chemin, Commande, Lettre } from '../editionSvg.js';

/**
 * Un nombre a sa pleine precision : le plus court texte que `Number` relit a l'identique (celui de JavaScript), et « -0 » pour le
 * zero negatif, que `String` ecrirait « 0 ».
 */
const nombreExact = (v: number): string => (Object.is(v, -0) ? '-0' : String(v));

/** Le chemin en texte de projet : « M10 20L30 40Z ». */
export function ecrireCheminProjet(d: Chemin): string {
  let s = '';
  for (const c of d) s += c.c + c.p.map(nombreExact).join(' ');
  return s;
}

/** Le chemin d'un texte de projet deja valide (`cheminProjetValide`) : les memes commandes, les memes nombres. */
export function lireCheminProjet(d: string): Chemin {
  if (d === '') return [];
  return d.split(/(?=[MLCQZ])/).map((m): Commande => {
    const reste = m.slice(1);
    return { c: m.charAt(0) as Lettre, p: reste === '' ? [] : reste.split(' ').map(Number) };
  });
}
