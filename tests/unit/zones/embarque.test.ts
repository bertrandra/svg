import { describe, it, expect } from 'vitest';
import { stockageMemoire } from '../../../src/io/stockage.js';
import { estEditable, stockageDe, verifierOptions } from '../../../src/zones/embarque.js';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0L10 0L10 10Z" fill="#c81e28"/></svg>';
const ok = (): void => undefined;

describe('verifierOptions', () => {
  it('accepte le minimum : un svg et onEnregistrer', () => {
    expect(verifierOptions({ svg: SVG, onEnregistrer: ok })).toBeNull();
  });

  it('accepte toutes les options', () => {
    expect(verifierOptions({
      svg: SVG, titre: 'logo.svg', nom: 'logo', nuancier: [{ nom: 'Rouge', hex: '#c81e28' }], bibliotheque: 'a-charger', baseAnnexes: '../dist',
      fermerApresEnregistrer: false, stockage: stockageMemoire(), onEnregistrer: ok, onFermer: ok, onBrouillon: ok
    })).toBeNull();
  });

  it('accepte « stockage » absent, false, null, ou un objet de trois fonctions', () => {
    expect(verifierOptions({ svg: SVG, onEnregistrer: ok, stockage: undefined })).toBeNull();
    expect(verifierOptions({ svg: SVG, onEnregistrer: ok, stockage: false })).toBeNull();
    expect(verifierOptions({ svg: SVG, onEnregistrer: ok, stockage: null })).toBeNull();
    expect(verifierOptions({ svg: SVG, onEnregistrer: ok, stockage: { lire: ok, ecrire: ok, retirer: ok } })).toBeNull();
  });

  it('refuse un « stockage » qui n est ni false, ni null, ni un stockage', () => {
    expect(verifierOptions({ svg: SVG, onEnregistrer: ok, stockage: true })).toMatch(/« stockage »/);
    expect(verifierOptions({ svg: SVG, onEnregistrer: ok, stockage: 'local' })).toMatch(/« stockage »/);
    expect(verifierOptions({ svg: SVG, onEnregistrer: ok, stockage: {} })).toMatch(/« stockage »/);
    expect(verifierOptions({ svg: SVG, onEnregistrer: ok, stockage: { lire: ok, ecrire: ok } })).toMatch(/« stockage »/);
  });

  it('nomme ce qui manque ou ne convient pas', () => {
    expect(verifierOptions(undefined)).toMatch(/objet d’options/);
    expect(verifierOptions({ onEnregistrer: ok })).toMatch(/« svg »/);
    expect(verifierOptions({ svg: '  ', onEnregistrer: ok })).toMatch(/« svg »/);
    expect(verifierOptions({ svg: SVG })).toMatch(/« onEnregistrer » est obligatoire/);
    expect(verifierOptions({ svg: SVG, onEnregistrer: ok, onFermer: 3 })).toMatch(/« onFermer »/);
    expect(verifierOptions({ svg: SVG, onEnregistrer: ok, nuancier: 'rouge' })).toMatch(/« nuancier »/);
    expect(verifierOptions({ svg: SVG, onEnregistrer: ok, bibliotheque: 'jamais' })).toMatch(/« bibliotheque »/);
    expect(verifierOptions({ svg: SVG, onEnregistrer: ok, baseAnnexes: 4 })).toMatch(/« baseAnnexes »/);
    expect(verifierOptions({ svg: SVG, onEnregistrer: ok, fermerApresEnregistrer: 'oui' })).toMatch(/« fermerApresEnregistrer »/);
  });
});

describe('estEditable', () => {
  it('dit oui pour un SVG de formes, non pour une image enveloppee, un texte quelconque ou autre chose qu un texte', () => {
    expect(estEditable(SVG)).toBe(true);
    expect(estEditable('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><image href="data:image/png;base64,AAAA" width="4" height="4"/></svg>')).toBe(false);
    expect(estEditable('pas un svg')).toBe(false);
    expect(estEditable(undefined)).toBe(false);
    expect(estEditable(42)).toBe(false);
  });
});

describe('stockageDe', () => {
  it('donne le stockage du navigateur quand l hote ne dit rien (le comportement d avant l option)', () => {
    expect(stockageDe(undefined)).not.toBeNull();
  });

  it('ne donne rien pour false ou null : l editeur ne garde alors rien', () => {
    expect(stockageDe(false)).toBeNull();
    expect(stockageDe(null)).toBeNull();
  });

  it('donne celui de l hote, rendu sur : un stockage qui leve se lit comme refuse', () => {
    const hote = stockageMemoire();
    const s = stockageDe(hote);
    expect(s?.ecrire('cle', 1)).toBe(true);
    expect(hote.lire('cle')).toBe(1);
    const casse = stockageDe({ lire: () => { throw new Error('boum'); }, ecrire: () => { throw new Error('boum'); }, retirer: () => { throw new Error('boum'); } });
    expect(casse?.lire('cle')).toBeNull();
    expect(casse?.ecrire('cle', 1)).toBe(false);
    expect(() => casse?.retirer('cle')).not.toThrow();
  });
});

describe('verifierOptions : le libelle du bouton de fin', () => {
  it('accepte un texte d une ligne de 1 a 40 caracteres, et son absence', () => {
    for (const libelleEnregistrer of [undefined, 'Valider', 'Mettre à jour le logo', '  Terminer  ', 'x'.repeat(40), '✓ Fini']) {
      expect(verifierOptions({ svg: SVG, onEnregistrer: ok, libelleEnregistrer }), String(libelleEnregistrer)).toBeNull();
    }
  });

  it('refuse, en francais, ce qui n est pas un libelle de bouton', () => {
    expect(verifierOptions({ svg: SVG, onEnregistrer: ok, libelleEnregistrer: 12 })).toBe('L’option « libelleEnregistrer » doit être un texte, par exemple « Valider ».');
    expect(verifierOptions({ svg: SVG, onEnregistrer: ok, libelleEnregistrer: null })).toMatch(/doit être un texte/);
    expect(verifierOptions({ svg: SVG, onEnregistrer: ok, libelleEnregistrer: '   ' })).toBe('L’option « libelleEnregistrer » ne peut pas être vide : sans elle, le bouton dit « Enregistrer ».');
    expect(verifierOptions({ svg: SVG, onEnregistrer: ok, libelleEnregistrer: 'Deux\nlignes' })).toBe('L’option « libelleEnregistrer » doit tenir sur une ligne, sans caractère de contrôle.');
    expect(verifierOptions({ svg: SVG, onEnregistrer: ok, libelleEnregistrer: 'a\u0000b' })).toMatch(/sur une ligne/);
    expect(verifierOptions({ svg: SVG, onEnregistrer: ok, libelleEnregistrer: 'x'.repeat(41) })).toBe('L’option « libelleEnregistrer » dépasse 40 caractères : le bouton ne tiendrait plus dans la barre.');
  });
});
