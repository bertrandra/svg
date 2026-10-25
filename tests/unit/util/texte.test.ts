import { describe, it, expect } from 'vitest';
import { distanceEdition, pluriel } from '../../../src/util/texte.js';

describe('pluriel', () => {
  it('laisse au singulier zero et un', () => {
    expect(pluriel(0, 'forme')).toBe('0 forme');
    expect(pluriel(1, 'forme')).toBe('1 forme');
  });

  it('met un s des deux', () => {
    expect(pluriel(2, 'forme')).toBe('2 formes');
    expect(pluriel(5000, 'point')).toBe('5000 points');
  });

  it('accepte un mot compose sans le toucher', () => {
    expect(pluriel(3, 'petite forme')).toBe('3 petite formes');
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
