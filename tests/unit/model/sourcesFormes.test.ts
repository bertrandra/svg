import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MOTS_DE_MARQUE, NATURE_PROPOSEE_PAR_PROCEDE, SOURCES_FORMES, SOURCE_PAR_DEFAUT, naturesDe, sourceFormes } from '../../../src/model/sourcesFormes.js';
import { COMPOSANTS, SOURCES_ORIGINE } from '../../../src/model/credits.js';
import { au } from '../../../src/util/tableaux.js';

// Le registre des sources de formes est une promesse sur des paquets tiers : chaque ligne est confrontee ici au paquet
// installe (licence declaree par package.json et info.json, epinglage exact) et a la copie de sa licence (le titulaire y
// figure). Une mise a jour qui changerait une licence echoue ici avant d'atteindre un utilisateur.

const racine = resolve(__dirname, '../../..');
const lireJson = <T>(chemin: string): T => JSON.parse(readFileSync(resolve(racine, chemin), 'utf8')) as T;
const paquetRacine = lireJson<{ devDependencies: Record<string, string>; dependencies: Record<string, string> }>('package.json');
const verrou = lireJson<{ packages: Record<string, { version: string; license?: string }> }>('package-lock.json');

/** Les seules licences que le produit proprietaire admet pour une source de formes (ADR des bibliotheques libres). */
const LICENCES_SURES = ['MIT', 'ISC', 'Apache-2.0', 'CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0'];

describe('le registre des sources de formes', () => {
  it('a des identifiants, des fichiers et des globales uniques, et game-icons par defaut, en tete', () => {
    for (const cle of ['id', 'fichier', 'globale', 'paquet', 'nomCourt'] as const) {
      const valeurs = SOURCES_FORMES.map(s => s[cle]);
      expect(new Set(valeurs).size, cle).toBe(valeurs.length);
    }
    expect(SOURCES_FORMES[0]?.id).toBe(SOURCE_PAR_DEFAUT);
    expect(sourceFormes(SOURCE_PAR_DEFAUT)?.fichier).toBe('bibliotheque.js');
    for (const s of SOURCES_FORMES) {
      expect(s.id, s.id).toMatch(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
      expect(s.globale, s.id).toMatch(/^__bibliothequeSvg[A-Za-z]*$/);
      if (s.id !== SOURCE_PAR_DEFAUT) expect(s.fichier).toBe('bibliotheque-' + s.id + '.js');
    }
  });

  it('n admet que des licences sures, et seule CC BY demande la mention dans le fichier', () => {
    for (const s of SOURCES_FORMES) {
      expect(LICENCES_SURES, s.id).toContain(s.spdx);
      expect(s.mentionDansLeFichier, s.id).toBe(s.spdx.startsWith('CC-BY'));
      expect(s.url, s.id).toMatch(/^https:\/\//);
      expect(s.urlLicence, s.id).toMatch(/^https:\/\//);
    }
  });

  it('chaque paquet est epingle exactement, et declare la licence du registre (package.json, info.json, package-lock.json)', () => {
    for (const s of SOURCES_FORMES) {
      const version = paquetRacine.devDependencies[s.paquet] ?? paquetRacine.dependencies[s.paquet];
      expect(version, s.paquet + ' dans package.json').toMatch(/^\d+\.\d+\.\d+$/);
      const dossier = 'node_modules/' + s.paquet + '/';
      const pj = lireJson<{ version: string; license: string }>(dossier + 'package.json');
      expect(pj.version, s.paquet).toBe(version);
      expect(pj.license, s.paquet).toBe(s.spdx);
      const info = lireJson<{ license: { spdx: string } }>(dossier + 'info.json');
      expect(info.license.spdx, s.paquet).toBe(s.spdx);
      expect(verrou.packages['node_modules/' + s.paquet]?.license, s.paquet).toBe(s.spdx);
    }
  });

  it('chaque source est un composant redistribue de genre forme, avec la meme licence et le meme titulaire', () => {
    for (const s of SOURCES_FORMES) {
      const c = COMPOSANTS.find(x => x.paquet === s.paquet);
      expect(c?.genre, s.paquet).toBe('forme');
      expect(c?.spdx, s.paquet).toBe(s.spdx);
      expect(c?.titulaire, s.paquet).toBe(s.titulaire);
    }
    expect(COMPOSANTS.filter(c => c.genre === 'forme').map(c => c.paquet)).toEqual(SOURCES_FORMES.map(s => s.paquet));
  });

  it('le texte de licence copie de chaque source libre nomme son titulaire et sa licence', async () => {
    const { LICENCES_SOURCES } = (await import(pathToFileURL(resolve(racine, 'scripts/mentions.mjs')).href)) as { LICENCES_SOURCES: Record<string, { fichier: string; amont: string }> };
    const libres = SOURCES_FORMES.filter(s => !s.mentionDansLeFichier);
    expect(Object.keys(LICENCES_SOURCES).sort()).toEqual(libres.map(s => s.paquet).sort());
    const motLicence: Record<string, RegExp> = { MIT: /MIT License/, ISC: /ISC License/, 'Apache-2.0': /Apache 2\.0/ };
    for (const s of libres) {
      const copie = LICENCES_SOURCES[s.paquet];
      expect(copie && existsSync(resolve(racine, copie.fichier)), s.paquet).toBe(true);
      const texte = readFileSync(resolve(racine, copie?.fichier ?? ''), 'utf8');
      expect(texte, s.paquet).toContain(s.titulaire);
      expect(texte, s.paquet).toMatch(motLicence[s.spdx] ?? /$^/);
    }
  });

  it('les origines sont celles du registre, dans le meme ordre', () => {
    expect(SOURCES_ORIGINE.map(o => o.prefixe)).toEqual(SOURCES_FORMES.map(s => s.id));
    expect(SOURCES_ORIGINE.filter(o => o.mentionDansLeFichier).map(o => o.prefixe)).toEqual([SOURCE_PAR_DEFAUT]);
  });

  it('decrit des variantes coherentes : une trace pour une ligne seulement, et au moins une forme pleine ou en ligne', () => {
    for (const s of SOURCES_FORMES) {
      expect(s.variantes.length, s.id).toBeGreaterThan(0);
      for (const v of s.variantes) expect(v.trace === undefined, s.id + ' ' + v.suffixe).toBe(v.nature === 'plein');
      for (const e of s.suffixesEcartes) expect(s.variantes.some(v => v.suffixe === e), s.id + ' ' + e).toBe(false);
    }
    expect(naturesDe(au(SOURCES_FORMES.filter(s => s.id === 'lucide'), 0))).toEqual(['ligne']);
    expect(naturesDe(au(SOURCES_FORMES, 0))).toEqual(['plein']);
    expect(SOURCES_FORMES.filter(s => naturesDe(s).includes('ligne')).map(s => s.id)).toEqual(['ph', 'tabler', 'healthicons', 'lucide']);
  });

  it('ecarte les categories de marques qui existent dans le paquet, et des mots de marque en minuscules', () => {
    for (const s of SOURCES_FORMES) {
      if (!s.exclusions.categories?.length) continue;
      const meta = lireJson<{ categories: Record<string, string[]> }>('node_modules/' + s.paquet + '/metadata.json');
      for (const c of s.exclusions.categories) expect(meta.categories[c]?.length ?? 0, s.id + ' : ' + c).toBeGreaterThan(0);
    }
    expect(MOTS_DE_MARQUE.every(m => /^[a-z0-9]+$/.test(m))).toBe(true);
    expect([...MOTS_DE_MARQUE].sort()).toEqual(MOTS_DE_MARQUE);
    for (const s of SOURCES_FORMES.filter(x => x.id !== SOURCE_PAR_DEFAUT)) expect(s.exclusions.mots, s.id).toEqual(expect.arrayContaining([...MOTS_DE_MARQUE]));
  });

  it('propose les formes en ligne d abord au stylo', () => {
    expect(NATURE_PROPOSEE_PAR_PROCEDE['stylo']).toBe('ligne');
    expect(NATURE_PROPOSEE_PAR_PROCEDE['decoupe']).toBeUndefined();
  });
});
