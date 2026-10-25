// Fuzzing deterministe de la lecture des PDF (ADR-0020, docs/securite.md) : les fixtures et le corpus hostile, mutes octet par
// octet et jeton par jeton, et des pages engendrees par grammaire (operateurs de contenu tires au hasard, sains et hostiles). Pour
// chaque entree : aucune exception, aucune lecture plus longue que le budget, et, quand la page s'ouvre, un SVG ecrit qui satisfait
// tous les invariants de sortie (passage.ts : nettoyage, relecture, ecriture stable).
//
//   FUZZ_PDF_ITERATIONS=20000 npx vitest run tests/unit/securite/fuzz-pdf.test.ts     (exploration longue)
//   FUZZ_GRAINES=7,8,9 …                                                              (d'autres graines)

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ecrireDessin } from '../../../src/engine/editionSvg.js';
import { flux, lireTexte as lire, octets, pdfUnePage } from '../engine/pdf/fabrique.js';
import { aleatoire, type Alea } from './mutateur.js';
import { passer } from './passage.js';

const ITERATIONS = Number(process.env.FUZZ_PDF_ITERATIONS ?? 4000);
const GRAINES = (process.env.FUZZ_GRAINES ?? '1,2').split(',').map(Number);
const BUDGET_MS = Number(process.env.BUDGET_MS ?? 1500);

const entier = (r: Alea, n: number): number => Math.floor(r() * n);
const choisir = <T>(r: Alea, t: readonly T[]): T => t[entier(r, t.length)] as T;

/** Les morceaux de PDF qui font mal : structure, filtres, renvois, operateurs. */
const JETONS: readonly string[] = [
  'obj', 'endobj', 'stream', 'endstream', '<<', '>>', '[', ']', '(', ')', '<', '>', '{', '}', '/', '%', ' R ', '0 0 R', '1 0 R', '9999999 0 R',
  '/Filter /FlateDecode', '/Filter /LZWDecode', '/Filter [/ASCII85Decode /FlateDecode]', '/DecodeParms << /Predictor 12 /Columns 4 >>', '/Length 0', '/Length 999999999',
  '/Type /ObjStm /N 99999 /First 0', '/Type /XRef /W [1 2 1]', '/Prev 0', '/XRefStm 0', '/Encrypt 1 0 R', '/Kids [2 0 R]', '/Parent 2 0 R', '/Rotate 90', '/MediaBox [0 0 0 0]',
  '/CropBox [-1e9 0 1e9 1]', 'xref', 'trailer', 'startxref', '%%EOF', '%PDF-1.7', 'q', 'Q', 'cm', 're', 'm', 'l', 'c', 'v', 'y', 'h', 'f', 'f*', 'S', 'B', 'n', 'W', 'W*',
  'BT', 'ET', 'Tj', 'TJ', 'Do', 'BI', 'ID', 'EI', 'sh', 'gs', 'cs', 'scn', 'BDC', 'EMC', '/OC', '\x00', '\xff', '\r\n', '9'.repeat(40), '-', '.', '1e308', '--1'
];

const OPERATEURS: readonly string[] = [
  '{n} {n} m', '{n} {n} l', '{n} {n} {n} {n} {n} {n} c', '{n} {n} {n} {n} v', '{n} {n} {n} {n} y', 'h', '{n} {n} {n} {n} re', 'f', 'F', 'f*', 'S', 's', 'B', 'B*', 'b', 'b*', 'n', 'W n', 'W* n',
  'q', 'Q', '{n} {n} {n} {n} {n} {n} cm', '{n} w', '{e} J', '{e} j', '{n} M', '[{n} {n}] {n} d', '{c} g', '{c} G', '{c} {c} {c} rg', '{c} {c} {c} RG', '{c} {c} {c} {c} k', '{c} {c} {c} {c} K',
  '/DeviceRGB cs', '/P cs /D scn', '/S cs {c} sc', '/I cs {e} sc', '/L cs {n} {n} {n} sc', '/A gs', '/F Do', '/Im Do', '/Sh sh', 'BT (a) Tj ET', 'BT [(a) 3 (b)] TJ ET', '/OC /MC0 BDC', 'EMC', 'BMC',
  'BI /W 1 /H 1 /CS /G /BPC 8 ID x EI', 'BX inconnu EX', 'd0', '1 2 3', '(chaine', '<<', '[', ']',
  'BT', 'ET', '/H {n} Tf', '/T3 {n} Tf', '/C {n} Tf', '{n} {n} Td', '{n} {n} TD', 'T*', '{n} {n} {n} {n} {n} {n} Tm', '(Abc) Tj', '[(A) {n} (b)] TJ', '<00410042> Tj', '(x) \'', '{n} {n} (y) "',
  '{n} Tc', '{n} Tw', '{n} Tz', '{n} TL', '{e} Tr', '{n} Ts'
];
const NOMBRES: readonly string[] = ['0', '1', '-1', '10', '50', '0.5', '1000000', '-999999', '1e5', '.', '-', '9'.repeat(30), '0.000001', '360'];

const RESSOURCES = '/ExtGState << /A << /ca 0.5 /CA 0.2 /SMask /None /BM /Multiply /D [[2 1] 0] >> >> /XObject << /F 5 0 R /Im 6 0 R >> '
  + '/Pattern << /D << /PatternType 2 /Shading << /ShadingType 2 /ColorSpace /DeviceRGB /Function << /FunctionType 2 /C0 [1 0 0] /C1 [0 0 1] /N 1 >> >> >> >> '
  + '/ColorSpace << /S [/Separation /X /DeviceCMYK << /FunctionType 2 /C0 [0 0 0 0] /C1 [0 1 1 0] /N 1 >>] /I [/Indexed /DeviceRGB 1 <ff000000ff00>] /L [/Lab << /WhitePoint [0.95 1 1.09] >>] >> '
  + '/Shading << /Sh << /ShadingType 2 /ColorSpace /DeviceGray /Function << /FunctionType 2 /C0 [0] /C1 [1] /N 1 >> >> >> /Properties << /MC0 << /Type /OCG >> >> '
  + '/Font << /H << /Subtype /Type1 /BaseFont /Helvetica-BoldOblique >> /C << /Subtype /Type0 /BaseFont /X /Encoding /Identity-H /DescendantFonts [<< /Subtype /CIDFontType2 /W [65 [600 700]] >>] >> '
  + '/T3 << /Subtype /Type3 /FontMatrix [0.001 0 0 0.001 0 0] /FirstChar 65 /LastChar 66 /Widths [800 900] /Encoding << /Differences [65 /a /b] >> /CharProcs << /a << >> >> >> >>';

/** Une page engendree : des operateurs tires au hasard, avec des ressources qui leur repondent (formulaire, image, motif…). */
function engendrer(r: Alea): Buffer {
  const ops: string[] = [];
  for (let k = 5 + entier(r, 120); k > 0; k--) {
    ops.push(choisir(r, OPERATEURS).replace(/\{n\}/g, () => choisir(r, NOMBRES)).replace(/\{c\}/g, () => String(Math.round(r() * 100) / 100)).replace(/\{e\}/g, () => String(entier(r, 4))));
  }
  const formulaire = flux('<< /Type /XObject /Subtype /Form /BBox [0 0 50 50] /Matrix [1 0 0 1 10 10] >>', '0 0 1 rg 0 0 20 20 re f', r() < 0.5);
  const image = flux('<< /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 >>', 'x');
  return pdfUnePage(ops.join('\n'), { ressources: RESSOURCES, compresse: r() < 0.5, autres: [formulaire, image] });
}

/** Une mutation d'octets de `o`, choisie et placee par `r`. */
function muter(o: Buffer, r: Alea): Buffer {
  if (!o.length) return octets(choisir(r, JETONS));
  const i = entier(r, o.length), j = Math.min(o.length, i + 1 + entier(r, 200));
  switch (entier(r, 8)) {
    case 0: { const c = Buffer.from(o); c[i] = entier(r, 256); return c; }
    case 1: return Buffer.concat([o.subarray(0, i), octets(' ' + choisir(r, JETONS) + ' '), o.subarray(i)]);
    case 2: return Buffer.concat([o.subarray(0, i), octets(choisir(r, JETONS)), o.subarray(j)]);
    case 3: return Buffer.concat([o.subarray(0, i), o.subarray(j)]);
    case 4: return Buffer.concat([o.subarray(0, j), ...new Array<Buffer>(1 + entier(r, 30)).fill(o.subarray(i, j)), o.subarray(j)]);
    case 5: return o.subarray(0, i);
    case 6: return Buffer.from(o.toString('latin1').replace(/-?\d+(?:\.\d+)?/g, m => (r() < 0.15 ? choisir(r, NOMBRES) : m)), 'latin1');
    default: return Buffer.concat([o.subarray(0, i), o.subarray(entier(r, o.length), entier(r, o.length) + 1 + entier(r, 80)), o.subarray(i)]);
  }
}

/** Le verdict d'une entree : une phrase qui dit ce qui ne va pas, ou null. */
function verdict(o: Uint8Array): string | null {
  const t0 = performance.now();
  let lu: ReturnType<typeof lire>;
  try { lu = lire(o); } catch (e) { return 'exception : ' + (e instanceof Error ? e.name + ' ' + e.message : String(e)).slice(0, 200); }
  const ms = performance.now() - t0;
  if (ms > BUDGET_MS) {
    // Le budget vise un calcul pathologique (quadratique, non borne), qui reste lent a chaque passage ; une machine chargee
    // (d'autres suites en parallele) peut ralentir une seule mesure. On remesure donc une fois : seule une lenteur qui se
    // repete est un defaut.
    const t1 = performance.now();
    lire(o);
    const encore = performance.now() - t1;
    if (encore > BUDGET_MS) return 'temps : ' + Math.round(ms) + ' ms puis ' + Math.round(encore) + ' ms';
  }
  if ('erreur' in lu) return typeof lu.erreur === 'string' && lu.erreur.length > 10 ? null : 'refus sans phrase';
  const p = passer(ecrireDessin(lu.dessin, 3), BUDGET_MS, true);
  if (p.plantage) return 'ecriture : ' + p.plantage;
  return p.defauts[0] ?? (p.ouvre ? null : 'le SVG ecrit ne se relit pas : ' + p.refus.join(' | '));
}

/** Les fixtures et le corpus hostile, sans les bombes : elles eprouvent la borne de decompression, pas la lecture, et la font atteindre a chaque mutation. */
function graines(): Buffer[] {
  const lireTout = (dossier: string) => readdirSync(dossier).filter(n => n.endsWith('.pdf') && !n.startsWith('bombe-')).sort().map(n => readFileSync(resolve(dossier, n))).filter(o => o.length < 60_000);
  return [...lireTout(resolve(__dirname, '../../fixtures/pdf')), ...lireTout(resolve(__dirname, '../../fixtures/hostile-pdf'))];
}

describe('le fuzzing deterministe des PDF', () => {
  const depart = graines();

  it('dispose d un corpus de depart varie (fixtures et hostiles)', () => {
    expect(depart.length).toBeGreaterThan(30);
  });

  for (const graine of GRAINES) {
    it(`graine ${graine} : ${Math.round(ITERATIONS / GRAINES.length)} PDF mutes ou engendres ne cassent aucun invariant`, () => {
      const r = aleatoire(graine);
      const n = Math.round(ITERATIONS / GRAINES.length);
      let ouverts = 0;
      for (let rang = 0; rang < n; rang++) {
        let o = r() < 0.3 ? engendrer(r) : choisir(r, depart);
        for (let k = r() < 0.3 && rang % 3 === 0 ? 0 : 1 + entier(r, 3); k > 0; k--) o = muter(o, r);
        const raison = verdict(o);
        if (raison !== null) throw new Error(`graine ${graine}, rang ${rang} : ${raison}\nentree (${o.length} octets) : ${o.toString('latin1').slice(0, 400)}`);
        if (!('erreur' in lire(o))) ouverts++;
      }
      // Un fuzzer qui ne fait que des refus n'explore pas l'interprete : une bonne part des entrees doit s'ouvrir.
      expect(ouverts / n).toBeGreaterThan(0.2);
    }, 600_000);
  }
});
