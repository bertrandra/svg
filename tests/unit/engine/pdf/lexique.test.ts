// Le decoupage d'un PDF en objets (ISO 32000-1, 7.2 et 7.3) : nombres, noms, chaines, tableaux, dictionnaires, renvois.

import { describe, it, expect } from 'vitest';
import { Lecteur, lireObjet, chercher, chercherAvant } from '../../../../src/engine/pdf/lexique.js';
import { Mot, type ObjetPdf } from '../../../../src/engine/pdf/objets.js';
import { SyntaxePdf } from '../../../../src/engine/pdf/limites.js';
import { octets } from './fabrique.js';

const objet = (t: string, renvois = true) => lireObjet(new Lecteur(octets(t)), renvois);
const tous = (t: string, renvois = false): Array<ObjetPdf | Mot> => {
  const l = new Lecteur(octets(t)), r: Array<ObjetPdf | Mot> = [];
  for (let o = lireObjet(l, renvois); o !== undefined; o = lireObjet(l, renvois)) r.push(o);
  return r;
};
const motsDe = (r: Array<ObjetPdf | Mot>) => r.map(o => (o instanceof Mot ? '«' + o.v + '»' : o));

describe('les nombres', () => {
  it('lit entiers, reels, signes et points sans chiffre avant', () => {
    expect(tous('0 42 -17 +3 3.25 -.5 .75 4. -0')).toEqual([0, 42, -17, 3, 3.25, -0.5, 0.75, 4, 0]);
  });
  it('lit les signes doubles des producteurs fautifs comme les lecteurs courants', () => {
    expect(tous('--5')).toEqual([-5]);
  });
  it('ne lit pas d exposant (le PDF n en a pas) : 1e5 est le nombre 1 suivi d un mot', () => {
    expect(motsDe(tous('1e5'))).toEqual([1, '«e5»']);
  });
  it('garde un nombre fini, quelle que soit sa longueur', () => {
    const v = tous('9'.repeat(400));
    expect(v.length).toBe(1);
    expect(Number.isFinite(v[0])).toBe(true);
  });
});

describe('les noms', () => {
  it('lit un nom et decode ses #xx', () => {
    expect(tous('/Type /A#20B /Sp#e9cial /')).toEqual(['Type', 'A B', 'Spécial', '']);
  });
  it('coupe un nom aux delimiteurs', () => {
    expect(motsDe(tous('/A/B[/C]'))).toEqual(['A', 'B', ['C']]);
  });
  it('refuse un nom demesure', () => {
    expect(() => tous('/' + 'a'.repeat(2000))).toThrow(SyntaxePdf);
  });
});

describe('les chaines', () => {
  it('lit les echappements, les parentheses imbriquees, l octal et la ligne continuee', () => {
    expect(objet('(a\\(b\\)c (d) \\n\\t\\101\\0151\\\\ e\\\nf)')).toEqual({ t: 'chaine', v: 'a(b)c (d) \n\tA\r1\\ ef' });
  });
  it('lit une chaine hexadecimale, blancs ignores, chiffre impair complete par 0', () => {
    expect(objet('<48 65 6C6c6F 7>')).toEqual({ t: 'chaine', v: 'Hellop' });
  });
  it('refuse une chaine jamais fermee', () => {
    expect(() => objet('(abc')).toThrow(SyntaxePdf);
    expect(() => objet('<4142')).toThrow(SyntaxePdf);
    expect(() => objet('<41 zz>')).toThrow(SyntaxePdf);
  });
  it('lit une tres longue chaine sans deborder la pile', () => {
    const r = objet('(' + 'x'.repeat(200_000) + ')');
    expect((r as { v: string }).v.length).toBe(200_000);
  });
});

describe('les tableaux, dictionnaires et renvois', () => {
  it('lit un dictionnaire imbrique avec renvois, booleens et null (une valeur nulle vaut une cle absente)', () => {
    const d = objet('<< /Type /Page /Kids [1 0 R 2 0 R] /Vu true /Non false /Rien null /Sous << /N 3 >> >>');
    expect(d).toBeInstanceOf(Map);
    const m = d as Map<string, ObjetPdf>;
    expect(m.get('Type')).toBe('Page');
    expect(m.get('Kids')).toEqual([{ t: 'ref', n: 1, g: 0 }, { t: 'ref', n: 2, g: 0 }]);
    expect([m.get('Vu'), m.get('Non'), m.has('Rien')]).toEqual([true, false, false]);
    expect((m.get('Sous') as Map<string, ObjetPdf>).get('N')).toBe(3);
  });
  it('ne lit pas de renvoi dans un flux de contenu : « 1 0 R » y est trois jetons', () => {
    expect(motsDe(tous('1 0 R', false))).toEqual([1, 0, '«R»']);
    expect(motsDe(tous('1 0 m', true))).toEqual([1, 0, '«m»']);
  });
  it('saute les commentaires', () => {
    expect(motsDe(tous('1 % un commentaire\n2 re'))).toEqual([1, 2, '«re»']);
  });
  it('lit les operateurs de texte faits de guillemets et les mots a etoile', () => {
    expect(motsDe(tous("(a) ' f* T* d0"))).toEqual([{ t: 'chaine', v: 'a' }, "«'»", '«f*»', '«T*»', '«d0»']);
  });
  it('refuse un tableau ou un dictionnaire jamais ferme, une cle qui n est pas un nom', () => {
    expect(() => objet('[1 2')).toThrow(SyntaxePdf);
    expect(() => objet('<< /A 1')).toThrow(SyntaxePdf);
    expect(() => objet('<< 1 2 >>')).toThrow(SyntaxePdf);
    expect(() => objet('[1 obj]')).toThrow(SyntaxePdf);
  });
  it('borne l imbrication', () => {
    expect(() => objet('['.repeat(300) + ']'.repeat(300))).toThrow(/imbriqués sur plus de 256 niveaux/);
    expect(objet('['.repeat(200) + ']'.repeat(200))).toBeTruthy();
  });
  it('refuse un « > » ou une « ) » isoles', () => {
    expect(() => tous('1 > 2')).toThrow(SyntaxePdf);
    expect(() => tous(') 2')).toThrow(SyntaxePdf);
  });
});

describe('la recherche d un motif', () => {
  it('trouve en avant et en arriere, dans les bornes', () => {
    const o = octets('abc startxref 12 startxref 34');
    expect(chercher(o, 'startxref', 0)).toBe(4);
    expect(chercher(o, 'startxref', 5)).toBe(17);
    expect(chercher(o, 'startxref', 5, 20)).toBe(-1);
    expect(chercherAvant(o, 'startxref', o.length)).toBe(17);
    expect(chercherAvant(o, 'startxref', 17)).toBe(4);
    expect(chercherAvant(o, 'startxref', 17, 5)).toBe(-1);
  });
});
