import { describe, it, expect } from 'vitest';
import { insecables, pluriel } from '../../../src/util/texte.js';

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

describe('insecables', () => {
  it('pose une espace insecable avant ; : ? ! et », apres «, et nulle part ailleurs', () => {
    expect(insecables('Première fois ? Essayez : « Plus » ; voilà !')).toBe('Première fois\u00a0? Essayez\u00a0: «\u00a0Plus\u00a0»\u00a0; voilà\u00a0!');
    expect(insecables('Ctrl+Z, puis Tab.')).toBe('Ctrl+Z, puis Tab.');
    expect(insecables('déjà\u00a0: rien')).toBe('déjà\u00a0: rien');
  });
});
