import { describe, it, expect } from 'vitest';
import { composantes, operateurs } from '../../../src/export/pdf.js';
import { lireDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { ecrirePdf, svgDecoupe } from './plats.js';

const dessin = (svg: string): DessinSvg => { const r = lireDessin(svg); if ('erreur' in r) throw new Error(r.erreur); return r.dessin; };
const texte = (o: Uint8Array) => String.fromCharCode(...o);

describe('ecrirePdf', () => {
  const d = dessin('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><path d="M10 10h50v30h-50z" fill="#c81e28"/><path d="M100 20Q120 0 140 20" fill="none" stroke="#000000" stroke-width="2" opacity="0.5"/></svg>');

  it('ecrit une page a la taille du plan, les formes en operateurs, l opacite en etat graphique, et une table xref juste', () => {
    const pdf = texte(ecrirePdf(d));
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('/MediaBox [0 0 200 100]');
    expect(pdf).toContain('0.784 0.118 0.157 rg');
    expect(pdf).toContain('10 90 m\n60 90 l\n60 60 l\n10 60 l\nh\nf');
    expect(pdf).toContain('/GS0 << /ca 0.5 /CA 0.5 >>');
    expect(pdf).toMatch(/c\nS\nQ/);
    const startxref = Number(/startxref\n(\d+)/.exec(pdf)?.[1]);
    expect(pdf.slice(startxref, startxref + 4)).toBe('xref');
    const premier = Number(/\n(\d{10}) 00000 n/.exec(pdf)?.[1]);
    expect(pdf.slice(premier, premier + 7)).toBe('1 0 obj');
  });

  it('rend toujours les memes octets, et convertit les couleurs', () => {
    expect(ecrirePdf(d)).toEqual(ecrirePdf(d));
    expect(composantes('#ffffff')).toEqual([1, 1, 1]);
    expect(composantes('rien')).toEqual([0, 0, 0]);
    expect(operateurs([{ c: 'M', p: [0, 0] }, { c: 'L', p: [10, 0] }, { c: 'Z', p: [] }], [0, 0, 10, 10])).toBe('0 10 m\n10 10 l\nh');
  });
});

describe('svgDecoupe', () => {
  it('ecrit chaque forme visible en contour seul, en millimetres', () => {
    const d = dessin('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><path d="M0 0h5v5h-5z" fill="#c81e28"/></svg>');
    expect(svgDecoupe(d)).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10" width="20mm" height="10mm"><path d="M0 0L5 0L5 5L0 5Z" fill="none" stroke="#ff0000" stroke-width="0.25" stroke-linejoin="round"/></svg>');
  });
});
