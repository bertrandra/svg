// Un stockage qu'on n'a pas ecrit (autre version, extension, hote qui partage l'origine, donnees abimees) ne doit ni faire
// planter la page, ni polluer un prototype, ni gonfler la memoire (docs/securite.md).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { stockageMemoire, stockageNavigateur } from '../../../src/io/stockage.js';
import { CLE_BROUILLON, CLE_VERSIONS, lireBrouillon, lireVersions, VERSIONS_MAX } from '../../../src/zones/session.js';
import { lireCorrections, appliquerCorrections } from '../../../src/model/bibliotheque.js';
import { normaliserBibliotheque } from '../../../src/io/bibliotheque.js';
import { nuancierPropre } from '../../../src/zones/EditeurSvg.js';
import { verifierOptions } from '../../../src/zones/embarque.js';

afterEach(() => { vi.unstubAllGlobals(); });

const avecTexte = (cle: string, texte: string) => {
  const textes = new Map([[cle, texte]]);
  vi.stubGlobal('localStorage', { getItem: (k: string) => textes.get(k) ?? null, setItem: () => undefined, removeItem: () => undefined });
  return stockageNavigateur();
};

describe('le stockage du navigateur lit du JSON hostile', () => {
  it('ne rend jamais les cles __proto__, constructor et prototype, et ne pollue rien', () => {
    const s = avecTexte('k', '{"__proto__":{"pollue":true},"a":{"constructor":{"prototype":{"pollue":true}},"b":1},"constructor":1}');
    const v = s.lire<Record<string, unknown>>('k');
    expect(v).toEqual({ a: { b: 1 } });
    expect(({} as Record<string, unknown>).pollue).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('pollue');
    const fusion = { ...v, ...(v?.a as object) };
    expect(Object.getPrototypeOf(fusion)).toBe(Object.prototype);
  });

  it('lit comme absent un JSON demesure ou illisible', () => {
    expect(avecTexte('k', '[' + '1,'.repeat(17_000_000) + '1]').lire('k')).toBeNull();
    expect(avecTexte('k', '{"a":').lire('k')).toBeNull();
    expect(avecTexte('k', '[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[').lire('k')).toBeNull();
  });
});

describe('le brouillon et les versions de la page', () => {
  it('ecarte un brouillon qui n a pas la forme ecrite par la page, sans lever', () => {
    for (const poison of [null, 5, 'x', [], {}, { nom: {}, svg: '<svg/>', quand: 1 }, { nom: 'a', svg: 1, quand: 1 }, { nom: 'a', svg: '<svg/>', quand: 'hier' }, { nom: 'a', svg: '<svg/>', quand: null }]) {
      expect(lireBrouillon(stockageMemoire({ [CLE_BROUILLON]: poison })), JSON.stringify(poison)).toBeNull();
    }
  });

  it('ne garde d un brouillon que ses trois champs, et un nom borne', () => {
    const b = lireBrouillon(stockageMemoire({ [CLE_BROUILLON]: { nom: 'n'.repeat(5000), svg: '<svg/>', quand: 1, autre: 'x' } }));
    expect(b).toEqual({ nom: 'n'.repeat(200), svg: '<svg/>', quand: 1 });
  });

  it('ecarte des versions qui ne sont pas une liste, ou les entrees mal formees, les doublons, et borne le nombre', () => {
    for (const poison of [null, 5, 'x', {}, { length: 3 }]) expect(lireVersions(stockageMemoire({ [CLE_VERSIONS]: poison }))).toEqual([]);
    const bonne = { id: 'v1', nom: 'a', svg: '<svg/>', quand: 1 };
    const lues = lireVersions(stockageMemoire({ [CLE_VERSIONS]: [bonne, null, 5, { ...bonne, id: 2 }, { ...bonne, svg: {} }, { ...bonne, nom: ['x'] }, { ...bonne, quand: 'x' }, { ...bonne, extra: 1 }, { ...bonne, id: 'v2' }] }));
    expect(lues).toEqual([bonne, { ...bonne, id: 'v2' }]);
    const beaucoup = Array.from({ length: 500 }, (_, i) => ({ ...bonne, id: 'v' + i }));
    expect(lireVersions(stockageMemoire({ [CLE_VERSIONS]: beaucoup }))).toHaveLength(VERSIONS_MAX);
  });
});

describe('les corrections de la bibliotheque', () => {
  it('ne garde que des noms (texte) et des evenements (liste de textes), sans cle de prototype', () => {
    const c = lireCorrections(JSON.parse('{"a":{"nom":"Chat","evenements":["noel"],"x":1},"b":{"nom":5},"c":{"evenements":"noel"},"d":null,"e":{"evenements":[1]},"__proto__":{"nom":"x"},"constructor":{"nom":"y"}}'));
    expect(c).toEqual({ a: { nom: 'Chat', evenements: ['noel'] } });
    expect(lireCorrections([1, 2])).toEqual({});
    expect(lireCorrections('x')).toEqual({});
    expect(lireCorrections(null)).toEqual({});
  });

  it('s applique sans lever meme si une correction vise un id de prototype', () => {
    const entrees = [{ id: 'constructor', nom: 'x', evenements: [], svg: '<svg/>' }];
    expect(appliquerCorrections(entrees, lireCorrections({ constructor: { nom: 'pwn' } }))).toEqual(entrees);
  });
});

describe('les options de l hote', () => {
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h5v5z"/></svg>';
  const ok = (): void => undefined;

  it('refuse un dossier d annexes qui est un schema actif, ecrit comme on veut', () => {
    for (const base of ['javascript:alert(1)//', 'data:text/javascript,alert(1)//', ' java\tscript:x', 'blob:https://x', 'DATA:text/javascript,1']) {
      expect(verifierOptions({ svg: SVG, onEnregistrer: ok, baseAnnexes: base }), base).toMatch(/baseAnnexes/);
    }
    for (const base of ['', '../dist', '/svg/', 'https://cdn.exemple.org/svg/', '//cdn.exemple.org/svg/', 'file:///opt/svg/']) {
      expect(verifierOptions({ svg: SVG, onEnregistrer: ok, baseAnnexes: base }), base).toBeNull();
    }
  });

  it('refuse un svg demesure, un titre demesure et une bibliotheque sans liste d entrees', () => {
    expect(verifierOptions({ svg: ' '.repeat(65 * 1024 * 1024) + SVG, onEnregistrer: ok })).toMatch(/dépasse 64 millions/);
    expect(verifierOptions({ svg: SVG, onEnregistrer: ok, titre: 'x'.repeat(501) })).toMatch(/titre/);
    expect(verifierOptions({ svg: SVG, onEnregistrer: ok, bibliotheque: {} })).toMatch(/entrees/);
    expect(verifierOptions({ svg: SVG, onEnregistrer: ok, bibliotheque: { entrees: [] } })).toBeNull();
  });

  it('remet une bibliotheque d hote a la forme attendue, entree par entree', () => {
    const b = normaliserBibliotheque({ source: 5, entrees: [{ id: 'a', nom: 'A', svg: '<svg/>', evenements: ['noel'] }, { id: 'b' }, null, { id: 'c', nom: 'C', svg: 1, evenements: [] }], evenements: [{ id: 'noel', nom: 'Noël', famille: 'calendrier', mots: ['x'], mois: 12 }, { id: 'zz', nom: 'Z', famille: 'autre', mots: [] }, 3] });
    expect(b).toEqual({ source: '', licence: '', url: '', entrees: [{ id: 'a', nom: 'A', svg: '<svg/>', evenements: ['noel'] }], evenements: [{ id: 'noel', nom: 'Noël', famille: 'calendrier', mots: ['x'], mois: 12 }] });
    expect(normaliserBibliotheque({ entrees: 'x' })).toBeNull();
    expect(normaliserBibliotheque(null)).toBeNull();
  });

  it('ecarte du nuancier ce qui n est pas { nom, hex } en textes, sans lever', () => {
    const sale = [null, 5, { hex: 5 }, { nom: 5, hex: '#C81E28' }, { nom: 'Bleu', hex: '#1428a0' }, { hex: '#1428a0' }, 'x'] as unknown as Parameters<typeof nuancierPropre>[0];
    expect(nuancierPropre(sale)).toEqual([{ nom: '#c81e28', hex: '#c81e28' }, { nom: 'Bleu', hex: '#1428a0' }]);
  });
});
