import { describe, it, expect } from 'vitest';
import { pluriel } from '../../../src/util/texte.js';

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
