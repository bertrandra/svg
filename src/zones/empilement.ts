// Changer la place d'un groupe de formes dans l'empilement, et le dire : la barre de la selection et les
// raccourcis Ctrl+[ et Ctrl+] passent par la meme porte, pour que le clavier et la souris disent la meme phrase.

import { ordonner, type DessinSvg, type Ordre } from '../engine/editionSvg.js';
import { empilementChange, phraseOrdre } from './phrasesSelection.js';
import type { ActionsEditeur } from './typesEditeur.js';

/** Place `ids` selon `o`. Le geste est toujours applique (comme avant) ; seule la phrase dit si quelque chose a bouge. */
export function empiler(ac: Pick<ActionsEditeur, 'faire'>, dessin: DessinSvg, ids: readonly string[], o: Ordre): void {
  ac.faire(d => ordonner(d, ids, o), phraseOrdre(o, ids.length, empilementChange(dessin, ordonner(dessin, ids, o))));
}
