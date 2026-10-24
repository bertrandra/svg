// Construit le bundle d'embarquement : dist/editeur-svg-embarque.js, un seul script classique (IIFE)
// qui pose `window.EditeurSvg` ({ version, ouvrir, estEditable }) et embarque l'editeur et ses styles.
//
// Il marche depuis le disque (file://) par une simple balise <script>, sans module ni serveur. C'est le
// meme code source que la page (src/zones/EditeurSvg.tsx) : rien n'est copie. Les fichiers annexes
// (bibliotheque.js, polices.js) restent a part et se chargent a la demande, comme pour la page.
//
//   npm run embarquer        -> dist/editeur-svg-embarque.js
//
// vtracer n'y est pas : l'editeur ne vectorise pas, il retouche un SVG qu'on lui donne.

import { build, transform } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feuillesEditeur } from './feuilles.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(join(racine, 'package.json'), 'utf8')).version;

// Les feuilles de style (scripts/feuilles.mjs, les memes que la page) entrent dans le bundle comme un
// module virtuel `feuille-editeur`, un texte minifie ; c'est le code (util/cssPortee.ts) qui les
// cantonne a la racine de l'editeur, une fois, au premier `ouvrir`.
const feuilles = {
  name: 'feuille-editeur',
  setup(b) {
    b.onResolve({ filter: /^feuille-editeur$/ }, () => ({ path: 'feuille-editeur', namespace: 'feuille-editeur' }));
    b.onLoad({ filter: /.*/, namespace: 'feuille-editeur' }, async () => {
      const f = feuillesEditeur(racine);
      const { code } = await transform([f.jetons, f.base, f.editeur].join('\n'), { loader: 'css', minify: true });
      return { contents: code, loader: 'text' };
    });
  }
};

// L'editeur atteint io/image.ts (export PNG), qui sait appeler vtracer ; l'embarquement ne vectorise pas,
// et le WebAssembly de vtracer pese a lui seul pres de la moitie de la page : on le remplace par un refus.
const sansTraceur = {
  name: 'sans-traceur',
  setup(b) {
    b.onResolve({ filter: /vtracerWasm\.js$/ }, () => ({ path: join(racine, 'outils/editeur-svg/sans-traceur.ts') }));
  }
};

const { outputFiles } = await build({
  entryPoints: [join(racine, 'outils/editeur-svg/embarque.ts')],
  bundle: true, format: 'iife', target: 'es2020', minify: true, write: false, jsx: 'automatic',
  plugins: [feuilles, sansTraceur], outfile: join(racine, 'dist/editeur-svg-embarque.js'),
  banner: { js: '/* Editeur SVG embarquable ' + version + ' : window.EditeurSvg.ouvrir({ svg, onEnregistrer }). Voir docs/integration.md. */' },
  define: { 'process.env.NODE_ENV': '"production"', VERSION_EMBARQUEE: JSON.stringify(version) }
});
const texte = outputFiles[0]?.text ?? '';
if (!texte.includes('EditeurSvg')) throw new Error('le bundle ne pose pas window.EditeurSvg');
mkdirSync(join(racine, 'dist'), { recursive: true });
writeFileSync(join(racine, 'dist/editeur-svg-embarque.js'), texte);
console.log('Embarquement construit : dist/editeur-svg-embarque.js (' + Math.round(texte.length / 1024) + ' Ko).');
