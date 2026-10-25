import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { construireBibliotheque, type EntreeBibliotheque, type IconeSource } from '../../../src/model/bibliotheque.js';
import { cleEntree, construireSource, filtrerEntrees, sourceDeEntree, type CategoriesJeu, type JeuIcones } from '../../../src/model/bibliothequeSources.js';
import { chercher, ordreDePresentation } from '../../../src/model/recherche.js';
import { SOURCES_FORMES, SOURCE_PAR_DEFAUT } from '../../../src/model/sourcesFormes.js';

// La recherche couvre toutes les sources chargees : un mot francais trouve ses formes dans chacune, deux formes de meme nom
// se departagent par l'ordre du registre, et un filtre de source ou de nature ne garde que ce qu'il nomme.

const racine = resolve(__dirname, '../../..');
const gi = JSON.parse(readFileSync(resolve(racine, 'node_modules/@iconify-json/game-icons/icons.json'), 'utf8')) as { width: number; icons: Record<string, IconeSource> };
const libres: EntreeBibliotheque[] = SOURCES_FORMES.filter(s => s.id !== SOURCE_PAR_DEFAUT).flatMap(s => {
  const dossier = resolve(racine, 'node_modules', s.paquet);
  const meta = resolve(dossier, 'metadata.json');
  const categories = existsSync(meta) ? (JSON.parse(readFileSync(meta, 'utf8')) as { categories?: CategoriesJeu }).categories ?? {} : {};
  return construireSource(s, JSON.parse(readFileSync(resolve(dossier, 'icons.json'), 'utf8')) as JeuIcones, categories);
});
const toutes = [...construireBibliotheque(gi.icons, gi.width), ...libres];

describe('la recherche dans toutes les sources', () => {
  it('trouve « cœur » dans chaque source, sans accent aussi', () => {
    const trouvees = chercher(toutes, 'cœur', null);
    expect(new Set(trouvees.map(sourceDeEntree))).toEqual(new Set(SOURCES_FORMES.map(s => s.id)));
    expect(chercher(toutes, 'coeur', null).length).toBe(trouvees.length);
  });

  it('presente les formes de meme nom dans l ordre du registre, sans doublon de cle', () => {
    const coeurs = chercher(toutes, 'cœur', null).filter(e => e.nom === 'cœur' && e.id === 'heart');
    const sources = coeurs.map(sourceDeEntree);
    expect(sources).toEqual([...sources].sort((a, b) => SOURCES_FORMES.findIndex(s => s.id === a) - SOURCES_FORMES.findIndex(s => s.id === b)));
    expect(new Set(ordreDePresentation(toutes).map(cleEntree)).size).toBe(toutes.length);
  });

  it('filtree par nature, ne garde que des formes en ligne, de toutes les sources qui en ont', () => {
    const lignes = chercher(filtrerEntrees(toutes, null, 'ligne'), 'cœur', null);
    expect(lignes.length).toBeGreaterThan(10);
    expect(lignes.every(e => e.nature === 'ligne')).toBe(true);
    expect(new Set(lignes.map(sourceDeEntree))).toEqual(new Set(['ph', 'tabler', 'healthicons', 'lucide']));
  });

  it('filtree par source, garde les evenements : Noel trouve un sapin chez Material', () => {
    const mdi = filtrerEntrees(toutes, 'mdi', null);
    expect(chercher(mdi, 'sapin', 'noel').length).toBeGreaterThan(0);
    expect(chercher(mdi, 'sapin', 'noel').every(e => e.source === 'mdi')).toBe(true);
  });
});
