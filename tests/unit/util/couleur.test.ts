import { describe, it, expect } from 'vitest';
import { depuisOklch, ecartPercu, lireHex, simulerVision, superposer, versHex, versOklch } from '../../../src/util/couleur.js';

describe('lireHex / versHex', () => {
  it('lit les formes courte et longue, avec ou sans diese', () => {
    expect(lireHex('#abc')).toEqual({ r: 170, g: 187, b: 204 });
    expect(lireHex('1F3A5F')).toEqual({ r: 31, g: 58, b: 95 });
    expect(versHex({ r: 31, g: 58, b: 95 })).toBe('#1f3a5f');
  });

  it('refuse ce qui n est pas une couleur, sans deviner', () => {
    for (const t of ['', '#ab', '#abcd', 'rouge', '#ggg']) expect(lireHex(t)).toBeNull();
  });
});

describe('OKLCH', () => {
  it('fait l aller-retour sans derive visible', () => {
    for (const hex of ['#1f3a5f', '#e0662f', '#faf7f2', '#000000', '#ffffff']) {
      const rgb = lireHex(hex);
      expect(rgb).not.toBeNull();
      if (rgb) expect(versHex(depuisOklch(versOklch(rgb)))).toBe(hex);
    }
  });

  it('ramene dans le gamut en cedant la saturation, pas la clarte', () => {
    const c = depuisOklch({ l: 0.9, c: 0.4, h: 260 });
    expect(Math.abs(versOklch(c).l - 0.9)).toBeLessThan(0.01);
  });
});

describe('perception', () => {
  it('mesure un ecart nul entre une couleur et elle-meme, et maximal entre noir et blanc', () => {
    const noir = { r: 0, g: 0, b: 0 }, blanc = { r: 255, g: 255, b: 255 };
    expect(ecartPercu(noir, noir)).toBe(0);
    expect(ecartPercu(noir, blanc)).toBeCloseTo(1, 2);
  });

  it('rapproche un rouge et un vert de meme clarte en deuteranopie', () => {
    const rouge = { r: 200, g: 60, b: 50 }, vert = { r: 60, g: 140, b: 60 };
    const d = (c: typeof rouge) => simulerVision(c, 'deuteranopie');
    expect(ecartPercu(d(rouge), d(vert))).toBeLessThan(ecartPercu(rouge, vert) / 2);
  });

  it('superpose en sRGB', () => {
    expect(superposer({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, 0.5)).toEqual({ r: 127.5, g: 127.5, b: 127.5 });
  });
});
