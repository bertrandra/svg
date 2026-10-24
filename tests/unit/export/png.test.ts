import { describe, it, expect } from 'vitest';
import { deflateSync, inflateSync } from 'node:zlib';
import { avecDpiPng, crc32, pointsParMetre } from '../../../src/export/png.js';

// Un lecteur de blocs PNG et un CRC-32 bit a bit, ecrits ici et independants de src/export/png.ts.
function crcLent(octets: Uint8Array): number {
  let c = 0xffffffff;
  for (const o of octets) {
    c ^= o;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

interface Bloc { type: string; donnees: Uint8Array; crc: number; debut: number }

function blocs(png: Uint8Array): Bloc[] {
  const vue = new DataView(png.buffer, png.byteOffset, png.byteLength), out: Bloc[] = [];
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  for (let i = 8; i < png.length;) {
    const n = vue.getUint32(i), type = String.fromCharCode(...png.subarray(i + 4, i + 8));
    out.push({ type, donnees: png.subarray(i + 8, i + 8 + n), crc: vue.getUint32(i + 8 + n), debut: i });
    i += 12 + n;
  }
  return out;
}

/** Un petit PNG valide : 3 x 2 pixels RVBA, un seul IDAT, plus un bloc texte avant lui. */
function petitPng(): Uint8Array {
  const bloc = (type: string, d: Uint8Array) => {
    const out = new Uint8Array(12 + d.length), v = new DataView(out.buffer);
    v.setUint32(0, d.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(d, 8);
    v.setUint32(8 + d.length, crcLent(out.subarray(4, 8 + d.length)));
    return out;
  };
  const ihdr = new Uint8Array(13), v = new DataView(ihdr.buffer);
  v.setUint32(0, 3); v.setUint32(4, 2); ihdr[8] = 8; ihdr[9] = 6;
  const brut = new Uint8Array(2 * (1 + 12));
  for (let y = 0; y < 2; y++) { brut[y * 13] = 0; for (let i = 0; i < 12; i++) brut[y * 13 + 1 + i] = (y * 40 + i * 7) & 255; }
  const parties = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bloc('IHDR', ihdr), bloc('tEXt', new TextEncoder().encode('Comment\0bonjour')), bloc('IDAT', deflateSync(brut)), bloc('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parties.reduce((n, p) => n + p.length, 0));
  let p = 0;
  for (const x of parties) { out.set(x, p); p += x.length; }
  return out;
}

describe('crc32', () => {
  it('vaut la valeur connue de « 123456789 » et le CRC bit a bit', () => {
    const t = new TextEncoder().encode('123456789');
    expect(crc32(t)).toBe(0xcbf43926);
    expect(crc32(t)).toBe(crcLent(t));
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('avecDpiPng', () => {
  it('insere un bloc pHYs juste apres IHDR, avec les points par metre et un CRC juste', () => {
    const src = petitPng(), out = avecDpiPng(src, 300), bl = blocs(out);
    expect(bl.map(b => b.type)).toEqual(['IHDR', 'pHYs', 'tEXt', 'IDAT', 'IEND']);
    const phys = bl[1]!, v = new DataView(phys.donnees.buffer, phys.donnees.byteOffset, 9);
    expect(phys.donnees.length).toBe(9);
    expect(v.getUint32(0)).toBe(11811);
    expect(v.getUint32(4)).toBe(11811);
    expect(phys.donnees[8]).toBe(1);
    // Le CRC est recalcule sur type + donnees, par un algorithme independant, pour CHAQUE bloc.
    for (const b of bl) expect(crcLent(out.subarray(b.debut + 4, b.debut + 8 + b.donnees.length))).toBe(b.crc);
  });

  it('ne touche ni aux autres blocs ni aux pixels', () => {
    const src = petitPng(), out = avecDpiPng(src, 150);
    const avant = blocs(src), apres = blocs(out).filter(b => b.type !== 'pHYs');
    expect(apres.map(b => b.type)).toEqual(avant.map(b => b.type));
    avant.forEach((b, i) => expect([...apres[i]!.donnees]).toEqual([...b.donnees]));
    const idat = (png: Uint8Array) => [...inflateSync(blocs(png).find(b => b.type === 'IDAT')!.donnees)];
    expect(idat(out)).toEqual(idat(src));
    expect(out.length).toBe(src.length + 21);
  });

  it('remplace un pHYs deja present, et ecrit les memes octets deux fois', () => {
    const une = avecDpiPng(petitPng(), 72), deux = avecDpiPng(une, 600);
    expect(blocs(deux).filter(b => b.type === 'pHYs').length).toBe(1);
    expect(new DataView(blocs(deux)[1]!.donnees.buffer, blocs(deux)[1]!.donnees.byteOffset).getUint32(0)).toBe(23622);
    expect([...avecDpiPng(petitPng(), 300)]).toEqual([...avecDpiPng(petitPng(), 300)]);
    expect(pointsParMetre(72)).toBe(2835);
  });

  it('refuse ce qui n\'est pas un PNG, et une resolution absurde', () => {
    expect(() => avecDpiPng(new Uint8Array(50), 300)).toThrow(/PNG/);
    expect(() => avecDpiPng(petitPng(), 0)).toThrow(RangeError);
    expect(() => avecDpiPng(petitPng(), Number.NaN)).toThrow(RangeError);
  });
});
