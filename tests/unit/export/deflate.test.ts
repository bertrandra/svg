// La compression zlib ecrite a la main (export/deflate.ts) : relue par le zlib de Node sur des donnees vides, uniformes, bruitees,
// repetitives ; deterministe ; jamais beaucoup plus grosse que l'entree.

import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import { deflateZlib } from '../../../src/export/deflate.js';

/** Un tirage reproductible (congruence lineaire). */
function bruit(n: number, graine: number): Uint8Array {
  const o = new Uint8Array(n);
  let s = graine >>> 0;
  for (let i = 0; i < n; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; o[i] = s >>> 24; }
  return o;
}

const CAS: Readonly<Record<string, Uint8Array>> = {
  vide: new Uint8Array(0),
  'un octet': new Uint8Array([200]),
  uniforme: new Uint8Array(100_000).fill(7),
  bruit: bruit(200_000, 1),
  motif: Uint8Array.from({ length: 300_000 }, (_, i) => ((i * 7) % 251) ^ ((i >> 10) & 3)),
  'longues distances': (() => { const a = bruit(40_000, 3); const o = new Uint8Array(120_000); o.set(a, 0); o.set(a, 40_000); o.set(a.subarray(0, 20_000), 100_000); return o; })(),
  alpha: Uint8Array.from({ length: 256 * 256 }, (_, i) => (((i % 256) - 128) ** 2 + ((i >> 8) - 128) ** 2 < 90 ** 2 ? 255 : 0))
};

describe('deflateZlib', () => {
  for (const [nom, donnees] of Object.entries(CAS)) {
    it('se relit par zlib : ' + nom, () => {
      const z = deflateZlib(donnees);
      expect(z[0]).toBe(0x78);
      expect(((z[0] ?? 0) * 256 + (z[1] ?? 0)) % 31).toBe(0);
      expect(Buffer.from(inflateSync(z)).equals(Buffer.from(donnees))).toBe(true);
      // Stockee au pire : quelques octets par bloc de 64 Kio.
      expect(z.length).toBeLessThanOrEqual(donnees.length + 6 + 5 * Math.ceil(donnees.length / 65535 + 1));
    });
  }

  it('compresse ce qui se repete, et rend toujours les memes octets', () => {
    expect(deflateZlib(CAS.uniforme ?? new Uint8Array()).length).toBeLessThan(2_000);
    expect(deflateZlib(CAS.alpha ?? new Uint8Array()).length).toBeLessThan(4_000);
    const a = deflateZlib(CAS.motif ?? new Uint8Array()), b = deflateZlib(CAS.motif ?? new Uint8Array());
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});
