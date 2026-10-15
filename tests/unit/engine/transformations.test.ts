import { describe, it, expect } from 'vitest';
import { aimanter, angleVers, ciblesAimants, incliner, mettreALEchelle, tournerAutour } from '../../../src/engine/transformations.js';
import { boiteDe, lireDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';

const dessin = (svg: string): DessinSvg => { const r = lireDessin(svg); if ('erreur' in r) throw new Error(r.erreur); return r.dessin; };
const carre = (x: number, y: number, c: number) => `<path d="M${x} ${y}h${c}v${c}h-${c}z"/>`;
const svg = (corps: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${corps}</svg>`;
const arrondi = (b: { x: number; y: number; l: number; h: number } | null) => b && [b.x, b.y, b.l, b.h].map(v => Math.round(v * 1000) / 1000);

describe('transformations numeriques', () => {
  it('tourne autour du centre, incline, met a l echelle, sans bouger le centre', () => {
    const d = dessin(svg(carre(10, 10, 20)));
    expect(arrondi(boiteDe(tournerAutour(d, ['f1'], 45), ['f1']))).toEqual([20 - 10 * Math.SQRT2, 20 - 10 * Math.SQRT2, 20 * Math.SQRT2, 20 * Math.SQRT2].map(v => Math.round(v * 1000) / 1000));
    expect(arrondi(boiteDe(mettreALEchelle(d, ['f1'], 2, 0.5), ['f1']))).toEqual([0, 15, 40, 10]);
    const i = boiteDe(incliner(d, ['f1'], 45, 0), ['f1']);
    expect(i && Math.round(i.l)).toBe(40);
    expect(i && Math.round(i.y)).toBe(10);
    expect(tournerAutour(d, ['f1'], 0)).toBe(d);
    expect(mettreALEchelle(d, ['f1'], 1)).toBe(d);
  });

  it('mesure un angle a l ecran', () => {
    expect(angleVers([0, 0], [10, 0])).toBe(0);
    expect(angleVers([0, 0], [0, 10])).toBe(90);
  });
});

describe('aimants', () => {
  it('attire la boite vers le bord ou le centre le plus proche, sous le seuil, et dit la ligne', () => {
    const cibles = [{ x: 0, y: 0, l: 100, h: 100 }, { x: 40, y: 40, l: 20, h: 20 }];
    const a = aimanter({ x: 61.5, y: 10, l: 10, h: 10 }, cibles, 3);
    expect(a.dx).toBeCloseTo(-1.5, 6);
    expect(a.dy).toBe(0);
    expect(a.lignes.map(l => l.axe + l.valeur)).toEqual(['x60']);
    const b = aimanter({ x: 10, y: 48, l: 10, h: 10 }, cibles, 3);
    expect(b.dy).toBeCloseTo(2, 6);
    expect(aimanter({ x: 10, y: 10, l: 5, h: 5 }, cibles, 2).lignes).toEqual([]);
  });

  it('prend pour cibles le plan et les formes visibles hors selection', () => {
    const d = dessin(svg(carre(10, 10, 20) + carre(50, 50, 10)));
    expect(ciblesAimants(d, ['f1']).map(b => b.x)).toEqual([0, 50]);
  });
});
