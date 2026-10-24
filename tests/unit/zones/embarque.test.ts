import { describe, it, expect } from 'vitest';
import { estEditable, verifierOptions } from '../../../src/zones/embarque.js';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0L10 0L10 10Z" fill="#c81e28"/></svg>';
const ok = (): void => undefined;

describe('verifierOptions', () => {
  it('accepte le minimum : un svg et onEnregistrer', () => {
    expect(verifierOptions({ svg: SVG, onEnregistrer: ok })).toBeNull();
  });

  it('accepte toutes les options', () => {
    expect(verifierOptions({
      svg: SVG, titre: 'logo.svg', nom: 'logo', nuancier: [{ nom: 'Rouge', hex: '#c81e28' }], bibliotheque: 'a-charger', baseAnnexes: '../dist',
      fermerApresEnregistrer: false, onEnregistrer: ok, onFermer: ok, onBrouillon: ok
    })).toBeNull();
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
