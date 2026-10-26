import { describe, it, expect } from 'vitest';
import { IDENTITE, lireDessin, type DessinSvg, type Forme } from '../../../src/engine/editionSvg.js';
import {
  candidates, CIBLE_DOIGT, CIBLE_SOURIS, formeDessous, formeSousPoint, optionsPrise, ordonner, TOLERANCE_DOIGT, TOLERANCE_SOURIS, zoneDePrise, type Candidate
} from '../../../src/engine/prise.js';
import { au } from '../../../src/util/tableaux.js';

const dessin = (corps: string): DessinSvg => {
  const r = lireDessin(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">${corps}</svg>`);
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
const souris = (zoom = 1) => optionsPrise(zoom, false);
const doigt = (zoom = 1) => optionsPrise(zoom, true);
const prise = (d: DessinSvg, x: number, y: number, o = souris()) => formeSousPoint(d.formes, x, y, o);
const ids = (d: DessinSvg, x: number, y: number, o = souris()) => candidates(d.formes, x, y, o).map(c => c.id);

const TRAIT = dessin('<path d="M40 40L360 40" fill="none" stroke="#000" stroke-width="1"/>');

describe('prise : un trait fin', () => {
  it('se prend a quelques pixels, pas au-dela de la tolerance', () => {
    expect(prise(TRAIT, 200, 40)).toBe('f1');
    expect(prise(TRAIT, 200, 44)).toBe('f1');
    // 0,5 de demi-epaisseur + 6 px de tolerance au zoom 1.
    expect(prise(TRAIT, 200, 46.4)).toBe('f1');
    expect(prise(TRAIT, 200, 46.6)).toBeNull();
    expect(prise(TRAIT, 200, 60)).toBeNull();
    // Au-dela des bouts, la distance est celle du bout.
    expect(prise(TRAIT, 364, 40)).toBe('f1');
    expect(prise(TRAIT, 368, 40)).toBeNull();
  });

  it('garde la meme tolerance a l ecran quel que soit le zoom', () => {
    for (const zoom of [0.1, 0.25, 1, 4, 32]) {
      // 4 px d'ecran au-dessous du trait, puis 9 px : convertis en unites du plan par le zoom.
      expect(prise(TRAIT, 200, 40 + 0.5 + 4 / zoom, souris(zoom)), 'zoom ' + zoom).toBe('f1');
      expect(prise(TRAIT, 200, 40 + 0.5 + 9 / zoom, souris(zoom)), 'zoom ' + zoom).toBeNull();
    }
  });

  it('est plus tolerant au doigt', () => {
    expect(TOLERANCE_DOIGT).toBeGreaterThan(TOLERANCE_SOURIS);
    expect(CIBLE_DOIGT).toBeGreaterThan(CIBLE_SOURIS);
    expect(prise(TRAIT, 200, 49, souris())).toBeNull();
    expect(prise(TRAIT, 200, 49, doigt())).toBe('f1');
  });

  it('compte l epaisseur du trait : sur son encre, l ecart est nul', () => {
    const epais = dessin('<path d="M40 40L360 40" fill="none" stroke="#000" stroke-width="20"/>');
    const [c] = candidates(epais.formes, 200, 49, souris());
    expect(c).toMatchObject({ id: 'f1', dedans: true, ecart: 0 });
    expect(prise(epais, 200, 55.9)).toBe('f1');
    expect(prise(epais, 200, 56.1)).toBeNull();
  });

  it('suit les courbes, pas leurs points de controle', () => {
    const arc = dessin('<path d="M0 100C0 0 200 0 200 100" fill="none" stroke="#000" stroke-width="1"/>');
    // Le sommet de la courbe est a y = 25 (et non 0, ou sont les points de controle).
    expect(prise(arc, 100, 25)).toBe('f1');
    expect(prise(arc, 100, 5)).toBeNull();
  });
});

describe('prise : surface et regle de remplissage', () => {
  const CONTOUR = dessin('<rect x="40" y="90" width="120" height="80" fill="none" stroke="#c81e28" stroke-width="1"/>');
  const PLEIN = dessin('<rect x="40" y="90" width="120" height="80" fill="#1428a0"/>');

  it('prend une forme sans remplissage sur son trait seulement, pas en son milieu', () => {
    expect(prise(CONTOUR, 43, 130)).toBe('f1');
    expect(prise(CONTOUR, 37, 130)).toBe('f1');
    expect(prise(CONTOUR, 100, 130)).toBeNull();
  });

  it('prend une forme remplie sur sa surface et pres de son bord', () => {
    expect(prise(PLEIN, 100, 130)).toBe('f1');
    expect(prise(PLEIN, 35, 130)).toBe('f1');
    expect(prise(PLEIN, 30, 130)).toBeNull();
    const [dedans] = candidates(PLEIN.formes, 100, 130, souris()), [pres] = candidates(PLEIN.formes, 35, 130, souris());
    expect(dedans).toMatchObject({ dedans: true, ecart: 0 });
    expect(pres?.dedans).toBe(false);
    expect(pres?.ecart).toBeCloseTo(5, 6);
  });

  it('respecte evenodd : le trou d un anneau ne se prend pas, sauf pres de son bord', () => {
    const anneau = dessin('<path fill-rule="evenodd" fill="#000" d="M0 0H200V200H0Z M50 50H150V150H50Z"/>');
    expect(prise(anneau, 20, 100)).toBe('f1');
    expect(prise(anneau, 100, 100)).toBeNull();
    expect(prise(anneau, 55, 100)).toBe('f1');
  });

  it('respecte nonzero : deux sous-chemins de meme sens remplissent le milieu', () => {
    const plein = dessin('<path fill="#000" d="M0 0H200V200H0Z M50 50H150V150H50Z"/>');
    expect(prise(plein, 100, 100)).toBe('f1');
    // De sens oppose, le milieu est vide meme en nonzero.
    const troue = dessin('<path fill="#000" d="M0 0H200V200H0Z M50 50V150H150V50Z"/>');
    expect(prise(troue, 100, 100)).toBeNull();
  });

  it('prend toute forme par sa surface en vue contours', () => {
    expect(prise(CONTOUR, 100, 130, optionsPrise(1, false, true))).toBe('f1');
  });
});

describe('prise : un texte vivant se prend sur sa boite', () => {
  // Deux « lettres » eloignees : le blanc entre elles est loin de toute encre.
  const chemin = au(dessin('<path fill="#000" d="M0 0H10V40H0Z M90 0H100V40H90Z"/>').formes, 0);
  const lettres: Forme = {
    ...chemin,
    texte: { texte: 'I  I', police: { id: 'inter' }, taille: 40, interlettrage: 0, interligne: 1.2, alignement: 'gauche', ligatures: false, matrice: IDENTITE }
  };
  const d: DessinSvg = { vb: [0, 0, 400, 300], formes: [lettres] };

  it('entre les lettres aussi', () => {
    expect(prise(d, 50, 20)).toBe('f1');
    // Le meme chemin sans texte vivant ne se prend pas au milieu.
    expect(prise({ ...d, formes: [chemin] }, 50, 20)).toBeNull();
  });

  it('et pres de sa boite, avec la tolerance', () => {
    expect(prise(d, 50, 44)).toBe('f1');
    expect(prise(d, 50, 50)).toBeNull();
  });

  it('montre sa boite comme lisere', () => {
    expect(zoneDePrise(lettres, souris())).toEqual({ x: 0, y: 0, l: 100, h: 40 });
  });
});

describe('prise : une petite forme a une cible minimale', () => {
  const PETITE = dessin('<rect x="0" y="0" width="300" height="300" fill="#ddd"/><rect x="100" y="100" width="2" height="2" fill="#000"/>');

  it('se prend dans sa boite gonflee jusqu a la cible, meme posee sur une surface', () => {
    // Le centre est (101, 101) ; la cible de 12 px au zoom 1 va de 95 a 107.
    expect(prise(PETITE, 106, 101)).toBe('f2');
    expect(prise(PETITE, 106, 106)).toBe('f2');
    // Hors de la cible, mais a portee de tolerance de la petite forme : la surface du fond l'emporte (la petite forme n'est pas un filet).
    expect(prise(PETITE, 108, 101)).toBe('f1');
  });

  it('a une cible qui suit le zoom a l ecran', () => {
    // Au zoom 4, la forme fait 8 px : la cible de 12 px va de 99,5 a 102,5 dans le plan.
    expect(prise(PETITE, 102.4, 101, souris(4))).toBe('f2');
    expect(prise(PETITE, 103, 101, souris(4))).toBe('f1');
    // Au zoom 10, elle fait 20 px : plus de cible gonflee, sa surface suffit.
    expect(zoneDePrise(au(PETITE.formes, 1), souris(10))).toBeNull();
    expect(zoneDePrise(au(PETITE.formes, 1), souris(1))).toEqual({ x: 95, y: 95, l: 12, h: 12 });
  });
});

describe('prise : plusieurs candidates', () => {
  const EMPILEES = dessin(
    '<rect x="0" y="0" width="200" height="100" fill="#1428a0"/>'
    + '<rect x="0" y="0" width="200" height="100" fill="#c81e28"/>'
    + '<rect x="250" y="0" width="100" height="100" fill="#00aa00"/>'
    + '<path d="M0 200H400" fill="none" stroke="#000" stroke-width="1"/>'
    + '<path d="M0 204H400" fill="none" stroke="#000" stroke-width="1"/>'
  );

  it('la plus haute dont la surface contient le point gagne', () => {
    expect(ids(EMPILEES, 100, 50)).toEqual(['f2', 'f1']);
  });

  it('sans surface sous le point, la plus proche gagne', () => {
    // Entre les deux traits, plus pres du premier.
    expect(ids(EMPILEES, 100, 201)).toEqual(['f4', 'f5']);
    expect(ids(EMPILEES, 100, 203.5)).toEqual(['f5', 'f4']);
    // Entre les deux rectangles : a 4 du rouge, a 46 du vert (hors tolerance).
    expect(ids(EMPILEES, 204, 50)).toEqual(['f2', 'f1']);
  });

  it('un filet au-dessus d une surface et a portee passe devant elle', () => {
    const filet = dessin('<rect x="0" y="0" width="200" height="200" fill="#ddd"/><path d="M0 100H200" fill="none" stroke="#000" stroke-width="1"/>');
    expect(ids(filet, 50, 104)).toEqual(['f2', 'f1']);
    // Hors de portee, la surface.
    expect(ids(filet, 50, 120)).toEqual(['f1']);
    // Une forme remplie au-dessus ne passe devant que par sa surface.
    const voisins = dessin('<rect x="0" y="0" width="100" height="100" fill="#ddd"/><rect x="104" y="0" width="100" height="100" fill="#000"/>');
    expect(ids(voisins, 101, 50)).toEqual(['f1', 'f2']);
  });

  it('ordonne sans dependre de l ordre d arrivee', () => {
    const c = (id: string, rang: number, dedans: boolean, ecart: number, filet = false): Candidate => ({ id, rang, dedans, ecart, filet });
    const melange = [c('a', 0, true, 0), c('b', 3, false, 2, true), c('c', 2, true, 0), c('d', 1, false, 1)];
    expect(ordonner(melange).map(x => x.id)).toEqual(['b', 'c', 'a', 'd']);
    expect(ordonner([...melange].reverse()).map(x => x.id)).toEqual(['b', 'c', 'a', 'd']);
  });
});

describe('prise : Alt+clic passe a la forme du dessous', () => {
  it('tourne en boucle depuis la forme choisie', () => {
    const liste = ['f3', 'f2', 'f1'];
    expect(formeDessous(liste, ['f3'])).toBe('f2');
    expect(formeDessous(liste, ['f2'])).toBe('f1');
    expect(formeDessous(liste, ['f1'])).toBe('f3');
  });

  it('prend la deuxieme quand aucune candidate n est choisie, et rien sans candidate', () => {
    expect(formeDessous(['f3', 'f2'], [])).toBe('f2');
    expect(formeDessous(['f3', 'f2'], ['f9'])).toBe('f2');
    expect(formeDessous(['f3'], [])).toBe('f3');
    expect(formeDessous([], ['f1'])).toBeNull();
  });
});

describe('prise : formes ecartees', () => {
  it('ignore une forme verrouillee ou masquee : le clic passe dessous', () => {
    const d = dessin('<rect x="0" y="0" width="100" height="100" fill="#ddd"/><rect x="0" y="0" width="100" height="100" fill="#000"/>');
    const [f1, f2] = d.formes;
    if (!f1 || !f2) throw new Error('deux formes');
    expect(prise({ ...d, formes: [f1, { ...f2, verrouille: true }] }, 50, 50)).toBe('f1');
    expect(prise({ ...d, formes: [f1, { ...f2, visible: false }] }, 50, 50)).toBe('f1');
    expect(prise({ ...d, formes: [{ ...f1, verrouille: true }, { ...f2, verrouille: true }] }, 50, 50)).toBeNull();
  });

  it('ne rend rien sans zoom valable ni forme', () => {
    expect(candidates(TRAIT.formes, 200, 40, { zoom: 0, tolerance: 6, cible: 12 })).toEqual([]);
    expect(candidates([], 0, 0, souris())).toEqual([]);
  });
});

describe('prise : un gros dessin', () => {
  it('cherche parmi 5 000 formes en bien moins d une image', () => {
    let corps = '';
    for (let i = 0; i < 5000; i++) {
      const x = (i % 100) * 4, y = Math.floor(i / 100) * 6;
      corps += i % 2 ? `<rect x="${x}" y="${y}" width="3" height="3" fill="#123456"/>` : `<path d="M${x} ${y}C${x + 1} ${y + 3} ${x + 2} ${y - 3} ${x + 3} ${y}" fill="none" stroke="#000" stroke-width="0.2"/>`;
    }
    const d = dessin(corps);
    expect(d.formes).toHaveLength(5000);
    const o = souris(2);
    // Le premier passage range les boites ; les suivants ne font que chercher.
    candidates(d.formes, 10, 10, o);
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) candidates(d.formes, (i * 37) % 400, (i * 53) % 300, o);
    const parSurvol = (performance.now() - t0) / 1000;
    console.log(`prise, 5 000 formes : ${(parSurvol * 1000).toFixed(0)} µs par survol`);
    expect(parSurvol).toBeLessThan(2);
  });
});
