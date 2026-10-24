// La sonde des capacites du navigateur : elle interroge l'hote (la fenetre, en vrai) et rend ce que
// util/capacites.ts sait lire. Un hote passe en parametre plutot que `window` en dur : un test lui donne
// un faux navigateur, y compris un navigateur d'avant telle ou telle API.

import type { Sonde } from '../util/capacites.js';

/** Ce que la sonde lit de l'hote : tout est facultatif, c'est justement ce qu'on cherche a savoir. */
export interface HoteSondable {
  PointerEvent?: unknown;
  Blob?: unknown;
  URL?: { createObjectURL?: unknown } | undefined;
  WebAssembly?: { instantiate?: unknown } | undefined;
  document?: { createElement?: (nom: string) => { getContext?: (type: string) => unknown } } | undefined;
}

const estFonction = (v: unknown): boolean => typeof v === 'function';

/** Un canvas 2D se cree-t-il ? Un navigateur qui bloque les canvas (empreinte, mode strict) rend null. */
function canvasDisponible(hote: HoteSondable): boolean {
  try {
    const c = hote.document?.createElement?.('canvas');
    return !!c && estFonction(c.getContext) && !!c.getContext?.('2d');
  } catch {
    return false;
  }
}

/**
 * Ce que le navigateur sait faire. `Object.hasOwn` se lit sur `Object` de la page, pas de l'hote : c'est le moteur
 * JavaScript qui le porte, aucune fenetre ne le fournit.
 */
export function sonderNavigateur(hote: HoteSondable = globalThis as HoteSondable): Sonde {
  return {
    objectHasOwn: estFonction((Object as { hasOwn?: unknown }).hasOwn),
    pointeurs: estFonction(hote.PointerEvent),
    blob: estFonction(hote.Blob) && estFonction(hote.URL?.createObjectURL),
    canvas: canvasDisponible(hote),
    webassembly: typeof hote.WebAssembly === 'object' && estFonction(hote.WebAssembly.instantiate)
  };
}
