import { describe, it, expect } from 'vitest';
import { phraseBooleen, phraseIgnores } from '../../../src/zones/aidesEditeur.js';

describe('phraseIgnores', () => {
  it('ne dit rien quand rien ne s est perdu', () => {
    expect(phraseIgnores([])).toBe('');
  });

  it('dit en une phrase ce qui n a pas ete repris, une seule fois chaque chose', () => {
    expect(phraseIgnores(['les animations', 'les pointillés (le trait s’écrit plein)']))
      .toBe('Non repris à l’ouverture : les animations ; les pointillés (le trait s’écrit plein). Le rendu peut différer de l’original.');
  });
});

describe('phraseBooleen', () => {
  it('dit l operation faite, le nombre de formes et de points, et la nature du contour', () => {
    expect(phraseBooleen('union', 2, 24, true)).toBe('Union faite : 2 formes, 24 points (courbes rebâties).');
    expect(phraseBooleen('union', 2, 318, false)).toBe('Union faite : 2 formes, 318 points en segments droits.');
    expect(phraseBooleen('soustraction', 3, 1, false)).toBe('Soustraction faite : 3 formes, 1 point en segments droits.');
    expect(phraseBooleen('intersection', 2, 8, true)).toMatch(/^Intersection faite/);
    expect(phraseBooleen('exclusion', 2, 8, true)).toMatch(/^Exclusion faite/);
  });
});
