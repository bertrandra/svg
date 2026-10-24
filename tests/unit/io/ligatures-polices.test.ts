// Les ligatures des fontes embarquees (scripts/polices.mjs), lues telles quelles dans leur table GSUB.
// Ce que chaque fonte porte est constate ici, pas suppose : Inter et Bebas Neue n'ont aucune ligature « liga »
// (Inter range les siennes dans « calt », par des lookups de chainage de type 6 qu'on ne lit pas), les six autres
// lient au moins fi et fl.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'opentype.js';
import { boiteChemin } from '../../../src/engine/editionSvg.js';
import { composer } from '../../../src/engine/texte.js';
import { glyphesDe } from '../../../src/io/polices.js';
import { lireLigaturesGsub } from '../../../src/io/ligaturesGsub.js';

const fonte = (chemin: string) => {
  const o = readFileSync(resolve(__dirname, '../../../node_modules/@expo-google-fonts', chemin));
  const octets = o.buffer.slice(o.byteOffset, o.byteOffset + o.byteLength) as ArrayBuffer;
  const police = parse(octets);
  return { octets, police, glyphes: glyphesDe(police, octets) };
};

const AVEC = [
  ['oswald/500Medium/Oswald_500Medium.ttf', 'Oswald', 5], ['playfair-display/700Bold/PlayfairDisplay_700Bold.ttf', 'Playfair Display gras', 24],
  ['lobster/400Regular/Lobster_400Regular.ttf', 'Lobster', 162], ['pacifico/400Regular/Pacifico_400Regular.ttf', 'Pacifico', 7],
  ['caveat/700Bold/Caveat_700Bold.ttf', 'Caveat gras', 6], ['fredoka/600SemiBold/Fredoka_600SemiBold.ttf', 'Fredoka', 8]
] as const;
const SANS = [['inter/400Regular/Inter_400Regular.ttf', 'Inter'], ['inter/700Bold/Inter_700Bold.ttf', 'Inter gras'], ['bebas-neue/400Regular/BebasNeue_400Regular.ttf', 'Bebas Neue']] as const;

describe('ce que chaque fonte embarquee porte comme ligatures « liga »', () => {
  it.each(AVEC)('%s (%s) : %d ligatures, dont fi et fl', (chemin, _nom, nombre) => {
    const { octets, glyphes } = fonte(chemin);
    expect(lireLigaturesGsub(octets)?.nombre).toBe(nombre);
    expect(glyphes.ligature).toBeTypeOf('function');
    expect(glyphes.ligature?.([...'fi'], 0)).toBe(2);
    expect(glyphes.ligature?.([...'fl'], 0)).toBe(2);
    expect(glyphes.ligature?.([...'ab'], 0)).toBe(0);
  });

  it.each(SANS)('%s (%s) : aucune ligature « liga », donc pas de methode `ligature` (l option n est pas offerte)', chemin => {
    const { octets, glyphes } = fonte(chemin);
    expect(lireLigaturesGsub(octets)).toBeNull();
    expect(glyphes.ligature).toBeUndefined();
  });

  it('sans les octets de la fonte (la bibliotheque seule), aucune ligature n est annoncee', () => {
    const { police } = fonte('playfair-display/700Bold/PlayfairDisplay_700Bold.ttf');
    expect(glyphesDe(police).ligature).toBeUndefined();
  });

  it('Lobster lie aussi des paires de capitales et ft ; Pacifico lie tt ; ffi n existe pas partout', () => {
    const lobster = fonte('lobster/400Regular/Lobster_400Regular.ttf').glyphes, pacifico = fonte('pacifico/400Regular/Pacifico_400Regular.ttf').glyphes;
    expect(lobster.ligature?.([...'Th'], 0)).toBe(2);
    expect(lobster.ligature?.([...'ft'], 0)).toBe(2);
    expect(pacifico.ligature?.([...'tt'], 0)).toBe(2);
    expect(pacifico.ligature?.([...'ffi'], 0)).toBe(2);
    expect(fonte('playfair-display/700Bold/PlayfairDisplay_700Bold.ttf').glyphes.ligature?.([...'ffi'], 0)).toBe(3);
  });
});

describe('composer avec les ligatures d une vraie fonte', () => {
  const g = fonte('playfair-display/700Bold/PlayfairDisplay_700Bold.ttf').glyphes;
  const pose = (t: string, ligatures: boolean, x = 0) => composer(t, g, { taille: 100, x, y: 100, ligatures });
  const bx = (l: { d: Parameters<typeof boiteChemin>[0] }) => boiteChemin(l.d)?.x ?? NaN;

  it.each(AVEC.map(([chemin, nom]) => [chemin, nom] as const))('%s (%s) : « fi » donne 1 forme avec ligature, 2 sans', chemin => {
    const police = fonte(chemin).glyphes;
    const avec = composer('fi', police, { taille: 100, x: 0, y: 100, ligatures: true }), sans = composer('fi', police, { taille: 100, x: 0, y: 100, ligatures: false });
    expect(avec.map(l => l.caractere)).toEqual(['fi']);
    expect(sans.map(l => l.caractere)).toEqual(['f', 'i']);
    expect(avec).toHaveLength(1);
    expect(sans).toHaveLength(2);
    // Le dessin de la ligature n'est pas celui de f suivi de i.
    expect(avec[0]?.d).not.toEqual(sans[0]?.d);
    expect(composer('fi', police, { taille: 100, x: 0, y: 100 })).toEqual(sans);
  });

  it('ffi, ffl, ff et fj : une forme chacune quand la fonte les a', () => {
    expect(pose('ffi', true).map(l => l.caractere)).toEqual(['ffi']);
    expect(pose('ffl', true).map(l => l.caractere)).toEqual(['ffl']);
    expect(pose('ff', true).map(l => l.caractere)).toEqual(['ff']);
    expect(pose('fj', true).map(l => l.caractere)).toEqual(['fj']);
    expect(pose('ffi', false)).toHaveLength(3);
  });

  it('la lettre qui suit part de l avance de la ligature, plus le crenage de la ligature avec elle', () => {
    const k = 100 / g.unitesParEm;
    const apres = pose('fix', true), seule = pose('x', true);
    // `x` seul, pose la ou la ligature l'a laisse : meme dessin.
    const decalage = (g.avance('fi') + g.crenage('fi', 'x')) * k;
    expect(apres).toHaveLength(2);
    expect(bx(au(apres, 1))).toBeCloseTo(bx(au(pose('x', true, decalage), 0)), 2);
    expect(bx(au(apres, 1))).toBeGreaterThan(bx(au(seule, 0)));
  });

  it('la largeur du mot est celle des glyphes : la somme des avances avec ligature, plus les crenages autour d elle', () => {
    const k = 100 / g.unitesParEm;
    const mot = pose('afix', true), a = pose('a', true);
    expect(mot.map(l => l.caractere)).toEqual(['a', 'fi', 'x']);
    const attendu = (g.avance('a') + g.crenage('a', 'fi')) * k;
    // `fi` seul, pose a x = 0, puis decale de ce qui precede.
    const fi = pose('fi', true, attendu);
    expect(bx(au(mot, 1))).toBeCloseTo(bx(au(fi, 0)), 2);
    expect(bx(au(a, 0))).toBeCloseTo(bx(au(mot, 0)), 6);
  });

  it('un blanc, un retour a la ligne ou un interlettrage non nul empeche la ligature', () => {
    expect(pose('f i', true).map(l => l.caractere)).toEqual(['f', 'i']);
    expect(pose('f\ni', true).map(l => l.caractere)).toEqual(['f', 'i']);
    expect(composer('fi', g, { taille: 100, ligatures: true, interlettrage: 0.02 }).map(l => l.caractere)).toEqual(['f', 'i']);
  });

  it('la ligature donne les memes lettres d un appel a l autre', () => {
    expect(pose('office affligé', true)).toEqual(pose('office affligé', true));
    expect(pose('office', true).map(l => l.caractere)).toEqual(['o', 'ffi', 'c', 'e']);
  });
});

const au = <T,>(t: readonly T[], i: number): T => { const v = t[i]; if (v === undefined) throw new RangeError('index'); return v; };
