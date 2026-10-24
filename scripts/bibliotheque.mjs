// Construit la bibliotheque de formes : dist/bibliotheque.js, un script qui pose les 4 000
// silhouettes de game-icons.net (CC BY 3.0), nommees et classees par src/model/bibliotheque.ts.
//
// Un script plutot qu'un JSON : la page autonome le charge par une balise <script>, ce qui marche
// aussi ouverte depuis le disque (file://), la ou fetch est refuse. Le classement est celui du code,
// compile ici : une regle changee dans le modele change la bibliotheque au prochain build.
//
//   npm run bibliotheque       -> dist/bibliotheque.js

import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { annoncer, depuisRacine, ecrireDansDist, empaqueter, enKo, estLance, refuserFinDeScript } from './aide.mjs';

export async function construireBibliotheque() {
  const code = await empaqueter({ entryPoints: [depuisRacine('src/model/bibliotheque.ts')], bundle: true, format: 'esm', platform: 'node' });
  const modele = await import(pathToFileURL(ecrireDansDist('.bibliotheque-modele.mjs', code)).href);
  const jeu = JSON.parse(readFileSync(depuisRacine('node_modules/@iconify-json/game-icons/icons.json'), 'utf8'));
  const info = JSON.parse(readFileSync(depuisRacine('node_modules/@iconify-json/game-icons/info.json'), 'utf8'));
  // Les corrections posees a la main depuis la page (bibliotheque/corrections.json) l'emportent sur les regles.
  const cheminCorrections = depuisRacine('bibliotheque/corrections.json');
  const corrections = existsSync(cheminCorrections) ? JSON.parse(readFileSync(cheminCorrections, 'utf8')) : {};
  const entrees = modele.appliquerCorrections(modele.construireBibliotheque(jeu.icons, jeu.width), corrections);
  const evenements = modele.EVENEMENTS;
  const texte = 'window.__bibliothequeSvg=' + JSON.stringify({ source: info.name, licence: info.license.title, url: 'https://game-icons.net', evenements, entrees }) + ';';
  refuserFinDeScript(texte, 'la bibliotheque');
  ecrireDansDist('bibliotheque.js', texte);
  return { formes: entrees.length, octets: texte.length };
}

if (estLance(import.meta.url)) {
  const r = await construireBibliotheque();
  annoncer('Bibliothèque construite', 'bibliotheque.js', r.formes + ' formes, ' + enKo(r.octets) + ' Ko');
}
