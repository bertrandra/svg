import { describe, it, expect } from 'vitest';
import { IDENTITE, lireDessin, modifier, type DessinSvg, type Forme } from '../../../src/engine/editionSvg.js';
import { poserOperation } from '../../../src/engine/preparation.js';
import {
  appliquerZone, formePrise, formesDansZone, formesParOperation, inverserSelection, memeContour, memeFond, memeType, pointLasso, rectangleDe,
  toutesChoisissables, typeDeForme, type OptionsZone, type Zone
} from '../../../src/engine/selection.js';
import { au } from '../../../src/util/tableaux.js';

const dessin = (corps: string): DessinSvg => {
  const r = lireDessin(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">${corps}</svg>`);
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
const TOUCHE: OptionsZone = { regle: 'touche' }, DEDANS: OptionsZone = { regle: 'dedans' };
const cadre = (x: number, y: number, l: number, h: number): Zone => ({ rect: { x, y, l, h } });
const pris = (d: DessinSvg, z: Zone, o = TOUCHE) => formesDansZone(d.formes, z, o);

/** Un anneau plein : un carre de 60 a 180 perce d'un trou de 80 a 160 (evenodd), et le meme en nonzero, trou dessine a l'envers. */
const ANNEAU = dessin('<path d="M60 60H180V180H60Z M80 80V160H160V80Z" fill="#1428a0" fill-rule="evenodd"/>');
const ANNEAU_NONZERO = dessin('<path d="M60 60H180V180H60Z M80 80V160H160V80Z" fill="#1428a0"/>');
const DIAGONALE = dessin('<path d="M220 40L380 200" fill="none" stroke="#000" stroke-width="2"/>');

describe('selection par zone : la regle « touchee » suit le trace reel', () => {
  it('un anneau dont seul le trou est couvert n est pas pris ; sa couronne, si', () => {
    expect(pris(ANNEAU, cadre(95, 95, 50, 50))).toEqual([]);
    expect(pris(ANNEAU, cadre(70, 95, 20, 20))).toEqual(['f1']);
    // Le trou d'un tracé nonzero dont le sous-chemin interieur tourne a l'envers est vide aussi.
    expect(pris(ANNEAU_NONZERO, cadre(95, 95, 50, 50))).toEqual([]);
    // Un cadre plus grand que le trou, qui mord sur la couronne : pris.
    expect(pris(ANNEAU, cadre(75, 95, 50, 50))).toEqual(['f1']);
  });

  it('une diagonale n est prise que si le cadre touche son trait, pas le coin vide de sa boite', () => {
    expect(pris(DIAGONALE, cadre(330, 50, 40, 40))).toEqual([]);
    expect(pris(DIAGONALE, cadre(290, 100, 20, 20))).toEqual(['f1']);
    // Le cadre a 1,5 du trait (demi-epaisseur 1) : pas pris ; a 0,5 : son encre est touchee.
    const d = 1 / Math.SQRT2;
    expect(pris(DIAGONALE, cadre(300 + 1.5 * d, 120 - 1.5 * d - 10, 10, 10))).toEqual([]);
    expect(pris(DIAGONALE, cadre(300 + 0.5 * d, 120 - 0.5 * d - 10, 10, 10))).toEqual(['f1']);
  });

  it('une courbe qui frole le cadre sans le toucher n est pas prise, ses points de controle ne comptent pas', () => {
    const arc = dessin('<path d="M0 100C0 0 200 0 200 100" fill="none" stroke="#000" stroke-width="1"/>');
    // Le sommet de la courbe est a y = 25 : un cadre de 0 a 24 est au-dessus (24,5 avec la demi-epaisseur), un de 0 a 24,6 la touche.
    expect(pris(arc, cadre(90, 0, 20, 24))).toEqual([]);
    expect(pris(arc, cadre(90, 0, 20, 24.6))).toEqual(['f1']);
    // Sous l'arc, au milieu de sa boite : vide (aucun remplissage).
    expect(pris(arc, cadre(80, 60, 40, 30))).toEqual([]);
  });

  it('compte l epaisseur du trait visible', () => {
    const epais = dessin('<path d="M40 40L360 40" fill="none" stroke="#000" stroke-width="20"/>');
    expect(pris(epais, cadre(100, 49, 10, 10))).toEqual(['f1']);
    expect(pris(epais, cadre(100, 51, 10, 10))).toEqual([]);
    // Au bout du trait (bout plat), la demi-epaisseur compte aussi : la meme limite que le clic.
    expect(pris(epais, cadre(369, 30, 10, 10))).toEqual(['f1']);
    expect(pris(epais, cadre(371, 30, 10, 10))).toEqual([]);
  });

  it('prend une forme entierement contenue, et une forme a moitie couverte', () => {
    const d = dessin('<rect x="100" y="100" width="40" height="40" fill="#c81e28"/>');
    expect(pris(d, cadre(50, 50, 200, 200))).toEqual(['f1']);
    expect(pris(d, cadre(120, 120, 100, 100))).toEqual(['f1']);
    expect(pris(d, cadre(141, 141, 100, 100))).toEqual([]);
  });

  it('prend une surface qui contient tout le cadre, selon sa regle de remplissage', () => {
    const fond = dessin('<rect x="0" y="0" width="400" height="300" fill="#dddddd"/>');
    expect(pris(fond, cadre(100, 100, 10, 10))).toEqual(['f1']);
    // Un contour seul (sans fond) ne contient rien : le cadre au milieu ne le touche pas.
    const contour = dessin('<rect x="0" y="0" width="400" height="300" fill="none" stroke="#000" stroke-width="4"/>');
    expect(pris(contour, cadre(100, 100, 10, 10))).toEqual([]);
    expect(pris(contour, cadre(1, 100, 10, 10))).toEqual(['f1']);
  });

  it('en vue contours, chaque forme se prend par sa surface et son trait n a plus d epaisseur', () => {
    const contour = dessin('<rect x="0" y="0" width="400" height="300" fill="none" stroke="#000" stroke-width="40"/>');
    expect(pris(contour, cadre(100, 100, 10, 10), { regle: 'touche', contours: true })).toEqual(['f1']);
    expect(pris(dessin('<path d="M40 40L360 40" fill="none" stroke="#000" stroke-width="20"/>'), cadre(100, 45, 10, 10), { regle: 'touche', contours: true })).toEqual([]);
  });

  it('prend un texte vivant libre par sa boite, entre ses lettres aussi', () => {
    const chemin = au(dessin('<path fill="#000" d="M0 0H10V40H0Z M90 0H100V40H90Z"/>').formes, 0);
    const lettres: Forme = { ...chemin, texte: { texte: 'I  I', police: { id: 'inter' }, taille: 40, interlettrage: 0, interligne: 1.2, alignement: 'gauche', ligatures: false, matrice: IDENTITE } };
    const z = cadre(40, 10, 20, 20);
    expect(formePrise(lettres, z, TOUCHE)).toBe(true);
    expect(formePrise(chemin, z, TOUCHE)).toBe(false);
  });
});

describe('selection par zone : la regle « dedans »', () => {
  const d = dessin('<rect x="100" y="100" width="40" height="40" fill="#c81e28" stroke="#000" stroke-width="10"/>');

  it('ne prend que ce qui est entierement dans le cadre, trait compris', () => {
    expect(pris(d, cadre(120, 120, 100, 100), DEDANS)).toEqual([]);
    expect(pris(d, cadre(120, 120, 100, 100), TOUCHE)).toEqual(['f1']);
    expect(pris(d, cadre(96, 96, 48, 48), DEDANS)).toEqual([]);
    expect(pris(d, cadre(95, 95, 50, 50), DEDANS)).toEqual(['f1']);
  });

  it('dans un lasso aussi : chaque point, chaque arete et le trait', () => {
    const lasso = (pts: [number, number][]): Zone => ({ lasso: pts });
    const losange = lasso([[120, 40], [200, 120], [120, 200], [40, 120]]);
    // Le carre (95..145 avec le trait) tient dans le losange (|x - 120| + |y - 120| <= 80 : un coin du carre est a 50, et 70 trait compris).
    expect(pris(d, losange, DEDANS)).toEqual(['f1']);
    // Plus etroit : les sommets du carre y sont (a 40 du centre, le lasso a 44), pas les coins arrondis de son trait (a 2,8 du bord).
    const etroit = lasso([[120, 76], [164, 120], [120, 164], [76, 120]]);
    expect(pris(d, etroit, DEDANS)).toEqual([]);
    expect(pris(d, etroit, TOUCHE)).toEqual(['f1']);
  });
});

describe('selection par zone : le lasso', () => {
  const lasso = (pts: [number, number][]): Zone => ({ lasso: pts });

  it('prend ce que son polygone touche, pas ce que sa boite seule couvre', () => {
    const d = dessin('<rect x="10" y="10" width="20" height="20" fill="#000"/><rect x="170" y="10" width="20" height="20" fill="#000"/><rect x="90" y="170" width="20" height="20" fill="#000"/>');
    // Un triangle pointe en bas : sa boite couvre les quatre coins, son polygone ne touche que le carre du milieu bas.
    const triangle = lasso([[60, 0], [140, 0], [100, 200]]);
    expect(pris(d, triangle)).toEqual(['f3']);
  });

  it('ne prend pas un anneau dont il ne couvre que le trou, et prend la surface qui le contient', () => {
    expect(pris(ANNEAU, lasso([[100, 90], [150, 120], [100, 150]]))).toEqual([]);
    expect(pris(ANNEAU, lasso([[62, 70], [78, 120], [62, 170]]))).toEqual(['f1']);
  });

  it('une boucle qui se recoupe reste pleine (nonzero)', () => {
    // Une etoile a cinq branches tracee d'un seul trait : son coeur, enroule deux fois, est dans le lasso (vide en evenodd).
    const etoile = lasso(Array.from({ length: 5 }, (_, i) => [200 + 100 * Math.sin(i * 4 * Math.PI / 5), 150 - 100 * Math.cos(i * 4 * Math.PI / 5)] as [number, number]));
    expect(pris(dessin('<rect x="198" y="148" width="4" height="4" fill="#000"/>'), etoile)).toEqual(['f1']);
    expect(pris(dessin('<rect x="198" y="148" width="4" height="4" fill="#000"/>'), etoile, DEDANS)).toEqual(['f1']);
    // Entre deux branches, hors de l'etoile mais dans sa boite : rien.
    expect(pris(dessin('<rect x="198" y="230" width="4" height="4" fill="#000"/>'), etoile)).toEqual([]);
  });

  it('n accepte pas moins de trois points, et espace ses points', () => {
    expect(pris(ANNEAU, lasso([[0, 0], [400, 300]]))).toEqual([]);
    expect(pointLasso([[0, 0]], [1, 1], 2)).toBeNull();
    expect(pointLasso([[0, 0]], [3, 0], 2)).toEqual([3, 0]);
    expect(pointLasso([], [3, 0], 2)).toEqual([3, 0]);
  });
});

describe('selection par zone : ce qui ne se prend jamais, et les effets', () => {
  it('ignore une forme verrouillee ou masquee', () => {
    const d = dessin('<rect x="0" y="0" width="100" height="100" fill="#000"/><rect x="0" y="0" width="100" height="100" fill="#111"/><rect x="0" y="0" width="100" height="100" fill="#222"/>');
    const d2 = modifier(modifier(d, ['f1'], { verrouille: true }), ['f2'], { visible: false });
    expect(pris(d2, cadre(10, 10, 10, 10))).toEqual(['f3']);
    expect(pris(d2, cadre(-10, -10, 200, 200), DEDANS)).toEqual(['f3']);
    expect(formePrise(au(d2.formes, 0), cadre(10, 10, 10, 10), TOUCHE)).toBe(false);
  });

  it('remplace, ajoute ou retire', () => {
    expect(appliquerZone(['a', 'b'], ['c', 'b'], 'remplacer')).toEqual(['c', 'b']);
    expect(appliquerZone(['a', 'b'], ['c', 'b'], 'ajouter')).toEqual(['a', 'b', 'c']);
    expect(appliquerZone(['a', 'b'], ['c', 'b'], 'retirer')).toEqual(['a']);
    expect(rectangleDe([10, 20], [0, 5])).toEqual({ x: 0, y: 5, l: 10, h: 15 });
  });

  it('ne prend rien d une zone vide ou invalide', () => {
    expect(pris(ANNEAU, cadre(NaN, 0, 10, 10))).toEqual([]);
    expect(pris(ANNEAU, cadre(0, 0, -1, 10))).toEqual([]);
    // Un cadre de surface nulle prend encore ce qu'il touche (une ligne qui passe la couronne).
    expect(pris(ANNEAU, cadre(70, 0, 0, 300))).toEqual(['f1']);
  });
});

describe('les selections du menu Edition', () => {
  const d = modifier(dessin(
    '<rect x="0" y="0" width="10" height="10" fill="#ff0000" stroke="#000000"/>'
    + '<rect x="20" y="0" width="10" height="10" fill="#ff0000"/>'
    + '<path d="M0 50L100 50" fill="none" stroke="#000000"/>'
    + '<rect x="40" y="0" width="10" height="10" fill="#00ff00" stroke="#0000ff"/>'
    + '<rect x="60" y="0" width="10" height="10" fill="#ff0000"/>'
  ), ['f5'], { verrouille: true });

  it('tout, et l inverse de la selection, sans les formes verrouillees ou masquees', () => {
    expect(toutesChoisissables(d)).toEqual(['f1', 'f2', 'f3', 'f4']);
    expect(inverserSelection(d, ['f1', 'f3'])).toEqual(['f2', 'f4']);
    expect(inverserSelection(d, [])).toEqual(['f1', 'f2', 'f3', 'f4']);
  });

  it('la meme couleur de fond, de contour, le meme type', () => {
    expect(memeFond(d, ['f1'])).toEqual({ valeurs: ['#ff0000'], ids: ['f1', 'f2'] });
    expect(memeContour(d, ['f1'])).toEqual({ valeurs: ['#000000'], ids: ['f1', 'f3'] });
    // Une forme sans fond n'a pas de fond a retrouver.
    expect(memeFond(d, ['f3'])).toEqual({ valeurs: [], ids: [] });
    // Plusieurs modeles : l'union de leurs valeurs.
    expect(memeContour(d, ['f3', 'f4']).ids).toEqual(['f1', 'f3', 'f4']);
    expect(memeType(d, ['f3'])).toEqual({ valeurs: ['trait'], ids: ['f3'] });
    expect(memeType(d, ['f2']).ids).toEqual(['f1', 'f2', 'f4']);
    expect(typeDeForme(au(d.formes, 2))).toBe('trait');
  });

  it('a couper et a ecrire, selon l operation de chaque forme (ADR-0028)', () => {
    expect(formesParOperation(d, 'decoupe', 'decoupe')).toEqual(['f1', 'f2', 'f4']);
    expect(formesParOperation(d, 'decoupe', 'ecriture')).toEqual(['f3']);
    const choisi = poserOperation(d, ['f1'], 'ecriture', 'decoupe').dessin;
    expect(formesParOperation(choisi, 'decoupe', 'ecriture')).toEqual(['f1', 'f3']);
    expect(formesParOperation(d, 'dessin-stylo', 'ecriture')).toEqual(['f1', 'f2', 'f3', 'f4']);
  });
});

describe('selection par zone : un gros dessin', () => {
  it('prend parmi 5 000 formes en bien moins d une image', () => {
    let corps = '';
    for (let i = 0; i < 5000; i++) {
      const x = (i % 100) * 4, y = Math.floor(i / 100) * 6;
      corps += i % 3 === 0 ? `<rect x="${x}" y="${y}" width="3" height="3" fill="#123456"/>`
        : i % 3 === 1 ? `<path d="M${x} ${y}C${x + 1} ${y + 3} ${x + 2} ${y - 3} ${x + 3} ${y}" fill="none" stroke="#000" stroke-width="0.2"/>`
          : `<circle cx="${x + 1.5}" cy="${y + 1.5}" r="1.4" fill="none" stroke="#000" stroke-width="0.3"/>`;
    }
    const d = dessin(corps);
    expect(d.formes).toHaveLength(5000);
    // Le premier passage range les boites et aplatit les traces ; les suivants ne font que chercher, comme pendant un glisser.
    pris(d, cadre(0, 0, 400, 300));
    const cadres = Array.from({ length: 200 }, (_, i) => cadre((i * 37) % 300, (i * 53) % 200, 40 + (i % 60), 30 + (i % 70)));
    const t0 = performance.now();
    let n = 0;
    for (const z of cadres) n += pris(d, z).length;
    const parCadre = (performance.now() - t0) / cadres.length;
    const tout0 = performance.now();
    const tout = pris(d, cadre(1, 1, 398, 298));
    const parTout = performance.now() - tout0;
    // Un lasso de 200 points (un cercle) sur la moitie du dessin.
    const cercle: Zone = { lasso: Array.from({ length: 200 }, (_, i) => [200 + 100 * Math.cos(i * Math.PI / 100), 150 + 100 * Math.sin(i * Math.PI / 100)] as [number, number]) };
    for (let k = 0; k < 3; k++) pris(d, cercle);
    const l0 = performance.now();
    let dansCercle: string[] = [];
    for (let k = 0; k < 10; k++) dansCercle = pris(d, cercle);
    const parLasso = (performance.now() - l0) / 10;
    console.log(`selection, 5 000 formes : ${parCadre.toFixed(2)} ms par cadre moyen (${(n / cadres.length).toFixed(0)} formes prises), ${parTout.toFixed(2)} ms pour un cadre presque entier (${tout.length}), ${parLasso.toFixed(2)} ms par lasso de 200 points (${dansCercle.length})`);
    // Une marge large (environ 25 fois la mesure au calme) : un runner charge ne doit pas faire echouer le test, une regression d un ordre de grandeur si.
    expect(parCadre).toBeLessThan(16);
    expect(parLasso).toBeLessThan(80);
  });
});
