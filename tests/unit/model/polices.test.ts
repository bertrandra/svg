// La regle de remplacement d'une police absente : en donnees, lue dans l'ordre, toujours une fonte embarquee.

import { describe, it, expect } from 'vitest';
import { nomLisible, phraseRemplacement, remplacerFamilles, remplacerPolice, stylesLivres, NOMS_POLICES, REGLES_POLICES } from '../../../src/model/polices.js';

const id = (nom: string, gras?: boolean, italique?: boolean) => remplacerPolice({ nom, ...(gras === undefined ? {} : { gras }), ...(italique === undefined ? {} : { italique }) }).id;

describe('les styles d une famille livree', () => {
  it('regroupent Inter et Inter gras sous une famille, depuis l une ou l autre', () => {
    const attendu = [{ id: 'inter', nom: 'Normal' }, { id: 'inter-gras', nom: 'Gras' }];
    expect(stylesLivres('inter')).toEqual(attendu);
    expect(stylesLivres('inter-gras')).toEqual(attendu);
  });

  it('n existent pas pour une famille d un seul style, ni hors des fontes livrees', () => {
    expect(stylesLivres('oswald')).toEqual([]);
    expect(stylesLivres('c-0123456789abcd')).toEqual([]);
    expect(stylesLivres('u-perso')).toEqual([]);
  });
});

describe('le remplacement des polices', () => {
  it('garde une fonte embarquee demandee par son nom, sans rien dire', () => {
    for (const n of ['Inter', 'Lobster', 'Bebas Neue', 'BebasNeue-Regular', 'ABCDEF+Pacifico-Regular', 'Playfair Display', 'Caveat', 'Fredoka SemiBold', 'Oswald']) {
      expect(remplacerPolice({ nom: n }).exacte, n).toBe(true);
    }
    expect(remplacerPolice({ nom: 'Inter', gras: true }).id).toBe('inter-gras');
  });

  it('lineales vers Inter (gras vers Inter gras), empattements vers Playfair, etroites vers Oswald', () => {
    expect([id('Helvetica'), id('Arial-BoldMT'), id('ABCDEF+ArialMT'), id('Helvetica-Bold'), id('Roboto', true), id('PT Sans')]).toEqual(['inter', 'inter-gras', 'inter', 'inter-gras', 'inter-gras', 'inter']);
    expect([id('Times-Roman'), id('TimesNewRomanPSMT'), id('Georgia'), id('Garamond')]).toEqual(['playfair', 'playfair', 'playfair', 'playfair']);
    expect([id('Impact'), id('Arial Narrow'), id('League Gothic')]).toEqual(['oswald', 'oswald', 'oswald']);
  });

  it('manuscrites vers Caveat, scriptes vers Pacifico, arrondies vers Fredoka, chasse fixe et inconnues vers Inter', () => {
    expect([id('Comic Sans MS'), id('Permanent Marker')]).toEqual(['caveat', 'caveat']);
    expect([id('Brush Script MT'), id('Great Vibes'), id('ZapfChancery-MediumItalic')]).toEqual(['pacifico', 'pacifico', 'pacifico']);
    expect([id('Nunito'), id('Arial Rounded MT Bold')]).toEqual(['fredoka', 'fredoka']);
    expect([id('Courier'), id('Courier-Bold'), id('Wingdings'), id('MaPoliceAMoi')]).toEqual(['inter', 'inter-gras', 'inter', 'inter']);
  });

  it('penche une italique demandee (aucune fonte embarquee ne l est)', () => {
    expect(remplacerPolice({ nom: 'Helvetica-Oblique' }).penchee).toBe(true);
    expect(remplacerPolice({ nom: 'Times-BoldItalic' })).toMatchObject({ id: 'playfair', penchee: true });
    expect(remplacerPolice({ nom: 'Inter', italique: true })).toMatchObject({ exacte: false, penchee: true });
    expect(remplacerPolice({ nom: 'Arial' }).penchee).toBe(false);
  });

  it('lit une liste de familles CSS : la premiere fonte embarquee l emporte, sinon la premiere famille ; une generique seule se choisit', () => {
    expect(remplacerFamilles('Georgia, Lobster, serif')).toMatchObject({ id: 'lobster', exacte: true });
    expect(remplacerFamilles("'Helvetica Neue', Arial, sans-serif")).toMatchObject({ id: 'inter', exacte: false, demandee: 'Helvetica Neue' });
    expect(remplacerFamilles('serif')).toMatchObject({ id: 'playfair', exacte: true });
    expect(remplacerFamilles('monospace')).toMatchObject({ id: 'inter', exacte: true });
    expect(remplacerFamilles('')).toMatchObject({ id: 'inter' });
  });

  it('donne un nom lisible et une phrase', () => {
    expect([nomLisible('ABCDEF+Arial-BoldMT'), nomLisible('TimesNewRomanPSMT'), nomLisible("'Helvetica Neue'"), nomLisible('')]).toEqual(['Arial', 'Times New Roman', 'Helvetica Neue', 'police sans nom']);
    expect(phraseRemplacement(3, remplacerPolice({ nom: 'ArialMT' }))).toBe('3 textes en Arial, police remplacée par Inter');
    expect(phraseRemplacement(1, remplacerPolice({ nom: 'Times-Italic' }))).toBe('1 texte en Times, police remplacée par Playfair Display gras penchée (italique synthétique)');
  });

  it('ne renvoie qu a des fontes embarquees', () => {
    for (const r of REGLES_POLICES) { expect(NOMS_POLICES[r.id]).toBeTruthy(); if (r.gras) expect(NOMS_POLICES[r.gras]).toBeTruthy(); }
  });
});
