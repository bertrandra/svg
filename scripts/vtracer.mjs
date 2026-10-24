// Construit dist/vtracer.js : le traceur vtracer (WebAssembly) dans un script autonome, que la page
// charge a la demande au premier trace, comme la bibliotheque et les fontes. Ouvert depuis le disque,
// un fetch serait refuse ; une balise <script> passe. La page elle-meme n'embarque plus le traceur :
// elle pese bien moins lourd tant que personne ne vectorise.
//
//   npm run vtracer            -> dist/vtracer.js

import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');

// vtracer est construit pour Node : sa colle lit le .wasm sur le disque et le compile de facon
// synchrone, ce que Chrome refuse au-dela de 4 Ko sur le fil principal. On remplace ces lignes par une
// initialisation asynchrone ; les octets sont embarques par le loader `binary`. Si la colle change
// (nouvelle version du paquet), le motif ne se trouve plus et la construction s'arrete : on le revoit.
const CHARGEMENT_VTRACER = /const wasmPath = `\$\{__dirname\}\/vtracer_wasm_bg\.wasm`;\s*const wasmBytes = require\('fs'\)\.readFileSync\(wasmPath\);\s*const wasmModule = new WebAssembly\.Module\(wasmBytes\);\s*let wasmInstance = new WebAssembly\.Instance\(wasmModule, __wbg_get_imports\(\)\);\s*let wasm = wasmInstance\.exports;\s*wasm\.__wbindgen_start\(\);/;
const vtracerNavigateur = {
  name: 'vtracer-navigateur',
  setup(b) {
    b.onLoad({ filter: /vtracer_wasm\.js$/ }, args => {
      const source = readFileSync(args.path, 'utf8');
      if (!CHARGEMENT_VTRACER.test(source)) throw new Error('vtracer : le chargement du .wasm a change, revoir scripts/vtracer.mjs');
      const contents = source.replace(CHARGEMENT_VTRACER, 'let wasm;\nexports.__initialiser = async (octets) => {\n  if (wasm) return;\n  const { instance } = await WebAssembly.instantiate(octets, __wbg_get_imports());\n  wasm = instance.exports;\n  wasm.__wbindgen_start();\n};');
      return { contents, loader: 'js' };
    });
  }
};

/** Le script compile, sans l'ecrire : les tests l'executent tel que la page le chargera. */
export async function compilerVtracer() {
  const { outputFiles } = await build({
    entryPoints: [join(racine, 'outils/editeur-svg/vtracer-entree.ts')],
    bundle: true, format: 'iife', target: 'es2020', minify: true, write: false,
    plugins: [vtracerNavigateur], loader: { '.wasm': 'binary' }
  });
  return outputFiles[0]?.text ?? '';
}

export async function construireVtracer() {
  const texte = await compilerVtracer();
  mkdirSync(join(racine, 'dist'), { recursive: true });
  writeFileSync(join(racine, 'dist/vtracer.js'), texte);
  return { octets: texte.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = await construireVtracer();
  console.log('Traceur construit : dist/vtracer.js (' + Math.round(r.octets / 1024) + ' Ko).');
}
