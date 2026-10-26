import { describe, expect, it } from 'vitest';
import { graduations, lireValeur, pasMajeur, texteValeur, uniteRegle } from '../../../src/zones/graduations.js';
import { estPointVirgule } from '../../../src/zones/ClavierOutilsPro.js';

// Les regles (ADR-0038) : des pas lisibles, l'unite du plan ou celle du profil de production, et les champs qui la lisent.

describe('les graduations des regles', () => {
  it('prennent un pas de 1, 2 ou 5 fois une puissance de dix, assez large pour les libelles', () => {
    expect(pasMajeur(1)).toBe(100);
    expect(pasMajeur(2)).toBe(50);
    expect(pasMajeur(0.5)).toBe(200);
    expect(pasMajeur(100)).toBe(1);
  });

  it('placent les traits a l ecran depuis le zero du plan, majeurs tous les cinq', () => {
    const t = graduations(400, 0, 2, uniteRegle(null));
    const majeurs = t.filter(x => x.majeur);
    expect(majeurs.map(x => x.texte)).toEqual(['0', '50', '100', '150', '200']);
    expect(majeurs.map(x => x.px)).toEqual([0, 100, 200, 300, 400]);
    expect(t.length).toBe(21);
    // Un plan decale : le zero est a 50 px, les valeurs negatives a sa gauche.
    expect(graduations(200, 50, 1, uniteRegle(null)).filter(x => x.majeur).map(x => x.texte)).toEqual(['0', '100']);
    expect(graduations(0, 0, 1, uniteRegle(null))).toEqual([]);
  });

  it('parlent en millimetres ou en pouces en contexte de production', () => {
    const mm = uniteRegle('mm'), po = uniteRegle('in');
    expect(texteValeur(96, mm)).toBe('25,4 mm');
    expect(texteValeur(96, po)).toBe('1 po');
    expect(texteValeur(12.5, uniteRegle(null))).toBe('12,5');
    expect(lireValeur('25,4', mm)).toBeCloseTo(96, 9);
    expect(lireValeur(' 1 ', po)).toBe(96);
    expect(lireValeur('abc', mm)).toBeNull();
    // Au zoom 1, un millimetre fait 3,78 px : le pas majeur est de 20 mm, ses libelles en millimetres.
    expect(graduations(200, 0, 1, mm).filter(x => x.majeur).map(x => x.texte)).toEqual(['0', '20', '40']);
  });
});

describe('le point-virgule des raccourcis', () => {
  it('se lit par son caractere ou par sa place, en QWERTY comme en AZERTY', () => {
    expect(estPointVirgule({ key: ';', code: 'Comma', shiftKey: false })).toBe(true);
    expect(estPointVirgule({ key: '…', code: 'Semicolon', shiftKey: false })).toBe(true);
    expect(estPointVirgule({ key: ':', code: 'Semicolon', shiftKey: true })).toBe(true);
    expect(estPointVirgule({ key: '.', code: 'Comma', shiftKey: true })).toBe(true);
    expect(estPointVirgule({ key: '.', code: 'Period', shiftKey: false })).toBe(false);
  });
});
