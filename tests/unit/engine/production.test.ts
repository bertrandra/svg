// La marque du contexte de production dans le SVG (ADR-0013) : posee sur la racine en contexte Cricut, relue a
// l'ouverture, ABSENTE en Generique (pas un octet de plus), et sans rien relacher du nettoyage.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ecrireDessin, lireDessin, lireProduction, marquerProduction, type DessinSvg, type MarqueProduction } from '../../../src/engine/editionSvg.js';
import { choixDeMarque, marqueDeChoix, normaliserChoix, resoudreProfil } from '../../../src/engine/preparation.js';
import { CHOIX_CRICUT_DEFAUT, CHOIX_GENERIQUE, type ChoixProduction } from '../../../src/model/contextes.js';
import { nettoyerSvg } from '../../../src/util/svg.js';
import { violationsEcriture, violationsNettoyage } from '../securite/invariants.js';

const DOSSIER = resolve(__dirname, '../../fixtures/svg');
const lire = (svg: string): DessinSvg => { const r = lireDessin(svg); if ('erreur' in r) throw new Error(r.erreur); return r.dessin; };
const CARRE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 96"><path d="M0 0H96V96H0Z" fill="#c81e28"/></svg>';
const CRICUT_MAKER: ChoixProduction = { contexte: 'cricut', ...CHOIX_CRICUT_DEFAUT };
const MARQUE: MarqueProduction = { contexte: 'cricut', machine: 'maker', tapis: '12x12', materiau: 'papier-cartonne', procede: 'decoupe', unite: 'in' };

describe('la marque de production', () => {
  it('se pose a la fin des attributs de la racine, dans un ordre fixe', () => {
    const ecrit = marquerProduction(ecrireDessin(lire(CARRE), 3), MARQUE);
    expect(ecrit.slice(0, ecrit.indexOf('>') + 1)).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 96" width="192" height="96" data-ed-contexte="cricut" data-ed-machine="maker" data-ed-tapis="12x12" data-ed-materiau="papier-cartonne" data-ed-procede="decoupe" data-ed-unite="in">');
    expect(marquerProduction(ecrit.replace(/ data-ed-[^ >]*/g, ''), { contexte: 'cricut', machine: 'maker', unite: 'in', tapis: '12x12', procede: 'decoupe', materiau: 'papier-cartonne' })).toBe(ecrit);
  });

  it('n ecrit rien sans marque : un dessin Generique garde exactement ses octets', () => {
    const fixtures = readdirSync(DOSSIER).filter(f => f.endsWith('.attendu.svg'));
    expect(fixtures.length).toBeGreaterThan(50);
    for (const f of fixtures) {
      const texte = readFileSync(resolve(DOSSIER, f), 'utf8');
      expect(marquerProduction(texte, null), f).toBe(texte);
      expect(marquerProduction(texte, marqueDeChoix(CHOIX_GENERIQUE)), f).toBe(texte);
    }
    expect(marqueDeChoix(CHOIX_GENERIQUE)).toBeNull();
  });

  it('se relit a l ouverture, et une ecriture sans marque n en a pas', () => {
    const marque = marquerProduction(ecrireDessin(lire(CARRE), 3), MARQUE);
    const r = lireDessin(marque);
    expect('erreur' in r ? null : r.production).toEqual(MARQUE);
    const sans = lireDessin(ecrireDessin(lire(CARRE), 3));
    expect('erreur' in sans ? 'erreur' : 'production' in sans).toBe(false);
    // Le dessin relu est le meme : la marque ne touche ni au plan ni aux formes.
    expect('erreur' in r ? null : ecrireDessin(r.dessin, 3)).toBe(ecrireDessin(lire(CARRE), 3));
  });

  it('tait les valeurs qui ne sont pas des identifiants, a l ecriture comme a la lecture', () => {
    const hostile = { contexte: 'cricut', machine: 'x" onload="alert(1)', tapis: 'JAVASCRIPT:', unite: 'in' };
    const ecrit = marquerProduction('<svg viewBox="0 0 1 1"></svg>', hostile);
    expect(ecrit).toBe('<svg viewBox="0 0 1 1" data-ed-contexte="cricut" data-ed-unite="in"></svg>');
    expect(marquerProduction('<svg viewBox="0 0 1 1"></svg>', { contexte: 'Cricut!' })).toBe('<svg viewBox="0 0 1 1"></svg>');
    expect(lireProduction({ 'data-ed-contexte': 'cricut', 'data-ed-machine': 'javascript:alert(1)', 'data-ed-tapis': '12x12' })).toEqual({ contexte: 'cricut', tapis: '12x12' });
    expect(lireProduction({ 'data-ed-machine': 'maker' })).toBeNull();
    expect(lireProduction({ 'data-ed-contexte': '' })).toBeNull();
    // Une balise auto-fermante garde sa barre.
    expect(marquerProduction('<svg viewBox="0 0 1 1"/>', { contexte: 'cricut' })).toBe('<svg viewBox="0 0 1 1" data-ed-contexte="cricut"/>');
  });

  it('passe le nettoyage sans changer d un octet, et l ecriture marquee respecte les invariants', () => {
    const marque = marquerProduction(ecrireDessin(lire(CARRE), 3), MARQUE);
    expect(nettoyerSvg(marque)?.svg).toBe(marque);
    expect(violationsNettoyage(marque)).toEqual([]);
    expect(violationsEcriture(marque)).toEqual([]);
  });

  it('ne relache rien : une marque hors de la racine, ou une valeur libre, est une violation de l ecriture', () => {
    expect(violationsEcriture('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" width="1" height="1"><path d="M0 0Z" fill="#000000" data-ed-contexte="cricut"/></svg>')).not.toEqual([]);
    expect(violationsEcriture('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" width="1" height="1" data-ed-contexte="url(x)"></svg>')).not.toEqual([]);
    expect(violationsEcriture('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" width="1" height="1" data-ed-autre="cricut"></svg>')).not.toEqual([]);
  });

  it('nettoie une valeur hostile au nettoyage, que la lecture tait ensuite', () => {
    const propre = nettoyerSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" data-ed-contexte="javascript:cricut" data-ed-machine="maker"><path d="M0 0H5V5Z"/></svg>');
    expect(propre).not.toBeNull();
    expect(violationsNettoyage(propre?.svg ?? '')).toEqual([]);
    const r = lireDessin(propre?.svg ?? '');
    expect('erreur' in r ? null : r.production?.contexte).toBe('cricut');
  });
});

describe('le choix et sa marque', () => {
  it('resout le choix par defaut, et se refait a l identique depuis sa marque', () => {
    const m = marqueDeChoix(CRICUT_MAKER);
    expect(m).toEqual(MARQUE);
    expect(choixDeMarque(m).choix).toEqual(CRICUT_MAKER);
    expect(choixDeMarque(null).choix).toEqual(CHOIX_GENERIQUE);
  });

  it('dit un contexte inconnu (un fichier d une version plus recente) et ouvre en Generique', () => {
    expect(choixDeMarque({ contexte: 'silhouette', machine: 'cameo' })).toEqual({ choix: CHOIX_GENERIQUE, inconnu: 'silhouette' });
  });

  it('ramene un choix incoherent au plus proche choix valide', () => {
    expect(normaliserChoix({ ...CRICUT_MAKER, machine: 'joy' })).toEqual({ ...CRICUT_MAKER, machine: 'joy', tapis: 'joy-4x6' });
    expect(normaliserChoix({ ...CRICUT_MAKER, machine: 'joy', tapis: 'joy-4x12', procede: 'imprimer-decouper' })).toEqual({ ...CRICUT_MAKER, machine: 'joy', tapis: 'joy-4x12', procede: 'decoupe' });
    expect(normaliserChoix({ ...CRICUT_MAKER, materiau: 'vinyle' })).toEqual(CRICUT_MAKER);
    expect(normaliserChoix({ ...CRICUT_MAKER, machine: 'inconnue' })).toEqual(CRICUT_MAKER);
    expect(normaliserChoix(CRICUT_MAKER)).toBe(CRICUT_MAKER);
    expect(choixDeMarque({ contexte: 'cricut', machine: 'joy', tapis: '12x24' }).choix).toEqual({ ...CRICUT_MAKER, machine: 'joy', tapis: 'joy-4x6' });
  });

  it('resout un profil en unites du plan (96 au pouce) ; Generique n en a pas', () => {
    expect(resoudreProfil(CHOIX_GENERIQUE)).toBeNull();
    const p = resoudreProfil(CRICUT_MAKER);
    expect(p?.zoneUtile).toEqual({ l: 11.5 * 96, h: 11.5 * 96 });
    expect(p?.detailMin).toBeCloseTo(6, 9);
    expect(p?.printThenCut?.l).toBeCloseTo(6.75 * 96, 9);
    expect(resoudreProfil({ ...CRICUT_MAKER, machine: 'joy' })?.printThenCut).toBeNull();
  });
});
