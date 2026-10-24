// Construit le bundle d'embarquement : dist/editeur-svg-embarque.js, un seul script classique (IIFE)
// qui pose `window.EditeurSvg` ({ version, ouvrir, estEditable }) et embarque l'editeur et ses styles.
//
// Il marche depuis le disque (file://) par une simple balise <script>, sans module ni serveur. C'est le
// meme code source que la page (src/zones/EditeurSvg.tsx) : rien n'est copie. Les fichiers annexes
// (bibliotheque.js, polices.js) restent a part et se chargent a la demande, comme pour la page.
//
//   npm run embarquer        -> dist/editeur-svg-embarque.js
//
// vtracer n'y est pas : l'editeur ne vectorise pas, il retouche un SVG qu'on lui donne. Depuis que le
// traceur vit dans dist/vtracer.js (charge par balise <script>), le bundle n'en porte que le petit
// chargeur (io/vtracer.ts), que l'editeur n'atteint jamais ; il n'y a rien a remplacer.

import { transform } from 'esbuild';
import { readFileSync } from 'node:fs';
import { annoncer, depuisRacine, ecrireDansDist, empaqueter, enKo } from './aide.mjs';
import { feuillesEditeur } from './feuilles.mjs';

const version = JSON.parse(readFileSync(depuisRacine('package.json'), 'utf8')).version;

// Les feuilles de style (scripts/feuilles.mjs, les memes que la page) entrent dans le bundle comme un
// module virtuel `feuille-editeur`, un texte minifie ; c'est le code (util/cssPortee.ts) qui les
// cantonne a la racine de l'editeur, une fois, au premier `ouvrir`.
const feuilles = {
  name: 'feuille-editeur',
  setup(b) {
    b.onResolve({ filter: /^feuille-editeur$/ }, () => ({ path: 'feuille-editeur', namespace: 'feuille-editeur' }));
    b.onLoad({ filter: /.*/, namespace: 'feuille-editeur' }, async () => {
      const f = await feuillesEditeur();
      const { code } = await transform([f.jetons, f.base, f.editeur].join('\n'), { loader: 'css', minify: true });
      return { contents: code, loader: 'text' };
    });
  }
};

const texte = await empaqueter({
  entryPoints: [depuisRacine('outils/editeur-svg/embarque.ts')],
  bundle: true, format: 'iife', target: 'es2020', minify: true, jsx: 'automatic',
  plugins: [feuilles], outfile: depuisRacine('dist/editeur-svg-embarque.js'),
  banner: { js: '/* Editeur SVG embarquable ' + version + ' : window.EditeurSvg.ouvrir({ svg, onEnregistrer }). Voir docs/integration.md. */' },
  define: { 'process.env.NODE_ENV': '"production"', VERSION_EMBARQUEE: JSON.stringify(version) }
});
if (!texte.includes('EditeurSvg')) throw new Error('le bundle ne pose pas window.EditeurSvg');
ecrireDansDist('editeur-svg-embarque.js', texte);
annoncer('Embarquement construit', 'editeur-svg-embarque.js', enKo(texte.length) + ' Ko');
