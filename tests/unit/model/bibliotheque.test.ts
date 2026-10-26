import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EVENEMENTS, appliquerCorrections, classer, construireBibliotheque, motsInconnus, nomAffiche, nomAnglais, nomFrancais, type IconeSource } from '../../../src/model/bibliotheque.js';
import { definirLangue } from '../../../src/util/i18n.js';
import { lireDessin } from '../../../src/engine/editionSvg.js';
import { chercher } from '../../../src/model/recherche.js';

const jeu = JSON.parse(readFileSync(resolve(__dirname, '../../../node_modules/@iconify-json/game-icons/icons.json'), 'utf8')) as { width: number; icons: Record<string, IconeSource> };

describe('nomFrancais', () => {
  it('traduit mot a mot, tete en premier, nombres a la fin, expressions telles quelles', () => {
    expect(nomFrancais('broken-heart')).toBe('cœur brisé');
    expect(nomFrancais('crossed-swords')).toBe('épées croisés');
    expect(nomFrancais('abstract-042')).toBe('abstrait 042');
    expect(nomFrancais('pumpkin-lantern')).toBe('citrouille-lanterne');
    expect(nomFrancais('the-ultimate-xyzzy')).toBe('xyzzy ultimate');
  });
});

describe('nomAnglais et nomAffiche (ADR-0042)', () => {
  it('rend les mots de l identifiant dans leur ordre, les nombres a la fin, sans rien traduire', () => {
    expect(nomAnglais('broken-heart')).toBe('broken heart');
    expect(nomAnglais('abstract-042')).toBe('abstract 042');
    expect(nomAnglais('dna1')).toBe('dna1');
    expect(nomAnglais('snowflake-1')).toBe('snowflake 1');
    expect(nomAnglais('the-ultimate-xyzzy')).toBe('the ultimate xyzzy');
  });

  it('montre le nom francais (corrige ou non) en francais, et les mots de l identifiant en anglais', () => {
    const entree = { id: 'broken-heart', nom: 'cœur brisé' };
    expect(nomAffiche(entree)).toBe('cœur brisé');
    definirLangue('en');
    try {
      expect(nomAffiche(entree)).toBe('broken heart');
      expect(nomAffiche({ id: 'pumpkin-lantern', nom: 'Citrouille corrigée' })).toBe('pumpkin lantern');
    } finally {
      definirLangue('fr');
    }
  });
});

describe('classer', () => {
  it('range par mots-cles, au pluriel pres et sur des suites de mots', () => {
    expect(classer('pumpkin-lantern')).toEqual(expect.arrayContaining(['halloween', 'automne']));
    expect(classer('easter-egg')).toEqual(expect.arrayContaining(['paques', 'chandeleur']));
    expect(classer('candles')).toContain('noel');
    expect(classer('ice-cream-cone')).toContain('ete');
    expect(classer('abstract-001')).toEqual(['symbole']);
    expect(classer('xyzzy')).toEqual([]);
  });

  it('ne range jamais un mot par un prefixe', () => {
    expect(classer('catapult')).not.toContain('halloween');
    expect(classer('scarab')).not.toContain('voyage');
  });
});

describe('la bibliotheque construite depuis game-icons', () => {
  const entrees = construireBibliotheque(jeu.icons, jeu.width);

  it('compte au moins 4 000 formes, que l editeur sait toutes lire', () => {
    expect(entrees.length).toBeGreaterThanOrEqual(4000);
    const illisibles = entrees.filter(x => 'erreur' in lireDessin(x.svg));
    expect(illisibles.map(x => x.id)).toEqual([]);
    expect(entrees[0]?.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="#000000"')).toBe(true);
  });

  it('donne a chaque evenement au moins dix formes, et range la plupart des formes', () => {
    const vides = EVENEMENTS.filter(ev => entrees.filter(x => x.evenements.includes(ev.id)).length < 10).map(ev => ev.id);
    expect(vides).toEqual([]);
    const sansRien = entrees.filter(x => x.evenements.length === 0).length;
    expect(sansRien / entrees.length).toBeLessThan(0.35);
  });

  it('traduit presque tout le vocabulaire des noms', () => {
    const inconnus = new Set(entrees.flatMap(x => motsInconnus(x.id)));
    const touches = entrees.filter(x => motsInconnus(x.id).length).length;
    expect(touches / entrees.length, 'part des formes au nom partiellement anglais').toBeLessThan(0.03);
    expect(inconnus.size).toBeLessThan(80);
  });

  it('se cherche par le nom francais sans accents, et par evenement', () => {
    const noel = chercher(entrees, 'bonhomme', 'noel');
    expect(noel.map(x => x.id)).toContain('snowman');
    expect(chercher(entrees, 'COEUR brise', null).map(x => x.id)).toContain('broken-heart');
    expect(chercher(entrees, 'xyzzy', null)).toEqual([]);
  });
});

describe('appliquerCorrections', () => {
  it('remplace le nom et les evenements donnes, et laisse le reste', () => {
    const e = [{ id: 'a', nom: 'un', evenements: ['x'], svg: '<svg/>' }, { id: 'b', nom: 'deux', evenements: ['y'], svg: '<svg/>' }];
    const r = appliquerCorrections(e, { a: { nom: ' Un corrigé ' }, b: { evenements: ['z'] }, c: { nom: 'absent' } });
    expect(r[0]).toMatchObject({ nom: 'Un corrigé', evenements: ['x'] });
    expect(r[1]).toMatchObject({ nom: 'deux', evenements: ['z'] });
    expect(r.length).toBe(2);
  });
});
