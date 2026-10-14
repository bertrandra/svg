import { describe, it, expect } from 'vitest';
import { historique, avancer, annuler, retablir, clore } from '../../../src/util/historique.js';

describe('historique', () => {
  it('annule et retablit dans l ordre', () => {
    let h = historique(1);
    h = avancer(h, 2); h = avancer(h, 3);
    h = annuler(h); expect(h.present).toBe(2);
    h = annuler(h); expect(h.present).toBe(1);
    h = annuler(h); expect(h.present).toBe(1);
    h = retablir(h); expect(h.present).toBe(2);
    h = avancer(h, 9); expect(h.futur).toEqual([]);
    expect(retablir(h).present).toBe(9);
  });

  it('fond un geste continu en une entree, et le clot', () => {
    let h = historique('a');
    h = avancer(h, 'b', 'glisser'); h = avancer(h, 'c', 'glisser'); h = avancer(h, 'd', 'glisser');
    expect(h.passe).toEqual(['a']);
    expect(annuler(h).present).toBe('a');
    h = clore(h); h = avancer(h, 'e', 'glisser');
    expect(h.passe).toEqual(['a', 'd']);
  });

  it('borne le passe et n empile pas un etat identique', () => {
    let h = historique(0);
    for (let i = 1; i <= 10; i++) h = avancer(h, i, null, 3);
    expect(h.passe).toEqual([7, 8, 9]);
    expect(avancer(h, h.present)).toBe(h);
  });
});
