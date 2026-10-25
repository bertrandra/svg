import { describe, expect, it } from 'vitest';
import {
  badgeSource, estChoisie, etatLigne, groupesListe, idDeLigne, LARGEUR_LISTE, HAUTEUR_LISTE, nomAccessibleLigne, nombrePolices, pasDePage, placerListe,
  varianteDeLigne, type Disponibilite, type EntreesListe, type GroupePolices, type LignePolice
} from '../../../src/zones/lignesPolices.js';
import { filtrerParNom, idVariante, variantePrincipale, type CataloguePolices, type FamilleCatalogue, type VarianteBrute } from '../../../src/model/cataloguePolices.js';
import { fenetre, segmentsFenetre, SEUIL_FENETRE } from '../../../src/util/fenetre.js';
import type { Police } from '../../../src/io/polices.js';
import { glyphesCarres } from '../engine/glyphesFactices.js';

// La liste deroulante des polices (ADR-0034) : ses groupes et leur ordre, la marque « à télécharger » selon l'etat de chaque
// ligne, la recherche, ce que la liste fenetree dessine, et ou elle s'ouvre. Pur : aucune page, aucun reseau.

const police = (id: string, nom: string, nature: Police['nature'] = 'contour'): Police => ({ id, nom, glyphes: glyphesCarres, nature, version: '0123456789abcd' });
const SHA = (c: string) => c.repeat(43) + '=';
const v400 = (c: string): VarianteBrute => [400, 0, SHA(c), null];
const famille = (id: string, nom: string, source: FamilleCatalogue['source'] = 'google', variantes: VarianteBrute[] = [v400('A')]): FamilleCatalogue => (source === 'fontshare'
  ? { id, nom, depot: 'fontshare', source, categorie: 'lineale', licence: 'ITF-FFL', version: '1.0', ecritures: ['latin'], variantes: variantes.map(v => [...v.slice(0, 4), 'A'.repeat(32) + '/' + 'B'.repeat(32) + '/' + 'C'.repeat(32) + '.woff'] as unknown as VarianteBrute) }
  : { id, nom, depot: 'fontsource', source, categorie: 'lineale', licence: 'OFL-1.1', version: '1.0.0', ecritures: ['latin'], variantes });

const ROBOTO = famille('roboto', 'Roboto', 'google', [[700, 0, SHA('B'), null], v400('C')]);
const FETE = famille('fete', 'Fête Sans');
const SATOSHI = famille('satoshi', 'Satoshi', 'fontshare');
const LOBSTER_GOOGLE = famille('lobster', 'Lobster');
const ROBOTO_FONTSHARE = famille('roboto-fs', 'Roboto', 'fontshare');
const CATALOGUE: CataloguePolices = { format: 1, instantane: '2026-10-25', familles: [FETE, LOBSTER_GOOGLE, ROBOTO, ROBOTO_FONTSHARE, SATOSHI], anciennes: [] };
const ID_ROBOTO = variantePrincipale(ROBOTO)?.id ?? '';
const ID_ROBOTO_GRAS = idVariante(ROBOTO, [700, 0, SHA('B'), null]);
const ID_SATOSHI = variantePrincipale(SATOSHI)?.id ?? '';

const LIVREES: Police[] = [police('inter', 'Inter'), police('inter-gras', 'Inter gras'), police('lobster', 'Lobster'), police('ems-readability', 'EMS Readability', 'trait')];

function entrees(e: Partial<EntreesListe> = {}): EntreesListe {
  return { polices: LIVREES, catalogue: CATALOGUE, valeur: 'inter', duDocument: [], favoris: [], recentes: [], texte: '', ...e };
}
const ids = (g: readonly GroupePolices[]) => g.map(x => x.id);
const groupe = (g: readonly GroupePolices[], id: GroupePolices['id']) => g.find(x => x.id === id)?.lignes ?? [];
const noms = (l: readonly LignePolice[]) => l.map(x => x.nom);
const rien: Disponibilite = { chargees: new Set(LIVREES.map(p => p.id)), enCache: () => false, enCours: null };

describe('les groupes de la liste des polices', () => {
  it('vont de la police actuelle au catalogue, sans groupe vide', () => {
    const g = groupesListe(entrees());
    expect(ids(g)).toEqual(['courante', 'livrees', 'trait', 'catalogue']);
    expect(g.map(x => x.titre)).toEqual(['Police actuelle', 'Livrées avec l’éditeur', 'Trait unique (stylo)', 'Toutes les polices']);
    // La variante grasse d'Inter n'a pas de ligne (elle se choisit dans « Style ») ; le trait unique a son groupe.
    expect(noms(groupe(g, 'livrees'))).toEqual(['Inter', 'Lobster']);
    expect(noms(groupe(g, 'trait'))).toEqual(['EMS Readability']);
    // Une ligne par nom de famille : Lobster est livree, Roboto de Fontshare est cache par celui de Google Fonts.
    expect(noms(groupe(g, 'catalogue'))).toEqual(['Fête Sans', 'Roboto', 'Satoshi']);
    expect(groupe(g, 'catalogue')[1]?.source).toBe('google');
  });

  it('suivent l ordre d un traitement de texte : actuelle, document, favoris, recentes, livrees, trait, vos polices, catalogue', () => {
    const deposee = police('u-0123456789abcd', 'Ma fonte');
    const g = groupesListe(entrees({
      polices: [...LIVREES, deposee], valeur: 'inter-gras',
      duDocument: [{ id: 'lobster' }, { id: ID_ROBOTO }, { id: 'u-ffffffffffffff', famille: 'Fonte perdue' }, { id: 'lobster' }],
      favoris: ['fontsource:roboto', 'fontsource:roboto-fs', 'inter', 'inconnue:x'], recentes: [ID_SATOSHI, 'lobster']
    }));
    expect(ids(g)).toEqual(['courante', 'document', 'favoris', 'recentes', 'livrees', 'trait', 'deposees', 'catalogue']);
    // La police actuelle est la famille livree de la variante grasse.
    expect(noms(groupe(g, 'courante'))).toEqual(['Inter']);
    // Chaque police du document une fois : la livree, la variante du catalogue (pas lue), la fonte perdue (absente).
    expect(noms(groupe(g, 'document'))).toEqual(['Lobster', 'Roboto', 'Fonte perdue']);
    expect(groupe(g, 'document').map(l => etatLigne(l, rien))).toEqual(['locale', 'a-telecharger', 'absente']);
    // Les favoris : une ligne par nom de famille (Roboto de Google Fonts plutot que de Fontshare), une cle inconnue ignoree.
    expect(groupe(g, 'favoris').map(l => [l.nom, l.source])).toEqual([['Roboto', 'google'], ['Inter', 'livree']]);
    expect(noms(groupe(g, 'recentes'))).toEqual(['Satoshi', 'Lobster']);
    expect(noms(groupe(g, 'deposees'))).toEqual(['Ma fonte']);
    // Le nombre de polices ne compte pas deux fois les raccourcis.
    expect(nombrePolices(g)).toBe(2 + 1 + 1 + 3);
  });

  it('sans index (un hote sans polices en ligne), ne montrent que les polices locales', () => {
    const g = groupesListe(entrees({ catalogue: null, duDocument: [{ id: ID_ROBOTO, famille: 'Roboto' }] }));
    expect(ids(g)).toEqual(['courante', 'document', 'livrees', 'trait']);
    expect(groupe(g, 'document').map(l => etatLigne(l, rien))).toEqual(['absente']);
  });

  it('nomment une police actuelle introuvable par le texte donne', () => {
    const g = groupesListe(entrees({ valeur: 'u-0000000000000a', absente: 'Police absente : Ma fonte' }));
    const l = groupe(g, 'courante')[0];
    expect(l?.nom).toBe('Police absente : Ma fonte');
    expect(l && etatLigne(l, rien)).toBe('absente');
    expect(l && idDeLigne(l)).toBeNull();
    // Le nom dit deja l'absence : le nom accessible ne la redit pas.
    expect(l && nomAccessibleLigne(l, 'courante', 'absente')).toBe('Police absente : Ma fonte');
  });
});

describe('la marque « à télécharger »', () => {
  const g = groupesListe(entrees());
  const roboto = groupe(g, 'catalogue').find(l => l.nom === 'Roboto');
  const inter = groupe(g, 'livrees')[0];

  it('ne marque ni une livree, ni une police lue, ni une police que le cache garde', () => {
    if (!roboto || !inter) throw new Error('lignes manquantes');
    expect(etatLigne(inter, rien)).toBe('locale');
    expect(etatLigne(roboto, rien)).toBe('a-telecharger');
    // La ligne d'une famille pose sa variante principale (la reguliere) : c'est elle qui decide.
    expect(varianteDeLigne(roboto)?.id).toBe(ID_ROBOTO);
    expect(etatLigne(roboto, { ...rien, chargees: new Set([...rien.chargees, ID_ROBOTO_GRAS]) })).toBe('a-telecharger');
    expect(etatLigne(roboto, { ...rien, chargees: new Set([...rien.chargees, ID_ROBOTO]) })).toBe('locale');
    expect(etatLigne(roboto, { ...rien, enCache: v => v.id === ID_ROBOTO })).toBe('locale');
    expect(etatLigne(roboto, { ...rien, enCours: ID_ROBOTO })).toBe('en-cours');
  });

  it('se dit en mots dans le nom accessible, avec la source et la licence', () => {
    if (!roboto || !inter) throw new Error('lignes manquantes');
    expect(nomAccessibleLigne(roboto, 'catalogue', 'a-telecharger')).toBe('Roboto, Google Fonts, à télécharger');
    expect(nomAccessibleLigne(roboto, 'catalogue', 'locale')).toBe('Roboto, Google Fonts');
    expect(nomAccessibleLigne(roboto, 'catalogue', 'en-cours')).toBe('Roboto, Google Fonts, téléchargement en cours');
    expect(nomAccessibleLigne(inter, 'livrees', 'locale')).toBe('Inter');
    expect(nomAccessibleLigne(inter, 'favoris', 'locale')).toBe('Inter, Livrée');
    const satoshi = groupe(g, 'catalogue').find(l => l.nom === 'Satoshi');
    if (!satoshi) throw new Error('Satoshi manque');
    expect(nomAccessibleLigne(satoshi, 'catalogue', 'a-telecharger')).toBe('Satoshi, Fontshare, ITF Free Font License, à télécharger');
    const trait = groupe(g, 'trait')[0];
    expect(trait && nomAccessibleLigne(trait, 'trait', 'locale')).toBe('EMS Readability, trait unique');
    expect(trait && badgeSource(trait, 'trait', 'locale')).toBeNull();
  });

  it('montre la police choisie : la famille livree de sa variante grasse, la famille de l index d une variante choisie', () => {
    if (!roboto || !inter) throw new Error('lignes manquantes');
    expect(estChoisie(inter, 'inter-gras', null)).toBe(true);
    expect(estChoisie(roboto, ID_ROBOTO_GRAS, ROBOTO)).toBe(true);
    expect(estChoisie(roboto, 'inter', null)).toBe(false);
    expect(estChoisie(inter, '', null)).toBe(false);
  });
});

describe('la recherche dans la liste', () => {
  it('ignore casse et accents, met d abord les noms qui commencent par le mot, et retire les raccourcis', () => {
    const g = groupesListe(entrees({ texte: 'FETE', favoris: ['fontsource:fete'], recentes: ['inter'] }));
    expect(ids(g)).toEqual(['catalogue']);
    expect(noms(groupe(g, 'catalogue'))).toEqual(['Fête Sans']);
    const r = groupesListe(entrees({ texte: 'o' }));
    // Aucun nom ne commence par « o » : l'ordre d'origine reste.
    expect(noms(groupe(r, 'catalogue'))).toEqual(['Roboto', 'Satoshi']);
    expect(noms(groupe(r, 'livrees'))).toEqual(['Lobster']);
    expect(filtrerParNom(['Satoshi', 'Roboto Slab', 'Roboto'], x => x, 'robo')).toEqual(['Roboto Slab', 'Roboto']);
    expect(filtrerParNom(['Bebas Neue', 'Neue Montreal'], x => x, 'neue')).toEqual(['Neue Montreal', 'Bebas Neue']);
    expect(groupesListe(entrees({ texte: 'zzz' }))).toEqual([]);
  });
});

describe('la liste fenetree', () => {
  it('ne dessine que les lignes visibles et la ligne active, meme loin', () => {
    const total = 2166, pas = 32;
    expect(total).toBeGreaterThan(SEUIL_FENETRE);
    const f = fenetre(total, pas, 0, 440);
    expect(f.fin - f.debut).toBeLessThan(40);
    const segments = segmentsFenetre(f, total, pas, total - 1, 0);
    const lignes = segments.filter(s => s.type === 'ligne').map(s => (s.type === 'ligne' ? s.index : -1));
    expect(lignes).toContain(total - 1);
    // Les cales tiennent exactement la place des lignes absentes : la barre de defilement reste juste.
    const cales = segments.reduce((h, s) => h + (s.type === 'cale' ? s.hauteur : 0), 0);
    expect(cales + lignes.length * pas).toBe(total * pas);
    expect(pasDePage(440, 32)).toBe(12);
    expect(pasDePage(10, 32)).toBe(1);
  });
});

describe('le placement de la liste ouverte', () => {
  const ecran = { largeur: 1280, hauteur: 800 };

  it('s ouvre sous le champ, plus large qu un champ compact, sans sortir de l ecran', () => {
    const p = placerListe({ top: 40, bottom: 68, left: 1200, right: 1260 }, ecran, false);
    expect(p).toMatchObject({ top: 72, width: LARGEUR_LISTE, maxHeight: HAUTEUR_LISTE, feuille: false });
    expect(p.left + p.width).toBeLessThanOrEqual(ecran.largeur - 8);
    expect(placerListe({ top: 40, bottom: 68, left: 100, right: 600 }, ecran, false).width).toBe(500);
  });

  it('s ouvre au-dessus quand le champ est bas', () => {
    const p = placerListe({ top: 700, bottom: 728, left: 10, right: 200 }, ecran, false);
    expect(p.top).toBeUndefined();
    expect(p.bottom).toBe(800 - 700 + 4);
    expect(p.maxHeight).toBe(HAUTEUR_LISTE);
  });

  it('sur un petit ecran, une feuille de toute la largeur jusqu au bord', () => {
    const p = placerListe({ top: 100, bottom: 140, left: 50, right: 200 }, { largeur: 390, hauteur: 844 }, true);
    expect(p).toEqual({ left: 0, width: 390, top: 144, maxHeight: 844 - 144, feuille: true });
  });
});
