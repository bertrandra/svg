// Les mentions des composants tiers : ce que l'editeur redistribue dans dist/ et la licence de chacun.
//
//   npm run mentions            -> THIRD-PARTY-NOTICES.md (commite) et dist/MENTIONS.txt
//   node scripts/mentions.mjs --dist   -> dist/MENTIONS.txt seul (ce que fait `npm run construire`)
//
// La liste des composants est celle de src/model/credits.ts, qui nourrit aussi la boite « A propos et credits ».
// Ce script ne recopie aucun texte de licence : il le lit dans le paquet (LICENSE, LICENSE_FONT ; a defaut, la section
// « License » du README du paquet), et dit ceux qui n'en portent pas. Il refuse de produire quoi que ce soit si
//   - un composant de la liste n'est pas dans package-lock.json, ou y a une autre licence que celle declaree ;
//   - un paquet que les bundles embarquent n'est pas dans la liste (ou l'inverse) ;
//   - une fonte embarquee (scripts/polices.mjs pour le texte, scripts/fontes-interface.mjs pour la page) n'est pas dans la liste.
// Un test (tests/unit/depot/mentions.test.ts) refait le calcul en memoire et echoue si THIRD-PARTY-NOTICES.md est perime.

import { build } from 'esbuild';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ecrireDansDist, depuisRacine, empaqueter, estLance } from './aide.mjs';
import { FONTES_INTERFACE } from './fontes-interface.mjs';
import { POLICES } from './polices.mjs';

/** Un fichier en texte, en LF (le depot peut etre extrait en CRLF sous Windows) et sans blancs en fin de ligne. */
const lire = chemin => readFileSync(chemin, 'utf8').replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trimEnd();

const modules = depuisRacine('node_modules');
const paquetDe = nom => join(modules, nom);
const jsonDe = chemin => JSON.parse(readFileSync(chemin, 'utf8'));

/** La liste des composants, lue dans src/model/credits.ts, et le registre des sources de formes (compiles a la volee, pas de copie). */
export async function lireCredits() {
  // Le registre des sources de formes avec : la section des formes en tire chaque source libre.
  const code = await empaqueter({
    stdin: { contents: "export * from './src/model/credits.ts'; export { SOURCES_FORMES } from './src/model/sourcesFormes.ts';", resolveDir: depuisRacine(), loader: 'ts' },
    bundle: true, format: 'esm', platform: 'node'
  });
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}

/** Le nom du paquet npm d'un chemin sous node_modules/ (les noms a portee compris), ou null. */
const paquetDeChemin = chemin => /(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(chemin)?.[1] ?? null;

/**
 * Les paquets npm qui entrent dans les bundles livres : ce que esbuild assemble pour la page, pour le bundle
 * d'embarquement et pour le traceur. C'est la verite de ce qui est redistribue, bien plus sure qu'une liste a tenir.
 */
export async function paquetsEmbarques() {
  const trouves = new Set(), fichiers = new Set();
  // Le module virtuel des feuilles (scripts/embarquer.mjs) n'a pas de paquet : une coquille vide suffit ici.
  const feuilleVide = { name: 'feuille-editeur', setup(b) {
    b.onResolve({ filter: /^feuille-editeur$/ }, () => ({ path: 'feuille-editeur', namespace: 'feuille-editeur' }));
    b.onLoad({ filter: /.*/, namespace: 'feuille-editeur' }, () => ({ contents: 'export default "";', loader: 'js' }));
  } };
  for (const entree of ['entree.tsx', 'embarque.ts', 'vtracer-entree.ts']) {
    const r = await build({
      // Comme les vrais builds : la plateforme du navigateur (elle choisit le champ `module`, donc d'autres fichiers que `main`).
      // Seul le traceur lit `fs` (sa colle pour Node, que scripts/vtracer.mjs remplace) et demande la plateforme node.
      entryPoints: [depuisRacine('outils/editeur-svg', entree)], bundle: true, format: 'iife', platform: entree === 'vtracer-entree.ts' ? 'node' : 'browser', write: false, metafile: true,
      jsx: 'automatic', logLevel: 'silent', plugins: [feuilleVide], loader: { '.wasm': 'binary' },
      define: { 'process.env.NODE_ENV': '"production"', VERSION_EMBARQUEE: '"0"', VERSION_PRODUIT: '"0"' }
    });
    for (const f of Object.keys(r.metafile.inputs)) { const p = paquetDeChemin(f); if (p) { trouves.add(p); fichiers.add(f); } }
  }
  return { paquets: [...trouves].sort(), fichiers: [...fichiers] };
}

/**
 * Les composants recopies dans le fichier livre d'un autre paquet (credits.ts, champ `dans`) : le fichier que les bundles
 * prennent, et ce qui y prouve la presence (un en-tete de licence, un nom de version). Le test de presence est ce qui
 * garde la liste honnete : si polygon-clipping change de build, la verification echoue au lieu de se taire.
 */
const INTEGRES = {
  splaytree: { fichier: 'polygon-clipping/dist/polygon-clipping.umd.js', motif: /splaytree v(\d+\.\d+\.\d+)/ },
  'robust-predicates': { fichier: 'polygon-clipping/dist/polygon-clipping.umd.js', motif: /orient2dadapt/ },
  tslib: { fichier: 'polygon-clipping/dist/polygon-clipping.umd.js', motif: /Copyright \(c\) Microsoft Corporation\. All rights reserved\./ },
  'tiny-inflate': { fichier: 'opentype.js/dist/opentype.js', motif: /tiny-inflate@(\d+\.\d+\.\d+)/ }
};

/** Les textes de licence que le depot garde en copie, faute d'un paquet installe qui les porte : copies verbatim du fichier LICENSE du paquet publie. */
const LICENCES_COPIEES = { 'tiny-inflate': { fichier: 'scripts/licences/tiny-inflate-1.0.3.LICENSE', source: 'le fichier LICENSE du paquet tiny-inflate 1.0.3 publié sur npm (copie dans scripts/licences/)' } };

/**
 * Les licences des sources libres de formes : les paquets @iconify-json ne livrent ni fichier de licence ni notice, seulement
 * l'identifiant SPDX et l'adresse de la licence du depot amont. Le depot garde une copie verbatim de ce fichier, relevee le
 * 25 octobre 2026 sur la branche principale de chaque depot (un test verifie que le titulaire du registre y figure).
 */
export const LICENCES_SOURCES = {
  '@iconify-json/mdi': { fichier: 'scripts/licences/mdi-MaterialDesign.LICENSE', amont: 'https://github.com/Templarian/MaterialDesign/blob/master/LICENSE' },
  '@iconify-json/ph': { fichier: 'scripts/licences/ph-phosphor-core.LICENSE', amont: 'https://github.com/phosphor-icons/core/blob/main/LICENSE' },
  '@iconify-json/tabler': { fichier: 'scripts/licences/tabler-icons.LICENSE', amont: 'https://github.com/tabler/tabler-icons/blob/master/LICENSE' },
  '@iconify-json/healthicons': { fichier: 'scripts/licences/healthicons.LICENSE', amont: 'https://github.com/resolvetosavelives/healthicons/blob/main/LICENSE' },
  '@iconify-json/lucide': { fichier: 'scripts/licences/lucide.LICENSE', amont: 'https://github.com/lucide-icons/lucide/blob/main/LICENSE' }
};

/** La version d'un composant integre, lue dans le fichier livre de son paquet ; lance si la preuve manque. */
function constaterIntegre(c, embarques) {
  const marque = INTEGRES[c.paquet];
  if (!marque) throw new Error('mentions : ' + c.paquet + ' est déclaré intégré à ' + c.dans + ' mais scripts/mentions.mjs ne sait pas le constater (INTEGRES)');
  const chemin = embarques.fichiers.find(f => f.endsWith(marque.fichier));
  if (!chemin) throw new Error('mentions : ' + marque.fichier + ' n’entre plus dans les bundles : ' + c.paquet + ' n’y est plus intégré ?');
  const m = marque.motif.exec(readFileSync(depuisRacine(chemin), 'utf8'));
  if (!m) throw new Error('mentions : ' + c.paquet + ' n’est plus visible dans ' + marque.fichier + ' (' + marque.motif + ')');
  return m[1] ?? null;
}

const FICHIER_LICENCE = /^(licen[cs]e)(\.(md|txt))?$/i;

/** Le texte de licence d'un paquet et d'ou il vient : { texte, source } ; texte null si le paquet n'en porte aucun. */
function licenceDe(nom, fichierFonte) {
  const dossier = paquetDe(nom);
  const nomFichier = fichierFonte ?? readdirSync(dossier).find(f => FICHIER_LICENCE.test(f));
  if (nomFichier && existsSync(join(dossier, nomFichier))) return { texte: lire(join(dossier, nomFichier)), source: 'le fichier ' + nomFichier + ' du paquet' };
  // Pas de fichier : la section « License » du README du paquet, si elle porte un texte de licence (cas de splaytree).
  const readme = readdirSync(dossier).find(f => /^readme(\.md)?$/i.test(f));
  if (readme) {
    const t = lire(join(dossier, readme));
    const i = t.search(/^#{1,3} Licen[cs]e\s*$/im);
    const section = i >= 0 ? t.slice(i).replace(/^#{1,3} Licen[cs]e\s*\n+/i, '') : '';
    if (/Permission is hereby granted|This is free and unencumbered|Apache License/i.test(section)) {
      return { texte: section.trim(), source: 'la section « License » du README du paquet (il n’a pas de fichier de licence)' };
    }
  }
  return { texte: null, source: 'aucun texte de licence dans le paquet' };
}

/** Un texte de licence en bloc de code (les licences ont des lignes qui ressembleraient a du Markdown). */
const bloc = texte => '```text\n' + texte + '\n```';

function verifierLockEtListe(credits, verrou, embarques) {
  const erreurs = [];
  for (const c of credits.COMPOSANTS) {
    if (c.installe === false) continue;
    const e = verrou.packages['node_modules/' + c.paquet];
    if (!e) { erreurs.push(c.paquet + ' : absent de package-lock.json'); continue; }
    if (!String(e.license ?? '').includes(c.spdx)) erreurs.push(c.paquet + ' : package-lock.json dit « ' + (e.license ?? 'rien') + ' », credits.ts « ' + c.spdx + ' »');
    if (!existsSync(paquetDe(c.paquet))) erreurs.push(c.paquet + ' : absent de node_modules (npm ci)');
  }
  // Les bundles embarquent tout paquet qu'ils importent : la liste (hors recopies, `dans`) doit etre exactement celle-la.
  const logiciels = new Set(credits.COMPOSANTS.filter(c => c.genre === 'logiciel' && !c.dans).map(c => c.paquet));
  for (const p of embarques.paquets) if (!logiciels.has(p)) erreurs.push(p + ' : embarque dans dist/ mais absent de src/model/credits.ts');
  for (const p of logiciels) if (!embarques.paquets.includes(p)) erreurs.push(p + ' : dans src/model/credits.ts mais embarque nulle part');
  for (const c of credits.COMPOSANTS.filter(x => x.dans)) {
    if (!logiciels.has(c.dans)) erreurs.push(c.paquet + ' : dit intégré à ' + c.dans + ', qui n’est pas un logiciel embarqué');
    try { constaterIntegre(c, embarques); } catch (e) { erreurs.push(e.message); }
  }
  const fontes = new Set(credits.COMPOSANTS.filter(c => c.genre === 'fonte').map(c => c.paquet));
  const embarqueesFontes = new Set([...POLICES.map(p => '@expo-google-fonts/' + p[2].split('/')[0]), ...FONTES_INTERFACE.map(f => f.paquet)]);
  for (const p of embarqueesFontes) if (!fontes.has(p)) erreurs.push(p + ' : fonte embarquee (scripts/polices.mjs ou scripts/fontes-interface.mjs) absente de src/model/credits.ts');
  for (const p of fontes) if (!embarqueesFontes.has(p)) erreurs.push(p + ' : dans src/model/credits.ts mais embarquee nulle part');
  if (erreurs.length) throw new Error('mentions : la liste des composants ne tient pas\n  - ' + erreurs.join('\n  - '));
}

/** Le fichier de licence d'une fonte : LICENSE_FONT chez @expo-google-fonts (LICENSE y est celui du paquet MIT), LICENSE chez @fontsource. */
const fichierLicenceFonte = paquet => ['LICENSE_FONT', 'LICENSE'].find(f => existsSync(join(paquetDe(paquet), f))) ?? 'LICENSE_FONT';

/** Les fontes : une ligne de copyright par fonte, puis chaque texte de licence distinct une seule fois. */
function sectionFontes(credits, verrou) {
  const fontes = credits.composantsDe('fonte');
  const lignes = ['## Fontes', '',
    POLICES.length + ' fontes (' + (fontes.length - FONTES_INTERFACE.length) + ' familles) sont embarquées dans `polices.js`, pour le texte en formes ; ' + FONTES_INTERFACE.length + ' familles de plus (Instrument Sans et IBM Plex Mono,',
    'sous-ensemble latin) sont incorporées à `editeur-svg.html`, pour l’interface de la page : la page ne les demande à aucun serveur. Toutes sont sous la licence SIL Open Font License 1.1.',
    'Le copyright de chacune ci-dessous accompagne la fonte partout où elle est redistribuée ; le texte de la licence suit, une fois par variante.', ''];
  const corps = new Map();
  for (const c of fontes) {
    const e = verrou.packages['node_modules/' + c.paquet];
    const nomFichier = fichierLicenceFonte(c.paquet);
    const { texte } = licenceDe(c.paquet, nomFichier);
    if (!texte) throw new Error('mentions : ' + c.paquet + ' n’a pas de ' + nomFichier);
    // Certains paquets (IBM Plex) listent, sur la meme ligne, le copyright de chaque fichier de fonte : on garde le premier.
    const copyright = (texte.split('\n').find(l => l.trim() !== '') ?? '').replace(/ \S+\.ttf:.*$/, '');
    if (!/^Copyright/i.test(copyright)) throw new Error('mentions : ' + c.paquet + ' : la première ligne de ' + nomFichier + ' n’est pas un copyright');
    const i = texte.indexOf('SIL OPEN FONT LICENSE Version 1.1');
    if (i < 0) throw new Error('mentions : ' + c.paquet + ' : ' + nomFichier + ' ne porte pas la SIL OFL 1.1');
    const licence = texte.slice(i).trim();
    if (!corps.has(licence)) corps.set(licence, []);
    corps.get(licence).push(c.nom);
    lignes.push('- **' + c.nom + '** (`' + c.paquet + '` ' + e.version + ') : ' + copyright, '  ' + c.url);
  }
  lignes.push('');
  let n = 0;
  for (const [licence, noms] of corps) {
    lignes.push('### Texte de la SIL Open Font License 1.1' + (corps.size > 1 ? ' (variante ' + ++n + ' : ' + noms.join(', ') + ')' : ''), '', bloc(licence), '');
  }
  return lignes;
}

/** Le texte de licence d'un logiciel et sa source ; { texte: null } quand rien ne le porte. */
function licenceLogiciel(c) {
  const copie = LICENCES_COPIEES[c.paquet];
  if (copie) return { texte: lire(depuisRacine(copie.fichier)), source: copie.source };
  return c.installe === false ? { texte: null, source: '' } : licenceDe(c.paquet);
}

/** Les logiciels : un texte de licence distinct par groupe de paquets qui le partagent. */
function sectionLogiciels(credits, verrou, embarques) {
  const lignes = ['## Logiciels', '',
    'Ces composants sont compilés dans `editeur-svg.html`, `editeur-svg-embarque.js` et `vtracer.js`. Ceux qui sont « intégrés » sont recopiés dans le fichier',
    'livré d’un autre paquet (un build UMD) : ils n’ont pas de paquet à eux dans les bundles, mais leur licence les accompagne.', ''];
  const groupes = new Map(), sans = [];
  for (const c of credits.composantsDe('logiciel')) {
    let version;
    if (c.dans) {
      const integree = constaterIntegre(c, embarques);
      const installee = c.installe === false ? '' : ' ; copie installée ' + verrou.packages['node_modules/' + c.paquet].version;
      version = 'intégré à `' + c.dans + '`' + (integree ? ', version ' + integree : '') + installee;
    } else version = verrou.packages['node_modules/' + c.paquet].version;
    lignes.push('- **' + c.nom + '** (`' + c.paquet + '`, ' + version + ') : ' + c.spdx + ' · ' + c.titulaire + ' · ' + c.url);
    const { texte, source } = licenceLogiciel(c);
    if (!texte) { sans.push(c); continue; }
    const g = groupes.get(texte) ?? { source, paquets: [] };
    g.paquets.push(c.paquet);
    groupes.set(texte, g);
  }
  lignes.push('');
  for (const [texte, g] of groupes) lignes.push('### Licence de ' + g.paquets.join(', ') + ' (d’après ' + g.source + ')', '', bloc(texte), '');
  for (const c of sans) {
    lignes.push('### ' + c.paquet + ' : texte de licence absent', '', c.installe === false
      ? 'Le fichier livré de `' + c.dans + '` recopie ' + c.paquet + ' sous la licence « ' + c.spdx + ' », avec l’en-tête de copyright de ' + c.titulaire + ' (conservé dans le code livré) ; aucun paquet installé ne porte le texte complet de la licence, qui est à ' + c.url + '.'
      : 'Le paquet déclare la licence « ' + c.spdx + ' » (package.json) mais ne livre ni fichier de licence ni notice de copyright. Le texte de la licence est à l’adresse du projet (' + c.url + ') ; le titulaire n’est pas nommé par le paquet.', '');
  }
  lignes.push('### vtracer : composants Rust compilés dans le binaire WebAssembly', '',
    'Le binaire `vtracer_wasm_bg.wasm` est compilé à partir de bibliothèques Rust (dont `visioncortex`) ; le paquet npm n’en livre pas la liste ni les notices. Elles ne sont pas reprises ici.', '');
  return lignes;
}

function sectionFormes(credits) {
  const info = jsonDe(join(paquetDe('@iconify-json/game-icons'), 'info.json'));
  const verrou = jsonDe(depuisRacine('package-lock.json'));
  const source = credits.SOURCES_ORIGINE[0];
  const lignes = ['## Formes de la bibliothèque', '',
    '- Source : **' + info.name + '**, paquet `@iconify-json/game-icons` ' + verrou.packages['node_modules/@iconify-json/game-icons'].version + ' — ' + source.url,
    '- Licence : **' + info.license.title + '** (`' + info.license.spdx + '`) — ' + source.urlLicence,
    '- Auteur déclaré par le jeu de données : « ' + info.author.name + ' » (' + info.author.url + ') ; licence déclarée : ' + info.license.url,
    '- **Crédit à donner : ' + source.nom + '.** Le jeu de données ne porte pas l’auteur de chaque icône : il n’y a donc pas de crédit par forme à écrire,',
    '  mais celui-ci, qui nomme la source et sa licence, doit accompagner chaque redistribution.',
    '- Le texte juridique de la licence n’est pas fourni par le paquet (ni fichier de licence, ni notice de copyright) : il est à l’adresse ci-dessus.',
    '- Les formes sont modifiées par l’éditeur (recolorées, redimensionnées, assemblées) ; ces modifications sont des adaptations au sens de la licence.',
    '', 'Ce que l’éditeur fait pour vous : tout SVG écrit qui contient une forme de la bibliothèque porte un élément `<metadata>` avec cette mention, et chaque `<path>` issu',
    'de la bibliothèque un attribut `data-origine` (par exemple `game-icons:3d-glasses`) ; un PDF la porte dans ses informations (`/Subject`) ; un SVG de découpe',
    'la porte en commentaire. Un PNG ne peut pas la porter : citez la source là où vous le publiez. La mention écrite est :', '',
    '> ' + credits.mentionOrigines([credits.origineDeBibliotheque('exemple')]), '',
    ...sectionSourcesLibres(credits, verrou)];
  return lignes;
}

/** Ce qu'on garde d'une source libre, en une phrase : ses variantes et leur nature. */
const variantesDe = source => source.variantes.map(v => (v.suffixe ? '« ' + v.suffixe + ' »' : 'sans suffixe') + ' (' + (v.nature === 'plein' ? 'pleine' : 'en ligne') + ')').join(', ');

/** Les sources libres de la bibliotheque : chacune avec sa version, sa licence, son titulaire et le texte de sa licence. */
function sectionSourcesLibres(credits, verrou) {
  const libres = credits.SOURCES_FORMES.filter(s => !s.mentionDansLeFichier);
  const lignes = ['### Sources libres de la bibliothèque', '',
    'Ces jeux sont livrés en annexes chargées à la demande (`bibliotheque-<source>.js`). Leurs licences (MIT, ISC, Apache 2.0) ne demandent pas de mention',
    'dans chaque dessin : un SVG écrit garde seulement l’origine de la forme (`data-origine`, par exemple `mdi:heart`), sans `<metadata>`. Leur notice',
    'et le texte de leur licence accompagnent la bibliothèque, ici et dans `MENTIONS.txt`. Les logos de marque sont écartés par règle (`MOTS_DE_MARQUE`).', ''];
  for (const s of libres) {
    const copie = LICENCES_SOURCES[s.paquet];
    if (!copie) throw new Error('mentions : ' + s.paquet + ' : pas de copie de licence déclarée (LICENCES_SOURCES)');
    const info = jsonDe(join(paquetDe(s.paquet), 'info.json'));
    lignes.push('#### ' + s.nom, '',
      '- Paquet `' + s.paquet + '` ' + verrou.packages['node_modules/' + s.paquet].version + ' (« ' + info.name + ' », ' + info.total + ' icônes dans le jeu) — ' + s.url,
      '- Licence : **' + s.licence + '** (`' + s.spdx + '`) — ' + s.urlLicence + ' ; titulaire : ' + s.titulaire,
      '- Variantes gardées : ' + variantesDe(s) + ' ; plan de ' + s.plan + ' unités.',
      '- Texte de la licence, copié du dépôt amont (' + copie.amont + ') :', '', bloc(lire(depuisRacine(copie.fichier))), '');
  }
  return lignes;
}

/** Les mentions complètes : le texte de THIRD-PARTY-NOTICES.md et de dist/MENTIONS.txt (le même). */
export async function composerMentions() {
  const credits = await lireCredits();
  const verrou = jsonDe(depuisRacine('package-lock.json'));
  const embarques = await paquetsEmbarques();
  verifierLockEtListe(credits, verrou, embarques);
  const lignes = [
    '# Mentions des composants tiers', '',
    'Ce fichier est généré par `npm run mentions` (`scripts/mentions.mjs`) à partir de `src/model/credits.ts`, de `package-lock.json` et des fichiers de licence',
    'des paquets : ne le modifiez pas à la main. Il liste ce que l’éditeur redistribue dans `dist/` (la page, le bundle d’embarquement, la bibliothèque de formes,',
    'les fontes, le traceur vtracer). Le même texte est livré sous le nom `MENTIONS.txt` ; l’éditeur le résume dans « À propos et crédits » (menu Fichier).', '',
    'Ce fichier ne couvre que les composants tiers ; la licence du projet lui-même, s’il en porte une, est dans le fichier `LICENSE` du dépôt.', '',
    ...sectionFormes(credits),
    ...sectionFontes(credits, verrou),
    ...sectionLogiciels(credits, verrou, embarques)
  ];
  return lignes.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

if (estLance(import.meta.url)) {
  const texte = await composerMentions();
  ecrireDansDist('MENTIONS.txt', texte);
  if (!process.argv.includes('--dist')) writeFileSync(depuisRacine('THIRD-PARTY-NOTICES.md'), texte);
  console.log('Mentions écrites : dist/MENTIONS.txt' + (process.argv.includes('--dist') ? '' : ' et THIRD-PARTY-NOTICES.md') + ' (' + Math.round(texte.length / 1024) + ' Ko).');
}
