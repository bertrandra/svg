// L'en-tete d'un JPEG pour le PDF (engine/images/jpeg.ts, etape 13a) : dimensions, composantes, codage lisible ou non, marqueur Adobe,
// orientation EXIF en gros et en petit boutiste. Les segments sont fabriques ici ; un vrai JPEG est relu par les references du PDF.

import { describe, expect, it } from 'vitest';
import { lireJpeg } from '../../../../src/engine/images/jpeg.js';

const seg = (m: number, d: number[]) => [0xff, m, (d.length + 2) >> 8, (d.length + 2) & 255, ...d];
const sof = (m: number, precision: number, l: number, h: number, n: number) => seg(m, [precision, h >> 8, h & 255, l >> 8, l & 255, n, ...Array(3 * n).fill(1)]);
const ascii = (t: string) => Array.from(t, c => c.charCodeAt(0));

function exif(orientation: number, petit: boolean): number[] {
  const u16 = (v: number) => (petit ? [v & 255, v >> 8] : [v >> 8, v & 255]);
  const u32 = (v: number) => (petit ? [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24] : [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255]);
  const tiff = [...ascii(petit ? 'II' : 'MM'), ...u16(42), ...u32(8), ...u16(2), ...u16(0x010f), ...u16(2), ...u32(4), ...ascii('abc\0'), ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0, ...u32(0)];
  return seg(0xe1, [...ascii('Exif'), 0, 0, ...tiff]);
}

const jpeg = (...segments: number[][]) => Uint8Array.from([0xff, 0xd8, ...segments.flat(), 0xff, 0xda, 0, 2, 0xff, 0xd9]);

describe('lireJpeg', () => {
  it('lit les dimensions et les composantes d un JPEG de base ou progressif', () => {
    expect(lireJpeg(jpeg(seg(0xe0, ascii('JFIF\0')), sof(0xc0, 8, 640, 480, 3)))).toEqual({ l: 640, h: 480, composantes: 3, lisible: true, adobe: false, orientation: 1 });
    expect(lireJpeg(jpeg(sof(0xc2, 8, 10, 20, 1)))?.composantes).toBe(1);
  });

  it('dit illisible un codage arithmetique, sans perte, ou de douze bits', () => {
    expect(lireJpeg(jpeg(sof(0xc9, 8, 10, 10, 3)))?.lisible).toBe(false);
    expect(lireJpeg(jpeg(sof(0xc3, 8, 10, 10, 3)))?.lisible).toBe(false);
    expect(lireJpeg(jpeg(sof(0xc1, 12, 10, 10, 3)))?.lisible).toBe(false);
  });

  it('voit le marqueur Adobe d un CMJN et l orientation EXIF', () => {
    const r = lireJpeg(jpeg(seg(0xee, [...ascii('Adobe'), 0, 100, 0, 0, 0, 0, 2]), sof(0xc0, 8, 16, 10, 4)));
    expect([r?.adobe, r?.composantes]).toEqual([true, 4]);
    for (const petit of [false, true]) for (const o of [1, 3, 6, 8]) expect(lireJpeg(jpeg(exif(o, petit), sof(0xc0, 8, 4, 4, 3)))?.orientation).toBe(o);
    expect(lireJpeg(jpeg(exif(9, false), sof(0xc0, 8, 4, 4, 3)))?.orientation).toBe(1);
  });

  it('refuse sans lever ce qui ne mene a aucune trame', () => {
    expect(lireJpeg(Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBeNull();
    expect(lireJpeg(Uint8Array.from([1, 2, 3]))).toBeNull();
    expect(lireJpeg(jpeg(sof(0xc0, 8, 0, 10, 3)))).toBeNull();
    expect(lireJpeg(jpeg(sof(0xc0, 8, 10, 10, 2)))).toBeNull();
    expect(lireJpeg(Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0, 0]))).toBeNull();
  });
});
