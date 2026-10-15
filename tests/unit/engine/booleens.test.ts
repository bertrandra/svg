import { describe, it, expect } from 'vitest';
import { aireSignee, aplatir, appliquerBooleen, cheminDeRegion, regionDeForme } from '../../../src/engine/booleens.js';
import { boiteDe, lireDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';

const dessin = (svg: string): DessinSvg => { const r = lireDessin(svg); if ('erreur' in r) throw new Error(r.erreur); return r.dessin; };
const carre = (x: number, y: number, c: number, fill = '#c81e28') => `<path d="M${x} ${y}h${c}v${c}h-${c}z" fill="${fill}"/>`;
const svg = (corps: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${corps}</svg>`;
const aire = (d: DessinSvg, id: string) => regionDeForme(d.formes.find(f => f.id === id) as NonNullable<DessinSvg['formes'][0]>, 0.05).reduce((s, poly) => s + poly.reduce((t, r, i) => t + (i ? -1 : 1) * Math.abs(aireSignee(r)), 0), 0);

describe('aplatir et regions', () => {
  it('aplatit un cercle en un anneau d aire proche de pi r2, et lit les trous selon la regle', () => {
    const cercle = dessin(svg('<circle cx="50" cy="50" r="20"/>'));
    const anneaux = aplatir(cercle.formes[0]?.d ?? [], 0.05);
    expect(anneaux.length).toBe(1);
    expect(Math.abs(aireSignee(anneaux[0] ?? []))).toBeCloseTo(Math.PI * 400, -1);
    // Un anneau pair-impair : deux carres emboites, l'interieur creuse.
    const pair = dessin(svg('<path d="M10 10h40v40h-40zM20 20h20v20h-20z" fill-rule="evenodd"/>'));
    expect(aire(pair, 'f1')).toBeCloseTo(1600 - 400, 3);
    // Selon le sens du trace : emboites de meme sens, plein ; a contresens, creux.
    const memeSens = dessin(svg('<path d="M10 10h40v40h-40zM20 20h20v20h-20z"/>'));
    expect(aire(memeSens, 'f1')).toBeCloseTo(1600, 3);
    const contresens = dessin(svg('<path d="M10 10h40v40h-40zM20 20v20h20v-20z"/>'));
    expect(aire(contresens, 'f1')).toBeCloseTo(1200, 3);
  });
});

describe('appliquerBooleen', () => {
  const deux = () => dessin(svg(carre(0, 0, 20) + carre(10, 10, 20, '#1428a0')));

  it('unit, soustrait, croise et exclut, au style de la forme la plus basse', () => {
    const u = appliquerBooleen(deux(), ['f1', 'f2'], 'union');
    expect(u.id).toBe('f3');
    expect(u.dessin.formes.map(f => f.id)).toEqual(['f3']);
    expect(u.dessin.formes[0]?.remplissage).toBe('#c81e28');
    expect(boiteDe(u.dessin, ['f3'])).toEqual({ x: 0, y: 0, l: 30, h: 30 });
    expect(aire(u.dessin, 'f3')).toBeCloseTo(700, 3);
    const s = appliquerBooleen(deux(), ['f1', 'f2'], 'soustraction');
    expect(aire(s.dessin, 'f3')).toBeCloseTo(300, 3);
    const i = appliquerBooleen(deux(), ['f1', 'f2'], 'intersection');
    expect(boiteDe(i.dessin, ['f3'])).toEqual({ x: 10, y: 10, l: 10, h: 10 });
    const x = appliquerBooleen(deux(), ['f1', 'f2'], 'exclusion');
    expect(aire(x.dessin, 'f3')).toBeCloseTo(600, 3);
  });

  it('refuse une seule forme ou une forme sans aire, et retire tout quand il ne reste rien', () => {
    expect(appliquerBooleen(deux(), ['f1'], 'union').erreur).toMatch(/deux formes/);
    const ligne = dessin(svg(carre(0, 0, 20) + '<path d="M0 0L50 50" fill="none" stroke="#000"/>'));
    expect(appliquerBooleen(ligne, ['f1', 'f2'], 'union').erreur).toMatch(/sans remplissage/);
    const loin = dessin(svg(carre(0, 0, 10) + carre(50, 50, 10)));
    const r = appliquerBooleen(loin, ['f1', 'f2'], 'intersection');
    expect(r.id).toBeNull();
    expect(r.dessin.formes).toEqual([]);
  });

  it('ecrit la region en anneaux fermes, et rend le meme resultat deux fois', () => {
    const d = cheminDeRegion([[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]]);
    expect(d.map(c => c.c).join('')).toBe('MLLLZ');
    const a = appliquerBooleen(deux(), ['f1', 'f2'], 'union'), b = appliquerBooleen(deux(), ['f1', 'f2'], 'union');
    expect(a.dessin).toEqual(b.dessin);
  });
});
