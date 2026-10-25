import { describe, it, expect } from 'vitest';
import { genreAffiche, phraseAbandon, phraseBooleen, phraseIgnores } from '../../../src/zones/aidesEditeur.js';
import { lireDessin } from '../../../src/engine/editionSvg.js';
import { au } from '../../../src/util/tableaux.js';

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

describe('phraseAbandon', () => {
  it('accorde la question : « la modification » seule, « les N modifications » au-dela (« les 1 modification » etait une faute)', () => {
    expect(phraseAbandon(1)).toBe('Abandonner la modification non enregistrée ?');
    expect(phraseAbandon(2)).toBe('Abandonner les 2 modifications non enregistrées ?');
    expect(phraseAbandon(12)).toBe('Abandonner les 12 modifications non enregistrées ?');
  });

  it('dit le contexte change quand le dessin n a pas bouge', () => {
    expect(phraseAbandon(0)).toBe('Abandonner le changement de contexte non enregistré ?');
  });
});

describe('genreAffiche', () => {
  const lu = lireDessin('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160"><rect x="16" y="16" width="208" height="128" fill="#e9ecef"/>'
    + '<circle cx="80" cy="80" r="40" fill="#c81e28"/><path d="M130 120 L170 40 L210 120 Z" fill="#1428a0"/><path d="M40 130 Q120 90 200 130" fill="none" stroke="#15181d"/></svg>');
  if ('erreur' in lu) throw new Error(lu.erreur);
  const formes = lu.dessin.formes;

  it('nomme une forme par son genre, la majuscule en tete', () => {
    expect(formes.map(genreAffiche)).toEqual(['Rectangle', 'Cercle', 'Triangle', 'Courbe']);
  });

  it('rend le meme texte pour la meme forme, calcule une fois', () => {
    const f = au(formes, 1);
    expect(genreAffiche(f)).toBe(genreAffiche(f));
  });
});
