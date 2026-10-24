import { describe, expect, it } from 'vitest';
import { regionDeChemin } from '../../../src/engine/booleens.js';
import { boiteChemin, ecrireDessin, lireChemin, lireDessin, type Chemin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { decaler, decalerFormes, type OptionsDecalage } from '../../../src/engine/contour/decaler.js';
import { aireDeRegion } from '../../../src/engine/contour/region.js';
import type { Jonction } from '../../../src/engine/contour/epaissir.js';

const dessin = (corps: string): DessinSvg => {
  const r = lireDessin(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${corps}</svg>`);
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
const chemin = (d: string, distance: number, j: Jonction = 'round', o: OptionsDecalage = {}): Chemin => {
  const r = decaler(lireChemin(d), distance, j, { tolerance: 0.005, ...o });
  if ('erreur' in r) throw new Error(r.erreur);
  return r.chemin;
};
const aire = (d: Chemin): number => aireDeRegion(regionDeChemin(d, 'nonzero', 0.001));
const CARRE = 'M50 50h40v40h-40z';

describe('decaler : un chemin ferme', () => {
  it('vers l exterieur, la jonction fait l aire du coin : pointe, arc, biseau', () => {
    expect(aire(chemin(CARRE, 5, 'miter'))).toBeCloseTo(50 * 50, 1);
    expect(aire(chemin(CARRE, 5, 'bevel'))).toBeCloseTo(1600 + 4 * 40 * 5 + 4 * 12.5, 1);
    const ronde = aire(chemin(CARRE, 5, 'round'));
    expect(ronde).toBeGreaterThan(1600 + 800 + Math.PI * 25 - 0.2);
    expect(ronde).toBeLessThan(1600 + 800 + Math.PI * 25 + 0.01);
  });

  it('vers l interieur, les coins restent francs quelle que soit la jonction', () => {
    for (const j of ['miter', 'round', 'bevel'] as const) expect(aire(chemin(CARRE, -5, j))).toBeCloseTo(30 * 30, 1);
  });

  it('un decalage de d puis de -d rend le carre (aux coins arrondis pres)', () => {
    const aller = chemin(CARRE, 5, 'miter'), retour = chemin(ecrire(aller), -5, 'miter');
    expect(boiteChemin(retour)).toEqual({ x: 50, y: 50, l: 40, h: 40 });
  });

  it('un cercle decale devient un cercle de rayon r + d', () => {
    const d = chemin('M100 100m-30 0a30 30 0 1 0 60 0a30 30 0 1 0 -60 0z', 10);
    expect(aire(d)).toBeGreaterThan(Math.PI * 1600 * 0.998);
    expect(aire(d)).toBeLessThan(Math.PI * 1600 * 1.002);
    const dedans = chemin('M100 100m-30 0a30 30 0 1 0 60 0a30 30 0 1 0 -60 0z', -10);
    expect(aire(dedans)).toBeGreaterThan(Math.PI * 400 * 0.995);
    expect(aire(dedans)).toBeLessThan(Math.PI * 400 * 1.002);
  });

  it('un coin rentrant se resout seul : aire d un L = A + P d + (convexes - rentrants) d2', () => {
    const L = 'M0 0h60v20h-40v40h-20z';
    // Aire 2000, perimetre 240, cinq coins saillants et un rentrant : 2000 + 240 d + 4 d2.
    expect(aire(chemin(L, 2, 'miter'))).toBeCloseTo(2000 + 480 + 16, 1);
    expect(aire(chemin(L, -2, 'miter'))).toBeCloseTo(2000 - 480 + 16, 1);
  });

  it('un trou se referme quand la distance depasse son rayon, et grandit vers l interieur', () => {
    const anneau = 'M20 20h100v100h-100zM60 60v20h20v-20z';
    const a = aire(lireChemin(anneau));
    expect(a).toBeCloseTo(10000 - 400, 3);
    // Le trou de 20 x 20 disparait a partir de 10 vers l'exterieur.
    expect(aire(chemin(anneau, 11, 'miter'))).toBeCloseTo(122 * 122, 1);
    // Vers l'interieur le trou grandit : (20 + 2d)^2 de moins.
    expect(aire(chemin(anneau, -3, 'miter'))).toBeCloseTo(94 * 94 - 26 * 26, 1);
  });

  it('suit la regle de la forme : pair-impair creuse un recouvrement que nonzero remplit', () => {
    const deux = 'M0 0h60v60h-60zM30 30h60v60h-60z';
    // Union : aire 6300, perimetre 360, six coins saillants et deux rentrants ; le recouvrement (30 x 30) est un trou en pair-impair.
    expect(aire(chemin(deux, 0.5, 'miter'))).toBeCloseTo(6300 + 180 + 1, 1);
    expect(aire(chemin(deux, 0.5, 'miter', { regle: 'evenodd' }))).toBeCloseTo(6481 - 29 * 29, 1);
  });

  it('la limite de pointe biseaute les angles aigus', () => {
    const pointe = 'M0 0L100 10L0 20z';
    const sans = aire(chemin(pointe, 3, 'miter', { limite: 100 })), avec = aire(chemin(pointe, 3, 'miter', { limite: 2 }));
    expect(sans).toBeGreaterThan(avec);
  });
});

describe('decaler : collapse, ouverts, refus', () => {
  it('un decalage interieur plus grand que la forme ne laisse rien, et le dit', () => {
    const r = decaler(lireChemin(CARRE), -25, 'miter', { tolerance: 0.01 });
    expect(r).toEqual({ erreur: expect.stringContaining('dépasse la forme'), vide: true });
  });

  it('un tracé ouvert est entoure : ses cotes a la distance, ses bouts ronds', () => {
    const d = chemin('M20 100h100', 8);
    expect(aire(d)).toBeGreaterThan(100 * 16 + Math.PI * 64 - 0.5);
    expect(aire(d)).toBeLessThan(100 * 16 + Math.PI * 64 + 0.01);
  });

  it('refuse un decalage rentrant sur un tracé ouvert, en le disant', () => {
    expect(decaler(lireChemin('M0 0h50'), -3, 'round')).toEqual({ erreur: expect.stringContaining('ouvert') });
  });

  it('une distance nulle rend le meme chemin', () => {
    const d = lireChemin(CARRE);
    expect(decaler(d, 0, 'round')).toEqual({ chemin: d });
  });
});

describe('decalerFormes', () => {
  const svg = '<path d="M20 20h40v40h-40z" fill="#c81e28" stroke="#000" stroke-width="3"/><path d="M100 20h20v20h-20z" fill="#1428a0"/><path d="M150 20L190 20" stroke="#222" stroke-width="2" fill="none"/>';

  it('decale les formes choisies, garde leur style et leur place', () => {
    const d = dessin(svg);
    const r = decalerFormes(d, ['f1'], 5, 'miter');
    expect(r.decalees).toBe(1);
    expect(r.dessin.formes.map(f => f.id)).toEqual(['f1', 'f2', 'f3']);
    expect(boiteChemin(r.dessin.formes[0]?.d ?? [])).toEqual({ x: 15, y: 15, l: 50, h: 50 });
    expect(r.dessin.formes[0]?.contour).toBe('#000000');
    expect(r.dessin.formes[1]).toBe(d.formes[1]);
  });

  it('retire une forme qui s efface et la nomme', () => {
    const r = decalerFormes(dessin(svg), ['f2'], -30, 'miter');
    expect(r.retirees).toEqual(['f2']);
    expect(r.dessin.formes.map(f => f.id)).toEqual(['f1', 'f3']);
  });

  it('refuse un decalage rentrant sur une ligne et rend le meme dessin', () => {
    const d = dessin(svg);
    const r = decalerFormes(d, ['f3'], -2, 'round');
    expect(r.dessin).toBe(d);
    expect(r.erreur).toContain('ouvert');
  });

  it('est deterministe', () => {
    const d = dessin(svg);
    expect(ecrireDessin(decalerFormes(d, ['f1', 'f2'], 4, 'round', { lisser: true }).dessin, 3)).toBe(ecrireDessin(decalerFormes(d, ['f1', 'f2'], 4, 'round', { lisser: true }).dessin, 3));
  });
});

/** Un chemin ecrit puis relu : le decalage suivant part du texte, comme dans l'editeur. */
function ecrire(d: Chemin): string {
  return d.map(c => c.c + c.p.join(' ')).join('');
}
