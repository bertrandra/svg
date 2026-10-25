import { describe, expect, it, vi } from 'vitest';
import { lireDessin, STYLE_DEFAUT, typeDeNoeud, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { historique, type Historique } from '../../../src/util/historique.js';
import { creerActions, type EtatDuMoment, type Setters } from '../../../src/zones/creerActions.js';
import { au } from '../../../src/util/tableaux.js';

const svg = (corps: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${corps}</svg>`;

/** Un editeur sans React : un etat qu'on tient a la main, des setters qui le mettent a jour. */
function monter(corps: string) {
  const lu = lireDessin(svg(corps));
  if ('erreur' in lu) throw new Error(lu.erreur);
  let h: Historique<DessinSvg> = historique(lu.dessin);
  const messages: string[] = [];
  const etat: EtatDuMoment = {
    dessin: lu.dessin, sel: [], formeSeule: null, outil: 'selection', point: null, style: STYLE_DEFAUT, trace: [], presse: [], lisserBooleens: true,
    vues: { vue: { zoom: 1, x: 0, y: 0 }, poserVue: vi.fn(), ajuster: vi.fn(), zoomer: vi.fn(), centrer100: vi.fn(), cadrer: vi.fn() },
    enregistrer: vi.fn(), production: { contexte: 'generique' }, modifie: false, refaisable: false, versions: [], fermer: vi.fn(), stockage: null,
    productionModifiee: false, fin: { libelle: 'Enregistrer', fermerSansModification: false, brouillon: false }, suiteCricut: null, apercuMachine: true
  };
  const majour = () => { etat.dessin = h.present; etat.modifie = h.passe.length > 0; if (etat.sel.length === 1) etat.formeSeule = etat.dessin.formes.find(f => f.id === etat.sel[0]) ?? null; };
  const setters: Setters = {
    poserH: u => { h = typeof u === 'function' ? u(h) : u; majour(); },
    choisir: u => { etat.sel = typeof u === 'function' ? u(etat.sel) : u; majour(); },
    poserOutilBrut: vi.fn(), poserPoint: u => { etat.point = typeof u === 'function' ? u(etat.point) : u; }, poserStyle: vi.fn(), poserTrace: vi.fn(), poserPresse: vi.fn(), poserGrille: vi.fn(), poserAimants: vi.fn(), poserLisserBooleens: vi.fn(),
    poserGuides: vi.fn(), poserTiroir: vi.fn(), poserContours: vi.fn(), poserFond: vi.fn(), poserQuitter: vi.fn(), poserCurseur: vi.fn(), poserFocale: vi.fn(), poserAnnonce: vi.fn(),
    poserVersions: vi.fn(), dire: u => { messages.push(typeof u === 'function' ? u('') : u); }, poserProduction: vi.fn(), poserSuiteCricut: vi.fn(), poserApercuMachine: vi.fn(), poserRegleZone: vi.fn(), toile: { current: null }
  };
  const actions = creerActions(() => etat, setters);
  return { actions, etat, messages, entrees: () => h.passe.length };
}

describe('les actions des outils de trace', () => {
  it('contour en forme : une entree d historique, la silhouette choisie, la phrase dite', () => {
    const { actions, etat, messages, entrees } = monter('<path d="M20 100H180" stroke="#1428a0" stroke-width="10" fill="none"/>');
    etat.sel = ['f1'];
    actions.contourEnForme();
    expect(entrees()).toBe(1);
    expect(messages.at(-1)).toBe('Contour transformé en forme.');
    expect(au(etat.dessin.formes, 0).remplissage).toBe('#1428a0');
    expect(etat.sel).toEqual(['f1']);
  });

  it('refuse sans rien changer quand il n y a ni selection ni contour', () => {
    const { actions, etat, messages, entrees } = monter('<path d="M0 0h10v10z" fill="#c81e28"/>');
    actions.contourEnForme();
    expect(messages.at(-1)).toBe('Choisissez d’abord une forme.');
    etat.sel = ['f1'];
    actions.contourEnForme();
    expect(messages.at(-1)).toMatch(/pas de contour/);
    actions.decalerContour(0, 'round');
    expect(messages.at(-1)).toMatch(/Donnez une distance/);
    actions.arrondirAngles(-1);
    expect(messages.at(-1)).toBe('Donnez un rayon positif.');
    expect(entrees()).toBe(0);
  });

  it('decaler : dit la distance, et retire de la selection la forme qui disparait', () => {
    const { actions, etat, messages, entrees } = monter('<path d="M50 50h40v40h-40z" fill="#c81e28"/><path d="M110 50h60v60h-60z" fill="#1428a0"/>');
    etat.sel = ['f1', 'f2'];
    actions.decalerContour(-25, 'miter');
    expect(entrees()).toBe(1);
    expect(etat.dessin.formes.map(f => f.id)).toEqual(['f2']);
    expect(etat.sel).toEqual(['f2']);
    expect(messages.at(-1)).toBe('Contour décalé de 25 vers l’intérieur. 1 forme n’avait plus de place et a disparu : Ctrl+Z la rend.');
  });

  it('arrondir : dit les angles et le rayon retenu', () => {
    const { actions, etat, messages } = monter('<path d="M0 0h100v40h-100z" fill="#c81e28"/>');
    etat.sel = ['f1'];
    actions.arrondirAngles(30);
    expect(messages.at(-1)).toMatch(/^4 angles arrondis ; 4 angles ramenés à un rayon plus petit, 20 au minimum/);
  });

  it('convertir un point : lisse, puis la meme demande ne change plus rien', () => {
    const { actions, etat, messages, entrees } = monter('<path d="M0 0C10 0 20 10 30 10C40 20 60 30 50 40" stroke="#000" fill="none"/>');
    etat.sel = ['f1']; etat.formeSeule = au(etat.dessin.formes, 0); etat.point = 1;
    actions.convertirNoeud('lisse');
    expect(typeDeNoeud(au(etat.dessin.formes, 0).d, 1)).toBe('lisse');
    expect(messages.at(-1)).toBe('Point converti en lisse : poignées alignées.');
    etat.formeSeule = au(etat.dessin.formes, 0);
    actions.convertirNoeud('lisse');
    expect(messages.at(-1)).toBe('Ce point est déjà lisse.');
    expect(entrees()).toBe(1);
    etat.point = 0;
    actions.convertirNoeud('lisse');
    expect(messages.at(-1)).toMatch(/extrémité/);
  });

  it('casser puis joindre puis inverser : une entree chacun, les phrases, la selection', () => {
    const { actions, etat, messages, entrees } = monter('<path d="M10 10L50 10L70 40L110 40" stroke="#000" fill="none"/>');
    etat.sel = ['f1']; etat.formeSeule = au(etat.dessin.formes, 0); etat.point = 2;
    actions.casserNoeud();
    expect(etat.dessin.formes.map(f => f.id)).toEqual(['f1', 'f2']);
    expect(etat.sel).toEqual(['f1', 'f2']);
    expect(messages.at(-1)).toBe('Tracé cassé en deux au point choisi.');
    actions.joindreSelection();
    expect(etat.dessin.formes).toHaveLength(1);
    expect(messages.at(-1)).toBe('Deux tracés joints en un seul.');
    actions.inverserSens();
    expect(messages.at(-1)).toBe('Sens du tracé inversé.');
    expect(entrees()).toBe(3);
  });

  it('retirer un point en gardant la courbe : refuse un angle, accepte un point aligne', () => {
    const { actions, etat, messages } = monter('<path d="M20 100L100 100L180 100L180 20L20 20Z" fill="#c81e28"/>');
    etat.sel = ['f1']; etat.formeSeule = au(etat.dessin.formes, 0); etat.point = 2;
    actions.supprimerNoeudFidele();
    expect(messages.at(-1)).toMatch(/porte la courbe/);
    etat.point = 1;
    actions.supprimerNoeudFidele();
    expect(messages.at(-1)).toBe('Point retiré, courbe conservée.');
    expect(au(etat.dessin.formes, 0).d.filter(c => c.c === 'L')).toHaveLength(3);
  });
});
