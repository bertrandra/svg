// Les documentations du menu Aide : le registre (aucune tant que l'hote n'en pose pas), les adresses livrees (celles que
// scripts/documentation.mjs ecrit), et les sources d'outils/aide (chaque image presente, aucune adresse vers un autre serveur).

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { DOCUMENTATIONS_LIVREES, definirDocumentation, documentationsPosees } from '../../../src/zones/documentation.js';

const RACINE = resolve(__dirname, '../../..');
const { DOCUMENTATIONS } = (await import(pathToFileURL(resolve(RACINE, 'scripts/documentation.mjs')).href)) as { DOCUMENTATIONS: { source: string; sortie: string }[] };

describe('les documentations du menu Aide', () => {
  afterEach(() => definirDocumentation([]));

  it('n en pose aucune tant que l hote ne les demande pas', () => {
    expect(documentationsPosees()).toEqual([]);
    definirDocumentation(DOCUMENTATIONS_LIVREES);
    expect(documentationsPosees().map(d => d.libelle)).toEqual(['Guide de l’éditeur', 'La Cricut, c’est simple']);
  });

  it('livre a chaque adresse relative la page que le script ecrit sous dist/', () => {
    expect(DOCUMENTATIONS_LIVREES.map(d => d.adresse)).toEqual(DOCUMENTATIONS.map(d => d.sortie));
    for (const d of DOCUMENTATIONS_LIVREES) expect(d.adresse).toMatch(/^aide\/[a-z]+\.html$/);
  });

  it('ne cite que des images presentes, et aucune adresse vers un autre serveur', () => {
    for (const d of DOCUMENTATIONS) {
      const texte = readFileSync(resolve(RACINE, 'outils/aide', d.source), 'utf8');
      const images = [...texte.matchAll(/src="img:([\w-]+)"/g)].map(m => m[1]);
      expect(images.length).toBeGreaterThan(5);
      for (const nom of images) expect(existsSync(resolve(RACINE, 'outils/aide/images', nom + '.webp')), nom).toBe(true);
      // Ni police, ni script, ni feuille chargee ailleurs : une documentation s'ouvre sans reseau (ADR-0025).
      expect(texte).not.toMatch(/<(link|script)[^>]+(href|src)="(https?:)?\/\//);
      expect(texte).not.toMatch(/url\((["']?)(https?:)?\/\//);
    }
  });
});
