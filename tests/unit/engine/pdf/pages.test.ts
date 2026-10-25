// L'arbre des pages : heritage de MediaBox, CropBox, Rotate et Resources, rotation appliquee, choix de page, refus nommes.

import { describe, it, expect } from 'vitest';
import { matricePage } from '../../../../src/engine/lecturePdf.js';
import { enTexte, flux, lu, pdfClassique, refus } from './fabrique.js';

/** Un document de pages : `pages` sont les dictionnaires de page (sans /Type ni /Parent), chacun avec son contenu. */
function document(noeud: string, pages: ReadonlyArray<readonly [string, string]>): Buffer {
  const objets: Array<string | Buffer> = ['<< /Type /Catalog /Pages 2 0 R >>', ''];
  const kids: string[] = [];
  for (const [dict, contenu] of pages) {
    const n = objets.length + 1;
    kids.push(n + ' 0 R');
    objets.push('<< /Type /Page /Parent 2 0 R ' + dict + ' /Contents ' + (n + 1) + ' 0 R >>', flux('<< >>', contenu));
  }
  objets[1] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + pages.length + ' ' + noeud + ' >>';
  return pdfClassique(objets);
}

describe('l heritage des attributs de page', () => {
  it('herite MediaBox, Rotate et Resources du noeud parent ; la page peut les redefinir', () => {
    const pdf = document('/MediaBox [0 0 300 200] /Rotate 90 /Resources << /ExtGState << /A << /ca 0.5 >> >> >>', [
      ['', '/A gs 0 0 10 10 re f'],
      ['/MediaBox [0 0 50 40] /Rotate 0', '0 0 10 10 re f']
    ]);
    const un = lu(pdf, 1), deux = lu(pdf, 2);
    expect(un.dessin.vb).toEqual([0, 0, 200, 300]);
    expect(un.dessin.formes[0]?.opacite).toBe(0.5);
    expect(deux.dessin.vb).toEqual([0, 0, 50, 40]);
    expect(un.pages).toBe(2);
    expect(deux.page).toBe(2);
  });

  it('prend la CropBox, ramenee dans la MediaBox, pour boite du dessin', () => {
    const pdf = document('/MediaBox [0 0 200 100]', [['/CropBox [10 20 110 70]', '10 20 10 10 re f'], ['/CropBox [-50 -50 100 50]', '0 0 10 10 re f']]);
    const un = lu(pdf, 1);
    expect(un.dessin.vb).toEqual([0, 0, 100, 50]);
    expect(enTexte(un.dessin.formes[0]?.d ?? [])).toBe('M0,50 L10,50 L10,40 L0,40 Z');
    expect(lu(pdf, 2).dessin.vb).toEqual([0, 0, 100, 50]);
  });

  it('remet dans l ordre une boite ecrite a l envers, et prend Letter quand la MediaBox manque', () => {
    expect(lu(document('', [['/MediaBox [100 50 0 0]', '0 0 10 10 re f']])).dessin.vb).toEqual([0, 0, 100, 50]);
    expect(lu(document('', [['', '0 0 10 10 re f']])).dessin.vb).toEqual([0, 0, 612, 792]);
  });

  it('applique la rotation de page (90, 180, 270, et -90 ramene a 270) ; une rotation hors quart est ignoree', () => {
    const rect = '10 20 30 40 re f';
    const lire = (r: string) => { const x = lu(document('/MediaBox [0 0 200 100]', [['/Rotate ' + r, rect]])); return [x.dessin.vb, enTexte(x.dessin.formes[0]?.d ?? [])]; };
    expect(lire('0')).toEqual([[0, 0, 200, 100], 'M10,80 L40,80 L40,40 L10,40 Z']);
    expect(lire('90')).toEqual([[0, 0, 100, 200], 'M20,10 L20,40 L60,40 L60,10 Z']);
    expect(lire('180')).toEqual([[0, 0, 200, 100], 'M190,20 L160,20 L160,60 L190,60 Z']);
    expect(lire('270')).toEqual([[0, 0, 100, 200], 'M80,190 L80,160 L40,160 L40,190 Z']);
    expect(lire('-90')).toEqual(lire('270'));
    expect(lire('45')).toEqual(lire('0'));
  });

  it('porte la page dans le dessin par une matrice : origine de la CropBox, Y retourne', () => {
    expect(matricePage([10, 20, 110, 70], 0)).toEqual([1, 0, 0, -1, -10, 70]);
    expect(matricePage([0, 0, 200, 100], 90)).toEqual([0, 1, 1, 0, 0, 0]);
  });

  it('lit la page choisie parmi plusieurs, dans l ordre de l arbre, sous-arbres compris', () => {
    const pdf = pdfClassique([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 3 /MediaBox [0 0 100 100] >>',
      '<< /Type /Pages /Parent 2 0 R /Kids [5 0 R 6 0 R] /Count 2 >>',
      '<< /Type /Page /Parent 2 0 R /Contents 7 0 R >>',
      '<< /Type /Page /Parent 3 0 R /Contents 8 0 R >>',
      '<< /Type /Page /Parent 3 0 R /Contents 9 0 R >>',
      flux('<< >>', '0 0 1 rg 0 0 10 10 re f'), flux('<< >>', '1 0 0 rg 0 0 10 10 re f'), flux('<< >>', '0 1 0 rg 0 0 10 10 re f')
    ]);
    expect([1, 2, 3].map(p => lu(pdf, p).dessin.formes[0]?.remplissage)).toEqual(['#ff0000', '#00ff00', '#0000ff']);
    expect(lu(pdf).page).toBe(1);
    expect(lu(pdf).pages).toBe(3);
  });
});

describe('les refus de l arbre des pages', () => {
  it('refuse un arbre en boucle', () => {
    const pdf = pdfClassique(['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [2 0 R] /Count 1 >>']);
    expect(refus(pdf)).toBe('Ce PDF ne se lit pas : un arbre de pages en boucle.');
  });

  it('refuse un arbre trop profond', () => {
    const objets: string[] = ['<< /Type /Catalog /Pages 2 0 R >>'];
    for (let k = 2; k < 72; k++) objets.push('<< /Type /Pages /Kids [' + (k + 1) + ' 0 R] /Count 1 >>');
    objets.push('<< /Type /Page /MediaBox [0 0 10 10] >>');
    expect(refus(pdfClassique(objets))).toBe('Ce PDF a un arbre de pages trop profond (plus de 64 niveaux) : il ne se lit pas ici.');
  });

  it('refuse une page de taille nulle', () => {
    expect(refus(document('', [['/MediaBox [0 0 0 100]', '0 0 1 1 re f']]))).toBe('Cette page du PDF a une taille nulle.');
  });

  it('refuse un catalogue absent', () => {
    expect(refus(pdfClassique(['<< /Type /Pages >>'], '/Root 5 0 R'))).toMatch(/catalogue/);
  });
});
