// Les filtres des flux : FlateDecode (par la decompression injectee), ASCIIHex, ASCII85, RunLength, predicteurs PNG et TIFF,
// les refus nommes (LZW, compression d'image, filtre inconnu, bombe de decompression) et le signal FluxEnAttente.

import { describe, it, expect } from 'vitest';
import { deflateSync } from 'node:zlib';
import { decoder, nouveauBudget } from '../../../../src/engine/pdf/filtres.js';
import { FluxEnAttente, LIMITES_PDF, RefusPdf, SyntaxePdf, type Decompression, type ResultatDecompression } from '../../../../src/engine/pdf/limites.js';
import { lirePdf } from '../../../../src/engine/lecturePdf.js';
import { flux, inflerSync, lu, octets, pdfClassique, pdfUnePage, refus } from './fabrique.js';

const texte = (o: Uint8Array) => Buffer.from(o).toString('latin1');
const dec = (brut: string | Uint8Array, filtres: string[], params: Array<Map<string, number> | null> = [], d: Decompression = inflerSync) =>
  decoder(typeof brut === 'string' ? octets(brut) : brut, filtres, params, 1, { decompresser: d, budget: nouveauBudget() });
const rect = '1 0 0 rg 0 0 10 10 re f';

describe('les filtres purs', () => {
  it('ASCIIHex : blancs ignores, fin a « > », chiffre impair complete', () => {
    expect(texte(dec('48 65 6c\n6C 6f 7>', ['ASCIIHexDecode']))).toBe('Hellop');
    expect(() => dec('4G', ['AHx'])).toThrow(SyntaxePdf);
  });

  it('ASCII85 : groupes de cinq, « z » pour quatre zeros, groupe final partiel, fin a « ~> »', () => {
    expect(texte(dec('87cURD]i,"Ebo80~>', ['ASCII85Decode']))).toBe('Hello World!');
    expect([...dec('z~>', ['A85'])]).toEqual([0, 0, 0, 0]);
    expect(() => dec('87cU\x7f', ['A85'])).toThrow(SyntaxePdf);
  });

  it('RunLength : copies et repetitions', () => {
    expect(texte(dec(Uint8Array.from([2, 65, 66, 67, 254, 68, 128]), ['RunLengthDecode']))).toBe('ABCDDD');
  });

  it('enchaine les filtres dans l ordre : ASCII85 puis FlateDecode', () => {
    const z = deflateSync(Buffer.from(rect));
    // ASCII85 ecrit a la main par le test : quatre octets donnent cinq caracteres.
    let a85 = '';
    for (let i = 0; i < z.length; i += 4) {
      const g = [0, 1, 2, 3].map(k => z[i + k] ?? 0), n = i + 4 <= z.length ? 4 : z.length - i;
      let v = ((g[0] ?? 0) * 2 ** 24) + ((g[1] ?? 0) << 16) + ((g[2] ?? 0) << 8) + (g[3] ?? 0), c = '';
      for (let k = 0; k < 5; k++) { c = String.fromCharCode(33 + (v % 85)) + c; v = Math.floor(v / 85); }
      a85 += c.slice(0, n + 1);
    }
    expect(texte(dec(a85 + '~>', ['ASCII85Decode', 'FlateDecode']))).toBe(rect);
  });

  it('predicteur PNG : Sub, Up, Average et Paeth', () => {
    // Deux lignes de trois octets, une couleur : types 1 (Sub) puis 2 (Up), puis 3 et 4.
    const brut = deflateSync(Buffer.from([1, 10, 5, 5, 2, 1, 1, 1, 3, 4, 4, 4, 4, 0, 1, 2]));
    const r = dec(brut, ['FlateDecode'], [new Map([['Predictor', 12], ['Columns', 3]])]);
    expect([...r]).toEqual([10, 15, 20, 11, 16, 21, 9, 16, 22, 9, 17, 24]);
  });

  it('predicteur TIFF 2 sur huit bits', () => {
    const r = dec(deflateSync(Buffer.from([10, 1, 1, 20, 2, 2])), ['FlateDecode'], [new Map([['Predictor', 2], ['Columns', 3]])]);
    expect([...r]).toEqual([10, 11, 12, 20, 22, 24]);
  });
});

describe('les refus nommes', () => {
  it('refuse LZW, une compression d image sur un contenu, un filtre inconnu, un chiffrement par filtre', () => {
    expect(refus(pdfUnePage('', { autres: [] }).subarray(0, 0))).toMatch(/n’est pas un PDF/);
    const avec = (filtre: string) => pdfUnePage('').toString('latin1').replace('<< /Length 0 >>', '<< /Length 0 /Filter /' + filtre + ' >>');
    expect(refus(octets(avec('LZWDecode')))).toBe('Ce PDF emploie la compression LZW, un format ancien que cette page ne lit pas : réenregistrez-le depuis un logiciel récent, puis rouvrez-le.');
    expect(refus(octets(avec('DCTDecode')))).toBe('Ce PDF dessine sa page avec une compression d’image (DCTDecode) : il ne contient pas de tracé lisible ici.');
    expect(refus(octets(avec('Bizarre')))).toBe('Ce PDF emploie un filtre inconnu (« Bizarre ») : il ne se lit pas ici.');
    expect(refus(octets(avec('Crypt')))).toMatch(/chiffré/);
  });

  it('refuse plus de huit filtres enchaines', () => {
    expect(() => dec('', new Array(9).fill('ASCIIHexDecode'))).toThrow(RefusPdf);
  });

  it('refuse une bombe de decompression, bornee a la sortie et non a l entree', () => {
    // 130 Mo de zeros tiennent en 130 Ko compresses : la decompression s'arrete a la borne, sans tout produire.
    const bombe = deflateSync(Buffer.alloc(LIMITES_PDF.decompresses + 1024 * 1024));
    expect(bombe.length).toBeLessThan(200_000);
    const pdf = pdfUnePage('').toString('latin1').replace('<< /Length 0 >>\nstream\n\nendstream', '<< /Length ' + bombe.length + ' /Filter /FlateDecode >>\nstream\n' + bombe.toString('latin1') + '\nendstream');
    expect(refus(octets(pdf))).toBe('Ce PDF se décompresse en plus de 128 Mo : il est trop lourd pour être lu ici (ou c’est une bombe de décompression).');
  });

  it('compte les flux ensemble : deux flux de 70 Mo depassent le budget', () => {
    let appels = 0;
    const factice: Decompression = (_b, max) => { appels++; return 70 * 1024 * 1024 > max ? 'trop' : new Uint8Array(70 * 1024 * 1024); };
    const pdf = pdfUnePage('/A Do /B Do', {
      ressources: '/XObject << /A 5 0 R /B 6 0 R >>',
      autres: [flux('<< /Type /XObject /Subtype /Form /BBox [0 0 1 1] >>', 'x', true), flux('<< /Type /XObject /Subtype /Form /BBox [0 0 1 1] >>', 'y', true)]
    });
    const r = lirePdf(pdf, { decompresser: (b, max, cle) => (b.length < 20 ? factice(b, max, cle) : inflerSync(b, max, cle)) });
    expect('erreur' in r && r.erreur).toMatch(/plus de 128 Mo/);
    expect(appels).toBeGreaterThanOrEqual(2);
  });

  it('dit un flux de contenu compresse illisible comme une partie perdue : le reste de la page se lit', () => {
    const pdf = pdfClassique([
      '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents [4 0 R 5 0 R] >>',
      '<< /Length ' + rect.length + ' /Filter /FlateDecode >>\nstream\n' + rect + '\nendstream',
      flux('<< >>', '0 0 1 rg 50 50 10 10 re f', true)
    ]);
    const r = lu(pdf);
    expect(r.dessin.formes.map(f => f.remplissage)).toEqual(['#0000ff']);
    expect(r.ignores).toEqual(['une partie illisible du contenu de la page']);
    // La structure, elle, ne se devine pas : une table en flux illisible fait reindexer, et faute de mieux refuser.
    expect(refus(octets('%PDF-1.5\n1 0 obj\n<< /Type /XRef /Filter /FlateDecode /Length 3 >>\nstream\nabc\nendstream\nendobj\nstartxref\n9\n%%EOF'))).toMatch(/catalogue de pages est introuvable/);
  });

  it('dit qu un navigateur sans DecompressionStream ne lit pas un PDF compresse', () => {
    const r = lirePdf(pdfUnePage(rect, { compresse: true }), { decompresser: () => 'indisponible' });
    expect('erreur' in r && r.erreur).toBe('Ce navigateur ne sait pas décompresser les flux de ce PDF (DecompressionStream manque) : ouvrez-le dans un navigateur récent.');
  });
});

describe('la decompression differee', () => {
  it('leve FluxEnAttente pour chaque flux manquant, tous ensemble, puis lit avec ce qui a ete decompresse', () => {
    const pdf = pdfUnePage('/A Do ' + rect, {
      compresse: true, ressources: '/XObject << /A 5 0 R >>',
      autres: [flux('<< /Type /XObject /Subtype /Form /BBox [0 0 100 100] >>', '0 0 1 rg 20 20 5 5 re f', true)]
    });
    const cache = new Map<number, ResultatDecompression>();
    const attendre: Decompression = (brut, max, cle) => { const r = cache.get(cle); if (r) return r; throw new FluxEnAttente([{ cle, brut, max }]); };
    let tours = 0, r: ReturnType<typeof lirePdf> | null = null;
    while (!r) {
      tours++;
      try { r = lirePdf(pdf, { decompresser: attendre }); } catch (e) {
        if (!(e instanceof FluxEnAttente)) throw e;
        for (const d of e.demandes) cache.set(d.cle, inflerSync(d.brut, d.max, d.cle));
      }
    }
    // Un seul tour d'attente : le contenu de la page et celui du formulaire sont demandes ensemble.
    expect(tours).toBe(2);
    expect(cache.size).toBe(2);
    expect('erreur' in r ? r.erreur : r.dessin.formes.map(f => f.remplissage)).toEqual(['#0000ff', '#ff0000']);
  });

  it('lit un flux non compresse sans rien demander', () => {
    expect(lirePdf(pdfUnePage(rect), { decompresser: () => { throw new Error('jamais'); } })).toMatchObject({ pages: 1 });
    expect(lu(pdfUnePage(rect, { compresse: true })).dessin.formes.length).toBe(1);
  });
});
