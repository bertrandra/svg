// Les formes de base (ADR-0033) : chacune est un chemin ordinaire, ferme ou ouvert comme attendu, qui tient dans sa boite ;
// memes entrees, memes commandes ; les reglages sont bornes ; les formes d'avant ne changent pas ; et chacune se nomme.

import { describe, expect, it } from 'vitest';
import {
  ajouterForme, anneau, boiteChemin, BORNES_FORMES, bornerParametres, ellipse, etoile, FICHES_FORMES, formeDeBase, FORMES_DE_BASE, PARAMETRES_FORMES_DEFAUT,
  polygoneRegulier, rectangle, rectangleArrondi, redimensionner, regleDeForme, deplacer, lireDessin, ecrireDessin, sousChemins, STYLE_DEFAUT,
  type Chemin, type DessinSvg, type FormeDeBase, type ParametresFormes
} from '../../../src/engine/editionSvg.js';
import { genreDeForme } from '../../../src/engine/description.js';
import { operationProposee } from '../../../src/engine/preparation.js';
import { au } from '../../../src/util/tableaux.js';

const VIDE: DessinSvg = { vb: [0, 0, 400, 300], formes: [] };
const reglages = (p: Partial<ParametresFormes> = {}): ParametresFormes => ({ ...PARAMETRES_FORMES_DEFAUT, ...p });
const ferme = (d: Chemin): boolean => d.some(c => c.c === 'Z');
const sommets = (d: Chemin): number => d.filter(c => c.c !== 'Z').length;
const aire = (d: Chemin): number => {
  // L'aire signee des ancres d'un sous-chemin : son signe dit le sens de parcours.
  const p = d.filter(c => c.c !== 'Z').map(c => [c.p[c.p.length - 2] ?? 0, c.p[c.p.length - 1] ?? 0] as const);
  return p.reduce((s, a, i) => { const b = p[(i + 1) % p.length] ?? a; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
};
/** La forme posee dans un dessin vide, comme l'outil la pose (le style d'une ligne pour un trait, la regle de l'anneau). */
const posee = (forme: FormeDeBase, x = 20, y = 30, l = 120, h = 80, p: Partial<ParametresFormes> = {}) => {
  const style = FICHES_FORMES[forme].trait ? { remplissage: null, contour: '#000000', epaisseur: 1 } : STYLE_DEFAUT;
  return au(ajouterForme(VIDE, formeDeBase(forme, x, y, l, h, reglages(p)), style, regleDeForme(forme)).dessin.formes, 0);
};

describe('chaque forme de base', () => {
  const CARREES = new Set<FormeDeBase>(['carre', 'cercle']);
  for (const forme of FORMES_DE_BASE) {
    it(forme + ' : un chemin ' + (FICHES_FORMES[forme].trait ? 'ouvert' : 'ferme') + ' qui tient dans sa boite, toujours le meme', () => {
      const d = formeDeBase(forme, 20, 30, 120, 80);
      expect(d.length).toBeGreaterThan(1);
      expect(d.every(c => ['M', 'L', 'C', 'Z'].includes(c.c) && c.p.every(Number.isFinite))).toBe(true);
      expect(au(d, 0).c).toBe('M');
      expect(ferme(d)).toBe(!FICHES_FORMES[forme].trait);
      const b = boiteChemin(d);
      if (!b) throw new Error('boite vide');
      // La boite tracee, a un millionieme pres (le carre et le cercle prennent le petit cote ; l'etoile d'avant est inscrite
      // dans l'ellipse de la boite, sa pointe en haut).
      expect(b.x).toBeGreaterThanOrEqual(20 - 1e-6);
      expect(b.y).toBeCloseTo(30, 6);
      expect(b.x + b.l).toBeLessThanOrEqual(140 + 1e-6);
      expect(b.y + b.h).toBeLessThanOrEqual(110 + 1e-6);
      if (CARREES.has(forme)) expect([b.l, b.h].map(v => Math.round(v * 1e6) / 1e6)).toEqual([80, 80]);
      else if (forme !== 'etoile') expect([b.x, b.l, b.h].map(v => Math.round(v * 1e6) / 1e6)).toEqual([20, 120, 80]);
      expect(JSON.stringify(formeDeBase(forme, 20, 30, 120, 80))).toBe(JSON.stringify(d));
    });
  }

  it('rend un chemin vide pour une boite sans surface, sauf la ligne', () => {
    for (const forme of FORMES_DE_BASE) if (forme !== 'ligne') expect(formeDeBase(forme, 0, 0, 0, 40)).toEqual([]);
    expect(sommets(formeDeBase('ligne', 0, 0, 0, 40))).toBe(2);
  });
});

describe('les formes d avant', () => {
  it('rectangle, ellipse et etoile par defaut donnent les memes commandes qu avant', () => {
    expect(formeDeBase('rectangle', 3, 4, 50, 20)).toEqual(rectangle(3, 4, 50, 20));
    expect(formeDeBase('ellipse', 3, 4, 50, 20)).toEqual(ellipse(3, 4, 50, 20));
    expect(formeDeBase('etoile', 3, 4, 50, 20)).toEqual(etoile(3, 4, 50, 20));
    expect(formeDeBase('carre', 3, 4, 50, 20)).toEqual(rectangle(3, 4, 20, 20));
    expect(formeDeBase('cercle', 3, 4, 50, 20)).toEqual(ellipse(3, 4, 20, 20));
  });

  it('la regle de remplissage reste nonzero, sauf pour l anneau', () => {
    for (const forme of FORMES_DE_BASE) expect(regleDeForme(forme)).toBe(forme === 'anneau' ? 'evenodd' : 'nonzero');
    expect(ajouterForme(VIDE, rectangle(0, 0, 10, 10), STYLE_DEFAUT).dessin.formes[0]?.regle).toBe('nonzero');
  });
});

describe('les reglages', () => {
  it('bornent le polygone de 3 a 12 cotes', () => {
    expect(sommets(polygoneRegulier(0, 0, 100, 100, 2))).toBe(3);
    expect(sommets(polygoneRegulier(0, 0, 100, 100, 8))).toBe(8);
    expect(sommets(polygoneRegulier(0, 0, 100, 100, 40))).toBe(12);
    expect(sommets(formeDeBase('polygone', 0, 0, 100, 100, reglages({ cotes: 5.4 })))).toBe(5);
  });

  it('bornent les branches et le creux de l etoile', () => {
    expect(sommets(formeDeBase('etoile', 0, 0, 100, 100, reglages({ branches: 8 })))).toBe(16);
    expect(formeDeBase('etoile', 0, 0, 100, 100, reglages({ creux: 0 }))).toEqual(etoile(0, 0, 100, 100, 5, BORNES_FORMES.creux[0]));
    expect(formeDeBase('etoile', 0, 0, 100, 100, reglages({ creux: 0.99 }))).toEqual(etoile(0, 0, 100, 100, 5, BORNES_FORMES.creux[1]));
    expect(bornerParametres(reglages({ branches: 99, creux: Number.NaN, tours: 0, ondulations: 3.6, festons: 2, rayonCoins: -4 })))
      .toMatchObject({ branches: 20, creux: 0.1, tours: 1, ondulations: 4, festons: 6, rayonCoins: 0 });
  });

  it('gardent le rayon des coins sous la moitie du petit cote', () => {
    const b = boiteChemin(rectangleArrondi(0, 0, 100, 40, 1000));
    expect(b && [b.l, b.h].map(v => Math.round(v * 1e6) / 1e6)).toEqual([100, 40]);
    const pilule = rectangleArrondi(0, 0, 100, 40, 1000);
    // Le rayon est ramene a 20 : deux bords droits horizontaux, aucun bord vertical, quatre quarts de cercle.
    expect(pilule.map(c => c.c).join('')).toBe('MLCCLCCZ');
    expect(rectangleArrondi(0, 0, 100, 40, 0)).toEqual(rectangle(0, 0, 100, 40));
    expect(rectangleArrondi(0, 0, 100, 40, 10).map(c => c.c).join('')).toBe('MLCLCLCLCZ');
  });

  it('percent l anneau d un trou concentrique, en sens inverse, a l epaisseur donnee', () => {
    const d = anneau(0, 0, 100, 100, 0.3), [dehors, dedans] = sousChemins(d);
    if (!dehors || !dedans) throw new Error('deux sous-chemins attendus');
    expect(Math.sign(aire(dehors))).toBe(-Math.sign(aire(dedans)));
    const b = boiteChemin(dedans);
    expect(b && [b.x, b.y, b.l, b.h].map(v => Math.round(v * 1e6) / 1e6)).toEqual([15, 15, 70, 70]);
    // Bornee : une epaisseur nulle laisse un filet de 5 %, une epaisseur totale garde un trou de 10 %.
    expect(boiteChemin(au(sousChemins(anneau(0, 0, 100, 100, 0)), 1))?.l).toBeCloseTo(95, 6);
    expect(boiteChemin(au(sousChemins(anneau(0, 0, 100, 100, 5)), 1))?.l).toBeCloseTo(10, 6);
  });

  it('font des fleches dans les quatre sens, simples ou doubles', () => {
    expect(sommets(formeDeBase('fleche', 0, 0, 100, 50))).toBe(7);
    expect(sommets(formeDeBase('fleche', 0, 0, 100, 50, reglages({ pointe: 'double' })))).toBe(10);
    const pointe = (sens: ParametresFormes['sens']) => {
      const d = formeDeBase('fleche', 0, 0, 100, 100, reglages({ sens }));
      return d.find(c => (c.p[0] === 100 || c.p[0] === 0 || c.p[1] === 0 || c.p[1] === 100) && (c.p[0] === 50 || c.p[1] === 50))?.p;
    };
    expect(pointe('droite')).toEqual([100, 50]);
    expect(pointe('gauche')).toEqual([0, 50]);
    expect(pointe('haut')).toEqual([50, 0]);
    expect(pointe('bas')).toEqual([50, 100]);
  });

  it('comptent les tours de la spirale, les ondulations de la vague et les festons du badge', () => {
    expect(formeDeBase('spirale', 0, 0, 100, 100, reglages({ tours: 4 })).filter(c => c.c === 'C').length).toBe(16);
    expect(formeDeBase('vague', 0, 0, 300, 60, reglages({ ondulations: 5 })).filter(c => c.c === 'C').length).toBe(10);
    expect(formeDeBase('badge', 0, 0, 100, 100, reglages({ festons: 9 })).filter(c => c.c === 'C').length).toBe(18);
  });
});

describe('le nom de chaque forme de base', () => {
  const NOMS: ReadonlyArray<readonly [FormeDeBase, string, Partial<ParametresFormes>?, number?, number?]> = [
    ['rectangle', 'rectangle'], ['carre', 'carré'], ['rectangle-arrondi', 'rectangle arrondi'], ['ellipse', 'ellipse'], ['cercle', 'cercle'],
    ['triangle', 'triangle'], ['triangle', 'triangle', { triangle: 'rectangle' }], ['losange', 'losange'], ['parallelogramme', 'parallélogramme'],
    ['trapeze', 'trapèze'], ['polygone', 'hexagone'], ['polygone', 'pentagone', { cotes: 5 }], ['polygone', 'octogone', { cotes: 8 }],
    ['polygone', 'polygone à 7 côtés', { cotes: 7 }], ['polygone', 'polygone à 12 côtés', { cotes: 12 }], ['polygone', 'triangle', { cotes: 3 }],
    ['polygone', 'losange', { cotes: 4 }], ['etoile', 'étoile'], ['etoile', 'étoile à 8 branches', { branches: 8, creux: 0.6 }],
    ['etoile', 'étoile à 3 branches', { branches: 3, creux: 0.2 }], ['coeur', 'cœur'], ['fleche', 'flèche'], ['fleche', 'flèche', { sens: 'haut' }],
    ['fleche', 'flèche double', { pointe: 'double' }], ['fleche', 'flèche double', { pointe: 'double', sens: 'bas' }], ['croix', 'croix'],
    ['croix', 'croix', { bras: 0.6 }], ['anneau', 'anneau'], ['anneau', 'anneau', { epaisseurAnneau: 0.8 }],
    ['demi-cercle', 'demi-cercle', {}, 120, 60], ['demi-cercle', 'demi-ellipse'], ['demi-cercle', 'quart de cercle', { portion: 'quart' }, 80, 80],
    ['goutte', 'goutte'], ['lune', 'lune'], ['nuage', 'nuage'], ['etiquette', 'étiquette'], ['badge', 'badge festonné'],
    ['badge', 'badge festonné', { festons: 20 }], ['bulle', 'bulle de dialogue'], ['ligne', 'ligne'], ['arc', 'arc'], ['spirale', 'spirale'],
    ['spirale', 'spirale', { tours: 9 }], ['vague', 'vague'], ['vague', 'vague', { ondulations: 1 }]
  ];
  for (const [forme, nom, p = {}, l = 120, h = 80] of NOMS) {
    it(forme + ' ' + JSON.stringify(p) + ' : « ' + nom + ' »', () => {
      const f = posee(forme, 20, 30, l, h, p);
      expect(genreDeForme(f)).toBe(nom);
      // Deplacee et etiree, elle garde son nom (le carre et le cercle, eux, deviennent rectangle et ellipse).
      const d = deplacer(redimensionner({ ...VIDE, formes: [f] }, [f.id], { x: 5, y: 7, l: l * 1.7, h: h * 0.6 }), [f.id], 13, -4);
      const ETIRES: Readonly<Record<string, string>> = { 'carré': 'rectangle', cercle: 'ellipse', 'demi-cercle': 'demi-ellipse', 'quart de cercle': 'quart d’ellipse' };
      expect(genreDeForme(au(d.formes, 0))).toBe(ETIRES[nom] ?? nom);
    });
  }

  it('garde son nom apres ecriture au millieme et relecture', () => {
    const formes = FORMES_DE_BASE.map((forme, i) => ({ ...posee(forme, 10 + (i % 6) * 64, 10 + Math.floor(i / 6) * 52, 54, 42), id: 'f' + (i + 1) }));
    const dessin: DessinSvg = { vb: [0, 0, 400, 300], formes };
    const relu = lireDessin(ecrireDessin(dessin, 3));
    if ('erreur' in relu) throw new Error(relu.erreur);
    expect(relu.dessin.formes.map(genreDeForme)).toEqual(formes.map(genreDeForme));
    expect(relu.dessin.formes.find(f => genreDeForme(f) === 'anneau')?.regle).toBe('evenodd');
  });

  it('nomme un rectangle aux coins ronds lu dans un fichier, et ne prend pas un trace quelconque pour une forme de base', () => {
    const lu = lireDessin('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="80" height="40" rx="10"/><path d="M0 0C20 30 40 10 60 50L30 60Z"/></svg>');
    if ('erreur' in lu) throw new Error(lu.erreur);
    expect(lu.dessin.formes.map(genreDeForme)).toEqual(['rectangle arrondi', 'tracé courbe']);
  });
});

describe('Cricut (ADR-0028)', () => {
  it('propose « À écrire » pour la spirale, la vague et l arc, « À couper » pour une forme pleine', () => {
    for (const forme of ['spirale', 'vague', 'arc', 'ligne'] as const) expect(operationProposee(posee(forme), 'decoupe')).toBe('ecriture');
    for (const forme of ['coeur', 'anneau', 'nuage', 'etiquette'] as const) expect(operationProposee(posee(forme), 'decoupe')).toBe('decoupe');
  });
});
