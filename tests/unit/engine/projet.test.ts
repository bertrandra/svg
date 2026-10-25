import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ecrireDessin, lireDessin, marquerProduction, tourner, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { choixDeMarque, marqueDeChoix, normaliserChoix, operationsAEcrire } from '../../../src/engine/preparation.js';
import { ecrireCheminProjet, etatDuProjet, lireCheminProjet, policesDeposeesDu, projetDe, texteDuProjet, type EtatProjet } from '../../../src/engine/projet.js';
import { lireProjet, type Projet } from '../../../src/model/projet.js';
import type { ChoixProduction } from '../../../src/model/contextes.js';
import { nettoyerSvg } from '../../../src/util/svg.js';

// Le projet et le dessin, dans les deux sens (ADR-0030) : projet -> dessin -> projet rend le meme projet, et le SVG ecrit depuis un
// projet rouvert est celui ecrit avant l'enregistrement, octet pour octet. Verifie sur toutes les references d'ecriture du depot
// (textes vivants, operations Cricut, provenance, traits, opacites…) et sur des nombres qu'une rotation rend irrationnels.

const dossier = resolve(__dirname, '../../fixtures/svg');

/** Le document que l'editeur ecrit pour un dessin et un contexte (zones/actionsProduction.ts, `svgDocument`), puis nettoye comme « Enregistrer ». */
function document(dessin: DessinSvg, production: ChoixProduction): string {
  const choix = normaliserChoix(production);
  const procede = choix.contexte === 'cricut' ? choix.procede : null;
  const svg = marquerProduction(ecrireDessin(operationsAEcrire(dessin, procede), 3, procede !== null), marqueDeChoix(choix));
  return nettoyerSvg(svg)?.svg ?? svg;
}

const etat = (dessin: DessinSvg, production: ChoixProduction, nom = 'essai'): EtatProjet => ({ nom, dessin, production, nuancier: [{ nom: 'Rouge', hex: '#c81e28' }], polices: [], images: [] });

/** Ce que fait le site : le projet part en JSON, revient, se lit, et rouvre un dessin. */
function allerRetour(e: EtatProjet): { projet: Projet; rouvert: EtatProjet; texte: string } {
  const projet = projetDe(e);
  const texte = texteDuProjet(projet);
  const relu = lireProjet(JSON.parse(texte));
  if ('erreur' in relu) throw new Error(relu.erreur);
  const rouvert = etatDuProjet(relu.projet);
  if ('erreur' in rouvert) throw new Error(rouvert.erreur);
  return { projet, rouvert, texte };
}

const fixtures = readdirSync(dossier).filter(f => f.endsWith('.svg'));

describe('l aller-retour d un projet', () => {
  it('se verifie sur assez de references pour couvrir le modele', () => {
    const lues = fixtures.filter(f => !('erreur' in lireDessin(readFileSync(resolve(dossier, f), 'utf8'))));
    expect(lues.length).toBeGreaterThan(100);
    const champs = new Set<string>();
    for (const f of lues) { const l = lireDessin(readFileSync(resolve(dossier, f), 'utf8')); if (!('erreur' in l)) for (const forme of l.dessin.formes) for (const k of Object.keys(forme)) champs.add(k); }
    // Chaque champ du modele est exerce par au moins une reference : un champ oublie par la conversion se verrait.
    for (const k of ['opaciteRemplissage', 'opaciteContour', 'pointilles', 'bout', 'jonction', 'limiteMitre', 'origine', 'texte', 'operation', 'regle', 'visible', 'verrouille']) expect(champs, k).toContain(k);
  });

  for (const f of fixtures) {
    it('rend le meme SVG, octet pour octet, et le meme projet : ' + f, () => {
      const l = lireDessin(readFileSync(resolve(dossier, f), 'utf8'));
      if ('erreur' in l) return;
      const production = choixDeMarque(l.production).choix;
      const { projet, rouvert, texte } = allerRetour(etat(l.dessin, production));
      expect(rouvert.dessin).toEqual(l.dessin);
      expect(document(rouvert.dessin, rouvert.production)).toBe(document(l.dessin, production));
      expect(texteDuProjet(projetDe(rouvert))).toBe(texte);
      expect(projetDe(rouvert)).toEqual(projet);
    });
  }

  it('garde chaque nombre a sa pleine precision, le zero negatif compris', () => {
    const l = lireDessin('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 10 L90 13 C 20 30 40 50 60 70 Q 1 2 3 4 Z" fill="#123456"/></svg>');
    if ('erreur' in l) throw new Error(l.erreur);
    const tourne = tourner(l.dessin, ['f1'], 37);
    const d = (tourne.formes[0]?.d ?? []);
    expect(d.some(c => c.p.some(v => !Number.isInteger(v * 1000)))).toBe(true);
    expect(lireCheminProjet(ecrireCheminProjet(d))).toEqual(d);
    const negatif = [{ c: 'M' as const, p: [-0, 0.1 + 0.2] }, { c: 'L' as const, p: [1e-7, -1e21] }, { c: 'Z' as const, p: [] }];
    const relu = lireCheminProjet(ecrireCheminProjet(negatif));
    expect(Object.is(relu[0]?.p[0], -0)).toBe(true);
    expect(relu).toEqual(negatif);
    const { rouvert } = allerRetour(etat(tourne, { contexte: 'generique' }));
    expect(rouvert.dessin).toEqual(tourne);
  });

  it('garde le contexte Cricut, le nuancier, les dates du serveur et les ressources', () => {
    const l = lireDessin(readFileSync(resolve(dossier, 'cricut-operations.attendu.svg'), 'utf8'));
    if ('erreur' in l) throw new Error(l.erreur);
    const production: ChoixProduction = { contexte: 'cricut', machine: 'explore-3', tapis: '12x24', materiau: 'papier-cartonne', procede: 'dessin-stylo', unite: 'in' };
    const e: EtatProjet = {
      ...etat(l.dessin, production, 'Carte / Noël'), creeLe: '2026-10-25T10:00:00Z', modifieLe: '2026-10-25T11:00:00Z',
      polices: [{ id: 'u-0123456789abcd', famille: 'Ma fonte', donnees: 'AAEC' }], images: [{ role: 'source', nom: 'photo', type: 'image/png', donnees: 'iVBORw0KGgo=' }]
    };
    const { projet, rouvert } = allerRetour(e);
    expect(projet.nom).toBe('Carte - Noël');
    expect(rouvert).toEqual({ ...e, nom: 'Carte - Noël' });
  });

  it('garde un texte sur un cercle et un texte dans une forme masquee (ADR-0031) : disposition, lien et forme de base', () => {
    for (const [f, mode] of [['texte-sur-forme.attendu.svg', 'sur'], ['texte-dans-forme.attendu.svg', 'dans']] as const) {
      const l = lireDessin(readFileSync(resolve(dossier, f), 'utf8'));
      if ('erreur' in l) throw new Error(l.erreur);
      const poses = l.dessin.formes.filter(x => x.texte?.disposition?.mode === mode);
      expect(poses.length, f).toBeGreaterThan(0);
      const { projet, rouvert, texte } = allerRetour(etat(l.dessin, { contexte: 'generique' }));
      expect(rouvert.dessin, f).toEqual(l.dessin);
      expect(texte).toContain('"disposition":{"mode":"' + mode + '"');
      const bases = poses.map(p => rouvert.dessin.formes.find(x => x.id === p.texte?.disposition?.forme));
      expect(bases.every(b => b !== undefined), f + ' : chaque forme de base est gardee').toBe(true);
      // La reference « dans » a un texte dans une forme masquee : la forme de base reste dans le projet, masquee.
      if (mode === 'dans') expect(bases.some(b => b?.visible === false), 'une forme de base masquee').toBe(true);
      expect(document(rouvert.dessin, rouvert.production)).toBe(document(l.dessin, { contexte: 'generique' }));
      expect(projetDe(rouvert)).toEqual(projet);
    }
  });

  it('refuse une disposition mal formee en la nommant', () => {
    const l = lireDessin(readFileSync(resolve(dossier, 'texte-sur-forme.attendu.svg'), 'utf8'));
    if ('erreur' in l) throw new Error(l.erreur);
    const brut = JSON.parse(texteDuProjet(projetDe(etat(l.dessin, { contexte: 'generique' })))) as { dessin: { formes: Array<{ texte?: { disposition?: Record<string, unknown> } }> } };
    const pose = brut.dessin.formes.find(x => x.texte?.disposition);
    if (!pose?.texte?.disposition) throw new Error('pas de texte pose');
    pose.texte.disposition['depart'] = 2;
    const r = lireProjet(brut);
    expect('erreur' in r ? r.erreur : '').toMatch(/départ/);
    pose.texte.disposition['depart'] = 0;
    pose.texte.disposition['mode'] = 'autour';
    const r2 = lireProjet(brut);
    expect('erreur' in r2 ? r2.erreur : '').toMatch(/ni « sur », ni « dans », ni « enveloppe »/);
  });

  it('nomme les fontes deposees qu emploient les textes, sans doublon', () => {
    const l = lireDessin(readFileSync(resolve(dossier, 'texte-vivant.attendu.svg'), 'utf8'));
    if ('erreur' in l) throw new Error(l.erreur);
    expect(policesDeposeesDu(l.dessin)).toEqual([]);
    const forme = l.dessin.formes.find(f => f.texte);
    if (!forme?.texte) throw new Error('la reference n a pas de texte vivant');
    const depose = { ...forme, texte: { ...forme.texte, police: { id: 'u-00000000000001', famille: 'X' } } };
    expect(policesDeposeesDu({ ...l.dessin, formes: [depose, { ...depose, id: 'f99' }] })).toEqual(['u-00000000000001']);
  });
});
