// La loi du dessin plat (ADR-0012, annexe 7 §3, porte G4) : pour tout dessin plat, chaque fonction que le modele v2 a touchee rend
// exactement ce que rendait celle d'avant (profondement egal, et le MEME objet quand l'ancienne rendait le meme objet). Les
// anciennes sont figees dans `anciennes/` ; le corpus est tout SVG de tests/fixtures/svg qui s'ouvre. Une etape qui touche le corps
// d'une fonction de plus y recopie l'ancien et ajoute son cas ici ; le dossier et ce fichier partent a la bascule (etape 14).

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FONCTIONNALITES, arbreDe, coller, dupliquer, ecrireDessin, estPlat, feuillesDe, inserer, lireDessin, modifier, normaliser, poidsDessin, promouvoir,
  rotation, translation, echelle, multiplier, transformer, unites, verifierDessin, type DessinSvg, type Matrice
} from '../../../src/engine/editionSvg.js';
import { refusDe } from '../../../src/engine/edition/heritage.js';
import { aplatirPour, CAPACITES_PLAT } from '../../../src/engine/aplatir.js';
import { au } from '../../../src/util/tableaux.js';
import { ecrireDessinAncien } from './anciennes/ecriture.js';
import { collerAncien, dupliquerAncien, insererAncien, modifierAncien, refusDeAncien, transformerAncien } from './anciennes/operations.js';

const DOSSIER = resolve(__dirname, '../../fixtures/svg');
const textes = readdirSync(DOSSIER).filter(n => n.endsWith('.svg')).sort().map(nom => ({ nom, svg: readFileSync(resolve(DOSSIER, nom), 'utf8').replace(/\r\n/g, '\n') }));
const corpus: Array<{ nom: string; svg: string; d: DessinSvg }> = textes.flatMap(t => {
  const r = lireDessin(t.svg);
  return 'erreur' in r ? [] : [{ ...t, d: r.dessin }];
});

const MATRICES: ReadonlyArray<readonly [string, Matrice]> = [
  ['translation', translation(12.5, -7.25)],
  ['rotation', rotation(33, 40, 60)],
  ['echelle non uniforme', echelle(1.7, 0.45, 10, 20)],
  ['inclinaison', multiplier([1, 0, 0.35, 1, 0, 0], echelle(-1, 1, 50, 0))]
];

describe('la loi du dessin plat', () => {
  it('le corpus est assez grand pour couvrir le modele plat', () => {
    expect(corpus.length).toBeGreaterThan(100);
    expect(corpus.some(c => c.d.formes.some(f => f.texte?.disposition))).toBe(true);
    expect(corpus.some(c => c.d.formes.some(f => f.origine))).toBe(true);
    expect(corpus.some(c => c.d.formes.some(f => f.pointilles))).toBe(true);
  });

  it('tout dessin lu en mode plat est plat, normal, bien forme ; son arbre est une feuille par forme ; sa descente est lui-meme', () => {
    for (const { nom, d } of corpus) {
      expect(estPlat(d), nom).toBe(true);
      expect(normaliser(d), nom).toBe(d);
      expect(verifierDessin(d), nom).toEqual([]);
      expect(poidsDessin(d), nom).toBe(d.formes.length);
      expect(aplatirPour(d, CAPACITES_PLAT).dessin, nom).toBe(d);
      const a = arbreDe(d);
      expect(a.racine.map(n => (n.genre === 'feuille' ? n.forme : null)), nom).toEqual(d.formes);
      const ids = d.formes.map(f => f.id);
      expect(feuillesDe(d, [...ids].reverse()), nom).toEqual(ids);
      expect(unites(d, ids), nom).toEqual(ids);
      expect(promouvoir(d, ids), nom).toEqual(ids);
    }
  });

  it('ecrireDessin rend les octets de l ancienne ecriture, a toute precision, avec ou sans operations', () => {
    for (const { nom, d } of corpus) {
      for (const precision of [2, 3]) {
        for (const operations of [false, true]) expect(ecrireDessin(d, precision, operations), nom).toBe(ecrireDessinAncien(d, precision, operations));
      }
    }
  });

  it('transformer rend le dessin de l ancienne transformation, et le meme objet quand rien ne change', () => {
    for (const { nom, d } of corpus) {
      const ids = d.formes.map(f => f.id), moitie = ids.filter((_, i) => i % 2 === 0);
      for (const [quoi, m] of MATRICES) {
        expect(transformer(d, ids, m), nom + ' ' + quoi).toEqual(transformerAncien(d, ids, m));
        expect(transformer(d, moitie, m), nom + ' ' + quoi).toEqual(transformerAncien(d, moitie, m));
      }
      const [, m] = au(MATRICES, 0);
      expect(transformer(d, [], m), nom).toBe(d);
      expect(transformerAncien(d, [], m), nom).toBe(d);
    }
  });

  it('dupliquer, coller et inserer rendent ce que rendaient les anciennes', () => {
    const cible = { x: 5, y: 7, l: 123.4, h: 56.7 };
    for (const { nom, d } of corpus) {
      const ids = d.formes.map(f => f.id);
      expect(dupliquer(d, ids, 4, -3), nom).toEqual(dupliquerAncien(d, ids, 4, -3));
      expect(dupliquer(d, ids), nom).toEqual(dupliquerAncien(d, ids));
      expect(dupliquer(d, []).dessin, nom).toBe(d);
      expect(coller(d, d.formes, 10, 10), nom).toEqual(collerAncien(d, d.formes, 10, 10));
      expect(coller(d, d.formes), nom).toEqual(collerAncien(d, d.formes));
      expect(inserer(d, d, cible), nom).toEqual(insererAncien(d, d, cible));
    }
  });

  it('modifier rend ce que rendait l ancien, et le meme objet quand rien ne change', () => {
    const reglages = [{ remplissage: '#123456' }, { contour: '#000000' }, { remplissage: null, contour: null }, { opacite: 0.5, visible: false }, { epaisseur: 3, regle: 'evenodd' as const }];
    for (const { nom, d } of corpus) {
      const ids = d.formes.map(f => f.id);
      for (const r of reglages) expect(modifier(d, ids, r), nom).toEqual(modifierAncien(d, ids, r));
      const premiere = d.formes[0];
      if (premiere) expect(modifier(d, [premiere.id], { remplissage: premiere.remplissage }), nom).toBe(d);
    }
  });

  it('refusDe sans fonctionnalite refuse exactement comme avant', () => {
    const valeurs = [undefined, 'none', 'url(#a)', ''];
    for (const clip of valeurs) for (const mask of valeurs) for (const filter of valeurs) {
      const pr: Record<string, string> = {};
      if (clip !== undefined) pr['clip-path'] = clip;
      if (mask !== undefined) pr.mask = mask;
      if (filter !== undefined) pr.filter = filter;
      expect(refusDe(pr)).toBe(refusDeAncien(pr));
    }
  });

  it('la lecture riche lit comme la plate tout SVG sans groupe (et tout SVG tant que le catalogue est vide)', () => {
    for (const { nom, svg } of textes) {
      const plat = lireDessin(svg), explicite = lireDessin(svg, { modele: 'plat' });
      expect(explicite, nom).toEqual(plat);
      // Les 17 entrees sans <g> ne bougent jamais, meme en riche (annexe 2 §3) ; les autres, tant qu'aucune fonctionnalite n'est inscrite.
      if (!/<(?:g|a)[\s>/]/.test(svg) || FONCTIONNALITES.length === 0) expect(lireDessin(svg, { modele: 'riche' }), nom).toEqual(plat);
    }
  });
});
