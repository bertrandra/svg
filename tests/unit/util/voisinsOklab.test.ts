import { describe, expect, it } from 'vitest';
import type { Oklab } from '../../../src/util/couleur.js';
import { creerIndexVoisins, ecartOklab, indexLineaire } from '../../../src/util/voisinsOklab.js';

// L'index n'est qu'un elagage : il doit rendre, pour tout point et toute tolerance, le meme rang que le
// parcours des centres dans l'ordre de pose. On le prouve contre ce parcours (`indexLineaire`), sur des
// milliers de points tires au hasard, concentres (beaucoup de voisins) ou etales (peu).

const graine = (n: number) => { let s = n; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };

/** Un point dans la plage d'OKLab des couleurs sRGB : l de 0 a 1, a et b d'environ ±0,33. */
const point = (alea: () => number, etalement = 1): Oklab => ({ l: 0.5 + (alea() - 0.5) * etalement, a: (alea() - 0.5) * 0.66 * etalement, b: (alea() - 0.5) * 0.66 * etalement });

describe('creerIndexVoisins', () => {
  it('rend -1 quand aucun centre n’a ete pose', () => {
    expect(creerIndexVoisins(0.04).premier({ l: 0.5, a: 0, b: 0 })).toBe(-1);
  });

  it('rend le plus petit rang parmi les proches, pas le plus proche', () => {
    const i = creerIndexVoisins(0.1);
    i.ajouter({ l: 0.5, a: 0.05, b: 0 }, 0);
    i.ajouter({ l: 0.5, a: 0.01, b: 0 }, 1);
    expect(i.premier({ l: 0.5, a: 0, b: 0 })).toBe(0);
    expect(i.premier({ l: 0.5, a: -0.2, b: 0 })).toBe(-1);
  });

  it('garde un centre a exactement la tolerance (inclus, comme avant)', () => {
    const p: Oklab = { l: 0.3, a: 0.1, b: -0.1 }, q: Oklab = { l: 0.3 + 0.0375, a: 0.1, b: -0.1 };
    const t = ecartOklab(p, q);
    for (const fabrique of [creerIndexVoisins, indexLineaire]) {
      const i = fabrique(t);
      i.ajouter(p, 0);
      expect(i.premier(q)).toBe(0);
    }
  });

  for (const [graineN, nombre, etalement] of [[1, 3000, 1], [2, 3000, 0.15], [3, 5000, 0.05], [4, 2000, 3]] as const) {
    it(`rend les rangs du parcours lineaire (${nombre} points, etalement ${etalement})`, () => {
      const alea = graine(graineN);
      for (const tolerance of [0, 1e-9, 0.004, 0.01, 0.02, 0.04, 0.08, 0.15, 0.5, 2]) {
        const grille = creerIndexVoisins(tolerance), lineaire = indexLineaire(tolerance);
        let poses = 0;
        for (let k = 0; k < nombre; k++) {
          const p = point(alea, etalement);
          const a = grille.premier(p), b = lineaire.premier(p);
          expect(a, `tolerance ${tolerance}, point ${k}`).toBe(b);
          // Comme le regroupement glouton : un point sans voisin devient un centre.
          if (b < 0) { grille.ajouter(p, poses); lineaire.ajouter(p, poses); poses++; }
        }
      }
    });
  }

  it('ne rate aucun couple a distance exactement egale a la tolerance, sur les frontieres des cellules', () => {
    const alea = graine(9);
    for (let k = 0; k < 20000; k++) {
      // Des coordonnees posees sur des multiples de 1/256 (la plus petite cellule) ou juste a cote.
      const bord = (v: number) => Math.round(v * 256) / 256 + (alea() < 0.5 ? 0 : (alea() - 0.5) * 1e-12);
      const p: Oklab = { l: bord(alea()), a: bord((alea() - 0.5) * 0.6), b: bord((alea() - 0.5) * 0.6) };
      const axe = Math.floor(alea() * 3), d = [0.004, 0.01, 0.02, 1 / 256, 0.0376][Math.floor(alea() * 5)] as number;
      const q: Oklab = { l: p.l + (axe === 0 ? d : 0), a: p.a + (axe === 1 ? d : 0), b: p.b + (axe === 2 ? d : 0) };
      const tolerance = ecartOklab(p, q);
      const grille = creerIndexVoisins(tolerance), lineaire = indexLineaire(tolerance);
      grille.ajouter(p, 0); lineaire.ajouter(p, 0);
      expect(grille.premier(q)).toBe(lineaire.premier(q));
      expect(grille.premier(q)).toBe(0);
    }
  });

  it('retombe sur le parcours lineaire pour une tolerance qui n’est pas un nombre fini positif', () => {
    const alea = graine(5);
    for (const tolerance of [NaN, -1, Infinity]) {
      const grille = creerIndexVoisins(tolerance), lineaire = indexLineaire(tolerance);
      for (let k = 0; k < 200; k++) {
        const p = point(alea);
        expect(grille.premier(p)).toBe(lineaire.premier(p));
        grille.ajouter(p, k); lineaire.ajouter(p, k);
      }
    }
  });

  it('tient des points hors de la plage des couleurs sRGB (indices bornes)', () => {
    const grille = creerIndexVoisins(0.02), lineaire = indexLineaire(0.02);
    const loin: Oklab[] = [{ l: 500, a: -900, b: 3 }, { l: 500.01, a: -900, b: 3 }, { l: -1e6, a: 1e6, b: 0 }, { l: 0.5, a: 0, b: 0 }];
    loin.forEach((p, k) => {
      expect(grille.premier(p)).toBe(lineaire.premier(p));
      grille.ajouter(p, k); lineaire.ajouter(p, k);
    });
    expect(grille.premier({ l: 500.005, a: -900, b: 3 })).toBe(lineaire.premier({ l: 500.005, a: -900, b: 3 }));
  });
});
