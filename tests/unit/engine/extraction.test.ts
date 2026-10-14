import { describe, it, expect } from 'vitest';
import { couleursPixels, couleursSvg, fusionnerProches } from '../../../src/engine/extraction.js';

function image(l: number, h: number, peindre: (x: number, y: number) => [number, number, number, number]): Uint8ClampedArray {
  const p = new Uint8ClampedArray(l * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) { const [r, g, b, a] = peindre(x, y); p.set([r, g, b, a], (y * l + x) * 4); }
  return p;
}

describe('couleursSvg', () => {
  it('compte les remplissages, les traits pour moitie, et ignore none et currentColor', () => {
    const svg = '<svg><rect fill="#E8471C"/><rect fill="#e8471c"/><circle fill="none" stroke="rgb(0, 113, 156)"/><path fill="currentColor"/><g style="fill:#00719C;stroke:none"/></svg>';
    expect(couleursSvg(svg)).toEqual([{ hex: '#e8471c', part: 0.571 }, { hex: '#00719c', part: 0.429 }]);
  });

  it('rend une liste vide sans couleur nommee', () => {
    expect(couleursSvg('<svg><path d="M0 0h1v1z"/></svg>')).toEqual([]);
  });
});

describe('couleursPixels', () => {
  it('trouve les aplats d une image et ignore les pixels transparents', () => {
    const p = image(40, 40, (x, y) => (y < 20 ? [232, 71, 28, 255] : x < 10 ? [0, 113, 156, 255] : [255, 255, 255, 0]));
    const c = couleursPixels(p);
    expect(c.map(k => k.hex)).toEqual(['#e8471c', '#00719c']);
    expect(c[0]?.part).toBeCloseTo(0.8, 2);
    expect(c[1]?.part).toBeCloseTo(0.2, 2);
  });

  it('rend toujours le meme resultat pour la meme image, quel que soit le nombre de boites', () => {
    const p = image(30, 30, (x, y) => [((x * 37) % 256), ((y * 91) % 256), ((x + y) * 13) % 256, 255]);
    expect(couleursPixels(p)).toEqual(couleursPixels(p));
    expect(couleursPixels(p, { max: 4 }).length).toBeLessThanOrEqual(4);
    expect(couleursPixels(new Uint8ClampedArray(16))).toEqual([]);
  });
});

describe('fusionnerProches', () => {
  it('fusionne les teintes voisines et somme leurs parts', () => {
    expect(fusionnerProches([{ hex: '#e8471c', part: 0.5 }, { hex: '#e9481d', part: 0.3 }, { hex: '#00719c', part: 0.2 }]))
      .toEqual([{ hex: '#e8471c', part: 0.8 }, { hex: '#00719c', part: 0.2 }]);
  });
});
