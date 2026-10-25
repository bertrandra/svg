// Le trace « Median » d'un texte (ADR-0027) : la ligne au milieu du trait d'une lettre, calculee par la chaine de la ligne
// mediane (ADR-0021) sur sa glyphe rasterisee en pur. Un « I » donne un trait droit, un « O » un anneau ferme ; le calcul est
// deterministe et memorise par glyphe et par police ; un texte vivant le garde en `data-ed-trace`, le relit, et une police a
// trait unique garde sa ligne native.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ecrireDessin, lireDessin, type CommandeGlyphe, type DessinSvg, type Glyphes } from '../../../src/engine/editionSvg.js';
import { cheminDuTexte, glyphesDuTexte } from '../../../src/engine/texte/bloc.js';
import { glyphesMedians, medianeDeContour, medianeDuCaractere, PIXELS_PAR_EM } from '../../../src/engine/texte/mediane.js';
import { avecTrace, creerTexte, natureDuTexte, nouveauTexte, peintureDuTexte } from '../../../src/engine/texte/vivant.js';
import { lirePolice } from '../../../src/io/polices.js';
import { glyphesCarres } from './glyphesFactices.js';

/** Un rectangle, dans le sens donne (une fonte TrueType tourne ses trous a l'envers de ses contours). */
const rect = (x: number, y: number, l: number, h: number, envers = false): CommandeGlyphe[] => {
  const pts: Array<[number, number]> = [[x, y], [x + l, y], [x + l, y + h], [x, y + h]];
  const tour = envers ? [...pts].reverse() : pts;
  return [{ type: 'M', x: tour[0]?.[0] ?? 0, y: tour[0]?.[1] ?? 0 }, ...tour.slice(1).map(([a, b]): CommandeGlyphe => ({ type: 'L', x: a, y: b })), { type: 'Z' }];
};
/** Une fonte factice : « I », une barre de 80 sur 700 ; « O », un cadre de 500 sur 700 epais de 80, son trou a l'envers. */
const glyphesIO: Glyphes = {
  ...glyphesCarres,
  contour: (c, x, y, t) => {
    const k = t / 1000, d = c === 'I' ? rect(0, -700, 80, 700) : c === 'O' ? [...rect(0, -700, 500, 700), ...rect(80, -620, 340, 540, true)] : [];
    return d.map(m => ({ ...m, ...(m.x !== undefined ? { x: x + m.x * k } : {}), ...(m.y !== undefined ? { y: y + m.y * k } : {}) }));
  }
};

const points = (d: readonly { c: string; p: readonly number[] }[]) => d.flatMap(c => c.p.reduce<number[][]>((r, v, i) => (i % 2 ? [...r.slice(0, -1), [...(r[r.length - 1] ?? []), v]] : [...r, [v]]), []));

describe('la ligne mediane d une glyphe', () => {
  it('d un « I » : un seul trait ouvert, vertical, au milieu de la barre', () => {
    const d = medianeDuCaractere(glyphesIO, 'I');
    expect(d.filter(c => c.c === 'M')).toHaveLength(1);
    expect(d.some(c => c.c === 'Z')).toBe(false);
    const pts = points(d), xs = pts.map(p => p[0] ?? 0), ys = pts.map(p => p[1] ?? 0);
    // La barre fait 16 pixels de large (80 unites a 200 pixels par cadratin) : son milieu est a 8, au demi-pixel du squelette pres.
    for (const x of xs) expect(Math.abs(x - 8)).toBeLessThanOrEqual(0.5);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.8 * 140 - 16);
  });

  it('d un « O » a trou : un anneau ferme, au milieu de son epaisseur', () => {
    const d = medianeDuCaractere(glyphesIO, 'O');
    expect(d.filter(c => c.c === 'M')).toHaveLength(1);
    expect(d[d.length - 1]?.c).toBe('Z');
    const xs = points(d).map(p => p[0] ?? 0);
    // Le cadre va de 0 a 100 pixels, epais de 16 : la ligne passe vers 8 et 92.
    expect(Math.abs(Math.min(...xs) - 8)).toBeLessThanOrEqual(1);
    expect(Math.abs(Math.max(...xs) - 92)).toBeLessThanOrEqual(1);
  });

  it('rien pour une glyphe sans surface, deterministe, memorisee par glyphe et par police', () => {
    expect(medianeDeContour([])).toEqual([]);
    expect(medianeDuCaractere(glyphesIO, ' ')).toEqual([]);
    const a = medianeDeContour(glyphesIO.contour('O', 0, 0, PIXELS_PAR_EM)), b = medianeDeContour(glyphesIO.contour('O', 0, 0, PIXELS_PAR_EM));
    expect(a).toEqual(b);
    expect(medianeDuCaractere(glyphesIO, 'O')).toBe(medianeDuCaractere(glyphesIO, 'O'));
    expect(glyphesMedians(glyphesIO)).toBe(glyphesMedians(glyphesIO));
  });

  it('d une vraie lettre d Inter : un « l » est un trait, un « o » un anneau, en moins d un dixieme de seconde', () => {
    const octets = readFileSync(resolve(__dirname, '../../../node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'));
    const inter = lirePolice('inter', 'Inter', octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength));
    if (!inter) throw new Error('Inter illisible');
    const debut = performance.now();
    const l = medianeDuCaractere(inter.glyphes, 'l'), o = medianeDuCaractere(inter.glyphes, 'o');
    expect(performance.now() - debut).toBeLessThan(500);
    expect(l.filter(c => c.c === 'M')).toHaveLength(1);
    expect(l.some(c => c.c === 'Z')).toBe(false);
    expect(o[o.length - 1]?.c).toBe('Z');
  });
});

describe('le trace median d un texte vivant', () => {
  const police = { id: 'inter', version: '0123456789abcd' };
  const t = avecTrace(nouveauTexte('IO', police, 20, [1, 0, 0, 1, 10, 50]), true);

  it('se compose avec les memes avances, en lignes ; une police a trait unique garde sa ligne et ne prend pas le trace', () => {
    expect(t.trace).toBe('median');
    expect(natureDuTexte(t)).toBe('trait');
    expect(glyphesDuTexte(t, glyphesIO)).toBe(glyphesMedians(glyphesIO));
    expect(glyphesDuTexte(avecTrace(t, false), glyphesIO)).toBe(glyphesIO);
    const d = cheminDuTexte(t, glyphesIO);
    expect(d.filter(c => c.c === 'M')).toHaveLength(2);
    const trait = avecTrace(nouveauTexte('IO', { id: 'ems-readability' }, 20, [1, 0, 0, 1, 0, 0]), true);
    expect(trait.trace).toBeUndefined();
    expect(avecTrace(t, false).trace).toBeUndefined();
    expect('trace' in avecTrace(t, false)).toBe(false);
  });

  it('s ecrit en data-ed-trace="median", sans fond, et se relit tel quel ; un texte plein n ecrit rien de plus', () => {
    const vide: DessinSvg = { vb: [0, 0, 200, 100], formes: [] };
    const r = creerTexte(vide, t, cheminDuTexte(t, glyphesIO), peintureDuTexte(natureDuTexte(t), { remplissage: '#000000', contour: null, epaisseur: 1 }, 1));
    const svg = ecrireDessin(r.dessin);
    expect(svg).toContain(' data-ed-trace="median" data-ed-matrice="1 0 0 1 10 50"');
    expect(svg).toContain('fill="none"');
    const relu = lireDessin(svg);
    if ('erreur' in relu) throw new Error(relu.erreur);
    expect(relu.dessin.formes[0]?.texte?.trace).toBe('median');
    expect(ecrireDessin(relu.dessin)).toBe(svg);
    const plein = avecTrace(t, false);
    expect(ecrireDessin(creerTexte(vide, plein, cheminDuTexte(plein, glyphesIO), peintureDuTexte('contour', { remplissage: '#000000', contour: null, epaisseur: 1 }, 1)).dessin)).not.toContain('data-ed-trace');
    // Une valeur inconnue rend le texte illisible : il reste en contours, et c'est dit.
    const faux = lireDessin(svg.replace('data-ed-trace="median"', 'data-ed-trace="gras"'));
    if ('erreur' in faux) throw new Error(faux.erreur);
    expect(faux.dessin.formes[0]?.texte).toBeUndefined();
  });
});
