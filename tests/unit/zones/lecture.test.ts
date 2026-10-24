import { describe, it, expect } from 'vitest';
import { lireDessin } from '../../../src/engine/editionSvg.js';
import { lireDessinMemo } from '../../../src/zones/lecture.js';

const svg = (c: number) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0h${c}v${c}h-${c}z" fill="#c81e28"/></svg>`;

describe('lireDessinMemo', () => {
  it('rend la meme lecture pour le meme texte, sans relire', () => {
    const a = lireDessinMemo(svg(10));
    expect(lireDessinMemo(svg(10))).toBe(a);
  });

  it('relit un texte different, et rend ce que lireDessin rend', () => {
    const a = lireDessinMemo(svg(10)), b = lireDessinMemo(svg(20));
    expect(b).not.toBe(a);
    expect(b).toEqual(lireDessin(svg(20)));
  });

  it('garde aussi une lecture refusee, avec son message', () => {
    const a = lireDessinMemo('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>x</text></svg>');
    expect('erreur' in a).toBe(true);
    expect(lireDessinMemo('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>x</text></svg>')).toBe(a);
  });
});
