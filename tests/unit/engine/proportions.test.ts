import { describe, expect, it } from 'vitest';
import { boiteDe, lireDessin, redimensionner, tourner, type Boite, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { boiteRedimensionnee, coteMinimal, pasDeplacement } from '../../../src/engine/navigation.js';
import {
  aDesProportions, boiteAvecCote, boiteRedimensionneeProportionnelle, cleSelection, cotesProportionnels, proportionsAuCoin, referenceProportions, TOLERANCE_PROPORTIONS
} from '../../../src/engine/proportions.js';

const lire = (corps: string, modele: 'plat' | 'riche' = 'plat'): DessinSvg => {
  const r = lireDessin(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">${corps}</svg>`, modele === 'riche' ? { modele } : {});
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
const boite = (d: DessinSvg, ids: readonly string[]): Boite => {
  const b = boiteDe(d, ids);
  if (!b) throw new Error('sans boite');
  return b;
};
const rapport = (b: Boite) => b.l / b.h;

const B: Boite = { x: 10, y: 20, l: 80, h: 40 };

describe('aDesProportions : une boite a deux cotes positifs', () => {
  it('refuse une ligne (un cote nul), une boite absente et un cote infini', () => {
    expect(aDesProportions(B)).toBe(true);
    expect(aDesProportions({ l: 50, h: 0 })).toBe(false);
    expect(aDesProportions({ l: 0, h: 50 })).toBe(false);
    expect(aDesProportions(null)).toBe(false);
    expect(aDesProportions({ l: Infinity, h: 1 })).toBe(false);
    expect(aDesProportions({ l: Number.NaN, h: 1 })).toBe(false);
  });
});

describe('referenceProportions : la proportion que le verrou garde', () => {
  it('prend la boite courante sans reference, et garde la meme reference tant que la selection et sa proportion restent', () => {
    const r = referenceProportions(null, 'f1', B);
    expect(r).toEqual({ cle: 'f1', l: 80, h: 40 });
    // Une autre taille dans la meme proportion, aux erreurs de calcul pres : le meme objet.
    expect(referenceProportions(r, 'f1', { x: 0, y: 0, l: 160, h: 80 * (1 + TOLERANCE_PROPORTIONS / 10) })).toBe(r);
  });

  it('se refait quand la selection change ou que la proportion change vraiment', () => {
    const r = referenceProportions(null, 'f1', B);
    expect(referenceProportions(r, 'f2', B)).toEqual({ cle: 'f2', l: 80, h: 40 });
    expect(referenceProportions(r, 'f1', { ...B, h: 40.04 })).toEqual({ cle: 'f1', l: 80, h: 40.04 });
  });

  it('rend null pour une ligne ou rien de choisi : le verrou ne s applique pas', () => {
    expect(referenceProportions(null, 'f1', { x: 0, y: 0, l: 50, h: 0 })).toBeNull();
    expect(referenceProportions({ cle: 'f1', l: 1, h: 1 }, 'f1', null)).toBeNull();
  });

  it('nomme une selection par ses identifiants, dans l ordre', () => {
    expect(cleSelection(['f1', 'f2'])).not.toBe(cleSelection(['f2', 'f1']));
    expect(cleSelection(['f1', 'f2'])).toBe(cleSelection(['f1', 'f2']));
  });
});

describe('proportionsAuCoin : le verrou et Maj', () => {
  const ref = { l: 2, h: 1 }, debut = { l: 80, h: 40 };
  it('verrou coupe : Maj garde la boite du debut du geste, comme avant ; sans Maj, libre', () => {
    expect(proportionsAuCoin(false, null, debut, true)).toBe(debut);
    expect(proportionsAuCoin(false, null, debut, false)).toBeNull();
  });
  it('verrou pose : la reference est gardee, Maj libere le temps du geste', () => {
    expect(proportionsAuCoin(true, ref, debut, false)).toBe(ref);
    expect(proportionsAuCoin(true, ref, debut, true)).toBeNull();
  });
  it('verrou pose sur une ligne (reference nulle) : rien a garder', () => {
    expect(proportionsAuCoin(true, null, { l: 50, h: 0 }, false)).toBeNull();
  });
});

describe('cotesProportionnels : au coin', () => {
  it('le plus grand des deux rapports l emporte, comme Maj l a toujours fait', () => {
    expect(cotesProportionnels(100, 10, { l: 80, h: 40 })).toEqual({ l: 100, h: 50 });
    expect(cotesProportionnels(10, 100, { l: 80, h: 40 })).toEqual({ l: 200, h: 100 });
  });
  it('rend la taille demandee sans proportion (verrou coupe, ou une ligne)', () => {
    expect(cotesProportionnels(100, 10, null)).toEqual({ l: 100, h: 10 });
    expect(cotesProportionnels(100, 10, { l: 80, h: 0 })).toEqual({ l: 100, h: 10 });
  });
  it('donne au verrou coupe et a Maj les memes nombres qu avant (k = max(l / b.l, h / b.h))', () => {
    const b = { l: 37.3, h: 11.9 }, l = 123.4, h = 56.7, k = Math.max(l / b.l, h / b.h);
    expect(cotesProportionnels(l, h, b)).toEqual({ l: b.l * k, h: b.h * k });
  });
});

describe('boiteAvecCote : les champs L et H', () => {
  it('verrou pose : la hauteur suit la largeur, et l inverse ; le coin haut gauche reste', () => {
    expect(boiteAvecCote(B, 'l', 120, { l: 80, h: 40 })).toEqual({ x: 10, y: 20, l: 120, h: 60 });
    expect(boiteAvecCote(B, 'h', 10, { l: 80, h: 40 })).toEqual({ x: 10, y: 20, l: 20, h: 10 });
  });
  it('verrou coupe, ou une ligne : seul le cote tape change, comme avant', () => {
    expect(boiteAvecCote(B, 'l', 120, null)).toEqual({ ...B, l: 120 });
    expect(boiteAvecCote({ ...B, h: 0 }, 'l', 120, { l: 80, h: 0 })).toEqual({ ...B, l: 120, h: 0 });
  });
  it('ne derive pas : cent frappes tirees de la meme reference gardent la proportion d origine', () => {
    // Une proportion qui ne tombe pas juste en binaire (1/3) : chaque taille tiree de la boite precedente accumulerait l'arrondi.
    let d = lire('<path d="M10 10h30v90h-30z"/>');
    const depart = boite(d, ['f1']);
    let ref = referenceProportions(null, 'f1', depart);
    const premiere = ref;
    for (let i = 0; i < 100; i++) {
      const b = boite(d, ['f1']);
      ref = referenceProportions(ref, 'f1', b);
      d = redimensionner(d, ['f1'], boiteAvecCote(b, i % 2 ? 'l' : 'h', 7 + ((i * 37) % 113) / 3, ref));
    }
    expect(ref).toBe(premiere);
    expect(Math.abs(rapport(boite(d, ['f1'])) - rapport(depart))).toBeLessThan(1e-12);
  });
  it('garde la boite d une selection de plusieurs formes, et celle d un groupe d un dessin riche', () => {
    const plat = lire('<path d="M0 0h20v10H0z"/><path d="M40 30h20v30H40z"/>');
    const b = boite(plat, ['f1', 'f2']), ref = referenceProportions(null, 'f1,f2', b);
    const apres = boite(redimensionner(plat, ['f1', 'f2'], boiteAvecCote(b, 'l', 120, ref)), ['f1', 'f2']);
    expect(apres.l).toBeCloseTo(120, 9);
    expect(rapport(apres)).toBeCloseTo(rapport(b), 12);

    const riche = lire('<g id="g"><path d="M0 0h20v10H0z"/><path d="M40 30h20v30H40z"/></g>', 'riche');
    const groupe = Object.keys(riche.groupes ?? {})[0];
    if (!groupe) throw new Error('un groupe attendu');
    const bg = boite(riche, [groupe]), rg = referenceProportions(null, groupe, bg);
    const apresG = boite(redimensionner(riche, [groupe], boiteAvecCote(bg, 'h', 15, rg)), [groupe]);
    expect(apresG.h).toBeCloseTo(15, 9);
    expect(rapport(apresG)).toBeCloseTo(rapport(bg), 12);
  });
  it('une rotation change la proportion : la boite courante devient la reference', () => {
    const d = lire('<path d="M10 10h60v20h-60z"/>');
    const ref = referenceProportions(null, 'f1', boite(d, ['f1']));
    const tournee = boite(tourner(d, ['f1'], 30), ['f1']);
    const apres = referenceProportions(ref, 'f1', tournee);
    expect(apres).not.toBe(ref);
    expect(apres).toEqual({ cle: 'f1', l: tournee.l, h: tournee.h });
  });
});

describe('boiteRedimensionneeProportionnelle : Alt et fleches, verrou pose', () => {
  const vb: DessinSvg['vb'] = [0, 0, 200, 100], pas = pasDeplacement(vb, false), min = coteMinimal(vb);
  it('le cote de la fleche avance d un pas, l autre suit, le coin haut gauche reste', () => {
    expect(boiteRedimensionneeProportionnelle(B, 'droite', pas, min, B)).toEqual({ x: 10, y: 20, l: 80.2, h: 40.1 });
    const bas = boiteRedimensionneeProportionnelle(B, 'bas', pas, min, B);
    expect(bas).toEqual({ x: 10, y: 20, l: 80.4, h: 40.2 });
    const haut = boiteRedimensionneeProportionnelle(B, 'haut', pas, min, B);
    expect(haut.h).toBeCloseTo(39.8, 12);
    expect(haut.l).toBeCloseTo(79.6, 12);
  });
  it('s arrete quand l un des cotes atteindrait le minimum, et rend alors la meme boite', () => {
    // Une boite quatre fois plus large que haute : la hauteur touche le minimum avant la largeur.
    const etroite = { x: 0, y: 0, l: 4 * min, h: min };
    expect(boiteRedimensionneeProportionnelle(etroite, 'gauche', pas, min, etroite)).toBe(etroite);
    expect(boiteRedimensionneeProportionnelle(etroite, 'haut', pas, min, etroite)).toBe(etroite);
    const r = boiteRedimensionneeProportionnelle({ x: 0, y: 0, l: 4 * min + pas / 2, h: min + pas / 8 }, 'gauche', pas, min, etroite);
    expect(r.h).toBeCloseTo(min, 12);
    expect(r.l).toBeCloseTo(4 * min, 12);
  });
  it('sans verrou, le pas d avant ne change pas', () => {
    expect(boiteRedimensionnee(B, 'droite', pas, min)).toEqual({ ...B, l: 80.2 });
  });
});
