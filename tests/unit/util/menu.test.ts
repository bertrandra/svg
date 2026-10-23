import { describe, it, expect } from 'vitest';
import { dernier, premier, suivant } from '../../../src/util/menu.js';

describe('suivant', () => {
  it('avance et recule en boucle', () => {
    const d = [false, false, false];
    expect(suivant(d, 0, 1)).toBe(1);
    expect(suivant(d, 2, 1)).toBe(0);
    expect(suivant(d, 0, -1)).toBe(2);
    expect(suivant(d, 1, -1)).toBe(0);
  });

  it('saute les elements desactives, et rend -1 quand tout l est', () => {
    expect(suivant([false, true, true, false], 0, 1)).toBe(3);
    expect(suivant([false, true, true, false], 3, 1)).toBe(0);
    expect(suivant([false, true, true, false], 0, -1)).toBe(3);
    expect(suivant([true, true], 0, 1)).toBe(-1);
    expect(suivant([], -1, 1)).toBe(-1);
  });

  it('part du premier ou du dernier quand rien n a le focus', () => {
    expect(suivant([false, false, false], -1, 1)).toBe(0);
    expect(suivant([false, false, false], -1, -1)).toBe(2);
    expect(premier([true, false, false])).toBe(1);
    expect(dernier([false, false, true])).toBe(1);
    expect(premier([true])).toBe(-1);
    expect(dernier([])).toBe(-1);
  });

  it('reste sur place quand il est le seul element actif', () => {
    expect(suivant([true, false, true], 1, 1)).toBe(1);
    expect(suivant([true, false, true], 1, -1)).toBe(1);
  });
});
