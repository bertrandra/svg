// Les entrees volumineuses engendrees (volumineux.ts) : memes invariants que le corpus, avec un temps et un refus nomme quand
// c'est une limite qui doit mordre.

import { describe, it, expect } from 'vitest';
import { lireDessin } from '../../../src/engine/editionSvg.js';
import { passer } from './passage.js';
import { VOLUMINEUX } from './volumineux.js';

describe('les entrees volumineuses', () => {
  for (const v of VOLUMINEUX) {
    it(v.nom + ' : ' + v.vecteur, () => {
      const texte = v.genere();
      const p = passer(texte, v.budgetMs, v.deuxChemins !== false);
      expect(p.plantage, 'exception echappee').toBeNull();
      expect(p.defauts.join('\n')).toBe('');
      if (v.attendu !== null) expect(p.ouvre, p.refus.join(' | ')).toBe(v.attendu === 'ouvre');
      if (v.refus) expect(p.refus.join(' | ')).toContain(v.refus);
    }, 120_000);
  }

  it('un refus de limite est nomme en francais et dit ce qu\'il faut faire', () => {
    const r = lireDessin(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">${'<g>'.repeat(2000)}</svg>`);
    expect('erreur' in r && r.erreur).toBe('Ce SVG est trop profond (plus de 1024 niveaux d’éléments imbriqués) : simplifiez-le dans votre logiciel.');
  });
});
