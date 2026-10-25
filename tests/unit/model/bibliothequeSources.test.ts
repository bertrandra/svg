import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EVENEMENTS, construireBibliotheque, motsInconnus, nomFrancais, type EntreeBibliotheque, type IconeSource } from '../../../src/model/bibliotheque.js';
import {
  classerDansSource, cleEntree, construireSource, ecartee, filtrerEntrees, naturesDansLOrdre, nomDansSource, sourcesDemandees, svgSurPlan, varianteDe, type CategoriesJeu, type JeuIcones
} from '../../../src/model/bibliothequeSources.js';
import { MOTS_DE_MARQUE, SOURCES_FORMES, SOURCE_PAR_DEFAUT, type SourceFormes } from '../../../src/model/sourcesFormes.js';
import { origineDeForme, origineValide } from '../../../src/model/credits.js';
import { lireDessin } from '../../../src/engine/editionSvg.js';
import { au } from '../../../src/util/tableaux.js';

// Chaque source libre se lit en entier, comme game-icons (tests/unit/model/bibliotheque.test.ts) : chaque forme s'ouvre dans
// l'editeur, son nom est francais (moins de 3 % des noms portent un mot anglais, SUR CHAQUE SOURCE), sa nature est celle de
// sa variante, son origine s'ecrit, aucun logo de marque ne passe, et chaque evenement garde ses dix formes.

const racine = resolve(__dirname, '../../..');
const libres = SOURCES_FORMES.filter(s => s.id !== SOURCE_PAR_DEFAUT);
const source = (id: string): SourceFormes => au(SOURCES_FORMES.filter(s => s.id === id), 0);

function charger(s: SourceFormes): { jeu: JeuIcones; categories: CategoriesJeu; entrees: EntreeBibliotheque[] } {
  const dossier = resolve(racine, 'node_modules', s.paquet);
  const jeu = JSON.parse(readFileSync(resolve(dossier, 'icons.json'), 'utf8')) as JeuIcones;
  const meta = resolve(dossier, 'metadata.json');
  const categories = existsSync(meta) ? (JSON.parse(readFileSync(meta, 'utf8')) as { categories?: CategoriesJeu }).categories ?? {} : {};
  return { jeu, categories, entrees: construireSource(s, jeu, categories) };
}

describe('les variantes, les exclusions et le plan', () => {
  it('reconnait la variante par la plus longue terminaison, et ecarte celles qu on ne garde pas', () => {
    const ph = source('ph'), sante = source('healthicons'), mdi = source('mdi');
    expect(varianteDe(ph, 'heart-fill')).toMatchObject({ base: 'heart', variante: { nature: 'plein' } });
    expect(varianteDe(ph, 'heart-thin')).toMatchObject({ base: 'heart', variante: { nature: 'ligne', trace: 'contour' } });
    expect(varianteDe(ph, 'heart')).toBeUndefined();
    expect(varianteDe(ph, 'heart-bold')).toBeUndefined();
    expect(varianteDe(sante, 'heart-outline-24px')).toBeUndefined();
    expect(varianteDe(sante, 'heart-outline')).toMatchObject({ base: 'heart', variante: { nature: 'ligne' } });
    expect(varianteDe(sante, 'heart-negative')).toBeUndefined();
    expect(varianteDe(mdi, 'heart-outline')).toMatchObject({ base: 'heart', variante: { nature: 'plein', qualificatif: 'en contour' } });
    // Un identifiant qui n'est que la terminaison n'est pas une variante de rien.
    expect(varianteDe(mdi, 'outline')).toMatchObject({ base: 'outline', variante: { suffixe: '' } });
  });

  it('ecarte par mot, par debut, par identifiant et par categorie', () => {
    expect(ecartee(source('ph'), 'apple-logo-fill', new Set())).toBe(true);
    expect(ecartee(source('tabler'), 'brand-github', new Set())).toBe(true);
    expect(ecartee(source('lucide'), 'figma', new Set())).toBe(true);
    expect(ecartee(source('lucide'), 'pocket-knife', new Set())).toBe(false);
    expect(ecartee(source('mdi'), 'abacus', new Set(['abacus']))).toBe(true);
    expect(ecartee(source('mdi'), 'food-apple', new Set())).toBe(true);
    expect(ecartee(source('mdi'), 'heart', new Set())).toBe(false);
  });

  it('pose une icone sur le plan de la source par un facteur exact', () => {
    expect(svgSurPlan({ body: '<path fill="currentColor" d="M0 0h24v24z"/>' }, 24, 24, 480))
      .toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480"><g transform="scale(20)"><path fill="#000000" d="M0 0h24v24z"/></g></svg>');
    expect(svgSurPlan({ body: '', width: 24, height: 24 }, 48, 48, 480)).toContain('viewBox="0 0 240 240"><g transform="scale(10)">');
    expect(svgSurPlan({ body: '' }, 256, 256, 480)).toContain('scale(1.875)');
  });

  it('nomme dans l ordre de la source, avec le qualificatif de la variante, sans toucher aux noms de game-icons', () => {
    const mdi = source('mdi');
    expect(nomDansSource(mdi, 'account-arrow-left', au(mdi.variantes, 0))).toBe('compte flèche gauche');
    expect(nomDansSource(mdi, 'heart', au(mdi.variantes, 1))).toBe('cœur en contour');
    expect(nomDansSource(mdi, 'bell-off', au(mdi.variantes, 0))).toBe('cloche barré');
    expect(nomDansSource(mdi, 'credit-card-plus', au(mdi.variantes, 0))).toBe('carte bancaire plus');
    expect(nomDansSource(source('healthicons'), 'blood-bag', au(source('healthicons').variantes, 0))).toBe('poche de sang');
    // game-icons garde ses noms : « top » y est une toupie, « off » n'y est pas un sens d'interface.
    expect(nomFrancais('spinning-top')).toBe(nomFrancais('spinning-top', 'anglais', false));
    expect(nomFrancais('top', 'anglais')).not.toBe(nomFrancais('top', 'anglais', true));
  });

  it('range une fleche d interface dans les symboles, pas dans les armes, et le sang d un jeu de sante hors d Halloween', () => {
    expect(classerDansSource(source('lucide'), 'arrow-up')).not.toContain('arme');
    expect(classerDansSource(source('lucide'), 'arrow-up')).toContain('symbole');
    expect(classerDansSource(source('lucide'), 'sword')).toContain('arme');
    expect(classerDansSource(source('healthicons'), 'blood-drop')).not.toContain('halloween');
  });
});

describe('les filtres', () => {
  const e = (id: string, src?: string, nature?: 'plein' | 'ligne'): EntreeBibliotheque => ({ id, nom: id, evenements: [], svg: '<svg/>', ...(src ? { source: src } : {}), ...(nature ? { nature } : {}) });
  const liste = [e('a'), e('b', 'mdi', 'plein'), e('c', 'lucide', 'ligne'), e('d', 'tabler', 'ligne'), e('d', 'tabler', 'plein')];

  it('filtre par source (game-icons a defaut) et par nature (plein a defaut)', () => {
    expect(filtrerEntrees(liste, 'game-icons', null).map(x => x.id)).toEqual(['a']);
    expect(filtrerEntrees(liste, null, 'ligne').map(x => x.id)).toEqual(['c', 'd']);
    expect(filtrerEntrees(liste, 'tabler', 'plein').map(cleEntree)).toEqual(['tabler:d']);
    expect(filtrerEntrees(liste, null, null)).toHaveLength(5);
  });

  it('ne demande que les sources qui ont la nature choisie', () => {
    expect(sourcesDemandees(null, 'ligne').map(s => s.id)).toEqual(['ph', 'tabler', 'healthicons', 'lucide']);
    expect(sourcesDemandees('mdi', 'ligne')).toEqual([]);
    expect(sourcesDemandees(null, null)).toHaveLength(SOURCES_FORMES.length);
    expect(sourcesDemandees('lucide', null).map(s => s.id)).toEqual(['lucide']);
  });

  it('propose « En ligne » d abord au stylo, « Pleines » sinon', () => {
    expect(naturesDansLOrdre('stylo')).toEqual(['ligne', 'plein']);
    expect(naturesDansLOrdre('decoupe')).toEqual(['plein', 'ligne']);
    expect(naturesDansLOrdre(undefined)).toEqual(['plein', 'ligne']);
  });
});

describe.each(libres.map(s => [s.id, s] as const))('la source %s, lue en entier', (_id, s) => {
  const { jeu, entrees } = charger(s);

  it('garde des formes de chaque variante retenue, avec leur source et leur nature', () => {
    expect(entrees.length).toBeGreaterThan(1000);
    for (const v of s.variantes) expect(entrees.filter(x => x.nature === v.nature).length, v.suffixe).toBeGreaterThan(500);
    expect(entrees.every(x => x.source === s.id)).toBe(true);
    expect(entrees.some(x => jeu.icons[x.id]?.hidden)).toBe(false);
    expect(new Set(entrees.map(x => x.id)).size).toBe(entrees.length);
  });

  it('ouvre chaque forme dans l editeur, et lit une forme en ligne avec ses traits', () => {
    const illisibles: string[] = [], malLues: string[] = [];
    for (const x of entrees) {
      const lu = lireDessin(x.svg);
      if ('erreur' in lu) { illisibles.push(x.id); continue; }
      const v = varianteDe(s, x.id)?.variante;
      const formes = lu.dessin.formes;
      // Une ligne trait : des traces sans fond ; une forme pleine ou une ligne en surface : des fonds.
      const bien = v?.trace === 'trait' ? formes.some(f => f.contour !== null && f.remplissage === null) : formes.every(f => f.remplissage !== null);
      if (!bien) malLues.push(x.id);
    }
    expect(illisibles).toEqual([]);
    expect(malLues.length / entrees.length, 'formes dont la lecture contredit la nature : ' + malLues.slice(0, 10).join(', ')).toBeLessThan(0.01);
  });

  it('donne a chaque forme une origine que l ecriture sait garder', () => {
    expect(entrees.filter(x => !origineValide(origineDeForme(s.id, x.id))).map(x => x.id)).toEqual([]);
  });

  it('traduit presque tout le vocabulaire des noms : moins de 3 % des noms portent un mot anglais', () => {
    const bases = entrees.map(x => varianteDe(s, x.id)?.base ?? x.id);
    const touches = bases.filter(b => motsInconnus(b, true).length).length;
    expect(touches / entrees.length, 'part des formes au nom partiellement anglais').toBeLessThan(0.03);
    expect(new Set(bases.flatMap(b => motsInconnus(b, true))).size).toBeLessThan(80);
  });

  it('ne laisse passer aucun logo de marque', () => {
    expect(entrees.filter(x => x.id.split('-').some(m => MOTS_DE_MARQUE.includes(m))).map(x => x.id)).toEqual([]);
  });

  it('range la plupart des formes dans un evenement', () => {
    expect(entrees.filter(x => x.evenements.length === 0).length / entrees.length).toBeLessThan(0.6);
  });
});

describe('toutes sources confondues', () => {
  it('chaque evenement garde au moins dix formes', () => {
    const gi = JSON.parse(readFileSync(resolve(racine, 'node_modules/@iconify-json/game-icons/icons.json'), 'utf8')) as { width: number; icons: Record<string, IconeSource> };
    const toutes = [...construireBibliotheque(gi.icons, gi.width), ...libres.flatMap(s => charger(s).entrees)];
    const compte = new Map<string, number>();
    for (const x of toutes) for (const ev of x.evenements) compte.set(ev, (compte.get(ev) ?? 0) + 1);
    expect(EVENEMENTS.filter(ev => (compte.get(ev.id) ?? 0) < 10).map(ev => ev.id)).toEqual([]);
    expect(new Set(toutes.map(cleEntree)).size).toBe(toutes.length);
  });
});
