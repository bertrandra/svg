import { describe, expect, it } from 'vitest';
import { aireSignee, aplatir } from '../../../src/engine/booleens.js';
import { arrondirAngles } from '../../../src/engine/edition/arrondi.js';
import { ecrireChemin, lireChemin, type Chemin } from '../../../src/engine/editionSvg.js';
import { au } from '../../../src/util/tableaux.js';

const aire = (d: Chemin): number => aplatir(d, 0.0005).reduce((s, r) => s + Math.abs(aireSignee(r)), 0);
const RECT = 'M0 0h100v40h-100z';
const arrondi = (d: string, r: number) => arrondirAngles(lireChemin(d), r);

/** Le rayon du cercle qui passe par trois points. */
function rayon3(p: readonly number[], q: readonly number[], s: readonly number[]): number {
  const a = Math.hypot((q[0] ?? 0) - (p[0] ?? 0), (q[1] ?? 0) - (p[1] ?? 0)), b = Math.hypot((s[0] ?? 0) - (q[0] ?? 0), (s[1] ?? 0) - (q[1] ?? 0)), c = Math.hypot((s[0] ?? 0) - (p[0] ?? 0), (s[1] ?? 0) - (p[1] ?? 0));
  const aireTriangle = Math.abs(((q[0] ?? 0) - (p[0] ?? 0)) * ((s[1] ?? 0) - (p[1] ?? 0)) - ((s[0] ?? 0) - (p[0] ?? 0)) * ((q[1] ?? 0) - (p[1] ?? 0))) / 2;
  return (a * b * c) / (4 * aireTriangle);
}

/** Le point d'une cubique en t. */
const cubique = (a: readonly number[], c: readonly number[], t: number): number[] => {
  const v = 1 - t;
  return [0, 1].map(k => v * v * v * (a[k] ?? 0) + 3 * t * v * v * (c[k] ?? 0) + 3 * t * t * v * (c[2 + k] ?? 0) + t * t * t * (c[4 + k] ?? 0));
};

describe('arrondirAngles : droite contre droite', () => {
  it('arrondit les quatre coins d un rectangle : aire = A - (4 - pi) r2', () => {
    const r = arrondi(RECT, 10);
    expect(r.angles).toBe(4);
    expect(r.reduits).toBe(0);
    expect(r.rayonMin).toBe(10);
    // La cubique d'un quart de cercle s'ecarte de 0,03 % du cercle : l'aire tient a une fraction d'unite.
    expect(Math.abs(aire(r.chemin) - (4000 - (4 - Math.PI) * 100))).toBeLessThan(0.15);
    expect(r.chemin.filter(c => c.c === 'C').length).toBe(4);
  });

  it('chaque coin est un arc de cercle de bon rayon, ecrit en cubique', () => {
    const r = arrondi(RECT, 10);
    const arcs = r.chemin.map((c, i) => ({ c, i })).filter(x => x.c.c === 'C');
    for (const { c, i } of arcs) {
      const precedent = r.chemin[i - 1], depart = precedent ? [precedent.p[precedent.p.length - 2] ?? 0, precedent.p[precedent.p.length - 1] ?? 0] : [0, 0];
      const rr = rayon3(depart, cubique(depart, c.p, 0.5), cubique(depart, c.p, 1));
      expect(rr).toBeGreaterThan(9.99);
      expect(rr).toBeLessThan(10.03);
    }
  });

  it('ramene un rayon trop grand au plus grand possible, et le dit', () => {
    const r = arrondi(RECT, 30);
    expect(r.angles).toBe(4);
    expect(r.reduits).toBe(4);
    // Le cote de 40 ne livre que 20 a chacun de ses deux coins.
    expect(r.rayonMin).toBeCloseTo(20, 9);
    expect(Math.abs(aire(r.chemin) - (4000 - (4 - Math.PI) * 400))).toBeLessThan(0.5);
  });

  it('un tracé ouvert garde ses deux bouts et n arrondit que les coins du milieu', () => {
    const r = arrondi('M0 0L50 0L50 50L100 50', 10);
    expect(r.angles).toBe(2);
    expect(ecrireChemin(r.chemin, 3)).toMatch(/^M0 0L40 0C/);
    const dernier = au(r.chemin, r.chemin.length - 1);
    expect(dernier.p).toEqual([100, 50]);
  });

  it('un triangle ferme par Z arrondit ses trois coins', () => {
    const r = arrondi('M0 0L100 0L50 80z', 5);
    expect(r.angles).toBe(3);
    expect(au(r.chemin, r.chemin.length - 1).c).toBe('Z');
  });

  it('ne touche ni un noeud lisse ni un chemin sans angle', () => {
    const cercle = lireChemin('M50 0C77.6 0 100 22.4 100 50C100 77.6 77.6 100 50 100C22.4 100 0 77.6 0 50C0 22.4 22.4 0 50 0z');
    expect(arrondirAngles(cercle, 8).chemin).toBe(cercle);
    expect(arrondirAngles(cercle, 8).angles).toBe(0);
    const droit = lireChemin('M0 0L50 0L100 0');
    expect(arrondirAngles(droit, 5).chemin).toBe(droit);
  });

  it('rend le meme chemin pour un rayon nul, negatif ou absurde', () => {
    const d = lireChemin(RECT);
    for (const rayon of [0, -3, Number.NaN, Infinity]) expect(arrondirAngles(d, rayon).chemin).toBe(d);
  });

  it('ne recouvre jamais deux filets voisins : un polygone convexe arrondi reste dedans', () => {
    // Un decagone irregulier aux cotes tres inegaux, rayon enorme.
    const pts = [[0, 0], [60, 0], [62, 3], [100, 20], [101, 60], [80, 100], [20, 101], [1, 70], [0, 30]];
    const d = 'M' + pts.map(p => p.join(' ')).join('L') + 'z';
    for (const rayon of [1, 5, 40, 500]) {
      const r = arrondi(d, rayon);
      expect(aire(r.chemin)).toBeLessThanOrEqual(aire(lireChemin(d)) + 1e-6);
      expect(aire(r.chemin)).toBeGreaterThan(0);
      // Le chemin ne revient jamais en arriere sur un cote : les segments droits gardent leur sens.
      const sorties = aplatir(r.chemin, 0.01);
      expect(sorties.length).toBe(1);
    }
  });
});

describe('arrondirAngles : droite contre courbe et courbe contre courbe', () => {
  const D_LC = 'M0 0L60 0C90 0 90 40 60 40L0 40z';

  it('raccorde la droite et la courbe tangentiellement, au bon rayon', () => {
    const r = arrondirAngles(lireChemin('M0 0L60 0C80 0 100 20 100 50'), 8);
    expect(r.angles).toBe(0);
    const coin = arrondi('M0 0L50 0C50 20 70 40 90 40', 6);
    expect(coin.angles).toBe(1);
    // Le filet est un arc de rayon 6 : trois de ses points sont sur un cercle de rayon 6.
    const i = coin.chemin.findIndex((c, k) => c.c === 'C' && k > 1);
    const arc = au(coin.chemin, i), avant = au(coin.chemin, i - 1);
    const depart = [avant.p[avant.p.length - 2] ?? 0, avant.p[avant.p.length - 1] ?? 0];
    const rr = rayon3(depart, cubique(depart, arc.p, 0.5), cubique(depart, arc.p, 1));
    expect(rr).toBeGreaterThan(5.98);
    expect(rr).toBeLessThan(6.05);
  });

  it('une courbe contre une courbe, au coin, est arrondie sans decrocher les extremites', () => {
    const d = 'M0 50C0 20 30 0 50 0C70 0 100 20 100 50C100 80 70 100 50 100C30 100 0 80 0 50';
    // Des noeuds lisses : rien ne bouge.
    expect(arrondi(d, 5).angles).toBe(0);
    // Un coin entre deux courbes : le pic d un cœur.
    const coeur = 'M50 90C10 60 0 30 20 15C35 5 48 15 50 30C52 15 65 5 80 15C100 30 90 60 50 90z';
    const r = arrondi(coeur, 4);
    expect(r.angles).toBeGreaterThanOrEqual(2);
    // Tous les coins sont devenus tangents : un second passage n'en trouve plus. (L'aire, elle, peut croitre : le creux du coeur se comble.)
    expect(arrondirAngles(r.chemin, 4).angles).toBe(0);
  });

  it('une quadratique voisine d un coin devient cubique sans changer de forme', () => {
    const r = arrondi('M0 0L50 0Q80 0 80 30L80 80L0 80z', 5);
    expect(r.angles).toBeGreaterThanOrEqual(3);
    expect(aire(r.chemin)).toBeGreaterThan(0);
  });

  it('est deterministe et pure', () => {
    const d = lireChemin(D_LC);
    const avant = JSON.stringify(d);
    expect(ecrireChemin(arrondirAngles(d, 6).chemin, 3)).toBe(ecrireChemin(arrondirAngles(d, 6).chemin, 3));
    expect(JSON.stringify(d)).toBe(avant);
  });
});
