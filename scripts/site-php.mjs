// Construit le site PHP (ADR-0030, ADR-0041) dans dist/php, a cote de la page autonome (qui ne change pas) : lance apres les autres
// scripts de `npm run construire`, il reprend ce qu'ils ont ecrit dans dist/.
//
//   dist/php/
//     public/                  LE dossier a envoyer (par FTP, a la racine du site) : rien n'est a regler
//       index.php, api.php, .htaccess                       (outils/site-php/public : trois lignes, le code est dans data/inc)
//       assets/site.js         l'application (src/site), compilee
//       assets/site.css        les styles de la page autonome (jetons, base, page, editeur, fontes de l'interface) et ceux du site
//       assets/vtracer.js      le traceur, charge a la demande comme dans la page
//       MENTIONS.txt           les licences des composants redistribues
//       aide/                  les documentations du menu Aide (scripts/documentation.mjs), reprises de dist/aide
//       data/                  jamais servi (« Require all denied »), sous la racine web : index.php le trouve la, sinon a cote
//         .htaccess, inc/      le code entier (outils/site-php/data) ; inc/compte.php (ligne de commande), inc/serveur-local.php
//                              (le routeur de `php -S`, qui imite les .htaccess)
//         config/              config.json, ecrit a l'installation ; config.local.php facultatif (les constantes avancees)
//         comptes/ sessions/ jetons/   les comptes, les sessions par jeton, les jetons des mails
//         json/                les annexes de donnees en JSON : bibliotheques, index et apercus des polices, liste des fontes
//                              livrees, le dictionnaire anglais (langue-en, s'il est construit)
//         font/                les dix fontes livrees (fichiers), puis celles du catalogue que le serveur range
//         projets/             les projets, un dossier par compte ; projets/corbeille-comptes/ : ceux des comptes supprimes
//
// Aucun compte n'est livre : l'administrateur se cree a la premiere visite (ou par `php data/inc/compte.php --admin`).
// Qui a la main sur le serveur peut sortir data/ de la racine (a cote de public/) : index.php le trouve alors en ../data.
// Rien ici ne contacte le reseau, et rien de construit n'est commis.
//
//   node scripts/site-php.mjs   (apres les autres scripts de « npm run construire »)

import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { annoncer, depuisRacine, empaqueter, enKo, estLance } from './aide.mjs';
import { composerPage } from './page.mjs';
import { POLICES, POLICES_TRAIT, lirePoliceSvg } from './polices.mjs';

const DIST = depuisRacine('dist');
const SORTIE = depuisRacine('dist/php');
const SOURCES = depuisRacine('outils/site-php');
/** Les donnees vivent sous la racine web, dans le dossier unique a envoyer. */
const DONNEES = join(SORTIE, 'public/data');

/** Les annexes de donnees de dist/, sorties en JSON pour le serveur : le texte du script, sans `window.X=` ni le `;` final. */
const ANNEXES_JSON = ['bibliotheque', 'bibliotheque-mdi', 'bibliotheque-ph', 'bibliotheque-tabler', 'bibliotheque-healthicons', 'bibliotheque-lucide', 'polices-catalogue', 'polices-apercus'];
/** Les annexes facultatives (ADR-0042 : le dictionnaire anglais, construit par scripts/langues.mjs) : reprises seulement si elles existent. */
const ANNEXES_JSON_FACULTATIVES = ['langue-en'];

const ecrire = (chemin, texte) => { mkdirSync(join(chemin, '..'), { recursive: true }); writeFileSync(chemin, texte); return texte.length; };

/** Le JSON que pose une annexe `window.__x=…;` ; refuse un fichier qui n'a pas cette forme. */
export function jsonDeAnnexe(texte, nom) {
  const m = /^window\.[A-Za-z_$][\w$]*=([\s\S]*);$/.exec(texte.trim());
  if (!m) throw new Error(nom + ' : ce n’est pas une annexe « window.x=…; »');
  JSON.parse(m[1]);
  return m[1];
}

/** L'application du site, compilee en un script classique, sans rien d'inline (la politique de securite l'interdit). */
async function construireScript() {
  const paquet = JSON.parse(readFileSync(depuisRacine('package.json'), 'utf8'));
  const depot = typeof paquet.repository === 'object' && paquet.repository !== null ? String(paquet.repository.url ?? '') : String(paquet.repository ?? '');
  return empaqueter({
    entryPoints: [depuisRacine('outils/editeur-svg/site.tsx')],
    bundle: true, format: 'iife', target: 'es2020', minify: true, jsx: 'automatic',
    banner: { js: '/* Editeur SVG, site PHP ' + paquet.version + ' (ADR-0030). Mentions des composants tiers : MENTIONS.txt. */' },
    define: { 'process.env.NODE_ENV': '"production"', VERSION_PRODUIT: JSON.stringify(paquet.version), DEPOT_PRODUIT: JSON.stringify(depot) }
  });
}

/** Les styles de la page autonome, tels qu'elle les compose (scripts/page.mjs), puis ceux du site. */
async function construireStyles() {
  const page = await composerPage('');
  const debut = page.indexOf('<style>'), fin = page.indexOf('</style>');
  if (debut < 0 || fin < debut) throw new Error('page.html : la feuille de style est introuvable');
  return page.slice(debut + '<style>'.length, fin).trim() + '\n\n' + readFileSync(depuisRacine('outils/editeur-svg/site.css'), 'utf8');
}

/** Les fontes livrees : leurs fichiers dans public/data/font, et la liste (public/data/json/polices.json) que le site lit a la place de polices.js. */
function construirePolicesSite() {
  const liste = [];
  for (const [id, nom, chemin] of POLICES) {
    const fichier = id + '.ttf';
    copyFileSync(depuisRacine('node_modules/@expo-google-fonts', chemin), join(DONNEES, 'font', fichier));
    liste.push({ id, nom, fichier });
  }
  // Une fonte a trait unique est une police SVG lue en donnees (ADR-0022) : elle reste dans la liste, comme dans polices.js.
  for (const [id, nom, paquet, chemin] of POLICES_TRAIT) liste.push({ id, nom, nature: 'trait', ...lirePoliceSvg(readFileSync(depuisRacine('node_modules', paquet, chemin), 'utf8')) });
  return ecrire(join(DONNEES, 'json/polices.json'), JSON.stringify(liste));
}

export async function construireSitePhp() {
  for (const a of ['vtracer.js', 'MENTIONS.txt', 'aide/guide.html', 'aide/cricut.html', ...ANNEXES_JSON.map(n => n + '.js')]) {
    if (!existsSync(join(DIST, a))) throw new Error('dist/' + a + ' manque : lancez « npm run construire » (le site se construit après la page et ses annexes).');
  }
  rmSync(SORTIE, { recursive: true, force: true });
  cpSync(join(SOURCES, 'public'), join(SORTIE, 'public'), { recursive: true });
  cpSync(join(SOURCES, 'data'), DONNEES, { recursive: true });
  for (const d of ['config', 'comptes', 'sessions', 'jetons', 'json', 'font/catalogue', 'projets/corbeille-comptes', 'journal']) mkdirSync(join(DONNEES, d), { recursive: true });
  mkdirSync(join(SORTIE, 'public/assets'), { recursive: true });
  const script = ecrire(join(SORTIE, 'public/assets/site.js'), await construireScript());
  const styles = ecrire(join(SORTIE, 'public/assets/site.css'), await construireStyles());
  copyFileSync(join(DIST, 'vtracer.js'), join(SORTIE, 'public/assets/vtracer.js'));
  copyFileSync(join(DIST, 'MENTIONS.txt'), join(SORTIE, 'public/MENTIONS.txt'));
  cpSync(join(DIST, 'aide'), join(SORTIE, 'public/aide'), { recursive: true });
  let donnees = 0;
  for (const nom of [...ANNEXES_JSON, ...ANNEXES_JSON_FACULTATIVES.filter(n => existsSync(join(DIST, n + '.js')))]) donnees += ecrire(join(DONNEES, 'json', nom + '.json'), jsonDeAnnexe(readFileSync(join(DIST, nom + '.js'), 'utf8'), nom + '.js'));
  donnees += construirePolicesSite();
  return { script, styles, donnees };
}

if (estLance(import.meta.url)) {
  const r = await construireSitePhp();
  annoncer('Site PHP construit', 'php/', enKo(r.script) + ' Ko de script, ' + enKo(r.styles) + ' Ko de styles, ' + enKo(r.donnees) + ' Ko de données JSON');
}
