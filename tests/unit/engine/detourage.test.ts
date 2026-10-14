import { describe, it, expect } from 'vitest';
import { couleurDuBord, detourer } from '../../../src/engine/detourage.js';

function image(l: number, h: number, peindre: (x: number, y: number) => [number, number, number, number]): Uint8ClampedArray {
  const p = new Uint8ClampedArray(l * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) { const [r, g, b, a] = peindre(x, y); p.set([r, g, b, a], (y * l + x) * 4); }
  return p;
}
const alpha = (p: Uint8ClampedArray, l: number, x: number, y: number) => p[(y * l + x) * 4 + 3];

describe('detourer', () => {
  it('retire le fond relie au bord et garde l interieur ferme d une forme', () => {
    // Un anneau rouge sur fond blanc : le blanc du centre n'est pas relie au bord, il reste.
    const p = image(21, 21, (x, y) => { const d = Math.hypot(x - 10, y - 10); return d >= 4 && d <= 8 ? [232, 71, 28, 255] : [255, 255, 255, 255]; });
    const r = detourer(p, 21, 21);
    expect(r.fond).toBe('#ffffff');
    expect(alpha(p, 21, 0, 0)).toBe(0);
    expect(alpha(p, 21, 10, 10)).toBe(255);
    expect(alpha(p, 21, 10, 4)).toBe(255);
    expect(r.retires).toBeGreaterThan(200);
    expect(r.part).toBeCloseTo(r.retires / 441, 3);
  });

  it('tolere un fond legerement bruite, et ne touche pas une image deja transparente', () => {
    const p = image(10, 10, (x, y) => (x === 5 && y === 5 ? [0, 0, 0, 255] : [250 + ((x + y) % 3), 250, 250, 255]));
    expect(detourer(p, 10, 10).retires).toBe(99);
    const t = image(10, 10, () => [0, 0, 0, 0]);
    expect(detourer(t, 10, 10).retires).toBe(0);
  });

  it('prend pour fond la couleur la plus frequente du pourtour', () => {
    const p = image(10, 10, (_, y) => (y === 0 ? [0, 113, 156, 255] : [232, 71, 28, 255]));
    expect(couleurDuBord(p, 10, 10)).toEqual({ r: 232, g: 71, b: 28 });
  });
});
