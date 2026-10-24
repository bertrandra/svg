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

// ---------------------------------------------------------------- aplatissement adaptatif et courbes rebatties

type Point = readonly [number, number];
type Contours = DessinSvg['formes'][number]['d'];
const distSeg = (p: Point, a: Point, b: Point): number => {
  const abx = b[0] - a[0], aby = b[1] - a[1], l2 = abx * abx + aby * aby;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / l2)) : 0;
  return Math.hypot(p[0] - (a[0] + abx * t), p[1] - (a[1] + aby * t));
};
/** Le plus grand ecart d'un ensemble de points a un ensemble d'anneaux (distance a leurs cotes). */
const ecartA = (pts: readonly Point[], anneaux: readonly (readonly Point[])[]): number =>
  Math.max(...pts.map(p => Math.min(...anneaux.flatMap(r => r.map((a, i) => distSeg(p, a, r[(i + 1) % r.length] ?? a))))));
const hausdorff = (a: readonly (readonly Point[])[], b: readonly (readonly Point[])[]): number => Math.max(ecartA(a.flat(), b), ecartA(b.flat(), a));
const compter = (d: Contours): number => d.filter(c => c.c !== 'Z').length;

describe('aplatir, a une tolerance geometrique', () => {
  const cubique = dessin(svg('<path d="M10 80C10 10 90 10 90 80" fill="#c81e28"/>')).formes[0]?.d ?? [];
  const point = (t: number): Point => {
    const v = 1 - t, [x0, y0, x1, y1, x2, y2, x3, y3] = [10, 80, 10, 10, 90, 10, 90, 80] as const;
    return [v ** 3 * x0 + 3 * v * v * t * x1 + 3 * v * t * t * x2 + t ** 3 * x3, v ** 3 * y0 + 3 * v * v * t * y1 + 3 * v * t * t * y2 + t ** 3 * y3];
  };
  const vraie: Point[] = Array.from({ length: 2001 }, (_, k) => point(k / 2000));

  it('tient l ecart au trace sous la tolerance demandee, quelle qu elle soit', () => {
    for (const tolerance of [1, 0.2, 0.05, 0.005, 0.0005]) {
      const anneau = aplatir(cubique, tolerance)[0] ?? [];
      // La polyligne ne depasse pas la tolerance du vrai trace (la corde de fermeture mise a part, qu on ne mesure pas).
      const cotes = anneau.slice(0, -1).map((a, i) => [a, anneau[i + 1] ?? a] as const);
      const ecart = Math.max(...vraie.map(p => Math.min(...cotes.map(([a, b]) => distSeg(p, a, b)))));
      expect(ecart, 'tolerance ' + tolerance).toBeLessThanOrEqual(tolerance);
    }
  });

  it('met plus de segments quand on serre la tolerance, jamais plus de 512 par courbe', () => {
    const n = (t: number) => (aplatir(cubique, t)[0]?.length ?? 0);
    expect(n(1)).toBeLessThan(n(0.05));
    expect(n(0.05)).toBeLessThan(n(0.005));
    // Une tolerance minuscule ne fait pas exploser le chemin : le plafond tient.
    expect(n(1e-12)).toBeLessThanOrEqual(512 + 2);
  });

  it('ne met qu un segment a une courbe qui est une droite', () => {
    const droite = dessin(svg('<path d="M10 10C20 20 30 30 40 40L40 10z" fill="#c81e28"/>')).formes[0]?.d ?? [];
    expect(aplatir(droite, 0.01)[0]?.length).toBe(3);
  });
});

describe('appliquerBooleen, sur des cercles', () => {
  const cercles = () => dessin(svg('<circle cx="40" cy="50" r="30" fill="#c81e28"/><circle cx="62" cy="50" r="30" fill="#1428a0"/>'));
  const union = (options = {}) => appliquerBooleen(cercles(), ['f1', 'f2'], 'union', undefined, options);
  const chemin = (r: ReturnType<typeof union>): Contours => r.dessin.formes[0]?.d ?? [];

  it('aplatit au vingt-millieme du plan par defaut : une union de cercles tient en peu de points et reste fine', () => {
    const r = union();
    expect(r.dessin.formes[0]?.remplissage).toBe('#c81e28');
    const fin = appliquerBooleen(cercles(), ['f1', 'f2'], 'union', 0.0001);
    expect(compter(chemin(r))).toBeLessThan(260);
    expect(compter(chemin(r))).toBeGreaterThan(150);
    // L'ecart a un aplatissement cinquante fois plus fin reste sous deux tolerances (les coins de decoupe glissent sur la corde).
    expect(hausdorff(aplatir(chemin(r), 1), aplatir(chemin(fin), 1))).toBeLessThanOrEqual(2 * 0.005);
  });

  it('ne rebatit rien par defaut : que des segments droits', () => {
    expect(new Set(chemin(union()).map(c => c.c))).toEqual(new Set(['M', 'L', 'Z']));
  });

  it('rebatit les arcs en courbes avec lisser : bien moins de points, les coins gardes, a trois tolerances du trace', () => {
    const droit = chemin(union()), lisse = chemin(union({ lisser: true }));
    const tolerance = 100 / 20000;
    expect(compter(lisse)).toBeLessThan(compter(droit) / 6);
    expect(lisse.some(c => c.c === 'C')).toBe(true);
    // Les deux coins ou les cercles se croisent restent des coins : (51, 50 -+ h) avec h = racine(900 - 121).
    const h = Math.sqrt(900 - 121);
    for (const y of [50 - h, 50 + h]) {
      expect(lisse.some(c => c.c !== 'Z' && Math.abs((c.p[c.p.length - 2] ?? 0) - 51) < 0.02 && Math.abs((c.p[c.p.length - 1] ?? 0) - y) < 0.02), 'coin y=' + y).toBe(true);
    }
    const fin = appliquerBooleen(cercles(), ['f1', 'f2'], 'union', 0.0001);
    expect(hausdorff(aplatir(lisse, tolerance / 50), aplatir(chemin(fin), 1))).toBeLessThan(3 * tolerance);
    const aireDe = (d: Contours) => aplatir(d, 0.001).reduce((s, r) => s + Math.abs(aireSignee(r)), 0);
    expect(Math.abs(aireDe(lisse) - aireDe(droit))).toBeLessThan(0.5);
  });

  it('est pur et deterministe, avec ou sans lisser', () => {
    expect(union({ lisser: true })).toEqual(union({ lisser: true }));
    expect(union()).toEqual(union());
  });

  it('garde les trous : un cercle retire d un carre reste un anneau interieur, rebati en courbes', () => {
    const d = dessin(svg('<path d="M0 0h100v100h-100z" fill="#c81e28"/><circle cx="50" cy="50" r="20" fill="#1428a0"/>'));
    const r = appliquerBooleen(d, ['f1', 'f2'], 'soustraction', undefined, { lisser: true });
    const c = r.dessin.formes[0]?.d ?? [];
    expect(c.filter(x => x.c === 'M').length).toBe(2);
    expect(c.filter(x => x.c === 'Z').length).toBe(2);
    const aires = aplatir(c, 0.001).map(aireSignee).map(Math.abs).sort((a, b) => b - a);
    expect(aires[0]).toBeCloseTo(10000, 3);
    expect(aires[1]).toBeCloseTo(Math.PI * 400, 0);
    // Le trou est lisse : de la forme du cercle, pas un polygone a quelques cotes.
    const trou = c.slice(c.findIndex((x, i) => i > 0 && x.c === 'M'));
    expect(trou.filter(x => x.c === 'C').length).toBeGreaterThan(3);
    expect(trou.length).toBeLessThan(40);
  });

  it('laisse tel quel un dessin sans courbe, meme avec lisser', () => {
    const carres = dessin(svg(carre(0, 0, 20) + carre(10, 10, 20, '#1428a0')));
    const a = appliquerBooleen(carres, ['f1', 'f2'], 'union', undefined, { lisser: true }), b = appliquerBooleen(carres, ['f1', 'f2'], 'union');
    expect(a.dessin).toEqual(b.dessin);
  });

  it('ne rebatit pas en courbe ce que l ajustement ne tient pas : un decagone reste droit', () => {
    // Un decagone a des sommets de 36 degres : au-dela du seuil de coin, chaque sommet reste un coin.
    const pts = Array.from({ length: 10 }, (_, k) => [50 + 30 * Math.cos((k / 10) * 2 * Math.PI), 50 + 30 * Math.sin((k / 10) * 2 * Math.PI)].map(v => v.toFixed(3)).join(' '));
    const d = dessin(svg(`<path d="M${pts.join('L')}z" fill="#c81e28"/><circle cx="90" cy="90" r="3" fill="#1428a0"/>`));
    const r = appliquerBooleen(d, ['f1', 'f2'], 'union', undefined, { lisser: true });
    // Deux anneaux disjoints dans une seule forme : le petit cercle devient courbe s il tient, le decagone jamais.
    const ecrit = (r.dessin.formes[0]?.d ?? []).map(c => c.c).join('');
    expect(r.dessin.formes.length).toBe(1);
    expect(ecrit).toMatch(/ML{9}Z/);
  });
});
