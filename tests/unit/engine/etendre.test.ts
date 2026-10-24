import { describe, expect, it } from 'vitest';
import { aireSignee, aplatir, regionDeForme } from '../../../src/engine/booleens.js';
import { boiteChemin, ecrireDessin, lireDessin, type Chemin, type DessinSvg, type Forme } from '../../../src/engine/editionSvg.js';
import { etendreTrait, etendreTraits } from '../../../src/engine/contour/etendre.js';
import { aireDeRegion } from '../../../src/engine/contour/region.js';
import { au } from '../../../src/util/tableaux.js';

const dessin = (corps: string, vb = '0 0 200 200'): DessinSvg => {
  const r = lireDessin(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${corps}</svg>`);
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
const premiere = (d: DessinSvg): Forme => au(d.formes, 0);
const chemin = (f: Forme, options = {}): Chemin => {
  const r = etendreTrait(f, options);
  if ('erreur' in r) throw new Error(r.erreur);
  return au(r.chemins, 0);
};
/** L'aire peinte d'un chemin sous la regle de la forme (anneaux creux soustraits). */
const aire = (d: Chemin): number => aireDeRegion(regionDeForme({ ...premiere(dessin('<path d="M0 0"/>')), d, regle: 'nonzero' }, 0.001));

describe('etendreTrait : l aire du contour', () => {
  it('un trait ouvert a bouts plats couvre longueur x epaisseur', () => {
    const f = premiere(dessin('<path d="M20 100h100" stroke="#000" stroke-width="10" fill="none"/>'));
    expect(aire(chemin(f))).toBeCloseTo(100 * 10, 3);
  });

  it('un trait ouvert a bouts ronds ajoute un disque d epaisseur : longueur x e + pi e2 / 4', () => {
    const f = premiere(dessin('<path d="M20 100h100" stroke="#000" stroke-width="10" stroke-linecap="round" fill="none"/>'));
    const attendu = 100 * 10 + Math.PI * 25;
    expect(aire(chemin(f))).toBeGreaterThan(attendu * 0.998);
    expect(aire(chemin(f))).toBeLessThanOrEqual(attendu * 1.0001);
  });

  it('un trait a bouts carres prolonge d une demi-epaisseur de chaque cote', () => {
    const f = premiere(dessin('<path d="M20 100h100" stroke="#000" stroke-width="10" stroke-linecap="square" fill="none"/>'));
    expect(aire(chemin(f))).toBeCloseTo(110 * 10, 3);
  });

  it('une courbe ouverte couvre sa longueur x epaisseur (a la fleche pres)', () => {
    // Un demi-cercle de rayon 50 : longueur pi r, epaisseur 4, bouts plats : aire = pi (r+2)^2/2 - pi (r-2)^2/2 = 2 pi r e / 2 ... = pi r e.
    const f = premiere(dessin('<path d="M50 100A50 50 0 0 1 150 100" stroke="#000" stroke-width="4" fill="none"/>'));
    const attendu = Math.PI * 50 * 4;
    expect(aire(chemin(f))).toBeGreaterThan(attendu * 0.995);
    expect(aire(chemin(f))).toBeLessThan(attendu * 1.001);
  });

  it('le contour d un cercle est un anneau de bons rayons interieur et exterieur', () => {
    const f = premiere(dessin('<circle cx="100" cy="100" r="50" stroke="#000" stroke-width="10" fill="none"/>'));
    const d = chemin(f);
    const anneaux = aplatir(d, 0.001);
    expect(anneaux.length).toBe(2);
    const rayon = (r: ReturnType<typeof aplatir>[0]) => Math.sqrt(Math.abs(aireSignee(r)) / Math.PI);
    const [interieur = 0, exterieur = 0] = anneaux.map(rayon).sort((x, y) => x - y);
    // Les cubiques d'un cercle (4 quarts) s'ecartent du cercle de 0,03 % : les rayons tiennent a 0,02 pres.
    expect(Math.abs(interieur - 45)).toBeLessThan(0.02);
    expect(Math.abs(exterieur - 55)).toBeLessThan(0.02);
    const boite = boiteChemin(d);
    expect(boite?.l).toBeCloseTo(110, 1);
    expect(aire(d)).toBeCloseTo(Math.PI * (55 * 55 - 45 * 45), 0);
  });

  it('les arcs rebatis en courbes gardent les rayons et allegent le trace', () => {
    const f = premiere(dessin('<circle cx="100" cy="100" r="50" stroke="#000" stroke-width="10" fill="none"/>'));
    const droit = chemin(f), lisse = chemin(f, { lisser: true });
    expect(lisse.some(c => c.c === 'C')).toBe(true);
    expect(lisse.length).toBeLessThan(droit.length);
    expect(aire(lisse)).toBeCloseTo(Math.PI * (55 * 55 - 45 * 45), -1);
  });
});

describe('etendreTrait : bouts et jonctions', () => {
  const equerre = (jonction: string, extra = '') => premiere(dessin(`<path d="M20 20h100v100" stroke="#000" stroke-width="20" fill="none" stroke-linejoin="${jonction}" ${extra}/>`));

  it('une jonction en pointe, biseautee ou ronde ne couvre pas la meme aire dans l angle', () => {
    const pointe = aire(chemin(equerre('miter'))), bise = aire(chemin(equerre('bevel'))), ronde = aire(chemin(equerre('round')));
    // Deux rectangles 100 x 20 qui se recouvrent sur 10 x 10 : 3 900 ; la jonction comble le coin exterieur (carre 10 x 10).
    expect(pointe).toBeCloseTo(3900 + 100, 1);
    expect(bise).toBeCloseTo(3900 + 50, 1);
    expect(ronde).toBeGreaterThan(3900 + 78);
    expect(ronde).toBeLessThan(3900 + 78.6);
    expect(pointe).toBeGreaterThan(ronde);
    expect(ronde).toBeGreaterThan(bise);
  });

  it('la limite de pointe biseaute les angles aigus', () => {
    const aigu = (limite: number) => premiere(dessin(`<path d="M10 100L150 90L10 80" stroke="#000" stroke-width="10" fill="none" stroke-linejoin="miter" stroke-miterlimit="${limite}"/>`));
    const grande = aire(chemin(aigu(40))), petite = aire(chemin(aigu(2)));
    expect(grande).toBeGreaterThan(petite);
    expect(boiteChemin(chemin(aigu(40)))?.l).toBeGreaterThan(boiteChemin(chemin(aigu(2)))?.l ?? 0);
  });

  it('les pointilles donnent un morceau par tiret, ou un chemin compose', () => {
    const f = premiere(dessin('<path d="M0 50h100" stroke="#000" stroke-width="4" stroke-dasharray="10 10" fill="none"/>'));
    const compose = au((etendreTrait(f) as { chemins: Chemin[] }).chemins, 0);
    expect(compose.filter(c => c.c === 'M').length).toBe(5);
    const separes = (etendreTrait(f, { separer: true }) as { chemins: Chemin[] }).chemins;
    expect(separes.length).toBe(5);
    expect(aire(compose)).toBeCloseTo(5 * 10 * 4, 3);
  });

  it('un point de pointille avec un bout rond est un disque', () => {
    const f = premiere(dessin('<path d="M0 50h40" stroke="#000" stroke-width="6" stroke-linecap="round" stroke-dasharray="0 10" fill="none"/>'));
    const r = etendreTrait(f, { separer: true });
    if ('erreur' in r) throw new Error(r.erreur);
    expect(r.chemins.length).toBe(5);
    for (const c of r.chemins) expect(aire(c)).toBeGreaterThan(Math.PI * 9 * 0.99);
  });

  it('un motif trop fin est refuse, nomme', () => {
    const f = premiere(dessin('<path d="M0 50h100000" stroke="#000" stroke-width="1" stroke-dasharray="0.01 0.01" fill="none"/>'));
    expect('erreur' in etendreTrait(f)).toBe(true);
  });

  it('une forme sans contour est refusee, nommee', () => {
    const f = premiere(dessin('<path d="M0 0h10v10z" fill="#c81e28"/>'));
    expect(etendreTrait(f)).toEqual({ erreur: expect.stringContaining('pas de contour') });
  });

  it('un trace qui se recoupe a la meme aire que l union de ses morceaux (pas de double comptage)', () => {
    // Un X trace en un seul chemin : les deux bras se croisent, le carre du croisement ne compte qu une fois.
    const f = premiere(dessin('<path d="M20 20L120 120M120 20L20 120" stroke="#000" stroke-width="10" fill="none"/>'));
    const bras = Math.hypot(100, 100) * 10;
    // Les sommets s'ecrivent au millieme : l'aire tient a une fraction d'unite carree.
    expect(Math.abs(aire(chemin(f)) - (2 * bras - 100))).toBeLessThan(0.5);
  });
});

describe('etendreTraits : la forme', () => {
  const svg = '<path d="M20 100h100" stroke="#336699" stroke-opacity="0.4" stroke-width="10" fill="none"/>'
    + '<path d="M20 150h100v30h-100z" fill="#c81e28" stroke="#102030" stroke-width="6"/>';

  it('met la couleur du trait en fond, garde son alpha, et retire le contour', () => {
    const d = dessin(svg);
    const r = etendreTraits(d, ['f1']);
    const f = au(r.dessin.formes, 0);
    expect(r.ids).toEqual(['f1']);
    expect(f.remplissage).toBe('#336699');
    expect(f.contour).toBeNull();
    expect(f.opaciteRemplissage).toBeCloseTo(0.4, 6);
    expect(f.pointilles).toBeUndefined();
    expect(ecrireDessin(r.dessin, 3)).toContain('fill="#336699"');
  });

  it('une forme pleine garde son fond sans contour, et la silhouette se pose au-dessus', () => {
    const d = dessin(svg);
    const r = etendreTraits(d, ['f2']);
    expect(r.dessin.formes.map(f => f.id)).toEqual(['f1', 'f2', 'f3']);
    expect(au(r.dessin.formes, 1).contour).toBeNull();
    expect(au(r.dessin.formes, 1).remplissage).toBe('#c81e28');
    expect(au(r.dessin.formes, 2).remplissage).toBe('#102030');
    expect(au(r.dessin.formes, 2).opaciteRemplissage).toBeUndefined();
    expect(r.ids).toEqual(['f3']);
  });

  it('ignore les formes verrouillees et celles sans contour, et rend le meme dessin quand rien ne change', () => {
    const d = dessin('<path d="M0 0h10v10z" fill="#c81e28"/>');
    const r = etendreTraits(d, ['f1']);
    expect(r.dessin).toBe(d);
    expect(r.etendus).toBe(0);
    expect(r.erreur).toContain('pas de contour');
  });

  it('est deterministe et ne touche pas le dessin d origine', () => {
    const d = dessin(svg);
    const avant = JSON.stringify(d);
    const a = ecrireDessin(etendreTraits(d, ['f1', 'f2'], { lisser: true }).dessin, 3);
    const b = ecrireDessin(etendreTraits(d, ['f1', 'f2'], { lisser: true }).dessin, 3);
    expect(a).toBe(b);
    expect(JSON.stringify(d)).toBe(avant);
  });
});
