// La langue preparee avant le premier rendu (ADR-0042 §3) : le dictionnaire anglais est une annexe chargee seulement quand la
// langue vaut `en` ; s'il manque, l'interface reste en francais et le dit une fois ; `lang` du document suit. Un navigateur simule,
// comme pour les autres annexes, et un module neuf par cas : la langue est un etat de module.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Amenees } from '../../../src/io/annexes.js';

const GLOBALE = '__langueSvg_en';

/** Un navigateur simule : `arrive` dit si le script s'injecte, `pose` ce qu'il met sur la fenetre. */
function navigateurSimule(arrive: boolean, pose: unknown = { Annuler: 'Cancel' }) {
  const fenetre: Record<string, unknown> = {};
  const injecter = vi.fn(async (url: string) => { if (arrive) fenetre[GLOBALE] = pose; return arrive && url.endsWith('langue-en.js'); });
  const amenees: Amenees = { injecter, lire: g => fenetre[g] };
  return { amenees, injecter };
}

/** Des modules neufs : la langue, les dictionnaires et les chargeurs sont des etats de module. */
async function modules() {
  vi.resetModules();
  return { io: await import('../../../src/io/langue.js'), i18n: await import('../../../src/util/i18n.js') };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('preparerLangue', () => {
  it('en francais, ne charge rien, pose la langue et le lang du document', async () => {
    const doc = { documentElement: { lang: '' } };
    vi.stubGlobal('document', doc);
    const { io, i18n } = await modules();
    const { amenees, injecter } = navigateurSimule(true);
    await io.preparerLangue('fr', amenees);
    expect(injecter).not.toHaveBeenCalled();
    expect(i18n.langue()).toBe('fr');
    expect(doc.documentElement.lang).toBe('fr');
    expect(io.avertissementLangue()).toBeNull();
  });

  it('en anglais, charge l annexe langue-en.js une fois, pose le dictionnaire, la langue et le lang', async () => {
    const doc = { documentElement: { lang: 'fr' } };
    vi.stubGlobal('document', doc);
    const { io, i18n } = await modules();
    const { amenees, injecter } = navigateurSimule(true);
    await io.preparerLangue('en', amenees);
    await io.preparerLangue('en', amenees);
    expect(injecter).toHaveBeenCalledTimes(1);
    expect(injecter).toHaveBeenCalledWith('langue-en.js');
    expect(i18n.langue()).toBe('en');
    expect(i18n.t('Annuler')).toBe('Cancel');
    expect(doc.documentElement.lang).toBe('en');
    expect(io.avertissementLangue()).toBeNull();
  });

  it('reste en francais quand l annexe manque, et le dit une fois avec le message des annexes', async () => {
    const doc = { documentElement: { lang: 'fr' } };
    vi.stubGlobal('document', doc);
    const { io, i18n } = await modules();
    await io.preparerLangue('en', navigateurSimule(false).amenees);
    expect(i18n.langue()).toBe('fr');
    expect(i18n.t('Annuler')).toBe('Annuler');
    expect(doc.documentElement.lang).toBe('fr');
    expect(io.avertissementLangue()).toBe('Le fichier langue-en.js est introuvable à côté de la page : lancez « npm run langues ». L’interface reste en français.');
    expect(io.avertissementLangue()).toBeNull();
  });

  it('reste en francais quand l annexe ne contient pas un dictionnaire', async () => {
    const { io, i18n } = await modules();
    await io.preparerLangue('en', navigateurSimule(true, { Annuler: 3 }).amenees);
    expect(i18n.langue()).toBe('fr');
    expect(io.avertissementLangue()).toBe('Le fichier langue-en.js ne contient pas le dictionnaire anglais. L’interface reste en français.');
  });

  it('marche sans document (sous Node, un test)', async () => {
    const { io, i18n } = await modules();
    await io.preparerLangue('en', navigateurSimule(true).amenees);
    expect(i18n.langue()).toBe('en');
  });
});

describe('validerDictionnaire', () => {
  it('ne garde qu un objet de textes vers des textes', async () => {
    const { io } = await modules();
    expect(io.validerDictionnaire({ a: 'b', 'Éditeur SVG': 'SVG editor' })).toEqual({ a: 'b', 'Éditeur SVG': 'SVG editor' });
    expect(io.validerDictionnaire({})).toEqual({});
    for (const v of [null, undefined, 'a', 3, ['a'], { a: 1 }, { a: null }, { a: { b: 'c' } }]) expect(io.validerDictionnaire(v), JSON.stringify(v)).toBeUndefined();
  });

  it('decrit l annexe comme une annexe de donnees : le site la lit en JSON sous langue-en', async () => {
    const { io } = await modules();
    expect(io.ANNEXE_LANGUE_EN.fichier).toBe('langue-en.js');
    expect(io.ANNEXE_LANGUE_EN.globale).toBe('__langueSvg_en');
    expect(io.ANNEXE_LANGUE_EN.donnees).toBe(true);
  });
});
