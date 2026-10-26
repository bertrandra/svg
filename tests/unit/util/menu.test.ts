import { describe, it, expect } from 'vitest';
import { dernier, premier, suivant, voisinVertical, type CaseGrille } from '../../../src/util/menu.js';

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

describe('voisinVertical', () => {
  // Deux rubriques de longueurs inegales en trois colonnes : trois cases, puis un titre, puis deux cases, puis une seule.
  const c = (x: number, y: number, desactive = false): CaseGrille => ({ x: x * 100, y, l: 90, h: 32, desactive });
  const grille = [c(0, 0), c(1, 0), c(2, 0), c(0, 60), c(1, 60), c(2, 100)];

  it('descend a la case la plus proche en largeur de la rangee suivante, meme apres un titre', () => {
    expect(voisinVertical(grille, 0, 1)).toBe(3);
    expect(voisinVertical(grille, 2, 1)).toBe(4);
    expect(voisinVertical(grille, 4, 1)).toBe(5);
  });

  it('remonte de meme, et rend -1 au bord', () => {
    expect(voisinVertical(grille, 5, -1)).toBe(4);
    expect(voisinVertical(grille, 3, -1)).toBe(0);
    expect(voisinVertical(grille, 1, -1)).toBe(-1);
    expect(voisinVertical(grille, 5, 1)).toBe(-1);
    expect(voisinVertical(grille, 9, 1)).toBe(-1);
  });

  it('saute une case desactivee', () => {
    expect(voisinVertical([c(0, 0), c(0, 40, true), c(1, 40)], 0, 1)).toBe(2);
  });
});
