// Le traceur vtracer en WebAssembly, pour le navigateur. Il n'entre pas dans la page : il est compile
// a part dans dist/vtracer.js (scripts/vtracer.mjs, point d'entree outils/editeur-svg/vtracer-entree.ts)
// et io/vtracer.ts n'ajoute ce script qu'au premier geste qui vectorise. Ne pas l'importer d'ailleurs :
// la page se mettrait de nouveau a embarquer le .wasm.
//
// Le paquet est construit pour Node (`wasm-pack --target nodejs`) : il lit son .wasm sur le disque
// et le compile de facon synchrone, ce que Chrome refuse au-dela de 4 Ko sur le fil principal.
// scripts/vtracer.mjs remplace ces lignes par `__initialiser(octets)`, asynchrone, et
// embarque les octets ; ce fichier n'est donc jamais importe par les tests, qui prennent le paquet tel quel.

import * as colle from '@visioncortex/vtracer/pkg/vtracer_wasm.js';
// Un .wasm embarque par esbuild (loader binary) : des octets, quoi qu'en dise sa declaration de type.
import octets from '@visioncortex/vtracer/pkg/vtracer_wasm_bg.wasm';
import type { OptionsTraceur, Traceur } from '../engine/vectorisation.js';

interface ColleInitialisable { __initialiser(o: Uint8Array): Promise<void>; vectorize_rgba(d: Uint8Array, l: number, h: number, o: unknown): string }

export async function traceurWasm(): Promise<Traceur> {
  const c = colle as unknown as ColleInitialisable;
  await c.__initialiser(octets as unknown as Uint8Array);
  return (rgba: Uint8Array, l: number, h: number, options: OptionsTraceur) => c.vectorize_rgba(rgba, l, h, options);
}
