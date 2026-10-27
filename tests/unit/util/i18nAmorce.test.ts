// L'amorce de la langue (ADR-0042) : quand l'hote pose `globalThis.__langueSvgLangue` et charge le dictionnaire AVANT le code,
// util/i18n.ts pose la langue et la table a son initialisation, pour que les constantes de module evaluees au chargement
// (`const X = t('…')`) soient deja traduites. Un global absent, une langue inconnue ou un dictionnaire mal forme ne changent rien :
// le francais, comme avant. Un module neuf par cas : la langue est un etat de module.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Amenees } from '../../../src/io/annexes.js';

const LANGUE = '__langueSvgLangue';
const DICTIONNAIRE = '__langueSvg_en';

/** Un module neuf, apres les globaux poses. */
async function i18nNeuf() {
  vi.resetModules();
  return import('../../../src/util/i18n.js');
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('l amorce d util/i18n.ts', () => {
  it('pose la langue et le dictionnaire des l initialisation quand les deux globaux sont la', async () => {
    vi.stubGlobal(LANGUE, 'en');
    const MEME_GROUPE = 'Les formes à réunir doivent être dans le même groupe.';
    vi.stubGlobal(DICTIONNAIRE, { Annuler: 'Cancel', 'Projet « {nom} » enregistré.': 'Project “{nom}” saved.', [MEME_GROUPE]: 'Shapes to combine must be in the same group.' });
    const i18n = await i18nNeuf();
    expect(i18n.langue()).toBe('en');
    expect(i18n.dictionnairePose('en')).toBe(true);
    expect(i18n.t('Annuler')).toBe('Cancel');
    expect(i18n.t('Projet « {nom} » enregistré.', { nom: 'Logo' })).toBe('Project “Logo” saved.');
    // Une constante de module (`export const X = t('…')`), evaluee au chargement de son module, est donc deja en anglais.
    const groupes = await import('../../../src/engine/edition/groupes.js');
    expect(groupes.MSG_MEME_PARENT).toBe('Shapes to combine must be in the same group.');
  });

  it('ne fait rien sans langue posee, et reste en francais', async () => {
    vi.stubGlobal(DICTIONNAIRE, { Annuler: 'Cancel' });
    const i18n = await i18nNeuf();
    expect(i18n.langue()).toBe('fr');
    expect(i18n.dictionnairePose('en')).toBe(false);
    expect(i18n.t('Annuler')).toBe('Annuler');
  });

  it('ignore une langue inconnue, le francais (qui n a pas de dictionnaire), et un dictionnaire mal forme', async () => {
    for (const [langue, table] of [['de', { Annuler: 'Abbrechen' }], ['EN', { Annuler: 'Cancel' }], ['fr', { Annuler: 'Cancel' }], ['en', ['Cancel']], ['en', { Annuler: 1 }], ['en', 'Cancel'], ['en', undefined]] as const) {
      vi.stubGlobal(LANGUE, langue);
      vi.stubGlobal(DICTIONNAIRE, table);
      const i18n = await i18nNeuf();
      expect(i18n.langue(), String(langue) + ' / ' + JSON.stringify(table)).toBe('fr');
      expect(i18n.dictionnairePose('en'), String(langue) + ' / ' + JSON.stringify(table)).toBe(false);
      vi.unstubAllGlobals();
    }
  });

  it('laisse preparerLangue confirmer la langue sans rien recharger : l annexe est deja posee', async () => {
    vi.stubGlobal(LANGUE, 'en');
    vi.stubGlobal(DICTIONNAIRE, { Annuler: 'Cancel' });
    vi.stubGlobal('document', { documentElement: { lang: 'fr' } });
    const i18n = await i18nNeuf();
    const io = await import('../../../src/io/langue.js');
    const injecter = vi.fn(async () => false);
    const amenees: Amenees = { injecter, lire: () => undefined };
    await io.preparerLangue('en', amenees);
    expect(injecter).not.toHaveBeenCalled();
    expect(i18n.langue()).toBe('en');
    expect(i18n.t('Annuler')).toBe('Cancel');
    expect((globalThis as unknown as { document: { documentElement: { lang: string } } }).document.documentElement.lang).toBe('en');
    expect(io.avertissementLangue()).toBeNull();
  });

  it('valide un dictionnaire comme l annexe : un objet de textes vers des textes, rien d autre', async () => {
    const i18n = await i18nNeuf();
    expect(i18n.validerDictionnaire({ a: 'b', 'Éditeur SVG': 'SVG editor' })).toEqual({ a: 'b', 'Éditeur SVG': 'SVG editor' });
    for (const v of [null, undefined, 'a', 3, ['a'], { a: 1 }, { a: null }]) expect(i18n.validerDictionnaire(v), JSON.stringify(v)).toBeUndefined();
    expect(i18n.GLOBALE_LANGUE).toBe('__langueSvgLangue');
    expect(i18n.globaleDictionnaire('en')).toBe('__langueSvg_en');
  });
});
