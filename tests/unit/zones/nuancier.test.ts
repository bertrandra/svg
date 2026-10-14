import { describe, it, expect } from 'vitest';
import { lireNuancier, ecrireNuancier } from '../../../src/zones/nuancier.js';

describe('lireNuancier', () => {
  it('lit un nom et un code par ligne, en passant ce qui ne se lit pas et les doublons', () => {
    expect(lireNuancier('Rouge #C81E28\nBleu : #1428a0\n#fff, Rouge bis #c81e28\nn importe quoi\n#12')).toEqual([
      { nom: 'Rouge', hex: '#c81e28' }, { nom: 'Bleu', hex: '#1428a0' }, { nom: '#ffffff', hex: '#ffffff' }
    ]);
  });

  it('se reecrit tel qu on le retape', () => {
    const t = lireNuancier('Rouge #c81e28\n#ffffff');
    expect(ecrireNuancier(t)).toBe('Rouge #c81e28\n#ffffff');
    expect(lireNuancier(ecrireNuancier(t))).toEqual(t);
  });
});
