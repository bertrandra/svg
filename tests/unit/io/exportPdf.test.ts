// Le PDF que l'editeur remet (io/exportPdf.ts, etape 13a) : un dessin plat donne les octets d'avant ; un dessin riche, apres la
// decompression de ses PNG par DecompressionStream (celle du navigateur, que Node a aussi), la reference du PDF natif ; une
// decompression qui echoue perd l'image et le dit.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lireDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { phrasePertes, type DessinPlat } from '../../../src/engine/aplatir.js';
import { ecrirePdf } from '../../../src/export/pdf.js';
import { pdfDuDessin } from '../../../src/io/exportPdf.js';

const DOSSIER = resolve(__dirname, '../../fixtures/pdf-natif');
const lire = (svg: string, modele: 'plat' | 'riche'): DessinSvg => {
  const r = lireDessin(svg, { modele });
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};

describe('pdfDuDessin', () => {
  it('un dessin plat : les octets d ecrirePdf, sans rien dire', async () => {
    const d = lire(readFileSync(resolve(__dirname, '../../fixtures/svg/arcs.svg'), 'utf8'), 'plat');
    const r = await pdfDuDessin(d, {});
    expect(Buffer.from(r.octets).equals(Buffer.from(ecrirePdf(d as DessinPlat)))).toBe(true);
    expect(r.pertes).toEqual([]);
  });

  it('un dessin riche : la reference du PDF natif, PNG decompresses par le navigateur', async () => {
    const d = lire(readFileSync(resolve(DOSSIER, 'images.svg'), 'utf8'), 'riche');
    const r = await pdfDuDessin(d, {});
    expect(Buffer.from(r.octets).equals(readFileSync(resolve(DOSSIER, 'images.pdf')))).toBe(true);
    expect(phrasePertes(r.pertes, r.perdus)).toBe('');
  });

  it('une decompression qui echoue : les images a decoder sont perdues, et dites', async () => {
    const d = lire(readFileSync(resolve(DOSSIER, 'images.svg'), 'utf8'), 'riche');
    const r = await pdfDuDessin(d, {}, () => Promise.resolve('indisponible'));
    expect(phrasePertes(r.pertes, r.perdus)).toBe('Perdu dans ce format : 5 images illisibles (elles ne sont pas exportées).');
    const leve = await pdfDuDessin(d, {}, () => Promise.reject(new Error('non')));
    expect(leve.perdus).toEqual(r.perdus);
  });
});
