// La structure d'un PDF : table classique, table en flux et flux d'objets (PDF 1.5), enregistrements incrementaux, table fausse
// reindexee, et les refus nommes (pas un PDF, chiffre, trop gros, illisible).

import { describe, it, expect } from 'vitest';
import { ouvrirDocument } from '../../../../src/engine/pdf/structure.js';
import { LIMITES_PDF } from '../../../../src/engine/pdf/limites.js';
import { flux, inflerSync, lu, octets, pdfClassique, pdfModerne, pdfUnePage, refus, enTexte } from './fabrique.js';

const PAGE = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R >>'
];
const rouge = flux('<< >>', '1 0 0 rg 0 0 10 10 re f');

/** Ajoute un enregistrement incremental : de nouveaux objets, une section de table qui renvoie a la precedente. */
function ajouter(base: Buffer, objets: ReadonlyArray<readonly [number, string | Buffer]>, taille: number): Buffer {
  const precedente = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(base.toString('latin1'))?.[1]);
  const morceaux: Buffer[] = [base];
  let pos = base.length, table = 'xref\n0 1\n0000000000 65535 f \n';
  for (const [n, o] of objets) {
    const b = Buffer.concat([octets(n + ' 0 obj\n'), typeof o === 'string' ? octets(o) : o, octets('\nendobj\n')]);
    table += n + ' 1\n' + String(pos).padStart(10, '0') + ' 00000 n \n';
    morceaux.push(b);
    pos += b.length;
  }
  morceaux.push(octets(table + 'trailer\n<< /Size ' + taille + ' /Root 1 0 R /Prev ' + precedente + ' >>\nstartxref\n' + pos + '\n%%EOF\n'));
  return Buffer.concat(morceaux);
}

describe('la table des objets', () => {
  it('lit une table classique et ses decalages', () => {
    const doc = ouvrirDocument(pdfClassique([...PAGE, rouge]), inflerSync);
    expect([...doc.entrees.keys()].sort()).toEqual([1, 2, 3, 4]);
    expect(lu(pdfClassique([...PAGE, rouge])).dessin.formes[0]?.remplissage).toBe('#ff0000');
  });

  it('lit une table en flux (W [1 2 1], predicteur PNG) et des objets ranges dans un flux d objets', () => {
    const pdf = pdfModerne([...PAGE, flux('<< >>', '0 0 1 rg 0 0 10 10 re f', true)]);
    expect(pdf.toString('latin1')).toContain('/Type /ObjStm');
    expect(pdf.toString('latin1')).not.toContain('/Type /Catalog');
    const doc = ouvrirDocument(pdf, inflerSync);
    expect(doc.entrees.get(1)).toEqual({ type: 'c', flot: 5, index: 0 });
    expect(lu(pdf).dessin.formes[0]?.remplissage).toBe('#0000ff');
  });

  it('suit /Prev : un enregistrement incremental remplace le contenu de la page', () => {
    const base = pdfClassique([...PAGE, rouge]);
    const vert = ajouter(base, [[4, flux('<< >>', '0 1 0 rg 0 0 50 50 re f')]], 5);
    const r = lu(vert);
    expect(r.dessin.formes.map(f => f.remplissage)).toEqual(['#00ff00']);
    // La version d'avant reste lisible pour qui ne lit que la premiere table : on lit la plus recente.
    expect(lu(base).dessin.formes.map(f => f.remplissage)).toEqual(['#ff0000']);
  });

  it('suit /XRefStm d un fichier hybride (table classique et table en flux)', () => {
    const moderne = pdfModerne([...PAGE, flux('<< >>', '0 0 1 rg 0 0 10 10 re f', true)]);
    const xrefFlux = Number(/startxref\s+(\d+)/.exec(moderne.toString('latin1'))?.[1]);
    // Une table classique vide qui ne fait que renvoyer a la table en flux, comme les fichiers hybrides de Word.
    const hybride = Buffer.concat([moderne.subarray(0, moderne.toString('latin1').lastIndexOf('startxref')), octets('xref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 7 /Root 1 0 R /XRefStm ' + xrefFlux + ' >>\n')]);
    const pos = moderne.toString('latin1').lastIndexOf('startxref');
    const fini = Buffer.concat([hybride, octets('startxref\n' + pos + '\n%%EOF\n')]);
    expect(lu(fini).dessin.formes.length).toBe(1);
  });

  it('corrige une section qui commence a 1 par l entree libre de l objet 0 (producteurs fautifs)', () => {
    const juste = pdfClassique([...PAGE, rouge]).toString('latin1');
    const faux = juste.replace(/xref\n0 5\n/, 'xref\n1 5\n');
    expect(lu(octets(faux)).dessin.formes.length).toBe(1);
  });

  it('retrouve les objets par balayage quand les decalages sont faux', () => {
    const juste = pdfClassique([...PAGE, rouge]).toString('latin1');
    const faux = juste.replace(/(\d{10}) 00000 n/g, (_, p: string) => String(Number(p) + 7).padStart(10, '0') + ' 00000 n');
    expect(lu(octets(faux)).dessin.formes[0]?.remplissage).toBe('#ff0000');
  });

  it('reconstruit la table d un fichier sans table ni startxref (tronque)', () => {
    const juste = pdfClassique([...PAGE, rouge]).toString('latin1');
    const tronque = juste.slice(0, juste.indexOf('xref')) + 'trailer\n<< /Root 1 0 R >>\n';
    expect(lu(octets(tronque)).dessin.formes.length).toBe(1);
    const sansTrailer = juste.slice(0, juste.indexOf('xref'));
    expect(lu(octets(sansTrailer)).dessin.formes.length).toBe(1);
  });

  it('reconstruit aussi un fichier PDF 1.5 dont la table en flux est perdue', () => {
    const moderne = pdfModerne([...PAGE, flux('<< >>', '0 0 1 rg 0 0 10 10 re f', true)]).toString('latin1');
    const casse = moderne.replace(/startxref\s+\d+/, 'startxref\n999999');
    expect(lu(octets(casse)).dessin.formes.length).toBe(1);
  });

  it('lit une longueur de flux donnee par renvoi, et se rattrape sur « endstream » quand elle est fausse', () => {
    const corps = '1 0 0 rg 0 0 10 10 re f';
    const parRenvoi = pdfClassique([...PAGE, '<< /Length 5 0 R >>\nstream\n' + corps + '\nendstream', String(corps.length)]);
    expect(lu(parRenvoi).dessin.formes.length).toBe(1);
    const fausse = pdfClassique([...PAGE, '<< /Length 3 >>\nstream\n' + corps + '\nendstream']);
    expect(lu(fausse).dessin.formes.length).toBe(1);
  });

  it('ne boucle pas sur une chaine /Prev circulaire', () => {
    const t = pdfClassique([...PAGE, rouge]).toString('latin1');
    const x = Number(/startxref\s+(\d+)/.exec(t)?.[1]);
    const boucle = t.replace('/Root 1 0 R >>', '/Root 1 0 R /Prev ' + x + ' >>');
    expect(lu(octets(boucle)).dessin.formes.length).toBe(1);
  });

  it('ne boucle pas sur une longueur qui renvoie a son propre objet', () => {
    const pdf = pdfClassique([...PAGE, '<< /Length 4 0 R >>\nstream\n1 0 0 rg 0 0 10 10 re f\nendstream']);
    expect(lu(pdf).dessin.formes.length).toBe(1);
  });
});

describe('les refus nommes', () => {
  it('refuse un fichier qui n est pas un PDF', () => {
    expect(refus(octets('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe('Ce fichier n’est pas un PDF : il ne commence pas par « %PDF- ».');
    expect(refus(new Uint8Array(0))).toMatch(/n’est pas un PDF/);
  });

  it('refuse un PDF chiffre, en disant comment s en sortir', () => {
    const t = pdfClassique([...PAGE, rouge], '/Root 1 0 R /Encrypt << /Filter /Standard /V 2 /R 3 /O <00> /U <00> /P -4 >>');
    expect(refus(t)).toBe('Ce PDF est chiffré (protégé par un mot de passe ou par des restrictions) : il ne s’ouvre pas ici. Enregistrez-en une copie sans protection depuis votre logiciel, puis rouvrez-la.');
  });

  it('refuse aussi un PDF chiffre dont la table est perdue', () => {
    const t = pdfClassique([...PAGE, rouge], '/Root 1 0 R /Encrypt 9 0 R').toString('latin1');
    expect(refus(octets(t.replace(/startxref\s+\d+/, 'startxref\n1')))).toMatch(/chiffré/);
  });

  it('refuse un PDF trop gros avant de rien lire', () => {
    const gros = new Uint8Array(LIMITES_PDF.octets + 1);
    gros.set(octets('%PDF-1.4\n'));
    expect(refus(gros)).toBe('Ce PDF pèse plus de 100 Mo : il est trop gros pour être lu ici.');
  });

  it('refuse un PDF sans objet ni catalogue lisible', () => {
    expect(refus(octets('%PDF-1.4\nrien ici\n%%EOF'))).toMatch(/aucun objet n’y a été trouvé/);
    expect(refus(octets('%PDF-1.4\n1 0 obj\n<< /Type /Foo >>\nendobj\n'))).toMatch(/catalogue de pages est introuvable/);
  });

  it('refuse un catalogue sans page, une page absente', () => {
    expect(refus(pdfClassique(['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [] /Count 0 >>']))).toBe('Ce PDF ne contient aucune page.');
    expect(refus(pdfUnePage('0 0 10 10 re f'), 3)).toBe('Ce PDF n’a pas de page 3 : il en compte 1.');
  });

  it('refuse une page sans trace en disant ce qu elle contenait', () => {
    expect(refus(pdfUnePage('BT /F1 12 Tf (a) Tj ET', { ressources: '/Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >>' })))
      .toBe('Cette page du PDF ne contient aucun tracé vectoriel à éditer (non repris : 1 texte (convertissez le texte en contours dans votre logiciel avant d’exporter le PDF)).');
  });

  it('dit le nombre de pages avec un refus de page, pour qu une autre puisse se choisir', () => {
    const deux = pdfClassique([
      '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 /MediaBox [0 0 100 100] >>',
      '<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>', flux('<< >>', ''),
      '<< /Type /Page /Parent 2 0 R /Contents 6 0 R >>', flux('<< >>', '0 0 10 10 re f')
    ]);
    const r = lu(deux, 2);
    expect(r.pages).toBe(2);
    const vide = refus(deux, 1);
    expect(vide).toMatch(/aucun tracé/);
  });

  it('porte la page dans le repere du dessin : origine en haut a gauche, Y vers le bas', () => {
    const r = lu(pdfUnePage('0 0 10 10 re f'));
    expect(enTexte(r.dessin.formes[0]?.d ?? [])).toBe('M0,100 L10,100 L10,90 L0,90 Z');
  });
});
