// Le texte deforme dans une forme (ADR-0032) : le profil vertical d'une forme (rectangle, cercle, cœur, etoile, trous ignores),
// l'enveloppe (identite a l'echelle pres sur un rectangle, la marge), la deformation d'un chemin rebatie en courbes dans sa
// tolerance, la pose (lettres dans la silhouette, curseurs envoyes, trace median dans la meme boite), les refus nommes sans lever,
// le determinisme, la memoire, le lien a la forme (forme modifiee, supprimee, masquee), l'ecriture et la relecture, le projet JSON,
// et le temps d'un texte de quarante lettres dans un cœur avec une vraie fonte.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'opentype.js';
import { describe, expect, it } from 'vitest';
import {
  dessinSansTextes, ecrireDessin, ellipse, lireDessin, modifier, polygone, rectangle, supprimer, type Chemin, type DessinSvg, type DispositionTexte, type Forme, type TexteVivant
} from '../../../src/engine/editionSvg.js';
import { cheminDuTexte, composerBloc } from '../../../src/engine/texte/bloc.js';
import { creerTexte, nouveauTexte, peintureDuTexte } from '../../../src/engine/texte/vivant.js';
import { composerDansDessin, composerDispose, suivreDispositions } from '../../../src/engine/texte/disposition.js';
import { bordsA, contourExterieur, deformerChemin, enveloppeDe, PENTE_RAMPE, poserEnveloppe, profilDe, tailleEnveloppe, TOLERANCE_ENVELOPPE, type Deformation } from '../../../src/engine/texte/enveloppe.js';
import { glyphesMedians } from '../../../src/engine/texte/mediane.js';
import { intervallesA } from '../../../src/engine/texte/dansForme.js';
import { polygonesDe, type Pt } from '../../../src/engine/texte/trace.js';
import { glyphesDe as glyphesDeFonte } from '../../../src/io/polices.js';
import { etatDuProjet, projetDe, texteDuProjet, type EtatProjet } from '../../../src/engine/projet.js';
import { lireProjet } from '../../../src/model/projet.js';
import { nettoyerSvg } from '../../../src/util/svg.js';
import { au } from '../../../src/util/tableaux.js';
import { violationsEcriture } from '../securite/invariants.js';
import { glyphesCarres } from './glyphesFactices.js';

const police = { id: 'inter', version: '0123456789abcd' };
const PEINTURE = peintureDuTexte('contour', { remplissage: '#15181d', contour: null, epaisseur: 1 }, 1);
const glyphesDe = () => glyphesCarres;
const base = (id: string, d: Chemin, reglages: Partial<Forme> = {}): Forme => ({ id, d, remplissage: '#c81e28', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, ...reglages });
const ENV = (forme: string, marge = 0.05): DispositionTexte => ({ mode: 'enveloppe', forme, marge });

const COEUR: Chemin = [
  { c: 'M', p: [150, 35] }, { c: 'C', p: [150, 15, 120, 5, 110, 25] }, { c: 'C', p: [100, 45, 130, 70, 150, 90] },
  { c: 'C', p: [170, 70, 200, 45, 190, 25] }, { c: 'C', p: [180, 5, 150, 15, 150, 35] }, { c: 'Z', p: [] }
];
/** Une etoile a cinq branches de centre (200, 200), rayons 150 et 60, une pointe en haut (sommets arrondis au millieme). */
const ETOILE: Chemin = polygone(Array.from({ length: 10 }, (_, i): [number, number] => {
  const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 60 : 150;
  return [Number((200 + r * Math.cos(a)).toFixed(3)), Number((200 + r * Math.sin(a)).toFixed(3))];
}), true);

/** Les ancres d'un chemin (le dernier point de chaque commande). */
const ancres = (d: Chemin): Pt[] => d.filter(c => c.c !== 'Z').map(c => [c.p[c.p.length - 2] ?? 0, c.p[c.p.length - 1] ?? 0]);
/** Le point d'une commande (depuis `de`) au parametre t. */
function pointDe(de: Pt, c: Chemin[number], t: number): Pt {
  const p = c.p, u = 1 - t;
  if (c.c === 'L') return [de[0] * u + (p[0] ?? 0) * t, de[1] * u + (p[1] ?? 0) * t];
  if (c.c === 'Q') return [u * u * de[0] + 2 * u * t * (p[0] ?? 0) + t * t * (p[2] ?? 0), u * u * de[1] + 2 * u * t * (p[1] ?? 0) + t * t * (p[3] ?? 0)];
  return [u * u * u * de[0] + 3 * u * u * t * (p[0] ?? 0) + 3 * u * t * t * (p[2] ?? 0) + t * t * t * (p[4] ?? 0), u * u * u * de[1] + 3 * u * u * t * (p[1] ?? 0) + 3 * u * t * t * (p[3] ?? 0) + t * t * t * (p[5] ?? 0)];
}
/** Des points tout au long d'un chemin, `n` par segment. */
function echantillons(d: Chemin, n = 16): Pt[] {
  const r: Pt[] = [];
  let cour: Pt = [0, 0], depart: Pt = [0, 0];
  for (const c of d) {
    if (c.c === 'M') { cour = depart = [c.p[0] ?? 0, c.p[1] ?? 0]; r.push(cour); continue; }
    if (c.c === 'Z') { for (let k = 1; k <= n; k++) r.push([cour[0] + (depart[0] - cour[0]) * k / n, cour[1] + (depart[1] - cour[1]) * k / n]); cour = depart; continue; }
    for (let k = 1; k <= n; k++) r.push(pointDe(cour, c, k / n));
    cour = [c.p[c.p.length - 2] ?? 0, c.p[c.p.length - 1] ?? 0];
  }
  return r;
}
const distance2Segment = (p: Pt, a: Pt, b: Pt): number => {
  const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy, u = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2)) : 0;
  return (p[0] - a[0] - vx * u) ** 2 + (p[1] - a[1] - vy * u) ** 2;
};
/** La plus grande distance d'un point de `a` a la polyligne `b`. */
const ecartA = (a: readonly Pt[], b: readonly Pt[]): number => Math.sqrt(Math.max(...a.map(p => Math.min(...b.slice(1).map((q, i) => distance2Segment(p, au(b, i), q)))))) ;
/** Vrai si le point est dans la forme (regle non nulle), ou a moins de `e` de son bord. */
const dedans = (polys: readonly (readonly Pt[])[], p: Pt, e: number): boolean =>
  intervallesA(polys, 'nonzero', p[1]).some(([a, b]) => p[0] >= a - e && p[0] <= b + e) || polys.some(q => q.some((s, i) => distance2Segment(p, s, au(q, (i + 1) % q.length)) <= e * e));

/** Un dessin : la forme de base, puis un texte vivant deforme dans elle (ses contours composes). */
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
const boite = (pts: readonly Pt[]) => ({ x0: Math.min(...pts.map(p => p[0])), y0: Math.min(...pts.map(p => p[1])), x1: Math.max(...pts.map(p => p[0])), y1: Math.max(...pts.map(p => p[1])) });

describe('le profil vertical d une forme', () => {
  it('sur un rectangle : le haut et le bas sont constants, les bornes celles du rectangle', () => {
    const p = profilDe(rectangle(10, 20, 100, 50));
    if (!p) throw new Error('profil');
    expect([p.x0, p.x1, p.y0, p.y1]).toEqual([10, 110, 20, 70]);
    for (const x of [10, 33.3, 60, 110]) expect(bordsA(p, x)).toEqual([20, 70]);
    // Au-dela de la forme, le profil se borne a ses bouts.
    expect(bordsA(p, -50)).toEqual([20, 70]);
  });

  it('sur un cercle : le haut et le bas suivent la corde a chaque abscisse, a un millieme du rayon', () => {
    const r = 100, p = profilDe(ellipse(0, 0, 2 * r, 2 * r));
    if (!p) throw new Error('profil');
    for (const x of [0, 25, 50, 100, 150, 190]) {
      const h = Math.sqrt(r * r - (x - r) * (x - r)), [haut, bas] = bordsA(p, x);
      expect(Math.abs(haut - (r - h)), 'x = ' + x).toBeLessThan(0.001 * r * 10);
      expect(Math.abs(bas - (r + h)), 'x = ' + x).toBeLessThan(0.001 * r * 10);
    }
  });

  it('sur un cœur : au milieu, le haut est le creux entre les lobes et le bas la pointe', () => {
    const p = profilDe(COEUR);
    if (!p) throw new Error('profil');
    const [haut, bas] = bordsA(p, 150);
    expect(haut).toBeCloseTo(35, 1);
    expect(bas).toBeCloseTo(90, 1);
    // Au-dessus d'un lobe, le haut monte plus haut que le creux.
    expect(au(bordsA(p, 125), 0)).toBeLessThan(haut - 10);
  });

  it('sur une etoile : au milieu, la pointe et le creux ; les branches du bas sans dechirure, en rampe, dans la forme', () => {
    const p = profilDe(ETOILE);
    if (!p) throw new Error('profil');
    expect(p.x0).toBeCloseTo(57.342, 2);
    expect(p.x1).toBeCloseTo(342.658, 2);
    const [haut, bas] = bordsA(p, 200);
    expect(haut).toBeCloseTo(50, 6);
    expect(bas).toBeCloseTo(260, 6);
    // Au pied de chaque branche du bas, le bord saute d'un morceau a l'autre : deux rampes, vers l'interieur de la branche.
    expect(p.sautsBas.length).toBe(2);
    expect(p.sautsHaut.length).toBe(0);
    // D'une abscisse a la suivante, rien ne saute (au plus la pente de la rampe), et chaque colonne reste dans l'etoile.
    const polys = polygonesDe(ETOILE), pas = (p.x1 - p.x0) / 800;
    let avant = bordsA(p, p.x0);
    for (let k = 1; k <= 800; k++) {
      const x = p.x0 + k * pas, [h, b] = bordsA(p, x);
      expect(Math.abs(b - avant[1]), 'x = ' + x).toBeLessThan(PENTE_RAMPE * pas + 1e-6 + 2 * pas);
      expect(Math.abs(h - avant[0]), 'x = ' + x).toBeLessThan(3 * pas);
      for (const t of [0.02, 0.5, 0.98]) expect(dedans(polys, [x, h + t * (b - h)], 1e-6), 'x = ' + x + ', t = ' + t).toBe(true);
      avant = [h, b];
    }
    // La branche s'y remplit en partie : la colonne descend sous les bras.
    expect(au(bordsA(p, 160), 1)).toBeGreaterThan(240);
  });

  it('ne lit que le contour exterieur : les trous et les petits morceaux sont ignores', () => {
    const anneau: Chemin = [...ellipse(0, 0, 200, 200), ...ellipse(50, 50, 100, 100), ...rectangle(400, 0, 10, 10)];
    expect(contourExterieur(anneau)?.length).toBe(au(polygonesDe(anneau), 0).length);
    const p = profilDe(anneau);
    if (!p) throw new Error('profil');
    expect(p.x1).toBeCloseTo(200, 6);
    const [haut, bas] = bordsA(p, 100);
    expect(haut).toBeCloseTo(0, 3);
    expect(bas).toBeCloseTo(200, 3);
  });

  it('n a pas de profil pour une forme sans aire, et le memorise par chemin', () => {
    expect(profilDe(polygone([[0, 0], [100, 0]], false))).toBeNull();
    expect(profilDe(polygone([[0, 0], [100, 0], [50, 0]], true))).toBeNull();
    const d = ellipse(0, 0, 10, 10);
    expect(profilDe(d)).toBe(profilDe(d));
  });
});

describe('l enveloppe verticale', () => {
  it('sur un rectangle, sans marge : l identite a l echelle pres', () => {
    const p = profilDe(rectangle(100, 50, 200, 80));
    if (!p) throw new Error('profil');
    const f = enveloppeDe(p, { x: 0, y: -10, l: 40, h: 20 }, 0);
    if (!f) throw new Error('enveloppe');
    for (const [x, y] of [[0, -10], [40, 10], [10, 0], [33, -2.5]] as const) {
      const [X, Y] = f(x, y);
      expect(X).toBeCloseTo(100 + x * 5, 9);
      expect(Y).toBeCloseTo(50 + (y + 10) * 4, 9);
    }
  });

  it('la marge rapproche le texte de l interieur, de la meme distance de chaque cote', () => {
    const p = profilDe(rectangle(100, 50, 200, 80));
    if (!p) throw new Error('profil');
    const f = enveloppeDe(p, { x: 0, y: 0, l: 1, h: 1 }, 7);
    if (!f) throw new Error('enveloppe');
    expect(f(0, 0)).toEqual([107, 57]);
    expect(f(1, 1)).toEqual([293, 123]);
    // Une marge qui mange la forme : pas d'enveloppe.
    expect(enveloppeDe(p, { x: 0, y: 0, l: 1, h: 1 }, 40)).toBeNull();
    expect(enveloppeDe(p, { x: 0, y: 0, l: 0, h: 1 }, 0)).toBeNull();
  });

  it('sur un cercle, une colonne plus etroite que deux marges se reduit a son milieu', () => {
    const p = profilDe(ellipse(0, 0, 200, 200));
    if (!p) throw new Error('profil');
    const f = enveloppeDe(p, { x: 0, y: 0, l: 100, h: 10 }, 10);
    if (!f) throw new Error('enveloppe');
    const [x, haut] = f(0, 0), [, bas] = f(0, 10);
    expect(x).toBe(10);
    // A dix unites du bord, la corde fait 2 x 43,6 : moins deux marges, elle garde 67,2 de haut.
    expect(bas - haut).toBeCloseTo(2 * Math.sqrt(100 * 100 - 90 * 90) - 20, 0);
  });
});

describe('la deformation d un chemin', () => {
  // Une enveloppe connue et lisse : une parabole verticale.
  const f = (x: number, y: number): Pt => [x, y + 0.004 * (x - 100) * (x - 100)];
  const def: Deformation = { f, pas: 0.6, tolerance: 0.04, h: 1e-3 };

  it('rebatit chaque segment en cubiques, a la tolerance pres du chemin vraiment deforme', () => {
    const d: Chemin = [{ c: 'M', p: [0, 0] }, { c: 'L', p: [200, 0] }, { c: 'C', p: [220, 40, 160, 80, 100, 60] }, { c: 'Q', p: [40, 40, 0, 0] }, { c: 'Z', p: [] }];
    const r = deformerChemin(d, def);
    expect(r[0]).toEqual({ c: 'M', p: [0, 40] });
    expect(au(r, r.length - 1)).toEqual({ c: 'Z', p: [] });
    expect(r.some(c => c.c === 'C')).toBe(true);
    const vrai = echantillons(d, 64).map(p => f(p[0], p[1])), rebati = echantillons(r, 64);
    // Dans les deux sens : le chemin rebati suit le vrai, et le vrai le rebati (un peu plus que la tolerance : l'arrondi au millieme).
    expect(ecartA(vrai, rebati)).toBeLessThan(def.tolerance * 1.5);
    expect(ecartA(rebati, vrai)).toBeLessThan(def.tolerance * 1.5);
  });

  it('garde un coin, et une jonction lisse reste lisse', () => {
    // Un coin a angle droit en (100, 0), puis deux cubiques jointes sans pli en (200, 50).
    const d: Chemin = [{ c: 'M', p: [0, 0] }, { c: 'L', p: [100, 0] }, { c: 'L', p: [100, 50] }, { c: 'C', p: [100, 80, 150, 50, 200, 50] }, { c: 'C', p: [250, 50, 250, 0, 300, 0] }];
    const r = deformerChemin(d, def);
    const fin = (i: number): Pt => { const c = au(r, i); return [c.p[c.p.length - 2] ?? 0, c.p[c.p.length - 1] ?? 0]; };
    // Les ancres du chemin d'origine sont exactement envoyees (au millieme).
    const coin = f(100, 0), jonction = f(200, 50);
    expect(r.some((c, i) => c.c !== 'Z' && i > 0 && Math.abs(fin(i)[0] - coin[0]) < 1e-3 && Math.abs(fin(i)[1] - coin[1]) < 1e-3)).toBe(true);
    const j = r.findIndex((_, i) => i > 0 && Math.abs(fin(i)[0] - jonction[0]) < 1e-3 && Math.abs(fin(i)[1] - jonction[1]) < 1e-3);
    const avant = au(r, j), apres = au(r, j + 1);
    expect(avant.c).toBe('C');
    expect(apres.c).toBe('C');
    // Les poignees de part et d'autre de la jonction sont alignees avec elle : la tangente est continue.
    const a: Pt = [(avant.p[2] ?? 0) - jonction[0], (avant.p[3] ?? 0) - jonction[1]], b: Pt = [(apres.p[0] ?? 0) - jonction[0], (apres.p[1] ?? 0) - jonction[1]];
    const sinus = (a[0] * b[1] - a[1] * b[0]) / (Math.hypot(...a) * Math.hypot(...b));
    expect(Math.abs(sinus)).toBeLessThan(0.002);
  });

  it('memes entrees, memes commandes', () => {
    const d: Chemin = [{ c: 'M', p: [0, 0] }, { c: 'C', p: [30, -80, 90, 120, 140, 10] }];
    expect(deformerChemin(d, def)).toEqual(deformerChemin(d, def));
  });
});

describe('le texte deforme dans une forme', () => {
  const reglages = { texte: 'AVEC\nAMOUR', interlettrage: 0, interligne: 1.2, alignement: 'centre' as const, ligatures: false, marge: 0 };

  it('sur un rectangle, sans marge : les lettres carrees restent des rectangles, mises a l echelle de la forme', () => {
    const rect = base('f1', rectangle(100, 100, 200, 100));
    const p = poserEnveloppe(reglages, rect, glyphesCarres, glyphesCarres, 20);
    expect(p.refus).toBeUndefined();
    expect(p.lettres.length).toBe(9);
    const tout = p.lettres.flatMap(l => ancres(l.d));
    // Seulement des droites, et la boite du texte est celle du rectangle.
    expect(p.lettres.every(l => l.d.every(c => c.c !== 'C'))).toBe(true);
    const b = boite(tout);
    expect([b.x0, b.y0, b.x1, b.y1].map(v => Math.round(v * 1000) / 1000)).toEqual([100, 100, 300, 200]);
    // Chaque lettre d'origine est l'image affine de la lettre droite.
    const droit = composerBloc({ ...reglages, taille: 20 }, glyphesCarres).flatMap(l => ancres(l.d)), bd = boite(droit);
    const kx = 200 / (bd.x1 - bd.x0), ky = 100 / (bd.y1 - bd.y0);
    droit.forEach((q, i) => {
      const r = au(tout, i);
      expect(r[0]).toBeCloseTo(100 + (q[0] - bd.x0) * kx, 2);
      expect(r[1]).toBeCloseTo(100 + (q[1] - bd.y0) * ky, 2);
    });
  });

  it('la marge eloigne le texte du bord, en part de la taille', () => {
    const rect = base('f1', rectangle(100, 100, 200, 100));
    const p = poserEnveloppe({ ...reglages, marge: 0.25 }, rect, glyphesCarres, glyphesCarres, 20);
    const b = boite(p.lettres.flatMap(l => ancres(l.d)));
    expect([b.x0, b.y0, b.x1, b.y1].map(v => Math.round(v * 1000) / 1000)).toEqual([105, 105, 295, 195]);
  });

  for (const [nom, d] of [['un cercle', ellipse(50, 50, 300, 300)], ['un cœur', COEUR], ['une etoile', ETOILE]] as const) {
    it('dans ' + nom + ' : toutes les lettres restent dans la silhouette et la remplissent, de bord a bord', () => {
      const f = base('f1', d), polys = polygonesDe(d);
      const pr = profilDe(d);
      if (!pr) throw new Error('profil');
      const taille = tailleEnveloppe({ ...reglages, taille: 20 }, f, glyphesCarres);
      const p = poserEnveloppe({ ...reglages, marge: 0.05 }, f, glyphesCarres, glyphesCarres, taille);
      const pts = p.lettres.flatMap(l => echantillons(l.d, 8));
      expect(pts.length).toBeGreaterThan(0);
      const tol = TOLERANCE_ENVELOPPE * taille * 2;
      expect(pts.filter(q => !dedans(polys, q, tol)).length, 'points hors de ' + nom).toBe(0);
      // Le bloc couvre la forme, a la marge pres (5 % de la taille de chaque cote, et un peu de jeu pour les bords courbes).
      const b = boite(pts), m = 0.05 * taille;
      expect(b.x0 - pr.x0).toBeLessThan(m + 1);
      expect(pr.x1 - b.x1).toBeLessThan(m + 1);
      expect(b.y0 - pr.y0).toBeLessThan((pr.y1 - pr.y0) * 0.1);
      // Les pointes des branches du bas d'une etoile ne se remplissent pas (la colonne garde le morceau du milieu) : le bas du texte
      // y atteint au moins le creux entre elles.
      expect(pr.y1 - b.y1).toBeLessThan(nom === 'une etoile' ? pr.y1 - 255 : (pr.y1 - pr.y0) * 0.1);
    });
  }

  it('dans un cœur : la colonne du milieu va du creux entre les lobes a la pointe', () => {
    const p = profilDe(COEUR);
    if (!p) throw new Error('profil');
    const [h, b] = bordsA(p, 150);
    expect(h).toBeCloseTo(35, 1);
    expect(b).toBeCloseTo(90, 1);
    expect(p.sautsHaut.length + p.sautsBas.length).toBe(0);
    // Un texte d'une ligne : au milieu, son haut descend au creux et son bas a la pointe ; sur un lobe, son haut monte plus haut.
    const f = base('f1', COEUR), r = { ...reglages, texte: 'MMMMMMM', marge: 0 }, taille = tailleEnveloppe({ ...r, taille: 20 }, f, glyphesCarres);
    const pts = poserEnveloppe(r, f, glyphesCarres, glyphesCarres, taille).lettres.flatMap(l => echantillons(l.d, 8));
    const autour = (x: number, e = 0.3) => pts.filter(q => Math.abs(q[0] - x) < e);
    expect(Math.min(...autour(150).map(q => q[1]))).toBeGreaterThan(30);
    expect(Math.max(...autour(150).map(q => q[1]))).toBeGreaterThan(88);
    expect(Math.min(...autour(125, 2).map(q => q[1]))).toBeLessThan(20);
  });

  it('les curseurs de la saisie sont ceux du texte droit, envoyes par la meme enveloppe', () => {
    const rect = base('f1', rectangle(100, 100, 200, 100));
    const p = poserEnveloppe(reglages, rect, glyphesCarres, glyphesCarres, 20);
    expect(p.carets.length).toBe(reglages.texte.length + 1);
    expect(p.lignes).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]);
    // Un curseur reste vertical (la deformation garde les colonnes), du bas vers le haut du cadratin.
    for (const c of p.carets) { expect(c[0][0]).toBeCloseTo(c[1][0], 9); expect(c[0][1]).toBeGreaterThan(c[1][1]); }
    // Le curseur apres la derniere lettre tombe a son avance, un peu au-dela de son contour (le bord droit de la forme).
    expect(au(p.carets, 10)[0][0]).toBeGreaterThan(300);
    expect(au(p.carets, 10)[0][0]).toBeLessThan(310);
  });

  it('en trace median : la ligne mediane de chaque lettre droite, deformee dans la boite des lettres pleines', () => {
    const f = base('f1', ellipse(0, 0, 200, 200));
    const plein = poserEnveloppe(reglages, f, glyphesCarres, glyphesCarres, 20), median = poserEnveloppe(reglages, f, glyphesCarres, glyphesMedians(glyphesCarres), 20);
    expect(median.carets).toEqual(plein.carets);
    expect(median.lettres.length).toBe(plein.lettres.length);
    // Des traces ouverts, au milieu des lettres pleines : leur boite est dans celle des lettres pleines.
    expect(median.lettres.every(l => !l.d.some(c => c.c === 'Z'))).toBe(true);
    const bp = boite(plein.lettres.flatMap(l => ancres(l.d))), bm = boite(median.lettres.flatMap(l => ancres(l.d)));
    expect(bm.x0).toBeGreaterThan(bp.x0); expect(bm.x1).toBeLessThan(bp.x1);
    expect(bm.y0).toBeGreaterThan(bp.y0 - 1); expect(bm.y1).toBeLessThan(bp.y1 + 1);
  });

  it('refuse en le nommant, sans lever : un texte vide, une forme sans aire, une marge qui mange la forme', () => {
    const cercle = base('f1', ellipse(0, 0, 100, 100));
    const vide = poserEnveloppe({ ...reglages, texte: '  \n ' }, cercle, glyphesCarres, glyphesCarres, 20);
    expect(vide.refus).toBe('texte-vide');
    expect(vide.lettres).toEqual([]);
    expect(vide.carets.length).toBe(5);
    expect(poserEnveloppe(reglages, base('f2', polygone([[0, 0], [100, 50]], false)), glyphesCarres, glyphesCarres, 20).refus).toBe('forme-sans-aire');
    expect(poserEnveloppe({ ...reglages, marge: 3 }, cercle, glyphesCarres, glyphesCarres, 20).refus).toBe('marge');
  });

  it('memes entrees, memes contours ; la composition se memorise par forme et par texte', () => {
    const f = base('f1', COEUR);
    const t: TexteVivant = { ...nouveauTexte('Je t’aime', police, 12, [1, 0, 0, 1, 0, 0]), disposition: ENV('f1') };
    const a = composerDispose(t, f, glyphesCarres), b = composerDispose({ ...t }, { ...f }, glyphesCarres);
    expect(b.d).toEqual(a.d);
    expect(JSON.stringify(b.texte)).toBe(JSON.stringify(a.texte));
    // La meme forme et le meme texte : la meme composition, sans recalcul.
    expect(composerDispose({ ...t }, f, glyphesCarres).d).toBe(a.d);
    // La taille se calcule : la hauteur de la forme sur celle du bloc, au centieme vers le bas.
    const p = profilDe(COEUR);
    if (!p) throw new Error('profil');
    expect(a.texte.taille).toBe(Math.floor(((p.y1 - p.y0) / 0.7) * 100) / 100);
  });
});

describe('le lien d un texte deforme a sa forme', () => {
  it('la forme modifiee redeforme le texte ; supprimee, il redevient libre ; masquee, il garde le lien', () => {
    const { dessin, id } = dessinAvec([base('f1', ellipse(100, 100, 100, 100))], 'BADGE', ENV('f1'));
    const avant = boite(ancres(forme(dessin, id).d));
    expect(avant.x0).toBeGreaterThan(100); expect(avant.x1).toBeLessThan(200);
    const plus = { ...dessin, formes: dessin.formes.map(f => (f.id === 'f1' ? { ...f, d: ellipse(50, 50, 300, 200) } : f)) };
    const r = suivreDispositions(dessin, plus, glyphesDe);
    const apres = boite(ancres(forme(r.dessin, id).d));
    expect(apres.x0).toBeLessThan(80); expect(apres.x1).toBeGreaterThan(320);
    expect(forme(r.dessin, id).texte?.disposition).toEqual(ENV('f1'));
    const sans = suivreDispositions(dessin, supprimer(dessin, ['f1']), glyphesDe);
    expect(sans.libres).toEqual([id]);
    expect(forme(sans.dessin, id).texte?.disposition).toBeUndefined();
    const masquee = suivreDispositions(dessin, modifier(dessin, ['f1'], { visible: false }), glyphesDe);
    expect(forme(masquee.dessin, id).texte?.disposition).toEqual(ENV('f1'));
    expect(forme(masquee.dessin, id).d).toBe(forme(dessin, id).d);
  });

  it('une forme devenue sans aire laisse le texte dans ses contours (il se redeformera)', () => {
    const { dessin, id } = dessinAvec([base('f1', ellipse(100, 100, 100, 100))], 'BADGE', ENV('f1'));
    const plat = { ...dessin, formes: dessin.formes.map(f => (f.id === 'f1' ? { ...f, d: polygone([[0, 0], [100, 0]], false) } : f)) };
    const r = suivreDispositions(dessin, plat, glyphesDe);
    expect(forme(r.dessin, id).d).toBe(forme(dessin, id).d);
    expect(forme(r.dessin, id).texte?.disposition).toEqual(ENV('f1'));
  });
});

describe('l ecriture et la relecture d un texte deforme', () => {
  it('ecrit data-ed-disposition="enveloppe", la marge seulement hors de son defaut, et se relit a l identique', () => {
    for (const marge of [0.05, 0.3]) {
      const { dessin, id } = dessinAvec([base('f1', COEUR)], 'Je t’aime', ENV('f1', marge));
      const svg = enregistrer(dessin);
      expect(svg).toContain('data-ed-disposition="enveloppe"');
      expect(svg.includes('data-ed-marge'), 'marge ' + marge).toBe(marge !== 0.05);
      expect(svg).not.toMatch(/data-ed-(?:ajuster|justifier|depart|cote|repartir)/);
      expect(violationsEcriture(svg)).toEqual([]);
      const relu = lire(svg), t = relu.formes.find(f => f.texte)?.texte;
      expect(t?.disposition).toEqual({ mode: 'enveloppe', forme: au(relu.formes, 0).id, marge });
      expect(enregistrer(relu)).toBe(svg);
      void id;
    }
  });

  it('une forme masquee voyage avec son texte, encodee', () => {
    const { dessin } = dessinAvec([base('f1', COEUR)], 'Amour', ENV('f1'));
    const svg = enregistrer(modifier(dessin, ['f1'], { visible: false }));
    expect(svg).toContain('data-ed-forme-d=');
    const relu = lire(svg);
    expect(relu.formes.find(f => f.texte)?.texte?.disposition?.mode).toBe('enveloppe');
    expect(relu.formes.some(f => !f.texte && !f.visible)).toBe(true);
    expect(enregistrer(relu)).toBe(svg);
  });

  it('une marge hors de ses bornes laisse le texte en contours, et le dit', () => {
    const { dessin } = dessinAvec([base('f1', COEUR)], 'Amour', ENV('f1'));
    const svg = enregistrer(dessin);
    for (const faux of ['-1', '1e9', 'abc']) {
      const r = lireDessin(svg.replace('data-ed-disposition="enveloppe"', 'data-ed-disposition="enveloppe" data-ed-marge="' + faux + '"'));
      if ('erreur' in r) throw new Error(r.erreur);
      expect(r.dessin.formes.some(f => f.texte), faux).toBe(false);
      expect(r.ignores.join(' ')).toMatch(/illisibles/);
    }
  });

  it('l ancien remplissage en lignes se relit et se reecrit a l identique (la reference texte-dans-forme)', () => {
    const svg = readFileSync(resolve(__dirname, '../../fixtures/svg/texte-dans-forme.attendu.svg'), 'utf8');
    const relu = lire(svg);
    expect(relu.formes.filter(f => f.texte).every(f => f.texte?.disposition?.mode === 'dans')).toBe(true);
    expect(enregistrer(relu)).toBe(svg);
  });

  it('l export ne porte que des contours', () => {
    const { dessin } = dessinAvec([base('f1', COEUR)], 'Amour', ENV('f1'));
    const svg = ecrireDessin(dessinSansTextes(dessin), 3);
    expect(svg).not.toContain('data-ed-');
    expect(svg).not.toMatch(/<text|textPath/);
  });
});

const etat = (dessin: DessinSvg): EtatProjet => ({ nom: 'essai', dessin, production: { contexte: 'generique' }, nuancier: [], polices: [], images: [] });

describe('le projet JSON d un texte deforme', () => {
  it('garde la disposition et sa forme, et se relit a l identique, octet pour octet', () => {
    const { dessin } = dessinAvec([base('f1', COEUR)], 'Avec\namour', ENV('f1', 0.15));
    const texte = texteDuProjet(projetDe(etat(dessin)));
    expect(texte).toContain('"disposition":{"mode":"enveloppe","forme":"f1","marge":0.15}');
    const r = lireProjet(JSON.parse(texte));
    if ('erreur' in r) throw new Error(r.erreur);
    expect(texteDuProjet(r.projet)).toBe(texte);
    const rouvert = etatDuProjet(r.projet);
    if ('erreur' in rouvert) throw new Error(rouvert.erreur);
    expect(rouvert.dessin).toEqual(dessin);
    expect(enregistrer(rouvert.dessin)).toBe(enregistrer(dessin));
  });

  it('refuse une marge hors de ses bornes en la nommant', () => {
    const { dessin } = dessinAvec([base('f1', COEUR)], 'Amour', ENV('f1'));
    const brut = JSON.parse(texteDuProjet(projetDe(etat(dessin)))) as { dessin: { formes: Array<{ texte?: { disposition?: Record<string, unknown> } }> } };
    const pose = brut.dessin.formes.find(x => x.texte?.disposition);
    if (!pose?.texte?.disposition) throw new Error('pas de texte deforme');
    pose.texte.disposition['marge'] = -1;
    const r = lireProjet(brut);
    expect('erreur' in r ? r.erreur : '').toMatch(/marge d’un texte déformé/);
  });
});

describe('le temps d un texte deforme', () => {
  it('quarante lettres dans un cœur, avec Inter : mesure', () => {
    const octets = readFileSync(resolve(__dirname, '../../../node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'));
    const g = glyphesDeFonte(parse(octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength)));
    const coeur = base('f1', COEUR.map(c => ({ c: c.c, p: c.p.map(v => v * 3) })));
    const texte = 'Avec tout mon amour\npour toi, chère Lucie';
    expect([...texte].filter(c => c !== '\n').length).toBe(40);
    const t: TexteVivant = { ...nouveauTexte(texte, police, 20, [1, 0, 0, 1, 0, 0]), alignement: 'centre', disposition: ENV('f1') };
    composerDispose({ ...t, texte: 'chauffe' }, coeur, g);
    const mesures: number[] = [];
    for (let k = 0; k < 5; k++) {
      const debut = performance.now();
      const r = composerDispose({ ...t, interlettrage: k * 1e-6 }, coeur, g);
      mesures.push(performance.now() - debut);
      expect(r.pose.lettres.length).toBe(34);
    }
    mesures.sort((a, b) => a - b);
    console.info('texte deforme : 40 lettres dans un cœur, mediane ' + au(mesures, 2).toFixed(1) + ' ms (min ' + au(mesures, 0).toFixed(1) + ', max ' + au(mesures, 4).toFixed(1) + ')');
    // Une borne large : la mesure se lit dans le journal, la borne n'attrape qu'un emballement.
    expect(au(mesures, 2)).toBeLessThan(1000);
  });
});
