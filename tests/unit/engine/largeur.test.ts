import { describe, expect, it } from 'vitest';
import { largeurA, largeurVariable, profilValide, regionLargeurVariable } from '../../../src/engine/contours.js';
import { aireDeRegion } from '../../../src/engine/contour/region.js';
import { boiteForme, ecrireDessin, type DessinSvg, type Forme } from '../../../src/engine/editionSvg.js';

// Un trait de largeur variable (ADR-0038) : une conversion en surface, par le pavage et l'union du contour en forme (ADR-0015).

const forme = (d: Forme['d'], extra: Partial<Forme> = {}): Forme => ({ id: 'f1', d, remplissage: null, contour: '#1428a0', epaisseur: 4, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, ...extra });
const LIGNE = forme([{ c: 'M', p: [0, 50] }, { c: 'L', p: [200, 50] }]);
const dessin = (f: Forme): DessinSvg => ({ vb: [0, 0, 200, 100], formes: [f] });

describe('le profil', () => {
  it('passe par ses trois largeurs, sans trigonometrie, et se lisse en S', () => {
    const p = { debut: 0, milieu: 10, fin: 2 };
    expect([largeurA(p, 0), largeurA(p, 0.5), largeurA(p, 1)]).toEqual([0, 10, 2]);
    expect(largeurA(p, 0.25)).toBe(5);
    expect(profilValide(p)).toBe(true);
    expect(profilValide({ debut: 0, milieu: 0, fin: 0 })).toBe(false);
    expect(profilValide({ debut: -1, milieu: 2, fin: 2 })).toBe(false);
  });
});

describe('la surface de largeur variable', () => {
  it('une droite de 200 a largeur constante 10 : un rectangle de 2 000', () => {
    const r = regionLargeurVariable(LIGNE, { debut: 10, milieu: 10, fin: 10 }, 0.01);
    if ('erreur' in r) throw new Error(r.erreur);
    expect(aireDeRegion(r)).toBeCloseTo(2000, 3);
  });

  it('effilee aux deux bouts : moins d aire, et la largeur du milieu atteinte', () => {
    const r = largeurVariable(dessin(LIGNE), ['f1'], { debut: 0, milieu: 20, fin: 0 });
    expect(r.elargis).toBe(1);
    const f = r.dessin.formes[0];
    expect(f?.remplissage).toBe('#1428a0');
    expect(f?.contour).toBeNull();
    const b = f ? boiteForme(f) : null;
    expect(b?.h).toBeCloseTo(20, 1);
    expect(b?.l).toBeCloseTo(200, 1);
    const region = regionLargeurVariable(LIGNE, { debut: 0, milieu: 20, fin: 0 }, 0.01);
    if ('erreur' in region) throw new Error(region.erreur);
    // L'integrale de deux courbes en S de 0 a 20 sur 100 chacune : 20 x 200 / 2.
    expect(aireDeRegion(region)).toBeCloseTo(2000, 0);
  });

  it('suit une courbe et un coin, et un trace ferme', () => {
    const courbe = forme([{ c: 'M', p: [10, 90] }, { c: 'C', p: [60, 0, 140, 0, 190, 90] }, { c: 'L', p: [100, 60] }]);
    expect(largeurVariable(dessin(courbe), ['f1'], { debut: 2, milieu: 12, fin: 4 }).elargis).toBe(1);
    const ferme = forme([{ c: 'M', p: [20, 20] }, { c: 'L', p: [180, 20] }, { c: 'L', p: [180, 80] }, { c: 'L', p: [20, 80] }, { c: 'Z', p: [] }], { remplissage: '#ffffff' });
    const r = largeurVariable(dessin(ferme), ['f1'], { debut: 2, milieu: 8, fin: 2 });
    expect(r.elargis).toBe(1);
    // Le fond reste, sans contour ; la silhouette se pose dessus.
    expect(r.dessin.formes.map(f => [f.remplissage, f.contour])).toEqual([['#ffffff', null], ['#1428a0', null]]);
  });

  it('refuse une forme sans trait, et un profil nul, en le disant', () => {
    expect(largeurVariable(dessin(forme(LIGNE.d, { contour: null })), ['f1'], { debut: 1, milieu: 2, fin: 1 }).erreur).toMatch(/contour/);
    expect(largeurVariable(dessin(LIGNE), ['f1'], { debut: 0, milieu: 0, fin: 0 }).erreur).toBeTruthy();
  });

  it('est deterministe', () => {
    const r = () => ecrireDessin(largeurVariable(dessin(LIGNE), ['f1'], { debut: 1, milieu: 9, fin: 3 }).dessin, 3);
    expect(r()).toBe(r());
  });
});
