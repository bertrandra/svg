// Couper ou ecrire, forme par forme (ADR-0028) : la regle de proposition, le choix de la personne, le partage du dessin, ce que le
// fichier garde (seulement en contexte Cricut, seulement hors du defaut), la relecture, et le jugement par operation.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { avecReperes, ecrireDessin, lireDessin, marquerReperes, type Chemin, type DessinSvg, type Forme, type TexteVivant } from '../../../src/engine/editionSvg.js';
import {
  compterOperations, constatsBloquants, constatsPreparation, corrigerPreparation, operationDe, operationProposee, operationsAEcrire, operationsApplicables,
  operationsMelees, partagerOperations, phraseOperation, poserOperation, resoudreProfil, sansOperation, type ProfilProduction
} from '../../../src/engine/preparation.js';
import { cheminDuTexte } from '../../../src/engine/texte/bloc.js';
import { creerTexte, nouveauTexte, peintureDuTexte } from '../../../src/engine/texte/vivant.js';
import { CHOIX_CRICUT_DEFAUT, CHOIX_GENERIQUE, type ChoixProduction, type Procede } from '../../../src/model/contextes.js';
import { svgDocument } from '../../../src/zones/actionsProduction.js';
import { nettoyerSvg } from '../../../src/util/svg.js';
import { violationsEcriture, violationsNettoyage } from '../securite/invariants.js';
import { glyphesCarres } from './glyphesFactices.js';

const carre: Chemin = [{ c: 'M', p: [10, 10] }, { c: 'L', p: [90, 10] }, { c: 'L', p: [90, 90] }, { c: 'L', p: [10, 90] }, { c: 'Z', p: [] }];
const ligne: Chemin = [{ c: 'M', p: [100, 50] }, { c: 'L', p: [180, 50] }];
const f = (id: string, d: Chemin, p: Partial<Forme> = {}): Forme => ({ id, d, remplissage: '#c81e28', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, ...p });
const trait = (id: string, p: Partial<Forme> = {}): Forme => f(id, ligne, { remplissage: null, contour: '#1f4e8c', epaisseur: 1.5, ...p });
const dessin = (...formes: Forme[]): DessinSvg => ({ vb: [0, 0, 200, 100], formes });
const lire = (svg: string): DessinSvg => { const r = lireDessin(svg); if ('erreur' in r) throw new Error(r.erreur); return r.dessin; };
const profil = (procede: Procede): ProfilProduction => {
  const p = resoudreProfil({ contexte: 'cricut', ...CHOIX_CRICUT_DEFAUT, unite: 'in', procede });
  if (!p) throw new Error('profil');
  return p;
};
const choix = (procede: Procede): ChoixProduction => ({ contexte: 'cricut', ...CHOIX_CRICUT_DEFAUT, unite: 'in', procede });
const texte = (police: string): DessinSvg => {
  const t: TexteVivant = nouveauTexte('AB', { id: police }, 20, [1, 0, 0, 1, 10, 50]);
  const aTrait = police === 'ems-readability';
  return creerTexte(dessin(), t, cheminDuTexte(t, glyphesCarres), peintureDuTexte(aTrait ? 'trait' : 'contour', { remplissage: '#1f4e8c', contour: null, epaisseur: 1 }, 0.5)).dessin;
};

describe('la regle de proposition', () => {
  it('en decoupe, une forme pleine se coupe ; un trait seul, une ligne mediane ou une hachure (sans fond) s ecrivent', () => {
    expect(operationProposee(f('f1', carre), 'decoupe')).toBe('decoupe');
    expect(operationProposee(f('f1', carre, { contour: '#000000', epaisseur: 4 }), 'decoupe')).toBe('decoupe');
    expect(operationProposee(trait('f1'), 'decoupe')).toBe('ecriture');
    expect(operationProposee(f('f1', carre, { remplissage: null, contour: '#000000', epaisseur: 2 }), 'decoupe')).toBe('ecriture');
  });

  it('un texte en police a trait unique s ecrit, meme s il porte un fond ; un texte a contour se coupe', () => {
    const aTrait = texte('ems-readability').formes[0], aContour = texte('inter').formes[0];
    if (!aTrait || !aContour) throw new Error('texte');
    expect(operationProposee(aTrait, 'decoupe')).toBe('ecriture');
    expect(operationProposee({ ...aTrait, remplissage: '#1f4e8c' }, 'decoupe')).toBe('ecriture');
    expect(operationProposee(aContour, 'decoupe')).toBe('decoupe');
  });

  it('au stylo, tout s ecrit par defaut ; Print Then Cut suit la decoupe, mais ne se choisit pas forme par forme', () => {
    expect(operationProposee(f('f1', carre), 'dessin-stylo')).toBe('ecriture');
    expect(operationProposee(f('f1', carre), 'imprimer-decouper')).toBe('decoupe');
    expect(operationsApplicables('decoupe')).toBe(true);
    expect(operationsApplicables('dessin-stylo')).toBe(true);
    expect(operationsApplicables('imprimer-decouper')).toBe(false);
  });

  it('le choix de la personne l emporte sur la regle', () => {
    expect(operationDe(f('f1', carre, { operation: 'ecriture' }), 'decoupe')).toBe('ecriture');
    expect(operationDe(trait('f1', { operation: 'decoupe' }), 'dessin-stylo')).toBe('decoupe');
  });
});

describe('le partage du dessin', () => {
  it('rend deux dessins au meme cadre, chacun dans l ordre du dessin, et le compte des formes visibles', () => {
    const d = dessin(f('f1', carre), trait('f2'), f('f3', carre, { operation: 'ecriture' }), trait('f4', { visible: false }));
    const p = partagerOperations(d, 'decoupe');
    expect(p.decoupe.formes.map(x => x.id)).toEqual(['f1']);
    expect(p.ecriture.formes.map(x => x.id)).toEqual(['f2', 'f3', 'f4']);
    expect(p.decoupe.vb).toEqual(d.vb);
    expect(compterOperations(d, 'decoupe')).toEqual({ decoupe: 1, ecriture: 2 });
    expect(operationsMelees(d, 'decoupe')).toBe(true);
    expect(operationsMelees(d, 'dessin-stylo')).toBe(false);
  });

  it('se memorise par dessin et par procede, et rend le dessin lui-meme quand une seule operation compte', () => {
    const d = dessin(f('f1', carre), f('f2', carre));
    expect(partagerOperations(d, 'decoupe')).toBe(partagerOperations(d, 'decoupe'));
    expect(partagerOperations(d, 'decoupe').decoupe).toBe(d);
    expect(partagerOperations(d, 'decoupe').ecriture.formes).toEqual([]);
    expect(partagerOperations(d, 'dessin-stylo').ecriture).toBe(d);
  });
});

describe('poser une operation', () => {
  it('pose le choix sur les formes nommees, le dit, et laisse les autres et les verrouillees', () => {
    const d = dessin(f('f1', carre), f('f2', carre), f('f3', carre, { verrouille: true }));
    const r = poserOperation(d, ['f1', 'f3'], 'ecriture', 'decoupe');
    expect(r.changees).toBe(1);
    expect(r.dessin.formes.map(x => x.operation)).toEqual(['ecriture', undefined, undefined]);
    expect(r.dessin.formes[1]).toBe(d.formes[1]);
    expect(r.phrase).toBe('Une forme passe à l’écriture au stylo.');
    expect(poserOperation(r.dessin, ['f1', 'f2'], 'decoupe', 'decoupe').phrase).toBe('Une forme passe à la découpe.');
    expect(phraseOperation(3, 'ecriture')).toBe('3 formes passent à l’écriture au stylo.');
  });

  it('garde le choix meme quand il vaut le defaut : changer de procede ne defait pas ce qu on a decide', () => {
    const d = dessin(f('f1', carre));
    const r = poserOperation(d, ['f1'], 'decoupe', 'decoupe');
    expect(r.changees).toBe(0);
    expect(r.phrase).toBe('Ces formes sont déjà à couper.');
    expect(operationDe(r.dessin.formes[0] as Forme, 'dessin-stylo')).toBe('decoupe');
    // Rien a poser : le meme dessin, pour ne pas ouvrir d'entree d'historique pour rien.
    expect(poserOperation(r.dessin, ['f1'], 'decoupe', 'decoupe').dessin).toBe(r.dessin);
  });

  it('« Écrire au stylo » corrige un trait ouvert dit « à couper » : il passe parmi les formes a ecrire', () => {
    const d = dessin(f('f1', carre), trait('f2', { operation: 'decoupe' }));
    const p = profil('decoupe');
    const c = constatsPreparation(d, p).find(x => x.code === 'decoupe-trait-ouvert');
    expect(c?.correction).toBe('contour-en-forme');
    expect(c?.autres).toEqual(['ecrire']);
    const r = corrigerPreparation(d, 'ecrire', c ?? { formes: [] }, p);
    if ('erreur' in r) throw new Error(r.erreur);
    expect(r.dessin.formes[1]?.operation).toBe('ecriture');
    expect(constatsPreparation(r.dessin, p).map(x => x.code)).not.toContain('decoupe-trait-ouvert');
  });
});

describe('ce que le fichier garde', () => {
  const d = dessin(f('f1', carre), trait('f2'), f('f3', carre, { operation: 'ecriture' }), trait('f4', { operation: 'ecriture' }));

  it('en Generique, rien : ni dans le modele ecrit, ni dans les octets', () => {
    const generique = operationsAEcrire(d, null);
    expect(generique.formes.every(x => x.operation === undefined)).toBe(true);
    expect(svgDocument(d, CHOIX_GENERIQUE)).toBe(ecrireDessin(dessin(f('f1', carre), trait('f2'), f('f3', carre), trait('f4')), 3));
    expect(svgDocument(d, CHOIX_GENERIQUE)).not.toContain('data-ed-');
  });

  it('en Cricut, seulement les operations qui different de la regle, en dernier attribut de leur <path>', () => {
    const ecrit = svgDocument(d, choix('decoupe'));
    expect(ecrit.match(/data-ed-operation="[a-z]+"/g)).toEqual(['data-ed-operation="ecriture"']);
    expect(ecrit).toContain('fill="#c81e28" data-ed-operation="ecriture"/>');
    // Au stylo, l'ecriture est le defaut de toute forme : f3 et f4 n'ont plus rien a dire, et f1, qu'on n'a pas touche, suit le procede.
    expect(svgDocument(d, choix('dessin-stylo'))).not.toContain('data-ed-operation');
    expect(svgDocument(poserOperation(d, ['f1'], 'decoupe', 'dessin-stylo').dessin, choix('dessin-stylo')).match(/data-ed-operation="[a-z]+"/g)).toEqual(['data-ed-operation="decoupe"']);
  });

  it('rend le meme objet quand rien n est a retirer, et une forme sans son operation pour les exports', () => {
    const sans = dessin(f('f1', carre), trait('f2'));
    expect(operationsAEcrire(sans, null)).toBe(sans);
    expect(operationsAEcrire(sans, 'decoupe')).toBe(sans);
    const avec = f('f1', carre, { operation: 'ecriture' });
    expect('operation' in sansOperation(avec)).toBe(false);
    expect(sansOperation(sans.formes[0] as Forme)).toBe(sans.formes[0]);
  });

  it('l ecriture ordinaire ne l ecrit jamais, meme presente dans le modele : seul le document d un contexte la demande', () => {
    expect(ecrireDessin(d, 3)).not.toContain('data-ed-operation');
    expect(ecrireDessin(d, 3, true).match(/data-ed-operation/g)).toHaveLength(2);
  });

  it('se relit, se reecrit a l identique, passe le nettoyage et les invariants de l ecriture', () => {
    const ecrit = svgDocument(d, choix('decoupe'));
    const relu = lireDessin(ecrit);
    if ('erreur' in relu) throw new Error(relu.erreur);
    expect(relu.dessin.formes.map(x => x.operation)).toEqual([undefined, undefined, 'ecriture', undefined]);
    expect(relu.dessin.formes.map(x => operationDe(x, 'decoupe'))).toEqual(d.formes.map(x => operationDe(x, 'decoupe')));
    expect(svgDocument(relu.dessin, choix('decoupe'))).toBe(ecrit);
    expect(nettoyerSvg(ecrit)?.svg).toBe(ecrit);
    expect(violationsEcriture(ecrit)).toEqual([]);
    expect(violationsNettoyage(ecrit)).toEqual([]);
    expect(violationsEcriture(ecrit.replace('data-ed-operation="ecriture"', 'data-ed-operation="url(x)"'))).not.toEqual([]);
    expect(violationsEcriture(ecrit.replace(' data-ed-operation="ecriture"', '').replace('<svg ', '<svg data-ed-operation="ecriture" '))).not.toEqual([]);
  });

  it('ne lit que les deux valeurs exactes, sur la forme elle-meme (jamais heritee d un groupe)', () => {
    const lu = lire('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0H10V10Z" data-ed-operation="ecriture"/><path d="M0 0H10V10Z" data-ed-operation="Ecriture"/><g data-ed-operation="ecriture"><path d="M0 0H10V10Z"/></g><rect width="5" height="5" data-ed-operation="decoupe"/></svg>');
    expect(lu.formes.map(x => x.operation)).toEqual(['ecriture', undefined, undefined, 'decoupe']);
  });

  it('ne change aucun octet des references d ecriture : sans operation, le document Cricut ne porte que la marque de la racine', () => {
    const dossier = resolve(__dirname, '../../fixtures/svg');
    for (const nom of readdirSync(dossier).filter(x => x.endsWith('.attendu.svg'))) {
      const texte = readFileSync(resolve(dossier, nom), 'utf8');
      // La reference neuve de ce chantier (cricut-operations) porte des operations : c'est son objet.
      if (texte.includes('data-ed-operation')) continue;
      const lu = lireDessin(texte);
      if ('erreur' in lu) continue;
      // Les reperes (ADR-0038, la reference reperes-document) suivent la marque sur la racine et n'entrent pas dans les operations :
      // sans eux, le document est l'ecriture ordinaire a l'octet ; avec eux, la meme, plus leur seul attribut.
      expect(svgDocument(lu.dessin, CHOIX_GENERIQUE), nom).toBe(marquerReperes(ecrireDessin(lu.dessin, 3), lu.dessin.reperes));
      expect(svgDocument(avecReperes(lu.dessin, null), CHOIX_GENERIQUE), nom).toBe(ecrireDessin(lu.dessin, 3));
      expect(svgDocument(lu.dessin, choix('decoupe')), nom).not.toContain('data-ed-operation');
    }
  });
});

describe('le jugement par operation', () => {
  const p = profil('decoupe');

  it('une forme a ecrire n est pas jugee par la lame : son contour ne bloque plus, son fond se dit au stylo', () => {
    const d = dessin(f('f1', carre, { contour: '#000000', epaisseur: 4, operation: 'ecriture' }), f('f2', [{ c: 'M', p: [100, 10] }, { c: 'L', p: [180, 10] }, { c: 'L', p: [180, 90] }, { c: 'Z', p: [] }]));
    const codes = constatsPreparation(d, p).map(c => c.code);
    expect(codes).not.toContain('trait');
    expect(codes).toContain('stylo-plein');
    expect(constatsPreparation(d, p).find(c => c.code === 'stylo-plein')?.formes).toEqual(['f1']);
    expect(constatsBloquants(d, p)).toEqual([]);
  });

  it('une forme a couper reste jugee par la lame, au stylo comme en decoupe', () => {
    const d = dessin(f('f1', carre, { opacite: 0.5, operation: 'decoupe' }), trait('f2'));
    expect(constatsBloquants(d, profil('dessin-stylo')).map(c => c.code)).toEqual(['opacite']);
    expect(constatsPreparation(d, profil('dessin-stylo')).map(c => c.code)).toEqual(['opacite']);
  });

  it('la taille se juge sur tout le dessin : la lame et le stylo passent sur le meme tapis', () => {
    const grande: Chemin = [{ c: 'M', p: [0, 0] }, { c: 'L', p: [1200, 0] }];
    const d: DessinSvg = { vb: [0, 0, 1300, 1300], formes: [f('f1', carre), trait('f2', { d: grande })] };
    expect(constatsBloquants(d, p).map(c => c.code)).toEqual(['piece-trop-grande']);
  });

  it('un dessin tout entier pour la lame se juge exactement comme avant', () => {
    const d = dessin(f('f1', carre, { contour: '#000000', epaisseur: 4 }));
    expect(constatsPreparation(d, p).map(c => c.code)).toEqual(['trait']);
  });
});
