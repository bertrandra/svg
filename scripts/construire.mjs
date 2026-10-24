// Construit la page autonome de l'editeur : un seul fichier HTML qui embarque le moteur, vtracer compris.
//
// La page (outils/editeur-svg/page.html) ne calcule rien elle-meme : lecture, operations et ecriture
// du dessin viennent de src/, compiles ici en un script unique. Une regle changee dans le moteur
// change donc la page au prochain build, sans copie a tenir.
//
//   npm run construire         -> dist/editeur-svg.html

import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feuillesEditeur } from './feuilles.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const dossier = join(racine, 'outils/editeur-svg');

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
      if (!CHARGEMENT_VTRACER.test(source)) throw new Error('vtracer : le chargement du .wasm a change, revoir scripts/construire.mjs');
      const contents = source.replace(CHARGEMENT_VTRACER, 'let wasm;\nexports.__initialiser = async (octets) => {\n  if (wasm) return;\n  const { instance } = await WebAssembly.instantiate(octets, __wbg_get_imports());\n  wasm = instance.exports;\n  wasm.__wbindgen_start();\n};');
      return { contents, loader: 'js' };
    });
  }
};

const { outputFiles } = await build({
  entryPoints: [join(dossier, 'entree.tsx')],
  bundle: true, format: 'iife', globalName: 'EditeurSvg', target: 'es2020', minify: true, write: false, jsx: 'automatic',
  plugins: [vtracerNavigateur], loader: { '.wasm': 'binary' },
  define: { 'process.env.NODE_ENV': '"production"' }
});
const moteur = outputFiles[0]?.text ?? '';
// Un `</script` dans le moteur fermerait la balise qui l'embarque.
if (moteur.includes('</script')) throw new Error('le moteur contient « </script » : la page serait coupee');

const page = readFileSync(join(dossier, 'page.html'), 'utf8');
// Les styles de l'editeur vivent hors de la page (scripts/feuilles.mjs), partages avec l'embarquement
// (scripts/embarquer.mjs) : la page les remet a leur place, entre ses propres regles, pour que la
// cascade reste celle d'avant.
const REPERES = ['/*MOTEUR*/', '/*JETONS*/', '/*STYLE_BASE*/', '/*STYLE_EDITEUR*/'];
for (const repere of REPERES) if (!page.includes(repere)) throw new Error('page.html ne porte plus le repere ' + repere);
mkdirSync(join(racine, 'dist'), { recursive: true });
const sortie = join(racine, 'dist/editeur-svg.html');
const feuilles = feuillesEditeur(racine);
writeFileSync(sortie, page.replace('/*JETONS*/', () => feuilles.jetons).replace('/*STYLE_BASE*/', () => feuilles.base)
  .replace('/*STYLE_EDITEUR*/', () => feuilles.editeur).replace('/*MOTEUR*/', () => moteur));
console.log('Page construite : dist/editeur-svg.html (' + Math.round(moteur.length / 1024) + ' Ko de moteur).');
