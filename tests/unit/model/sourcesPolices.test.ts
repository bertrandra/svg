import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CATEGORIES_EXCLUES, FAMILLES_ILLISIBLES, LICENCES_POLICES, SERVEURS_POLICES, SOURCES_EXCLUES, SOURCES_POLICES, estLicenceAdmise, fonderieFontsource, hotesDe, type IdLicencePolice
} from '../../../src/model/sourcesPolices.js';
import { validerCatalogue, type CataloguePolices } from '../../../src/model/cataloguePolices.js';

// Le registre des polices telechargeables (ADR-0025) : la liste blanche des licences, les serveurs qu'on contacte, les sources
// et ce qui en est exclu. Puis l'index commis, relu en entier : chaque famille sous une licence admise, d'une source du registre,
// a une version epinglee, chaque fichier avec son empreinte sha256.

const racine = resolve(__dirname, '../../..');
const INDEX = JSON.parse(readFileSync(resolve(racine, 'data/catalogue-polices.json'), 'utf8')) as CataloguePolices;

describe('le registre des polices libres', () => {
  it('n admet que cinq licences, dont l ITF FFL avec son badge', () => {
    expect(Object.keys(LICENCES_POLICES).sort()).toEqual(['Apache-2.0', 'CC0-1.0', 'ITF-FFL', 'OFL-1.1', 'UFL-1.0']);
    expect(LICENCES_POLICES['ITF-FFL'].badge).toBe('ITF');
    for (const l of Object.values(LICENCES_POLICES)) expect(l.url, l.id).toMatch(/^https:\/\//);
    for (const refusee of ['MIT', 'mit', 'Unlicense', 'GPL-3.0', 'CC-BY-NC-4.0', 'OFL', '', null, 'constructor', '__proto__']) expect(estLicenceAdmise(refusee), String(refusee)).toBe(false);
  });

  it('declare des sources dont chaque licence est dans la liste blanche, et des serveurs en https', () => {
    expect(SOURCES_POLICES.map(s => s.id).sort()).toEqual(['collletttivo', 'fontshare', 'fontsource', 'google', 'league', 'sil', 'velvetyne']);
    for (const s of SOURCES_POLICES) {
      expect(s.licences.length, s.id).toBeGreaterThan(0);
      for (const l of s.licences) expect(estLicenceAdmise(l), s.id + ' : ' + l).toBe(true);
      expect(s.serveurs.length, s.id).toBeGreaterThan(0);
      expect(s.epinglage.length, s.id).toBeGreaterThan(20);
      expect(hotesDe(s).every(h => /^[a-z0-9.-]+\.[a-z]+$/.test(h)), s.id).toBe(true);
    }
    for (const v of Object.values(SERVEURS_POLICES)) expect(v.prefixe, v.id).toMatch(new RegExp('^https://' + v.hote.replace(/\./g, '\\.') + '/'));
    // Bunny Fonts n'est qu'un repli : jamais contacte avant le serveur principal.
    expect(SERVEURS_POLICES.bunny.repli).toBe(true);
    expect(SOURCES_POLICES.filter(s => s.serveurs.includes('bunny')).every(s => s.serveurs.indexOf('jsdelivr') < s.serveurs.indexOf('bunny'))).toBe(true);
  });

  it('dit ce qui n a pas pu etre verifie, et ce qui est exclu', () => {
    const marquees = SOURCES_POLICES.filter(s => s.aVerifier).map(s => s.id).sort();
    expect(marquees).toEqual(['collletttivo', 'fontshare']);
    for (const s of SOURCES_POLICES) if (s.aVerifier) expect(s.aVerifier.length, s.id).toBeGreaterThan(40);
    expect(SOURCES_EXCLUES.map(e => e.nom)).toEqual(['Font Squirrel', 'uncut.xyz']);
    expect(CATEGORIES_EXCLUES).toContain('icons');
  });

  it('attribue les familles servies par Fontsource a leur fonderie', () => {
    expect(fonderieFontsource('league-spartan', 'google')).toBe('league');
    expect(fonderieFontsource('charis-sil', 'google')).toBe('sil');
    expect(fonderieFontsource('apfel-grotezk', 'other')).toBe('collletttivo');
    expect(fonderieFontsource('roboto', 'google')).toBe('google');
    expect(fonderieFontsource('dejavu-sans', 'other')).toBe('fontsource');
  });
});

describe('l index commis (data/catalogue-polices.json)', () => {
  it('ne garde aucune famille que l editeur ne sait pas lire (chacune avec sa raison)', () => {
    expect(FAMILLES_ILLISIBLES.length).toBeGreaterThan(0);
    for (const x of FAMILLES_ILLISIBLES) {
      expect(x.raison.length, x.id).toBeGreaterThan(10);
      expect(INDEX.familles.some(f => f.depot === 'fontsource' && f.id === x.id), x.id).toBe(false);
    }
  });

  it('passe la validation de la page, telle que le build et l annexe l emploient', () => {
    const v = validerCatalogue(INDEX);
    expect('erreur' in v ? v.erreur : 'valide').toBe('valide');
    expect(INDEX.familles.length).toBeGreaterThan(2000);
  });

  it('n a que des licences de la liste blanche, des sources du registre, et chaque source declaree y est', () => {
    const licences = new Set<IdLicencePolice>(), sources = new Set<string>();
    for (const f of INDEX.familles) { licences.add(f.licence); sources.add(f.source); }
    for (const l of licences) expect(estLicenceAdmise(l), l).toBe(true);
    expect([...sources].sort()).toEqual(SOURCES_POLICES.map(s => s.id).sort());
    // L'ITF FFL n'est portee que par Fontshare.
    expect(INDEX.familles.filter(f => f.licence === 'ITF-FFL').every(f => f.source === 'fontshare')).toBe(true);
  });

  it('epingle chaque version et chaque fichier : une version npm, un commit, une version Fontshare, une empreinte sha256', () => {
    for (const f of INDEX.familles) {
      if (f.depot === 'fontsource') expect(f.version, f.id).toMatch(/^\d+\.\d+\.\d+$/);
      if (f.depot === 'velvetyne') expect(f.version, f.id).toMatch(/^[0-9a-f]{40}$/);
      for (const v of f.variantes) expect(v[2], f.id).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    }
  });

  it('se lit dans un ordre stable : une famille par ligne, triees par nom', () => {
    const texte = readFileSync(resolve(racine, 'data/catalogue-polices.json'), 'utf8');
    expect(texte.split('\n').filter(l => l.startsWith('{"id":')).length).toBe(INDEX.familles.length + INDEX.anciennes.length);
    const noms = INDEX.familles.map(f => f.nom.toLowerCase());
    expect(noms).toEqual([...noms].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });
});
