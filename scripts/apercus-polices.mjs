// Prepare les apercus des polices du catalogue (ADR-0026) : le nom de chaque famille dessine dans sa propre fonte, en contours,
// dans data/apercus-polices.json, COMMIS. On le relance a la main apres un rafraichissement de l'index
// (scripts/catalogue-polices.mjs), jamais au build : le build ne contacte pas le reseau, il lit ce fichier.
//
//   NODE_USE_ENV_PROXY=1 node scripts/apercus-polices.mjs        (derriere un proxy ; sinon sans la variable)
//   APERCUS_CACHE=<dossier> garde chaque fichier telecharge : relancer apres une correction ne retelecharge rien.
//
// Pour chaque famille : sa variante principale (la reguliere droite, a defaut la plus proche, celle que la page choisit), son
// fichier latin (ou complet) telecharge a l'adresse meme que la page emploierait, VERIFIE par l'empreinte sha256 de l'index avant
// d'etre lu, remis en sfnt et lu par le code de la page (io/woff.ts, io/polices.ts) ; le latin etendu seulement si le nom a une
// lettre que le latin n'a pas. Le nom est compose par le moteur (engine/texte/apercuNom.ts, la meme fonction que la page pour une
// police deja chargee) et code en compact (model/apercusPolices.ts). Une famille qui ne se dessine pas (fichier inaccessible,
// empreinte fausse, lettre manquante) n'a pas d'apercu : la page ecrit son nom dans la police de l'interface. Le fichier produit
// passe par la validation de la page avant d'etre ecrit.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { depuisRacine, empaqueter, estLance } from './aide.mjs';
import { FICHIER_CATALOGUE } from './catalogue-polices.mjs';

export const FICHIER_APERCUS = depuisRacine('data/apercus-polices.json');

/** Le code de la page qu'emploie le script, compile a la volee depuis src/ (aucune copie). */
export async function lireOutils() {
  const code = await empaqueter({
    stdin: {
      contents: [
        "export { validerCatalogue, variantePrincipale } from './src/model/cataloguePolices.ts';",
        "export * from './src/model/apercusPolices.ts';",
        "export { tracerNom } from './src/engine/texte/apercuNom.ts';",
        "export { enSfnt } from './src/io/woff.ts';",
        "export { glyphesDe } from './src/io/polices.ts';",
        "export { glyphesComposes } from './src/io/policesEnLigne.ts';",
        "export { parse } from 'opentype.js';"
      ].join('\n'),
      resolveDir: depuisRacine(), loader: 'ts'
    },
    bundle: true, format: 'esm', platform: 'node'
  });
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}

/** La cle d'une famille, celle de l'annexe et des favoris (zones/ExplorateurPolices.tsx, cleFamille). */
export const cleFamille = f => f.depot + ':' + f.id;

/** Le texte du fichier : une famille par ligne, pour qu'un rafraichissement se relise dans un diff. */
export function ecrireApercus(a) {
  const lignes = Object.entries(a.apercus).map(([cle, code]) => JSON.stringify(cle) + ':' + JSON.stringify(code)).join(',\n');
  return '{"format":1,"instantane":"' + a.instantane + '","corps":' + a.corps + ',"haut":' + a.haut + ',"bas":' + a.bas + ',"apercus":{\n' + lignes + '\n}}\n';
}

const CACHE = process.env.APERCUS_CACHE;
const attendre = ms => new Promise(ok => setTimeout(ok, ms));

/** Les octets d'une adresse (ou du cache disque), avec quelques essais ; null pour une adresse qui repond une erreur. */
async function telecharger(url) {
  const fichier = CACHE ? join(CACHE, createHash('sha256').update(url).digest('hex')) : null;
  if (fichier && existsSync(fichier)) return new Uint8Array(readFileSync(fichier));
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (r.ok) {
        const o = new Uint8Array(await r.arrayBuffer());
        if (fichier) { mkdirSync(CACHE, { recursive: true }); writeFileSync(fichier, o); }
        return o;
      }
      if (r.status < 500 && r.status !== 429) return { erreur: url + ' a répondu ' + r.status };
    } catch (e) {
      if (i === 3) return { erreur: url + ' : ' + (e.cause?.message ?? e.message) };
    }
    await attendre(1000 * 2 ** i);
  }
  return { erreur: url + ' ne répond pas' };
}

const sha256 = o => createHash('sha256').update(o).digest('base64');

/** Un fichier de la variante, verifie par son empreinte : la premiere adresse qui sert les bons octets. */
async function fichierVerifie(f) {
  const raisons = [];
  for (const a of f.adresses) {
    const o = await telecharger(a.url);
    if (!(o instanceof Uint8Array)) { raisons.push(o.erreur); continue; }
    if (sha256(o) !== f.empreinte) { raisons.push(a.url + ' : empreinte différente de l’index, refusé'); continue; }
    return o;
  }
  return { erreur: raisons.join(' ; ') || 'aucune adresse' };
}

/** Les glyphes d'un fichier verifie, lus par le code de la page. */
async function glyphesDe(O, octets) {
  const sfnt = await O.enSfnt(octets);
  if ('erreur' in sfnt) return sfnt;
  try { return O.glyphesDe(O.parse(sfnt), sfnt); } catch (e) { return { erreur: 'fonte illisible (' + e.message + ')' }; }
}

/** L'apercu d'une famille : son code compact, ou la raison de ne pas en avoir. */
async function apercuDe(O, famille) {
  const v = O.variantePrincipale(famille);
  if (!v) return { erreur: 'aucune variante' };
  const [premier, second] = v.fichiers;
  const o1 = await fichierVerifie(premier);
  if (!(o1 instanceof Uint8Array)) return o1;
  let g = await glyphesDe(O, o1);
  if ('erreur' in g) return g;
  const manque = [...famille.nom].some(c => c.trim() && g.possede?.(c) === false);
  if (manque && second) {
    const o2 = await fichierVerifie(second);
    if (!(o2 instanceof Uint8Array)) return o2;
    const g2 = await glyphesDe(O, o2);
    if ('erreur' in g2) return g2;
    g = O.glyphesComposes(g, g2);
  }
  const trace = O.tracerNom(famille.nom, g);
  if (!trace) return { erreur: 'le nom ne se dessine pas (lettre absente de la fonte)' };
  const code = O.encoderApercu(trace);
  // Un nom trop lourd (une fonte en pixels : des centaines de carres) passe les bornes que la page impose : pas d'apercu.
  if (code.length > O.LIMITES_APERCUS.code || trace.commandes.length > O.LIMITES_APERCUS.commandes) return { erreur: 'aperçu trop lourd (' + code.length + ' caractères, ' + trace.commandes.length + ' commandes)' };
  // Le code relu doit rendre le meme trace : un codage qui perdrait un point ne serait jamais commis.
  if (JSON.stringify(O.decoderApercu(code)) !== JSON.stringify(trace)) throw new Error(famille.nom + ' : le code compact ne se relit pas à l’identique');
  const ys = trace.commandes.flatMap(c => c.p.filter((_, i) => i % 2 === 1));
  return { code, haut: -Math.min(0, ...ys), bas: Math.max(0, ...ys), largeur: trace.largeur };
}

/** Applique `fn` a chaque element, `n` a la fois, dans l'ordre des resultats. */
async function enParallele(elements, n, fn) {
  const r = new Array(elements.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < elements.length) { const k = i++; r[k] = await fn(elements[k], k); } }));
  return r;
}

async function construire() {
  const O = await lireOutils();
  const catalogue = O.validerCatalogue(JSON.parse(readFileSync(FICHIER_CATALOGUE, 'utf8')));
  if ('erreur' in catalogue) throw new Error('data/catalogue-polices.json refusé : ' + catalogue.erreur);
  const familles = catalogue.familles;
  const resultats = await enParallele(familles, 8, async (f, k) => {
    if (k % 200 === 0) console.log('  ' + k + ' / ' + familles.length);
    try { return await apercuDe(O, f); } catch (e) { if (/identique/.test(e.message)) throw e; return { erreur: e.message }; }
  });
  const apercus = {}, sans = [];
  let debordeHaut = 0, debordeBas = 0, coupes = 0;
  familles.forEach((f, i) => {
    const r = resultats[i];
    if (r.erreur) { sans.push(cleFamille(f) + ' (' + r.erreur + ')'); return; }
    apercus[cleFamille(f)] = r.code;
    if (r.haut > O.CADRE_APERCU.haut) debordeHaut++;
    if (r.bas > O.CADRE_APERCU.bas) debordeBas++;
    if (r.largeur >= O.CADRE_APERCU.largeurMax) coupes++;
  });
  const { corps, haut, bas } = O.CADRE_APERCU;
  const donnees = { format: 1, instantane: catalogue.instantane, corps, haut, bas, apercus };
  const v = O.validerApercus(donnees);
  if ('erreur' in v) throw new Error('aperçus refusés par la validation de la page : ' + v.erreur);
  const texte = ecrireApercus(donnees);
  writeFileSync(FICHIER_APERCUS, texte);
  const n = Object.keys(apercus).length;
  console.log('Aperçus écrits : data/apercus-polices.json (' + n + ' familles sur ' + familles.length + ', ' + Math.round(texte.length / 1024) + ' Ko, '
    + Math.round(gzipSync(texte).length / 1024) + ' Ko compressés).');
  console.log('Dépassent le cadre : ' + debordeHaut + ' en haut, ' + debordeBas + ' en bas ; ' + coupes + ' noms coupés à la largeur du cadre.');
  const dessines = resultats.filter(r => !r.erreur);
  const centiles = cle => { const l = dessines.map(r => r[cle]).sort((a, b) => a - b); return [0.5, 0.95, 0.99].map(q => l[Math.floor(q * (l.length - 1))]).join(' / '); };
  console.log('Étendue au-dessus de la ligne de base (médiane / 95 % / 99 %) : ' + centiles('haut') + ' ; au-dessous : ' + centiles('bas') + '.');
  console.log(sans.length + ' familles sans aperçu :\n  ' + sans.join('\n  '));
}

if (estLance(import.meta.url)) await construire();
