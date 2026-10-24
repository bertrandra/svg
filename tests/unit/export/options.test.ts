import { describe, it, expect } from 'vitest';
import { enPouces, depuisPouces, hauteurPour, largeurPixels, poucesParUnite, tailleValide } from '../../../src/export/dimensions.js';
import { LARGEUR_RASTER_MAX, OPTIONS_EXPORT_DEFAUT, lireNombre, largeurRaster, optionsDxf, optionsEps, optionsPdf, optionsSvg, tailleDe } from '../../../src/export/options.js';

describe('dimensions', () => {
  it('convertit mm, pouces et px (96 au pouce) dans les deux sens', () => {
    expect(enPouces(25.4, 'mm')).toBeCloseTo(1, 12);
    expect(enPouces(96, 'px')).toBe(1);
    expect(enPouces(2, 'in')).toBe(2);
    expect(depuisPouces(1, 'mm')).toBe(25.4);
    expect(depuisPouces(enPouces(37, 'mm'), 'mm')).toBeCloseTo(37, 10);
    expect(depuisPouces(1, 'px')).toBe(96);
  });

  it('un px du plan vaut 1/96 de pouce sans taille, et la taille repartit sur la largeur du plan avec', () => {
    expect(poucesParUnite([0, 0, 200, 100], null)).toBe(1 / 96);
    expect(poucesParUnite([0, 0, 200, 100], { largeur: 2, unite: 'in' })).toBe(0.01);
    expect(poucesParUnite([0, 0, 200, 100], { largeur: 50.8, unite: 'mm' })).toBeCloseTo(0.01, 12);
    expect(poucesParUnite([0, 0, 0, 100], { largeur: 2, unite: 'in' })).toBe(1 / 96);
    expect(hauteurPour([0, 0, 200, 100], { largeur: 80, unite: 'mm' })).toBe(40);
    expect(hauteurPour([0, 0, 0, 100], { largeur: 80, unite: 'mm' })).toBe(0);
  });

  it('refuse une taille qui n\'en est pas une', () => {
    for (const t of [{ largeur: 0, unite: 'mm' as const }, { largeur: -1, unite: 'mm' as const }, { largeur: Number.NaN, unite: 'in' as const }, { largeur: Infinity, unite: 'px' as const }, { largeur: 1e7, unite: 'mm' as const }]) expect(tailleValide(t)).toBeNull();
    expect(tailleValide(null)).toBeNull();
    expect(tailleValide({ largeur: 12, unite: 'mm' })).toEqual({ largeur: 12, unite: 'mm' });
  });

  it('derive la largeur en pixels d\'une taille physique et d\'une resolution', () => {
    expect(largeurPixels({ largeur: 100, unite: 'mm' }, 300)).toBe(1181);
    expect(largeurPixels({ largeur: 4, unite: 'in' }, 150)).toBe(600);
    expect(largeurPixels({ largeur: 0.001, unite: 'mm' }, 72)).toBe(1);
  });
});

describe('options d\'export', () => {
  it('lit un nombre tape avec virgule ou point, et rien d\'autre', () => {
    expect(lireNombre('12,5')).toBe(12.5);
    expect(lireNombre(' 3.25 ')).toBe(3.25);
    expect(lireNombre('.5')).toBe(0.5);
    expect(lireNombre('-2')).toBe(-2);
    for (const t of ['', ' ', 'abc', '1,2,3', '1e5', '12mm', 'NaN', '--1']) expect(lireNombre(t), t).toBeNull();
  });

  it('part neutre : toutes les options des writers sont celles d\'avant', () => {
    const o = OPTIONS_EXPORT_DEFAUT;
    expect(tailleDe(o)).toBeNull();
    expect(optionsSvg(o)).toEqual({ precision: 3, taille: null, optimise: false });
    expect(optionsPdf(o)).toEqual({ cmjn: false, page: 'dessin', marge: 0, taille: null, fondPerdu: 0, reperes: false });
    expect(optionsEps(o)).toEqual({ taille: null, cmjn: false });
    expect(optionsDxf(o)).toEqual({ unite: 'px', taille: null });
  });

  it('traduit les choix : fond perdu, page personnalisee, titre, taille', () => {
    const o = { ...OPTIONS_EXPORT_DEFAUT, unite: 'mm' as const, largeur: 80, page: 'perso' as const, pageLargeur: 100, pageHauteur: 150, fondPerdu: true, fondPerduMm: 5, cmjn: true, titre: '  Affiche ' };
    expect(optionsPdf(o)).toEqual({ cmjn: true, page: { largeur: 100, hauteur: 150 }, marge: 0, taille: { largeur: 80, unite: 'mm' }, fondPerdu: 5, reperes: true, titre: 'Affiche' });
    expect(optionsEps(o)).toEqual({ taille: { largeur: 80, unite: 'mm' }, cmjn: true, titre: 'Affiche' });
  });

  it('derive la largeur d\'un raster : le choix, ou la taille a la resolution, bornee', () => {
    const base = OPTIONS_EXPORT_DEFAUT;
    expect(largeurRaster(base, 2048)).toBe(2048);
    expect(largeurRaster({ ...base, unite: 'mm', largeur: 100, dpi: 300 }, 1024)).toBe(1181);
    expect(largeurRaster({ ...base, unite: 'in', largeur: 4, dpi: 150 }, 1024)).toBe(600);
    expect(largeurRaster({ ...base, unite: 'px', largeur: 640.4, dpi: 300 }, 1024)).toBe(640);
    // Sans resolution, une taille physique se lit a 96 ppp (le pixel du CSS).
    expect(largeurRaster({ ...base, unite: 'in', largeur: 2 }, 1024)).toBe(192);
    expect(largeurRaster({ ...base, unite: 'mm', largeur: 5000, dpi: 600 }, 1024)).toBe(LARGEUR_RASTER_MAX);
  });
});
