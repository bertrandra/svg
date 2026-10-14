// Le traceur du navigateur, charge une fois, a la demande : le WebAssembly de vtracer ne pese rien
// tant que personne ne vectorise. Un echec de chargement se dit, et l'image reste une image.

import type { Traceur } from '../engine/vectorisation.js';

let promesse: Promise<Traceur> | null = null;

export function chargerTraceur(): Promise<Traceur> {
  promesse ??= import('./vtracerWasm.js').then(m => m.traceurWasm()).catch((e: unknown) => {
    promesse = null;
    throw e instanceof Error ? e : new Error(String(e));
  });
  return promesse;
}
