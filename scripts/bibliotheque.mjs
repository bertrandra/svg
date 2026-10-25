// Construit la bibliotheque de formes : une annexe par source du registre (src/model/sourcesFormes.ts).
//
//   - dist/bibliotheque.js : les 4 000 silhouettes de game-icons.net (CC BY 3.0), l'annexe par defaut, telle qu'avant le
//     registre (meme construction, memes octets) ;
//   - dist/bibliotheque-<source>.js : chaque source libre (Material, Phosphor, Tabler, Healthicons, Lucide), chargee
//     seulement quand on la demande, pour ne pas alourdir l'ouverture.
//
// Un script plutot qu'un JSON : la page autonome le charge par une balise <script>, ce qui marche aussi ouverte depuis le
// disque (file://), la ou fetch est refuse. Le nom et le classement sont ceux du code, compiles ici : une regle changee dans
// le modele change la bibliotheque au prochain build. Chaque forme d'une source libre passe par la lecture de l'editeur
// (lireDessin) : une forme que l'editeur refuserait n'entre pas dans l'annexe, et le build le dit.
//
//   npm run bibliotheque       -> dist/bibliotheque.js et dist/bibliotheque-<source>.js

import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { annoncer, depuisRacine, ecrireDansDist, empaqueter, enKo, estLance, refuserFinDeScript } from './aide.mjs';

/** Le modele et la lecture de l'editeur, compiles ensemble une fois. */
async function chargerModele() {
  const code = await empaqueter({
    stdin: {
      contents: "export * from './src/model/bibliotheque.ts'; export * from './src/model/bibliothequeSources.ts'; export * from './src/model/sourcesFormes.ts'; export { lireDessin } from './src/engine/editionSvg.ts';",
      resolveDir: depuisRacine(), loader: 'ts'
    },
    bundle: true, format: 'esm', platform: 'node'
  });
  return import(pathToFileURL(ecrireDansDist('.bibliotheque-modele.mjs', code)).href);
}

const lireJson = chemin => JSON.parse(readFileSync(depuisRacine(chemin), 'utf8'));

/** Les corrections posees a la main depuis la page (bibliotheque/corrections.json) l'emportent sur les regles. */
function lireCorrections() {
  const chemin = depuisRacine('bibliotheque/corrections.json');
  return existsSync(chemin) ? JSON.parse(readFileSync(chemin, 'utf8')) : {};
}

/** Ecrit une annexe : une globale posee par un script, jamais « </script ». */
function ecrireAnnexe(source, contenu) {
  const texte = 'window.' + source.globale + '=' + JSON.stringify(contenu) + ';';
  refuserFinDeScript(texte, 'la bibliotheque ' + source.id);
  ecrireDansDist(source.fichier, texte);
  return texte.length;
}

/** game-icons : la construction d'avant le registre, a l'identique (son annexe ne change pas d'un octet). */
function construireJeuParDefaut(modele, source, corrections) {
  const jeu = lireJson('node_modules/' + source.paquet + '/icons.json');
  const info = lireJson('node_modules/' + source.paquet + '/info.json');
  const entrees = modele.appliquerCorrections(modele.construireBibliotheque(jeu.icons, jeu.width), corrections);
  const octets = ecrireAnnexe(source, { source: info.name, licence: info.license.title, url: source.url, evenements: modele.EVENEMENTS, entrees });
  return { source: source.id, fichier: source.fichier, formes: entrees.length, ecartees: 0, octets };
}

/** Une source libre : ses entrees, moins celles que l'editeur ne lirait pas ; la source et la licence voyagent avec l'annexe. */
function construireSourceLibre(modele, source, corrections) {
  const dossier = 'node_modules/' + source.paquet + '/';
  const jeu = lireJson(dossier + 'icons.json');
  const info = lireJson(dossier + 'info.json');
  const categories = existsSync(depuisRacine(dossier + 'metadata.json')) ? lireJson(dossier + 'metadata.json').categories ?? {} : {};
  const toutes = modele.appliquerCorrections(modele.construireSource(source, jeu, categories), corrections);
  const lisibles = toutes.filter(e => !('erreur' in modele.lireDessin(e.svg)));
  // La source est une fois dans l'annexe, pas une fois par forme : le chargeur la rend a chaque entree.
  const entrees = lisibles.map(({ id, nom, evenements, svg, nature }) => ({ id, nom, evenements, svg, nature }));
  const octets = ecrireAnnexe(source, { source: source.id, nom: info.name, licence: info.license.title, url: source.url, entrees });
  return { source: source.id, fichier: source.fichier, formes: entrees.length, ecartees: toutes.length - lisibles.length, octets };
}

export async function construireBibliotheque() {
  const modele = await chargerModele();
  const corrections = lireCorrections();
  return modele.SOURCES_FORMES.map(source => (source.id === modele.SOURCE_PAR_DEFAUT
    ? construireJeuParDefaut(modele, source, corrections)
    : construireSourceLibre(modele, source, corrections)));
}

if (estLance(import.meta.url)) {
  for (const r of await construireBibliotheque()) {
    annoncer('Bibliothèque ' + r.source + ' construite', r.fichier, r.formes + ' formes, ' + enKo(r.octets) + ' Ko' + (r.ecartees ? ', ' + r.ecartees + ' refusées par la lecture de l’éditeur' : ''));
  }
}
