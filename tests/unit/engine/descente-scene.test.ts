// La scene native (ADR-0012, etape 13a ; engine/descente/scene.ts) : ce que la descente laisse a un exporteur qui ecrit lui-meme des
// degrades, des images, des decoupes, des masques et l'opacite des groupes (le PDF). Un dessin plat, ou riche sans rien de natif, n'a
// pas de scene ; ce que la scene porte quitte le dessin plat sans phrase ; ce qu'elle approche encore est dit.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { estPlat, lireDessin, type DessinSvg, type Forme, type Groupe } from '../../../src/engine/editionSvg.js';
import { aplatirPour, CAPACITES_PLAT, phrasePertes, type NoeudScene, type PorteeScene } from '../../../src/engine/aplatir.js';
import { domaineDegrade, MSG_SCENE, PERIODES_MAX } from '../../../src/engine/descente/scene.js';
import { CAPACITES_EPS, CAPACITES_PDF } from '../../../src/export/capacites.js';

const SVG = (corps: string, vb = '0 0 200 100') => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '">' + corps + '</svg>';
const riche = (svg: string): DessinSvg => {
  const r = lireDessin(svg, { modele: 'riche' });
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
const f = (id: string, champs: Partial<Forme> = {}): Forme => ({
  id, d: [{ c: 'M', p: [0, 0] }, { c: 'L', p: [10, 0] }, { c: 'L', p: [10, 10] }, { c: 'Z', p: [] }],
  remplissage: '#ff0000', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, ...champs
});
const g = (id: string, champs: Partial<Groupe> = {}): Groupe => ({ id, visible: true, verrouille: false, ...champs });
const portees = (n: readonly NoeudScene[]): PorteeScene[] => n.flatMap(x => (x.genre === 'portee' ? [x, ...portees(x.enfants)] : []));

describe('la scene native', () => {
  it('n existe pas pour un dessin plat, ni pour un exporteur sans fonction native, ni pour un groupe dont l opacite se compose exactement', () => {
    const plat: DessinSvg = { vb: [0, 0, 10, 10], formes: [f('f1')] };
    expect(aplatirPour(plat, CAPACITES_PDF).scene).toBeUndefined();
    const degrade = riche(SVG('<linearGradient id="a"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient><rect width="50" height="50" fill="url(#a)"/>'));
    expect(aplatirPour(degrade, CAPACITES_EPS).scene).toBeUndefined();
    expect(aplatirPour(degrade, CAPACITES_PLAT).scene).toBeUndefined();
    // Une seule feuille sous une opacite de groupe : multipliee, exacte ; pas de scene, et le PDF d'avant.
    const seule: DessinSvg = { vb: [0, 0, 10, 10], formes: [f('f1', { parent: 'g1' })], groupes: { g1: g('g1', { opacite: 0.5 }) } };
    const r = aplatirPour(seule, CAPACITES_PDF);
    expect(r.scene).toBeUndefined();
    expect(r.dessin.formes[0]?.opacite).toBe(0.5);
  });

  it('garde le degrade a part sur une feuille plate ; le dessin plat garde la couleur de repli, sans phrase', () => {
    const d = riche(SVG('<linearGradient id="a"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient><rect width="50" height="50" fill="url(#a)" stroke="url(#a)" stroke-width="2"/>'));
    const r = aplatirPour(d, CAPACITES_PDF);
    expect(r.pertes).toEqual([]);
    expect(estPlat(r.dessin)).toBe(true);
    const [n] = r.scene?.noeuds ?? [];
    expect(n?.genre).toBe('forme');
    if (n?.genre !== 'forme') return;
    expect(n.fond?.domaine).toEqual([0, 1]);
    expect(n.trait?.degrade.genre).toBe('lineaire');
    expect(Object.keys(n.forme)).not.toContain('peintureRemplissage');
    expect(n.forme.remplissage).toBe(r.dessin.formes[0]?.remplissage);
  });

  it('calcule le domaine d un degrade repete ou reflechi sur la boite qu il peint, et prolonge au-dela de PERIODES_MAX', () => {
    const lin = { genre: 'lineaire', x1: 10, y1: 0, x2: 25, y2: 0, arrets: [], etalement: 'repeat' } as const;
    expect(domaineDegrade(lin, { x: 100, y: 0, l: 20, h: 60 })).toEqual([6, 8]);
    const { etalement: _e, ...pad } = lin;
    void _e;
    expect(domaineDegrade(pad, { x: 100, y: 0, l: 20, h: 60 })).toEqual([0, 1]);
    expect(domaineDegrade(lin, { x: -5, y: 0, l: 10, h: 10 })).toEqual([-1, 0]);
    expect(domaineDegrade({ ...lin, matrice: [2, 0, 0, 1, 0, 0] }, { x: 100, y: 0, l: 20, h: 60 })).toEqual([2, 4]);
    const rad = { genre: 'radial', cx: 0, cy: 0, r: 10, arrets: [], etalement: 'reflect' } as const;
    // Le coin le plus loin est a sqrt(30^2 + 40^2) = 50 du centre : cinq rayons.
    expect(domaineDegrade(rad, { x: 0, y: 0, l: 30, h: 40 })).toEqual([0, 5]);
    expect(domaineDegrade(lin, { x: 0, y: 0, l: 15 * (PERIODES_MAX + 2), h: 1 })).toBeNull();
    const d = riche(SVG('<linearGradient id="r" gradientUnits="userSpaceOnUse" x1="0" x2="0.1" spreadMethod="repeat"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient><rect width="200" height="10" fill="url(#r)"/>'));
    const r = aplatirPour(d, CAPACITES_PDF);
    expect(r.pertes).toEqual([MSG_SCENE.periodes]);
    const [n] = r.scene?.noeuds ?? [];
    expect(n?.genre === 'forme' && n.fond?.degrade.etalement).toBeUndefined();
  });

  it('enferme les feuilles d un groupe decoupe dans une portee, au chemin exact ; deux formes qui se recouvrent sont recalculees et dites', () => {
    const exact = riche(SVG('<clipPath id="c"><circle cx="50" cy="50" r="40"/><rect x="120" y="10" width="30" height="30"/></clipPath><g clip-path="url(#c)"><rect width="200" height="100" stroke="#000" stroke-width="4" fill="#0a0"/></g><rect width="5" height="5"/>'));
    const r = aplatirPour(exact, CAPACITES_PDF);
    expect(r.pertes).toEqual([]);
    const [p] = portees(r.scene?.noeuds ?? []);
    expect(p?.decoupe?.d.filter(c => c.c === 'M')).toHaveLength(2);
    expect(p?.enfants).toHaveLength(1);
    // Le trait n'est pas garde a part : la decoupe le rogne.
    expect(r.scene?.noeuds).toHaveLength(2);
    const recouvre = riche(SVG('<clipPath id="c"><circle cx="50" cy="50" r="40"/><circle cx="80" cy="50" r="40"/></clipPath><g clip-path="url(#c)"><rect width="200" height="100"/></g>'));
    const s = aplatirPour(recouvre, CAPACITES_PDF);
    expect(s.pertes).toEqual([MSG_SCENE.decoupe]);
    expect(phrasePertes(s.pertes, s.perdus)).toMatch(/^Approché par ce format : une découpe/);
    // Une decoupe vide : la portee existe, son chemin est vide (rien ne se dessine).
    const vide = riche(SVG('<clipPath id="v"/><g clip-path="url(#v)"><rect width="50" height="50"/></g>'));
    expect(portees(aplatirPour(vide, CAPACITES_PDF).scene?.noeuds ?? [])[0]?.decoupe?.d).toEqual([]);
  });

  it('descend le contenu d un masque en scene, degrades compris ; un groupe translucide a plusieurs feuilles devient un groupe de transparence', () => {
    const d = riche(readFileSync(resolve(__dirname, '../../fixtures/pdf-natif/mixte.svg'), 'utf8'));
    const r = aplatirPour(d, CAPACITES_PDF);
    expect(r.pertes).toEqual([]);
    expect(estPlat(r.dessin)).toBe(true);
    const ps = portees(r.scene?.noeuds ?? []);
    const masque = ps.find(p => p.masque)?.masque;
    expect(masque?.type).toBe('luminance');
    expect(masque?.contenu.noeuds.some(n => n.genre === 'forme' && n.fond !== undefined)).toBe(true);
    const translucide = ps.find(p => p.opacite !== undefined);
    expect(translucide?.opacite).toBe(0.85);
    expect(translucide?.enfants.map(n => n.genre)).toEqual(['image', 'forme']);
    // L'image et la forme gardent leur opacite propre : celle du groupe est a la portee.
    expect(translucide?.enfants.every(n => (n.genre === 'image' ? n.opacite : n.genre === 'forme' ? n.forme.opacite : 0) === 1)).toBe(true);
    expect(translucide?.boite?.l).toBeGreaterThan(0);
    // Deux formes qui se recouvrent sous un groupe translucide : ailleurs, l'opacite est approchee et dite ; dans le PDF, exacte.
    const deux: DessinSvg = { vb: [0, 0, 10, 10], formes: [f('f1', { parent: 'g1' }), f('f2', { parent: 'g1' })], groupes: { g1: g('g1', { opacite: 0.5 }) } };
    expect(aplatirPour(deux, CAPACITES_EPS).pertes.some(p => /opacité de groupe/.test(p))).toBe(true);
    const pdf = aplatirPour(deux, CAPACITES_PDF);
    expect(pdf.pertes).toEqual([]);
    expect(pdf.scene?.noeuds).toEqual([{ genre: 'portee', opacite: 0.5, boite: { x: 0, y: 0, l: 10, h: 10 }, enfants: [{ genre: 'forme', forme: f('f1') }, { genre: 'forme', forme: f('f2') }] }]);
    expect(pdf.dessin.formes.map(x => x.opacite)).toEqual([1, 1]);
  });

  it('laisse les images, sauf masquees ; un motif reste approche par le filet', () => {
    const d = riche(readFileSync(resolve(__dirname, '../../fixtures/pdf-natif/images-perdues.svg'), 'utf8'));
    const r = aplatirPour(d, CAPACITES_PDF);
    expect(r.scene?.noeuds.filter(n => n.genre === 'image')).toHaveLength(2);
    const cache = { ...d, formes: d.formes.map(x => (x.image ? { ...x, visible: false } : x)) };
    expect(aplatirPour(cache, CAPACITES_PDF).scene).toBeUndefined();
    const motif: DessinSvg = {
      vb: [0, 0, 10, 10],
      formes: [f('f1', { peintureRemplissage: { genre: 'motif', x: 0, y: 0, l: 2, h: 2, contenu: { formes: [] } } }), f('f2', { parent: 'g1' }), f('f3', { parent: 'g1' })],
      groupes: { g1: g('g1', { opacite: 0.5 }) }
    };
    const m = aplatirPour(motif, CAPACITES_PDF);
    expect(estPlat(m.dessin)).toBe(true);
    expect(m.pertes).toEqual(['les dégradés et les motifs (remplacés par une couleur unie)']);
    expect(m.scene?.noeuds[0]).toEqual({ genre: 'forme', forme: f('f1') });
  });
});
