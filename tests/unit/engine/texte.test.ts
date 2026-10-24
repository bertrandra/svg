import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'opentype.js';
import { ajouterTexte, cheminDeGlyphe, composer, type CommandeGlyphe, type Glyphes } from '../../../src/engine/texte.js';
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

describe('cheminDeGlyphe ferme les contours qui reviennent a leur depart', () => {
  it('ajoute Z apres une courbe qui retombe sur le depart, et remplace le segment droit de retour', () => {
    expect(ecrireChemin(cheminDeGlyphe([{ type: 'M', x: 0, y: 0 }, { type: 'C', x1: 1, y1: 2, x2: 3, y2: 4, x: 5, y: 6 }, { type: 'Q', x1: 2, y1: 2, x: 0, y: 0 }]))).toBe('M0 0C1 2 3 4 5 6Q2 2 0 0Z');
    expect(ecrireChemin(cheminDeGlyphe([{ type: 'M', x: 0, y: 0 }, { type: 'L', x: 10, y: 0 }, { type: 'L', x: 10, y: 10 }, { type: 'L', x: 0, y: 0 }]))).toBe('M0 0L10 0L10 10Z');
  });

  it('traite chaque contour a part, et laisse intacts ceux deja fermes ou qui ne reviennent pas', () => {
    const carre = (x: number): CommandeGlyphe[] => [{ type: 'M', x, y: 0 }, { type: 'L', x: x + 4, y: 0 }, { type: 'L', x: x + 4, y: 4 }, { type: 'L', x, y: 0 }];
    expect(ecrireChemin(cheminDeGlyphe([...carre(0), ...carre(10)]))).toBe('M0 0L4 0L4 4ZM10 0L14 0L14 4Z');
    // Deja ferme : le Z existant n'est pas double, et le segment avant lui reste.
    expect(ecrireChemin(cheminDeGlyphe([{ type: 'M', x: 0, y: 0 }, { type: 'L', x: 4, y: 0 }, { type: 'L', x: 0, y: 0 }, { type: 'Z' }]))).toBe('M0 0L4 0L0 0Z');
    // Ouvert (ne revient pas au depart) : on n'invente pas de fermeture.
    expect(ecrireChemin(cheminDeGlyphe([{ type: 'M', x: 0, y: 0 }, { type: 'L', x: 4, y: 0 }, { type: 'L', x: 4, y: 4 }]))).toBe('M0 0L4 0L4 4');
    expect(cheminDeGlyphe([])).toEqual([]);
  });

  it('compare apres arrondi : un retour a 0.0004 pres du depart est un retour', () => {
    expect(ecrireChemin(cheminDeGlyphe([{ type: 'M', x: 0, y: 0 }, { type: 'L', x: 4, y: 0 }, { type: 'L', x: 4, y: 4 }, { type: 'L', x: 0.0004, y: -0.0004 }]))).toBe('M0 0L4 0L4 4Z');
  });

  it('donne a chaque contour d une vraie fonte son Z, sans segment de retour redondant', () => {
    const octets = readFileSync(resolve(__dirname, '../../../node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'));
    const g = glyphesDe(parse(octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength)));
    for (const ch of ['A', 'B', 'O', 'g', '8']) {
      const d = composer(ch, g, { taille: 100, x: 0, y: 100 })[0]?.d ?? [];
      const M = d.filter(c => c.c === 'M').length, Z = d.filter(c => c.c === 'Z').length;
      expect(M, ch).toBeGreaterThan(0);
      expect(Z, ch).toBe(M);
      d.forEach((c, i) => { if (c.c === 'Z') expect(d[i - 1]?.c === 'M', ch + ' : contour vide').toBe(false); });
    }
  });
});

describe('une ligature n est pas faite : une lettre reste une forme', () => {
  it('fi donne deux formes, f puis i, comme toute paire de caracteres', () => {
    expect(composer('fi', factice, { taille: 100 }).map(l => l.caractere)).toEqual(['f', 'i']);
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

describe('composer, les ligatures', () => {
  // Une fonte factice qui lie « fi » (avance 700) et « ffi » (avance 900), et note les paires qu'on lui demande de creer.
  function avecLigatures(paires: string[] = []): Glyphes {
    return {
      ...factice,
      avance: c => (c === 'ffi' ? 900 : c === 'fi' ? 700 : 600),
      crenage: (a, b) => { paires.push(a + '|' + b); return a === 'fi' && b === 'x' ? -50 : a === 'A' && b === 'fi' ? -30 : factice.crenage(a, b); },
      ligature: (cars, i) => (cars[i] === 'f' && cars[i + 1] === 'f' && cars[i + 2] === 'i' ? 3 : cars[i] === 'f' && cars[i + 1] === 'i' ? 2 : 0)
    };
  }
  const caracteres = (t: string, o: { ligatures?: boolean; interlettrage?: number } = {}, g: Glyphes = avecLigatures()) =>
    composer(t, g, { taille: 100, x: 0, y: 100, ...o }).map(l => l.caractere);

  it('par defaut, une forme par caractere : rien ne change pour qui ne demande pas les ligatures', () => {
    expect(caracteres('fi')).toEqual(['f', 'i']);
    expect(caracteres('fi', { ligatures: false })).toEqual(['f', 'i']);
    const sans = composer('fi AV', avecLigatures(), { taille: 100, x: 3, y: 50 }), vieille = composer('fi AV', factice, { taille: 100, x: 3, y: 50 });
    expect(sans.map(l => l.d)).toEqual(vieille.map(l => l.d));
  });

  it('avec ligatures, « fi » est UNE forme dont le caractere est la chaine liee', () => {
    expect(caracteres('fi', { ligatures: true })).toEqual(['fi']);
    expect(caracteres('ffi', { ligatures: true })).toEqual(['ffi']);
    expect(caracteres('afix', { ligatures: true })).toEqual(['a', 'fi', 'x']);
    expect(caracteres('fifi', { ligatures: true })).toEqual(['fi', 'fi']);
  });

  it('l avance est celle de la glyphe de ligature, et le crenage se calcule avec elle des deux cotes', () => {
    const paires: string[] = [];
    const l = composer('Afix', avecLigatures(paires), { taille: 100, x: 0, y: 100, ligatures: true });
    expect(paires).toEqual(['A|fi', 'fi|x']);
    const x = (i: number) => boiteChemin(l[i]?.d ?? [])?.x ?? NaN;
    // A avance de 60 ; crenage A|fi = -3 ; la ligature avance de 70 ; crenage fi|x = -5.
    expect(x(0)).toBeCloseTo(0, 6);
    expect(x(1)).toBeCloseTo(60 - 3, 6);
    expect(x(2)).toBeCloseTo(60 - 3 + 70 - 5, 6);
  });

  it('sans ligature, les memes lettres se suivent a l avance de chaque caractere', () => {
    const l = composer('fix', avecLigatures(), { taille: 100, x: 0, y: 100 });
    expect(boiteChemin(l[2]?.d ?? [])?.x).toBeCloseTo(120, 6);
  });

  it('une ligature ne traverse ni un blanc ni un retour a la ligne, meme si la fonte l annonce', () => {
    const naive: Glyphes = { ...factice, ligature: () => 2 };
    expect(caracteres('f i', { ligatures: true }, naive)).toEqual(['f', 'i']);
    expect(caracteres('f\ni', { ligatures: true }, naive)).toEqual(['f', 'i']);
    expect(caracteres('fi', { ligatures: true }, avecLigatures())).toEqual(['fi']);
  });

  it('un texte espace ne se lie pas (comme en CSS) ; une fonte sans ligature ignore l option', () => {
    expect(caracteres('fi', { ligatures: true, interlettrage: 0.05 })).toEqual(['f', 'i']);
    expect(caracteres('fi', { ligatures: true }, factice)).toEqual(['f', 'i']);
  });

  it('une ligature en fin de ligne, puis la ligne suivante, repart a gauche', () => {
    const l = composer('fi\nfi', avecLigatures(), { taille: 100, x: 5, y: 100, ligatures: true });
    expect(l).toHaveLength(2);
    expect(boiteChemin(l[1]?.d ?? [])?.x).toBeCloseTo(5, 6);
    expect(boiteChemin(l[1]?.d ?? [])?.y).toBeCloseTo(100 + 120 - 50, 6);
  });
});
