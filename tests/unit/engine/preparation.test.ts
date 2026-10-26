// Le jugement d'un dessin pour Cricut et ses corrections (ADR-0013) : chaque constat a son cas positif et son cas
// negatif, chaque correction est pure (le dessin donne ne bouge pas), deterministe (deux fois, les memes octets)
// et verifiee sur la geometrie (aires, fermetures, couleurs). Les dessins sont en unites du plan : 96 au pouce.

import { describe, expect, it } from 'vitest';
import { regionDeForme } from '../../../src/engine/booleens.js';
import { aireDeRegion } from '../../../src/engine/contour/region.js';
import { compterPoints, ecrireDessin, lireDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import {
  constatsBloquants, constatsPreparation, corrigerPreparation, couchesDe, etendueVisible, finesseDe, resoudreProfil, resumePreparation, silhouetteDe,
  FORMES_MAX_FINESSE, type CodeConstat, type Constat, type ProfilProduction
} from '../../../src/engine/preparation.js';
import { CHOIX_CRICUT_DEFAUT, type ChoixMachine } from '../../../src/model/contextes.js';
import { au } from '../../../src/util/tableaux.js';

const lire = (corps: string, vb = '0 0 1200 1200'): DessinSvg => {
  const r = lireDessin('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '">' + corps + '</svg>');
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
// Recalage automatique coche (ADR-0039) : ces constats datent du defaut d'avant sa revision du 26 octobre 2026 (le tapis suit le
// dessin, « depassement » se pose) ; le tapis fixe, defaut depuis, a ses constats dans recalage.test.ts (« hors-tapis »).
const profil = (choix: Partial<ChoixMachine> = {}): ProfilProduction => {
  const p = resoudreProfil({ contexte: 'cricut', ...CHOIX_CRICUT_DEFAUT, unite: 'in', recalage: true, ...choix });
  if (!p) throw new Error('profil');
  return p;
};
const MAKER = profil();
const codes = (d: DessinSvg, p = MAKER): CodeConstat[] => constatsPreparation(d, p).map(c => c.code);
const constat = (d: DessinSvg, code: CodeConstat, p = MAKER): Constat => {
  const c = constatsPreparation(d, p).find(x => x.code === code);
  if (!c) throw new Error('pas de constat ' + code);
  return c;
};
const aire = (d: DessinSvg, id: string): number => {
  const f = d.formes.find(x => x.id === id);
  return f ? aireDeRegion(regionDeForme(f, 0.01)) : 0;
};

/** Corrige, et verifie au passage la purete (le dessin donne ne bouge pas) et le determinisme (memes octets deux fois). */
function corriger(d: DessinSvg, code: CodeConstat, p = MAKER): { dessin: DessinSvg; phrase: string } {
  const c = constat(d, code, p);
  if (!c.correction) throw new Error('pas de correction pour ' + code);
  const avant = JSON.stringify(d);
  const r1 = corrigerPreparation(d, c.correction, c, p), r2 = corrigerPreparation(d, c.correction, c, p);
  expect(JSON.stringify(d), 'le dessin donne a bouge').toBe(avant);
  if ('erreur' in r1 || 'erreur' in r2) throw new Error('erreur' in r1 ? r1.erreur : 'erreur');
  expect(ecrireDessin(r1.dessin, 3)).toBe(ecrireDessin(r2.dessin, 3));
  expect(r1.phrase).toBe(r2.phrase);
  return r1;
}

const CARRE = '<path d="M96 96H288V288H96Z" fill="#c81e28"/>';

describe('un dessin pret pour la decoupe', () => {
  it('n a aucun constat, et dit ses couches et sa taille', () => {
    const d = lire(CARRE + '<path d="M384 96H576V288H384Z" fill="#1428a0"/>');
    expect(constatsPreparation(d, MAKER)).toEqual([]);
    expect(constatsBloquants(d, MAKER)).toEqual([]);
    const r = resumePreparation(d);
    expect(r.couches).toEqual([{ couleur: '#c81e28', ids: ['f1'] }, { couleur: '#1428a0', ids: ['f2'] }]);
    expect(r.taille).toEqual({ l: 480, h: 192 });
  });

  it('juge de facon deterministe, sans toucher au dessin', () => {
    const d = lire(CARRE + '<path d="M400 100H404V300H400Z" fill="#c91f27" stroke="#000" stroke-width="4" opacity="0.5"/>');
    const avant = JSON.stringify(d);
    const a = constatsPreparation(d, MAKER), b = constatsPreparation(d, MAKER);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(d)).toBe(avant);
    // Du plus grave au plus leger.
    expect(a.map(c => c.gravite)).toEqual([...a.map(c => c.gravite)].sort((x, y) => ['bloquant', 'a-corriger', 'conseil'].indexOf(x) - ['bloquant', 'a-corriger', 'conseil'].indexOf(y)));
  });
});

describe('les constats, un a un', () => {
  it('vide : rien de visible bloque', () => {
    const d = lire(CARRE);
    expect(codes({ ...d, formes: d.formes.map(f => ({ ...f, visible: false })) })).toEqual(['vide']);
    expect(constatsBloquants({ ...d, formes: d.formes.map(f => ({ ...f, visible: false })) }, MAKER).map(c => c.code)).toEqual(['vide']);
    expect(codes(d)).not.toContain('vide');
  });

  it('trait : un contour visible bloque ; un trait d epaisseur nulle, non', () => {
    expect(codes(lire('<path d="M96 96H288V288H96Z" fill="#c81e28" stroke="#000000" stroke-width="8"/>'))).toContain('trait');
    expect(codes(lire('<path d="M96 96H288V288H96Z" fill="#c81e28" stroke="#000000" stroke-width="0"/>'))).not.toContain('trait');
    // Un contour sans fond se propose a ecrire au stylo (ADR-0028) : il ne bloque plus la decoupe ; dit « à couper », il bloque.
    expect(codes(lire('<path d="M96 96H288V288H96Z" fill="none" stroke="#000" stroke-width="8"/>'))).not.toContain('trait');
    expect(constat(lire('<path d="M96 96H288V288H96Z" fill="none" stroke="#000" stroke-width="8" data-ed-operation="decoupe"/>'), 'trait').gravite).toBe('bloquant');
  });

  it('opacite : une forme transparente bloque ; une forme opaque, non', () => {
    expect(codes(lire('<path d="M96 96H288V288H96Z" fill="#c81e28" fill-opacity="0.5"/>'))).toContain('opacite');
    expect(codes(lire('<path d="M96 96H288V288H96Z" fill="#c81e28" opacity="0.9"/>'))).toContain('opacite');
    expect(codes(lire(CARRE))).not.toContain('opacite');
  });

  it('piece trop grande : une forme plus grande que la zone utile bloque, et le tapis 12 x 24 est propose', () => {
    const d = lire('<path d="M0 0H1200V96H0Z" fill="#000"/>', '0 0 1300 1300');
    const c = constat(d, 'piece-trop-grande');
    expect(c.gravite).toBe('bloquant');
    expect(c.tapis).toBe('12x24');
    expect(c.message).toContain('11,5 × 11,5 po');
    expect(codes(lire('<path d="M0 0H1100V96H0Z" fill="#000"/>', '0 0 1300 1300'))).not.toContain('piece-trop-grande');
  });

  it('depassement : des pieces qui tiennent mais un dessin qui deborde, a corriger', () => {
    const d = lire('<path d="M0 0H576V576H0Z" fill="#000"/><path d="M0 672H576V1248H0Z" fill="#000"/>', '0 0 1300 1300');
    const c = constat(d, 'depassement');
    expect(c.gravite).toBe('a-corriger');
    expect(c.aVerifier).toBe(true);
    expect(c.tapis).toBe('12x24');
    expect(codes(d, profil({ tapis: '12x24' }))).not.toContain('depassement');
    expect(codes(lire('<path d="M0 0H576V576H0Z" fill="#000"/>'))).not.toContain('depassement');
  });

  it('trace ouvert : une forme pleine non fermee, a corriger ; fermee, non', () => {
    expect(constat(lire('<path d="M96 96L288 96L192 288" fill="#c81e28"/>'), 'trace-ouvert').formes).toEqual(['f1']);
    expect(codes(lire('<path d="M96 96L288 96L192 288Z" fill="#c81e28"/>'))).not.toContain('trace-ouvert');
  });

  it('nuances proches : deux rouges presque egaux, deux tapis pour rien ; un rouge et un bleu, non', () => {
    const c = constat(lire(CARRE + '<path d="M384 96H576V288H384Z" fill="#c91f27"/>'), 'nuances-proches');
    expect(c.formes).toEqual(['f1', 'f2']);
    expect(c.message).toContain('1 tapis de trop');
    expect(codes(lire(CARRE + '<path d="M384 96H576V288H384Z" fill="#1428a0"/>'))).not.toContain('nuances-proches');
    // Une forme masquee ne fait pas de tapis.
    expect(codes(lire(CARRE + '<path d="M384 96H576V288H384Z" fill="#c91f27" display="none"/>'))).not.toContain('nuances-proches');
  });

  it('detail fin : une bande plus etroite que 1/16 po, et un bras etroit sur une forme large ; pas un carre', () => {
    const d = lire('<path d="M96 96H99V288H96Z" fill="#000"/><path d="M384 96H576V288H384Z M576 180H700V183H576Z" fill="#000"/>' + '<path d="M700 600H900V800H700Z" fill="#000"/>');
    const c = constat(d, 'detail-fin');
    expect(c.formes).toEqual(['f1', 'f2']);
    expect(c.zones?.length).toBeGreaterThan(0);
    expect(c.message).toContain('0,06 po');
  });

  it('trop de noeuds : un tracé de plus de 5 000 points, en conseil', () => {
    const n = 6000, pts = Array.from({ length: n }, (_, i) => { const a = (2 * Math.PI * i) / n; return (600 + 400 * Math.cos(a)).toFixed(3) + ' ' + (600 + 400 * Math.sin(a)).toFixed(3); });
    const d = lire('<path d="M' + pts.join('L') + 'Z" fill="#000"/>');
    expect(constat(d, 'trop-de-noeuds').gravite).toBe('conseil');
    expect(codes(lire(CARRE))).not.toContain('trop-de-noeuds');
  });

  it('trou superpose : une forme blanche posee sur une autre ; posee a cote, non', () => {
    expect(constat(lire('<circle cx="300" cy="300" r="200" fill="#000"/><circle cx="300" cy="300" r="80" fill="#fff"/>'), 'trou-superpose').formes).toEqual(['f1', 'f2']);
    expect(codes(lire('<circle cx="300" cy="300" r="200" fill="#000"/><circle cx="800" cy="300" r="80" fill="#fff"/>'))).not.toContain('trou-superpose');
  });

  it('pair-impair : un anneau en evenodd, a tester ; le meme selon le sens du trace, non', () => {
    const ANNEAU = 'M100 300A200 200 0 1 0 500 300A200 200 0 1 0 100 300Z M220 300A80 80 0 1 0 380 300A80 80 0 1 0 220 300Z';
    const c = constat(lire('<path d="' + ANNEAU + '" fill="#000" fill-rule="evenodd"/>'), 'pair-impair');
    expect(c.aVerifier).toBe(true);
    expect(codes(lire('<path d="' + ANNEAU + '" fill="#000"/>'))).not.toContain('pair-impair');
  });

  it('analyse limitee : au-dela de ' + FORMES_MAX_FINESSE + ' formes, la mesure des parties fines le dit', () => {
    const carres = Array.from({ length: FORMES_MAX_FINESSE + 5 }, (_, i) => '<path d="M' + (i % 20) * 50 + ' ' + Math.floor(i / 20) * 50 + 'h30v30h-30z" fill="#000"/>').join('');
    expect(constat(lire(carres), 'analyse-limitee').message).toContain(FORMES_MAX_FINESSE + ' formes sur ' + (FORMES_MAX_FINESSE + 5));
    expect(codes(lire(CARRE))).not.toContain('analyse-limitee');
  });

  it('Print Then Cut : juge la taille avec le fond perdu, pas les traits ni les couleurs', () => {
    const ptc = profil({ procede: 'imprimer-decouper' });
    const petit = lire('<path d="M96 96H288V288H96Z" fill="#c81e28" stroke="#000" stroke-width="4" opacity="0.5"/><path d="M300 96H400V288H300Z" fill="#c91f27"/>');
    expect(codes(petit, ptc)).toEqual([]);
    const grand = lire('<path d="M0 0H768V768H0Z" fill="#c81e28"/>');
    const c = constat(grand, 'ptc-trop-grand', ptc);
    expect(c.gravite).toBe('bloquant');
    expect(c.message).toContain('6,75 × 9,25 po');
    // Couche : 8 x 8 po ne tient ni debout ni couche ; 9 x 6 po tient couche.
    expect(codes(lire('<path d="M0 0H864V576H0Z" fill="#c81e28"/>'), ptc)).toEqual([]);
  });
});

describe('la mesure des parties fines', () => {
  const p = MAKER.detailMin;
  it('voit une partie entiere trop fine et la laisse au-dela du seuil', () => {
    const d = lire('<path d="M0 0H4V100H0Z" fill="#000"/><path d="M200 0H208V100H200Z" fill="#000"/>');
    expect(finesseDe(au(d.formes, 0), p, 0.01)?.entieres).toBe(1);
    expect(finesseDe(au(d.formes, 1), p, 0.01)).toEqual({ entieres: 0, etroites: 0, aire: 0, zones: [] });
  });

  it('ne compte pas les angles d un carre, mais une pointe aigue si', () => {
    const d = lire('<path d="M0 0H100V100H0Z" fill="#000"/><path d="M0 200L200 215L0 230Z" fill="#000"/>');
    expect(finesseDe(au(d.formes, 0), p, 0.01)?.etroites).toBe(0);
    expect(finesseDe(au(d.formes, 1), p, 0.01)?.etroites).toBe(1);
  });

  it('mesure un isthme : deux disques relies par un pont de 3 unites', () => {
    const d = lire('<path d="M0 0H100V100H0Z M100 48H200V51H100Z M200 0H300V100H200Z" fill="#000"/>');
    const m = finesseDe(au(d.formes, 0), p, 0.01);
    expect(m?.entieres).toBe(0);
    expect(m?.etroites).toBe(1);
    expect(m?.aire).toBeGreaterThan(250);
    expect(m?.aire).toBeLessThan(320);
  });

  it('se memorise par forme : la meme forme rend le meme objet', () => {
    const f = au(lire('<path d="M0 0H4V100H0Z" fill="#000"/>').formes, 0);
    expect(finesseDe(f, p, 0.01)).toBe(finesseDe(f, p, 0.01));
    expect(finesseDe({ ...f, remplissage: null }, p, 0.01)).toBeNull();
  });
});

describe('les corrections, une a une', () => {
  it('contour en forme : le trait devient une forme pleine, et le constat disparait', () => {
    const d = lire('<path d="M96 96H288V288H96Z" fill="#c81e28" stroke="#000000" stroke-width="8"/>');
    const r = corriger(d, 'trait');
    expect(r.dessin.formes.map(f => [f.remplissage, f.contour])).toEqual([['#c81e28', null], ['#000000', null]]);
    expect(codes(r.dessin)).not.toContain('trait');
    expect(r.phrase).toBe('1 contour transformé en forme.');
  });

  it('rendre opaque : l opacite revient a 1, la couleur ne change pas', () => {
    const r = corriger(lire('<path d="M96 96H288V288H96Z" fill="#c81e28" fill-opacity="0.5" opacity="0.8"/>'), 'opacite');
    expect(ecrireDessin(r.dessin, 3)).toBe(ecrireDessin(lire(CARRE), 3));
  });

  it('redimensionner a la zone utile : le dessin tient, proportions et coin haut gauche gardes', () => {
    const d = lire('<path d="M0 0H1200V96H0Z" fill="#000"/>', '0 0 1300 1300');
    const r = corriger(d, 'piece-trop-grande');
    const e = etendueVisible(r.dessin);
    expect(e?.x).toBeCloseTo(0, 6);
    expect(e?.l).toBeLessThanOrEqual(11.5 * 96);
    expect(e?.l).toBeGreaterThan(11.5 * 96 * 0.99);
    expect((e?.l ?? 0) / (e?.h ?? 1)).toBeCloseTo(1200 / 96, 6);
    expect(codes(r.dessin)).toEqual([]);
    expect(r.phrase).toMatch(/^Dessin réduit à 91,9 % : 11,5 × 0,92 po\.$/);
  });

  it('fermer : un Z ferme le trace, l aire peinte ne change pas', () => {
    const d = lire('<path d="M96 96L288 96L192 288" fill="#c81e28"/>');
    const r = corriger(d, 'trace-ouvert');
    expect(r.dessin.formes[0]?.d.at(-1)?.c).toBe('Z');
    expect(aire(r.dessin, 'f1')).toBeCloseTo(aire(d, 'f1'), 6);
    expect(codes(r.dessin)).not.toContain('trace-ouvert');
  });

  it('fusionner les nuances : une seule couleur, une seule couche', () => {
    const d = lire(CARRE + CARRE.replace('#c81e28', '#c91f27').replace('M96 96H288', 'M384 96H576').replace('V288H96Z', 'V288H384Z') + CARRE.replace('M96 96H288', 'M600 96H700').replace('V288H96Z', 'V288H600Z'));
    expect(couchesDe(d)).toHaveLength(2);
    const r = corriger(d, 'nuances-proches');
    expect(couchesDe(r.dessin)).toEqual([{ couleur: '#c81e28', ids: ['f1', 'f2', 'f3'] }]);
  });

  it('epaissir : la bande trop fine prend la largeur du seuil et n est plus signalee', () => {
    const d = lire('<path d="M96 96H99V288H96Z" fill="#000"/>');
    const r = corriger(d, 'detail-fin');
    expect(aire(r.dessin, 'f1')).toBeGreaterThan(aire(d, 'f1') + 2 * 192 * 2.9);
    expect(codes(r.dessin)).not.toContain('detail-fin');
    expect(r.phrase).toBe('1 forme épaissie de 0,03 po de chaque côté.');
  });

  it('nettoyer : moins de points, sous le seuil, a la tolerance du materiau', () => {
    const n = 6000, pts = Array.from({ length: n }, (_, i) => { const a = (2 * Math.PI * i) / n; return (600 + 400 * Math.cos(a)).toFixed(3) + ' ' + (600 + 400 * Math.sin(a)).toFixed(3); });
    const d = lire('<path d="M' + pts.join('L') + 'Z" fill="#000"/>');
    const r = corriger(d, 'trop-de-noeuds');
    expect(compterPoints(r.dessin.formes[0]?.d ?? [])).toBeLessThan(500);
    expect(aire(r.dessin, 'f1') / aire(d, 'f1')).toBeGreaterThan(0.998);
    expect(codes(r.dessin)).not.toContain('trop-de-noeuds');
  });

  it('percer : la forme blanche devient un trou dans celle du dessous', () => {
    const d = lire('<circle cx="300" cy="300" r="200" fill="#000"/><circle cx="300" cy="300" r="80" fill="#fff"/>');
    const r = corriger(d, 'trou-superpose');
    expect(r.dessin.formes).toHaveLength(1);
    const f = au(r.dessin.formes, 0);
    expect(f.remplissage).toBe('#000000');
    expect(aireDeRegion(regionDeForme(f, 0.01)) / (Math.PI * (200 * 200 - 80 * 80))).toBeCloseTo(1, 3);
  });

  it('reecrire les trous : nonzero, la meme region, les courbes gardees', () => {
    const ANNEAU = 'M100 300A200 200 0 1 0 500 300A200 200 0 1 0 100 300Z M220 300A80 80 0 1 0 380 300A80 80 0 1 0 220 300Z';
    const d = lire('<path d="' + ANNEAU + '" fill="#000" fill-rule="evenodd"/>');
    const r = corriger(d, 'pair-impair');
    const f = au(r.dessin.formes, 0);
    expect(f.regle).toBe('nonzero');
    expect(f.d.filter(c => c.c === 'C').length).toBe(au(d.formes, 0).d.filter(c => c.c === 'C').length);
    expect(aire(r.dessin, 'f1')).toBeCloseTo(aire(d, 'f1'), 3);
    expect(codes(r.dessin)).not.toContain('pair-impair');
  });

  it('dit quand il n y a plus rien a corriger, sans rendre un autre dessin', () => {
    const d = lire(CARRE);
    expect(corrigerPreparation(d, 'fermer', { formes: ['f1'] }, MAKER)).toHaveProperty('erreur');
    expect(corrigerPreparation(d, 'ajuster-zone', { formes: ['f1'] }, MAKER)).toEqual({ erreur: 'Le dessin tient déjà dans la zone utile.' });
  });

  it('redimensionne pour Print Then Cut en gardant la place du fond perdu', () => {
    const ptc = profil({ procede: 'imprimer-decouper' });
    const r = corriger(lire('<path d="M0 0H768V768H0Z" fill="#c81e28"/>'), 'ptc-trop-grand', ptc);
    expect(codes(r.dessin, ptc)).toEqual([]);
    const s = silhouetteDe(r.dessin, 0.06);
    expect(s).toHaveLength(1);
  });
});
