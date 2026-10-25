import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EVENEMENTS, construireBibliotheque, type EntreeBibliotheque, type Evenement, type IconeSource } from '../../../src/model/bibliotheque.js';
import {
  FORCES, chercher, evenementsLies, evenementsProches, indexer, normaliser, ordreCalendrier, ordreDePresentation, racine, rangDansEvenement, rechercher, suggestions
} from '../../../src/model/recherche.js';
import { EXEMPLES_RECHERCHE, SYNONYMES } from '../../../src/model/synonymes.js';

const jeu = JSON.parse(readFileSync(resolve(__dirname, '../../../node_modules/@iconify-json/game-icons/icons.json'), 'utf8')) as { width: number; icons: Record<string, IconeSource> };
const entrees = construireBibliotheque(jeu.icons, jeu.width);
const index = indexer(entrees);
const noms = (r: readonly EntreeBibliotheque[], n = r.length) => r.slice(0, n).map(x => x.nom);
const ids = (r: readonly EntreeBibliotheque[]) => r.map(x => x.id);

// Une petite bibliotheque fabriquee : l'ordre s'y verifie a la main.
const ev = (id: string, nom: string, mots: string[], mois?: number): Evenement => ({ id, nom, famille: mois ? 'calendrier' : 'vie', mots, ...(mois ? { mois } : {}) });
const MINI_EVENEMENTS = [ev('noel', 'Noël', ['santa', 'pine', 'gift'], 12), ev('fete', 'Fête', ['party'])];
const f = (id: string, nom: string, evenements: string[] = []): EntreeBibliotheque => ({ id, nom, evenements, svg: '<svg/>' });
const MINI = [
  f('pine-tree', 'pin', ['noel']), f('gift-trap', 'cadeau piégé', ['noel']), f('santa-hat', 'bonnet de père noël', ['noel']),
  f('pineapple', 'ananas'), f('pin-cushion', 'pelote à épingles'), f('pinch', 'pincement'), f('party-hat', 'chapeau de fête', ['fete']),
  f('abstract-001', 'abstrait 001'), f('tree', 'arbre'), f('cat', 'chat'), f('castle', 'château'), f('hollow-cat', 'chat creux')
];
const mini = indexer(MINI, MINI_EVENEMENTS);

describe('normaliser et racine', () => {
  it('compare sans accents, sans majuscules, ligatures ouvertes, au singulier pres', () => {
    expect(normaliser('Noël')).toBe('noel');
    expect(normaliser('  CŒUR brisé ! ')).toBe('coeur brise');
    expect(normaliser('sucres d’orge')).toBe('sucres d orge');
    expect(racine('chats')).toBe('chat');
    expect(racine('gateaux')).toBe('gateau');
    expect(racine('bus')).toBe('bus');
    expect(racine('cross')).toBe('cross');
  });
});

describe('rechercher : ce qu un mot trouve', () => {
  it('« sapin » trouve le pin et les arbres par synonyme, et renvoie a Noël', () => {
    const r = rechercher(index, 'sapin', null);
    expect(r.length).toBeGreaterThanOrEqual(10);
    expect(r[0]?.id).toBe('pine-tree');
    expect(noms(r, 3)).toContain('pin');
    expect(evenementsLies(index, 'sapin').map(e => e.id)).toEqual(['noel']);
  });

  it('« anniversaire » trouve tout l evenement Anniversaire, la piece montee et le gateau en tete', () => {
    const r = rechercher(index, 'anniversaire', null);
    const evenement = entrees.filter(x => x.evenements.includes('anniversaire')).length;
    expect(evenement).toBeGreaterThanOrEqual(90);
    expect(r.length).toBeGreaterThanOrEqual(evenement);
    expect(noms(r, 3)).toEqual(expect.arrayContaining(['part de gâteau', 'pièce montée']));
  });

  it('« Noël » et « noel » trouvent les formes de Noël, le bonnet de père Noël d abord (mot du nom)', () => {
    const avecAccent = rechercher(index, 'Noël', null), sans = rechercher(index, 'noel', null);
    expect(ids(avecAccent)).toEqual(ids(sans));
    expect(avecAccent.length).toBeGreaterThanOrEqual(entrees.filter(x => x.evenements.includes('noel')).length);
    expect(avecAccent[0]?.id).toBe('santa-hat');
    // A force egale, l'evenement nomme range par representativite : le bonhomme de neige avant les cerfs.
    const i = (id: string) => ids(avecAccent).indexOf(id);
    expect(i('snowman')).toBeLessThan(i('deer'));
    expect(i('pine-tree')).toBeLessThan(i('angel-outfit'));
  });

  it('« chats » trouve le chat (pluriel), avant ce qui commence seulement par « chat »', () => {
    const r = rechercher(index, 'chats', null);
    expect(r[0]?.id).toBe('cat');
    expect(ids(r)).toEqual(ids(rechercher(index, 'chat', null)));
    expect(ids(r).indexOf('castle')).toBeGreaterThan(ids(r).indexOf('hollow-cat'));
  });

  it('ignore les accents dans les deux sens', () => {
    expect(ids(rechercher(index, 'coeur', null))).toEqual(ids(rechercher(index, 'cœur', null)));
    expect(ids(rechercher(index, 'etoile', null))).toEqual(ids(rechercher(index, 'Étoiles', null)));
    expect(rechercher(index, 'COEUR brise', null).map(x => x.id)).toContain('broken-heart');
  });

  it('exige chaque mot plein, et laisse les mots vides', () => {
    expect(rechercher(index, 'bonhomme de neige', null).map(x => x.id)).toEqual(['snowman']);
    expect(rechercher(index, 'xyzzy', null)).toEqual([]);
    expect(rechercher(index, 'bonhomme xyzzy', null)).toEqual([]);
  });

  it('ne trouve plus un mot au milieu d un autre (« pin » ne remonte pas « body-swapping »)', () => {
    const r = ids(rechercher(index, 'pin', null));
    expect(r[0]).toBe('pine-tree');
    expect(r).not.toContain('body-swapping');
    expect(r).not.toContain('camping-tent');
  });

  it('classe : nom entier > mot entier > debut de mot > evenement > synonyme > mot anglais', () => {
    expect(FORCES.mot).toBeGreaterThan(FORCES.debut);
    expect(FORCES.debut).toBeGreaterThan(FORCES.evenement);
    expect(FORCES.evenement).toBeGreaterThan(FORCES.synonyme);
    expect(FORCES.synonyme).toBeGreaterThan(FORCES.anglais);
    // « pin » : le nom entier, puis le debut de mot (pincement), puis le mot anglais (ananas, pelote) ; rien d'autre.
    expect(noms(rechercher(mini, 'pin', null))).toEqual(['pin', 'pincement', 'ananas', 'pelote à épingles']);
    // « noel » : le nom qui le porte, puis l'evenement par representativite (santa, pine, gift).
    expect(noms(rechercher(mini, 'noel', null))).toEqual(['bonnet de père noël', 'pin', 'cadeau piégé']);
    // « sapin » : le synonyme le plus proche (pin) avant le suivant (arbre).
    expect(noms(rechercher(mini, 'sapin', null))).toEqual(['pin', 'arbre']);
    // « chat » : les noms qui le portent, dans l'ordre de presentation, puis ceux qui commencent par lui.
    expect(noms(rechercher(mini, 'chat', null))).toEqual(['chat', 'chat creux', 'château']);
  });

  it('dans un evenement, ne garde que ses formes', () => {
    expect(rechercher(index, 'bonhomme', 'noel').map(x => x.id)).toContain('snowman');
    expect(rechercher(index, 'lapin', 'noel')).toEqual([]);
    expect(rechercher(index, 'lapin', 'paques').length).toBeGreaterThan(0);
  });

  it('garde la signature d hier : chercher(entrees, texte, evenement)', () => {
    expect(ids(chercher(entrees, 'lapin', null))).toEqual(ids(rechercher(index, 'lapin', null)));
  });
});

describe('l ordre sans recherche', () => {
  it('presente les formes rangees, puis les autres, puis les series numerotees ; alphabetique sans mot vide de tete', () => {
    expect(noms(ordreDePresentation(MINI))).toEqual(['bonnet de père noël', 'cadeau piégé', 'chapeau de fête', 'pin', 'ananas', 'arbre', 'chat', 'chat creux', 'château', 'pelote à épingles', 'pincement', 'abstrait 001']);
    const tout = rechercher(index, '', null);
    expect(tout.length).toBe(entrees.length);
    expect(tout[0]?.nom.startsWith('abstrait')).toBe(false);
    expect(tout.findIndex(x => x.id === 'abstract-001')).toBeGreaterThan(entrees.length * 0.8);
  });

  it('range un evenement par representativite : le premier mot-cle porte, puis le nom le plus court', () => {
    const noel = EVENEMENTS.find(e => e.id === 'noel');
    if (!noel) throw new Error('Noël manque');
    expect(rangDansEvenement({ id: 'santa-hat', nom: '', evenements: [], svg: '' }, noel)).toEqual([1, 2]);
    expect(rangDansEvenement({ id: 'xyzzy', nom: '', evenements: [], svg: '' }, noel)[0]).toBe(noel.mots.length);
    const r = rechercher(index, '', 'noel');
    expect(r.length).toBe(entrees.filter(x => x.evenements.includes('noel')).length);
    expect(noms(r, 3)).toEqual(['bonnet de père noël', 'bonhomme de neige', 'pin']);
    // Les formes qui n'evoquent Noel que de loin (une tenue d'ange, un casque d'elfe) ne sont plus en tete.
    expect(ids(r).indexOf('angel-outfit')).toBeGreaterThan(20);
    expect(ids(r).indexOf('elf-helmet')).toBeGreaterThan(20);
  });
});

describe('quand rien ne se trouve', () => {
  it('propose des evenements, a defaut ceux du calendrier qui arrivent', () => {
    const s = suggestions(index, 'xyzzy', null, 10);
    expect(s.length).toBeGreaterThanOrEqual(2);
    expect(s.every(x => x.type === 'evenement' && x.nombre >= 10)).toBe(true);
    expect(s.map(x => (x.type === 'evenement' ? x.id : ''))).toContain('halloween');
  });

  it('corrige une faute de frappe, et reconnait un evenement mal ecrit', () => {
    expect(suggestions(index, 'guitarre', null, 10)[0]).toEqual({ type: 'texte', texte: 'guitare', nombre: 2 });
    expect(suggestions(index, 'halowen', null, 3)[0]).toMatchObject({ type: 'evenement', id: 'halloween' });
    expect(suggestions(index, 'aniversaire', null, 3).some(x => x.type === 'evenement' && x.id === 'anniversaire')).toBe(true);
  });

  it('dans un evenement, propose la meme recherche partout, sans reproposer l evenement en cours', () => {
    const s = suggestions(index, 'lapin', 'noel', 12);
    expect(s[0]).toEqual({ type: 'tous', nombre: rechercher(index, 'lapin', null).length });
    expect(s.some(x => x.type === 'evenement' && x.id === 'noel')).toBe(false);
  });
});

describe('les evenements du calendrier proches d une date', () => {
  it('commencent au mois donne et font le tour de l annee', () => {
    expect(evenementsProches(EVENEMENTS, 10, 3).map(e => e.id)).toEqual(['automne', 'halloween', 'toussaint']);
    expect(evenementsProches(EVENEMENTS, 12, 1).map(e => e.id)).toEqual(['noel']);
    const decembre = ordreCalendrier(EVENEMENTS, 12);
    expect(decembre.length).toBe(EVENEMENTS.filter(e => e.famille === 'calendrier').length);
    expect(decembre.findIndex(e => e.id === 'nouvel-an')).toBeLessThan(decembre.findIndex(e => e.id === 'paques'));
    expect(ordreCalendrier(EVENEMENTS, 1)[0]?.id).toBe('nouvel-an');
  });
});

describe('les synonymes et les exemples', () => {
  const vocabulaire = new Set(entrees.flatMap(x => normaliser(x.nom).split(' ').map(racine)));

  it('chaque exemple du champ de recherche trouve au moins trois formes', () => {
    for (const ex of EXEMPLES_RECHERCHE) expect(rechercher(index, ex, null).length, ex).toBeGreaterThanOrEqual(3);
  });

  it('ne promet que des mots que portent les noms, et des evenements qui existent', () => {
    const evenements = new Set(EVENEMENTS.map(e => e.id));
    for (const [cle, s] of Object.entries(SYNONYMES)) {
      expect(normaliser(cle), 'cle ecrite comme la recherche la compare').toBe(cle);
      for (const phrase of s.mots) for (const mot of normaliser(phrase).split(' ').filter(m => m.length > 1)) expect(vocabulaire.has(racine(mot)), cle + ' -> ' + mot).toBe(true);
      for (const e of s.evenements ?? []) expect(evenements.has(e), cle + ' -> ' + e).toBe(true);
      // Chaque entree trouve des formes : c'est sa raison d'etre.
      expect(rechercher(index, cle, null).length, cle).toBeGreaterThan(0);
    }
  });
});
