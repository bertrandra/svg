// Construit l'instantane de l'index des polices libres telechargeables (ADR-0025) : data/catalogue-polices.json, COMMIS.
// On le relance a la main, quand on veut rafraichir l'index ; le build ne contacte jamais le reseau, il lit ce fichier.
//
//   NODE_USE_ENV_PROXY=1 node scripts/catalogue-polices.mjs     (derriere un proxy ; sinon sans la variable)
//
// Ce que le script lit, et pourquoi la-bas :
//   - Fontsource (api.fontsource.org) : la liste des familles (Google Fonts et les autres), leurs graisses, styles,
//     sous-ensembles, categorie et licence ; jsDelivr (data.jsdelivr.com) : la derniere version de chaque paquet npm
//     @fontsource/<famille> et l'empreinte sha256 de chacun de ses fichiers (on ne telecharge pas 15 000 fichiers pour les hacher) ;
//   - Velvetyne (gitlab.com, groupe velvetyne) : le dernier commit de chaque depot, ses fichiers de fonte et le texte de sa licence ;
//     chaque fichier est telecharge par l'adresse que la page emploiera (l'API GitLab au commit) et hache ici ;
//   - Fontshare (api.fontshare.com) : les familles, leurs styles et leur licence ; chaque fichier WOFF est telecharge et hache ici.
//
// Le registre (src/model/sourcesPolices.ts) decide de ce qui entre : licence de la liste blanche, categorie admise, familles
// attribuees a la League, a SIL, a Collletttivo. L'index produit passe par la validation de la page (model/cataloguePolices.ts)
// avant d'etre ecrit : un index que la page refuserait n'est jamais commis. Une version remplacee passe dans `anciennes`.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { depuisRacine, empaqueter, estLance } from './aide.mjs';

export const FICHIER_CATALOGUE = depuisRacine('data/catalogue-polices.json');

/** Le registre et la validation, compiles a la volee depuis src/ (aucune copie). */
export async function lireRegistre() {
  const code = await empaqueter({
    stdin: { contents: "export * from './src/model/sourcesPolices.ts'; export * from './src/model/cataloguePolices.ts';", resolveDir: depuisRacine(), loader: 'ts' },
    bundle: true, format: 'esm', platform: 'node'
  });
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}

const attendre = ms => new Promise(ok => setTimeout(ok, ms));

// CATALOGUE_CACHE=<dossier> garde chaque reponse sur le disque : relancer le script apres une correction ne retelecharge rien.
// Sans la variable, tout vient du reseau (un rafraichissement de l'index ne doit jamais lire un cache perime).
const CACHE = process.env.CATALOGUE_CACHE;

/** Un fetch qui reessaie (reseau coupe, 429, 5xx), et dit l'adresse quand il abandonne. */
async function chercher(url, options = {}, essais = 5) {
  if (CACHE) {
    const fichier = join(CACHE, createHash('sha256').update(url).digest('hex'));
    if (existsSync(fichier)) { const o = readFileSync(fichier); return new Response(o.length ? o : null, { status: o.length ? 200 : 404 }); }
    const r = await chercherReseau(url, options, essais);
    if (r.ok || r.status === 404) { mkdirSync(CACHE, { recursive: true }); const o = r.ok ? Buffer.from(await r.arrayBuffer()) : Buffer.alloc(0); writeFileSync(fichier, o); return new Response(o.length ? o : null, { status: r.status }); }
    return r;
  }
  return chercherReseau(url, options, essais);
}

async function chercherReseau(url, options, essais) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { ...options, signal: AbortSignal.timeout(60_000) });
      if (r.ok || (r.status < 500 && r.status !== 429) || i >= essais - 1) return r;
    } catch (e) {
      if (i >= essais - 1) throw new Error(url + ' : ' + (e.cause?.message ?? e.message));
    }
    await attendre(1000 * 2 ** i);
  }
}
const json = async url => { const r = await chercher(url); if (!r.ok) throw new Error(url + ' : ' + r.status); return r.json(); };
/** Comme `json`, mais une adresse absente (404) rend null : un paquet annonce par l'API et jamais publie sur npm. */
const jsonOuRien = async url => { const r = await chercher(url); if (r.status === 404) return null; if (!r.ok) throw new Error(url + ' : ' + r.status); return r.json(); };
const octets = async url => { const r = await chercher(url); if (!r.ok) throw new Error(url + ' : ' + r.status); return new Uint8Array(await r.arrayBuffer()); };
const sha256 = o => createHash('sha256').update(o).digest('base64');

/** Applique `fn` a chaque element, `n` a la fois, dans l'ordre des resultats. */
async function enParallele(elements, n, fn) {
  const r = new Array(elements.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < elements.length) { const k = i++; r[k] = await fn(elements[k], k); } }));
  return r;
}

const require = createRequire(import.meta.url);
/** opentype.js (deja une dependance) : lire le nom de famille et verifier que la fonte a bien des lettres latines. */
function lireFonte(o) {
  const { parse } = require('opentype.js');
  try {
    const f = parse(o.buffer.slice(o.byteOffset, o.byteOffset + o.byteLength));
    // opentype.js 2.0 range les noms par plateforme : getEnglishName les cherche partout (Windows, Mac, Unicode).
    const nom = cle => { try { return f.getEnglishName(cle) || undefined; } catch { return undefined; } };
    return { famille: nom('preferredFamily') ?? nom('fontFamily'), style: nom('preferredSubfamily') ?? nom('fontSubfamily'), latin: f.charToGlyph('a').index > 0 && f.charToGlyph('e').index > 0 };
  } catch { return null; }
}

const CATEGORIES_FONTSOURCE = { 'sans-serif': 'lineale', serif: 'empattements', display: 'affiche', handwriting: 'manuscrite', monospace: 'chasse-fixe', other: 'autre' };
const CATEGORIES_FONTSHARE = { sans: 'lineale', serif: 'empattements', slab: 'empattements', display: 'affiche', handwritten: 'manuscrite', script: 'manuscrite' };
const LICENCES_FONTSHARE = { itf_ffl: 'ITF-FFL', sil_ofl: 'OFL-1.1' };

/** Fontsource : toutes les familles qui ont un sous-ensemble latin, une licence admise et une categorie admise. */
async function fontsource(R, journal) {
  const liste = await json('https://api.fontsource.org/v1/fonts');
  const admises = liste.filter(f => {
    if (!f.subsets.includes('latin')) { journal.exclues.push(f.id + ' (pas de latin)'); return false; }
    if (R.CATEGORIES_EXCLUES.includes(f.category)) { journal.exclues.push(f.id + ' (catégorie ' + f.category + ')'); return false; }
    if (!R.estLicenceAdmise(f.license)) { journal.exclues.push(f.id + ' (licence ' + f.license + ')'); return false; }
    return true;
  });
  const familles = await enParallele(admises, 12, async (f, k) => {
    if (k % 200 === 0) console.log('  Fontsource ' + k + ' / ' + admises.length);
    const version = (await jsonOuRien('https://data.jsdelivr.com/v1/packages/npm/@fontsource/' + f.id + '/resolved'))?.version;
    if (!version) { journal.exclues.push(f.id + ' (aucune version npm)'); return null; }
    const arbre = await json('https://data.jsdelivr.com/v1/packages/npm/@fontsource/' + f.id + '@' + version + '?structure=flat');
    const empreintes = new Map((arbre.files ?? []).map(x => [x.name, x.hash]));
    const variantes = [];
    for (const poids of f.weights) for (const style of f.styles) {
      if (style !== 'normal' && style !== 'italic') continue;
      const nom = s => '/files/' + f.id + '-' + s + '-' + poids + '-' + style + '.woff';
      const latin = empreintes.get(nom('latin'));
      if (!latin) continue;
      variantes.push([poids, style === 'italic' ? 1 : 0, latin, empreintes.get(nom('latin-ext')) ?? null]);
    }
    if (!variantes.length) { journal.exclues.push(f.id + ' (aucun fichier WOFF latin)'); return null; }
    return {
      id: f.id, nom: f.family, depot: 'fontsource', source: R.fonderieFontsource(f.id, f.type), categorie: CATEGORIES_FONTSOURCE[f.category] ?? 'autre',
      licence: f.license, version, ecritures: [...f.subsets].sort(), variantes
    };
  });
  const presentes = new Set(liste.map(f => f.id));
  for (const s of R.SOURCES_POLICES) for (const id of s.familles ?? []) if (!presentes.has(id)) journal.manquantes.push(s.nom + ' : ' + id + ' absente de Fontsource');
  return familles.filter(Boolean);
}

const GRAISSE_MOTS = [[/hairline|thin/i, 100], [/extra ?light|ultra ?light/i, 200], [/light/i, 300], [/semi ?bold|demi ?bold|demi/i, 600], [/extra ?bold|ultra ?bold|heavy/i, 800], [/black/i, 900], [/bold/i, 700], [/medium/i, 500]];
/** La graisse, le style et le libelle d'un fichier d'apres le nom de style que la fonte declare (ou celui du fichier). */
function styleDe(brut) {
  const s = (brut ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  const italique = /italic|oblique/i.test(s) ? 1 : 0;
  const poids = GRAISSE_MOTS.find(([m]) => m.test(s))?.[1] ?? 400;
  const reste = s.replace(/italic|oblique|regular|normal|book|roman/gi, '').replace(/hairline|thin|extra ?light|ultra ?light|light|semi ?bold|demi ?bold|demi|extra ?bold|ultra ?bold|heavy|black|bold|medium/gi, '').replace(/\s+/g, ' ').trim();
  return { poids, italique, libelle: reste ? s.replace(/[^\p{L}\p{N} .'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) : undefined };
}

/** Velvetyne : chaque depot du groupe GitLab qui porte l'OFL et livre une fonte, au dernier commit de sa branche par defaut. */
async function velvetyne(R, journal) {
  const API = 'https://gitlab.com/api/v4';
  let projets = [];
  for (let p = 1; p < 10; p++) {
    const l = await json(API + '/groups/velvetyne/projects?per_page=100&include_subgroups=true&archived=false&page=' + p);
    projets = projets.concat(l);
    if (l.length < 100) break;
  }
  const familles = await enParallele(projets, 4, async p => {
    const branche = encodeURIComponent(p.default_branch ?? 'main');
    const [commit] = await json(API + '/projects/' + p.id + '/repository/commits?per_page=1&ref_name=' + branche);
    if (!commit?.id) { journal.exclues.push('velvetyne/' + p.path + ' (aucun commit)'); return null; }
    let arbre = [];
    for (let page = 1; page < 20; page++) {
      const l = await json(API + '/projects/' + p.id + '/repository/tree?recursive=true&per_page=100&ref=' + commit.id + '&page=' + page);
      arbre = arbre.concat(l);
      if (l.length < 100) break;
    }
    const fichiers = arbre.filter(x => x.type === 'blob').map(x => x.path);
    const licence = fichiers.find(x => /(^|\/)(ofl|licen[cs]e)[^/]*$/i.test(x) && !/faq/i.test(x));
    const brut = name => API + '/projects/' + p.id + '/repository/files/' + encodeURIComponent(name) + '/raw?ref=' + commit.id;
    if (!licence) { journal.exclues.push('velvetyne/' + p.path + ' (aucun fichier de licence)'); return null; }
    const texte = new TextDecoder().decode(await octets(brut(licence)));
    if (!/SIL OPEN FONT LICENSE/i.test(texte)) { journal.exclues.push('velvetyne/' + p.path + ' (licence autre que l’OFL : ' + licence + ')'); return null; }
    // Un fichier par style : WOFF d'abord (le plus leger que l'on sache lire), puis TTF, puis OTF ; jamais WOFF2 ; ni sources ni essais.
    const parBase = new Map();
    for (const f of fichiers) {
      const m = /([^/]+)\.(woff|ttf|otf)$/i.exec(f);
      if (!m || /(^|\/)(sources?|proofs?|specimens?|old|archives?|tests?|backup|documentation|docs?)(\/|$)/i.test(f) || /variable|\bVF\b|-VF|VF\./i.test(f)) continue;
      const rang = { woff: 0, ttf: 1, otf: 2 }[m[2].toLowerCase()];
      const deja = parBase.get(m[1]);
      if (!deja || rang < deja.rang) parBase.set(m[1], { chemin: f, rang });
    }
    const variantes = [], vus = new Set();
    for (const { chemin } of [...parBase.values()].sort((a, b) => (a.chemin < b.chemin ? -1 : 1))) {
      if (!R.cheminAdmis('velvetyne', chemin)) {
        journal.exclues.push('velvetyne/' + p.path + '/' + chemin + ' (chemin hors de la forme admise)');
        continue;
      }
      const o = await octets(brut(chemin));
      const lu = lireFonte(o);
      if (!lu?.latin) { journal.exclues.push('velvetyne/' + p.path + '/' + chemin + ' (illisible ou sans lettres latines)'); continue; }
      // Sans nom de style dans la fonte : la fin du nom de fichier apres son dernier tiret (« Basteleur-Bold »), sinon reguliere.
      const base = chemin.replace(/^.*\//, '').replace(/\.\w+$/, '');
      const s = styleDe(lu.style ?? (/[-_]/.test(base) ? base.replace(/^.*[-_]/, '') : 'Regular'));
      const cle = s.poids + ':' + s.italique + ':' + (s.libelle ?? '');
      if (vus.has(cle)) continue;
      vus.add(cle);
      variantes.push([s.poids, s.italique, sha256(o), null, chemin, ...(s.libelle ? [s.libelle] : [])]);
    }
    if (!variantes.length) { journal.exclues.push('velvetyne/' + p.path + ' (aucune fonte lisible)'); return null; }
    // Le nom du depot, rendu lisible (« imago-mundi-mei » : « Imago mundi mei ») : les noms que declarent ces fontes melent
    // souvent la famille et le style (« Feroniapi MediumItalic », « Letters Torn »), celui du depot nomme la famille.
    const lisible = t => { const u = t.replace(/[-_ ]font$/i, '').replace(/[-_]+/g, ' ').trim(); return u.charAt(0).toUpperCase() + u.slice(1); };
    const nom = lisible(p.name).replace(/[\p{Cc}<>&"]/gu, '').trim().slice(0, 80);
    return {
      id: p.path.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64), nom, depot: 'velvetyne', source: 'velvetyne', categorie: 'affiche',
      licence: 'OFL-1.1', version: commit.id, ecritures: ['latin'], projet: String(p.id), variantes: variantes.slice(0, 64)
    };
  });
  return familles.filter(Boolean);
}

/** Fontshare : les familles sous ITF FFL ou OFL, leurs styles statiques en WOFF, telecharges et haches. */
async function fontshare(R, journal) {
  const d = await json('https://api.fontshare.com/v2/fonts?limit=500');
  const familles = await enParallele(d.fonts, 4, async f => {
    const licence = LICENCES_FONTSHARE[f.license_type];
    if (!licence) { journal.exclues.push('fontshare/' + f.slug + ' (licence ' + f.license_type + ')'); return null; }
    if (!/^\d{1,3}(?:\.\d{1,3}){0,2}$/.test(f.version ?? '')) { journal.exclues.push('fontshare/' + f.slug + ' (version illisible : ' + f.version + ')'); return null; }
    const variantes = [], vus = new Set();
    for (const s of f.styles) {
      if (s.is_variable) continue;
      const m = /^\/\/cdn\.fontshare\.com\/wf\/([A-Z0-9]{32}\/[A-Z0-9]{32}\/[A-Z0-9]{32})$/.exec(s.file ?? '');
      if (!m) { journal.exclues.push('fontshare/' + f.slug + '/' + s.weight?.name + ' (adresse inattendue)'); continue; }
      const chemin = m[1] + '.woff';
      const cle = s.weight.weight + ':' + (s.is_italic ? 1 : 0);
      if (vus.has(cle)) continue;
      const o = await octets('https://cdn.fontshare.com/wf/' + chemin);
      const lu = lireFonte(o);
      if (!lu?.latin) { journal.exclues.push('fontshare/' + f.slug + '/' + s.weight.name + ' (illisible ou sans lettres latines)'); continue; }
      vus.add(cle);
      variantes.push([s.weight.weight, s.is_italic ? 1 : 0, sha256(o), null, chemin]);
    }
    if (!variantes.length) { journal.exclues.push('fontshare/' + f.slug + ' (aucun style statique lisible)'); return null; }
    const categorie = CATEGORIES_FONTSHARE[(f.category ?? '').split(',')[0].trim().toLowerCase()] ?? 'autre';
    return { id: f.slug.toLowerCase(), nom: f.name.replace(/[\p{Cc}<>&"]/gu, '').trim().slice(0, 80), depot: 'fontshare', source: 'fontshare', categorie, licence, version: f.version, ecritures: ['latin'], variantes: variantes.slice(0, 64) };
  });
  return familles.filter(Boolean);
}

const cle = f => f.depot + ':' + f.id;
const comparer = (a, b) => { const x = a.nom.toLowerCase(), y = b.nom.toLowerCase(); return x < y ? -1 : x > y ? 1 : a.depot < b.depot ? -1 : a.depot > b.depot ? 1 : 0; };

/** Les versions que le nouvel index remplace ou oublie, ajoutees a celles deja gardees (sans doublon). */
export function anciennesVersions(avant, apres) {
  const nouvelles = new Map(apres.familles.map(f => [cle(f), f]));
  const gardees = [...(avant?.anciennes ?? [])];
  const deja = new Set(gardees.map(f => cle(f) + '@' + f.version));
  for (const f of avant?.familles ?? []) {
    const n = nouvelles.get(cle(f));
    if (n && n.version === f.version && JSON.stringify(n.variantes) === JSON.stringify(f.variantes)) continue;
    if (!deja.has(cle(f) + '@' + f.version)) { gardees.push(f); deja.add(cle(f) + '@' + f.version); }
  }
  return gardees.sort(comparer);
}

/** Le texte du fichier : une famille par ligne, pour qu'un rafraichissement se relise dans un diff. */
export function ecrireCatalogue(c) {
  const lignes = l => l.map(f => JSON.stringify(f)).join(',\n');
  return '{"format":1,"instantane":"' + c.instantane + '","familles":[\n' + lignes(c.familles) + '\n],"anciennes":[\n' + lignes(c.anciennes) + '\n]}\n';
}

async function construire() {
  const R = await lireRegistre();
  const journal = { exclues: [], manquantes: [] };
  console.log('Fontsource…');
  const fs = await fontsource(R, journal);
  console.log('Velvetyne…');
  const vv = await velvetyne(R, journal);
  console.log('Fontshare…');
  const fh = await fontshare(R, journal);
  const avant = existsSync(FICHIER_CATALOGUE) ? JSON.parse(readFileSync(FICHIER_CATALOGUE, 'utf8')) : null;
  // Une famille que la validation de la page refuserait est ecartee et dite, jamais ecrite.
  const familles = [...fs, ...vv, ...fh].filter(f => { const d = R.defautFamille(f); if (d) journal.exclues.push(f.depot + '/' + f.id + ' (refusée : ' + d + ')'); return !d; }).sort(comparer);
  const c = { format: 1, instantane: new Date().toISOString().slice(0, 10), familles, anciennes: [] };
  c.anciennes = anciennesVersions(avant, c);
  const v = R.validerCatalogue(c);
  if ('erreur' in v) throw new Error('index refusé par la validation de la page : ' + v.erreur);
  mkdirSync(dirname(FICHIER_CATALOGUE), { recursive: true });
  const texte = ecrireCatalogue(c);
  writeFileSync(FICHIER_CATALOGUE, texte);
  const parSource = {};
  for (const f of familles) parSource[f.source] = (parSource[f.source] ?? 0) + 1;
  console.log('Index écrit : data/catalogue-polices.json (' + familles.length + ' familles, ' + familles.reduce((n, f) => n + f.variantes.length, 0) + ' variantes, ' + Math.round(texte.length / 1024) + ' Ko).');
  console.log('Par source :', parSource);
  console.log(journal.exclues.length + ' exclusions :\n  ' + journal.exclues.join('\n  '));
  if (journal.manquantes.length) console.log('Familles du registre absentes :\n  ' + journal.manquantes.join('\n  '));
}

if (estLance(import.meta.url)) await construire();
