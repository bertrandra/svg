// Le corpus de PDF hostiles (tests/fixtures/hostile-pdf, ADR-0020) : chaque fichier passe par la lecture pure (decompression de
// Node, polices de la page) et par la voie de la page (io/pdf.ts, DecompressionStream) : aucune exception, un temps borne, le refus ou l'ouverture
// attendus, et, quand il s'ouvre, un SVG ecrit qui satisfait les invariants de sortie des SVG (passage.ts). Un fichier sans ligne
// dans index.json, une ligne sans fichier, ou une entree de hostilesPdf.ts qui ne s'y retrouve pas, font echouer le test.
//
//   ACTUALISER_REFERENCES=1 npx vitest run tests/unit/securite/corpus-pdf.test.ts    (reecrit les fichiers et index.json)

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ecrireDessin } from '../../../src/engine/editionSvg.js';
import { ouvrirPdf } from '../../../src/io/pdf.js';
import { lireTexte as lire, remplacantesTest } from '../engine/pdf/fabrique.js';
import { HOSTILES } from './hostilesPdf.js';
import { passer } from './passage.js';

const DOSSIER = resolve(__dirname, '../../fixtures/hostile-pdf');
const ACTUALISER = process.env.ACTUALISER_REFERENCES === '1';
/** Le temps accorde a la lecture d'un PDF hostile : une bombe se decompresse jusqu'a sa borne (128 Mo) avant d'etre refusee. */
const BUDGET_MS = Number(process.env.BUDGET_PDF_MS ?? 6000);

interface Ligne { fichier: string; famille: string; vecteur: string; attendu: 'ouvre' | 'refus' }

if (ACTUALISER) {
  mkdirSync(DOSSIER, { recursive: true });
  for (const h of HOSTILES) writeFileSync(resolve(DOSSIER, h.fichier), h.fabriquer());
  const index = { commentaire: 'Corpus de PDF hostiles (ADR-0020, docs/securite.md) : un fichier par vecteur, fabrique par tests/unit/securite/hostilesPdf.ts. attendu = ouvre (le dessin s ouvre sans le danger) ou refus (refus nomme).', fichiers: HOSTILES.map(({ fichier, famille, vecteur, attendu }) => ({ fichier, famille, vecteur, attendu })) };
  writeFileSync(resolve(DOSSIER, 'index.json'), JSON.stringify(index, null, 2) + '\n');
}

const index = JSON.parse(readFileSync(resolve(DOSSIER, 'index.json'), 'utf8')) as { fichiers: Ligne[] };

describe('le corpus de PDF hostiles', () => {
  it('compte au moins trente fichiers, tous decrits dans index.json, et chacun fabrique par hostilesPdf.ts', () => {
    const sur = readdirSync(DOSSIER).filter(f => f.endsWith('.pdf')).sort();
    expect(sur.length).toBeGreaterThanOrEqual(30);
    expect(index.fichiers.map(f => f.fichier).sort()).toEqual(sur);
    expect(index.fichiers).toEqual(HOSTILES.map(({ fichier, famille, vecteur, attendu }) => ({ fichier, famille, vecteur, attendu })));
    for (const l of index.fichiers) expect(l.fichier, 'un nom de fichier dit son vecteur').toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)+\.pdf$/);
  });

  for (const h of HOSTILES) {
    it(h.fichier + ' : ' + h.vecteur, async () => {
      const o = new Uint8Array(readFileSync(resolve(DOSSIER, h.fichier)));
      const t0 = performance.now();
      const r = lire(o);
      const ms = performance.now() - t0;
      expect(ms, 'temps de lecture').toBeLessThan(BUDGET_MS);
      if (h.attendu === 'refus') {
        expect('erreur' in r ? r.erreur : 'ouvert : ' + JSON.stringify(r.ignores)).toMatch(new RegExp('^' + (h.dit ?? 'C').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      } else {
        if ('erreur' in r) throw new Error('devait s ouvrir ; refus : ' + r.erreur);
        if (h.dit) expect(r.ignores.join(' ; ')).toContain(h.dit);
        // Le SVG que la page en tire satisfait les invariants de tout SVG ecrit (nettoyage, relecture, ecriture stable).
        const p = passer(ecrireDessin(r.dessin, 3));
        expect(p.plantage).toBeNull();
        expect(p.defauts.join('\n')).toBe('');
        expect(p.ouvre).toBe(true);
      }
      // La voie de la page, avec la decompression du navigateur, rend le meme verdict sans jamais lever.
      const page = await ouvrirPdf(o, 1, { remplacantes: async () => remplacantesTest() });
      expect('erreur' in page, 'voie de la page').toBe(h.attendu === 'refus');
      if ('erreur' in r && 'erreur' in page) expect(page.erreur).toBe(r.erreur);
    }, 60_000);
  }
});
