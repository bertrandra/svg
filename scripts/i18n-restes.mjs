// Les restes du chantier de la traduction (ADR-0042 §4) : les littéraux a l'air francais hors d'un appel a `t`, listes par fichier,
// pour qu'un agent sache ou envelopper. L'extracteur est celui du test de couverture (tests/unit/i18n/extraire.ts), compile ici par
// esbuild pour tourner sous Node ; les fichiers de donnees exclus sont ceux de tests/fixtures/i18n/exclus.json, le plafond celui
// de tests/fixtures/i18n/restes.json.
//
//   npm run i18n:restes                 le compte par fichier, du plus charge au moins charge
//   npm run i18n:restes -- src/zones    le detail (ligne et texte) des fichiers sous ce prefixe

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { depuisRacine, ecrireDansDist, empaqueter, estLance } from './aide.mjs';

/** L'extracteur du test, compile une fois dans dist/ et importe. */
export async function chargerExtracteur() {
  const code = await empaqueter({
    entryPoints: [depuisRacine('tests/unit/i18n/extraire.ts')],
    bundle: true, format: 'esm', platform: 'node', external: ['typescript']
  });
  return import(pathToFileURL(ecrireDansDist('.i18n-extraire.mjs', code)).href);
}

export const lireExclus = () => JSON.parse(readFileSync(depuisRacine('tests/fixtures/i18n/exclus.json'), 'utf8')).fichiers;
export const lirePlafond = () => JSON.parse(readFileSync(depuisRacine('tests/fixtures/i18n/restes.json'), 'utf8')).restes;

if (estLance(import.meta.url)) {
  const { extraireDossier, restesParFichier } = await chargerExtracteur();
  const prefixe = process.argv[2];
  const { restes } = extraireDossier(depuisRacine('src'), lireExclus());
  if (prefixe) {
    for (const r of restes.filter(r => r.fichier.startsWith(prefixe.replace(/^src\//, '')))) console.log(r.fichier + ':' + r.ligne + '  ' + r.texte);
  } else {
    const largeur = Math.max(...restes.map(r => r.fichier.length), 10);
    for (const { fichier, nombre } of restesParFichier(restes)) console.log('  ' + fichier.padEnd(largeur) + String(nombre).padStart(6));
  }
  console.log('\n  ' + restes.length + ' restes (plafond : ' + lirePlafond() + ').');
}
