// Le GIF decode sans le navigateur (engine/images/gif.ts, etape 13a) : la premiere image sur l'ecran logique, la transparence,
// l'entrelacement, une table locale, une animation reconnue, un flux hostile borne. Les GIF sont fabriques ici par un encodeur LZW
// minimal (un code d'effacement avant que la table ne grandisse : chaque index s'ecrit tel quel) ; un vrai codeur (ImageMagick)
// est relu par les references du PDF natif.

import { describe, expect, it } from 'vitest';
import { decoderGif } from '../../../../src/engine/images/gif.js';

/** Les index en codes LZW sans compression : la taille des codes ne change jamais. */
function lzw(index: readonly number[], tailleMin: number): number[] {
  const effacer = 1 << tailleMin, taille = tailleMin + 1, codes: number[] = [effacer];
  // Chaque code apres le premier ajoute une entree : on efface avant que la taille des codes ne doive grandir.
  let entrees = 0;
  for (const v of index) {
    codes.push(v);
    if (++entrees >= (1 << taille) - effacer - 2) { codes.push(effacer); entrees = 0; }
  }
  codes.push(effacer + 1);
  const octets: number[] = [];
  let acc = 0, n = 0;
  for (const c of codes) { acc |= c << n; n += taille; while (n >= 8) { octets.push(acc & 255); acc >>= 8; n -= 8; } }
  if (n) octets.push(acc & 255);
  const blocs: number[] = [tailleMin];
  for (let i = 0; i < octets.length; i += 255) { const m = octets.slice(i, i + 255); blocs.push(m.length, ...m); }
  blocs.push(0);
  return blocs;
}

/** Un vrai codeur LZW (la table grandit jusqu'a 12 bits, puis s'efface) : exerce la croissance des codes et le cas KwKwK. */
function lzwVrai(index: readonly number[], tailleMin: number): number[] {
  const effacer = 1 << tailleMin, fin = effacer + 1, codes: [number, number][] = [];
  let table = new Map<string, number>(), suivant = fin + 1, taille = tailleMin + 1;
  const neuve = () => { table = new Map(); for (let i = 0; i < effacer; i++) table.set(String(i), i); suivant = fin + 1; taille = tailleMin + 1; };
  neuve();
  codes.push([effacer, taille]);
  let w = '';
  for (const v of index) {
    const wk = w === '' ? String(v) : w + ',' + v;
    if (table.has(wk)) { w = wk; continue; }
    codes.push([table.get(w) ?? 0, taille]);
    if (suivant < 4096) { table.set(wk, suivant++); if (suivant > 1 << taille && taille < 12) taille++; }
    else { codes.push([effacer, taille]); neuve(); }
    w = String(v);
  }
  if (w !== '') codes.push([table.get(w) ?? 0, taille]);
  codes.push([fin, taille]);
  const octets: number[] = [];
  let acc = 0, n = 0;
  for (const [c, t] of codes) { acc |= c << n; n += t; while (n >= 8) { octets.push(acc & 255); acc >>>= 8; n -= 8; } }
  if (n) octets.push(acc & 255);
  const blocs: number[] = [tailleMin];
  for (let i = 0; i < octets.length; i += 255) { const m = octets.slice(i, i + 255); blocs.push(m.length, ...m); }
  blocs.push(0);
  return blocs;
}

const le = (v: number) => [v & 255, v >> 8];

interface Image { x?: number; y?: number; l: number; h: number; index: number[]; transparent?: number; locale?: number[]; entrelace?: boolean }

function gif(L: number, H: number, globale: number[] | null, images: Image[]): Uint8Array {
  const o: number[] = [...Array.from('GIF89a', c => c.charCodeAt(0)), ...le(L), ...le(H), globale ? 0x80 | 1 : 0, 0, 0];
  if (globale) o.push(...globale);
  for (const im of images) {
    if (im.transparent !== undefined) o.push(0x21, 0xf9, 4, 1, 0, 0, im.transparent, 0);
    o.push(0x2c, ...le(im.x ?? 0), ...le(im.y ?? 0), ...le(im.l), ...le(im.h), (im.locale ? 0x80 | 1 : 0) | (im.entrelace ? 0x40 : 0));
    if (im.locale) o.push(...im.locale);
    o.push(...lzw(im.index, 2));
  }
  o.push(0x3b);
  return Uint8Array.from(o);
}

// Quatre couleurs (table de 2^(1+1) entrees).
const TABLE = [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255];
const couleur = (r: { couleur: Uint8Array }, i: number) => [...r.couleur.subarray(3 * i, 3 * i + 3)];

describe('decoderGif', () => {
  it('rend la premiere image, ses couleurs et sa transparence', () => {
    const index = Array.from({ length: 300 }, (_, i) => i % 4);
    const r = decoderGif(gif(20, 15, TABLE, [{ l: 20, h: 15, index, transparent: 3 }]));
    if (!r) throw new Error('illisible');
    expect([r.l, r.h, r.canaux, r.anime]).toEqual([20, 15, 3, false]);
    expect(couleur(r, 0)).toEqual([255, 0, 0]);
    expect(couleur(r, 2)).toEqual([0, 0, 255]);
    expect(r.alpha?.[3]).toBe(0);
    expect(r.alpha?.[4]).toBe(255);
  });

  it('pose une image plus petite sur l ecran (le reste transparent), entrelacee, avec sa table locale ; dit l animation', () => {
    const lignes = [0, 1, 2, 3, 0, 1, 2];
    // Les lignes arrivent dans l'ordre des passes : 0, 4 ; 2, 6 ; 1, 3, 5.
    const ordre = [0, 4, 2, 6, 1, 3, 5];
    const index = ordre.flatMap(y => Array(5).fill(lignes[y]));
    const locale = [10, 10, 10, 20, 20, 20, 30, 30, 30, 40, 40, 40];
    const r = decoderGif(gif(8, 9, TABLE, [{ x: 2, y: 1, l: 5, h: 7, index, locale, entrelace: true }, { l: 1, h: 1, index: [0] }]));
    if (!r) throw new Error('illisible');
    expect(r.anime).toBe(true);
    expect(r.alpha?.[0]).toBe(0);
    for (let y = 0; y < 7; y++) expect(couleur(r, (y + 1) * 8 + 2), 'ligne ' + y).toEqual(Array(3).fill(10 * ((lignes[y] ?? 0) + 1)));
  });

  it('relit un vrai flux LZW : codes qui grandissent jusqu a 12 bits, table effacee, chaines repetees', () => {
    const L = 160, H = 120;
    let s = 7;
    const index = Array.from({ length: L * H }, (_, i) => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (i % 37 < 20 ? (i >> 5) & 3 : s >>> 30); });
    const o: number[] = [...Array.from('GIF89a', c => c.charCodeAt(0)), ...le(L), ...le(H), 0x81, 0, 0, ...TABLE, 0x2c, 0, 0, 0, 0, ...le(L), ...le(H), 0, ...lzwVrai(index, 2), 0x3b];
    const r = decoderGif(Uint8Array.from(o));
    if (!r) throw new Error('illisible');
    for (let i = 0; i < L * H; i += 97) expect(couleur(r, i), 'pixel ' + i).toEqual(TABLE.slice(3 * (index[i] ?? 0), 3 * (index[i] ?? 0) + 3));
    expect(r.alpha).toBeNull();
  });

  it('borne un flux qui deborde, refuse sans lever ce qui n est pas un GIF', () => {
    const r = decoderGif(gif(2, 2, TABLE, [{ l: 2, h: 2, index: Array(400).fill(1) }]));
    expect(r?.couleur.length).toBe(12);
    expect(decoderGif(Uint8Array.from([1, 2, 3]))).toBeNull();
    expect(decoderGif(gif(2, 2, null, [{ l: 2, h: 2, index: [0, 0, 0, 0] }]))).toBeNull();
    // Des codes au-dela de la table : la lecture s'arrete, les pixels manquants restent transparents.
    const casse = gif(2, 2, TABLE, [{ l: 2, h: 2, index: [0, 0, 0, 0] }]);
    const i = casse.indexOf(0x2c) + 11;
    casse[i + 1] = 0xff; casse[i + 2] = 0xff;
    expect(() => decoderGif(casse)).not.toThrow();
  });
});
