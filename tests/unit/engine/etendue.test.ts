import { describe, expect, it } from 'vitest';
import { ajusterPlan, boiteAvecTrait, lireDessin, type DessinSvg, type Forme } from '../../../src/engine/editionSvg.js';
import { pointeDeJonction } from '../../../src/engine/edition/etendue.js';
import { au } from '../../../src/util/tableaux.js';

const dessin = (corps: string): DessinSvg => {
  const r = lireDessin('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' + corps + '</svg>');
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
const premiere = (d: DessinSvg): Forme => au(d.formes, 0);
const boite = (corps: string) => {
  const b = boiteAvecTrait(premiere(dessin(corps)));
  if (!b) throw new Error('une boite');
  return b;
};
const dedans = (vb: DessinSvg['vb'], x: number, y: number) => x >= vb[0] - 1e-9 && x <= vb[0] + vb[2] + 1e-9 && y >= vb[1] - 1e-9 && y <= vb[1] + vb[3] + 1e-9;
const rad = (deg: number) => (deg * Math.PI) / 180;

describe('boiteAvecTrait : l etendue du contour', () => {
  it('rend la boite d avant, au bit pres, pour un trait sans pointe ni bout carre', () => {
    expect(boite('<path d="M10 20 L50 20 L50 60" fill="none" stroke="#000" stroke-width="6" stroke-linecap="round"/>')).toEqual({ x: 7, y: 17, l: 46, h: 46 });
    const f = premiere(dessin('<path d="M10.1 20.3 L50.7 20.9 L50 60" fill="none" stroke="#000" stroke-width="5.3"/>'));
    const brut = boiteAvecTrait({ ...f, contour: null });
    const e = f.epaisseur / 2;
    expect(brut).not.toBeNull();
    expect(boiteAvecTrait(f)).toEqual(brut && { x: brut.x - e, y: brut.y - e, l: brut.l + 2 * e, h: brut.h + 2 * e });
  });

  it('compte la pointe d une jonction aigue dont le rapport tient sous la limite', () => {
    // Angle de 40 degres au sommet : rapport 1 / sin(20 deg) = 2,92, sous la limite de 4.
    const h = 100 * Math.tan(rad(20));
    const corps = `<path d="M0 0 L100 ${h} L0 ${2 * h}" fill="none" stroke="#000" stroke-width="4" stroke-linejoin="miter"/>`;
    const pointe = 100 + 2 / Math.sin(rad(20));
    const b = boite(corps);
    expect(b.x + b.l).toBeCloseTo(pointe, 9);
    expect(pointe).toBeGreaterThan(102);
    expect(dedans(ajusterPlan(dessin(corps), 0).vb, pointe, h)).toBe(true);
  });

  it('biseaute au-dela de la limite, et une limite plus haute rend la pointe', () => {
    const h = 100 * Math.tan(rad(5));
    const trait = (limite: string) => `<path d="M0 0 L100 ${h} L0 ${2 * h}" fill="none" stroke="#000" stroke-width="4" stroke-linejoin="miter"${limite}/>`;
    const b4 = boite(trait(''));
    expect(b4.x + b4.l).toBe(102);
    const b20 = boite(trait(' stroke-miterlimit="20"'));
    expect(b20.x + b20.l).toBeCloseTo(100 + 2 / Math.sin(rad(5)), 9);
  });

  it('ne compte aucune pointe pour une jonction ronde ou biseautee', () => {
    const h = 100 * Math.tan(rad(20));
    for (const j of ['round', 'bevel']) {
      const b = boite(`<path d="M0 0 L100 ${h} L0 ${2 * h}" fill="none" stroke="#000" stroke-width="4" stroke-linejoin="${j}"/>`);
      expect(b.x + b.l).toBe(102);
    }
  });

  it('compte la pointe d une fermeture (la jonction du dernier cote au premier)', () => {
    // Triangle fin : le sommet (0, 50) est aigu, joint par la fermeture.
    const b = boite('<path d="M0 50 L100 40 L100 60 Z" fill="none" stroke="#000" stroke-width="2" stroke-linejoin="miter" stroke-miterlimit="12"/>');
    expect(b.x).toBeLessThan(-1);
  });

  it('prolonge un bout carre le long de sa tangente, coins compris', () => {
    // Diagonale a 45 degres, epaisseur 10 : les coins du bout sortent de e racine de 2 en x ou en y.
    const corps = '<path d="M20 20 L50 50" fill="none" stroke="#000" stroke-width="10" stroke-linecap="square"/>';
    const b = boite(corps), e = 5, s = e * Math.SQRT1_2;
    expect(b.x + b.l).toBeCloseTo(50 + 2 * s, 9);
    expect(b.y + b.h).toBeCloseTo(50 + 2 * s, 9);
    expect(b.x).toBeCloseTo(20 - 2 * s, 9);
    expect(b.x).toBeLessThan(20 - e);
    const vb = ajusterPlan(dessin(corps), 0).vb;
    for (const [x, y] of [[50, 50 + 2 * s], [50 + 2 * s, 50], [20, 20 - 2 * s], [20 - 2 * s, 20]] as const) expect(dedans(vb, x, y)).toBe(true);
  });

  it('garde la demi-epaisseur pour un bout rond, et elargit de e racine de 2 un bout carre pointille', () => {
    const base = '<path d="M20 20 L50 50" fill="none" stroke="#000" stroke-width="10"';
    expect(boite(base + ' stroke-linecap="round"/>')).toEqual({ x: 15, y: 15, l: 40, h: 40 });
    const p = boite(base + ' stroke-linecap="square" stroke-dasharray="4 4"/>'), g = 5 * Math.SQRT2;
    expect(p.x).toBeCloseTo(20 - g, 9);
    expect(p.x + p.l).toBeCloseTo(50 + g, 9);
  });

  it('prend la tangente d une courbe pour le bout carre, pas sa corde', () => {
    // Tangente de depart (0, 1) : le bout sort vers le haut de e, et ses coins de e de chaque cote en x.
    const b = boite('<path d="M0 0 C0 40 40 40 40 0" fill="none" stroke="#000" stroke-width="10" stroke-linecap="square"/>');
    expect(b.y).toBeLessThanOrEqual(-5);
    expect(b.x).toBeLessThanOrEqual(-5);
  });

  it('ne compte rien pour une forme sans contour', () => {
    expect(boite('<path d="M10 10 L50 10 L50 50Z" fill="#c81e28" stroke-linejoin="miter"/>')).toEqual({ x: 10, y: 10, l: 40, h: 40 });
  });
});

describe('pointeDeJonction : la formule', () => {
  it('donne e / sin(theta / 2) du sommet, du cote oppose a la bissectrice', () => {
    // Virage a angle droit (theta = 90 degres) : la pointe est a e racine de 2, au coin exterieur.
    const p = pointeDeJonction([0, 0], [1, 0], [0, 1], 3, 4);
    expect(p?.[0]).toBeCloseTo(3, 12);
    expect(p?.[1]).toBeCloseTo(-3, 12);
    expect(Math.hypot(...(p ?? [0, 0]))).toBeCloseTo(3 * Math.SQRT2, 12);
  });

  it('rend null pour un trait droit, un demi-tour et un rapport au-dessus de la limite', () => {
    expect(pointeDeJonction([0, 0], [1, 0], [1, 0], 3, 4)).toBeNull();
    expect(pointeDeJonction([0, 0], [1, 0], [-1, 0], 3, 4)).toBeNull();
    expect(pointeDeJonction([0, 0], [1, 0], [Math.cos(2.8), Math.sin(2.8)], 3, 4)).toBeNull();
  });
});

describe('ajusterPlan : le trait', () => {
  it('garde les anciens chiffres pour un trait ordinaire', () => {
    expect(ajusterPlan(dessin('<path d="M10 20h30v30z" fill="none" stroke="#000" stroke-width="4"/>'), 0).vb).toEqual([8, 18, 34, 34]);
  });
});
