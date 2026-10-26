// Le PNG lu sans le navigateur (engine/images/png.ts, etape 13a) : chaque type de couleur et chaque profondeur, les cinq filtres,
// l'entrelacement Adam7, la transparence par cle et par palette. Les PNG sont fabriques ici, a partir d'echantillons connus (un
// encodeur plus simple que le decodeur : filtrer est une soustraction), compresses par le zlib de Node.

import { describe, expect, it } from 'vitest';
import { deflateSync, inflateSync } from 'node:zlib';
import { crc32 } from '../../../../src/export/png.js';
import { decoderPng, fluxTelQuel, lirePng, tailleDecompressee } from '../../../../src/engine/images/png.js';

const CANAUX: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function bloc(type: string, d: Uint8Array): Buffer {
  const t = Buffer.from(type, 'latin1'), l = Buffer.alloc(4), c = Buffer.alloc(4);
  l.writeUInt32BE(d.length);
  c.writeUInt32BE(crc32(Buffer.concat([t, Buffer.from(d)])));
  return Buffer.concat([l, t, Buffer.from(d), c]);
}

/** Une ligne d'echantillons emballee a la profondeur donnee. */
function emballer(ech: readonly number[], prof: number): Uint8Array {
  if (prof === 16) return Uint8Array.from(ech.flatMap(v => [v >> 8, v & 255]));
  if (prof === 8) return Uint8Array.from(ech);
  const out = new Uint8Array(Math.ceil((ech.length * prof) / 8));
  ech.forEach((v, i) => { const bit = i * prof; out[bit >> 3] = (out[bit >> 3] ?? 0) | (v << (8 - prof - (bit & 7))); });
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Des lignes emballees, filtrees (le filtre change a chaque ligne), mises bout a bout. */
function filtrer(lignes: readonly Uint8Array[], bpp: number, premier: number): Uint8Array {
  const out: number[] = [];
  let prec: Uint8Array = new Uint8Array(lignes[0]?.length ?? 0);
  lignes.forEach((r, y) => {
    const f = (y + premier) % 5;
    out.push(f);
    for (let i = 0; i < r.length; i++) {
      const a = i >= bpp ? (r[i - bpp] ?? 0) : 0, b = prec[i] ?? 0, c = i >= bpp ? (prec[i - bpp] ?? 0) : 0;
      const p = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
      out.push(((r[i] ?? 0) - p) & 255);
    }
    prec = r;
  });
  return Uint8Array.from(out);
}

const ADAM7 = [[0, 8, 0, 8], [4, 8, 0, 8], [0, 4, 4, 8], [2, 4, 0, 4], [0, 2, 2, 4], [1, 2, 0, 2], [0, 1, 1, 2]] as const;

/** Un PNG de pixels donnes (`px(x, y)` rend les echantillons d'un pixel). */
function fabriquer(l: number, h: number, type: number, prof: number, px: (x: number, y: number) => number[], extra: { plte?: number[]; trns?: number[]; entrelace?: boolean } = {}): Uint8Array {
  const bpp = Math.max(1, Math.ceil(((CANAUX[type] ?? 1) * prof) / 8));
  const passes = extra.entrelace ? ADAM7.map(([x0, dx, y0, dy]) => ({ x0, dx, y0, dy })) : [{ x0: 0, dx: 1, y0: 0, dy: 1 }];
  const morceaux: Uint8Array[] = [];
  passes.forEach((q, k) => {
    const lignes: Uint8Array[] = [];
    for (let y = q.y0; y < h; y += q.dy) {
      const ech: number[] = [];
      for (let x = q.x0; x < l; x += q.dx) ech.push(...px(x, y));
      if (ech.length) lignes.push(emballer(ech, prof));
    }
    if (lignes.length) morceaux.push(filtrer(lignes, bpp, k));
  });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(l, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = prof; ihdr[9] = type; ihdr[12] = extra.entrelace ? 1 : 0;
  const brut = Buffer.concat(morceaux.map(m => Buffer.from(m)));
  const z = deflateSync(brut);
  // Deux IDAT : le lecteur les met bout a bout.
  return Uint8Array.from(Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bloc('IHDR', ihdr),
    ...(extra.plte ? [bloc('PLTE', Uint8Array.from(extra.plte))] : []), ...(extra.trns ? [bloc('tRNS', Uint8Array.from(extra.trns))] : []),
    bloc('IDAT', z.subarray(0, 5)), bloc('tEXt', Buffer.from('a\0b')), bloc('IDAT', z.subarray(5)), bloc('IEND', new Uint8Array())
  ]));
}

function decoder(o: Uint8Array) {
  const p = lirePng(o);
  if (!p) throw new Error('illisible');
  const brut = new Uint8Array(inflateSync(p.idat));
  expect(brut.length).toBe(tailleDecompressee(p));
  const r = decoderPng(p, brut);
  if (!r) throw new Error('non decode');
  return { p, r };
}

const L = 13, H = 9;

describe('lirePng et decoderPng', () => {
  for (const prof of [1, 2, 4, 8, 16]) {
    for (const entrelace of [false, true]) {
      it('gris ' + prof + ' bits' + (entrelace ? ', entrelace' : ''), () => {
        const max = 2 ** prof - 1, v = (x: number, y: number) => (x * 7 + y * 3) % (max + 1);
        const { p, r } = decoder(fabriquer(L, H, 0, prof, (x, y) => [v(x, y)], { entrelace }));
        expect(fluxTelQuel(p)).toBe(!entrelace && prof <= 8);
        expect(r.canaux).toBe(1);
        expect(r.alpha).toBeNull();
        for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) expect(r.couleur[y * L + x], x + ',' + y).toBe(prof === 16 ? Math.round(v(x, y) / 257) : Math.round((v(x, y) * 255) / max));
      });
    }
  }

  for (const prof of [8, 16]) {
    it('RVB et RVBA ' + prof + ' bits, entrelaces ou non', () => {
      const m = prof === 16 ? 65535 : 255, c = (x: number, y: number) => [(x * 4099) % (m + 1), (y * 6007) % (m + 1), ((x + y) * 113) % (m + 1)];
      const huit = (v: number) => (prof === 16 ? Math.round(v / 257) : v);
      for (const entrelace of [false, true]) {
        const rvb = decoder(fabriquer(L, H, 2, prof, c, { entrelace })).r;
        const rvba = decoder(fabriquer(L, H, 6, prof, (x, y) => [...c(x, y), (x * 31) % (m + 1)], { entrelace })).r;
        for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
          const i = y * L + x, e = c(x, y).map(huit);
          expect([...rvb.couleur.subarray(3 * i, 3 * i + 3)]).toEqual(e);
          expect([...rvba.couleur.subarray(3 * i, 3 * i + 3)]).toEqual(e);
          expect(rvba.alpha?.[i]).toBe(huit((x * 31) % (m + 1)));
        }
        expect(rvb.alpha).toBeNull();
      }
    });
  }

  it('gris et alpha', () => {
    const { r } = decoder(fabriquer(L, H, 4, 8, (x, y) => [x * 10, y * 20]));
    expect(r.canaux).toBe(1);
    expect(r.couleur[2 * L + 3]).toBe(30);
    expect(r.alpha?.[2 * L + 3]).toBe(40);
  });

  it('palette 1, 2, 4 et 8 bits, avec ou sans alphas de palette', () => {
    const plte = [10, 20, 30, 200, 100, 50, 0, 255, 0, 90, 90, 90];
    for (const prof of [1, 2, 4, 8]) {
      const n = Math.min(4, 2 ** prof), idx = (x: number, y: number) => (x + 2 * y) % n;
      const sans = decoder(fabriquer(L, H, 3, prof, (x, y) => [idx(x, y)], { plte }));
      expect(fluxTelQuel(sans.p)).toBe(true);
      expect(sans.r.alpha).toBeNull();
      const avec = decoder(fabriquer(L, H, 3, prof, (x, y) => [idx(x, y)], { plte, trns: [255, 0, 128] }));
      expect(fluxTelQuel(avec.p)).toBe(false);
      for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
        const i = y * L + x, k = idx(x, y);
        expect([...sans.r.couleur.subarray(3 * i, 3 * i + 3)]).toEqual(plte.slice(3 * k, 3 * k + 3));
        expect(avec.r.alpha?.[i]).toBe([255, 0, 128, 255][k]);
      }
    }
  });

  it('couleur cle en gris et en RVB, sur la valeur brute (seize bits compris)', () => {
    const g = decoder(fabriquer(4, 2, 0, 16, x => [x * 1000], { trns: [0x07, 0xd0] })).r;
    expect([...(g.alpha ?? [])]).toEqual([255, 255, 0, 255, 255, 255, 0, 255]);
    const c = decoder(fabriquer(3, 1, 2, 8, x => (x === 1 ? [255, 0, 255] : [1, 2, 3]), { trns: [0, 255, 0, 0, 0, 255] })).r;
    expect([...(c.alpha ?? [])]).toEqual([255, 0, 255]);
    // Une couleur cle qui n'apparait pas : pas d'alpha du tout.
    expect(decoder(fabriquer(3, 1, 2, 8, () => [1, 2, 3], { trns: [0, 9, 0, 9, 0, 9] })).r.alpha).toBeNull();
  });

  it('refuse sans lever : signature, en-tete hors norme, palette absente, donnees courtes, filtre inconnu', () => {
    const bon = fabriquer(4, 4, 2, 8, () => [1, 2, 3]);
    expect(lirePng(bon.subarray(1))).toBeNull();
    const ihdr = (prof: number, type: number) => { const o = bon.slice(); o[24] = prof; o[25] = type; return o; };
    expect(lirePng(ihdr(4, 2))).toBeNull();
    expect(lirePng(ihdr(8, 3))).toBeNull();
    expect(lirePng(ihdr(8, 5))).toBeNull();
    const p = lirePng(bon);
    if (!p) throw new Error('illisible');
    const brut = new Uint8Array(inflateSync(p.idat));
    expect(decoderPng(p, brut.subarray(0, brut.length - 1))).toBeNull();
    const faux = brut.slice();
    faux[0] = 9;
    expect(decoderPng(p, faux)).toBeNull();
  });
});
