import { describe, it, expect } from 'vitest';
import { auPluriel, distanceEdition, pluriel, selonSaisie } from '../../../src/util/texte.js';

describe('pluriel', () => {
  it('laisse au singulier zero et un', () => {
    expect(pluriel(0, 'forme')).toBe('0 forme');
    expect(pluriel(1, 'forme')).toBe('1 forme');
  });

  it('met un s des deux', () => {
    expect(pluriel(2, 'forme')).toBe('2 formes');
    expect(pluriel(5000, 'point')).toBe('5000 points');
  });

  it('laisse invariables les mots termines par s, x ou z (« 2 tapiss » etait une faute)', () => {
    expect(pluriel(2, 'tapis')).toBe('2 tapis');
    expect(pluriel(1, 'tapis')).toBe('1 tapis');
    expect(pluriel(3, 'prix')).toBe('3 prix');
    expect(pluriel(4, 'nez')).toBe('4 nez');
    expect(auPluriel('Tapis')).toBe('Tapis');
  });

  it('accorde une expression mot a mot (« 3 petite formes » etait une faute)', () => {
    expect(pluriel(3, 'petite forme')).toBe('3 petites formes');
    expect(pluriel(1, 'petite forme')).toBe('1 petite forme');
    expect(auPluriel('forme masquée')).toBe('formes masquées');
  });
});

describe('selonSaisie', () => {
  it('rend la phrase telle quelle a la souris', () => {
    const p = 'Cliquez une forme ; double-clic pour ses points.';
    expect(selonSaisie(p, false)).toBe(p);
  });

  it('dit le geste du doigt : toucher, toucher deux fois, un appui', () => {
    expect(selonSaisie('Cliquez une forme, ou tracez un cadre.', true)).toBe('Touchez une forme, ou tracez un cadre.');
    expect(selonSaisie('Plume : cliquez les points du tracé.', true)).toBe('Plume : touchez les points du tracé.');
    expect(selonSaisie('Double-cliquez la forme pour éditer ses points.', true)).toBe('Touchez deux fois la forme pour éditer ses points.');
    expect(selonSaisie('Entrée ou double-clic ferme le tracé.', true)).toBe('Entrée ou double appui ferme le tracé.');
    expect(selonSaisie('Un clic insère au centre.', true)).toBe('Un appui insère au centre.');
  });

  it('garde ce qui vaut pour les deux : glisser, choisir, les mots qui contiennent « clic » sans etre le verbe', () => {
    expect(selonSaisie('Glissez sur la toile pour tracer.', true)).toBe('Glissez sur la toile pour tracer.');
    expect(selonSaisie('Cliquezvous', true)).toBe('Cliquezvous');
  });
});

describe('distanceEdition', () => {
  it('compte insertions, suppressions, substitutions et inversions de deux lettres voisines', () => {
    expect(distanceEdition('chat', 'chat')).toBe(0);
    expect(distanceEdition('guitarre', 'guitare')).toBe(1);
    expect(distanceEdition('halowen', 'halloween')).toBe(2);
    expect(distanceEdition('lpain', 'lapin')).toBe(1);
    expect(distanceEdition('chien', 'chine')).toBe(1);
    expect(distanceEdition('', 'abc', 3)).toBe(3);
  });

  it('s arrete au-dela du plafond et rend plafond + 1', () => {
    expect(distanceEdition('xyzzy', 'lapin')).toBe(3);
    expect(distanceEdition('a', 'abcdef')).toBe(3);
    expect(distanceEdition('abcdef', 'ghijkl', 1)).toBe(2);
  });
});
