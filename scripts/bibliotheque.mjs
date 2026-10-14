// Construit la bibliotheque de formes : dist/bibliotheque.js, un script qui pose les 4 000
// silhouettes de game-icons.net (CC BY 3.0), nommees et classees par src/model/bibliotheque.ts.
//
// Un script plutot qu'un JSON : la page autonome le charge par une balise <script>, ce qui marche
// aussi ouverte depuis le disque (file://), la ou fetch est refuse. Le classement est celui du code,
// compile ici : une regle changee dans le modele change la bibliotheque au prochain build.
//
//   npm run bibliotheque       -> dist/bibliotheque.js

import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');

export async function construireBibliotheque() {
  const sortieModele = join(racine, 'dist/.bibliotheque-modele.mjs');
  mkdirSync(join(racine, 'dist'), { recursive: true });
  await build({ entryPoints: [join(racine, 'src/model/bibliotheque.ts')], bundle: true, format: 'esm', platform: 'node', outfile: sortieModele });
  const modele = await import(pathToFileURL(sortieModele).href);
  const jeu = JSON.parse(readFileSync(join(racine, 'node_modules/@iconify-json/game-icons/icons.json'), 'utf8'));
  const info = JSON.parse(readFileSync(join(racine, 'node_modules/@iconify-json/game-icons/info.json'), 'utf8'));
  const entrees = modele.construireBibliotheque(jeu.icons, jeu.width);
  const evenements = modele.EVENEMENTS;
  const texte = 'window.__bibliothequeSvg=' + JSON.stringify({ source: info.name, licence: info.license.title, url: 'https://game-icons.net', evenements, entrees }) + ';';
  if (texte.includes('</script')) throw new Error('la bibliotheque contient « </script » : la page serait coupee');
  const sortie = join(racine, 'dist/bibliotheque.js');
  writeFileSync(sortie, texte);
  return { formes: entrees.length, octets: texte.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = await construireBibliotheque();
  console.log('Bibliothèque construite : dist/bibliotheque.js (' + r.formes + ' formes, ' + Math.round(r.octets / 1024) + ' Ko).');
}
