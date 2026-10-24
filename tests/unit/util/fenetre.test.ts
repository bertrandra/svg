import { describe, it, expect } from 'vitest';
import { defilementPour, fenetre, MARGE_FENETRE, SEUIL_FENETRE } from '../../../src/util/fenetre.js';

describe('fenetre', () => {
  it('dessine toute une liste courte, sans marge ni espace', () => {
    expect(fenetre(SEUIL_FENETRE, 27, 500, 300)).toEqual({ debut: 0, fin: SEUIL_FENETRE, haut: 0, bas: 0, hauteur: 0 });
    expect(fenetre(0, 27, 0, 300)).toEqual({ debut: 0, fin: 0, haut: 0, bas: 0, hauteur: 0 });
  });

  it('dessine toute la liste quand le pas est inconnu', () => {
    expect(fenetre(5000, 0, 0, 300)).toEqual({ debut: 0, fin: 5000, haut: 0, bas: 0, hauteur: 0 });
    expect(fenetre(5000, Number.NaN, 0, 300)).toEqual({ debut: 0, fin: 5000, haut: 0, bas: 0, hauteur: 0 });
  });

  it('au debut de la liste : les lignes visibles et la marge, le reste en espace', () => {
    const f = fenetre(5000, 27, 0, 270);
    expect(f.debut).toBe(0);
    expect(f.fin).toBe(10 + MARGE_FENETRE);
    expect(f.haut).toBe(0);
    expect(f.bas).toBe((5000 - f.fin) * 27);
  });

  it('au milieu : une marge de chaque cote de ce qu on voit', () => {
    const f = fenetre(5000, 27, 27 * 1000, 270);
    expect(f.debut).toBe(1000 - MARGE_FENETRE);
    expect(f.fin).toBe(1010 + MARGE_FENETRE);
    expect(f.haut).toBe(f.debut * 27);
  });

  it('la hauteur totale est toujours celle de la liste entiere', () => {
    for (const defile of [0, 1, 26, 27, 13_500, 134_000, 200_000]) {
      const f = fenetre(5000, 27, defile, 500);
      expect(f.haut + (f.fin - f.debut) * 27 + f.bas).toBe(5000 * 27);
    }
  });

  it('donne la hauteur de la liste entiere, a poser en hauteur minimale', () => {
    expect(fenetre(5000, 24.390625, 0, 500).hauteur).toBe(121953);
    expect(fenetre(5000, 27, 27 * 3000, 500).hauteur).toBe(5000 * 27);
  });

  it('a la fin de la liste : la fenetre ne depasse pas le total', () => {
    const f = fenetre(5000, 27, 5000 * 27, 500);
    expect(f.fin).toBe(5000);
    expect(f.bas).toBe(0);
    expect(f.debut).toBeLessThan(5000);
  });

  it('un defilement negatif ou une zone vide ne cassent rien', () => {
    expect(fenetre(5000, 27, -300, 270).debut).toBe(0);
    const f = fenetre(5000, 27, 27 * 100, 0);
    expect(f.fin).toBeGreaterThanOrEqual(f.debut);
  });
});

describe('defilementPour', () => {
  it('ne bouge pas quand la ligne est entierement visible', () => {
    expect(defilementPour(10, 27, 270, 300)).toBe(0);
    expect(defilementPour(10, 27, 0, 300)).toBe(0);
  });

  it('remonte jusqu a une ligne au-dessus', () => {
    expect(defilementPour(5, 27, 270, 300)).toBe(5 * 27 - 270);
  });

  it('descend jusqu a une ligne en dessous, l espace entre lignes n etant pas compte', () => {
    expect(defilementPour(100, 27, 0, 300)).toBe(100 * 27 + 26 - 300);
  });

  it('arrondit vers l\'exterieur : le defilement tombe sur des pixels entiers, la ligne ne doit pas rester dehors d\'un dixieme', () => {
    // la ligne 100 finit a 100 * 24,390625 + 23,390625 = 2462,453125 ; la zone s'arrete a 2200 + 262,2
    expect(defilementPour(100, 24.390625, 2200, 262.2)).toBe(1);
    expect(defilementPour(100, 24.390625, 2200, 263)).toBe(0);
    // la ligne 100 commence a 2439,0625 ; la zone commence a 2439,5
    expect(defilementPour(100, 24.390625, 2439.5, 300)).toBe(-1);
  });

  it('une liste qui commence plus bas que la zone ne fait pas defiler la premiere ligne', () => {
    expect(defilementPour(0, 27, -80, 400)).toBe(0);
  });
});
