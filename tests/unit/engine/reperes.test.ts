import { describe, expect, it } from 'vitest';
import {
  ajouterForme, ajouterRepere, avecReperes, boitesReperes, deplacerRepere, ecrireDessin, ecrireReperes, effacerReperes, lireDessin, lireReperes,
  marquerProduction, marquerReperes, nombreReperes, normaliserReperes, rectangle, REPERES_MAX, repereLePlusProche, supprimerRepere, type DessinSvg
} from '../../../src/engine/editionSvg.js';
import { MSG_REPERES_ILLISIBLES } from '../../../src/engine/edition/lecture.js';
import { aimanter, ciblesAimants } from '../../../src/engine/transformations.js';
import { etatDuProjet, projetDe, texteDuProjet } from '../../../src/engine/projet.js';
import { lireProjet } from '../../../src/model/projet.js';
import { nettoyerSvg } from '../../../src/util/svg.js';

// Les reperes du document (ADR-0038) : un reglage du dessin, ecrit en `data-ed-reperes` sur la racine seulement s'il y en a,
// relu tel quel, garde dans le projet, jamais dans un export ; les aimants s'y accrochent.

const VIDE: DessinSvg = { vb: [0, 0, 200, 100], formes: [] };
const avecCarre = ajouterForme(VIDE, rectangle(20, 20, 30, 30), { remplissage: '#c81e28', contour: null, epaisseur: 1 }).dessin;
/** Le document comme l'editeur l'ecrit (zones/actionsProduction.ts, `svgDocument`), puis nettoye comme « Enregistrer ». */
const documentDe = (d: DessinSvg): string => nettoyerSvg(marquerReperes(marquerProduction(ecrireDessin(d, 3), null), d.reperes))?.svg ?? 'REFUSE';
const lire = (svg: string) => { const r = lireDessin(svg); if ('erreur' in r) throw new Error(r.erreur); return r; };

describe('les reperes dans le modele', () => {
  it('se tiennent au millieme, tries, sans doublon', () => {
    expect(normaliserReperes({ h: [30, 10.00004, 10, -0.0001], v: [] })).toEqual({ h: [0, 10, 30], v: [] });
    expect(normaliserReperes({ h: [], v: [] })).toBeNull();
    expect(normaliserReperes({ h: [Number.NaN, Infinity, 2e9], v: [5] })).toEqual({ h: [], v: [5] });
  });

  it('s ajoutent, se deplacent, se retirent ; le dernier retire, le champ disparait', () => {
    let d = ajouterRepere(VIDE, 'h', 40);
    d = ajouterRepere(d, 'v', 120.12345);
    expect(d.reperes).toEqual({ h: [40], v: [120.123] });
    expect(ajouterRepere(d, 'h', 40.0001)).toBe(d);
    d = deplacerRepere(d, 'h', 40, 55);
    expect(d.reperes?.h).toEqual([55]);
    expect(repereLePlusProche(d, 'v', 100)).toBe(120.123);
    d = supprimerRepere(d, 'h', 55);
    d = supprimerRepere(d, 'v', 120.123);
    expect('reperes' in d).toBe(false);
    expect(nombreReperes(ajouterRepere(VIDE, 'v', 1))).toBe(1);
    expect(effacerReperes(ajouterRepere(VIDE, 'v', 1))).toEqual(VIDE);
  });

  it('rend le meme objet quand rien ne change (l historique ne s allonge pas)', () => {
    const d = ajouterRepere(VIDE, 'h', 10);
    expect(avecReperes(d, { h: [10], v: [] })).toBe(d);
    expect(deplacerRepere(d, 'h', 99, 5)).toBe(d);
    expect(supprimerRepere(VIDE, 'h', 10)).toBe(VIDE);
    expect(effacerReperes(VIDE)).toBe(VIDE);
  });

  it('borne leur nombre par axe', () => {
    let d = VIDE;
    for (let i = 0; i < REPERES_MAX + 5; i++) d = ajouterRepere(d, 'v', i);
    expect(d.reperes?.v.length).toBe(REPERES_MAX);
  });
});

describe('les reperes dans le fichier', () => {
  it('n ecrivent aucun octet sans repere', () => {
    expect(documentDe(avecCarre)).toBe(nettoyerSvg(ecrireDessin(avecCarre, 3))?.svg);
    expect(marquerReperes('<svg x="1"></svg>', undefined)).toBe('<svg x="1"></svg>');
  });

  it('s ecrivent en un attribut de la racine, apres la marque du contexte', () => {
    expect(ecrireReperes({ h: [10, 20.5], v: [-3] })).toBe('h:10,20.5;v:-3');
    expect(ecrireReperes({ h: [], v: [7] })).toBe('v:7');
    const marque = marquerProduction('<svg a="1"><path/></svg>', { contexte: 'cricut' });
    expect(marquerReperes(marque, { h: [1], v: [] })).toBe('<svg a="1" data-ed-contexte="cricut" data-ed-reperes="h:1"><path/></svg>');
  });

  it('se relisent tels quels, et le document relu se reecrit a l octet', () => {
    const d = ajouterRepere(ajouterRepere(avecCarre, 'h', 33.3333), 'v', 150);
    const premier = documentDe(d);
    expect(premier).toContain(' data-ed-reperes="h:33.333;v:150"');
    const relu = lire(premier);
    expect(relu.dessin.reperes).toEqual({ h: [33.333], v: [150] });
    expect(relu.ignores).toEqual([]);
    expect(documentDe(relu.dessin)).toBe(premier);
  });

  it('un attribut illisible est laisse de cote, et c est dit', () => {
    for (const texte of ['h:1;h:2', 'x:3', 'h:1,abc', 'h:1e999', 'h:' + Array.from({ length: 900 }, (_, i) => i).join(',')]) expect(lireReperes(texte), texte).toBeNull();
    const r = lire('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" data-ed-reperes="h:javascript"><path d="M0 0H5V5Z"/></svg>');
    expect(r.dessin.reperes).toBeUndefined();
    expect(r.ignores).toContain(MSG_REPERES_ILLISIBLES);
  });

  it('ne passent jamais dans l ecriture d un export (ecrireDessin seul)', () => {
    expect(ecrireDessin(ajouterRepere(avecCarre, 'h', 10), 3)).not.toContain('reperes');
  });
});

describe('les reperes dans le projet', () => {
  const etat = (dessin: DessinSvg) => ({ nom: 'essai', dessin, production: { contexte: 'generique' } as const, nuancier: [], polices: [], images: [] });

  it('font l aller-retour exact, et restent absents d un projet sans repere', () => {
    const d = ajouterRepere(ajouterRepere(avecCarre, 'h', 12.5), 'v', 0.001);
    const texte = texteDuProjet(projetDe(etat(d)));
    expect(texte).toContain('"reperes":{"h":[12.5],"v":[0.001]}');
    const relu = lireProjet(JSON.parse(texte));
    if ('erreur' in relu) throw new Error(relu.erreur);
    const rouvert = etatDuProjet(relu.projet);
    if ('erreur' in rouvert) throw new Error(rouvert.erreur);
    expect(rouvert.dessin).toEqual(d);
    expect(texteDuProjet(projetDe(rouvert))).toBe(texte);
    expect(texteDuProjet(projetDe(etat(avecCarre)))).not.toContain('reperes');
  });

  it('refuse des reperes mal formes', () => {
    const base = JSON.parse(texteDuProjet(projetDe(etat(avecCarre)))) as { dessin: Record<string, unknown> };
    for (const mauvais of [{ h: [], v: [] }, { h: ['1'], v: [] }, { h: [1] }, { h: Array.from({ length: 201 }, (_, i) => i), v: [] }]) {
      const r = lireProjet({ ...base, dessin: { ...base.dessin, reperes: mauvais } });
      expect('erreur' in r, JSON.stringify(mauvais).slice(0, 40)).toBe(true);
    }
  });
});

describe('les aimants s accrochent aux reperes', () => {
  it('une boite qui approche un repere vertical y colle son bord, et la ligne suit le repere', () => {
    const d = ajouterRepere(ajouterRepere(VIDE, 'v', 100), 'h', 70);
    expect(boitesReperes(d)).toEqual([{ x: 0, y: 70, l: 200, h: 0 }, { x: 100, y: 0, l: 0, h: 100 }]);
    const a = aimanter({ x: 102, y: 30, l: 10, h: 10 }, ciblesAimants(d, []), 3);
    expect(a.dx).toBe(-2);
    expect(a.lignes[0]).toMatchObject({ axe: 'x', valeur: 100 });
    // Le bas de la boite (y + h = 68,5) vient sur le repere horizontal a 70.
    expect(aimanter({ x: 30, y: 58.5, l: 10, h: 10 }, ciblesAimants(d, []), 3).dy).toBe(1.5);
  });

  it('sans repere, les cibles sont celles d avant', () => {
    expect(ciblesAimants(avecCarre, [])).toEqual([{ x: 0, y: 0, l: 200, h: 100 }, { x: 20, y: 20, l: 30, h: 30 }]);
  });
});
