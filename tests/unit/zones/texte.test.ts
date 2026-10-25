// Les aides du texte vivant cote interface (ADR-0022) : le mode de vectorisation selon le contexte, l'epaisseur d'un trait,
// le texte modifie, et la phrase qui dit qu'un outil a vectorise un texte.

import { describe, expect, it } from 'vitest';
import type { DessinSvg, Forme } from '../../../src/engine/editionSvg.js';
import { largeurTrait, modeParDefaut, nomDePolice, texteModifie } from '../../../src/zones/actionsTexte.js';
import { avecVectorisation, PHRASE_TEXTE_VECTORISE } from '../../../src/zones/phrasesTexte.js';
import { CHOIX_CRICUT_DEFAUT, CHOIX_GENERIQUE } from '../../../src/model/contextes.js';
import { nouveauTexte } from '../../../src/engine/texte/vivant.js';

const texte = nouveauTexte('Bonjour', { id: 'inter', version: '0123456789abcd' }, 20, [1, 0, 0, 1, 0, 0]);
const forme = (id: string, avecTexte: boolean): Forme => ({ id, d: [{ c: 'M', p: [0, 0] }, { c: 'L', p: [1, 1] }, { c: 'Z', p: [] }], remplissage: '#000000', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, ...(avecTexte ? { texte } : {}) });

describe('le texte vivant dans l interface', () => {
  it('souder par defaut en decoupe Cricut, lettres separees ailleurs', () => {
    expect(modeParDefaut(CHOIX_GENERIQUE)).toBe('lettres');
    expect(modeParDefaut({ contexte: 'cricut', ...CHOIX_CRICUT_DEFAUT })).toBe('souder-touchantes');
    expect(modeParDefaut({ contexte: 'cricut', ...CHOIX_CRICUT_DEFAUT, procede: 'imprimer-decouper' })).toBe('lettres');
  });

  it('le trait d une police a trait : le stylo du profil, sinon un vingtieme de la taille', () => {
    expect(largeurTrait(40, null)).toBe(2);
    expect(largeurTrait(40, { largeurStylo: 1.512 } as never)).toBe(1.512);
  });

  it('un texte modifie garde ce qu on ne change pas, et prend la version de la police choisie', () => {
    const m = texteModifie(texte, { texte: 'Salut', police: { id: 'lobster', nom: 'Lobster', version: 'ffffffffffffff', nature: 'contour', glyphes: null as never } });
    expect(m).toMatchObject({ texte: 'Salut', taille: 20, police: { id: 'lobster', version: 'ffffffffffffff' } });
    expect(m.police.famille).toBeUndefined();
    const deposee = texteModifie(texte, { police: { id: 'u-0123456789abcd', nom: 'Ma Fonte', version: '0123456789abcd', nature: 'contour', glyphes: null as never } });
    expect(deposee.police).toEqual({ id: 'u-0123456789abcd', version: '0123456789abcd', famille: 'Ma Fonte' });
  });

  it('nomme une police livree, une deposee connue, ou sa famille gardee', () => {
    expect(nomDePolice('ems-readability', null)).toBe('EMS Readability (trait unique)');
    expect(nomDePolice('u-0123456789abcd', null, 'Ma Fonte')).toBe('Ma Fonte');
  });

  it('dit qu un outil a vectorise un texte, et seulement alors', () => {
    const d: DessinSvg = { vb: [0, 0, 10, 10], formes: [forme('f1', true), forme('f2', false), forme('f3', true)] };
    expect(avecVectorisation('Fait.', d, ['f2'])).toBe('Fait.');
    expect(avecVectorisation('Fait.', d, ['f1', 'f2'])).toBe('Fait. ' + PHRASE_TEXTE_VECTORISE);
    expect(avecVectorisation('Fait.', d, ['f1', 'f3'])).toMatch(/^Fait\. Les 2 textes sont vectorisés/);
  });
});
