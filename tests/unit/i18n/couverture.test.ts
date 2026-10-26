// La couverture de la traduction et le cliquet (ADR-0042 §4). Toute cle d'un `t('…')` ou d'un `pluriel(n, '…')` de src/ a sa
// traduction dans le dictionnaire anglais fusionne (src/i18n/en/*.json) ; aucune cle du dictionnaire n'est orpheline ; une cle n'a
// qu'une traduction ; une traduction garde les `{valeurs}` de sa cle. Et le cliquet : le nombre de littéraux a l'air francais hors
// de `t` ne depasse jamais tests/fixtures/i18n/restes.json, que l'on baisse (ACTUALISER_REFERENCES=1 l'ecrit, jamais au-dessus) et
// jamais ne remonte. A la fin du chantier, il vaut zero.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { auPluriel } from '../../../src/util/texte.js';
import { extraireDossier, extraireFichier, restesParFichier } from './extraire.js';

const RACINE = resolve(__dirname, '../../..');
const SRC = resolve(RACINE, 'src');
const FICHIER_RESTES = resolve(RACINE, 'tests/fixtures/i18n/restes.json');

type Table = Record<string, string>;
interface Langues {
  LANGUES_TRADUITES: string[];
  lireDictionnaires: (langue: string) => Record<string, Table>;
  fusionnerDictionnaires: (tables: Record<string, Table>) => Table;
  comparerCles: (a: string, b: string) => number;
}
// Les regles de fusion sont celles du build (scripts/langues.mjs) : le test et l'annexe lisent le meme dictionnaire.
const langues = (await import(pathToFileURL(resolve(RACINE, 'scripts/langues.mjs')).href)) as Langues;

const exclus = (JSON.parse(readFileSync(resolve(RACINE, 'tests/fixtures/i18n/exclus.json'), 'utf8')) as { fichiers: string[] }).fichiers;
const extraction = extraireDossier(SRC, exclus);
const tables = langues.lireDictionnaires('en');
const dictionnaire = langues.fusionnerDictionnaires(tables);

/** Les noms des `{valeurs}` d'un texte, tries. */
const valeursDe = (texte: string): string[] => [...new Set([...texte.matchAll(/\{(\w+)\}/g)].map(m => m[1] ?? ''))].sort();

const ou = (c: { fichier: string; ligne: number }): string => c.fichier + ':' + c.ligne;

describe('le dictionnaire anglais', () => {
  it('ne traduit que l anglais, pour l instant', () => {
    expect(langues.LANGUES_TRADUITES).toEqual(['en']);
  });

  it('a ses cles triees dans chaque fichier (node scripts/langues.mjs --trier les range)', () => {
    for (const [nom, table] of Object.entries(tables)) {
      const cles = Object.keys(table);
      expect(cles, 'src/i18n/en/' + nom + ' : clés dans le désordre (node scripts/langues.mjs --trier)').toEqual([...cles].sort(langues.comparerCles));
    }
  });

  it('traduit chaque cle de t() et chaque mot de pluriel()', () => {
    const manquantes = extraction.cles.filter(c => !(c.cle in dictionnaire)).map(c => ou(c) + ' : ' + JSON.stringify(c.cle));
    expect(manquantes, 'clés sans traduction : ajoutez-les au JSON de leur dossier dans src/i18n/en/ (un mot de pluriel va dans util.json)').toEqual([]);
  });

  it('n a aucune cle orpheline : chaque cle est un littéral de src/, ou le pluriel francais d un mot de pluriel()', () => {
    const admises = new Set(extraction.litteraux);
    for (const c of extraction.cles) if (c.origine === 'pluriel') admises.add(auPluriel(c.cle));
    const orphelines = Object.keys(dictionnaire).filter(cle => !admises.has(cle));
    expect(orphelines, 'clés du dictionnaire qu’aucun texte de src/ n’emploie : retirez-les, ou corrigez la clé').toEqual([]);
  });

  it('garde les {valeurs} de chaque cle dans sa traduction', () => {
    const fautives = Object.entries(dictionnaire).filter(([cle, trad]) => valeursDe(cle).join() !== valeursDe(trad).join()).map(([cle, trad]) => JSON.stringify(cle) + ' → ' + JSON.stringify(trad));
    expect(fautives, 'traductions qui perdent ou ajoutent une {valeur}').toEqual([]);
  });

  it('refuse deux traductions d une meme cle', () => {
    expect(() => langues.fusionnerDictionnaires({ 'a.json': { Annuler: 'Cancel' }, 'b.json': { Annuler: 'Undo' } })).toThrow(/« Annuler » a deux traductions/);
    expect(langues.fusionnerDictionnaires({ 'a.json': { Annuler: 'Cancel' }, 'b.json': { Annuler: 'Cancel', Fermer: 'Close' } })).toEqual({ Annuler: 'Cancel', Fermer: 'Close' });
  });
});

describe('le cliquet des textes francais hors t', () => {
  it('ne depasse jamais le plafond de tests/fixtures/i18n/restes.json, qui ne fait que baisser', () => {
    const plafond = (JSON.parse(readFileSync(FICHIER_RESTES, 'utf8')) as { restes: number }).restes;
    const n = extraction.restes.length;
    // ACTUALISER_REFERENCES=1 inscrit le compte du jour, seulement s'il est plus bas : le cliquet ne remonte jamais.
    if (process.env['ACTUALISER_REFERENCES'] === '1' && n < plafond) writeFileSync(FICHIER_RESTES, JSON.stringify({ restes: n }) + '\n');
    const detail = restesParFichier(extraction.restes).slice(0, 8).map(r => '  ' + r.fichier + ' : ' + r.nombre).join('\n');
    expect(n, n + ' textes français hors t() pour un plafond de ' + plafond + '. Enveloppez-les dans t(\'…\') avec leur traduction (npm run i18n:restes liste chaque reste), puis baissez le plafond : ACTUALISER_REFERENCES=1 npx vitest run tests/unit/i18n. Les fichiers les plus chargés :\n' + detail)
      .toBeLessThanOrEqual(plafond);
  });

  it('voit chaque forme de littéral, et ignore commentaires, imports, data-ed-* et regex', () => {
    const texte = [
      "import { t } from '../util/i18n.js'; // « un commentaire accentué »",
      "import { pluriel } from '../util/texte.js';",
      "/* « bloc » */",
      "const a = t('Éditeur SVG');",
      "const b = t('Projet « {nom} » enregistré.', { nom: 'x' });",
      "const c = pluriel(3, 'élément');",
      "const d = pluriel(2, 'cheval', 'chevaux');",
      "const e = 'À traduire';",
      'const f = "déjà";',
      "const g = `gabarit ${a} accentué`;",
      "const h = `sans rien ${a}`;",
      "const i = /[éè]/;",
      "const j = 'data-ed-modèle';",
      "const k = <p data-ed-note=\"été\" title=\"Été\">Texte français ! <b>{a}</b></p>;",
      "const l = <p>plain text</p>;"
    ].join('\n');
    const r = extraireFichier('zones/Essai.tsx', texte);
    expect(r.cles.map(c => [c.cle, c.origine, c.ligne])).toEqual([
      ['Éditeur SVG', 't', 4], ['Projet « {nom} » enregistré.', 't', 5], ['élément', 'pluriel', 6], ['cheval', 'pluriel', 7], ['chevaux', 'pluriel', 7]
    ]);
    expect(r.restes.map(x => [x.ligne, x.texte])).toEqual([[8, 'À traduire'], [9, 'déjà'], [10, 'gabarit … accentué'], [14, 'Été'], [14, 'Texte français !']]);
    expect(r.litteraux.has('x') && r.litteraux.has('plain text') === false).toBe(true);
    expect(r.litteraux.has('../util/i18n.js')).toBe(false);
  });

  it('n exclut que des fichiers qui existent, et seulement des donnees', () => {
    for (const f of exclus) expect(() => readFileSync(resolve(SRC, f)), f).not.toThrow();
    expect(exclus).toEqual([...exclus].sort());
  });
});
