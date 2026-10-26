// Les liens des ilots (ADR-0040) : un ilot est un trou de la region peinte d'une forme pleine a couper ; chaque ilot recoit
// `nombre` liens de `largeur`, et la feuille entiere se tient apres la coupe. Verifie sur la geometrie, par booleens : la region
// rendue n'a plus de trou, le reste de la feuille est d'un seul tenant, et chaque ilot touche au moins `nombre` bandes qui
// touchent aussi l'autre bord de la matiere.

import { describe, expect, it } from 'vitest';
import clipping, { type Pair, type Polygon } from 'polygon-clipping';
import { regionDeForme, toleranceBooleen } from '../../../src/engine/booleens.js';
import { aireDeRegion } from '../../../src/engine/contour/region.js';
import { ecrireDessin, lireDessin, type DessinSvg, type Forme } from '../../../src/engine/editionSvg.js';
import {
  ajouterLiens, bornerLiens, constatsPreparation, corrigerPreparation, ilotsDe, phraseLiens, poserOperation, resoudreProfil,
  LARGEUR_LIEN_DEFAUT, LARGEUR_LIEN_MAX, LARGEUR_LIEN_MIN, LIENS_DEFAUT, NOMBRE_LIENS_DEFAUT, NOMBRE_LIENS_MAX, type OptionsLiens
} from '../../../src/engine/preparation.js';
import { CHOIX_CRICUT_DEFAUT } from '../../../src/model/contextes.js';
import { au } from '../../../src/util/tableaux.js';

const lire = (corps: string, vb = '0 0 1200 1200'): DessinSvg => {
  const r = lireDessin('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '">' + corps + '</svg>');
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
const forme = (d: DessinSvg, id: string): Forme => { const f = d.formes.find(x => x.id === id); if (!f) throw new Error(id); return f; };
const mm = (v: number): number => (v / 25.4) * 96;

// Un O : un anneau, le trou trace a contresens (selon le sens du trace).
const O = '<path d="M300 100A200 200 0 1 1 299.99 100ZM300 200A100 100 0 1 0 300.01 200Z" fill="#c81e28"/>';
// Un A : le triangle du centre est l'ilot (pair-impair), l'echancrure du bas est ouverte.
const A = '<path d="M600 900L680 600L720 600L800 900L750 900L735 840L665 840L650 900ZM675 800L725 800L700 700Z" fill="#1428a0" fill-rule="evenodd"/>';
// Un B : deux ilots l'un sur l'autre.
const B = '<path d="M900 600H1060V900H900ZM930 630H1030V730H930ZM930 770H1030V870H930Z" fill="#2e7d32" fill-rule="evenodd"/>';
// Un ® : le cercle et son fond, le R et son centre : deux ilots, l'un dans l'autre.
const R = '<path d="M300 650A150 150 0 1 1 299.99 650ZM300 670A130 130 0 1 1 299.99 670Z'
  + 'M250 720L330 720L360 750L360 790L330 820L360 880L330 880L300 820L280 820L280 880L250 880Z'
  + 'M280 750L325 750L330 770L325 790L280 790Z" fill="#f2a900" fill-rule="evenodd"/>';
const CARRE = '<path d="M50 1000H150V1100H50Z" fill="#c81e28"/>';
// Deux carres emboites dans le meme sens, selon le sens du trace : plein, pas de trou.
const PLEIN = '<path d="M200 1000H300V1100H200ZM220 1020H280V1080H220Z" fill="#c81e28"/>';

const ouvert = (r: readonly Pair[]): Pair[] => (r.length > 1 && au(r, 0)[0] === au(r, r.length - 1)[0] && au(r, 0)[1] === au(r, r.length - 1)[1] ? r.slice(0, -1) : r.slice());
const distanceAuBord = (p: Pair, r: readonly Pair[]): number => {
  const pts = ouvert(r);
  let m = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = au(pts, i), b = au(pts, (i + 1) % pts.length), dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    m = Math.min(m, Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t));
  }
  return m;
};
const touche = (morceau: Polygon, r: readonly Pair[], eps: number): boolean => ouvert(au(morceau, 0)).some(p => distanceAuBord(p, r) < eps);

/**
 * Les verifications de la geometrie : plus aucun trou, la feuille (une grande boite moins la region rendue) d'un seul tenant, et
 * chaque ilot de depart touche au moins `nombre` bandes retirees qui touchent aussi un autre bord de son polygone.
 */
function verifierLiens(avant: Forme, apres: Forme, o: OptionsLiens, tol: number): void {
  const r1 = regionDeForme(avant, tol), r2 = regionDeForme(apres, tol);
  expect(r2.every(p => p.length === 1), 'il reste un trou').toBe(true);
  const xs = r1.flatMap(p => au(p, 0).map(q => q[0])), ys = r1.flatMap(p => au(p, 0).map(q => q[1]));
  const x0 = Math.min(...xs) - 50, x1 = Math.max(...xs) + 50, y0 = Math.min(...ys) - 50, y1 = Math.max(...ys) + 50;
  const feuille = clipping.difference([[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]], r2);
  expect(feuille.length, 'la feuille n est pas d un seul tenant').toBe(1);
  // Les bandes : ce que la forme a perdu, sans les miettes d'arrondi.
  const bandes = clipping.difference(r1, r2).filter(p => aireDeRegion([p]) > o.largeur * o.largeur * 0.2);
  for (const poly of r1) for (const trou of poly.slice(1)) {
    const autres = poly.filter(r => r !== trou);
    const lies = bandes.filter(b => touche(b, trou, 0.05) && autres.some(r => touche(b, r, 0.05)));
    expect(lies.length, 'un ilot n a pas ses liens').toBeGreaterThanOrEqual(o.nombre);
  }
}

function appliquer(corps: string, ids: readonly string[], o: OptionsLiens = LIENS_DEFAUT) {
  const d = lire(corps), tol = toleranceBooleen(d), avant = JSON.stringify(d);
  const r = ajouterLiens(d, ids, { ...o, lisser: false }, 'decoupe');
  expect(JSON.stringify(d), 'le dessin donne a bouge').toBe(avant);
  const r2 = ajouterLiens(d, ids, { ...o, lisser: false }, 'decoupe');
  expect(ecrireDessin(r.dessin, 3)).toBe(ecrireDessin(r2.dessin, 3));
  for (const id of r.formes) verifierLiens(forme(d, id), forme(r.dessin, id), bornerLiens(o), tol);
  return { d, r };
}

describe('les ilots d une forme', () => {
  it('sont les trous de sa region peinte, selon sa regle', () => {
    const d = lire(O + A + B + R + CARRE + PLEIN), tol = toleranceBooleen(d);
    expect(d.formes.map(f => ilotsDe(f, tol).length)).toEqual([1, 1, 2, 2, 0, 0]);
  });
  it('en pair-impair, deux carres emboites font un ilot ; selon le sens du trace, dans le meme sens, aucun', () => {
    const d = lire(PLEIN.replace('/>', ' fill-rule="evenodd"/>') + PLEIN), tol = toleranceBooleen(d);
    expect(d.formes.map(f => ilotsDe(f, tol).length)).toEqual([1, 0]);
  });
  it('ne compte ni une forme sans fond, ni une miette', () => {
    const d = lire(O.replace('fill="#c81e28"', 'fill="none" stroke="#000000"') + '<path d="M600 100H700V200H600ZM650 150V150.5H650.5V150Z" fill="#c81e28"/>');
    expect(d.formes.map(f => ilotsDe(f, toleranceBooleen(d)).length)).toEqual([0, 0]);
  });
});

describe('ajouter des liens', () => {
  it('pose 3 liens de 2 mm sur le centre d un O, qui tient alors a la feuille', () => {
    const { r } = appliquer(O, ['f1']);
    expect([r.liens, r.ilots, r.incomplets]).toEqual([3, 1, 0]);
    expect(r.phrase).toBe('3 liens posés sur 1 îlot.');
    expect(r.formes).toEqual(['f1']);
  });
  it('relie le triangle d un A', () => {
    const { r } = appliquer(A, ['f1']);
    expect([r.liens, r.ilots, r.incomplets]).toEqual([3, 1, 0]);
  });
  it('traite les deux ilots d un B en une fois', () => {
    const { r } = appliquer(B, ['f1']);
    expect([r.liens, r.ilots]).toEqual([6, 2]);
    expect(r.phrase).toBe('6 liens posés sur 2 îlots.');
  });
  it('relie de proche en proche les ilots imbriques d un ® : le centre du R au fond, le fond a la feuille', () => {
    const { r } = appliquer(R, ['f1']);
    expect([r.liens, r.ilots]).toEqual([6, 2]);
  });
  it('traite chaque forme choisie, et laisse les autres', () => {
    const { d, r } = appliquer(O + A + CARRE, ['f1', 'f2', 'f3']);
    expect(r.formes).toEqual(['f1', 'f2']);
    expect(r.liens).toBe(6);
    expect(r.dessin.formes[2]).toBe(d.formes[2]);
  });
  it('dit qu une forme sans ilot n en a pas, sans rien changer', () => {
    const d = lire(CARRE + PLEIN);
    const r = ajouterLiens(d, ['f1', 'f2'], LIENS_DEFAUT, 'decoupe');
    expect(r.dessin).toBe(d);
    expect(r.phrase).toBe('Ces formes n’ont pas d’îlot : rien ne tombera à la découpe.');
    expect(ajouterLiens(d, ['f1'], LIENS_DEFAUT, 'decoupe').phrase).toBe('Cette forme n’a pas d’îlot : rien ne tombera à la découpe.');
  });
  it('ignore une forme a ecrire, verrouillee ou masquee', () => {
    const d = lire(O);
    const ecrite = poserOperation(d, ['f1'], 'ecriture', 'decoupe').dessin;
    expect(ajouterLiens(ecrite, ['f1'], LIENS_DEFAUT, 'decoupe').dessin).toBe(ecrite);
    expect(ajouterLiens(ecrite, ['f1'], LIENS_DEFAUT, null).liens).toBe(3);
    const masquee = { ...d, formes: d.formes.map(f => ({ ...f, visible: false })) };
    expect(ajouterLiens(masquee, ['f1']).dessin).toBe(masquee);
    const verrouillee = { ...d, formes: d.formes.map(f => ({ ...f, verrouille: true })) };
    expect(ajouterLiens(verrouillee, ['f1']).dessin).toBe(verrouillee);
  });
  it('garde l identifiant, le style et l operation de la forme', () => {
    const d = poserOperation(lire(O), ['f1'], 'decoupe', 'dessin-stylo').dessin;
    const r = ajouterLiens(d, ['f1'], LIENS_DEFAUT, null);
    const f = forme(r.dessin, 'f1');
    expect([f.remplissage, f.operation, f.regle]).toEqual(['#c81e28', 'decoupe', 'nonzero']);
  });
  it('rebatit les courbes par defaut, et le centre tient toujours', () => {
    const d = lire(O), r = ajouterLiens(d, ['f1']), tol = toleranceBooleen(d);
    const f = forme(r.dessin, 'f1');
    expect(f.d.some(c => c.c === 'C')).toBe(true);
    const r2 = regionDeForme(f, tol);
    expect(r2.length).toBe(3);
    expect(r2.every(p => p.length === 1)).toBe(true);
  });
  it.each([
    ['la largeur minimale, un lien', { largeur: LARGEUR_LIEN_MIN, nombre: 1 }],
    ['la largeur maximale, douze liens', { largeur: LARGEUR_LIEN_MAX, nombre: NOMBRE_LIENS_MAX }],
    ['3 mm, deux liens', { largeur: mm(3), nombre: 2 }]
  ])('tient aux bornes : %s', (_n, o) => {
    const { r } = appliquer(O, ['f1'], o);
    expect(r.liens).toBe(o.nombre);
  });
  it('ramene les reglages dans leurs bornes', () => {
    expect(bornerLiens({ largeur: 0, nombre: 0 })).toEqual({ largeur: LARGEUR_LIEN_MIN, nombre: 1 });
    expect(bornerLiens({ largeur: 1e6, nombre: 99.6 })).toEqual({ largeur: LARGEUR_LIEN_MAX, nombre: NOMBRE_LIENS_MAX });
    expect(bornerLiens({ largeur: Number.NaN, nombre: Number.NaN })).toEqual({ largeur: LARGEUR_LIEN_DEFAUT, nombre: NOMBRE_LIENS_DEFAUT });
    expect(bornerLiens({ largeur: mm(2.5), nombre: 2.4 }).nombre).toBe(2);
    expect(LARGEUR_LIEN_DEFAUT).toBeCloseTo(mm(2), 9);
  });
  it('dit les liens poses', () => {
    expect(phraseLiens(1, 1)).toBe('1 lien posé sur 1 îlot.');
    expect(phraseLiens(3, 2)).toBe('3 liens posés sur 2 îlots.');
    expect(phraseLiens(5, 2, 1)).toBe('5 liens posés sur 2 îlots. Un îlot en a reçu moins que demandé : la place manquait.');
  });
});

describe('le constat « Un îlot tombera à la découpe »', () => {
  const p = resoudreProfil({ contexte: 'cricut', ...CHOIX_CRICUT_DEFAUT });
  if (!p) throw new Error('profil');
  it('se pose sur chaque forme a couper qui a un ilot, a corriger, et sa correction pose les liens', () => {
    const d = lire(O + B + CARRE);
    const c = constatsPreparation(d, p).find(x => x.code === 'ilot');
    expect(c?.gravite).toBe('a-corriger');
    expect(c?.formes).toEqual(['f1', 'f2']);
    expect(c?.correction).toBe('ajouter-liens');
    expect(c?.message).toContain('3 îlots');
    if (!c?.correction) throw new Error('constat');
    const r = corrigerPreparation(d, c.correction, c, p);
    if ('erreur' in r) throw new Error(r.erreur);
    expect(r.phrase).toBe('9 liens posés sur 3 îlots.');
    expect(constatsPreparation(r.dessin, p).some(x => x.code === 'ilot')).toBe(false);
  });
  it('ne se pose ni sur une forme a ecrire, ni sans ilot', () => {
    expect(constatsPreparation(lire(CARRE + PLEIN), p).some(x => x.code === 'ilot')).toBe(false);
    const ecrite = poserOperation(lire(O), ['f1'], 'ecriture', 'decoupe').dessin;
    expect(constatsPreparation(ecrite, p).some(x => x.code === 'ilot')).toBe(false);
  });
});
