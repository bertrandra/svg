// Les operations sur les degrades (ADR-0012, etape 4, paquet 4-A) : pures, le meme objet quand rien ne change, la couleur de repli
// recalculee comme a la lecture, les valeurs rangees comme l'ecriture les ecrit, les bornes (2 a 64 arrets, positions entre leurs
// voisins), les groupes et les images, et la geometrie des poignees (axe, projection, angle, centre, rayon, extremites).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ARRETS_MAX, ajouterArret, angleDegrade, axeDegrade, centreRayon, couleurDeRepli, degradeDe, degradesDistincts, deplacerExtremite, echangerArrets, ecrireDessin,
  estPlat, formesADegrade, grouper, inverserArrets, lireDessin, modifierArret, pointSurAxe, poserDegrade, positionSurAxe, rangAjoute, reglerAngle, reglerCentre,
  reglerEtalement, reglerRayon, retirerArret, retirerDegrade, transformer, rotation, echelle, verifierDessin,
  type ArretDegrade, type Degrade, type DegradeLineaire, type DegradeRadial, type DessinSvg, type Forme
} from '../../../src/engine/editionSvg.js';
import { nettoyerSvg } from '../../../src/util/svg.js';
import { au } from '../../../src/util/tableaux.js';
import { violationsEcriture, violationsNettoyage } from '../securite/invariants.js';
import { CAS } from './v2/cas-degrades-operations.js';

const DOSSIER = resolve(__dirname, '../../fixtures/svg');
const carre = (x: number, y: number, c: number) => [{ c: 'M' as const, p: [x, y] }, { c: 'L' as const, p: [x + c, y] }, { c: 'L' as const, p: [x + c, y + c] }, { c: 'L' as const, p: [x, y + c] }, { c: 'Z' as const, p: [] }];
const forme = (id: string, champs: Partial<Forme> = {}): Forme => ({ id, d: carre(10, 10, 80), remplissage: '#c81e28', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, ...champs });
const plat = (...formes: Forme[]): DessinSvg => ({ vb: [0, 0, 100, 100], formes });
const ARRETS: readonly ArretDegrade[] = [{ position: 0, couleur: '#c81e28' }, { position: 0.5, couleur: '#f2b705' }, { position: 1, couleur: '#1f5fb0' }];
const LIN: DegradeLineaire = { genre: 'lineaire', x1: 10, y1: 50, x2: 90, y2: 50, arrets: ARRETS };
const avecDegrade = (g: Degrade = LIN, champs: Partial<Forme> = {}): DessinSvg => plat(forme('f1', { peintureRemplissage: g, remplissage: couleurDeRepli(g.arrets), ...champs }));
const fond = (d: DessinSvg, i = 0): Degrade => {
  const g = degradeDe(au(d.formes, i), 'remplissage');
  if (!g) throw new Error('pas de degrade');
  return g;
};

describe('poser et retirer un degrade', () => {
  it('un dessin plat devient riche : lineaire de gauche a droite par le milieu, de la couleur au blanc, repli recalcule', () => {
    const d = plat(forme('f1'));
    expect(estPlat(d)).toBe(true);
    const r = poserDegrade(d, ['f1'], 'remplissage', 'lineaire');
    expect(estPlat(r)).toBe(false);
    const g = fond(r);
    expect(g).toEqual({ genre: 'lineaire', x1: 10, y1: 50, x2: 90, y2: 50, arrets: [{ position: 0, couleur: '#c81e28' }, { position: 1, couleur: '#ffffff' }] });
    expect(au(r.formes, 0).remplissage).toBe(couleurDeRepli(g.arrets));
    expect(verifierDessin(r)).toEqual([]);
  });

  it('un radial au centre de la boite ; une couleur tres claire va vers le noir ; sans couleur, du noir au blanc', () => {
    const r = poserDegrade(plat(forme('f1', { remplissage: '#fafafa' })), ['f1'], 'remplissage', 'radial');
    expect(fond(r)).toEqual({ genre: 'radial', cx: 50, cy: 50, r: 40, arrets: [{ position: 0, couleur: '#fafafa' }, { position: 1, couleur: '#000000' }] });
    const sans = poserDegrade(plat(forme('f1', { remplissage: null })), ['f1'], 'remplissage', 'lineaire');
    expect(fond(sans).arrets.map(a => a.couleur)).toEqual(['#000000', '#ffffff']);
  });

  it('au contour : un trait qui apparait prend une epaisseur visible, le fond ne bouge pas', () => {
    const r = poserDegrade(plat(forme('f1')), ['f1'], 'contour', 'lineaire');
    const f = au(r.formes, 0);
    expect(f.peintureContour?.genre).toBe('lineaire');
    expect(f.contour).toBe(couleurDeRepli(f.peintureContour && 'arrets' in f.peintureContour ? f.peintureContour.arrets : []));
    expect(f.epaisseur).toBe(1);
    expect(f.remplissage).toBe('#c81e28');
    expect(f.peintureRemplissage).toBeUndefined();
  });

  it('le meme genre ne change rien (le meme objet) ; l autre genre garde arrets et etalement', () => {
    const d = avecDegrade({ ...LIN, etalement: 'repeat' });
    expect(poserDegrade(d, ['f1'], 'remplissage', 'lineaire')).toBe(d);
    const r = fond(poserDegrade(d, ['f1'], 'remplissage', 'radial'));
    expect(r.genre).toBe('radial');
    expect(r.arrets).toBe(fond(d).arrets);
    expect(r.etalement).toBe('repeat');
  });

  it('retirer laisse la couleur de repli, unie ; une forme sans degrade est le meme objet', () => {
    const d = avecDegrade();
    const r = retirerDegrade(d, ['f1'], 'remplissage');
    expect(au(r.formes, 0).peintureRemplissage).toBeUndefined();
    expect(au(r.formes, 0).remplissage).toBe(au(d.formes, 0).remplissage);
    expect(estPlat(r)).toBe(true);
    expect(retirerDegrade(r, ['f1'], 'remplissage')).toBe(r);
    expect(retirerDegrade(d, ['f1'], 'contour')).toBe(d);
  });

  it('un groupe choisi peint ses feuilles ; une image est laissee', () => {
    const image = forme('f3', { remplissage: null, image: { donnees: 'data:image/png;base64,AAAA', x: 0, y: 0, l: 1, h: 1 } as unknown as NonNullable<Forme['image']> });
    const g = grouper(plat(forme('f1'), forme('f2', { d: carre(0, 0, 10) }), image), ['f1', 'f2', 'f3']);
    const id = Object.keys(g.dessin.groupes ?? {})[0] ?? '';
    const r = poserDegrade(g.dessin, [id], 'remplissage', 'lineaire');
    expect(r.formes.filter(f => f.peintureRemplissage).map(f => f.id)).toEqual(['f1', 'f2']);
    expect(au(r.formes, 2)).toBe(au(g.dessin.formes, 2));
  });
});

describe('les arrets', () => {
  it('ajouter : a mi-chemin, couleur OKLab, rang du nouvel arret ; apres le dernier, entre les deux derniers', () => {
    const d = avecDegrade();
    const a = fond(ajouterArret(d, ['f1'], 'remplissage', 0));
    expect(a.arrets.map(x => x.position)).toEqual([0, 0.25, 0.5, 1]);
    expect(rangAjoute(3, 0)).toBe(1);
    const b = fond(ajouterArret(d, ['f1'], 'remplissage', 2));
    expect(b.arrets.map(x => x.position)).toEqual([0, 0.5, 0.75, 1]);
    expect(rangAjoute(3, 2)).toBe(2);
    expect(au(b.arrets, 2).couleur).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('ajouter s arrete a 64 arrets ; retirer s arrete a 2', () => {
    const plein: ArretDegrade[] = Array.from({ length: ARRETS_MAX }, (_, i) => ({ position: i / (ARRETS_MAX - 1), couleur: '#000000' }));
    const d = avecDegrade({ ...LIN, arrets: plein });
    expect(ajouterArret(d, ['f1'], 'remplissage', 3)).toBe(d);
    const deux = avecDegrade({ ...LIN, arrets: ARRETS.slice(0, 2) });
    expect(retirerArret(deux, ['f1'], 'remplissage', 0)).toBe(deux);
    expect(fond(retirerArret(avecDegrade(), ['f1'], 'remplissage', 1)).arrets.map(x => x.couleur)).toEqual(['#c81e28', '#1f5fb0']);
  });

  it('modifier : couleur en minuscules, position bornee par les voisins et au millieme, opacite absente a 1, repli recalcule', () => {
    const d = avecDegrade();
    const r = modifierArret(d, ['f1'], 'remplissage', 1, { couleur: '#ABCDEF', position: 0.12345, opacite: 0.5 });
    expect(au(fond(r).arrets, 1)).toEqual({ position: 0.123, couleur: '#abcdef', opacite: 0.5 });
    expect(au(r.formes, 0).remplissage).toBe(couleurDeRepli(fond(r).arrets));
    expect(au(fond(modifierArret(d, ['f1'], 'remplissage', 1, { position: 2 })).arrets, 1).position).toBe(1);
    expect(au(fond(modifierArret(d, ['f1'], 'remplissage', 2, { position: 0.2 })).arrets, 2).position).toBe(0.5);
    expect(au(fond(modifierArret(r, ['f1'], 'remplissage', 1, { opacite: 1 })).arrets, 1)).toEqual({ position: 0.123, couleur: '#abcdef' });
    expect(modifierArret(d, ['f1'], 'remplissage', 1, { couleur: '#f2b705' })).toBe(d);
    expect(modifierArret(d, ['f1'], 'remplissage', 1, { couleur: 'rouge' })).toBe(d);
    expect(modifierArret(d, ['f1'], 'remplissage', 9, { couleur: '#000000' })).toBe(d);
  });

  it('l ordre echange les couleurs, pas les positions ; inverser retourne le degrade ; l etalement pad est l absence', () => {
    const d = avecDegrade();
    expect(fond(echangerArrets(d, ['f1'], 'remplissage', 0, 1)).arrets).toEqual([{ position: 0, couleur: '#f2b705' }, { position: 0.5, couleur: '#c81e28' }, { position: 1, couleur: '#1f5fb0' }]);
    expect(fond(inverserArrets(avecDegrade({ ...LIN, arrets: [{ position: 0.1, couleur: '#000000' }, { position: 0.75, couleur: '#ffffff', opacite: 0.5 }] }), ['f1'], 'remplissage')).arrets)
      .toEqual([{ position: 0.25, couleur: '#ffffff', opacite: 0.5 }, { position: 0.9, couleur: '#000000' }]);
    const e = reglerEtalement(d, ['f1'], 'remplissage', 'reflect');
    expect(fond(e).etalement).toBe('reflect');
    expect('etalement' in fond(reglerEtalement(e, ['f1'], 'remplissage', 'pad'))).toBe(false);
    expect(reglerEtalement(d, ['f1'], 'remplissage', 'pad')).toBe(d);
  });

  it('plusieurs formes gardent chacune leurs arrets ; une forme sans degrade ne bouge pas', () => {
    const d = plat(forme('f1', { peintureRemplissage: LIN }), forme('f2', { peintureRemplissage: { ...LIN, arrets: ARRETS.slice(0, 2) } }), forme('f3'));
    const r = modifierArret(d, ['f1', 'f2', 'f3'], 'remplissage', 2, { couleur: '#000000' });
    expect(au(fond(r, 0).arrets, 2).couleur).toBe('#000000');
    expect(au(r.formes, 1)).toBe(au(d.formes, 1));
    expect(au(r.formes, 2)).toBe(au(d.formes, 2));
  });
});

describe('la geometrie des poignees', () => {
  it('axe, point a une position, projection d un point : lineaire et radial, sous une matrice', () => {
    expect(axeDegrade(LIN)).toEqual({ de: [10, 50], a: [90, 50] });
    expect(pointSurAxe(LIN, 0.25)).toEqual([30, 50]);
    expect(positionSurAxe(LIN, 30, 99)).toBe(0.25);
    expect(positionSurAxe(LIN, -50, 0)).toBe(0);
    const rad: DegradeRadial = { genre: 'radial', cx: 0, cy: 0, r: 10, arrets: ARRETS, matrice: [2, 0, 0, 1, 50, 50] };
    expect(axeDegrade(rad)).toEqual({ de: [50, 50], a: [70, 50] });
    expect(pointSurAxe(rad, 0.5)).toEqual([60, 50]);
    expect(positionSurAxe(rad, 50, 55)).toBe(0.5);
    expect(centreRayon(rad)).toEqual({ cx: 50, cy: 50, r: 10 * Math.SQRT2 });
  });

  it('l angle se lit et se regle autour du milieu, a la meme longueur ; un lineaire tourne avec sa forme garde son angle lu', () => {
    expect(angleDegrade(LIN)).toBe(0);
    const r = fond(reglerAngle(avecDegrade(), ['f1'], 'remplissage', 90)) as DegradeLineaire;
    expect(angleDegrade(r)).toBe(90);
    expect(r.x1).toBeCloseTo(50, 9); expect(r.y1).toBeCloseTo(10, 9); expect(r.y2).toBeCloseTo(90, 9);
    const t = fond(transformer(avecDegrade(), ['f1'], rotation(30, 50, 50))) as DegradeLineaire;
    expect(angleDegrade(t)).toBeCloseTo(30, 2);
    expect(reglerAngle(avecDegrade(), ['f1'], 'remplissage', 360)).toEqual(avecDegrade());
  });

  it('centre et rayon d un radial, sans et sous une matrice ; le foyer suit', () => {
    const rad: DegradeRadial = { genre: 'radial', cx: 50, cy: 50, r: 20, fx: 60, fy: 50, arrets: ARRETS };
    const d = avecDegrade(rad);
    const c = fond(reglerCentre(d, ['f1'], 'remplissage', 40, 30)) as DegradeRadial;
    expect([c.cx, c.cy, c.fx, c.fy]).toEqual([40, 30, 50, 30]);
    const r = fond(reglerRayon(d, ['f1'], 'remplissage', 40)) as DegradeRadial;
    expect([r.r, r.fx]).toEqual([40, 70]);
    expect(reglerRayon(d, ['f1'], 'remplissage', 0)).toBe(d);
    const sous = transformer(d, ['f1'], echelle(2, 1, 0, 0));
    const r2 = fond(reglerRayon(sous, ['f1'], 'remplissage', 10)) as DegradeRadial;
    expect(centreRayon(r2).r).toBeCloseTo(10, 9);
    expect(centreRayon(r2).cx).toBeCloseTo(centreRayon(fond(sous) as DegradeRadial).cx, 9);
  });

  it('les extremites : un lineaire se repose ; deux extremites confondues ne changent rien ; un radial deplace son centre ou son bord', () => {
    const d = avecDegrade();
    expect(axeDegrade(fond(deplacerExtremite(d, ['f1'], 'remplissage', 'fin', 50, 90)))).toEqual({ de: [10, 50], a: [50, 90] });
    expect(deplacerExtremite(d, ['f1'], 'remplissage', 'fin', 10, 50)).toBe(d);
    const rad = avecDegrade({ genre: 'radial', cx: 50, cy: 50, r: 20, arrets: ARRETS });
    expect(axeDegrade(fond(deplacerExtremite(rad, ['f1'], 'remplissage', 'debut', 40, 40)))).toEqual({ de: [40, 40], a: [60, 40] });
    expect((fond(deplacerExtremite(rad, ['f1'], 'remplissage', 'fin', 50, 80)) as DegradeRadial).r).toBe(30);
  });
});

describe('la ligne « Dégradés » et l ecriture', () => {
  it('les formes visibles a degrade, par cote, et le nombre de degrades distincts', () => {
    const d = plat(forme('f1', { peintureRemplissage: LIN }), forme('f2', { peintureContour: LIN, contour: '#000000' }), forme('f3', { peintureRemplissage: LIN, visible: false }), forme('f4'));
    expect(formesADegrade(d)).toEqual(['f1', 'f2']);
    expect(formesADegrade(d, 'remplissage')).toEqual(['f1']);
    expect(formesADegrade(d, 'contour')).toEqual(['f2']);
    expect(degradesDistincts(d, ['f1', 'f2'])).toBe(1);
    expect(degradesDistincts(d, ['f1', 'f2'], 'contour')).toBe(1);
  });

  it('chaque cas des operations s ecrit dans la specification de l ecriture et passe le nettoyage sans changer', () => {
    const lire = (n: string) => { const r = lireDessin(readFileSync(resolve(DOSSIER, 'v2', n + '.svg'), 'utf8'), { modele: 'riche' }); if ('erreur' in r) throw new Error(r.erreur); return r.dessin; };
    for (const c of CAS) {
      const depart = c.dessin ? c.dessin() : lire(c.entree ?? '');
      const e = ecrireDessin(c.operation ? c.operation(depart) : depart, 3);
      expect(violationsEcriture(e), c.nom).toEqual([]);
      expect(violationsNettoyage(e), c.nom).toEqual([]);
      expect(nettoyerSvg(e)?.svg, c.nom).toBe(e);
    }
  });
});
