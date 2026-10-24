import { describe, it, expect } from 'vitest';
import { lireDessin, modifier, type DessinSvg } from '../../../src/engine/editionSvg.js';
import {
  basculerDansSelection, boiteDeDeuxCoins, boiteRedimensionnee, centreVisible, choisissables, coinsPosables, coteMinimal, coteParDefaut, dansLePlan,
  deplacerReticule, directionDe, formeAuCurseur, formeVoisine, indicesDePoints, pasDeplacement, pasReticule, pointVoisin
} from '../../../src/engine/navigation.js';
import { au } from '../../../src/util/tableaux.js';

const dessin = (corps: string): DessinSvg => {
  const r = lireDessin(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">${corps}</svg>`);
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
const TROIS = dessin('<path d="M0 0h10v10z"/><path d="M20 0h10v10z"/><path d="M40 0h10v10z"/>');

describe('formeVoisine : la forme que Tab atteint', () => {
  it('avance vers le premier plan et recule vers le fond', () => {
    expect(formeVoisine(TROIS, ['f1'], 1, false)).toBe('f2');
    expect(formeVoisine(TROIS, ['f2'], 1, false)).toBe('f3');
    expect(formeVoisine(TROIS, ['f3'], -1, false)).toBe('f2');
  });

  it('rend null au-dela du dernier et avant le premier, pour que Tab puisse sortir', () => {
    expect(formeVoisine(TROIS, ['f3'], 1, false)).toBeNull();
    expect(formeVoisine(TROIS, ['f1'], -1, false)).toBeNull();
  });

  it('boucle quand on le demande', () => {
    expect(formeVoisine(TROIS, ['f3'], 1, true)).toBe('f1');
    expect(formeVoisine(TROIS, ['f1'], -1, true)).toBe('f3');
  });

  it('part du bout sans selection : la premiere vers l avant, la derniere vers l arriere', () => {
    expect(formeVoisine(TROIS, [], 1, false)).toBe('f1');
    expect(formeVoisine(TROIS, [], -1, false)).toBe('f3');
  });

  it('part du dernier choisi vers l avant et du premier vers l arriere pour une selection multiple', () => {
    expect(formeVoisine(TROIS, ['f1', 'f2'], 1, false)).toBe('f3');
    expect(formeVoisine(TROIS, ['f2', 'f3'], -1, false)).toBe('f1');
  });

  it('saute les formes masquees et verrouillees', () => {
    const d = modifier(modifier(TROIS, ['f2'], { visible: false }), ['f3'], { verrouille: true });
    expect(choisissables(d).map(f => f.id)).toEqual(['f1']);
    expect(formeVoisine(d, ['f1'], 1, false)).toBeNull();
    expect(formeVoisine(d, ['f1'], 1, true)).toBe('f1');
  });

  it('ne rend rien quand rien n est choisissable', () => {
    expect(formeVoisine({ vb: [0, 0, 10, 10], formes: [] }, [], 1, true)).toBeNull();
    expect(formeVoisine(modifier(TROIS, ['f1', 'f2', 'f3'], { visible: false }), [], 1, true)).toBeNull();
  });

  it('traite une selection devenue verrouillee comme une selection vide', () => {
    const d = modifier(TROIS, ['f2'], { verrouille: true });
    expect(formeVoisine(d, ['f2'], 1, false)).toBe('f1');
  });
});

describe('pointVoisin : le point que Tab atteint en mode points', () => {
  const chemin = au(dessin('<path d="M0 0L10 0L10 10Z"/>').formes, 0).d;

  it('ne compte pas la fermeture', () => {
    expect(indicesDePoints(chemin)).toEqual([0, 1, 2]);
  });

  it('entre par le premier point en avant, par le dernier en arriere', () => {
    expect(pointVoisin(chemin, null, 1)).toBe(0);
    expect(pointVoisin(chemin, null, -1)).toBe(2);
  });

  it('avance et recule, et sort aux bouts', () => {
    expect(pointVoisin(chemin, 0, 1)).toBe(1);
    expect(pointVoisin(chemin, 1, -1)).toBe(0);
    expect(pointVoisin(chemin, 2, 1)).toBeNull();
    expect(pointVoisin(chemin, 0, -1)).toBeNull();
  });

  it('repart d un bout quand le point actif n existe plus', () => {
    expect(pointVoisin(chemin, 3, 1)).toBe(0);
    expect(pointVoisin([], null, 1)).toBeNull();
  });
});

describe('les pas du clavier', () => {
  const vb = [0, 0, 200, 100] as const;

  it('pousse d un millieme du plus grand cote, dix fois avec Maj', () => {
    expect(pasDeplacement(vb, false)).toBe(0.2);
    expect(pasDeplacement(vb, true)).toBe(2);
    expect(coteMinimal(vb)).toBe(0.2);
  });

  it('agrandit a droite et en bas, reduit a gauche et en haut, le coin haut gauche fixe', () => {
    const b = { x: 10, y: 20, l: 50, h: 30 };
    expect(boiteRedimensionnee(b, 'droite', 5, 1)).toEqual({ x: 10, y: 20, l: 55, h: 30 });
    expect(boiteRedimensionnee(b, 'gauche', 5, 1)).toEqual({ x: 10, y: 20, l: 45, h: 30 });
    expect(boiteRedimensionnee(b, 'bas', 5, 1)).toEqual({ x: 10, y: 20, l: 50, h: 35 });
    expect(boiteRedimensionnee(b, 'haut', 5, 1)).toEqual({ x: 10, y: 20, l: 50, h: 25 });
  });

  it('ne descend pas sous le minimum et rend la meme boite quand rien ne change', () => {
    const b = { x: 0, y: 0, l: 1, h: 1 };
    expect(boiteRedimensionnee(b, 'gauche', 5, 1)).toBe(b);
    expect(boiteRedimensionnee({ ...b, l: 3 }, 'gauche', 5, 1).l).toBe(1);
  });

  it('lit les touches fleches', () => {
    expect(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a'].map(directionDe)).toEqual(['gauche', 'droite', 'haut', 'bas', null]);
  });
});

describe('le reticule des outils de trace', () => {
  const vb = [0, 0, 200, 100] as const;

  it('avance d un centieme du plan, d une case de grille si elle est la, dix fois plus avec Maj', () => {
    expect(pasReticule(vb, null, false)).toBe(2);
    expect(pasReticule(vb, null, true)).toBe(20);
    expect(pasReticule(vb, 5, false)).toBe(5);
    expect(pasReticule(vb, 5, true)).toBe(50);
  });

  it('se deplace et ne sort jamais du plan', () => {
    expect(deplacerReticule([10, 10], 'droite', 2, vb)).toEqual([12, 10]);
    expect(deplacerReticule([10, 10], 'haut', 20, vb)).toEqual([10, 0]);
    expect(deplacerReticule([199, 99], 'bas', 20, vb)).toEqual([199, 100]);
    expect(dansLePlan([-5, 500], vb)).toEqual([0, 100]);
  });

  it('suit un plan dont l origine n est pas zero', () => {
    expect(dansLePlan([0, 0], [10, 10, 50, 50])).toEqual([10, 10]);
  });

  it('apparait au centre de la partie visible, quel que soit le zoom', () => {
    expect(centreVisible({ zoom: 1, x: 0, y: 0 }, 400, 200)).toEqual([200, 100]);
    expect(centreVisible({ zoom: 2, x: -100, y: 0 }, 400, 200)).toEqual([150, 50]);
  });

  it('pose des formes du quart du plus petit cote', () => {
    expect(coteParDefaut(vb)).toBe(25);
  });
});

describe('les deux coins d une forme posee au clavier', () => {
  it('veut de la largeur et de la hauteur pour une surface, de la longueur pour une ligne', () => {
    expect(coinsPosables(false, [10, 10], [30, 30], 0.2)).toBe(true);
    expect(coinsPosables(false, [10, 10], [30, 10], 0.2)).toBe(false);
    expect(coinsPosables(false, [10, 10], [10, 30], 0.2)).toBe(false);
    expect(coinsPosables(false, [10, 10], [10.1, 30], 0.2)).toBe(false);
    expect(coinsPosables(true, [10, 10], [30, 10], 0.2)).toBe(true);
    expect(coinsPosables(true, [10, 10], [10, 10], 0.2)).toBe(false);
  });

  it('dessine la meme boite dans les deux sens', () => {
    expect(boiteDeDeuxCoins([10, 20], [40, 30])).toEqual({ x: 10, y: 20, l: 30, h: 10 });
    expect(boiteDeDeuxCoins([40, 30], [10, 20])).toEqual({ x: 10, y: 20, l: 30, h: 10 });
  });
});

describe('le curseur de la selection au clavier', () => {
  const sel = ['f1', 'f2'];

  it('est la derniere forme choisie quand rien d autre n est pose', () => {
    expect(formeAuCurseur(TROIS, sel, null)).toBe('f2');
    expect(formeAuCurseur(TROIS, [], null)).toBeNull();
  });

  it('suit le curseur pose pour CETTE selection, et l oublie des que la selection est un autre tableau', () => {
    expect(formeAuCurseur(TROIS, sel, { id: 'f3', sel })).toBe('f3');
    expect(formeAuCurseur(TROIS, [...sel], { id: 'f3', sel })).toBe('f2');
  });

  it('oublie un curseur sur une forme masquee ou verrouillee', () => {
    expect(formeAuCurseur(modifier(TROIS, ['f3'], { visible: false }), sel, { id: 'f3', sel })).toBe('f2');
    expect(formeAuCurseur(modifier(TROIS, ['f3'], { verrouille: true }), sel, { id: 'f3', sel })).toBe('f2');
  });

  it('bascule une forme : elle entre si elle n y etait pas, elle sort sinon', () => {
    expect(basculerDansSelection(['f1'], 'f3')).toEqual({ sel: ['f1', 'f3'], ajoutee: true });
    expect(basculerDansSelection(['f1', 'f3'], 'f1')).toEqual({ sel: ['f3'], ajoutee: false });
    expect(basculerDansSelection(['f1'], 'f1')).toEqual({ sel: [], ajoutee: false });
  });
});
