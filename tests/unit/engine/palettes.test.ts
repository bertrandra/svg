import { describe, it, expect } from 'vitest';
import { appliquerPalette, PALETTES, uneCouleur } from '../../../src/engine/palettes.js';
import { couleursDuDessin, lireDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';

const dessin = (svg: string): DessinSvg => { const r = lireDessin(svg); if ('erreur' in r) throw new Error(r.erreur); return r.dessin; };
const svg = (corps: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${corps}</svg>`;
const carre = (x: number, c: string) => `<path d="M${x} 0h10v10h-10z" fill="${c}"/>`;

describe('palettes', () => {
  const base = () => dessin(svg(carre(0, '#aaaaaa') + carre(10, '#aaaaaa') + carre(20, '#bbbbbb') + carre(30, '#cccccc')));

  it('pose la palette sur les couleurs, les plus presentes d abord, en boucle, sans enchainer les remplacements', () => {
    const d = appliquerPalette(base(), ['#111111', '#222222']);
    expect(couleursDuDessin(d)).toEqual([{ couleur: '#111111', formes: 3 }, { couleur: '#222222', formes: 1 }]);
    const e = appliquerPalette(base(), ['#bbbbbb', '#aaaaaa', '#000000']);
    expect(d.formes.map(f => f.remplissage)).toEqual(['#111111', '#111111', '#222222', '#111111']);
    expect(e.formes.map(f => f.remplissage)).toEqual(['#bbbbbb', '#bbbbbb', '#aaaaaa', '#000000']);
    const b = base();
    expect(appliquerPalette(b, [])).toBe(b);
  });

  it('met tout d une couleur, et les palettes portent des codes valides', () => {
    expect(couleursDuDessin(uneCouleur(base(), '#123456'))).toEqual([{ couleur: '#123456', formes: 4 }]);
    for (const p of PALETTES) for (const c of p.couleurs) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(PALETTES.map(p => p.id)).size).toBe(PALETTES.length);
  });
});
