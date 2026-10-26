import { describe, it, expect } from 'vitest';
import { FORMES, genreAffiche, nomOutilForme, phraseAbandon, phraseBooleen, phraseIgnores, styleDeForme } from '../../../src/zones/aidesEditeur.js';
import { FORMES_DE_BASE, lireDessin, STYLE_DEFAUT } from '../../../src/engine/editionSvg.js';
import { GROUPES_FORMES } from '../../../src/zones/BarreOutils.js';
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

describe('les outils de forme (ADR-0033)', () => {
  it('traitent chaque forme de base comme un outil de trace, et la palette les range toutes, une fois chacune', () => {
    expect([...FORMES].sort()).toEqual([...FORMES_DE_BASE].sort());
    const rangees = GROUPES_FORMES.flatMap(g => g.formes);
    expect([...rangees].sort()).toEqual([...FORMES_DE_BASE].sort());
    expect(new Set(rangees).size).toBe(rangees.length);
    expect(GROUPES_FORMES.map(g => g.titre)).toEqual(['Basiques', 'Polygones', 'Symboles', 'Étiquettes', 'Traits']);
  });

  it('donnent aux traits le style d une ligne, aux autres le style courant', () => {
    const s = { remplissage: '#c81e28', contour: null, epaisseur: 2 };
    for (const f of ['ligne', 'arc', 'spirale', 'vague'] as const) expect(styleDeForme(f, s)).toEqual({ remplissage: null, contour: '#c81e28', epaisseur: 2 });
    expect(styleDeForme('coeur', s)).toBe(s);
    expect(styleDeForme('anneau', STYLE_DEFAUT)).toBe(STYLE_DEFAUT);
  });

  it('montrent un nom avec sa majuscule', () => {
    expect(nomOutilForme('coeur')).toBe('Cœur');
    expect(nomOutilForme('badge')).toBe('Badge festonné');
    expect(nomOutilForme('etoile')).toBe('Étoile');
  });
});
