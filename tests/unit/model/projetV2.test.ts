// Le format 2 du projet (ADR-0012, etape 1 ; ADR-0030) : le format 1 plus les champs du modele v2. La regle de version : un projet
// plat s'ecrit au format 1 (et un programme du format 1 le lit toujours), un projet a groupes au format 2 ; la migration du format 1
// est l'identite ; un format plus recent est refuse en le nommant ; la table des groupes se valide sans lever.

import { describe, expect, it } from 'vitest';
import { FORMAT_PROJET, MIGRATIONS, VERSION_PROJET, VERSION_PROJET_PLAT, lireProjet, migrer, type Projet } from '../../../src/model/projet.js';

const projet = (version: number, dessin: Record<string, unknown>): Record<string, unknown> => ({
  format: FORMAT_PROJET, version, nom: 'Carte', dessin, production: { contexte: 'generique' }, nuancier: [], ressources: { polices: [], images: [] }
});
const forme = (id: string, p: Record<string, unknown> = {}) => ({ id, d: 'M0 0L10 0L10 10Z', remplissage: '#c81e28', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, ...p });
const avecGroupes = (p: Record<string, unknown> = {}) => ({
  vb: [0, 0, 10, 10],
  formes: [forme('f1', { parent: 'g2' }), forme('f2')],
  groupes: { g1: { id: 'g1', nom: 'Haut', visible: true, verrouille: false, opacite: 0.5 }, g2: { id: 'g2', parent: 'g1', visible: false, verrouille: true } },
  ...p
});
const erreur = (x: unknown): string => { const r = lireProjet(x); return 'erreur' in r ? r.erreur : ''; };
const lu = (x: unknown): Projet => { const r = lireProjet(x); if ('erreur' in r) throw new Error(r.erreur); return r.projet; };

describe('le format 2 du projet', () => {
  it('lit un projet a groupes au format 2, champ pour champ, et le reecrit a l identique', () => {
    const brut = projet(VERSION_PROJET, avecGroupes());
    const p = lu(brut);
    expect(p.version).toBe(2);
    expect(JSON.stringify(p)).toBe(JSON.stringify(brut));
  });

  it('un projet plat reste au format 1 ; sa migration est l identite, rien n est dit « complete »', () => {
    expect(VERSION_PROJET_PLAT).toBe(1);
    const brut = projet(1, { vb: [0, 0, 10, 10], formes: [forme('f1')] });
    expect(MIGRATIONS[1]?.(brut)).toBe(brut);
    expect(migrer(brut)).toEqual({ donnees: brut, migre: false });
    const r = lireProjet(brut);
    expect('erreur' in r ? r.erreur : [r.projet.version, r.migre]).toEqual([1, false]);
    expect(JSON.stringify('erreur' in r ? null : r.projet)).toBe(JSON.stringify(brut));
  });

  it('refuse un format plus recent, et un projet au format 1 qui porterait des groupes', () => {
    expect(erreur(projet(3, avecGroupes()))).toContain('version plus récente de l’éditeur (format 3)');
    expect(erreur(projet(1, avecGroupes()))).toBe('Ce projet est illisible : un projet au format 1 ne porte pas de groupes.');
    expect(erreur(projet(1, { vb: [0, 0, 10, 10], formes: [forme('f1', { parent: 'g1' })] }))).not.toBe('');
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
    for (const [dessin, phrase] of cas) expect(erreur(projet(2, dessin)), phrase).toContain(phrase);
  });
});
