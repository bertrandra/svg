// Le texte d'un SVG lu en lettres (ADR-0020, section texte) : positions, ancres, familles remplacees et dites, ce qui est ignore,
// et la garantie qui compte le plus : sans polices donnees a la lecture, rien ne change (un <text> reste refuse en le nommant).

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { boiteChemin, CARACTERES_MAX, ecrireDessin, lireDessin, type DessinSvg, type PolicesTexte } from '../../../src/engine/editionSvg.js';
import { remplacantesTest } from './pdf/fabrique.js';
import { violationsEcriture } from '../securite/invariants.js';

const polices: PolicesTexte = { glyphes: id => remplacantesTest().get(id) ?? null };
const svg = (corps: string) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">' + corps + '</svg>';
const lire = (corps: string): { dessin: DessinSvg; ignores: readonly string[] } => {
  const r = lireDessin(svg(corps), { polices });
  if ('erreur' in r) throw new Error(r.erreur);
  return r;
};
const boites = (corps: string) => lire(corps).dessin.formes.map(f => boiteChemin(f.d));

describe('sans polices, rien ne change', () => {
  it('un <text> reste refuse en le nommant, comme avant', () => {
    expect(lireDessin(svg('<text x="1" y="10">A</text>'))).toEqual({ erreur: 'Ce SVG contient du texte (vectorisez-le dans votre logiciel) : il ne s’édite pas ici. Vectorisez l’image, ou simplifiez-le dans votre logiciel.' });
  });
  it('un SVG sans texte se lit a l identique avec ou sans polices', () => {
    const t = svg('<g font-family="Arial" font-size="3em"><rect x="1" y="1" width="5" height="5" fill="red"/></g>');
    expect(lireDessin(t, { polices })).toEqual(lireDessin(t));
  });
});

describe('les positions', () => {
  it('x et y posent la ligne de base, chaque lettre avance de sa largeur et du crenage', () => {
    const [a, v] = boites('<text x="10" y="100" font-family="Inter" font-size="100">AV</text>');
    const inter = remplacantesTest().get('inter'), k = 100 / (inter?.unitesParEm ?? 2048);
    const x = 10 + ((inter?.avance('A') ?? 0) + (inter?.crenage('A', 'V') ?? 0)) * k;
    const [seul] = boites('<text x="' + x + '" y="100" font-family="Inter" font-size="100">V</text>');
    expect((a?.y ?? 0) + (a?.h ?? 0)).toBeCloseTo(100, 0);
    expect(v?.x ?? 0).toBeCloseTo(seul?.x ?? NaN, 3);
    expect(inter?.crenage('A', 'V')).toBeLessThan(0);
  });
  it('les listes x, y, dx, dy s appliquent lettre a lettre ; le tspan le plus interieur l emporte', () => {
    const b = boites('<text x="10 100 200" y="50" dy="0 20" font-family="Inter" font-size="40">AB<tspan x="300">C</tspan></text>');
    expect(b.map(x => Math.round((x?.y ?? 0) + (x?.h ?? 0)))).toEqual([50, 70, 70]);
    expect(b.map(x => Math.round(x?.x ?? 0) >= 0)).toEqual([true, true, true]);
    expect(Math.round((b[2]?.x ?? 0) / 100)).toBe(3);
  });
  it('text-anchor : middle centre le morceau, end le finit au point', () => {
    const debut = boites('<text x="200" y="50" font-family="Inter" font-size="40">II</text>'), milieu = boites('<text x="200" y="50" text-anchor="middle" font-family="Inter" font-size="40">II</text>'), fin = boites('<text x="200" y="50" text-anchor="end" font-family="Inter" font-size="40">II</text>');
    const l = (fin[1]?.x ?? 0) - (fin[0]?.x ?? 0);
    expect((debut[0]?.x ?? 0) - (milieu[0]?.x ?? 0)).toBeCloseTo((debut[0]?.x ?? 0) - (fin[0]?.x ?? 0) - ((debut[0]?.x ?? 0) - (milieu[0]?.x ?? 0)), 3);
    expect(l).toBeGreaterThan(0);
  });
  it('rotate tourne chaque lettre, la derniere valeur se repete ; transform et font-size relative s heritent', () => {
    const droit = boites('<text x="50" y="100" font-family="Inter" font-size="40">II</text>'), tourne = boites('<text x="50" y="100" rotate="90" font-family="Inter" font-size="40">II</text>');
    expect((tourne[1]?.l ?? 0) > (droit[1]?.l ?? 0)).toBe(true);
    const g = boites('<g transform="translate(100 0)" font-size="20"><text x="0" y="100" font-family="Inter" font-size="2em">I</text></g>'), seul = boites('<text x="100" y="100" font-family="Inter" font-size="40">I</text>');
    expect(g).toEqual(seul);
  });
  it('letter-spacing et word-spacing ecartent les lettres', () => {
    const sans = boites('<text x="0" y="50" font-family="Inter" font-size="20">A A</text>'), avec = boites('<text x="0" y="50" letter-spacing="5" word-spacing="7" font-family="Inter" font-size="20">A A</text>');
    expect((avec[1]?.x ?? 0) - (sans[1]?.x ?? 0)).toBeCloseTo(5 + 5 + 7, 3);
  });
});

describe('les polices et ce qui est dit', () => {
  it('une famille absente est remplacee et dite ; une fonte embarquee nommee ne dit rien ; une generique seule non plus', () => {
    expect(lire('<text x="0" y="50" font-family="Arial">A</text><text x="0" y="90" font-family="Arial">B</text>').ignores).toEqual(['2 textes en Arial, police remplacée par Inter']);
    expect(lire('<text x="0" y="50" font-family="Lobster, cursive">A</text>').ignores).toEqual([]);
    expect(lire('<text x="0" y="50" font-family="sans-serif">A</text>').ignores).toEqual([]);
    expect(lire('<text x="0" y="50">A</text>').ignores).toEqual(['1 texte en Times New Roman, police remplacée par Playfair Display gras']);
    expect(lire('<text x="0" y="50" font-family="Georgia" font-style="italic">A</text>').ignores).toEqual(['1 texte en Georgia, police remplacée par Playfair Display gras penchée (italique synthétique)']);
  });
  it('la peinture vient de la cascade : classe, heritage, fill="none" et trait, opacite', () => {
    const r = lire('<style>.t { fill: #1428a0 }</style><g opacity="0.5"><text class="t" x="0" y="50" font-family="Inter">A<tspan fill="none" stroke="#c81e28" stroke-width="2">B</tspan></text></g>');
    expect(r.dessin.formes.map(f => [f.remplissage, f.contour, f.epaisseur, f.opacite])).toEqual([['#1428a0', null, 0, 0.5], [null, '#c81e28', 2, 0.5]]);
  });
  it('<textPath> et l ecriture verticale sont ignores et dits ; un caractere sans glyphe est dit', () => {
    expect(lire('<text x="0" y="50" font-family="Inter"><textPath href="#c">A</textPath>B</text>').ignores).toEqual(['le texte qui suit un chemin (<textPath>)']);
    expect(lire('<text x="0" y="50" font-family="Inter" writing-mode="tb">A</text><rect width="1" height="1"/>').ignores).toEqual(['le texte écrit verticalement (writing-mode)']);
    expect(lire('<text x="0" y="50" font-family="Bebas Neue">中</text><rect width="1" height="1"/>').ignores).toEqual(['des caractères que la fonte de remplacement n’a pas']);
  });
  it('refuse un texte demesure', () => {
    const r = lireDessin(svg('<text font-family="Inter">' + 'a'.repeat(CARACTERES_MAX + 1) + '</text>'), { polices });
    expect('erreur' in r && r.erreur).toMatch(/trop de texte/);
  });
});

describe('le corpus hostile, lu avec les polices', () => {
  it('ne leve jamais, et ce qui s ecrit satisfait les invariants (aucun <text> ecrit)', () => {
    const dossier = resolve(__dirname, '../../fixtures/hostile');
    for (const n of readdirSync(dossier).filter(f => f.endsWith('.svg'))) {
      const r = lireDessin(new TextDecoder().decode(readFileSync(resolve(dossier, n))), { polices });
      if ('erreur' in r) continue;
      const e = ecrireDessin(r.dessin, 3);
      expect(violationsEcriture(e), n).toEqual([]);
      expect(e.includes('<text'), n).toBe(false);
    }
  });
});
