import { describe, it, expect } from 'vitest';
import { lireDessin, marquerOrigine, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { mentionOrigines } from '../../../src/model/credits.js';
import { ecrirePdf, svgDecoupe } from './plats.js';

// Les exports portent la mention des formes creditees (CC BY 3.0) : le PDF dans son dictionnaire d'informations, le SVG de
// decoupe en commentaire ; sans forme creditee ils s'ecrivent comme avant. Un PNG ne peut pas la porter (documente).

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 10h30v30h-30z" fill="#c81e28"/></svg>';
const dessin = (): DessinSvg => { const r = lireDessin(SVG); if ('erreur' in r) throw new Error(r.erreur); return r.dessin; };
const texte = (o: Uint8Array) => String.fromCharCode(...o);

describe('PDF', () => {
  it('sans forme creditee, le dictionnaire d informations est celui d avant', () => {
    expect(texte(ecrirePdf(dessin()))).toContain('5 0 obj\n<< /Producer (svg) >>\nendobj');
  });

  it('avec une forme creditee, la mention est le sujet du document, et la table xref reste juste', () => {
    const pdf = texte(ecrirePdf(marquerOrigine(dessin(), 'game-icons:abacus')));
    const mention = mentionOrigines(['game-icons:abacus']).replace(/[()]/g, c => '\\' + c);
    expect(pdf).toContain('<< /Producer (svg) /Subject (' + mention + ') >>');
    const startxref = Number(/startxref\n(\d+)/.exec(pdf)?.[1]);
    expect(pdf.slice(startxref, startxref + 4)).toBe('xref');
    const positions = [...pdf.matchAll(/\n(\d{10}) 00000 n/g)].map(m => Number(m[1]));
    positions.forEach((p, i) => expect(pdf.slice(p, p + 7)).toBe((i + 1) + ' 0 obj'));
  });

  it('une forme masquee ne credite pas le document', () => {
    const d = marquerOrigine(dessin(), 'game-icons:abacus');
    expect(texte(ecrirePdf({ ...d, formes: d.formes.map(f => ({ ...f, visible: false })) }))).not.toContain('/Subject');
  });
});

describe('SVG de decoupe', () => {
  it('sans forme creditee, aucun commentaire', () => {
    expect(svgDecoupe(dessin())).not.toContain('<!--');
  });

  it('avec une forme creditee, la mention passe en commentaire (et ne contient jamais deux tirets de suite)', () => {
    const svg = svgDecoupe(marquerOrigine(dessin(), 'game-icons:abacus'));
    const commentaire = /<!-- (.*?) -->/.exec(svg)?.[1] ?? '';
    expect(commentaire).toBe(mentionOrigines(['game-icons:abacus']));
    expect(commentaire).not.toContain('--');
  });
});
