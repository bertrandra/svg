import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  compterCouleurs, couleursExactes, normaliserPretraitement, poserPre, pretraiter, PRESETS_PRETRAITEMENT, resumePretraitement,
  type ImageRgba, type ReglagesPretraitement
} from '../../../src/engine/pretraitement.js';
import { aplatirAlpha } from '../../../src/engine/pixels/alpha.js';
import { agrandirX2, COTE_AGRANDI_MAX } from '../../../src/engine/pixels/agrandir.js';
import { bilateral5, debruiter, mediane3 } from '../../../src/engine/pixels/debruitage.js';
import { passeDeMode } from '../../../src/engine/pixels/lissage.js';
import { affuter, corrigerGamma } from '../../../src/engine/pixels/nettete.js';
import { quantifier } from '../../../src/engine/pixels/quantification.js';
import { cleTraitement, TRAITEMENT_DEFAUT } from '../../../src/engine/vectorisation.js';
import { couleursDistinctes, graine, logo, logoBruite, peindre, photo } from './images-synthetiques.js';

const sha = (i: ImageRgba) => createHash('sha256').update(i.data).digest('hex');
const px = (i: ImageRgba, x: number, y: number) => Array.from(i.data.subarray((y * i.largeur + x) * 4, (y * i.largeur + x) * 4 + 4));
/** L'ecart moyen absolu (RVB) entre deux images de meme taille. */
const ecartMoyen = (a: ImageRgba, b: ImageRgba) => {
  let s = 0;
  for (let i = 0; i < a.largeur * a.hauteur; i++) for (let c = 0; c < 3; c++) s += Math.abs((a.data[i * 4 + c] ?? 0) - (b.data[i * 4 + c] ?? 0));
  return s / (a.largeur * a.hauteur * 3);
};

const TOUS: ReglagesPretraitement = { alpha: true, debruitage: 3, nettete: 2, gamma: 1.2, couleurs: 6, garderFond: true, lissage: 2 };

describe('pretraiter, le tuyau', () => {
  it('rend la source elle-meme, sans copie, quand rien n est touche', () => {
    const src = logoBruite();
    for (const r of [undefined, {}, { debruitage: 0 as never }, { gamma: 1 }, { garderFond: true as const }]) {
      const res = pretraiter(src, r);
      expect(res.image).toBe(src);
      expect(res.etapes).toEqual([]);
      expect(res.palette).toBeNull();
    }
  });

  it('ne modifie jamais sa source, et rend deux fois la meme image', () => {
    const src = logoBruite(), avant = sha(src);
    const a = pretraiter(src, TOUS), b = pretraiter(src, TOUS);
    expect(sha(src)).toBe(avant);
    expect(sha(a.image)).toBe(sha(b.image));
    expect(a.palette).toEqual(b.palette);
    expect(a.image.data).not.toBe(src.data);
  });

  it('joue les etapes dans l ordre fixe, quel que soit l ordre des champs', () => {
    const r = pretraiter(logoBruite(48, 32), { lissage: 1, couleurs: 4, gamma: 1.1, nettete: 1, agrandir: true, debruitage: 1, alpha: true });
    expect(r.etapes).toEqual(['alpha', 'debruitage', 'agrandir', 'nettete', 'gamma', 'couleurs', 'lissage']);
    expect(r.image.largeur).toBe(96);
    expect(r.agrandie).toBe(true);
  });

  it('chaque etape, seule, rend une image neuve et laisse l entree intacte', () => {
    const src = logoBruite(40, 30), avant = sha(src);
    const seules: ReglagesPretraitement[] = [{ alpha: true }, { debruitage: 1 }, { debruitage: 2 }, { debruitage: 3 }, { nettete: 3 }, { gamma: 0.7 }, { couleurs: 5 }, { lissage: 3 }, { agrandir: true }];
    for (const r of seules) {
      const res = pretraiter(src, r);
      expect(sha(src), JSON.stringify(r)).toBe(avant);
      expect(res.image.data.length).toBe(res.image.largeur * res.image.hauteur * 4);
      expect(res.etapes.length).toBe(1);
    }
  });

  it('la photo et le logo traversent tout le tuyau sans valeur hors bornes', () => {
    for (const img of [logoBruite(), photo()]) {
      const res = pretraiter(img, { ...TOUS, agrandir: true });
      expect(res.image.largeur).toBe(img.largeur * 2);
      expect(compterCouleurs(res.image)).toBeLessThanOrEqual(6);
    }
  });
});

describe('alpha', () => {
  const bord = (a: number): ImageRgba => peindre(8, 8, (x, y) => (x === 4 && y === 4 ? [0, 0, 0, a] : [255, 255, 255, 255]));

  it('compose un pixel translucide sur le fond opaque de l image, et le rend opaque', () => {
    const r = aplatirAlpha(bord(128));
    expect(px(r, 4, 4)).toEqual([127, 127, 127, 255]);
  });

  it('sans fond opaque, rend l alpha tout ou rien et garde la couleur', () => {
    const transparent = peindre(8, 8, (x, y) => (x === 4 && y === 4 ? [10, 20, 30, 200] : x === 3 && y === 4 ? [10, 20, 30, 40] : [0, 0, 0, 0]));
    const r = aplatirAlpha(transparent);
    expect(px(r, 4, 4)).toEqual([10, 20, 30, 255]);
    expect(px(r, 3, 4)).toEqual([10, 20, 30, 0]);
    expect(px(r, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  it('laisse intacts les pixels opaques et les pixels absents', () => {
    const src = logo();
    expect(Array.from(aplatirAlpha(src).data)).toEqual(Array.from(src.data));
  });
});

describe('debruitage', () => {
  const propre = logo(), bruite = logoBruite(96, 64, 14);

  it('rapproche le logo bruite du logo propre, a chaque force', () => {
    const avant = ecartMoyen(bruite, propre);
    // Le blanc du fond est ecrete (255 + bruit = 255) : sa moyenne reste un peu sous 255, d'ou une marge.
    for (const f of [1, 2, 3]) expect(ecartMoyen(debruiter(bruite, f), propre), 'force ' + f).toBeLessThan(avant * 0.75);
  });

  it('retire le sel et le poivre d un aplat (mediane)', () => {
    const grain = peindre(9, 9, (x, y) => ((x === 4 && y === 4) ? [255, 0, 0, 255] : [90, 90, 90, 255]));
    expect(px(mediane3(grain), 4, 4)).toEqual([90, 90, 90, 255]);
  });

  it('garde un contour franc : la marche entre deux aplats ne s adoucit pas', () => {
    const marche = peindre(20, 10, x => (x < 10 ? [20, 20, 20, 255] : [230, 230, 230, 255]));
    for (const r of [mediane3(marche), bilateral5(marche, 18), debruiter(marche, 3)]) {
      expect(px(r, 9, 5)).toEqual([20, 20, 20, 255]);
      expect(px(r, 10, 5)).toEqual([230, 230, 230, 255]);
    }
  });

  it('ne laisse pas la couleur d un pixel absent deteindre sur ses voisins', () => {
    // Un fond transparent « noir » ne doit pas assombrir le bord d une forme claire.
    const forme = peindre(12, 12, x => (x < 6 ? [0, 0, 0, 0] : [240, 240, 240, 255]));
    for (const f of [1, 2, 3]) expect(px(debruiter(forme, f), 6, 5), 'force ' + f).toEqual([240, 240, 240, 255]);
  });

  it('force 0 rend l image elle-meme', () => {
    expect(debruiter(bruite, 0)).toBe(bruite);
  });
});

describe('quantification', () => {
  it('retrouve les quatre couleurs d un logo net, a l octet', () => {
    const q = quantifier(logo(), 4);
    expect([...q.palette].sort()).toEqual(['#1e963c', '#c81e28', '#143cbe', '#ffffff'].sort());
    expect(Array.from(q.image.data)).toEqual(Array.from(logo().data));
  });

  it('reduit un logo bruite a N couleurs exactement (N de 2 a 64), jamais plus', () => {
    const b = logoBruite();
    for (const n of [2, 3, 4, 8, 16, 64]) {
      const q = quantifier(b, n);
      expect(compterCouleurs(q.image), 'n=' + n).toBeLessThanOrEqual(n);
      expect(q.palette.length).toBeLessThanOrEqual(n);
    }
    // Avec quatre aplats, quatre couleurs suffisent a retrouver le logo : le bruit disparait.
    expect(ecartMoyen(quantifier(b, 4, true).image, logo())).toBeLessThan(1);
  });

  it('classe la palette par presence, le fond d abord', () => {
    const q = quantifier(logoBruite(), 4);
    expect(parseInt((q.palette[0] ?? '#000000').slice(1), 16) & 0xf0f0f0).toBe(0xf0f0f0);
    const parts = q.palette.map(h => { let n = 0; const rgb = parseInt(h.slice(1), 16); for (let i = 0; i < q.image.largeur * q.image.hauteur; i++) { const c = ((q.image.data[i * 4] ?? 0) << 16) | ((q.image.data[i * 4 + 1] ?? 0) << 8) | (q.image.data[i * 4 + 2] ?? 0); if (c === rgb) n++; } return n; });
    expect([...parts].sort((a, b) => b - a)).toEqual(parts);
  });

  it('garde le blanc a l octet avec « garder le fond », meme sur un fond bruite', () => {
    const b = logoBruite(96, 64, 6);
    const q = quantifier(b, 4, true);
    expect(q.palette).toContain('#ffffff');
    expect(px(q.image, 1, 1).slice(0, 3)).toEqual([255, 255, 255]);
    expect(q.palette.length).toBeLessThanOrEqual(4);
  });

  it('ignore « garder le fond » quand aucun pixel ne ressemble au fond', () => {
    const sombre = peindre(20, 20, x => (x < 10 ? [10, 10, 60, 255] : [200, 30, 30, 255]));
    const q = quantifier(sombre, 2, true);
    expect(q.palette.length).toBe(2);
    expect(q.palette).not.toContain('#ffffff');
  });

  it('est deterministe, ne touche pas l entree, et laisse les pixels absents', () => {
    const src = peindre(30, 20, (x, y) => (x < 3 ? [0, 0, 0, 0] : [(x * 8) & 255, (y * 12) & 255, 99, 255]));
    const avant = sha(src), a = quantifier(src, 5), b = quantifier(src, 5);
    expect(sha(src)).toBe(avant);
    expect(sha(a.image)).toBe(sha(b.image));
    expect(px(a.image, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  it('une image de moins de N couleurs garde les siennes', () => {
    const q = quantifier(peindre(10, 10, x => (x < 5 ? [1, 2, 3, 255] : [250, 251, 252, 255])), 16);
    expect(q.palette.length).toBe(2);
  });

  it('les degrades d une photo se reduisent en 8 teintes', () => {
    const q = quantifier(photo(), 8);
    expect(couleursDistinctes(q.image)).toBeLessThanOrEqual(8);
    expect(couleursDistinctes(photo())).toBeGreaterThan(1000);
  });
});

describe('lissage des bords (filtre de mode)', () => {
  it('efface un pixel isole et un trait d un pixel, sans inventer de couleur', () => {
    const rouge = [200, 0, 0, 255] as const, vert = [0, 200, 0, 255] as const;
    const isole = peindre(11, 11, (x, y) => (x === 5 && y === 5 ? vert : rouge));
    expect(px(passeDeMode(isole, 0), 5, 5)).toEqual([...rouge]);
    const trait = peindre(11, 11, x => (x === 5 ? vert : rouge));
    const r = passeDeMode(trait, 0);
    expect(px(r, 5, 5)).toEqual([...rouge]);
    expect(couleursDistinctes(r)).toBe(1);
  });

  it('garde un contour droit et un angle', () => {
    const coin = peindre(12, 12, (x, y) => (x < 6 && y < 6 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    const r = passeDeMode(coin, 0);
    expect(Array.from(r.data)).toEqual(Array.from(coin.data));
  });

  it('avec une precision de 3 bits, un grain de quelques niveaux ne compte pas', () => {
    const grain = peindre(9, 9, (x, y) => [100 + ((x * 3 + y) % 5), 100, 100, 255]);
    expect(couleursDistinctes(passeDeMode(grain, 3))).toBeLessThanOrEqual(couleursDistinctes(grain));
  });
});

describe('nettete et gamma', () => {
  const marche = peindre(20, 10, x => (x < 10 ? [100, 100, 100, 255] : [150, 150, 150, 255]));

  it('le masque flou accentue un contour mou et laisse un aplat tel quel', () => {
    const r = affuter(marche, 2);
    expect(px(r, 9, 5)[0]).toBeLessThan(100);
    expect(px(r, 10, 5)[0]).toBeGreaterThan(150);
    expect(px(r, 2, 5)).toEqual([100, 100, 100, 255]);
    expect(px(r, 17, 5)).toEqual([150, 150, 150, 255]);
    expect(affuter(marche, 0)).toBe(marche);
  });

  it('une force plus haute accentue davantage', () => {
    expect(px(affuter(marche, 3), 10, 5)[0] ?? 0).toBeGreaterThan(px(affuter(marche, 1), 10, 5)[0] ?? 0);
  });

  it('le gamma eclaircit au-dessus de 1, assombrit en dessous, et respecte le noir et le blanc', () => {
    const gris = peindre(3, 1, x => [[0, 0, 0, 255], [128, 128, 128, 255], [255, 255, 255, 255]][x] as [number, number, number, number]);
    const clair = corrigerGamma(gris, 1.5), sombre = corrigerGamma(gris, 0.6);
    expect(px(clair, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(px(clair, 2, 0)).toEqual([255, 255, 255, 255]);
    expect(px(clair, 1, 0)[0]).toBeGreaterThan(128);
    expect(px(sombre, 1, 0)[0]).toBeLessThan(128);
    expect(corrigerGamma(gris, 1)).toBe(gris);
  });

  it('le gamma ne touche pas l alpha', () => {
    expect(px(corrigerGamma(peindre(1, 1, () => [128, 128, 128, 77]), 1.5), 0, 0)[3]).toBe(77);
  });
});

describe('agrandissement x2', () => {
  it('double les dimensions et garde un aplat plat', () => {
    const plat = peindre(5, 4, () => [10, 200, 30, 255]);
    const r = agrandirX2(plat);
    expect([r.largeur, r.hauteur]).toEqual([10, 8]);
    for (let i = 0; i < 80; i++) expect(Array.from(r.data.subarray(i * 4, i * 4 + 4))).toEqual([10, 200, 30, 255]);
  });

  it('prolonge une marche sans la deplacer : la moitie gauche reste sombre, la droite claire', () => {
    const r = agrandirX2(peindre(10, 4, x => (x < 5 ? [0, 0, 0, 255] : [255, 255, 255, 255])));
    expect(px(r, 7, 3)[0]).toBe(0);
    expect(px(r, 12, 3)[0]).toBe(255);
    // Le milieu de la marche est a 10 ; Catmull-Rom donne 255 x (0,2266 - 0,0234) = 52 a un quart de pixel du centre.
    expect(px(r, 9, 3)[0]).toBe(52);
    expect(px(r, 10, 3)[0]).toBe(203);
  });

  it('un pixel absent n envoie pas sa couleur dans ses voisins', () => {
    const r = agrandirX2(peindre(6, 6, x => (x < 3 ? [0, 0, 0, 0] : [200, 100, 50, 255])));
    // Tout pixel suffisamment opaque a la couleur du dessin, sans noir venu du fond.
    for (let y = 0; y < r.hauteur; y++) for (let x = 0; x < r.largeur; x++) {
      const p = px(r, x, y);
      if ((p[3] ?? 0) > 20) expect(p.slice(0, 3)).toEqual([200, 100, 50]);
    }
  });

  it('refuse (rend l image telle quelle) au-dela de la limite de memoire', () => {
    const grande = { data: new Uint8ClampedArray(4), largeur: COTE_AGRANDI_MAX / 2 + 1, hauteur: 1 };
    expect(agrandirX2(grande)).toBe(grande);
  });

  it('est deterministe', () => {
    const p = photo(33, 21);
    expect(sha(agrandirX2(p))).toBe(sha(agrandirX2(p)));
  });
});

describe('reglages de pretraitement', () => {
  it('normaliser borne les valeurs, retire le neutre et rend undefined s il ne reste rien', () => {
    expect(normaliserPretraitement({ gamma: 9, couleurs: 1000, debruitage: 2, lissage: 0 as never })).toEqual({ gamma: 2, couleurs: 64, debruitage: 2 });
    expect(normaliserPretraitement({ couleurs: 1 })).toEqual({ couleurs: 2 });
    expect(normaliserPretraitement({ garderFond: true })).toBeUndefined();
    expect(normaliserPretraitement({})).toBeUndefined();
    expect(normaliserPretraitement(undefined)).toBeUndefined();
  });

  it('poser retire un reglage remis au neutre : « touche » veut dire « different »', () => {
    let r = poserPre(undefined, 'debruitage', 2);
    expect(r).toEqual({ debruitage: 2 });
    r = poserPre(r, 'gamma', 1);
    expect(r).toEqual({ debruitage: 2 });
    r = poserPre(r, 'couleurs', 8);
    r = poserPre(r, 'garderFond', true);
    expect(r).toEqual({ debruitage: 2, couleurs: 8, garderFond: true });
    // Retirer les couleurs retire « garder le fond » avec elles.
    expect(poserPre(r, 'couleurs', undefined)).toEqual({ debruitage: 2 });
    expect(poserPre(poserPre(undefined, 'agrandir', true), 'agrandir', undefined)).toBeUndefined();
  });

  it('la cle d un traitement sans pretraitement est celle d avant, et chaque reglage la change', () => {
    const base = cleTraitement(TRAITEMENT_DEFAUT);
    expect(base).not.toContain('pretraitement');
    expect(cleTraitement({ ...TRAITEMENT_DEFAUT, pretraitement: { debruitage: 1 } })).not.toBe(base);
    expect(cleTraitement({ ...TRAITEMENT_DEFAUT, pretraitement: { debruitage: 1 } })).not.toBe(cleTraitement({ ...TRAITEMENT_DEFAUT, pretraitement: { debruitage: 2 } }));
    // L ordre des champs ne change pas la cle.
    expect(cleTraitement({ ...TRAITEMENT_DEFAUT, pretraitement: { couleurs: 8, debruitage: 1 } })).toBe(cleTraitement({ ...TRAITEMENT_DEFAUT, pretraitement: { debruitage: 1, couleurs: 8 } }));
  });

  it('les presets posent plusieurs reglages valides d un coup', () => {
    expect(PRESETS_PRETRAITEMENT.map(p => p.libelle)).toEqual(['Logo net', 'Dessin au trait', 'Photo (aplats)']);
    for (const p of PRESETS_PRETRAITEMENT) {
      expect(normaliserPretraitement(p.reglages)).toEqual(p.reglages);
      expect(Object.keys(p.reglages).length).toBeGreaterThan(2);
    }
  });

  it('le resume dit ce qui est touche, dans l ordre du tuyau', () => {
    expect(resumePretraitement(undefined)).toBe('');
    expect(resumePretraitement({ lissage: 1, couleurs: 8, garderFond: true, debruitage: 2 })).toBe('débruitage 2 · couleurs 8 · fond gardé · lissage 1');
  });

  it('couleursExactes liste les couleurs d une image reduite, et refuse une image qui ne l est pas', () => {
    const q = quantifier(logoBruite(), 4, true).image;
    const c = couleursExactes(q, 64);
    expect(c?.length).toBeLessThanOrEqual(4);
    expect(c?.[0]?.hex).toBe('#ffffff');
    expect(couleursExactes(photo(), 64)).toBeNull();
  });

  it('un tirage au sort a graine fixe : le bruit des fixtures est le meme a chaque fois', () => {
    const a = graine(3), b = graine(3);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
