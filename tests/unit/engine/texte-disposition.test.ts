// Le texte pose sur ou dans une forme (ADR-0031) : l'abscisse curviligne et la tangente d'un trace, les lettres posees sur un cercle
// (exterieur, interieur), le depassement dit, la repartition ; les largeurs disponibles (cercle, cœur, forme a trou), le renvoi a la
// ligne, la taille ajustee ; le determinisme ; le lien a la forme (recomposition, forme supprimee, transformations, copies) ;
// l'ecriture, la relecture et ses bornes.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  avecFormesPorteuses, deplacer, dessinSansTextes, dupliquer, ecrireDessin, ellipse, lireDessin, modifier, polygone, rectangle, supprimer, tourner,
  type Chemin, type DessinSvg, type DispositionTexte, type Forme, type TexteVivant
} from '../../../src/engine/editionSvg.js';
import { cheminDuTexte } from '../../../src/engine/texte/bloc.js';
import { creerTexte, nouveauTexte, peintureDuTexte } from '../../../src/engine/texte/vivant.js';
import { pointA, projeter, tangenteA, traceDe, tracesDe, sensHoraire } from '../../../src/engine/texte/trace.js';
import { departVers, pointDeDepart, poserSurTrace } from '../../../src/engine/texte/surTrace.js';
import { intervallesA, largeursDisponibles, motsHorsForme, poserDansForme, tailleQuiTient } from '../../../src/engine/texte/dansForme.js';
import { composerDansDessin, composerDispose, suivreDispositions, texteDispose } from '../../../src/engine/texte/disposition.js';
import { indexAuPointPose, indexVerticalPose, selectionPose } from '../../../src/engine/texte/pose.js';
import { polygonesDe } from '../../../src/engine/texte/trace.js';
import { nettoyerSvg } from '../../../src/util/svg.js';
import { au } from '../../../src/util/tableaux.js';
import { violationsEcriture } from '../securite/invariants.js';
import { glyphesCarres } from './glyphesFactices.js';

const police = { id: 'inter', version: '0123456789abcd' };
const PEINTURE = peintureDuTexte('contour', { remplissage: '#15181d', contour: null, epaisseur: 1 }, 1);
const glyphesDe = () => glyphesCarres;

const base = (id: string, d: Chemin, reglages: Partial<Forme> = {}): Forme => ({ id, d, remplissage: '#c81e28', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, ...reglages });
/** Un cercle de rayon r centre en (cx, cy), trace par l'outil ellipse (sens des aiguilles d'une montre a l'ecran). */
const cercle = (id: string, cx: number, cy: number, r: number): Forme => base(id, ellipse(cx - r, cy - r, 2 * r, 2 * r));

const SUR = (forme: string, reglages: Partial<Extract<DispositionTexte, { mode: 'sur' }>> = {}): DispositionTexte => ({ mode: 'sur', forme, depart: 0, cote: 'dessus', repartir: false, ...reglages });
const DANS = (forme: string, reglages: Partial<Extract<DispositionTexte, { mode: 'dans' }>> = {}): DispositionTexte => ({ mode: 'dans', forme, marge: 0, ajuster: false, justifier: false, ...reglages });

/** Un dessin : les formes de base, puis un texte vivant pose (ses contours composes sur la forme). */
function dessinAvec(formes: Forme[], texte: string, disposition: DispositionTexte | undefined, reglages: Partial<TexteVivant> = {}): { dessin: DessinSvg; id: string } {
  const vide: DessinSvg = { vb: [0, 0, 400, 400], formes };
  const t: TexteVivant = { ...nouveauTexte(texte, police, 20, [1, 0, 0, 1, 0, 0]), alignement: 'centre', ...reglages, ...(disposition ? { disposition } : {}) };
  const r = creerTexte(vide, t, cheminDuTexte({ ...t }, glyphesCarres), PEINTURE);
  if (!r.id) throw new Error('aucun texte');
  const f = au(r.dessin.formes, r.dessin.formes.length - 1);
  const c = composerDansDessin(r.dessin, r.id, t, glyphesCarres);
  return { dessin: { ...r.dessin, formes: r.dessin.formes.map(x => (x === f ? { ...f, texte: c.texte, d: c.d.length ? c.d : f.d } : x)) }, id: r.id };
}

const forme = (d: DessinSvg, id: string): Forme => { const f = d.formes.find(x => x.id === id); if (!f) throw new Error('forme ' + id); return f; };
const lire = (svg: string): DessinSvg => { const r = lireDessin(svg); if ('erreur' in r) throw new Error(r.erreur); return r.dessin; };
const enregistrer = (d: DessinSvg): string => nettoyerSvg(ecrireDessin(d, 3))?.svg ?? '';
/** Le centre des points d'un chemin (la moyenne de ses ancres). */
const centreDe = (d: Chemin): [number, number] => {
  const p = d.filter(c => c.c !== 'Z').map(c => [c.p[c.p.length - 2] ?? 0, c.p[c.p.length - 1] ?? 0] as const);
  return [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
};

describe('l abscisse curviligne et la tangente d un trace', () => {
  it('sur une ligne : le point est exact, la tangente constante, la projection rend l abscisse', () => {
    const tr = traceDe(polygone([[10, 20], [110, 20]], false));
    if (!tr) throw new Error('trace');
    expect(tr.longueur).toBe(100);
    expect(tr.ferme).toBe(false);
    expect(pointA(tr, 25)).toEqual([35, 20]);
    expect(tangenteA(tr, 25)).toEqual([1, 0]);
    expect(projeter(tr, [60, 80])).toBe(50);
    // Au-dela des bouts, un trace ouvert s'arrete a ses bouts.
    expect(pointA(tr, 500)).toEqual([110, 20]);
  });

  it('sur un arc (un quart de cercle en cubique) : la longueur est celle de l arc, la tangente tourne avec lui', () => {
    const r = 100, k = 0.5522847498 * r;
    const tr = traceDe([{ c: 'M', p: [r, 0] }, { c: 'C', p: [r, k, k, r, 0, r] }]);
    if (!tr) throw new Error('trace');
    expect(Math.abs(tr.longueur - (Math.PI * r) / 2)).toBeLessThan(0.05);
    const [x, y] = pointA(tr, tr.longueur / 2), [tx, ty] = tangenteA(tr, tr.longueur / 2);
    expect(Math.hypot(x, y)).toBeCloseTo(r, 1);
    // Au milieu de l'arc, la tangente est perpendiculaire au rayon et unitaire.
    expect(Math.abs(tx * x + ty * y) / r).toBeLessThan(0.002);
    expect(Math.hypot(tx, ty)).toBeCloseTo(1, 12);
  });

  it('sur une cubique quelconque : la longueur egale celle d un decoupage tres fin, a un millieme pres', () => {
    const d: Chemin = [{ c: 'M', p: [0, 0] }, { c: 'C', p: [30, -80, 90, 120, 140, 10] }];
    const tr = traceDe(d);
    if (!tr) throw new Error('trace');
    let l = 0, px = 0, py = 0;
    for (let i = 1; i <= 20000; i++) {
      const t = i / 20000, u = 1 - t;
      const x = 3 * u * u * t * 30 + 3 * u * t * t * 90 + t * t * t * 140, y = 3 * u * u * t * -80 + 3 * u * t * t * 120 + t * t * t * 10;
      l += Math.hypot(x - px, y - py); px = x; py = y;
    }
    expect(Math.abs(tr.longueur - l) / l).toBeLessThan(1e-3);
    // Le point a l'abscisse d'un point projete retombe sur lui.
    const q = pointA(tr, 77), s = projeter(tr, q);
    expect(Math.hypot(pointA(tr, s)[0] - q[0], pointA(tr, s)[1] - q[1])).toBeLessThan(0.05);
  });

  it('voit les sous-chemins, leur fermeture, le plus long, et le sens d un trace ferme', () => {
    const anneau = [...ellipse(0, 0, 100, 100), ...ellipse(30, 30, 40, 40)];
    expect(tracesDe(anneau)).toHaveLength(2);
    expect(traceDe(anneau)?.longueur).toBeGreaterThan(300);
    const c = traceDe(ellipse(0, 0, 100, 100));
    expect(c?.ferme).toBe(true);
    if (c) expect(sensHoraire(c)).toBe(1);
    const inverse = traceDe(polygone([[0, 0], [0, 10], [10, 10], [10, 0]], true));
    if (inverse) expect(sensHoraire(inverse)).toBe(-1);
  });
});

describe('le texte sur une forme', () => {
  const C = cercle('f1', 200, 200, 100);
  const reglages = (r: Partial<Parameters<typeof poserSurTrace>[0]> = {}) => ({ texte: 'BADGE', interlettrage: 0, ligatures: false, alignement: 'centre' as const, depart: 0, cote: 'dessus' as const, repartir: false, ...r });

  it('pose chaque lettre a l exterieur d un cercle, centree en haut, debout le long du trace', () => {
    const p = poserSurTrace(reglages(), C, glyphesCarres, 20);
    expect(p.lettres).toHaveLength(5);
    expect(p.depasse).toBe(0);
    for (const l of p.lettres) {
      const [x, y] = centreDe(l.d);
      // Le milieu d'une lettre carree (700 de haut sur 1000) est a 0,35 taille au-dessus de sa ligne de base : dehors.
      expect(Math.hypot(x - 200, y - 200)).toBeCloseTo(107, 0);
    }
    // La lettre du milieu est en haut du cercle, a l'aplomb du centre.
    const [xm, ym] = centreDe(au(p.lettres, 2).d);
    expect(Math.abs(xm - 200)).toBeLessThan(2);
    expect(ym).toBeLessThan(100);
    // Les lettres se suivent de gauche a droite sur le haut du cercle (dans le sens des aiguilles d'une montre).
    const xs = p.lettres.map(l => centreDe(l.d)[0]);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it('pose les lettres a l interieur, centrees en bas, lisibles de gauche a droite', () => {
    const p = poserSurTrace(reglages({ cote: 'dessous' }), C, glyphesCarres, 20);
    for (const l of p.lettres) expect(Math.hypot(centreDe(l.d)[0] - 200, centreDe(l.d)[1] - 200)).toBeCloseTo(93, 0);
    const [xm, ym] = centreDe(au(p.lettres, 2).d);
    expect(Math.abs(xm - 200)).toBeLessThan(2);
    expect(ym).toBeGreaterThan(280);
    const xs = p.lettres.map(l => centreDe(l.d)[0]);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it('ne deforme pas les lettres : chaque cote garde sa longueur', () => {
    const p = poserSurTrace(reglages({ texte: 'A' }), C, glyphesCarres, 20);
    const pts = au(p.lettres, 0).d.filter(c => c.c !== 'Z').map(c => [c.p[0] ?? 0, c.p[1] ?? 0]);
    const cote = (i: number, j: number) => Math.hypot(au(pts, i)[0]! - au(pts, j)[0]!, au(pts, i)[1]! - au(pts, j)[1]!);
    expect(cote(0, 1)).toBeCloseTo(10, 9);
    expect(cote(1, 2)).toBeCloseTo(14, 9);
  });

  it('dit le depassement au lieu de couper en silence : sur un petit cercle, sur une ligne trop courte', () => {
    const petit = poserSurTrace(reglages({ texte: 'UN TEXTE BIEN TROP LONG' }), cercle('f2', 50, 50, 10), glyphesCarres, 20);
    expect(petit.depasse).toBeGreaterThan(0);
    expect(petit.lettres.length + petit.depasse).toBe('UNTEXTEBIENTROPLONG'.length);
    const ligne = base('f3', polygone([[0, 100], [60, 100]], false), { remplissage: null, contour: '#000000', epaisseur: 1 });
    const court = poserSurTrace(reglages({ texte: 'ABCDEFGH', alignement: 'gauche' }), ligne, glyphesCarres, 20);
    // 60 unites pour des avances de 12 : cinq lettres dont le milieu tient.
    expect(court.lettres).toHaveLength(5);
    expect(court.depasse).toBe(3);
  });

  it('repartit les lettres sur tout le trace d une forme fermee : des ecarts egaux, le dernier compris', () => {
    const tr = traceDe(C.d);
    if (!tr) throw new Error('trace');
    const p = poserSurTrace(reglages({ texte: 'ABCD', repartir: true, alignement: 'gauche' }), C, glyphesCarres, 20);
    expect(p.depasse).toBe(0);
    const s = p.lettres.map(l => projeter(tr, centreDe(l.d)));
    const ecarts = s.map((v, i) => (au(s, (i + 1) % s.length) - v + tr.longueur) % tr.longueur);
    for (const e of ecarts) expect(e).toBeCloseTo(tr.longueur / 4, -0.5);
  });

  it('lit un trace ouvert de gauche a droite, et pose le texte dessous quand on le demande', () => {
    const arc = base('f4', [{ c: 'M', p: [300, 100] }, { c: 'Q', p: [200, 0, 100, 100] }], { remplissage: null, contour: '#000000', epaisseur: 1 });
    const dessus = poserSurTrace(reglages({ texte: 'ABC', depart: 0.5 }), arc, glyphesCarres, 20);
    const xs = dessus.lettres.map(l => centreDe(l.d)[0]);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    const dessous = poserSurTrace(reglages({ texte: 'ABC', depart: 0.5, cote: 'dessous' }), arc, glyphesCarres, 20);
    expect(centreDe(au(dessous.lettres, 1).d)[1]).toBeGreaterThan(centreDe(au(dessus.lettres, 1).d)[1] + 10);
  });

  it('place la poignee de depart et la ramene du pointeur au depart, en boucle sur une forme fermee', () => {
    const haut = pointDeDepart(C, { depart: 0, cote: 'dessus' });
    expect(haut?.[0]).toBeCloseTo(200, 0);
    expect(haut?.[1]).toBeCloseTo(100, 0);
    const tr = traceDe(C.d);
    if (!tr || !haut) throw new Error('trace');
    expect(departVers(C, { cote: 'dessus' }, projeter(tr, haut))).toBe(0);
    const droite = projeter(tr, [300, 200]);
    expect(departVers(C, { cote: 'dessus' }, droite)).toBeCloseTo(0.25, 2);
  });

  it('donne un curseur devant chaque caractere, tourne avec sa lettre', () => {
    const p = poserSurTrace(reglages({ texte: 'AB' }), C, glyphesCarres, 20);
    expect(p.carets).toHaveLength(3);
    const [pied, tete] = au(p.carets, 1);
    // Au sommet du cercle, le curseur entre A et B est vertical.
    expect(Math.abs(pied[0] - tete[0])).toBeLessThan(0.5);
    expect(indexAuPointPose(p, tete)).toBe(1);
    expect(selectionPose(p, 0, 2)).toHaveLength(2);
    expect(indexVerticalPose(p, 1, -1)).toBe(0);
    expect(indexVerticalPose(p, 1, 1)).toBe(2);
  });
});

describe('le texte dans une forme', () => {
  it('trouve les largeurs disponibles dans un cercle : la corde a la hauteur de la ligne, moins la marge', () => {
    const polys = polygonesDe(ellipse(0, 0, 200, 200));
    const [a] = largeursDisponibles(polys, 'nonzero', 90, 110, 5);
    if (!a) throw new Error('aucun morceau');
    // La corde la plus courte de la bande est a y = 90 ou 110 : 2 * sqrt(100² - 10²) = 198,99.
    expect(a[1] - a[0]).toBeCloseTo(198.99 - 10, 0);
    expect(largeursDisponibles(polys, 'nonzero', -5, 5)).toEqual([]);
  });

  it('dans un cœur : deux lobes en haut, un seul morceau au milieu', () => {
    const coeur: Chemin = [
      { c: 'M', p: [100, 60] }, { c: 'C', p: [100, 20, 40, 0, 20, 40] }, { c: 'C', p: [0, 80, 60, 130, 100, 170] },
      { c: 'C', p: [140, 130, 200, 80, 180, 40] }, { c: 'C', p: [160, 0, 100, 20, 100, 60] }, { c: 'Z', p: [] }
    ];
    const polys = polygonesDe(coeur);
    expect(largeursDisponibles(polys, 'nonzero', 30, 40)).toHaveLength(2);
    expect(largeursDisponibles(polys, 'nonzero', 80, 90)).toHaveLength(1);
  });

  it('respecte les trous : un anneau (pair-impair ou a contresens) donne deux morceaux autour du trou', () => {
    const exterieur = rectangle(0, 0, 100, 100);
    const anneau = [...exterieur, ...polygone([[40, 20], [40, 80], [60, 80], [60, 20]], true)];
    expect(intervallesA(polygonesDe(anneau), 'nonzero', 50)).toEqual([[0, 40], [60, 100]]);
    const memeSens = [...exterieur, ...rectangle(40, 20, 20, 60)];
    expect(intervallesA(polygonesDe(memeSens), 'evenodd', 50)).toEqual([[0, 40], [60, 100]]);
    expect(intervallesA(polygonesDe(memeSens), 'nonzero', 50)).toEqual([[0, 100]]);
  });

  const boite = base('f1', rectangle(0, 0, 100, 200));
  const r = (texte: string, autres: Partial<Parameters<typeof poserDansForme>[0]> = {}) => ({ texte, interlettrage: 0, interligne: 1.2, ligatures: false, alignement: 'gauche' as const, marge: 0, justifier: false, ...autres });

  it('renvoie les mots a la ligne : aucune ligne ne deborde, et l ordre du texte est garde', () => {
    // Taille 10 : une lettre avance de 6. 100 de large : seize lettres par ligne au plus.
    const p = poserDansForme(r('aaaa bbbb cccc dddd eeee'), boite, glyphesCarres, 10);
    expect(p.nonPlaces).toBe(0);
    const lignes = new Set(p.lignes);
    expect(lignes.size).toBe(2);
    for (const l of p.lettres) { const xs = l.d.filter(c => c.c !== 'Z').map(c => c.p[0] ?? 0); expect(Math.max(...xs)).toBeLessThanOrEqual(100); }
    expect(p.lettres.map(l => l.caractere).join('')).toBe('aaaabbbbccccddddeeee');
  });

  it('commence un paragraphe a chaque retour tape, et justifie les lignes pleines', () => {
    const p = poserDansForme(r('aa\nbb'), boite, glyphesCarres, 10);
    expect(au(p.lignes, 0)).toBe(0);
    expect(au(p.lignes, 3)).toBe(1);
    const j = poserDansForme(r('aaaa bbbb cccc dddd eeee', { justifier: true }), boite, glyphesCarres, 10);
    // La premiere ligne, justifiee, finit au bord droit ; la derniere reste a gauche.
    const fin = Math.max(...j.lettres.filter((_, i) => i < 12).flatMap(l => l.d.filter(c => c.c !== 'Z').map(c => c.p[0] ?? 0)));
    expect(fin).toBeCloseTo(100 - 1, 0);
  });

  it('dit les mots qui ne tiennent pas, sans jamais sauter un mot', () => {
    const petite = base('f2', rectangle(0, 0, 40, 25));
    const p = poserDansForme(r('un deux trois quatre cinq six'), petite, glyphesCarres, 10);
    expect(p.nonPlaces).toBeGreaterThan(0);
    expect(p.nonPlaces).toBe(motsHorsForme(r('un deux trois quatre cinq six'), petite, glyphesCarres, 10));
    const tropLarge = poserDansForme(r('abcdefghijklmnop qr'), petite, glyphesCarres, 10);
    expect(tropLarge.lettres).toHaveLength(0);
    expect(tropLarge.nonPlaces).toBe(2);
  });

  it('ajuste la taille : la plus grande qui tient, au centieme, et un centieme de plus ne tient plus', () => {
    const texte = r('Joyeux anniversaire Lucie');
    const t = tailleQuiTient(texte, boite, glyphesCarres);
    expect(motsHorsForme(texte, boite, glyphesCarres, t)).toBe(0);
    expect(motsHorsForme(texte, boite, glyphesCarres, t + 0.02)).toBeGreaterThan(0);
    expect(Math.round(t * 100) / 100).toBe(t);
    expect(tailleQuiTient(texte, boite, glyphesCarres)).toBe(t);
  });
});

describe('le determinisme', () => {
  it('rend les memes contours pour les memes entrees, memoire ou non', () => {
    const a = dessinAvec([cercle('f1', 200, 200, 100)], 'Bonne fête', SUR('f1'));
    const b = dessinAvec([cercle('f1', 200, 200, 100)], 'Bonne fête', SUR('f1'));
    expect(forme(a.dessin, a.id).d).toEqual(forme(b.dessin, b.id).d);
    expect(enregistrer(a.dessin)).toBe(enregistrer(b.dessin));
    const c = dessinAvec([base('f1', rectangle(0, 0, 200, 300))], 'Un deux trois quatre', DANS('f1', { ajuster: true }));
    const d = dessinAvec([base('f1', rectangle(0, 0, 200, 300))], 'Un deux trois quatre', DANS('f1', { ajuster: true }));
    expect(enregistrer(c.dessin)).toBe(enregistrer(d.dessin));
  });
});

describe('le lien a la forme', () => {
  it('recompose le texte quand la forme change, dans le meme dessin', () => {
    const { dessin, id } = dessinAvec([cercle('f1', 200, 200, 100)], 'BADGE', SUR('f1'));
    const apres = deplacer(dessin, ['f1'], 30, 0);
    const r = suivreDispositions(dessin, apres, glyphesDe);
    const [xa] = centreDe(forme(dessin, id).d), [xb] = centreDe(forme(r.dessin, id).d);
    expect(xb - xa).toBeCloseTo(30, 1);
    // Une forme agrandie : le texte se repose sur le nouveau trace.
    const grand = suivreDispositions(dessin, { ...dessin, formes: dessin.formes.map(f => (f.id === 'f1' ? { ...f, d: ellipse(50, 50, 300, 300) } : f)) }, glyphesDe);
    expect(Math.hypot(centreDe(au(texteDispose(grand.dessin, forme(grand.dessin, id), glyphesCarres)?.pose.lettres ?? [], 0).d)[0] - 200, centreDe(au(texteDispose(grand.dessin, forme(grand.dessin, id), glyphesCarres)?.pose.lettres ?? [], 0).d)[1] - 200)).toBeCloseTo(157, 0);
  });

  it('rend un texte libre quand sa forme est supprimee, compose en ligne droite', () => {
    const { dessin, id } = dessinAvec([cercle('f1', 200, 200, 100)], 'BADGE', SUR('f1'));
    const r = suivreDispositions(dessin, supprimer(dessin, ['f1']), glyphesDe);
    const t = forme(r.dessin, id);
    expect(r.libres).toEqual([id]);
    expect(t.texte?.disposition).toBeUndefined();
    const ys = t.d.filter(c => c.c !== 'Z').map(c => c.p[1] ?? 0);
    // En ligne droite : toutes les lettres sur la meme ligne de base.
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(14, 5);
    // Sans les glyphes (fonte pas encore la), le texte devient libre et garde ses contours.
    const sans = suivreDispositions(dessin, supprimer(dessin, ['f1']), () => null);
    expect(forme(sans.dessin, id).d).toBe(forme(dessin, id).d);
  });

  it('emmene la forme quand on deplace ou tourne le texte seul, et ne la deplace pas deux fois', () => {
    const { dessin, id } = dessinAvec([cercle('f1', 200, 200, 100)], 'BADGE', SUR('f1'));
    expect(avecFormesPorteuses(dessin, [id])).toEqual([id, 'f1']);
    const deplace = deplacer(dessin, [id], 10, 5);
    expect(forme(deplace, 'f1').d).not.toBe(forme(dessin, 'f1').d);
    const r = suivreDispositions(dessin, deplace, glyphesDe);
    expect(centreDe(forme(r.dessin, 'f1').d)[0] - centreDe(forme(dessin, 'f1').d)[0]).toBeCloseTo(10, 9);
    const tourne = suivreDispositions(dessin, tourner(dessin, [id, 'f1'], 90), glyphesDe);
    expect(tourne.dessin.formes).toHaveLength(2);
    // Verrouillee, la forme ne suit pas : le texte se repose ou il etait.
    const verrou = modifier(dessin, ['f1'], { verrouille: true });
    expect(avecFormesPorteuses(verrou, [id])).toEqual([id]);
  });

  it('pose la copie d un texte et de sa forme sur la copie de la forme ; copie seul, le texte redevient libre', () => {
    const { dessin, id } = dessinAvec([cercle('f1', 200, 200, 100)], 'BADGE', SUR('f1'));
    const deux = dupliquer(dessin, ['f1', id], 20, 20);
    const copieTexte = forme(deux.dessin, au(deux.ids, 1)), copieForme = au(deux.ids, 0);
    expect(copieTexte.texte?.disposition?.forme).toBe(copieForme);
    const seul = dupliquer(dessin, [id], 20, 20);
    const r = suivreDispositions(dessin, seul.dessin, glyphesDe);
    expect(forme(r.dessin, au(seul.ids, 0)).texte?.disposition).toBeUndefined();
    expect(forme(r.dessin, id).texte?.disposition?.forme).toBe('f1');
  });

  it('ne change rien a un dessin sans texte pose', () => {
    const d: DessinSvg = { vb: [0, 0, 10, 10], formes: [cercle('f1', 5, 5, 4)] };
    const apres = deplacer(d, ['f1'], 1, 1);
    expect(suivreDispositions(d, apres, glyphesDe).dessin).toBe(apres);
  });
});

describe('l ecriture et la relecture d un texte pose', () => {
  it('ecrit la disposition et le lien (le rang de la forme), seulement quand ils existent, et se relit en point fixe', () => {
    const { dessin, id } = dessinAvec([cercle('f1', 200, 200, 100)], 'BADGE', SUR('f1', { depart: 0.125, cote: 'dessous', repartir: true }));
    const svg = enregistrer(dessin);
    expect(svg).not.toMatch(/<text|textPath/);
    expect(svg).toContain('data-ed-disposition="sur" data-ed-depart="0.125" data-ed-cote="dessous" data-ed-repartir="1" data-ed-forme="1"');
    expect(violationsEcriture(ecrireDessin(dessin, 3))).toEqual([]);
    const relu = lire(svg);
    const t = relu.formes.find(f => f.texte);
    expect(t?.texte?.disposition).toEqual({ mode: 'sur', forme: 'f1', depart: 0.125, cote: 'dessous', repartir: true });
    expect(enregistrer(relu)).toBe(svg);
    // Un texte libre n'ecrit aucun de ces attributs.
    expect(enregistrer(dessinAvec([], 'BADGE', undefined).dessin)).not.toMatch(/data-ed-(?:disposition|forme)/);
    void id;
  });

  it('garde une forme masquee par son trace encode, la recree masquee a la relecture', () => {
    const { dessin } = dessinAvec([base('f1', rectangle(0, 0, 200, 300))], 'Un deux trois', DANS('f1', { marge: 0.5, ajuster: true, justifier: true }));
    const masque = modifier(dessin, ['f1'], { visible: false });
    const svg = enregistrer(masque);
    expect(svg).toMatch(/data-ed-disposition="dans" data-ed-marge="0\.5" data-ed-ajuster="1" data-ed-justifier="1" data-ed-forme-d="M0%200/);
    expect(svg.match(/<path/g)).toHaveLength(1);
    expect(violationsEcriture(ecrireDessin(masque, 3))).toEqual([]);
    const relu = lire(svg);
    expect(relu.formes).toHaveLength(2);
    const cachee = au(relu.formes, 0);
    expect(cachee.visible).toBe(false);
    expect(relu.formes.find(f => f.texte)?.texte?.disposition?.forme).toBe(cachee.id);
    expect(enregistrer(relu)).toBe(svg);
  });

  it('ne garde le texte pose que des contours dans un export, et ignore un lien qui ne mene a rien', () => {
    const { dessin } = dessinAvec([cercle('f1', 200, 200, 100)], 'BADGE', SUR('f1'));
    expect(ecrireDessin(dessinSansTextes(dessin), 3)).not.toContain('data-ed-');
    const svg = enregistrer(dessin).replace('data-ed-forme="1"', 'data-ed-forme="7"');
    expect(lire(svg).formes.find(f => f.texte)?.texte?.disposition).toBeUndefined();
    const lui = enregistrer(dessin).replace('data-ed-forme="1"', 'data-ed-forme="2"');
    expect(lire(lui).formes.find(f => f.texte)?.texte?.disposition).toBeUndefined();
  });

  it('refuse une disposition hors de ses bornes : le texte reste en contours, et c est dit', () => {
    const { dessin } = dessinAvec([cercle('f1', 200, 200, 100)], 'BADGE', SUR('f1'));
    for (const [de, vers] of [['data-ed-disposition="sur"', 'data-ed-disposition="autour"'], ['data-ed-forme="1"', 'data-ed-forme="0"'], ['data-ed-forme="1"', 'data-ed-forme="1" data-ed-depart="2"']] as const) {
      const r = lireDessin(enregistrer(dessin).replace(de, vers));
      if ('erreur' in r) throw new Error(r.erreur);
      expect(r.dessin.formes.some(f => f.texte), vers).toBe(false);
      expect(r.ignores.join(' '), vers).toMatch(/illisibles/);
    }
  });
});

describe('le lien piege du corpus hostile', () => {
  it('lit le fichier sans lever : aucun lien piege ne pose un texte, et rien d inattendu ne se reecrit', () => {
    const svg = readFileSync(resolve(__dirname, '../../fixtures/hostile/texte-pose-lien-piege.svg'), 'utf8');
    const r = lireDessin(svg);
    if ('erreur' in r) throw new Error(r.erreur);
    expect(r.dessin.formes.some(f => f.texte?.disposition)).toBe(false);
    // A, B, C (des liens vers un texte), D (rang demesure) et K (un reglage sans disposition) restent des textes libres.
    expect(r.dessin.formes.filter(f => f.texte).map(f => f.texte?.texte)).toEqual(['A', 'B', 'C', 'D', 'K']);
    expect(r.ignores.join(' ')).toMatch(/illisibles/);
    expect(violationsEcriture(ecrireDessin(r.dessin, 3))).toEqual([]);
  });
});

describe('la composition dans le dessin', () => {
  it('compose un texte dont la forme n existe pas en ligne droite, sans disposition', () => {
    const { dessin, id } = dessinAvec([cercle('f1', 200, 200, 100)], 'BADGE', SUR('f1'));
    const t = forme(dessin, id).texte;
    if (!t) throw new Error('texte');
    const r = composerDansDessin({ ...dessin, formes: dessin.formes.filter(f => f.id !== 'f1') }, id, t, glyphesCarres);
    expect(r.texte.disposition).toBeUndefined();
    expect(r.pose).toBeNull();
    const pose = composerDispose(t, cercle('f1', 200, 200, 100), glyphesCarres);
    expect(pose.texte.matrice.slice(0, 4)).toEqual([1, 0, 0, 1]);
  });
});
