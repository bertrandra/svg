// L'arbre du modele v2 (ADR-0012, annexe 1 §5, §8, §9) : la vue derivee, les aides de selection, les invariants et leur
// retablissement, le poids pour l'historique. Les dessins riches sont construits a la main : aucune lecture ne les produit encore.

import { describe, expect, it } from 'vitest';
import {
  ancetres, arbreDe, estPlat, feuillePlate, feuillesDe, normaliser, poidsDessin, prochainNumero, profondeur, promouvoir, unites,
  verifierDessin, verrouilleEffectif, visibleEffectif, PROFONDEUR_GROUPES_MAX,
  type Chemin, type DessinSvg, type Forme, type Groupe, type NoeudArbre
} from '../../../src/engine/editionSvg.js';

const carre: Chemin = [{ c: 'M', p: [0, 0] }, { c: 'L', p: [10, 0] }, { c: 'L', p: [10, 10] }, { c: 'Z', p: [] }];
const f = (id: string, p: Partial<Forme> = {}): Forme => ({ id, d: carre, remplissage: '#c81e28', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, ...p });
const g = (id: string, p: Partial<Groupe> = {}): Groupe => ({ id, visible: true, verrouille: false, ...p });
const table = (...gs: Groupe[]): Record<string, Groupe> => Object.fromEntries(gs.map(x => [x.id, x]));

// f1 | g1 [ f2 | g2 [ f3 ] | f4 ] | f5
const riche: DessinSvg = {
  vb: [0, 0, 100, 100],
  formes: [f('f1'), f('f2', { parent: 'g1' }), f('f3', { parent: 'g2' }), f('f4', { parent: 'g1' }), f('f5')],
  groupes: table(g('g1'), g('g2', { parent: 'g1', visible: false }))
};
const plat: DessinSvg = { vb: [0, 0, 100, 100], formes: [f('f1'), f('f2'), f('f3')] };

/** L'arbre en texte : « f1 g1[f2 g2[f3] f4] f5 ». */
const enTexte = (t: readonly NoeudArbre[]): string => t.map(n => (n.genre === 'feuille' ? n.forme.id : n.groupe.id + '[' + enTexte(n.enfants) + ']')).join(' ');

describe('estPlat', () => {
  it('est vrai d un dessin sans groupes ni champ v2, texte vivant, operation et origine compris', () => {
    expect(estPlat(plat)).toBe(true);
    expect(feuillePlate(f('t', { operation: 'ecriture', origine: ['game-icons:a'] }))).toBe(true);
  });

  it('est faux des qu une table de groupes ou un champ v2 de feuille existe', () => {
    expect(estPlat(riche)).toBe(false);
    expect(estPlat({ ...plat, groupes: {} })).toBe(false);
    const degrade = { genre: 'lineaire', x1: 0, y1: 0, x2: 1, y2: 0, arrets: [{ position: 0, couleur: '#000000' }, { position: 1, couleur: '#ffffff' }] } as const;
    for (const champ of [{ parent: 'g1' }, { peintureRemplissage: degrade }, { peintureContour: degrade }, { effets: { flou: { ecart: 2 } } }, { image: { donnees: 'data:image/png;base64,', x: 0, y: 0, l: 1, h: 1 } }]) {
      expect(estPlat({ ...plat, formes: [f('f1', champ)] }), JSON.stringify(champ)).toBe(false);
    }
  });
});

describe('l arbre derive', () => {
  it('rend une feuille par forme pour un dessin plat, et se memorise', () => {
    expect(enTexte(arbreDe(plat).racine)).toBe('f1 f2 f3');
    expect(arbreDe(plat)).toBe(arbreDe(plat));
  });

  it('rend les groupes avec l intervalle de leurs feuilles', () => {
    const a = arbreDe(riche);
    expect(enTexte(a.racine)).toBe('f1 g1[f2 g2[f3] f4] f5');
    const g1 = a.parId.get('g1'), g2 = a.parId.get('g2');
    expect(g1?.genre === 'groupe' && [g1.debut, g1.fin]).toEqual([1, 4]);
    expect(g2?.genre === 'groupe' && [g2.debut, g2.fin]).toEqual([2, 3]);
    expect(a.parId.get('f4')).toEqual({ genre: 'feuille', forme: riche.formes[3], index: 3 });
  });

  it('dit les ancetres, la profondeur, la visibilite et le verrou herites', () => {
    expect(ancetres(riche, 'f3')).toEqual(['g2', 'g1']);
    expect(ancetres(riche, 'g2')).toEqual(['g1']);
    expect(ancetres(plat, 'f1')).toEqual([]);
    expect(profondeur(riche, 'f3')).toBe(2);
    expect(visibleEffectif(riche, 'f3')).toBe(false);
    expect(visibleEffectif(riche, 'f2')).toBe(true);
    expect(visibleEffectif(riche, 'inconnu')).toBe(false);
    const verrou = { ...riche, groupes: table(g('g1', { verrouille: true }), g('g2', { parent: 'g1' })) };
    expect(verrouilleEffectif(verrou, 'f3')).toBe(true);
    expect(verrouilleEffectif(verrou, 'f1')).toBe(false);
  });

  it('couvre les feuilles d une selection mixte, dans l ordre du dessin', () => {
    expect(feuillesDe(riche, ['g1'])).toEqual(['f2', 'f3', 'f4']);
    expect(feuillesDe(riche, ['f5', 'g2', 'f1'])).toEqual(['f1', 'f3', 'f5']);
    expect(feuillesDe(plat, ['f3', 'f1', 'f1'])).toEqual(['f1', 'f3']);
  });

  it('garde les unites d une selection et promeut les groupes entierement choisis', () => {
    expect(unites(riche, ['f3', 'g1', 'f1', 'f1'])).toEqual(['g1', 'f1']);
    expect(promouvoir(riche, ['f3'])).toEqual(['f3', 'g2']);
    expect(promouvoir(riche, ['f2', 'f3', 'f4']).sort()).toEqual(['f2', 'f3', 'f4', 'g1', 'g2']);
    expect(promouvoir(riche, ['f2'])).toEqual(['f2']);
  });

  it('numerote feuilles et groupes a part, contenus imbriques compris', () => {
    expect(prochainNumero(riche, 'f')).toBe(6);
    expect(prochainNumero(riche, 'g')).toBe(3);
    const decoupe = { ...riche, groupes: table(g('g1', { decoupe: { contenu: { formes: [f('f9')] } } }), g('g2', { parent: 'g1', visible: false })) };
    expect(prochainNumero(decoupe, 'f')).toBe(10);
  });
});

describe('les invariants', () => {
  it('un dessin plat et le dessin riche de reference sont bien formes', () => {
    expect(verifierDessin(plat)).toEqual([]);
    expect(verifierDessin(riche)).toEqual([]);
  });

  it('nomme chaque invariant viole', () => {
    const cas: Array<[string, DessinSvg]> = [
      ['I1', { ...plat, formes: [f('f1'), f('f1')] }],
      ['I1', { ...riche, groupes: table(g('g1'), g('g2', { parent: 'g1' }), g('f5')) }],
      ['I2', { ...plat, formes: [f('f1', { parent: 'g7' })], groupes: table(g('g1')) }],
      ['I2', { ...plat, formes: [f('f1', { parent: 'ga' })], groupes: table(g('ga', { parent: 'gb' }), g('gb', { parent: 'ga' })) }],
      ['I3', { ...plat, formes: [f('f1', { parent: 'g1' }), f('f2'), f('f3', { parent: 'g1' })], groupes: table(g('g1')) }],
      ['I4', { ...plat, groupes: table(g('g1')) }],
      ['I5', { ...plat, formes: [f('f1', { remplissage: null, peintureRemplissage: { genre: 'radial', cx: 0, cy: 0, r: 1, arrets: [] } })] }],
      ['I9', { ...plat, groupes: {} }],
      ['I9', { ...plat, formes: [f('f1', { parent: 'g1' })], groupes: { g1: g('g2') } }]
    ];
    for (const [invariant, d] of cas) expect(verifierDessin(d).join(' | '), invariant).toContain(invariant + ' :');
  });

  it('borne la profondeur des groupes', () => {
    const groupes = Array.from({ length: PROFONDEUR_GROUPES_MAX + 1 }, (_, i) => g('g' + (i + 1), i ? { parent: 'g' + i } : {}));
    const profond: DessinSvg = { ...plat, formes: [f('f1', { parent: 'g' + groupes.length })], groupes: table(...groupes) };
    expect(verifierDessin(profond).join(' | ')).toContain('plus de ' + PROFONDEUR_GROUPES_MAX + ' niveaux');
    expect(verifierDessin({ ...profond, formes: [f('f1', { parent: 'g' + PROFONDEUR_GROUPES_MAX })], groupes: table(...groupes.slice(0, PROFONDEUR_GROUPES_MAX)) })).toEqual([]);
  });
});

describe('normaliser', () => {
  it('rend le meme objet pour un dessin deja normal, plat ou riche', () => {
    expect(normaliser(plat)).toBe(plat);
    expect(normaliser(riche)).toBe(riche);
    const peint = { ...plat, formes: [f('f1', { effets: { flou: { ecart: 1 } } })] };
    expect(normaliser(peint)).toBe(peint);
  });

  it('retablit la contiguite en suivant l arbre, freres ranges par leur premiere feuille', () => {
    const d: DessinSvg = { ...plat, formes: [f('f1', { parent: 'g1' }), f('f2'), f('f3', { parent: 'g1' }), f('f4', { parent: 'g2' }), f('f5', { parent: 'g1' })], groupes: table(g('g1'), g('g2', { parent: 'g1' })) };
    const n = normaliser(d);
    expect(n.formes.map(x => x.id)).toEqual(['f1', 'f3', 'f4', 'f5', 'f2']);
    expect(verifierDessin(n)).toEqual([]);
    expect(normaliser(n)).toBe(n);
  });

  it('retire les groupes vides en cascade, les parents absents, les cycles et la table vide', () => {
    const vides: DessinSvg = { ...plat, formes: [f('f1', { parent: 'g1' }), f('f2', { parent: 'g9' })], groupes: table(g('g1'), g('g2', { parent: 'g1' }), g('g3', { parent: 'g2' })) };
    const n = normaliser(vides);
    expect(Object.keys(n.groupes ?? {})).toEqual(['g1']);
    expect(n.formes[1]).toEqual(f('f2'));
    expect(verifierDessin(n)).toEqual([]);
    const cycle: DessinSvg = { ...plat, formes: [f('f1', { parent: 'ga' })], groupes: table(g('ga', { parent: 'gb' }), g('gb', { parent: 'ga' })) };
    const c = normaliser(cycle);
    expect(verifierDessin(c)).toEqual([]);
    expect(normaliser(c)).toBe(c);
    const vide = normaliser({ ...plat, groupes: {} });
    expect('groupes' in vide).toBe(false);
    expect(vide.formes).toEqual(plat.formes);
    expect(estPlat(vide)).toBe(true);
  });
});

describe('le poids pour l historique', () => {
  it('vaut le nombre de formes d un dessin plat, et compte groupes, contenus et images sinon', () => {
    expect(poidsDessin(plat)).toBe(3);
    // 5 feuilles + 2 groupes x 4
    expect(poidsDessin(riche)).toBe(13);
    const image = { donnees: 'data:image/png;base64,' + 'A'.repeat(40000), x: 0, y: 0, l: 1, h: 1 };
    expect(poidsDessin({ ...plat, formes: [f('f1', { image, remplissage: null })] })).toBe(1 + 50 + 3);
    const decoupe = { ...riche, groupes: table(g('g1', { decoupe: { contenu: { formes: [f('f9'), f('f10')] } } }), g('g2', { parent: 'g1', visible: false })) };
    expect(poidsDessin(decoupe)).toBe(13 + 40);
  });
});
