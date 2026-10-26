import { describe, expect, it } from 'vitest';
import {
  ajouterForme, boiteDe, boiteForme, dupliquerEnGrille, ecrireDessin, ellipse, matricesRadiales, pasGrilleParDefaut, pasRadial, rectangle, repetitionRadiale,
  REPETITION_MAX, symetrie, axeParDefaut, type DessinSvg
} from '../../../src/engine/editionSvg.js';
import { au } from '../../../src/util/tableaux.js';

// Repeter une selection (ADR-0038) : grille, radiale, symetrie. Des formes ordinaires, aux positions attendues, deterministes.

const VIDE: DessinSvg = { vb: [0, 0, 400, 400], formes: [] };
const style = { remplissage: '#1428a0', contour: null, epaisseur: 1 };
/** Un carre de 10 en (10, 10), une ellipse, puis un dernier carre au-dessus de tout (f1, f2, f3). */
const DESSIN = [rectangle(10, 10, 10, 10), ellipse(100, 100, 20, 10), rectangle(300, 300, 5, 5)].reduce((d, c) => ajouterForme(d, c, style).dessin, VIDE);
const boite = (d: DessinSvg, id: string) => { const f = d.formes.find(x => x.id === id); const b = f ? boiteForme(f) : null; if (!b) throw new Error(id); return b; };
const arrondir = (v: number) => Math.round(v * 1000) / 1000;

describe('dupliquer en grille', () => {
  it('3 x 4 : douze exemplaires, onze copies au pas donne, ligne par ligne', () => {
    const r = dupliquerEnGrille(DESSIN, ['f1'], { lignes: 3, colonnes: 4, pasX: 15, pasY: 20 });
    expect(r.copies).toBe(11);
    expect(r.ids.length).toBe(12);
    expect(r.dessin.formes.length).toBe(DESSIN.formes.length + 11);
    const positions = r.ids.map(id => { const b = boite(r.dessin, id); return [b.x, b.y]; });
    const attendues = [0, 1, 2].flatMap(l => [0, 1, 2, 3].map(c => [10 + 15 * c, 10 + 20 * l]));
    expect(positions).toEqual(attendues);
  });

  it('pose les copies juste au-dessus de la plus haute forme choisie, chaque jeu dans l ordre d empilement', () => {
    const r = dupliquerEnGrille(DESSIN, ['f2', 'f1'], { lignes: 1, colonnes: 3, pasX: 50, pasY: 0 });
    expect(r.dessin.formes.map(f => f.id)).toEqual(['f1', 'f2', 'f4', 'f5', 'f6', 'f7', 'f3']);
    // Chaque jeu reprend f1 puis f2 : f4 et f6 sont des carres, f5 et f7 des ellipses.
    expect(boite(r.dessin, 'f4')).toEqual({ ...boite(DESSIN, 'f1'), x: 60 });
    expect(boite(r.dessin, 'f7').x).toBeCloseTo(200, 9);
  });

  it('1 x 1 ne change rien ; une grille hors bornes est refusee, et le dit', () => {
    expect(dupliquerEnGrille(DESSIN, ['f1'], { lignes: 1, colonnes: 1, pasX: 5, pasY: 5 }).dessin).toBe(DESSIN);
    const r = dupliquerEnGrille(DESSIN, ['f1'], { lignes: REPETITION_MAX.cote + 1, colonnes: 2, pasX: 1, pasY: 1 });
    expect(r.dessin).toBe(DESSIN);
    expect(r.erreur).toMatch(/de 1 à 100/);
    expect(dupliquerEnGrille(DESSIN, ['f1'], { lignes: 2.5, colonnes: 2, pasX: 1, pasY: 1 }).erreur).toBeTruthy();
    expect(dupliquerEnGrille(DESSIN, ['inconnue'], { lignes: 2, colonnes: 2, pasX: 1, pasY: 1 }).erreur).toBeTruthy();
  });

  it('propose un pas egal a la taille, plus un dixieme du plus grand cote', () => {
    expect(pasGrilleParDefaut(DESSIN, ['f2'])).toEqual({ pasX: 22, pasY: 12 });
  });

  it('est deterministe : memes reglages, memes octets', () => {
    const a = dupliquerEnGrille(DESSIN, ['f1', 'f2'], { lignes: 3, colonnes: 4, pasX: 12.5, pasY: -7 });
    const b = dupliquerEnGrille(DESSIN, ['f1', 'f2'], { lignes: 3, colonnes: 4, pasX: 12.5, pasY: -7 });
    expect(ecrireDessin(a.dessin, 3)).toBe(ecrireDessin(b.dessin, 3));
  });
});

describe('la repetition radiale', () => {
  const centre: [number, number] = [200, 200];
  /** Un petit carre au-dessus du centre : ses huit exemplaires font une couronne. */
  const PETALE = ajouterForme(VIDE, rectangle(195, 100, 10, 10), style).dessin;

  it('un tour complet partage 360 degres entre les exemplaires ; un arc place les deux bouts', () => {
    expect(pasRadial(8, 360)).toBe(45);
    expect(pasRadial(5, 180)).toBe(45);
    expect(matricesRadiales({ exemplaires: 4, angle: 360, centre, orienter: true }, [0, 0]).length).toBe(3);
  });

  it('8 exemplaires : huit carres sur le cercle de rayon 95, a 45 degres l un de l autre', () => {
    const r = repetitionRadiale(PETALE, ['f1'], { exemplaires: 8, angle: 360, centre, orienter: true });
    expect(r.copies).toBe(7);
    const centres = r.ids.map(id => { const b = boite(r.dessin, id); return [b.x + b.l / 2 - 200, b.y + b.h / 2 - 200]; });
    centres.forEach(([x, y], k) => {
      expect(Math.hypot(x ?? 0, y ?? 0)).toBeCloseTo(95, 6);
      const angle = (Math.atan2(y ?? 0, x ?? 0) * 180) / Math.PI;
      expect(arrondir(((angle + 90 - 45 * k) % 360 + 360) % 360) % 360).toBe(0);
    });
  });

  it('sans orienter, les copies se deplacent sans tourner (leur boite garde sa taille)', () => {
    const PLAT = ajouterForme(VIDE, rectangle(190, 100, 20, 6), style).dessin;
    const r = repetitionRadiale(PLAT, ['f1'], { exemplaires: 4, angle: 360, centre, orienter: false });
    for (const id of r.ids) { const b = boite(r.dessin, id); expect([arrondir(b.l), arrondir(b.h)]).toEqual([20, 6]); }
    const tourne = repetitionRadiale(PLAT, ['f1'], { exemplaires: 4, angle: 360, centre, orienter: true });
    expect(arrondir(boite(tourne.dessin, au(tourne.ids, 1)).l)).toBe(6);
  });

  it('refuse un nombre ou un angle hors bornes', () => {
    expect(repetitionRadiale(PETALE, ['f1'], { exemplaires: 1, angle: 360, centre, orienter: true }).erreur).toBeTruthy();
    expect(repetitionRadiale(PETALE, ['f1'], { exemplaires: 8, angle: 0, centre, orienter: true }).erreur).toBeTruthy();
    expect(repetitionRadiale(PETALE, ['f1'], { exemplaires: 8, angle: 400, centre, orienter: true }).erreur).toBeTruthy();
  });

  it('est deterministe', () => {
    const r = () => ecrireDessin(repetitionRadiale(PETALE, ['f1'], { exemplaires: 12, angle: 270, centre, orienter: true }).dessin, 3);
    expect(r()).toBe(r());
  });
});

describe('la symetrie', () => {
  it('miroir horizontal autour du centre de la selection, en gardant l original : le reflet tombe sur lui-meme', () => {
    const axe = axeParDefaut(DESSIN, ['f1'], 'h');
    expect(axe).toBe(15);
    const r = symetrie(DESSIN, ['f1'], { sens: 'h', axe, garder: true });
    expect(r.copies).toBe(1);
    expect(boite(r.dessin, 'f4')).toEqual(boite(DESSIN, 'f1'));
  });

  it('autour d un repere : le reflet passe de l autre cote de l axe', () => {
    const r = symetrie(DESSIN, ['f1'], { sens: 'h', axe: 50, garder: true });
    expect(boite(r.dessin, 'f4')).toMatchObject({ x: 80, y: 10, l: 10, h: 10 });
    const v = symetrie(DESSIN, ['f2'], { sens: 'v', axe: 0, garder: true });
    const b = boite(v.dessin, 'f4');
    expect([arrondir(b.y), arrondir(b.h)]).toEqual([-110, 10]);
  });

  it('sans garder l original, la selection se retourne en place : aucune forme de plus', () => {
    const r = symetrie(DESSIN, ['f1', 'f3'], { sens: 'v', axe: 200, garder: false });
    expect(r.copies).toBe(0);
    expect(r.dessin.formes.length).toBe(DESSIN.formes.length);
    expect(boite(r.dessin, 'f1').y).toBe(380);
    // Deux miroirs du meme axe s'annulent.
    const deux = symetrie(r.dessin, ['f1', 'f3'], { sens: 'v', axe: 200, garder: false });
    expect(boiteDe(deux.dessin, ['f1', 'f3'])).toEqual(boiteDe(DESSIN, ['f1', 'f3']));
  });
});
