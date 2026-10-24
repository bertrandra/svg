import { describe, it, expect } from 'vitest';
import { phraseIgnores } from '../../../src/zones/aidesEditeur.js';

describe('phraseIgnores', () => {
  it('ne dit rien quand rien ne s est perdu', () => {
    expect(phraseIgnores([])).toBe('');
  });

  it('dit en une phrase ce qui n a pas ete repris, une seule fois chaque chose', () => {
    expect(phraseIgnores(['les animations', 'les pointillés (le trait s’écrit plein)']))
      .toBe('Non repris à l’ouverture : les animations ; les pointillés (le trait s’écrit plein). Le rendu peut différer de l’original.');
  });
});
