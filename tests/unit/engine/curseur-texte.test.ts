// Le curseur d'un texte saisi sur la toile (ADR-0027) : il tombe exactement entre les lettres composees (memes avances, meme
// crenage, memes ligatures, meme alignement), compte en unites d'un champ de texte, et sait la selection, le pointeur et les
// fleches verticales. Des fontes factices : aucune vraie fonte.

import { describe, expect, it } from 'vitest';
import type { Glyphes, Matrice } from '../../../src/engine/editionSvg.js';
import { composerBloc, type ReglagesBloc } from '../../../src/engine/texte/bloc.js';
import {
  boiteMiseEnPage, curseurAuIndex, dansLeTexte, depuisPlan, indexAuPoint, indexVertical, ligneDe, miseEnPage, motAutour, rectanglesSelection, versPlan, xAuIndex
} from '../../../src/engine/texte/curseur.js';
import { glyphesCarres } from './glyphesFactices.js';

const bloc = (texte: string, r: Partial<ReglagesBloc> = {}): ReglagesBloc => ({ texte, taille: 10, interlettrage: 0, interligne: 1.2, alignement: 'gauche', ligatures: false, ...r });
/** Une fonte qui lie « fi » en une glyphe de 1000 unites. */
const glyphesLies: Glyphes = { ...glyphesCarres, avance: c => (c === 'fi' ? 1000 : 600), ligature: (cars, i) => (cars[i] === 'f' && cars[i + 1] === 'i' ? 2 : 0) };

describe('la mise en page du curseur', () => {
  it('pose un curseur devant chaque caractere et un a la fin, d une avance a l autre', () => {
    const m = miseEnPage(bloc('AB'), glyphesCarres);
    expect(m.lignes).toEqual([{ debut: 0, fin: 2, base: 0, xs: [0, 6, 12] }]);
    expect(m.longueur).toBe(2);
  });

  it('suit le crenage, l interlettrage (sans celui qui suivrait le dernier) et l alignement', () => {
    expect(miseEnPage(bloc('AV'), glyphesCarres).lignes[0]?.xs).toEqual([0, 5, 11]);
    expect(miseEnPage(bloc('AB', { interlettrage: 0.1 }), glyphesCarres).lignes[0]?.xs).toEqual([0, 7, 13]);
    expect(miseEnPage(bloc('AB', { alignement: 'centre' }), glyphesCarres).lignes[0]?.xs).toEqual([-6, 0, 6]);
    expect(miseEnPage(bloc('AB', { alignement: 'droite' }), glyphesCarres).lignes[0]?.xs).toEqual([-12, -6, 0]);
  });

  it('tombe exactement au debut de chaque lettre composee, quel que soit l alignement', () => {
    for (const alignement of ['gauche', 'centre', 'droite'] as const) {
      const t = bloc('WAVE\nAVA', { alignement, interlettrage: 0.05 }), m = miseEnPage(t, glyphesCarres), lettres = composerBloc(t, glyphesCarres);
      const debuts = m.lignes.flatMap(l => l.xs.slice(0, -1));
      expect(lettres).toHaveLength(debuts.length);
      lettres.forEach((l, i) => expect(l.d[0]?.p[0]).toBeCloseTo(debuts[i] ?? NaN, 3));
    }
  });

  it('descend d un interligne a chaque ligne, une ligne vide comprise', () => {
    const m = miseEnPage(bloc('AB\n\nC'), glyphesCarres);
    expect(m.lignes.map(l => [l.debut, l.fin, l.base])).toEqual([[0, 2, 0], [3, 3, 12], [4, 5, 24]]);
    expect(m.lignes[1]?.xs).toEqual([0]);
  });

  it('partage l avance d une ligature a parts egales, et compte en unites UTF-16', () => {
    expect(miseEnPage(bloc('fia', { ligatures: true }), glyphesLies).lignes[0]?.xs).toEqual([0, 5, 10, 16]);
    // Une emoji est une paire de substitution : deux unites, un seul curseur au milieu (celui de son debut).
    expect(miseEnPage(bloc('😀a'), glyphesCarres).lignes[0]?.xs).toEqual([0, 0, 6, 12]);
  });
});

describe('le curseur, le pointeur et les fleches', () => {
  const m = miseEnPage(bloc('AB\nC'), glyphesCarres);

  it('trouve la ligne d un index (la fin d une ligne est a elle) et dessine le curseur sur le cadratin', () => {
    expect([0, 2, 3, 4].map(i => ligneDe(m, i))).toEqual([0, 0, 1, 1]);
    expect(curseurAuIndex(m, 1)).toEqual({ x: 6, y1: -8, y2: 2 });
    expect(curseurAuIndex(m, 4)).toEqual({ x: 6, y1: 4, y2: 14 });
    expect(xAuIndex(m, 99)).toBe(6);
  });

  it('rend l index sous un point : la ligne la plus proche, puis le curseur le plus proche', () => {
    expect(indexAuPoint(m, [7, -3])).toBe(1);
    expect(indexAuPoint(m, [10, -3])).toBe(2);
    expect(indexAuPoint(m, [100, 12])).toBe(4);
    expect(indexAuPoint(m, [-50, -40])).toBe(0);
  });

  it('monte et descend a l abscisse voulue ; au-dela, le debut ou la fin du texte', () => {
    expect(indexVertical(m, 2, 1)).toBe(4);
    expect(indexVertical(m, 4, -1)).toBe(1);
    expect(indexVertical(m, 4, -1, 12)).toBe(2);
    expect(indexVertical(m, 1, -1)).toBe(0);
    expect(indexVertical(m, 3, 1)).toBe(4);
  });

  it('dessine une selection par ligne, le retour a la ligne choisi compris ; rien pour une selection vide', () => {
    expect(rectanglesSelection(m, 1, 4)).toEqual([{ x: 6, y: -8, l: 9, h: 10 }, { x: 0, y: 4, l: 6, h: 10 }]);
    expect(rectanglesSelection(m, 4, 1)).toEqual(rectanglesSelection(m, 1, 4));
    expect(rectanglesSelection(m, 2, 2)).toEqual([]);
    expect(boiteMiseEnPage(m)).toEqual({ x: 0, y: -8, l: 12, h: 22 });
  });

  it('passe du repere du texte au plan et retour, matrice tournee comprise ; sait si un point est dans le texte', () => {
    const mat: Matrice = [0, 2, -2, 0, 100, 50];
    const p = versPlan(mat, [3, -4]), q = depuisPlan(mat, p);
    expect(q?.[0]).toBeCloseTo(3, 9);
    expect(q?.[1]).toBeCloseTo(-4, 9);
    expect(depuisPlan([0, 0, 0, 0, 1, 1], [1, 1])).toBeNull();
    expect(dansLeTexte(m, mat, versPlan(mat, [5, 5]))).toBe(true);
    expect(dansLeTexte(m, mat, versPlan(mat, [40, 5]))).toBe(false);
  });

  it('choisit le mot sous l index : lettres, blancs ou ponctuation, jamais un retour a la ligne', () => {
    expect(motAutour('chat noir', 6)).toEqual([5, 9]);
    expect(motAutour('chat noir', 9)).toEqual([5, 9]);
    expect(motAutour('chat  noir', 5)).toEqual([4, 6]);
    expect(motAutour('l’été, déjà', 1)).toEqual([0, 5]);
    expect(motAutour('a\n\nb', 2)).toEqual([2, 2]);
  });
});
