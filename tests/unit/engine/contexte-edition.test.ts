// Le contexte d'edition vu du moteur (ADR-0012, etape 2, paquet A ; annexe 6 §2) : une prise, une zone et les aimants ne voient que
// les noeuds du niveau du contexte ; une feuille touchee remonte a l'enfant du contexte qui la contient ; hors du contexte, rien ne
// se prend. Un dessin plat garde exactement les calculs d'avant.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cheminDuContexte, contexteValide, lireDessin, noeudsDuNiveau, uniteDans, unitesPrenables, type Chemin, type DessinSvg, type Forme, type Groupe } from '../../../src/engine/editionSvg.js';
import { candidates, candidatesDans, optionsPrise } from '../../../src/engine/prise.js';
import { formesDansZone, noeudsDansZone } from '../../../src/engine/selection.js';
import { ciblesAimants } from '../../../src/engine/transformations.js';

const carre = (x: number, y: number, c = 10): Chemin => [{ c: 'M', p: [x, y] }, { c: 'L', p: [x + c, y] }, { c: 'L', p: [x + c, y + c] }, { c: 'L', p: [x, y + c] }, { c: 'Z', p: [] }];
const f = (id: string, p: Partial<Forme> = {}): Forme => ({ id, d: carre(0, 0), remplissage: '#c81e28', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, ...p });
const g = (id: string, p: Partial<Groupe> = {}): Groupe => ({ id, visible: true, verrouille: false, ...p });

/** f1 a la racine, g1 (f2, g2 (f3, f4), f5), f6 a la racine. */
const exemple = (g2: Partial<Groupe> = {}): DessinSvg => ({
  vb: [0, 0, 100, 100],
  formes: [
    f('f1', { d: carre(0, 0) }), f('f2', { d: carre(20, 0), parent: 'g1' }), f('f3', { d: carre(40, 0), parent: 'g2' }), f('f4', { d: carre(60, 0), parent: 'g2' }),
    f('f5', { d: carre(20, 30), parent: 'g1' }), f('f6', { d: carre(0, 60) })
  ],
  groupes: { g1: g('g1'), g2: g('g2', { parent: 'g1', ...g2 }) }
});
const souris = optionsPrise(1, false);
const prise = (d: DessinSvg, ctx: string | null, x: number, y: number): string[] => candidatesDans(d, ctx, x, y, souris).map(c => c.id);

describe('le contexte d edition : les unites', () => {
  const d = exemple();

  it('remonte une feuille a l enfant du contexte, et ne rend rien hors du contexte', () => {
    expect(uniteDans(d, 'f3', null)).toBe('g1');
    expect(uniteDans(d, 'f3', 'g1')).toBe('g2');
    expect(uniteDans(d, 'f3', 'g2')).toBe('f3');
    expect(uniteDans(d, 'f1', null)).toBe('f1');
    expect(uniteDans(d, 'f1', 'g1')).toBeNull();
    expect(uniteDans(d, 'g1', 'g1')).toBeNull();
    expect(uniteDans(d, 'g2', null)).toBe('g1');
  });

  it('valide le contexte, donne son niveau et son chemin', () => {
    expect(contexteValide(d, 'g2')).toBe('g2');
    expect(contexteValide(d, 'g9')).toBeNull();
    expect(contexteValide(d, 'constructor')).toBeNull();
    expect(contexteValide({ formes: d.formes }, 'g1')).toBeNull();
    expect(noeudsDuNiveau(d, null).map(n => (n.genre === 'feuille' ? n.forme.id : n.groupe.id))).toEqual(['f1', 'g1', 'f6']);
    expect(noeudsDuNiveau(d, 'g1').map(n => (n.genre === 'feuille' ? n.forme.id : n.groupe.id))).toEqual(['f2', 'g2', 'f5']);
    expect(noeudsDuNiveau(d, 'g9')).toEqual([]);
    expect(cheminDuContexte(d, 'g2')).toEqual(['g2', 'g1']);
    expect(cheminDuContexte(d, null)).toEqual([]);
  });

  it('memorise les unites prenables par dessin et par contexte', () => {
    expect(unitesPrenables(d, 'g1')).toBe(unitesPrenables(d, 'g1'));
    expect(unitesPrenables(d, 'g1')).toEqual([null, 'f2', 'g2', 'g2', 'f5', null]);
  });
});

describe('la prise dans un contexte', () => {
  it('un dessin plat : exactement la prise d avant', () => {
    const plat: DessinSvg = { vb: [0, 0, 100, 100], formes: [f('f1'), f('f2', { d: carre(5, 5) }), f('f3', { d: carre(50, 50), verrouille: true })] };
    for (const [x, y] of [[7, 7], [2, 2], [55, 55], [90, 90]] as const) expect(candidatesDans(plat, 'g1', x, y, souris)).toEqual(candidates(plat.formes, x, y, souris));
  });

  it('remonte au groupe a la racine, a l enfant du contexte dedans', () => {
    const d = exemple();
    expect(prise(d, null, 45, 5)).toEqual(['g1']);
    expect(prise(d, 'g1', 45, 5)).toEqual(['g2']);
    expect(prise(d, 'g2', 45, 5)).toEqual(['f3']);
    expect(prise(d, null, 5, 5)).toEqual(['f1']);
  });

  it('ne prend rien hors du contexte, ni sous un groupe masque ou verrouille', () => {
    expect(prise(exemple(), 'g2', 5, 5)).toEqual([]);
    expect(prise(exemple(), 'g1', 5, 65)).toEqual([]);
    expect(prise(exemple({ verrouille: true }), 'g1', 45, 5)).toEqual([]);
    expect(prise(exemple({ visible: false }), null, 45, 5)).toEqual([]);
    // Le reste du groupe parent se prend toujours.
    expect(prise(exemple({ verrouille: true }), null, 25, 5)).toEqual(['g1']);
  });

  it('ne rend chaque unite qu une fois, a la place de sa meilleure feuille', () => {
    const d: DessinSvg = { vb: [0, 0, 100, 100], formes: [f('f1', { parent: 'g1' }), f('f2', { parent: 'g1', d: carre(2, 2) })], groupes: { g1: g('g1') } };
    expect(prise(d, null, 5, 5)).toEqual(['g1']);
    expect(candidatesDans(d, null, 5, 5, souris)[0]?.rang).toBe(1);
  });
});

describe('le cadre et le lasso dans un contexte', () => {
  const zone = { rect: { x: 35, y: -5, l: 40, h: 20 } };

  it('un dessin plat : exactement les formes d avant', () => {
    const plat: DessinSvg = { vb: [0, 0, 100, 100], formes: [f('f1', { d: carre(40, 0) }), f('f2', { d: carre(60, 0) }), f('f3', { d: carre(0, 60) })] };
    for (const regle of ['touche', 'dedans'] as const) expect(noeudsDansZone(plat, null, zone, { regle })).toEqual(formesDansZone(plat.formes, zone, { regle }));
  });

  it('prend les unites du niveau : touchees, ou entierement dedans', () => {
    const d = exemple();
    expect(noeudsDansZone(d, null, zone, { regle: 'touche' })).toEqual(['g1']);
    expect(noeudsDansZone(d, null, zone, { regle: 'dedans' })).toEqual([]);
    expect(noeudsDansZone(d, 'g1', zone, { regle: 'dedans' })).toEqual(['g2']);
    expect(noeudsDansZone(d, 'g2', zone, { regle: 'touche' })).toEqual(['f3', 'f4']);
    expect(noeudsDansZone(d, 'g2', { rect: { x: -5, y: -5, l: 200, h: 200 } }, { regle: 'touche' })).toEqual(['f3', 'f4']);
    expect(noeudsDansZone(exemple({ verrouille: true }), 'g1', zone, { regle: 'touche' })).toEqual([]);
  });
});

describe('les aimants dans un contexte', () => {
  it('un dessin plat : les aimants d avant', () => {
    const plat: DessinSvg = { vb: [0, 0, 100, 100], formes: [f('f1'), f('f2', { d: carre(50, 0) })] };
    expect(ciblesAimants(plat, ['f1'], 'g1')).toEqual(ciblesAimants(plat, ['f1']));
  });

  it('attirent vers les freres du contexte (un groupe par sa boite), jamais vers ce qu on deplace', () => {
    const d = exemple();
    expect(ciblesAimants(d, ['g1'])).toEqual([{ x: 0, y: 0, l: 100, h: 100 }, { x: 0, y: 0, l: 10, h: 10 }, { x: 0, y: 60, l: 10, h: 10 }]);
    expect(ciblesAimants(d, ['f2'], 'g1')).toEqual([{ x: 0, y: 0, l: 100, h: 100 }, { x: 40, y: 0, l: 30, h: 10 }, { x: 20, y: 30, l: 10, h: 10 }]);
    // Un contexte qui n'existe plus : la racine.
    expect(ciblesAimants(d, ['g1'], 'g9')).toEqual(ciblesAimants(d, ['g1']));
  });
});

describe('un fichier a groupes lu en riche', () => {
  it('se prend par ses calques a la racine, par ses formes une fois entre', () => {
    const r = lireDessin(readFileSync(resolve(__dirname, '../../fixtures/svg/v2/groupes-imbriques.svg'), 'utf8'), { modele: 'riche' });
    if ('erreur' in r) throw new Error(r.erreur);
    const d = r.dessin, racine = noeudsDuNiveau(d, null).map(n => (n.genre === 'feuille' ? n.forme.id : n.groupe.id));
    for (const [i, x] of d.formes.entries()) {
      const u = unitesPrenables(d, null)[i];
      if (u) expect(racine, x.id).toContain(u);
    }
  });
});
