// Le format unique du projet (ADR-0030, revision du 26 octobre 2026 ; ADR-0012, etape 1) : une seule version, 1, qui porte tout le
// modele ; les champs v2 (groupes compris) y sont facultatifs, lus et valides toujours ; aucune migration n'existe encore ; toute
// autre version est refusee en la nommant ; la table des groupes se valide sans lever.

import { describe, expect, it } from 'vitest';
import { FORMAT_PROJET, MIGRATIONS, VERSION_PROJET, lireProjet, migrer, type Projet } from '../../../src/model/projet.js';

const projet = (version: number, dessin: Record<string, unknown>): Record<string, unknown> => ({
  format: FORMAT_PROJET, version, nom: 'Carte', dessin, production: { contexte: 'generique' }, nuancier: [], ressources: { polices: [], images: [] }
});
// Les champs v2 d'une forme s'ecrivent apres `operation`, avant `regle` (model/projetV2/champs.ts).
const forme = (id: string, p: Record<string, unknown> = {}) => ({ id, d: 'M0 0L10 0L10 10Z', remplissage: '#c81e28', contour: null, epaisseur: 0, opacite: 1, ...p, regle: 'nonzero', visible: true, verrouille: false });
const avecGroupes = (p: Record<string, unknown> = {}) => ({
  vb: [0, 0, 10, 10],
  formes: [forme('f1', { parent: 'g2' }), forme('f2')],
  groupes: { g1: { id: 'g1', nom: 'Haut', visible: true, verrouille: false, opacite: 0.5 }, g2: { id: 'g2', parent: 'g1', visible: false, verrouille: true } },
  ...p
});
const erreur = (x: unknown): string => { const r = lireProjet(x); return 'erreur' in r ? r.erreur : ''; };
const lu = (x: unknown): Projet => { const r = lireProjet(x); if ('erreur' in r) throw new Error(r.erreur); return r.projet; };

describe('le format unique du projet', () => {
  it('lit un projet a groupes, champ pour champ, et le reecrit a l identique', () => {
    const brut = projet(VERSION_PROJET, avecGroupes());
    const p = lu(brut);
    expect(p.version).toBe(1);
    expect(p.dessin.groupes).toBeDefined();
    expect(JSON.stringify(p)).toBe(JSON.stringify(brut));
  });

  it('un seul format, sans migration : un projet plat se lit tel quel, rien n est dit « complete »', () => {
    expect(VERSION_PROJET).toBe(1);
    expect(MIGRATIONS).toEqual({});
    const brut = projet(1, { vb: [0, 0, 10, 10], formes: [forme('f1')] });
    expect(migrer(brut)).toEqual({ donnees: brut, migre: false });
    const r = lireProjet(brut);
    expect('erreur' in r ? r.erreur : [r.projet.version, r.migre]).toEqual([1, false]);
    expect(JSON.stringify('erreur' in r ? null : r.projet)).toBe(JSON.stringify(brut));
  });

  it('refuse toute autre version en la nommant : une plus recente, une illisible', () => {
    expect(erreur(projet(2, avecGroupes()))).toContain('version plus récente de l’éditeur (format 2)');
    expect(erreur(projet(3, { vb: [0, 0, 10, 10], formes: [forme('f1')] }))).toContain('version plus récente de l’éditeur (format 3)');
    for (const v of [0, 1.5, '1', null]) expect(erreur(projet(v as number, avecGroupes())), String(v)).toBe('Ce projet n’a pas de version lisible.');
  });

  it('valide la table des groupes sans lever : cle, identifiant, parent, opacite, nom', () => {
    const cas: Array<[Record<string, unknown>, string]> = [
      [avecGroupes({ groupes: {} }), 'la table des groupes est vide'],
      [avecGroupes({ groupes: { g1: { id: 'g9', visible: true, verrouille: false } } }), 'mal désigné'],
      [avecGroupes({ groupes: { g1: { id: 'g1', parent: 'g7', visible: true, verrouille: false }, g2: { id: 'g2', visible: true, verrouille: false } } }), 'a un parent absent'],
      [avecGroupes({ groupes: { g1: { id: 'g1', visible: true, verrouille: false, opacite: 1 }, g2: { id: 'g2', visible: true, verrouille: false } } }), 'l’opacité pleine d’un groupe'],
      [avecGroupes({ groupes: { g1: { id: 'g1', visible: 'oui', verrouille: false }, g2: { id: 'g2', visible: true, verrouille: false } } }), 'la visibilité d’un groupe'],
      [avecGroupes({ groupes: { g1: { id: 'g1', nom: 'x'.repeat(201), visible: true, verrouille: false }, g2: { id: 'g2', visible: true, verrouille: false } } }), 'le nom d’un groupe'],
      [avecGroupes({ formes: [forme('f1', { parent: 'g9' })] }), 'est dans un groupe absent'],
      [avecGroupes({ formes: [forme('g1')] }), 'une forme et un groupe portent l’identifiant « g1 »'],
      [avecGroupes({ groupes: [1, 2] }), 'les groupes du dessin n’est pas un objet']
    ];
    for (const [dessin, phrase] of cas) expect(erreur(projet(VERSION_PROJET, dessin)), phrase).toContain(phrase);
  });
});
