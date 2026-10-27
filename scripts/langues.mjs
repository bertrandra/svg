// Construit dist/langue-en.js : le dictionnaire anglais de l'interface (ADR-0042), une annexe que la page charge a la demande,
// par une balise <script>, seulement quand la langue vaut `en` (io/langue.ts). Le francais n'en a pas : ses cles sont le texte.
//
// Les sources : src/i18n/en/<dossier>.json, un objet { "phrase française": "English sentence" } par dossier de src/, cles triees,
// pour que des agents travaillent cote a cote sans se marcher dessus. Ici, on les fusionne : une meme cle dans deux fichiers doit
// porter la meme valeur, sinon le build refuse en la nommant. Le site PHP relit l'annexe en JSON (scripts/site-php.mjs,
// data/json/langue-en.json), comme les bibliotheques.
//
//   npm run langues            -> dist/langue-en.js
//   node scripts/langues.mjs --trier   trie les cles de chaque fichier (ce que le test de couverture exige)

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { annoncer, depuisRacine, ecrireDansDist, enKo, estLance, refuserFinDeScript } from './aide.mjs';

/** Les langues qui ont un dictionnaire : le francais n'en a pas. */
export const LANGUES_TRADUITES = ['en'];

/** Le dossier des dictionnaires d'une langue. */
export const dossierDictionnaires = langue => depuisRacine('src/i18n', langue);

/** Les fichiers JSON d'une langue, dans l'ordre des noms. */
export const fichiersDictionnaires = langue => readdirSync(dossierDictionnaires(langue)).filter(n => n.endsWith('.json')).sort();

/** Un fichier de dictionnaire lu et verifie : un objet de textes vers des textes, rien d'autre. */
export function lireDictionnaire(chemin) {
  const brut = JSON.parse(readFileSync(chemin, 'utf8'));
  if (typeof brut !== 'object' || brut === null || Array.isArray(brut)) throw new Error(chemin + ' : un dictionnaire est un objet { "phrase française": "English sentence" }');
  for (const [cle, valeur] of Object.entries(brut)) {
    if (typeof valeur !== 'string') throw new Error(chemin + ' : la clé « ' + cle + ' » doit avoir un texte pour valeur');
  }
  return brut;
}

/** L'ordre des cles d'un dictionnaire : celui des points de code, le meme partout (aucune collation a deviner). */
export const comparerCles = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Fusionne des dictionnaires { fichier: table } en une seule table, cles triees. Une meme cle dans deux fichiers doit porter la meme
 * valeur : sinon, refus qui nomme la cle et les deux fichiers.
 */
export function fusionnerDictionnaires(tables) {
  const fusion = new Map(), origine = new Map();
  for (const [fichier, table] of Object.entries(tables)) {
    for (const [cle, valeur] of Object.entries(table)) {
      if (fusion.has(cle) && fusion.get(cle) !== valeur) {
        throw new Error('La clé « ' + cle + ' » a deux traductions : « ' + fusion.get(cle) + ' » (' + origine.get(cle) + ') et « ' + valeur + ' » (' + fichier + ').');
      }
      if (!fusion.has(cle)) { fusion.set(cle, valeur); origine.set(cle, fichier); }
    }
  }
  return Object.fromEntries([...fusion.entries()].sort(([a], [b]) => comparerCles(a, b)));
}

/** Les dictionnaires d'une langue, lus fichier par fichier ({ nom: table }). */
export function lireDictionnaires(langue) {
  return Object.fromEntries(fichiersDictionnaires(langue).map(nom => [nom, lireDictionnaire(join(dossierDictionnaires(langue), nom))]));
}

/** Le dictionnaire fusionne d'une langue. */
export const dictionnaireFusionne = langue => fusionnerDictionnaires(lireDictionnaires(langue));

/** Ecrit l'annexe d'une langue : une globale posee par un script, jamais « </script ». */
export function construireLangue(langue) {
  const table = dictionnaireFusionne(langue);
  const texte = 'window.__langueSvg_' + langue + '=' + JSON.stringify(table) + ';';
  refuserFinDeScript(texte, 'le dictionnaire ' + langue);
  const fichier = 'langue-' + langue + '.js';
  ecrireDansDist(fichier, texte);
  return { langue, fichier, cles: Object.keys(table).length, octets: texte.length };
}

/** Reecrit chaque fichier d'une langue avec ses cles triees (meme contenu, meme forme : deux espaces, saut final). */
export function trierDictionnaires(langue) {
  for (const nom of fichiersDictionnaires(langue)) {
    const chemin = join(dossierDictionnaires(langue), nom);
    const table = lireDictionnaire(chemin);
    const triee = Object.fromEntries(Object.entries(table).sort(([a], [b]) => comparerCles(a, b)));
    writeFileSync(chemin, JSON.stringify(triee, null, 2) + '\n');
  }
}

if (estLance(import.meta.url)) {
  if (process.argv.includes('--trier')) {
    for (const langue of LANGUES_TRADUITES) trierDictionnaires(langue);
  }
  for (const langue of LANGUES_TRADUITES) {
    const r = construireLangue(langue);
    annoncer('Dictionnaire ' + r.langue + ' construit', r.fichier, r.cles + ' clés, ' + enKo(r.octets) + ' Ko');
  }
}
