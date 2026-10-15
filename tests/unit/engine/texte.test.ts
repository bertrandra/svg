import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'opentype.js';
import { ajouterTexte, cheminDeGlyphe, composer, type Glyphes } from '../../../src/engine/texte.js';
import { glyphesDe } from '../../../src/io/polices.js';
import { boiteChemin, ecrireChemin, lireDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';

// Une fonte factice : chaque lettre est un carre de 500 unites, avance 600, crenage -100 entre A et V.
const factice: Glyphes = {
  unitesParEm: 1000,
  contour: (c, x, y, t) => (c === '.' ? [] : [{ type: 'M', x, y }, { type: 'L', x: x + t / 2, y }, { type: 'L', x: x + t / 2, y: y - t / 2 }, { type: 'Z' }]),
  avance: () => 600,
  crenage: (a, b) => (a === 'A' && b === 'V' ? -100 : 0)
};

describe('composer', () => {
  it('pose une lettre par caractere visible, avec avance, crenage, interlettrage et retour a la ligne', () => {
    const l = composer('AV a\nb', factice, { taille: 100, x: 10, y: 50, interlettrage: 0.1 });
    expect(l.map(x => x.caractere)).toEqual(['A', 'V', 'a', 'b']);
    expect(boiteChemin(l[0]?.d ?? [])?.x).toBe(10);
    expect(boiteChemin(l[1]?.d ?? [])?.x).toBeCloseTo(10 + 60 + 10 - 10, 6);
    expect(boiteChemin(l[3]?.d ?? [])?.y).toBeCloseTo(50 + 120 - 50, 6);
    expect(composer('.', factice, { taille: 10 })).toEqual([]);
  });

  it('convertit les commandes de glyphe en chemin et ajoute les lettres au dessin', () => {
    expect(ecrireChemin(cheminDeGlyphe([{ type: 'M', x: 0, y: 0 }, { type: 'Q', x1: 5, y1: 5, x: 10, y: 0 }, { type: 'C', x1: 1, y1: 2, x2: 3, y2: 4, x: 5, y: 6 }, { type: 'Z' }]))).toBe('M0 0Q5 5 10 0C1 2 3 4 5 6Z');
    const d: DessinSvg = { vb: [0, 0, 100, 100], formes: [] };
    const r = ajouterTexte(d, composer('ab', factice, { taille: 20 }), { remplissage: '#123456', contour: null, epaisseur: 1 });
    expect(r.ids).toEqual(['f1', 'f2']);
    expect(r.dessin.formes[1]?.remplissage).toBe('#123456');
  });
});

describe('une vraie fonte', () => {
  it('donne des lettres que l editeur lit, et toujours les memes', () => {
    const octets = readFileSync(resolve(__dirname, '../../../node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'));
    const g = glyphesDe(parse(octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength)));
    const a = composer('Noël 2026', g, { taille: 48, x: 0, y: 48 }), b = composer('Noël 2026', g, { taille: 48, x: 0, y: 48 });
    expect(a.length).toBe(8);
    expect(a).toEqual(b);
    const d = ajouterTexte({ vb: [0, 0, 300, 100], formes: [] }, a, { remplissage: '#000000', contour: null, epaisseur: 1 });
    const relu = lireDessin('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100">' + d.dessin.formes.map(f => '<path d="' + ecrireChemin(f.d) + '"/>').join('') + '</svg>');
    expect('dessin' in relu && relu.dessin.formes.length).toBe(8);
    const o = boiteChemin(a[1]?.d ?? []);
    expect(o && o.l > 10 && o.h > 10).toBe(true);
  });
});
