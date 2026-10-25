// Les constats du stylo et de la lame pour le texte et les traits ouverts (ADR-0022), et leurs corrections.

import { describe, expect, it } from 'vitest';
import type { Chemin, DessinSvg, Forme, TexteVivant } from '../../../src/engine/editionSvg.js';
import { constatsDecoupeTexte, constatsStylo, corrigerTexte, textesQuiSeChevauchent } from '../../../src/engine/preparation/stylo.js';
import { cheminDuTexte } from '../../../src/engine/texte/bloc.js';
import { creerTexte, nouveauTexte, peintureDuTexte } from '../../../src/engine/texte/vivant.js';
import { glyphesCarres } from './glyphesFactices.js';

const carre: Chemin = [{ c: 'M', p: [0, 0] }, { c: 'L', p: [10, 0] }, { c: 'L', p: [10, 10] }, { c: 'L', p: [0, 10] }, { c: 'Z', p: [] }];
const ligne: Chemin = [{ c: 'M', p: [0, 20] }, { c: 'L', p: [30, 20] }];
const f = (id: string, d: Chemin, p: Partial<Forme> = {}): Forme => ({ id, d, remplissage: '#c81e28', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, ...p });
const vide: DessinSvg = { vb: [0, 0, 200, 100], formes: [] };
const avecTexte = (texte: string, police: string, interlettrage = 0): DessinSvg => {
  const t: TexteVivant = { ...nouveauTexte(texte, { id: police }, 20, [1, 0, 0, 1, 10, 50]), interlettrage };
  const trait = police === 'ems-readability';
  return creerTexte(vide, t, cheminDuTexte(t, glyphesCarres), peintureDuTexte(trait ? 'trait' : 'contour', { remplissage: '#1f4e8c', contour: null, epaisseur: 1 }, 0.5)).dessin;
};

describe('le stylo ne remplit pas', () => {
  it('une forme pleine : le stylo trace son pourtour ; garder le contour ou hachurer', () => {
    const c = constatsStylo({ ...vide, formes: [f('f1', carre)] });
    expect(c.map(x => x.code)).toEqual(['stylo-plein']);
    expect(c[0]?.corrections).toEqual(['garder-contour', 'hachurer']);
    expect(c[0]?.message).toMatch(/^Le stylo trace le pourtour des formes pleines/);
  });

  it('un texte a contour : en plus, la police a trait et le constat du double trait', () => {
    const c = constatsStylo(avecTexte('AB', 'inter'));
    expect(c.map(x => x.code)).toEqual(['stylo-plein', 'stylo-double-trait']);
    expect(c[0]?.corrections).toContain('police-trait');
    expect(c[1]?.message).toMatch(/^Double trait : ce texte à contour sera dessiné en lettres creuses/);
  });

  it('un texte a trait unique et une ligne : rien a dire au stylo', () => {
    expect(constatsStylo(avecTexte('AB', 'ems-readability'))).toEqual([]);
    expect(constatsStylo({ ...vide, formes: [f('f1', ligne, { remplissage: null, contour: '#000000', epaisseur: 1 })] })).toEqual([]);
  });

  it('garder le contour : le fond devient le trait, a la largeur du stylo, sans fond ; un texte devient ses contours', () => {
    const d = avecTexte('AB', 'inter');
    const r = corrigerTexte(d, 'garder-contour', ['f1'], 1.5);
    if ('erreur' in r) throw new Error(r.erreur);
    expect(r.dessin.formes[0]).toMatchObject({ remplissage: null, contour: '#1f4e8c', epaisseur: 1.5 });
    expect(r.dessin.formes[0]?.texte).toBeUndefined();
  });

  it('hachurer : la forme devient son pourtour et ses lignes, en trait', () => {
    const r = corrigerTexte({ ...vide, formes: [f('f1', carre)] }, 'hachurer', ['f1'], 1);
    if ('erreur' in r) throw new Error(r.erreur);
    expect(r.dessin.formes[0]).toMatchObject({ remplissage: null, contour: '#c81e28', epaisseur: 1 });
    expect(r.phrase).toMatch(/hachurée à la largeur du stylo/);
  });
});

describe('la lame ne decoupe pas une ligne, et soude les lettres qui se touchent', () => {
  it('un trait ouvert et un texte a trait unique : contour en forme, ou procede stylo', () => {
    const d: DessinSvg = { ...avecTexte('AB', 'ems-readability'), formes: [...avecTexte('AB', 'ems-readability').formes, f('f9', ligne, { remplissage: null, contour: '#000000', epaisseur: 1 })] };
    const c = constatsDecoupeTexte(d);
    expect(c.map(x => x.code)).toEqual(['decoupe-trait-ouvert']);
    expect(c[0]?.formes).toEqual(['f1', 'f9']);
    expect(c[0]?.message).toMatch(/^Un trait ouvert ne se découpe pas/);
  });

  it('un contour ferme sans fond n est pas un trait ouvert (le constat « trait » le dit deja)', () => {
    expect(constatsDecoupeTexte({ ...vide, formes: [f('f1', carre, { remplissage: null, contour: '#000000', epaisseur: 1 })] })).toEqual([]);
  });

  it('des lettres qui se chevauchent : « Souder », et la soudure les rend d un seul tenant', () => {
    const serre = avecTexte('ABC', 'inter', -0.2);
    expect(textesQuiSeChevauchent(serre).map(x => x.id)).toEqual(['f1']);
    expect(textesQuiSeChevauchent(avecTexte('ABC', 'inter'))).toEqual([]);
    const c = constatsDecoupeTexte(serre);
    expect(c.map(x => x.code)).toEqual(['lettres-chevauchent']);
    expect(c[0]?.message).toBe('Les lettres se chevauchent : soudez-les pour une découpe d’un seul tenant.');
    const r = corrigerTexte(serre, 'souder', ['f1'], 1);
    if ('erreur' in r) throw new Error(r.erreur);
    expect(r.dessin.formes).toHaveLength(1);
    expect(r.dessin.formes[0]?.texte).toBeUndefined();
    expect(constatsDecoupeTexte(r.dessin)).toEqual([]);
  });
});

describe('dans le panneau « Prêt pour Cricut », en découpe', () => {
  it('le constat des lettres qui se chevauchent propose « Souder », que corrigerPreparation applique', async () => {
    const { constatsPreparation, corrigerPreparation, resoudreProfil } = await import('../../../src/engine/preparation.js');
    const { CHOIX_CRICUT_DEFAUT } = await import('../../../src/model/contextes.js');
    const p = resoudreProfil({ contexte: 'cricut', ...CHOIX_CRICUT_DEFAUT });
    if (!p) throw new Error('profil');
    const serre = avecTexte('ABC', 'inter', -0.2);
    const c = constatsPreparation(serre, p).find(x => x.code === 'lettres-chevauchent');
    expect(c).toMatchObject({ gravite: 'a-corriger', correction: 'souder', formes: ['f1'] });
    const r = corrigerPreparation(serre, 'souder', { formes: ['f1'] }, p);
    if ('erreur' in r) throw new Error(r.erreur);
    expect(constatsPreparation(r.dessin, p).some(x => x.code === 'lettres-chevauchent')).toBe(false);
  });
});
