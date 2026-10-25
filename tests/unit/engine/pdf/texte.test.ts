// Le texte d'un PDF en lettres (ADR-0020, section texte) : etat et position du texte, chaque mode de rendu, les encodages
// (WinAnsi, /Differences, /ToUnicode, Identity-H et CIDToGIDMap), une police TrueType embarquee dessinee exactement (comparee
// aux contours qu'opentype.js lit dans la fonte d'origine), le remplacement d'une police absente, et ce qui est dit.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'opentype.js';
import { boiteChemin, cheminDeGlyphe, type Forme } from '../../../../src/engine/editionSvg.js';
import { lirePdf } from '../../../../src/engine/lecturePdf.js';
import { cheminPolice, flux, inflerSync, lireTexte, luTexte, pdfUnePage, remplacantesTest } from './fabrique.js';

const HELVETICA = '/Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> >>';
const page = (contenu: string, ressources = HELVETICA, autres: ReadonlyArray<string | Buffer> = []) => luTexte(pdfUnePage(contenu, { ressources, autres }));
const x0 = (f: Forme | undefined) => boiteChemin(f?.d ?? [])?.x ?? NaN;
const inter = () => remplacantesTest().get('inter');
const fredoka = readFileSync(cheminPolice('fredoka'));
const fredokaOt = parse(fredoka.buffer.slice(fredoka.byteOffset, fredoka.byteOffset + fredoka.byteLength) as ArrayBuffer);

/**
 * Les commandes d'opentype.js pour un caractere de Fredoka pose en (x, y) a la taille donnee, lues dans la fonte d'origine, au
 * millieme. Elles passent par la meme normalisation des contours fermes (cheminDeGlyphe) : seule la lecture et la pose comptent.
 */
function attendu(c: string, x: number, y: number, taille: number): string[] {
  const d = cheminDeGlyphe(fredokaOt.charToGlyph(c).getPath(x, y, taille).commands);
  return d.map(k => k.c + k.p.map(v => Math.round(v * 1000) / 1000).join(','))
    .filter((t, i, tout) => !(t.startsWith('L') && tout[i - 1]?.startsWith('M') && tout[i - 1]?.slice(1) === t.slice(1)));
}
const obtenu = (f: Forme | undefined) => (f?.d ?? []).map(k => k.c + k.p.map(v => Math.round(v * 1000) / 1000).join(','));
/** Les deux traces se valent a 2 millemes pres (arrondis des deux cotes), commande par commande. */
function memesTraces(a: readonly string[], b: readonly string[]): void {
  const sansZ = (t: readonly string[]) => t.filter(x => x !== 'Z');
  expect(sansZ(a).length).toBe(sansZ(b).length);
  sansZ(a).forEach((x, i) => {
    const y = sansZ(b)[i] ?? '';
    expect(x[0], 'commande ' + i).toBe(y[0]);
    const u = x.slice(1).split(',').map(Number), v = y.slice(1).split(',').map(Number);
    u.forEach((n, k) => expect(Math.abs(n - (v[k] ?? NaN)), 'commande ' + i + ' : ' + x + ' / ' + y).toBeLessThan(0.0025));
  });
}

describe('la position du texte', () => {
  it('Tf, Td et la largeur du fichier : chaque lettre la ou elle etait, meme remplacee', () => {
    const avec = page('BT /F2 20 Tf 10 50 Td (AA) Tj ET', '/Font << /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /FirstChar 65 /LastChar 65 /Widths [667] >> >>');
    expect(avec.dessin.formes.length).toBe(2);
    expect(x0(avec.dessin.formes[1]) - x0(avec.dessin.formes[0])).toBeCloseTo(13.34, 3);
    // Sans /Widths (police standard), l'avance est celle de la fonte qui remplace.
    const sans = page('BT /F1 20 Tf 10 50 Td (AA) Tj ET');
    expect(x0(sans.dessin.formes[1]) - x0(sans.dessin.formes[0])).toBeCloseTo((inter()?.avance('A') ?? 0) / 2048 * 20, 3);
  });

  it('Tc (interlettrage), Tw (espace des mots), Tz (echelle), TJ (ajustements), Ts (elevation)', () => {
    const w = '/Font << /F << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /FirstChar 32 /LastChar 65 /Widths [250 ' + '0 '.repeat(32) + '500] >> >>';
    const ecart = (contenu: string) => { const f = page('BT /F 10 Tf ' + contenu + ' ET', w).dessin.formes; return x0(f[1]) - x0(f[0]); };
    expect(ecart('(AA) Tj')).toBeCloseTo(5, 3);
    expect(ecart('2 Tc (AA) Tj')).toBeCloseTo(7, 3);
    expect(ecart('3 Tw (A A) Tj')).toBeCloseTo(5 + 2.5 + 3, 3);
    expect(ecart('200 Tz (AA) Tj')).toBeCloseTo(10, 3);
    expect(ecart('[(A) -1000 (A)] TJ')).toBeCloseTo(15, 3);
    expect(ecart('[(A) 500 (A)] TJ')).toBeCloseTo(0, 3);
    const eleve = page('BT /F 10 Tf (A) Tj 5 Ts (A) Tj ET', w).dessin.formes;
    expect((boiteChemin(eleve[0]?.d ?? [])?.y ?? 0) - (boiteChemin(eleve[1]?.d ?? [])?.y ?? 0)).toBeCloseTo(5, 3);
  });

  it('Tm, TD, TL, T*, \' et " : les lignes', () => {
    const y = (contenu: string) => page('BT /F1 10 Tf ' + contenu + ' ET').dessin.formes.map(f => Math.round((boiteChemin(f.d)?.y ?? 0) + (boiteChemin(f.d)?.h ?? 0)));
    expect(y('1 0 0 1 10 80 Tm (A) Tj 0 -20 TD (A) Tj T* (A) Tj')).toEqual([20, 40, 60]);
    expect(y('14 TL 10 80 Td (A) Tj (A) \' 2 1 (A) "')).toEqual([20, 34, 48]);
  });
});

describe('les modes de rendu (Tr)', () => {
  const tr = (n: number) => lireTexte(pdfUnePage('1 0 0 rg 0 0 1 RG 2 w BT /F1 20 Tf ' + n + ' Tr 10 50 Td (I) Tj ET 0 0 1 1 re f', { ressources: HELVETICA }));
  const lettre = (n: number) => { const r = tr(n); if ('erreur' in r) throw new Error(r.erreur); return r; };
  it('0 remplit, 1 trace (a l echelle de la matrice), 2 fait les deux', () => {
    expect([lettre(0), lettre(1), lettre(2)].map(r => [r.dessin.formes[0]?.remplissage, r.dessin.formes[0]?.contour, r.dessin.formes[0]?.epaisseur])).toEqual([['#ff0000', null, 0], [null, '#0000ff', 2], ['#ff0000', '#0000ff', 2]]);
  });
  it('3 (invisible, couche de reconnaissance de caracteres) et 7 (decoupe seule) ne sont jamais repris, et sont dits', () => {
    for (const n of [3, 7]) {
      const r = lettre(n);
      expect(r.dessin.formes.length).toBe(1);
      expect(r.ignores[0]).toBe('1 texte invisible (couche de reconnaissance de caractères, ou texte qui ne sert qu’à découper)');
    }
  });
  it('4 a 6 peignent comme 0 a 2, la decoupe par le texte est dite', () => {
    const r = lettre(4);
    expect(r.dessin.formes[0]?.remplissage).toBe('#ff0000');
    expect(r.ignores[0]).toBe('la découpe par le texte de 1 texte (le texte est repris, pas ce qu’il découpait)');
  });
});

describe('les polices remplacees', () => {
  it('Helvetica non embarquee : Inter, et c est dit, une fois par police avec le nombre de textes', () => {
    const r = page('BT /F1 12 Tf 10 50 Td (Bonjour) Tj (le monde) Tj ET');
    expect(r.dessin.formes.length).toBe(14);
    expect(r.ignores).toEqual(['2 textes en Helvetica, police remplacée par Inter']);
  });

  it('Times-Bold vers Playfair, une italique penchee ; une fonte embarquee de la page nommee est elle-meme', () => {
    const r = page('BT /T 12 Tf (A) Tj /I 12 Tf (A) Tj /L 12 Tf (A) Tj ET', '/Font << /T << /Subtype /Type1 /BaseFont /Times-Bold >> /I << /Subtype /Type1 /BaseFont /Helvetica-Oblique >> /L << /Subtype /TrueType /BaseFont /Lobster-Regular >> >>');
    expect(r.ignores).toEqual(['1 texte en Times, police remplacée par Playfair Display gras', '1 texte en Helvetica, police remplacée par Inter penchée (italique synthétique)']);
    // La lettre penchee : le haut de la lettre est decale vers la droite par rapport a la meme lettre droite.
    const droite = page('BT /F1 100 Tf (I) Tj ET').dessin.formes[0], penchee = page('BT /I 100 Tf (I) Tj ET', '/Font << /I << /Subtype /Type1 /BaseFont /Helvetica-Oblique >> >>').dessin.formes[0];
    expect((boiteChemin(penchee?.d ?? [])?.l ?? 0) - (boiteChemin(droite?.d ?? [])?.l ?? 0)).toBeGreaterThan(10);
  });

  it('/Differences et /ToUnicode donnent le texte a dessiner', () => {
    const diff = page('BT /D 20 Tf (A) Tj ET', '/Font << /D << /Subtype /Type1 /BaseFont /Helvetica /Encoding << /BaseEncoding /WinAnsiEncoding /Differences [65 /eacute] >> >> >>');
    const e = page('BT /F1 20 Tf (\\351) Tj ET');
    expect(diff.dessin.formes[0]?.d).toEqual(e.dessin.formes[0]?.d);
    const cmap = '/CIDInit /ProcSet findresource begin 12 dict begin begincmap 1 begincodespacerange <00> <FF> endcodespacerange 2 beginbfchar <01> <0042> <02> <00660069> endbfchar endcmap CMapName currentdict /CMap defineresource pop end end';
    const tu = page('BT /U 20 Tf (\\001\\002) Tj ET', '/Font << /U << /Subtype /Type1 /BaseFont /Helvetica /ToUnicode 5 0 R >> >>', [flux('<< >>', cmap)]);
    const b = page('BT /F1 20 Tf (Bfi) Tj ET');
    expect(tu.dessin.formes.map(f => f.d.length)).toEqual(b.dessin.formes.map(f => f.d.length));
  });

  it('sans fontes de remplacement chargees : le texte attend (la page les charge et relit), puis se dit non repris', () => {
    const r = lirePdf(pdfUnePage('BT /F1 12 Tf (A) Tj ET 0 0 1 1 re f', { ressources: HELVETICA }), { decompresser: inflerSync, polices: { lire: () => null, remplacement: () => null } });
    expect('erreur' in r ? r.erreur : r.policesManquantes).toBe(true);
    expect('erreur' in r ? [] : r.ignores).toEqual(['1 texte (les polices de remplacement ne sont pas chargées : le fichier polices.js manque à côté de la page)']);
  });

  it('un programme de fonte illisible est remplace, jamais une exception', () => {
    const r = page('BT /G 20 Tf (A) Tj ET', '/Font << /G << /Subtype /TrueType /BaseFont /ABCDEF+Fredoka-SemiBold /FontDescriptor << /FontFile2 5 0 R /Flags 32 >> >> >>', [flux('<< >>', 'ceci n est pas une fonte', true)]);
    expect(r.dessin.formes.length).toBe(1);
    expect(r.ignores).toEqual([]);
    const s = page('BT /G 20 Tf (A) Tj ET', '/Font << /G << /Subtype /TrueType /BaseFont /ABCDEF+Arial /FontDescriptor << /FontFile2 5 0 R >> >> >>', [flux('<< >>', '\x00\x01\x00\x00\x00\x20' + 'x'.repeat(100), true)]);
    expect(s.ignores).toEqual(['1 texte en Arial, police remplacée par Inter']);
  });
});

describe('les polices embarquees, dessinees exactement', () => {
  it('TrueType simple en WinAnsi (FontFile2) : les contours sont ceux d opentype.js sur la fonte d origine', () => {
    const r = page('BT /E 40 Tf 10 30 Td (F\\352te) Tj ET', '/Font << /E << /Subtype /TrueType /BaseFont /Fredoka-SemiBold /Encoding /WinAnsiEncoding /FontDescriptor << /FontFile2 5 0 R /Flags 32 >> >> >>', [flux('<< /Length1 ' + fredoka.length + ' >>', fredoka, true)]);
    expect(r.ignores).toEqual([]);
    expect(r.dessin.formes.length).toBe(4);
    // Sans /Widths, l'avance est celle de la fonte embarquee : la meme que celle qu'opentype.js donne.
    let x = 10;
    [...'Fête'].forEach((c, i) => {
      memesTraces(obtenu(r.dessin.formes[i]), attendu(c, x, 100 - 30, 40));
      x += ((fredokaOt.charToGlyph(c).advanceWidth ?? 0) / fredokaOt.unitsPerEm) * 40;
    });
  });

  it('police composite Identity-H (CIDFontType2, CIDToGIDMap Identity) : le CID est le numero de glyphe', () => {
    const gids = [...'Noël'].map(c => fredokaOt.charToGlyph(c).index);
    const hex = '<' + gids.map(g => g.toString(16).padStart(4, '0')).join('') + '>';
    const r = page('BT /C 30 Tf 20 40 Td ' + hex + ' Tj ET', '/Font << /C << /Subtype /Type0 /BaseFont /ABCDEF+Fredoka /Encoding /Identity-H /DescendantFonts [<< /Subtype /CIDFontType2 /BaseFont /ABCDEF+Fredoka /CIDToGIDMap /Identity /DW 600 /FontDescriptor << /FontFile2 5 0 R >> >>] >> >>', [flux('<< >>', fredoka, true)]);
    expect(r.dessin.formes.length).toBe(4);
    [...'Noël'].forEach((c, i) => memesTraces(obtenu(r.dessin.formes[i]), attendu(c, 20 + i * 18, 60, 30)));
  });

  it('CIDToGIDMap en flux : le CID passe par la table', () => {
    const g = fredokaOt.charToGlyph('A').index, table = new Uint8Array(4);
    table[2] = g >> 8; table[3] = g & 255;
    const r = page('BT /C 30 Tf <0001> Tj ET', '/Font << /C << /Subtype /Type0 /BaseFont /X /Encoding /Identity-H /DescendantFonts [<< /Subtype /CIDFontType2 /CIDToGIDMap 6 0 R /FontDescriptor << /FontFile2 5 0 R >> >>] >> >>', [flux('<< >>', fredoka, true), flux('<< >>', table)]);
    memesTraces(obtenu(r.dessin.formes[0]), attendu('A', 0, 100, 30));
  });

  it('Type 3 : chaque glyphe est un flux de contenu, dessine dans le repere de la glyphe', () => {
    const r = page('1 0 0 rg BT /T 10 Tf 10 50 Td (ab) Tj ET', '/Font << /T << /Subtype /Type3 /FontBBox [0 0 1000 1000] /FontMatrix [0.001 0 0 0.001 0 0] /FirstChar 97 /LastChar 98 /Widths [1000 500] /Encoding << /Differences [97 /tri /car] >> /CharProcs << /tri 5 0 R /car 6 0 R >> >> >>',
      [flux('<< >>', '1000 0 0 0 1000 1000 d1 0 0 m 1000 0 l 500 1000 l h f'), flux('<< >>', '500 0 d0 0 0 500 500 re f')]);
    expect(r.dessin.formes.map(f => [boiteChemin(f.d), f.remplissage])).toEqual([[{ x: 10, y: 40, l: 10, h: 10 }, '#ff0000'], [{ x: 20, y: 45, l: 5, h: 5 }, '#ff0000']]);
    expect(r.ignores).toEqual([]);
  });
});
