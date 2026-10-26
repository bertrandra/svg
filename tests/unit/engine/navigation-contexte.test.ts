// Le clavier dans le contexte d'edition (ADR-0012, etape 2, paquet 2-C ; annexe 6 §2) : Tab, Page suivante, Ctrl+A et le curseur
// de la selection additive ne voient que les noeuds du niveau du contexte ; sur un dessin plat, la liste d'avant, a l'identique.
// Et ce que les phrases disent d'un groupe (annexe 6 §7).

import { describe, expect, it } from 'vitest';
import { lireDessin, type Chemin, type DessinSvg, type Forme, type Groupe } from '../../../src/engine/editionSvg.js';
import { choisissables, formeAuCurseur, formeVoisine, noeudsChoisissables } from '../../../src/engine/navigation.js';
import { candidates, optionsPrise } from '../../../src/engine/prise.js';
import { detailsGroupe, groupeDecrit, groupeDit, nomDeGroupe, porteParGroupe } from '../../../src/engine/description.js';

const carre = (x: number, y: number, c = 10): Chemin => [{ c: 'M', p: [x, y] }, { c: 'L', p: [x + c, y] }, { c: 'L', p: [x + c, y + c] }, { c: 'L', p: [x, y + c] }, { c: 'Z', p: [] }];
const f = (id: string, p: Partial<Forme> = {}): Forme => ({ id, d: carre(0, 0), remplissage: '#c81e28', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, ...p });
const g = (id: string, p: Partial<Groupe> = {}): Groupe => ({ id, visible: true, verrouille: false, ...p });

/** f1 a la racine, g1 (f2, g2 (f3, f4), f5), f6 a la racine. */
const exemple = (g2: Partial<Groupe> = {}, f5: Partial<Forme> = {}): DessinSvg => ({
  vb: [0, 0, 100, 100],
  formes: [
    f('f1', { d: carre(0, 0) }), f('f2', { d: carre(20, 0), parent: 'g1' }), f('f3', { d: carre(40, 0), parent: 'g2' }), f('f4', { d: carre(60, 0), parent: 'g2' }),
    f('f5', { d: carre(20, 30), parent: 'g1', ...f5 }), f('f6', { d: carre(0, 60) })
  ],
  groupes: { g1: g('g1', { nom: 'Nuage' }), g2: g('g2', { parent: 'g1', ...g2 }) }
});

describe('les noeuds choisissables du niveau', () => {
  it('rendent la liste d avant sur un dessin plat', () => {
    const r = lireDessin('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0h10v10z"/><path d="M20 0h10v10z" visibility="hidden"/><path d="M40 0h10v10z"/></svg>');
    if ('erreur' in r) throw new Error(r.erreur);
    expect(noeudsChoisissables(r.dessin)).toEqual(choisissables(r.dessin).map(x => x.id));
    expect(noeudsChoisissables(r.dessin, 'g1')).toEqual(choisissables(r.dessin).map(x => x.id));
    expect(formeVoisine(r.dessin, [], 1, false)).toBe(choisissables(r.dessin)[0]?.id);
  });

  it('rendent les freres du contexte, sans ce qui est masque ou verrouille, eux ou un ancetre', () => {
    const d = exemple();
    expect(noeudsChoisissables(d, null)).toEqual(['f1', 'g1', 'f6']);
    expect(noeudsChoisissables(d, 'g1')).toEqual(['f2', 'g2', 'f5']);
    expect(noeudsChoisissables(d, 'g2')).toEqual(['f3', 'f4']);
    expect(noeudsChoisissables(exemple({ verrouille: true }), 'g1')).toEqual(['f2', 'f5']);
    expect(noeudsChoisissables(exemple({ visible: false }), 'g2')).toEqual([]);
    expect(noeudsChoisissables(exemple({}, { visible: false }), 'g1')).toEqual(['f2', 'g2']);
  });

  it('font passer Tab et Page suivante d un frere a l autre, sans sortir du contexte', () => {
    const d = exemple();
    expect(formeVoisine(d, ['f2'], 1, false, 'g1')).toBe('g2');
    expect(formeVoisine(d, ['g2'], 1, false, 'g1')).toBe('f5');
    expect(formeVoisine(d, ['f5'], 1, false, 'g1')).toBeNull();
    expect(formeVoisine(d, ['f5'], 1, true, 'g1')).toBe('f2');
    expect(formeVoisine(d, [], -1, false, 'g1')).toBe('f5');
    expect(formeVoisine(d, ['f1'], 1, false, null)).toBe('g1');
    expect(formeVoisine(d, ['g1'], 1, false, null)).toBe('f6');
  });

  it('ne croient le curseur que s il est un noeud du niveau', () => {
    const d = exemple(), sel = ['f2', 'f5'];
    expect(formeAuCurseur(d, sel, { id: 'f2', sel }, 'g1')).toBe('f2');
    expect(formeAuCurseur(d, sel, { id: 'f3', sel }, 'g1')).toBe('f5');
  });
});

describe('ce qu on dit d un groupe', () => {
  it('le nomme par son nom, ou par son numero', () => {
    const d = exemple();
    const [g1, g2] = [d.groupes?.g1, d.groupes?.g2];
    if (!g1 || !g2) throw new Error('deux groupes');
    expect(nomDeGroupe(g1)).toBe('Nuage');
    expect(nomDeGroupe(g2)).toBe('Groupe 2');
    expect(groupeDit(g1)).toBe('groupe « Nuage »');
    expect(groupeDit(g2)).toBe('groupe 2');
  });

  it('dit ses formes, ce qu il porte et sa boite', () => {
    const d = exemple({ opacite: 0.5, effets: { ombre: { dx: 1, dy: 1, ecart: 1, couleur: '#000000', opacite: 0.5 } } });
    const g1 = d.groupes?.g1, g2 = d.groupes?.g2;
    if (!g1 || !g2) throw new Error('deux groupes');
    expect(porteParGroupe(g2)).toEqual(['ombre portée', 'opacité 50 %']);
    expect(groupeDecrit(d, g1)).toBe('groupe « Nuage », 4 formes, 50 × 40 à 20, 0');
    expect(detailsGroupe(d, g2)).toBe('2 formes, ombre portée, opacité 50 %, 30 × 10 à 40, 0');
  });
});

describe('une image integree sur la toile', () => {
  it('se prend sur toute sa surface, pas seulement au bord de son cadre', () => {
    const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mM4IacBAALAAQ/kvVIVAAAAAElFTkSuQmCC';
    const r = lireDessin('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><image x="40" y="40" width="120" height="90" href="data:image/png;base64,' + PNG + '"/></svg>', { modele: 'riche' });
    if ('erreur' in r) throw new Error(r.erreur);
    expect(candidates(r.dessin.formes, 100, 85, optionsPrise(1, false)).map(c => [c.id, c.dedans])).toEqual([['f1', true]]);
    expect(candidates(r.dessin.formes, 300, 250, optionsPrise(1, false))).toEqual([]);
  });
});
