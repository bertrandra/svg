// La toile du modele v2 (ADR-0012, etape 2, paquet A). D'abord la garde : un dessin plat rend exactement le DOM d'avant (un calque
// par forme), dans les deux reglages du modele, en vue normale comme en vue « contours ». Puis le rendu par noeud d'un dessin riche :
// les definitions du recueil, un <g> par groupe avec ses attributs ecrits, une image, et le voile hors du contexte d'edition.

import { describe, expect, it } from 'vitest';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ecrireDessin, estPlat, lireDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { Calque } from '../../../src/zones/Toile.js';
import { FormesToile, nomReact, proprietesReact } from '../../../src/zones/ToileNoeuds.js';

const FIXTURES = resolve(__dirname, '../../fixtures/svg');
const lire = (texte: string, modele: 'plat' | 'riche'): DessinSvg | null => { const r = lireDessin(texte, modele === 'riche' ? { modele } : {}); return 'erreur' in r ? null : r.dessin; };
const toile = (dessin: DessinSvg, contours = false, contexte: string | null = null, masquee: string | null = null): string =>
  renderToStaticMarkup(createElement(FormesToile, { dessin, contours, masquee, contexte }));
/** Les calques d'avant le modele v2, tels que ToileEditeur les posait (le corps d'avant, recopie). */
const avant = (dessin: DessinSvg, contours = false, masquee: string | null = null): string =>
  renderToStaticMarkup(createElement(Fragment, null, dessin.formes.map(f => createElement(Calque, { key: f.id, f, contours, masquee: f.id === masquee }))));

describe('un dessin plat rend le DOM d avant, au noeud pres', () => {
  const fichiers = readdirSync(FIXTURES).filter(n => n.endsWith('.svg'));

  it('pour chaque SVG de reference, lu a plat ou en riche quand il reste plat', () => {
    let compares = 0;
    for (const nom of fichiers) {
      const texte = readFileSync(resolve(FIXTURES, nom), 'utf8');
      for (const modele of ['plat', 'riche'] as const) {
        const d = lire(texte, modele);
        if (!d || !estPlat(d)) continue;
        const [premiere] = d.formes;
        for (const contours of [false, true]) expect(toile(d, contours, 'g1'), nom + ' ' + modele + ' ' + String(contours)).toBe(avant(d, contours));
        if (premiere) expect(toile(d, false, null, premiere.id)).toBe(avant(d, false, premiere.id));
        compares++;
      }
    }
    expect(compares).toBeGreaterThan(40);
  });

  it('n y pose ni groupe, ni definition, ni voile', () => {
    const d = lire(readFileSync(resolve(FIXTURES, 'peintures.svg'), 'utf8'), 'plat');
    if (!d) throw new Error('peintures.svg');
    const html = toile(d);
    expect(html).not.toMatch(/data-groupe|<defs|hors-contexte|noeuds-toile/);
  });
});

describe('un dessin riche se rend par noeud, par les crochets de l ecriture', () => {
  const d = lire(readFileSync(resolve(FIXTURES, 'v2/groupes-degrade-image.attendu.svg'), 'utf8'), 'riche');
  if (!d) throw new Error('groupes-degrade-image');
  const html = toile(d);

  it('pose les definitions ecrites, les peintures, les groupes et l image', () => {
    const defs = /<defs>(.*?)<\/defs>/.exec(ecrireDessin(d, 3))?.[1] ?? '';
    // Une definition par <g> de <defs> (etape 7-B : seule celle qui change se reecrit) ; ensemble, le texte ecrit, dans son ordre.
    const rendues = /<defs>(.*?)<\/defs>/.exec(html)?.[1] ?? '';
    expect(rendues.replace(/<\/?g>/g, '')).toBe(defs);
    expect(rendues.match(/<g>/g)?.length).toBe(defs.match(/ id="ed-/g)?.length);
    expect(html).toMatch(/<g data-groupe="g\d+" opacity="0.8" data-ed-nom="Ciel">/);
    expect(html).toMatch(/fill="url\(#ed-d-[0-9a-f]{14}\)"/);
    expect(html).toMatch(/stroke="url\(#ed-d-[0-9a-f]{14}\)"/);
    expect(html).toMatch(/<g data-id="f\d+" pointer-events="visiblePainted"><image xlink:href="data:image\/png;base64,/);
    expect(html).not.toContain('hors-contexte');
  });

  it('en vue « contours », ne rend que des traces, sans attribut de groupe', () => {
    const c = toile(d, true);
    expect(c).not.toMatch(/opacity="0.8"|<image/);
    expect((c.match(/class="trace-contour"/g) ?? []).length).toBe(d.formes.filter(f => f.visible).length);
  });

  it('estompe et rend inerte ce qui est hors du contexte, pas son chemin', () => {
    const ciel = Object.values(d.groupes ?? {}).find(g => g.nom === 'Ciel');
    if (!ciel) throw new Error('Ciel');
    const c = toile(d, false, ciel.id);
    // Le groupe « Photo », frere de « Ciel », est estompe ; « Ciel » ne l'est pas.
    expect(c).toMatch(/<g class="hors-contexte" pointer-events="none"><g data-groupe="g\d+" data-ed-nom="Photo">/);
    expect(c).toMatch(/<g data-groupe="g\d+" opacity="0.8" data-ed-nom="Ciel"><path data-id/);
    expect(c).toMatch(/hors-contexte.*pointer-events="none"><image/);
  });

  it('ne dessine ni un groupe masque, ni le texte en saisie vide', () => {
    const ciel = Object.values(d.groupes ?? {}).find(g => g.nom === 'Ciel');
    if (!ciel) throw new Error('Ciel');
    const masque: DessinSvg = { ...d, groupes: { ...d.groupes, [ciel.id]: { ...ciel, visible: false } } };
    expect(toile(masque)).not.toContain('Ciel');
    const [f] = d.formes;
    if (f) expect(toile(d, false, null, f.id)).not.toContain('data-id="' + f.id + '"');
  });
});

describe('les attributs ecrits en proprietes React', () => {
  it('garde data- et aria-, met le reste en camelCase, et ecarte id, style et gestionnaires', () => {
    expect(nomReact('clip-path')).toBe('clipPath');
    expect(nomReact('xlink:href')).toBe('xlinkHref');
    expect(nomReact('data-ed-nom')).toBe('data-ed-nom');
    expect(nomReact('class')).toBe('className');
    expect(proprietesReact([['opacity', '0.5'], ['id', 'x'], ['style', 'fill:red'], ['onload', 'x()'], ['fill-opacity', '1']])).toEqual({ opacity: '0.5', fillOpacity: '1' });
  });
});
