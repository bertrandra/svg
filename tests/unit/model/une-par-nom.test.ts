import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cleDeNom, famillesMontrees, idVariante, trouverVariante, uneParNom, validerCatalogue, type CataloguePolices, type FamilleCatalogue } from '../../../src/model/cataloguePolices.js';
import { PREFERENCE_SOURCES, rangSource } from '../../../src/model/sourcesPolices.js';
import { FAMILLES_LIVREES, POLICES_LIVREES } from '../../../src/model/polices.js';

// Une ligne par nom de famille dans « Toutes les polices » (ADR-0026) : la fonte livree, sinon Google Fonts, sinon Fontshare ;
// les autres sources restent dans l'index, se montrent quand on filtre leur source, et un texte qui les emploie se recompose.

const SHA = 'A'.repeat(43) + '=', CHEMIN = 'A'.repeat(32) + '/' + 'B'.repeat(32) + '/' + 'C'.repeat(32) + '.woff';
const google = (id: string, nom: string): FamilleCatalogue => ({ id, nom, depot: 'fontsource', source: 'google', categorie: 'affiche', licence: 'OFL-1.1', version: '5.3.0', ecritures: ['latin'], variantes: [[400, 0, SHA, null]] });
const fontshare = (id: string, nom: string): FamilleCatalogue => ({ id, nom, depot: 'fontshare', source: 'fontshare', categorie: 'affiche', licence: 'ITF-FFL', version: '2.0', ecritures: ['latin'], variantes: [[400, 0, SHA, null, CHEMIN]] });

const BEBAS_G = google('bebas-neue', 'Bebas Neue'), BEBAS_F = fontshare('bebas-neue', 'Bebas Neue');
const ANTON_G = google('anton', 'Anton'), ANTON_F = fontshare('anton', 'Anton');
const SATOSHI = fontshare('satoshi', 'Satoshi'), ROBOTO = google('roboto', 'Roboto');
const FAMILLES = [ANTON_F, ANTON_G, BEBAS_F, BEBAS_G, ROBOTO, SATOSHI];

describe('une ligne par nom de famille', () => {
  it('a son ordre de preference en donnees : la livree, puis Google Fonts, Fontshare en dernier', () => {
    expect(PREFERENCE_SOURCES[0]).toBe('livree');
    expect(rangSource('livree')).toBeLessThan(rangSource('google'));
    expect(rangSource('google')).toBeLessThan(rangSource('fontshare'));
    expect(PREFERENCE_SOURCES[PREFERENCE_SOURCES.length - 1]).toBe('fontshare');
    expect(rangSource('inconnue')).toBe(PREFERENCE_SOURCES.length);
    expect(cleDeNom('Bébas-NEUE')).toBe(cleDeNom('bebas neue'));
  });

  it('garde la livree, sinon Google Fonts, sinon Fontshare, dans l ordre de l index', () => {
    expect(famillesMontrees(FAMILLES)).toEqual([ANTON_G, BEBAS_G, ROBOTO, SATOSHI]);
    expect(famillesMontrees(FAMILLES, { livrees: ['Bebas Neue', 'Inter'] })).toEqual([ANTON_G, ROBOTO, SATOSHI]);
    // Une famille seule dans sa source se montre, quelle que soit la source.
    expect(famillesMontrees([SATOSHI, ANTON_F])).toEqual([SATOSHI, ANTON_F]);
  });

  it('montre toutes les familles d une source choisie explicitement, sans les confronter a la source preferee', () => {
    expect(famillesMontrees(FAMILLES, { source: 'fontshare', livrees: ['Bebas Neue'] })).toEqual([ANTON_F, BEBAS_F, SATOSHI]);
    expect(famillesMontrees(FAMILLES, { source: 'google' })).toEqual([ANTON_G, BEBAS_G, ROBOTO]);
  });

  it('garde deux polices de la meme source et ne confronte pas une fonte deposee', () => {
    const lignes = [
      { nom: 'Inter', famille: 'Inter', source: 'livree' }, { nom: 'Inter gras', famille: 'Inter', source: 'livree' },
      { nom: 'Inter', famille: 'Inter', source: 'google' }, { nom: 'Inter', famille: null, source: 'deposee' }
    ];
    expect(uneParNom(lignes, l => l.famille, l => l.source).map(l => l.nom + ' ' + l.source)).toEqual(['Inter livree', 'Inter gras livree', 'Inter deposee']);
  });

  it('laisse une police cachee dans l index : un texte en Bebas Neue de Fontshare se recompose avec le meme identifiant', () => {
    const index: CataloguePolices = { format: 1, instantane: '2026-10-25', familles: FAMILLES, anciennes: [] };
    const id = idVariante(BEBAS_F, [400, 0, SHA, null, CHEMIN]);
    expect(famillesMontrees(index.familles, { livrees: ['Bebas Neue'] })).not.toContain(BEBAS_F);
    const v = trouverVariante(index, id);
    expect(v?.id).toBe(id);
    expect(v?.famille.source).toBe('fontshare');
    expect(v?.fichiers[0]?.adresses[0]?.serveur).toBe('fontshare');
  });

  it('sur l index commis : 35 familles doubles, une ligne chacune, et aucune famille livree en double', () => {
    const c = validerCatalogue(JSON.parse(readFileSync(resolve(__dirname, '../../../data/catalogue-polices.json'), 'utf8')));
    if ('erreur' in c) throw new Error(c.erreur);
    const livrees = [...new Set(POLICES_LIVREES.map(id => FAMILLES_LIVREES[id]))];
    const sans = famillesMontrees(c.familles), avec = famillesMontrees(c.familles, { livrees });
    expect(c.familles.length - sans.length).toBe(35);
    expect(new Set(sans.map(f => cleDeNom(f.nom))).size).toBe(sans.length);
    // Les huit familles livrees ne se montrent plus depuis le catalogue (EMS Readability n'y est pas).
    expect(sans.length - avec.length).toBe(8);
    expect(avec.some(f => cleDeNom(f.nom) === 'bebas neue')).toBe(false);
    expect(sans.filter(f => cleDeNom(f.nom) === 'bebas neue').map(f => f.source)).toEqual(['google']);
    expect(famillesMontrees(c.familles, { source: 'fontshare', livrees }).some(f => cleDeNom(f.nom) === 'bebas neue')).toBe(true);
  });
});
