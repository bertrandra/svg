// Le remplacant de src/io/vtracerWasm.ts dans le bundle d'embarquement : l'editeur retouche un SVG, il
// ne vectorise pas. Ce module n'est atteint que par un import dynamique que seule la vectorisation
// d'une image declenche ; sans lui, tout vtracer (WebAssembly compris) entrerait dans le bundle.
export function traceurWasm(): Promise<never> {
  return Promise.reject(new Error('Le traceur vtracer n’est pas inclus dans le bundle d’embarquement : l’éditeur retouche un SVG, il ne vectorise pas.'));
}
