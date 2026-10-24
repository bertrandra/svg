import { afterEach, describe, it, expect } from 'vitest';
import { definirBaseAnnexes, normaliserBase, urlAnnexe } from '../../../src/io/annexes.js';

afterEach(() => definirBaseAnnexes(''));

describe('normaliserBase', () => {
  it('ajoute la barre finale, sauf pour une base vide ou deja terminee', () => {
    expect(normaliserBase('')).toBe('');
    expect(normaliserBase('  ')).toBe('');
    expect(normaliserBase('../dist')).toBe('../dist/');
    expect(normaliserBase('/static/svg/')).toBe('/static/svg/');
    expect(normaliserBase('https://cdn.exemple.fr/svg')).toBe('https://cdn.exemple.fr/svg/');
  });
});

describe('urlAnnexe', () => {
  it('rend le nom nu par defaut : a cote de la page, comme avant', () => {
    expect(urlAnnexe('bibliotheque.js')).toBe('bibliotheque.js');
  });

  it('range les annexes sous la base donnee, et revient au defaut', () => {
    definirBaseAnnexes('../dist');
    expect(urlAnnexe('polices.js')).toBe('../dist/polices.js');
    definirBaseAnnexes('');
    expect(urlAnnexe('polices.js')).toBe('polices.js');
  });
});
