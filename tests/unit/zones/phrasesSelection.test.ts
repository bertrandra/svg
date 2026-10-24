import { describe, expect, it } from 'vitest';
import { lireDessin, ordonner, type DessinSvg } from '../../../src/engine/editionSvg.js';
import {
  empilementChange, phraseAlignement, phraseCombinaison, phraseDuplication, phraseMasquage, phraseMiroir, phraseOrdre, phraseVerrouillage
} from '../../../src/zones/phrasesSelection.js';

const dessin = (): DessinSvg => {
  const r = lireDessin('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0h10v10z"/><path d="M20 0h10v10z"/><path d="M40 0h10v10z"/></svg>');
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};

describe('les phrases de la rangee de la selection', () => {
  it('dit l alignement, au singulier sur le plan et au pluriel entre formes', () => {
    expect(phraseAlignement('gauche', 1)).toBe('Alignée à gauche sur le plan.');
    expect(phraseAlignement('centreH', 1)).toBe('Centrée horizontalement sur le plan.');
    expect(phraseAlignement('droite', 3)).toBe('3 formes alignées à droite.');
    expect(phraseAlignement('centreV', 2)).toBe('2 formes centrées verticalement.');
    expect(phraseAlignement('haut', 2)).toBe('2 formes alignées en haut.');
    expect(phraseAlignement('bas', 1)).toBe('Alignée en bas sur le plan.');
  });

  it('dit le sens du miroir', () => {
    expect(phraseMiroir('h')).toBe('Miroir horizontal.');
    expect(phraseMiroir('v')).toBe('Miroir vertical.');
  });

  it('dit le changement de plan, ou que rien n a bouge', () => {
    expect(phraseOrdre('avant', 1, true)).toBe('Avancée d’un plan.');
    expect(phraseOrdre('arriere', 2, true)).toBe('2 formes reculées d’un plan.');
    expect(phraseOrdre('premier', 1, true)).toBe('Placée au premier plan.');
    expect(phraseOrdre('dernier', 3, true)).toBe('3 formes placées à l’arrière-plan.');
    expect(phraseOrdre('premier', 1, false)).toBe('Déjà au premier plan.');
    expect(phraseOrdre('avant', 1, false)).toBe('Déjà au premier plan.');
    expect(phraseOrdre('dernier', 2, false)).toBe('Déjà à l’arrière-plan.');
    expect(phraseOrdre('arriere', 2, false)).toBe('Déjà à l’arrière-plan.');
  });

  it('sait si un geste d empilement a vraiment bouge quelque chose', () => {
    const d = dessin();
    expect(empilementChange(d, ordonner(d, ['f1'], 'avant'))).toBe(true);
    expect(empilementChange(d, ordonner(d, ['f3'], 'premier'))).toBe(false);
    expect(empilementChange(d, ordonner(d, ['f1'], 'dernier'))).toBe(false);
    expect(empilementChange(d, ordonner(d, ['f2', 'f3'], 'avant'))).toBe(false);
  });

  it('dit la duplication, le masquage, le verrouillage et la combinaison', () => {
    expect(phraseDuplication(['f5'])).toBe('Forme 5 dupliquée.');
    expect(phraseDuplication(['f5', 'f6', 'f7'])).toBe('3 formes dupliquées.');
    expect(phraseMasquage(1)).toBe('Masquée : affichez-la dans les calques.');
    expect(phraseMasquage(3)).toBe('3 formes masquées : affichez-les dans les calques.');
    expect(phraseVerrouillage(1)).toBe('Verrouillée : déverrouillez-la dans les calques.');
    expect(phraseVerrouillage(2)).toBe('2 formes verrouillées : déverrouillez-les dans les calques.');
    expect(phraseCombinaison(3)).toMatch(/^3 formes combinées en une\. /);
  });
});
