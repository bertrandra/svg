import { describe, it, expect } from 'vitest';
import { defilementPour, fenetre, MARGE_FENETRE, segmentsFenetre, SEUIL_FENETRE, type Segment } from '../../../src/util/fenetre.js';

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

/** Pose les segments comme le fait une grille a `espace` pixels de gouttiere : l'ordonnee de chaque ligne, et la fin. */
function poser(segments: readonly Segment[], pas: number, espace: number) {
  let y = 0;
  const lignes = new Map<number, number>();
  for (const sg of segments) {
    if (sg.type === 'ligne') { lignes.set(sg.index, y); y += pas - espace; } else y += sg.hauteur;
    y += espace;
  }
  return { lignes, fin: y - espace };
}

describe('segmentsFenetre', () => {
  const total = 2000, pas = 31, visible = 260;

  it('sans ligne epinglee : une cale en haut, les lignes de la fenetre, une cale en bas', () => {
    const f = fenetre(total, pas, 1000 * pas, visible, MARGE_FENETRE, 100);
    const sg = segmentsFenetre(f, total, pas);
    expect(sg[0]).toEqual({ type: 'cale', lieu: 'haut', hauteur: f.haut - 1 });
    expect(sg[sg.length - 1]).toEqual({ type: 'cale', lieu: 'bas', hauteur: f.bas });
    const index = sg.flatMap(x => (x.type === 'ligne' ? [x.index] : []));
    expect(index).toEqual(Array.from({ length: f.fin - f.debut }, (_, k) => f.debut + k));
  });

  it('en haut de la liste il n y a pas de cale du haut, et une liste entiere n a aucune cale', () => {
    const f = fenetre(total, pas, 0, visible, MARGE_FENETRE, 100);
    expect(segmentsFenetre(f, total, pas)[0]).toEqual({ type: 'ligne', index: 0 });
    const toute = segmentsFenetre(fenetre(40, pas, 0, visible, MARGE_FENETRE, 100), 40, pas);
    expect(toute.every(x => x.type === 'ligne')).toBe(true);
    expect(toute).toHaveLength(40);
  });

  it.each([1, 4])('chaque ligne tombe a index * pas, epinglee ou non (espace de %i px)', espace => {
    for (const defile of [0, 5 * pas, 700 * pas, 1990 * pas]) {
      const f = fenetre(total, pas, defile, visible, MARGE_FENETRE, 100);
      for (const epingle of [null, 0, 3, 700, 1500, total - 1]) {
        const { lignes, fin } = poser(segmentsFenetre(f, total, pas, epingle, espace), pas, espace);
        for (const [i, y] of lignes) expect(y, `ligne ${i}, epingle ${String(epingle)}, defile ${defile}`).toBe(i * pas);
        // La hauteur de la liste est celle de la liste entiere, a la gouttiere finale pres.
        expect([total * pas, total * pas - espace]).toContain(fin);
        if (epingle !== null) expect(lignes.has(epingle)).toBe(true);
      }
    }
  });

  it('epingler une ligne hors de la fenetre ajoute une ligne et une cale du milieu, pas plus', () => {
    const f = fenetre(total, pas, 1000 * pas, visible, MARGE_FENETRE, 100);
    const sans = segmentsFenetre(f, total, pas);
    const loin = segmentsFenetre(f, total, pas, total - 1);
    expect(loin.filter(x => x.type === 'ligne')).toHaveLength(sans.filter(x => x.type === 'ligne').length + 1);
    expect(loin.filter(x => x.type === 'cale' && x.lieu === 'milieu')).toHaveLength(1);
    // Juste apres la fenetre, il n y a rien a combler : pas de cale vide.
    const collee = segmentsFenetre(f, total, pas, f.fin);
    expect(collee.filter(x => x.type === 'cale').every(x => x.type === 'cale' && x.hauteur > 0)).toBe(true);
    expect(collee.filter(x => x.type === 'cale' && x.lieu === 'milieu')).toHaveLength(0);
  });

  it('une ligne deja dans la fenetre, ou hors de la liste, n ajoute rien', () => {
    const f = fenetre(total, pas, 1000 * pas, visible, MARGE_FENETRE, 100);
    const sans = segmentsFenetre(f, total, pas);
    expect(segmentsFenetre(f, total, pas, f.debut + 3)).toEqual(sans);
    expect(segmentsFenetre(f, total, pas, -1)).toEqual(sans);
    expect(segmentsFenetre(f, total, pas, total)).toEqual(sans);
    expect(segmentsFenetre(f, total, pas, 2.5)).toEqual(sans);
  });
});
