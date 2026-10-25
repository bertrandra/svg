// L'apercu « forme / ligne » d'une police (ADR-0022) : un verdict neutre par nature de police, et deux rendus faits par le
// moteur (des lettres pleines pour la lame, des lignes sans remplissage pour le stylo).

import { describe, expect, it } from 'vitest';
import type { Chemin } from '../../../src/engine/editionSvg.js';
import { apercusTexte, verdictsApercu } from '../../../src/engine/texte/apercu.js';

const carre: Chemin = [{ c: 'M', p: [0, 0] }, { c: 'L', p: [10, 0] }, { c: 'L', p: [10, 10] }, { c: 'L', p: [0, 10] }, { c: 'Z', p: [] }];
const trait: Chemin = [{ c: 'M', p: [0, 0] }, { c: 'L', p: [20, 0] }];

describe('les verdicts de l apercu', () => {
  it('une police a contour : pleine a la decoupe, double trait au stylo', () => {
    expect(verdictsApercu('contour')).toEqual({ forme: 'Lettres pleines : la lame suit leur pourtour.', ligne: 'Au stylo : lettres creuses, double trait.' });
  });

  it('une police a trait : epaissie a la decoupe, une seule ligne au stylo', () => {
    expect(verdictsApercu('trait')).toEqual({ forme: 'Police à trait : épaissie pour la découpe.', ligne: 'Une seule ligne : idéale au stylo.' });
  });

  it('ne refuse jamais : chaque verdict est un constat, sans « impossible » ni « refus »', () => {
    for (const n of ['contour', 'trait'] as const) for (const v of Object.values(verdictsApercu(n))) expect(v).not.toMatch(/impossible|refus|interdit|erreur/i);
  });
});

describe('les deux rendus', () => {
  it('une police a contour : la meme forme, pleine puis en ligne', () => {
    const a = apercusTexte(carre, 'contour', 1);
    expect(a.forme).toMatchObject({ d: carre, plein: true });
    expect(a.ligne).toMatchObject({ d: carre, plein: false });
    expect(a.boite).toEqual({ x: 0, y: 0, l: 10, h: 10 });
  });

  it('une police a trait : la ligne telle quelle, et pour la decoupe le trait epaissi en forme pleine', () => {
    const a = apercusTexte(trait, 'trait', 2);
    expect(a.ligne).toMatchObject({ d: trait, plein: false });
    expect(a.forme.plein).toBe(true);
    expect(a.forme.d.some(c => c.c === 'Z')).toBe(true);
    // Le trait de 20 epaissi de 2 (bouts ronds) : une boite d'environ 22 sur 2.
    const ys = a.forme.d.flatMap(c => c.p.filter((_, i) => i % 2 === 1));
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2, 1);
  });
});
