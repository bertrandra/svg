// Vectoriser un texte vivant (ADR-0022) : trois modes, des aires qui se conservent, des lettres soudees d'un seul tenant,
// des traces ouverts qui restent ouverts, et une coupe par parties quand la fonte n'est pas la.

import { describe, expect, it } from 'vitest';
import type { Chemin, DessinSvg, Glyphes, TexteVivant } from '../../../src/engine/editionSvg.js';
import { regionDeForme } from '../../../src/engine/booleens.js';
import { aireDeRegion } from '../../../src/engine/contour/region.js';
import { cheminDuTexte, lettresDuTexte } from '../../../src/engine/texte/bloc.js';
import { creerTexte, nouveauTexte, peintureDuTexte } from '../../../src/engine/texte/vivant.js';
import { groupesQuiSeTouchent, partiesDe, vectoriserTextes } from '../../../src/engine/texte/vectoriser.js';
import { glyphesCarres } from './glyphesFactices.js';

/** Des lettres de 5 x 7 qui avancent de 4 : chacune chevauche la suivante d'une unite, comme une ecriture liee. */
const liees: Glyphes = { ...glyphesCarres, avance: () => 400 };
/** Un « o » a trou et un « i » en deux morceaux : de quoi eprouver les parties. */
const aTrous: Glyphes = {
  ...glyphesCarres,
  contour: (c, x, y, t) => {
    const k = t / 1000;
    const carre = (x0: number, y0: number, l: number, h: number, sens: 1 | -1) => sens > 0
      ? [{ type: 'M' as const, x: x0, y: y0 }, { type: 'L' as const, x: x0 + l, y: y0 }, { type: 'L' as const, x: x0 + l, y: y0 - h }, { type: 'L' as const, x: x0, y: y0 - h }, { type: 'Z' as const }]
      : [{ type: 'M' as const, x: x0, y: y0 }, { type: 'L' as const, x: x0, y: y0 - h }, { type: 'L' as const, x: x0 + l, y: y0 - h }, { type: 'L' as const, x: x0 + l, y: y0 }, { type: 'Z' as const }];
    if (c === 'o') return [...carre(x, y, 500 * k, 500 * k, 1), ...carre(x + 100 * k, y - 100 * k, 300 * k, 300 * k, -1)];
    if (c === 'i') return [...carre(x, y, 150 * k, 450 * k, 1), ...carre(x, y - 550 * k, 150 * k, 150 * k, 1)];
    return carre(x, y, 500 * k, 700 * k, 1);
  }
};

const vide: DessinSvg = { vb: [0, 0, 200, 100], formes: [] };
function avecTexte(t: string, g: Glyphes, trait = false): { dessin: DessinSvg; texte: TexteVivant } {
  const texte = nouveauTexte(t, { id: trait ? 'ems-readability' : 'inter' }, 10, [1, 0, 0, 1, 10, 50]);
  const r = creerTexte(vide, texte, cheminDuTexte(texte, g), peintureDuTexte(trait ? 'trait' : 'contour', { remplissage: '#c81e28', contour: null, epaisseur: 1 }, 0.5));
  return { dessin: r.dessin, texte };
}
const aire = (d: DessinSvg): number => d.formes.reduce((s, f) => s + aireDeRegion(regionDeForme(f, 0.001)), 0);
const lettres = (_d: DessinSvg, t: TexteVivant, g: Glyphes) => new Map([['f1', lettresDuTexte(t, g).map(l => l.d)]]);

describe('vectoriser un texte', () => {
  it('lettres separees : une forme par lettre, la meme peinture, plus de texte, la premiere garde son identifiant', () => {
    const { dessin, texte } = avecTexte('ABC', glyphesCarres);
    const r = vectoriserTextes(dessin, ['f1'], 'lettres', { lettres: lettres(dessin, texte, glyphesCarres) });
    expect(r.ids).toEqual(['f1', 'f2', 'f3']);
    expect(r.dessin.formes.every(f => !f.texte && f.remplissage === '#c81e28')).toBe(true);
    expect(r.parParties).toBe(0);
    expect(aire(r.dessin)).toBeCloseTo(3 * 5 * 7, 6);
  });

  it('souder les lettres qui se touchent : des lettres liees font une seule forme, d aire l union', () => {
    const { dessin, texte } = avecTexte('AB C', liees);
    const r = vectoriserTextes(dessin, ['f1'], 'souder-touchantes', { lettres: lettres(dessin, texte, liees) });
    // « A » et « B » se chevauchent d'une unite ; l'espace eloigne « C ».
    expect(r.dessin.formes).toHaveLength(2);
    expect(aire({ ...r.dessin, formes: [r.dessin.formes[0] as never] })).toBeCloseTo(2 * 35 - 7, 3);
  });

  it('tout souder : une seule forme, sans double compte des chevauchements', () => {
    const { dessin, texte } = avecTexte('AB C', liees);
    const r = vectoriserTextes(dessin, ['f1'], 'tout', { lettres: lettres(dessin, texte, liees) });
    expect(r.dessin.formes).toHaveLength(1);
    expect(aire(r.dessin)).toBeCloseTo(3 * 35 - 7, 3);
  });

  it('sans fonte, coupe par parties : un trou reste dans sa lettre, le point d un i est une partie a lui', () => {
    const { dessin } = avecTexte('oi', aTrous);
    const r = vectoriserTextes(dessin, ['f1'], 'lettres');
    expect(r.parParties).toBe(1);
    expect(r.dessin.formes).toHaveLength(3);
    expect(aire(r.dessin)).toBeCloseTo(25 - 9 + 1.5 * 4.5 + 1.5 * 1.5, 6);
    expect(partiesDe(r.dessin.formes[0]?.d ?? [], false, 0.001)).toHaveLength(1);
  });

  it('une police a trait reste en traces ouverts, sans fond, et ne s unit jamais', () => {
    const traits: Glyphes = { ...glyphesCarres, avance: () => 400, contour: (_c, x, y, t) => [{ type: 'M', x, y }, { type: 'L', x: x + (t / 1000) * 500, y: y - (t / 1000) * 700 }] };
    const { dessin, texte } = avecTexte('ab c', traits, true);
    expect(dessin.formes[0]?.remplissage).toBeNull();
    for (const mode of ['lettres', 'souder-touchantes', 'tout'] as const) {
      const r = vectoriserTextes(dessin, ['f1'], mode, { lettres: lettres(dessin, texte, traits) });
      expect(r.dessin.formes.every(f => f.remplissage === null && !f.d.some(c => c.c === 'Z')), mode).toBe(true);
      expect(r.dessin.formes.length, mode).toBe(mode === 'lettres' ? 3 : mode === 'tout' ? 1 : 3);
    }
  });

  it('les traces ouverts qui se touchent se soudent bout a bout', () => {
    const morceaux: Chemin[] = [[{ c: 'M', p: [0, 0] }, { c: 'L', p: [10, 0] }], [{ c: 'M', p: [10.2, 0] }, { c: 'L', p: [20, 0] }], [{ c: 'M', p: [30, 0] }, { c: 'L', p: [40, 0] }]];
    expect(groupesQuiSeTouchent(morceaux, true, 0.5, 0.001)).toEqual([[0, 1], [2]]);
  });

  it('ne touche ni aux formes ordinaires ni aux textes verrouilles ; des lettres d une autre version passent par parties', () => {
    const { dessin, texte } = avecTexte('AB', glyphesCarres);
    expect(vectoriserTextes(dessin, ['f9'], 'lettres').dessin).toBe(dessin);
    const verrouille = { ...dessin, formes: dessin.formes.map(f => ({ ...f, verrouille: true })) };
    expect(vectoriserTextes(verrouille, ['f1'], 'lettres').dessin).toBe(verrouille);
    const autre = lettresDuTexte({ ...texte, taille: 11 }, glyphesCarres).map(l => l.d);
    expect(vectoriserTextes(dessin, ['f1'], 'lettres', { lettres: new Map([['f1', autre]]) }).parParties).toBe(1);
  });

  it('est deterministe', () => {
    const { dessin, texte } = avecTexte('ABCD', liees);
    const a = vectoriserTextes(dessin, ['f1'], 'souder-touchantes', { lettres: lettres(dessin, texte, liees), lisser: true });
    const b = vectoriserTextes(dessin, ['f1'], 'souder-touchantes', { lettres: lettres(dessin, texte, liees), lisser: true });
    expect(a.dessin).toEqual(b.dessin);
  });
});
