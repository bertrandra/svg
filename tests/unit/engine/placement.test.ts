// Dupliquer sur la feuille (ADR-0039) : la quantite qui tient et celle qui ne tient pas, remplir, la rotation qui gagne, les formes deja
// posees evitees (boites en simple, contours reels en avancee), la feuille partielle decalee, l'avancee qui pose au moins autant que
// le simple et davantage sur des etoiles, le budget d'essais, l'operation gardee.

import { describe, expect, it } from 'vitest';
import clipping from 'polygon-clipping';
import { boiteAvecTrait, lireDessin, type Boite, type DessinSvg, type Forme } from '../../../src/engine/editionSvg.js';
import { regionDeForme, toleranceBooleen } from '../../../src/engine/booleens.js';
import { aireDeRegion } from '../../../src/engine/contour/region.js';
import { avancerPlacement, finirPlacement, phrasePlacement, placerSurFeuille, preparerPlacement, type OptionsPlacement } from '../../../src/engine/preparation.js';

const lire = (corps: string, vb = '0 0 1152 1152'): DessinSvg => {
  const r = lireDessin('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '">' + corps + '</svg>');
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
const rect = (x: number, y: number, l: number, h: number, couleur = '#c81e28') => '<rect x="' + x + '" y="' + y + '" width="' + l + '" height="' + h + '" fill="' + couleur + '"/>';
const etoile = (cx: number, cy: number, R: number, r: number, couleur = '#1428a0') => {
  const p: string[] = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? r : R; p.push((cx + k * Math.cos(a)).toFixed(3) + ' ' + (cy + k * Math.sin(a)).toFixed(3)); }
  return '<path d="M' + p.join('L') + 'Z" fill="' + couleur + '"/>';
};
const options = (o: Partial<OptionsPlacement> = {}): OptionsPlacement => ({ quantite: 1, espacement: 8, marge: 8, rotation: false, optimisation: 'simple', ...o });
const dedans = (b: Boite, f: Boite) => b.x >= f.x - 1e-6 && b.y >= f.y - 1e-6 && b.x + b.l <= f.x + f.l + 1e-6 && b.y + b.h <= f.y + f.h + 1e-6;
const ecartBoites = (a: Boite, b: Boite) => Math.max(b.x - (a.x + a.l), a.x - (b.x + b.l), b.y - (a.y + a.h), a.y - (b.y + b.h));
const nouvelles = (avant: DessinSvg, apres: DessinSvg): Forme[] => { const vues = new Set(avant.formes.map(f => f.id)); return apres.formes.filter(f => !vues.has(f.id)); };
const boite = (f: Forme): Boite => { const b = boiteAvecTrait(f); if (!b) throw new Error('boite'); return b; };

/** L'aire commune de deux formes : nulle quand elles ne se chevauchent pas. */
const aireCommune = (a: Forme, b: Forme, t: number) => aireDeRegion(clipping.intersection(regionDeForme(a, t), regionDeForme(b, t)));

describe('dupliquer sur la feuille, en simple', () => {
  const FEUILLE = { x: 0, y: 0, l: 1152, h: 1152 };

  it('pose la quantite demandee quand elle tient, chaque copie dans la feuille, a l espacement des autres et de l original', () => {
    const d = lire(rect(40, 40, 100, 80));
    const r = placerSurFeuille(d, ['f1'], FEUILLE, options({ quantite: 5 }));
    expect(r.copies).toBe(5);
    expect(r.demandees).toBe(5);
    expect(r.ids.length).toBe(6);
    const toutes = [d.formes[0] as Forme, ...nouvelles(d, r.dessin)].map(boite);
    for (const b of toutes.slice(1)) expect(dedans(b, { x: 8, y: 8, l: 1136, h: 1136 })).toBe(true);
    for (let i = 0; i < toutes.length; i++) for (let k = i + 1; k < toutes.length; k++) expect(ecartBoites(toutes[i] as Boite, toutes[k] as Boite)).toBeGreaterThanOrEqual(8 - 1e-6);
    expect(phrasePlacement(r)).toBe('5 copies posées sur la feuille. Ctrl+Z les retire.');
  });

  it('pose autant que possible quand la quantite ne tient pas, et le dit, sans jamais deborder', () => {
    const d = lire(rect(600, 600, 100, 100));
    const feuille = { x: 0, y: 0, l: 340, h: 340 };
    const r = placerSurFeuille(d, ['f1'], feuille, options({ quantite: 12, espacement: 10, marge: 10 }));
    // 320 de place : trois pieces de 100 par cote, a 10 l'une de l'autre.
    expect(r.copies).toBe(9);
    for (const f of nouvelles(d, r.dessin)) expect(dedans(boite(f), feuille)).toBe(true);
    expect(phrasePlacement(r)).toBe('9 copies posées sur 12 : la feuille est pleine. Ctrl+Z les retire.');
  });

  it('remplit la feuille : apres, plus une copie ne tient', () => {
    const d = lire(rect(40, 40, 100, 80));
    const r = placerSurFeuille(d, ['f1'], FEUILLE, options({ quantite: 'remplir' }));
    expect(r.copies).toBeGreaterThan(50);
    expect(r.demandees).toBeNull();
    expect(phrasePlacement(r)).toMatch(/copies posées : la feuille est pleine\./);
    const encore = placerSurFeuille(r.dessin, ['f1'], FEUILLE, options({ quantite: 1 }));
    expect(encore.copies).toBe(0);
    expect(encore.erreur).toMatch(/Aucune copie ne tient/);
  });

  it('tourne d un quart de tour quand cela en fait tenir davantage, et le dit', () => {
    const d = lire(rect(600, 600, 120, 50), '0 0 1000 1000');
    const feuille = { x: 0, y: 0, l: 110, h: 260 };
    expect(placerSurFeuille(d, ['f1'], feuille, options({ quantite: 'remplir', espacement: 5, marge: 0 })).copies).toBe(0);
    const r = placerSurFeuille(d, ['f1'], feuille, options({ quantite: 'remplir', espacement: 5, marge: 0, rotation: true }));
    expect(r.copies).toBe(4);
    expect(r.tournees).toBe(4);
    for (const f of nouvelles(d, r.dessin)) { const b = boite(f); expect(dedans(b, feuille)).toBe(true); expect(b.l).toBeCloseTo(50, 6); expect(b.h).toBeCloseTo(120, 6); }
    expect(phrasePlacement(r)).toContain('(4 tournées)');
  });

  it('evite les formes deja posees sur la feuille (leur boite elargie de l espacement), verrouillees comprises, mais pas une forme masquee', () => {
    const d0 = lire(rect(40, 40, 60, 60) + rect(300, 200, 400, 300, '#2e7d32') + rect(800, 800, 200, 200, '#f2a900'));
    const d: DessinSvg = { ...d0, formes: d0.formes.map(f => (f.id === 'f2' ? { ...f, verrouille: true } : f.id === 'f3' ? { ...f, visible: false } : f)) };
    const r = placerSurFeuille(d, ['f1'], FEUILLE, options({ quantite: 'remplir' }));
    const obstacle = boite(d.formes[1] as Forme), masquee = boite(d.formes[2] as Forme);
    const copies = nouvelles(d, r.dessin).map(boite);
    for (const b of copies) expect(ecartBoites(b, obstacle)).toBeGreaterThanOrEqual(8 - 1e-6);
    // La forme masquee n'est pas un obstacle : des copies se posent sur sa place.
    expect(copies.some(b => ecartBoites(b, masquee) < 0)).toBe(true);
  });

  it('ignore une forme hors de la feuille, et range les copies dans une feuille partielle decalee', () => {
    const d = lire(rect(40, 40, 60, 60) + rect(0, 900, 1152, 200, '#2e7d32'));
    const feuille = { x: 500, y: 300, l: 400, h: 300 };
    const r = placerSurFeuille(d, ['f1'], feuille, options({ quantite: 'remplir' }));
    // 384 x 284 de place, des pieces de 60 a 8 l'une de l'autre : cinq colonnes, quatre rangees.
    expect(r.copies).toBe(20);
    for (const f of nouvelles(d, r.dessin)) expect(dedans(boite(f), { x: 508, y: 308, l: 384, h: 284 })).toBe(true);
  });

  it('copie une selection de plusieurs formes comme une seule piece, et garde l operation de chaque forme', () => {
    const d0 = lire(rect(40, 40, 100, 100) + rect(60, 60, 20, 20, '#ffffff'));
    const d: DessinSvg = { ...d0, formes: d0.formes.map(f => (f.id === 'f2' ? { ...f, operation: 'ecriture' as const } : f)) };
    const r = placerSurFeuille(d, ['f1', 'f2'], { x: 0, y: 0, l: 400, h: 200 }, options({ quantite: 'remplir' }));
    expect(r.copies).toBe(2);
    const neuves = nouvelles(d, r.dessin);
    expect(neuves.length).toBe(4);
    expect(neuves.filter(f => f.operation === 'ecriture').length).toBe(2);
    // Chaque petite forme reste dans sa grande, a la meme place relative.
    const grandes = neuves.filter(f => f.remplissage === '#c81e28').map(boite), petites = neuves.filter(f => f.remplissage === '#ffffff').map(boite);
    petites.forEach((p, i) => { const g = grandes[i] as Boite; expect(p.x - g.x).toBeCloseTo(20, 6); expect(p.y - g.y).toBeCloseTo(20, 6); });
  });

  it('refuse sans rien changer : aucune forme, une quantite nulle, un espacement hors bornes', () => {
    const d = lire(rect(40, 40, 60, 60));
    expect(placerSurFeuille(d, [], FEUILLE, options()).erreur).toMatch(/Choisissez d’abord/);
    expect(placerSurFeuille(d, ['f1'], FEUILLE, options({ quantite: 0 })).erreur).toMatch(/au moins une copie/);
    expect(placerSurFeuille(d, ['f1'], FEUILLE, options({ espacement: -1 })).erreur).toMatch(/espacement/);
    expect(placerSurFeuille(d, ['f1'], FEUILLE, options({ quantite: 0 })).dessin).toBe(d);
  });

  it('est deterministe : les memes reglages donnent le meme dessin', () => {
    const d = lire(etoile(100, 100, 60, 24));
    const a = placerSurFeuille(d, ['f1'], FEUILLE, options({ quantite: 'remplir', rotation: true, optimisation: 'avancee' }));
    const b = placerSurFeuille(d, ['f1'], FEUILLE, options({ quantite: 'remplir', rotation: true, optimisation: 'avancee' }));
    expect(JSON.stringify(b.dessin)).toBe(JSON.stringify(a.dessin));
  });
});

describe('dupliquer sur la feuille, en avancee', () => {
  const FEUILLE = { x: 0, y: 0, l: 560, h: 560 };

  it('emboite des etoiles : strictement plus que le simple, toutes dans la feuille, aucune ne chevauche une autre', () => {
    const d = lire(etoile(70, 70, 60, 24));
    const simple = placerSurFeuille(d, ['f1'], FEUILLE, options({ quantite: 'remplir', rotation: true }));
    const avancee = placerSurFeuille(d, ['f1'], FEUILLE, options({ quantite: 'remplir', rotation: true, optimisation: 'avancee' }));
    expect(avancee.copies).toBeGreaterThan(simple.copies);
    const t = toleranceBooleen(avancee.dessin), toutes = avancee.dessin.formes;
    for (const f of toutes.slice(1)) expect(dedans(boite(f), { x: 8, y: 8, l: 544, h: 544 })).toBe(true);
    for (let i = 0; i < toutes.length; i++) for (let k = i + 1; k < toutes.length; k++) expect(aireCommune(toutes[i] as Forme, toutes[k] as Forme, t)).toBeLessThan(1e-6);
  });

  it('pose toujours au moins autant que le simple', () => {
    const cas: Array<[string, readonly string[]]> = [
      [rect(40, 40, 100, 80), ['f1']], [etoile(80, 80, 50, 20), ['f1']], [rect(40, 40, 60, 60) + rect(200, 200, 150, 90, '#2e7d32'), ['f1']],
      ['<circle cx="60" cy="60" r="40" fill="#c81e28"/>', ['f1']]
    ];
    for (const [corps, ids] of cas) for (const rotation of [false, true]) {
      const d = lire(corps);
      const s = placerSurFeuille(d, ids, FEUILLE, options({ quantite: 'remplir', rotation }));
      const a = placerSurFeuille(d, ids, FEUILLE, options({ quantite: 'remplir', rotation, optimisation: 'avancee' }));
      expect(a.copies, corps + ' ' + rotation).toBeGreaterThanOrEqual(s.copies);
    }
  });

  it('loge des copies dans l espace libre autour des formes deja posees, que leur boite aurait perdu', () => {
    // Un grand rectangle et une grande etoile deja poses ; de petites etoiles a ranger dans ce qui reste.
    const d = lire(etoile(30, 30, 20, 8, '#c81e28') + rect(20, 300, 520, 200, '#2e7d32') + etoile(300, 150, 140, 56));
    const simple = placerSurFeuille(d, ['f1'], FEUILLE, options({ quantite: 'remplir', rotation: true }));
    const avancee = placerSurFeuille(d, ['f1'], FEUILLE, options({ quantite: 'remplir', rotation: true, optimisation: 'avancee' }));
    expect(avancee.copies).toBeGreaterThan(simple.copies);
    const t = toleranceBooleen(d), [, grand, etoileFixe] = d.formes as [Forme, Forme, Forme];
    for (const r of [simple, avancee]) {
      for (const f of nouvelles(d, r.dessin)) {
        expect(aireCommune(f, grand, t)).toBeLessThan(1e-6);
        expect(aireCommune(f, etoileFixe, t)).toBeLessThan(1e-6);
      }
    }
    // Le simple garde la boite de l'etoile ; l'avancee pose au moins une copie dans cette boite, entre ses branches.
    const be = boite(etoileFixe);
    expect(nouvelles(d, simple.dessin).some(f => ecartBoites(boite(f), be) < 0)).toBe(false);
    expect(nouvelles(d, avancee.dessin).some(f => ecartBoites(boite(f), be) < 0)).toBe(true);
  });

  it('s arrete au budget d essais et rend le meilleur placement trouve, jamais moins que le simple', () => {
    const d = lire(etoile(70, 70, 60, 24));
    const simple = placerSurFeuille(d, ['f1'], FEUILLE, options({ quantite: 'remplir', rotation: true }));
    const borne = placerSurFeuille(d, ['f1'], FEUILLE, options({ quantite: 'remplir', rotation: true, optimisation: 'avancee' }), 50);
    expect(borne.limite).toBe(true);
    expect(borne.copies).toBe(simple.copies);
    expect(phrasePlacement(borne)).toContain('Le calcul a atteint sa limite');
  });

  it('avance par tranches sans toucher l etat recu, et finit comme d un trait', () => {
    const d = lire(etoile(70, 70, 60, 24));
    const o = options({ quantite: 'remplir', rotation: true, optimisation: 'avancee' });
    const depart = preparerPlacement(d, ['f1'], FEUILLE, o);
    let e = depart;
    while (!e.fini) e = avancerPlacement(e, 300);
    expect(depart.posees.length).toBe(0);
    expect(depart.fini).toBe(false);
    expect(JSON.stringify(finirPlacement(d, e).dessin)).toBe(JSON.stringify(placerSurFeuille(d, ['f1'], FEUILLE, o).dessin));
  });
});
