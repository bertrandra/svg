// Les hachures pour le stylo (ADR-0022) : l'aire couverte, l'espacement, aucune ligne hors de la forme, les trous respectes,
// le va-et-vient de la pointe, le determinisme et les bornes.

import { describe, expect, it } from 'vitest';
import type { Chemin, DessinSvg, Forme } from '../../../src/engine/editionSvg.js';
import { regionDeForme } from '../../../src/engine/booleens.js';
import { hachuresDeForme, hachurerFormes, lignesDeHachure, LIGNES_MAX } from '../../../src/engine/contour/hachures.js';

const carre = (x: number, y: number, l: number, sens = 1): Chemin => sens > 0
  ? [{ c: 'M', p: [x, y] }, { c: 'L', p: [x + l, y] }, { c: 'L', p: [x + l, y + l] }, { c: 'L', p: [x, y + l] }, { c: 'Z', p: [] }]
  : [{ c: 'M', p: [x, y] }, { c: 'L', p: [x, y + l] }, { c: 'L', p: [x + l, y + l] }, { c: 'L', p: [x + l, y] }, { c: 'Z', p: [] }];
const forme = (d: Chemin): Forme => ({ id: 'f1', d, remplissage: '#c81e28', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false });
// Un carre de 100 perce d'un carre de 40 au centre (trace a contresens) : 8 400 d'aire peinte.
const anneau = forme([...carre(0, 0, 100), ...carre(30, 30, 40, -1)]);
const longueur = (l: ReadonlyArray<readonly [readonly [number, number], readonly [number, number]]>) => l.reduce((s, [a, b]) => s + Math.hypot(b[0] - a[0], b[1] - a[1]), 0);
const dedans = (p: readonly [number, number]) => p[0] > 0 && p[0] < 100 && p[1] > 0 && p[1] < 100 && !(p[0] > 30 && p[0] < 70 && p[1] > 30 && p[1] < 70);

describe('les hachures', () => {
  it('a l horizontale : des lignes espacees de la largeur, la premiere a un demi-ecart du bord, qui couvrent exactement l aire', () => {
    const r = lignesDeHachure(regionDeForme(anneau, 0.001), { ecart: 2, angle: 0 });
    if ('erreur' in r) throw new Error(r.erreur);
    const ys = [...new Set(r.map(([a]) => a[1]))].sort((a, b) => a - b);
    expect(ys[0]).toBeCloseTo(1, 9);
    expect(ys.length).toBe(50);
    ys.slice(1).forEach((y, i) => expect(y - (ys[i] ?? 0)).toBeCloseTo(2, 9));
    expect(longueur(r) * 2).toBeCloseTo(8400, 6);
  });

  it('a 45 degres : l aire couverte a un pour cent pres, et chaque ligne dans la forme, hors du trou', () => {
    const r = lignesDeHachure(regionDeForme(anneau, 0.001), { ecart: 1.5, angle: 45 });
    if ('erreur' in r) throw new Error(r.erreur);
    expect(Math.abs(longueur(r) * 1.5 - 8400) / 8400).toBeLessThan(0.01);
    for (const [a, b] of r) {
      for (const t of [0.01, 0.5, 0.99]) expect(dedans([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])])).toBe(true);
    }
  });

  it('va et vient : chaque ligne repart du cote ou la precedente s est arretee', () => {
    const r = lignesDeHachure(regionDeForme(forme(carre(0, 0, 10)), 0.001), { ecart: 1, angle: 0 });
    if ('erreur' in r) throw new Error(r.erreur);
    expect(r[0]?.[0][0]).toBeCloseTo(0, 9);
    expect(r[1]?.[0][0]).toBeCloseTo(10, 9);
  });

  it('rend des traces ouverts (M, L) et la forme hachuree garde son pourtour, sans fond, a l epaisseur du stylo', () => {
    const h = hachuresDeForme(anneau, { ecart: 4, angle: 90 });
    if ('erreur' in h) throw new Error(h.erreur);
    expect(h.d.every(c => c.c === 'M' || c.c === 'L')).toBe(true);
    const d: DessinSvg = { vb: [0, 0, 100, 100], formes: [anneau] };
    const r = hachurerFormes(d, ['f1'], 1.5);
    const f = r.dessin.formes[0];
    expect(r.hachurees).toBe(1);
    expect(f).toMatchObject({ remplissage: null, contour: '#c81e28', epaisseur: 1.5, bout: 'round' });
    expect(f?.d.slice(0, 10)).toEqual(anneau.d);
  });

  it('est deterministe, refuse un nombre de lignes demesure, et laisse les formes sans fond', () => {
    const a = hachuresDeForme(anneau, { ecart: 3, angle: 30 }), b = hachuresDeForme(anneau, { ecart: 3, angle: 30 });
    expect(a).toEqual(b);
    const trop = lignesDeHachure(regionDeForme(anneau, 0.001), { ecart: 100 / (LIGNES_MAX + 10), angle: 0 });
    expect('erreur' in trop && trop.erreur).toMatch(/plus de 20/);
    const sansFond: DessinSvg = { vb: [0, 0, 100, 100], formes: [{ ...anneau, remplissage: null, contour: '#000000', epaisseur: 1 }] };
    expect(hachurerFormes(sansFond, ['f1'], 1).dessin).toBe(sansFond);
  });
});
