import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { convertPixels } from '@visioncortex/vtracer';
import {
  aTracer, cleTraitement, compterTraces, optionsTraceur, parametresDuMode, PARAMETRES_FINS, poserFin, resumeReglages, retirerFin, svgContours, svgDuTraceur,
  TRACES_MAX, TRAITEMENT_DEFAUT, valeursParDefaut, type Traceur
} from '../../../src/engine/vectorisation.js';
import { detourer } from '../../../src/engine/detourage.js';
import { couleursPixels } from '../../../src/engine/extraction.js';
import { nettoyerSvg } from '../../../src/util/svg.js';
import { boiteDe, ecrireDessin, lireDessin } from '../../../src/engine/editionSvg.js';

// Le traceur des tests : le paquet tel quel, pour Node. Le navigateur prend le meme WebAssembly.
const traceur: Traceur = (rgba, l, h, o) => convertPixels(rgba, l, h, o);

/** Un logo sur fond blanc : un disque rouge, un carre bleu, et un oeil blanc dans le carre. */
function logo(l = 120, h = 80): Uint8ClampedArray {
  const p = new Uint8ClampedArray(l * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) {
    let c = [255, 255, 255, 255];
    if ((x - 35) ** 2 + (y - 40) ** 2 < 25 ** 2) c = [200, 30, 40, 255];
    if (x > 70 && x < 110 && y > 20 && y < 60) c = (x - 90) ** 2 + (y - 40) ** 2 < 6 ** 2 ? [255, 255, 255, 255] : [20, 40, 160, 255];
    p.set(c, (y * l + x) * 4);
  }
  return p;
}

const vectoriser = (pixels: Uint8ClampedArray, l: number, h: number, mode: 'aplats' | 'trait' | 'fidele' = 'aplats') => {
  const couleurs = couleursPixels(pixels).map(c => c.hex);
  const brut = traceur(new Uint8Array(pixels.buffer), l, h, optionsTraceur(mode, 'normale', couleurs));
  return nettoyerSvg(svgDuTraceur(brut));
};

describe('les options du traceur', () => {
  it('imposent la palette du logo en aplats, huit couleurs au plus, et rien qui ne soit #rrggbb', () => {
    const o = optionsTraceur('aplats', 'normale', ['#c81e28', 'rouge', '#1428a0', ...Array.from({ length: 10 }, (_, i) => '#00000' + i)]);
    expect(o.palette).toEqual(['#c81e28', '#1428a0', '#000000', '#000001', '#000002', '#000003', '#000004', '#000005']);
    expect(o.maxColors).toBeUndefined();
    expect(optionsTraceur('aplats', 'normale', []).maxColors).toBe(8);
    expect(optionsTraceur('trait', 'fine')).toMatchObject({ clustering: 'bw', filterSpeckle: 2 });
    expect(optionsTraceur('fidele', 'lisse')).toMatchObject({ preset: 'poster', filterSpeckle: 8, simplify: 1.6 });
  });

  it('gardent le SVG seul, sans en-tete XML ni commentaire', () => {
    const brut = '<?xml version="1.0"?>\n<!-- Generator: x -->\n<svg width="2" height="2"><path d="M0,0"/><!-- note --><path d="M1,1"/></svg>';
    expect(svgDuTraceur(brut)).toBe('<svg width="2" height="2"><path d="M0,0"/><path d="M1,1"/></svg>');
    expect(compterTraces(svgDuTraceur(brut))).toBe(2);
    expect(TRACES_MAX).toBe(4000);
  });
});

describe('vectoriser un logo detoure (vtracer)', () => {
  it('trace les formes aux couleurs du logo, sans le fond retire, et garde l oeil blanc', () => {
    const p = logo();
    const d = detourer(p, 120, 80);
    expect(d.fond).toBe('#ffffff');
    const svg = vectoriser(p, 120, 80);
    expect(svg).not.toBeNull();
    if (!svg) return;
    expect(svg.ratio).toBe(1.5);
    expect(svg.svg).toContain('viewBox="0 0 120 80"');
    const fills = [...new Set((svg.svg.match(/fill="#[0-9A-Fa-f]{6}"/g) ?? []).map(f => f.slice(6, 13).toLowerCase()))].sort();
    // Le rouge, le bleu, et le blanc de l'oeil, enferme dans le carre : il n'est pas du fond.
    expect(fills).toEqual(['#1428a0', '#c81e28', '#ffffff']);
    expect(compterTraces(svg.svg)).toBe(3);
  });

  it('s ouvre dans l editeur : memes formes, memes couleurs, aux memes places', () => {
    const p = logo();
    detourer(p, 120, 80);
    const svg = vectoriser(p, 120, 80)?.svg ?? '';
    const lu = lireDessin(svg);
    expect('dessin' in lu).toBe(true);
    if (!('dessin' in lu)) return;
    expect(lu.dessin.vb).toEqual([0, 0, 120, 80]);
    expect(lu.dessin.formes.map(f => f.remplissage).sort()).toEqual(['#1428a0', '#c81e28', '#ffffff']);
    const disque = lu.dessin.formes.find(f => f.remplissage === '#c81e28');
    const b = disque && boiteDe(lu.dessin, [disque.id]);
    expect(b && [b.x, b.y, b.l, b.h].map(v => Math.round(v / 5) * 5)).toEqual([10, 15, 50, 50]);
    const relu = lireDessin(ecrireDessin(lu.dessin));
    expect('dessin' in relu && relu.dessin.formes.length).toBe(3);
  });

  it('rend toujours le meme SVG pour le meme logo et le meme reglage', () => {
    const a = logo(), b = logo();
    detourer(a, 120, 80); detourer(b, 120, 80);
    expect(vectoriser(a, 120, 80)?.svg).toBe(vectoriser(b, 120, 80)?.svg);
  });

  it('trace en noir seul en mode trait ; une image entierement detouree n est jamais confiee au traceur', () => {
    const p = logo();
    detourer(p, 120, 80);
    const trait = vectoriser(p, 120, 80, 'trait')?.svg ?? '';
    expect(new Set(trait.match(/fill="#[0-9A-Fa-f]{6}"/g))).toEqual(new Set(['fill="#000000"']));
    const vide = new Uint8ClampedArray(40 * 40 * 4).fill(255);
    expect(aTracer(vide)).toBe(true);
    detourer(vide, 40, 40);
    // Le traceur s'arrete en erreur sur une image vide en mode couleur : aTracer le garde de cet appel.
    expect(aTracer(vide)).toBe(false);
    expect(() => vectoriser(vide, 40, 40)).toThrow();
  });

  it('se construit pour le navigateur : la colle du paquet charge toujours son .wasm comme le script de construction l attend', () => {
    // scripts/vtracer.mjs remplace ces lignes ; une autre version du paquet doit se revoir.
    const colle = readFileSync(resolve(__dirname, '../../../node_modules/@visioncortex/vtracer/pkg/vtracer_wasm.js'), 'utf8');
    expect(colle).toContain("const wasmBytes = require('fs').readFileSync(wasmPath);");
    expect(colle).toContain('let wasmInstance = new WebAssembly.Instance(wasmModule, __wbg_get_imports());');
  });
});

describe('svgContours', () => {
  it('pose une feuille de contours juste apres l ouverture, sans toucher aux traces', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0L10 10" fill="#c81e28"/></svg>';
    const c = svgContours(svg, '#123456');
    expect(c.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><style>')).toBe(true);
    expect(c).toContain('fill:none!important;stroke:#123456!important');
    expect(c).toContain('<path d="M0 0L10 10" fill="#c81e28"/>');
    expect(compterTraces(c)).toBe(1);
  });

  it('rend tel quel un texte sans svg', () => {
    expect(svgContours('rien')).toBe('rien');
  });
});


describe('les reglages fins', () => {
  it('ne changent rien tant qu on n y touche pas, et l emportent sur le mode quand on y touche', () => {
    const couleurs = ['#c81e28', '#1428a0', '#000000', '#ffffff'];
    expect(optionsTraceur('aplats', 'normale', couleurs, {})).toEqual(optionsTraceur('aplats', 'normale', couleurs));
    const o = optionsTraceur('aplats', 'normale', couleurs, { filterSpeckle: 9, simplify: 2.5, cornerThreshold: 120, colorPrecision: 3, layerDifference: 30, couleursMax: 2, courbes: 'polygon', empilement: 'cutout' });
    expect(o).toMatchObject({ filterSpeckle: 9, simplify: 2.5, cornerThreshold: 120, colorPrecision: 3, layerDifference: 30, mode: 'polygon', hierarchical: 'cutout' });
    expect(o.palette).toEqual(['#c81e28', '#1428a0']);
    // Sans palette, c'est le nombre maximal de couleurs qui borne le traceur.
    expect(optionsTraceur('aplats', 'normale', [], { couleursMax: 3 }).maxColors).toBe(3);
    // Un simplify a 0 se retire : le traceur garde tous ses points.
    expect(optionsTraceur('aplats', 'normale', couleurs, { simplify: 0 }).simplify).toBeUndefined();
    // Les modes sans palette ignorent couleursMax, et le trait ne pose l'angle que s'il est touche.
    expect(optionsTraceur('trait', 'fine', couleurs, { couleursMax: 2 })).toEqual(optionsTraceur('trait', 'fine', couleurs));
    expect(optionsTraceur('trait', 'fine', couleurs, { cornerThreshold: 90 }).cornerThreshold).toBe(90);
    expect(optionsTraceur('fidele', 'lisse', couleurs, { colorPrecision: 4 })).toMatchObject({ preset: 'poster', colorPrecision: 4, layerDifference: 8 });
  });

  it('donnent les valeurs du mode, et ne gardent que ce qui s en ecarte', () => {
    expect(valeursParDefaut('aplats', 'normale', 3)).toMatchObject({ filterSpeckle: 4, simplify: 0.8, cornerThreshold: 60, colorPrecision: 6, layerDifference: 16, couleursMax: 3, courbes: 'spline', empilement: 'stacked' });
    expect(valeursParDefaut('fidele', 'fine')).toMatchObject({ filterSpeckle: 2, simplify: 0, colorPrecision: 7, layerDifference: 8, couleursMax: 8 });
    expect(valeursParDefaut('aplats', 'fine', 20).couleursMax).toBe(8);
    const d = valeursParDefaut('aplats', 'normale');
    const a = poserFin(undefined, 'filterSpeckle', 9, d.filterSpeckle);
    expect(a).toEqual({ filterSpeckle: 9 });
    expect(poserFin(a, 'courbes', 'polygon', d.courbes)).toEqual({ filterSpeckle: 9, courbes: 'polygon' });
    // Remettre la valeur du mode retire le reglage ; plus rien de touche, plus d'objet.
    expect(poserFin(a, 'filterSpeckle', d.filterSpeckle, d.filterSpeckle)).toBeUndefined();
    expect(retirerFin({ filterSpeckle: 9, courbes: 'polygon' }, 'courbes')).toEqual({ filterSpeckle: 9 });
    expect(retirerFin({ filterSpeckle: 9 }, 'filterSpeckle')).toBeUndefined();
  });

  it('proposent a chaque mode les seuls curseurs qui y changent quelque chose', () => {
    expect(parametresDuMode('aplats').map(p => p.id)).toEqual(['couleursMax', 'filterSpeckle', 'simplify', 'cornerThreshold', 'colorPrecision', 'layerDifference']);
    expect(parametresDuMode('trait').map(p => p.id)).toEqual(['filterSpeckle', 'simplify', 'cornerThreshold']);
    expect(parametresDuMode('fidele').map(p => p.id)).toEqual(['filterSpeckle', 'simplify', 'cornerThreshold', 'colorPrecision', 'layerDifference']);
    for (const p of PARAMETRES_FINS) { expect(p.min).toBeLessThan(p.max); expect(p.pas).toBeGreaterThan(0); expect(p.aide.length).toBeGreaterThan(20); }
  });

  it('se resument en une ligne, et se comparent par une cle independante de l ordre des champs', () => {
    expect(resumeReglages({ mode: 'aplats', finesse: 'normale' })).toBe('Aplats · normal');
    expect(resumeReglages({ mode: 'trait', finesse: 'fine', fins: { filterSpeckle: 8, courbes: 'polygon', couleursMax: 3 } })).toBe('Trait · fin · poussières 8 · couleurs 3 · segments droits');
    const a = { ...TRAITEMENT_DEFAUT, vecteurs: { mode: 'aplats' as const, finesse: 'fine' as const, fins: { courbes: 'polygon' as const, filterSpeckle: 3 } } };
    const b = { vecteurs: { fins: { filterSpeckle: 3, courbes: 'polygon' as const }, finesse: 'fine' as const, mode: 'aplats' as const }, portee: 'bord' as const, tolerance: TRAITEMENT_DEFAUT.tolerance, detourer: true };
    expect(cleTraitement(a)).toBe(cleTraitement(b));
    expect(cleTraitement(a)).not.toBe(cleTraitement(TRAITEMENT_DEFAUT));
    expect(cleTraitement({ ...TRAITEMENT_DEFAUT, portee: 'partout' })).not.toBe(cleTraitement(TRAITEMENT_DEFAUT));
    expect(cleTraitement({ ...TRAITEMENT_DEFAUT, vecteurs: null })).not.toBe(cleTraitement(TRAITEMENT_DEFAUT));
  });
});

describe('les reglages fins sur le vrai traceur', () => {
  /** Le logo, avec quatre poussieres de 3 x 3 pixels : de quoi voir le curseur « Poussieres » agir. */
  function logoPoussieres(): Uint8ClampedArray {
    const l = 120, p = logo(l, 80);
    for (const [x0, y0] of [[5, 5], [100, 70], [60, 12], [8, 70]]) {
      for (let y = y0 ?? 0; y < (y0 ?? 0) + 3; y++) for (let x = x0 ?? 0; x < (x0 ?? 0) + 3; x++) p.set([60, 60, 60, 255], (y * l + x) * 4);
    }
    return p;
  }
  const lancer = (mode: 'aplats' | 'trait' | 'fidele', finesse: 'fine' | 'normale' | 'lisse', fins = {}) => {
    const p = logoPoussieres();
    detourer(p, 120, 80);
    const couleurs = couleursPixels(p).map(c => c.hex);
    return svgDuTraceur(traceur(new Uint8Array(p.buffer), 120, 80, optionsTraceur(mode, finesse, couleurs, fins)));
  };
  const commandes = (svg: string) => [...new Set((svg.match(/ d="([^"]*)"/g) ?? []).join(' ').replace(/ d=/g, '').match(/[A-Za-z]/g) ?? [])].sort().join('');

  it('ignorent les poussieres a la demande, et rejouent le meme SVG pour les memes reglages', () => {
    const avec = lancer('aplats', 'fine', { filterSpeckle: 0 }), sans = lancer('aplats', 'fine', { filterSpeckle: 16 });
    expect(compterTraces(sans)).toBeLessThan(compterTraces(avec));
    expect(lancer('aplats', 'fine', { filterSpeckle: 16 })).toBe(sans);
  });

  it('tracent en segments droits, ou en formes decoupees, ou avec moins de couleurs, ou plus simples', () => {
    const base = lancer('aplats', 'fine');
    expect(commandes(base)).toMatch(/[Cc]/);
    const droit = lancer('aplats', 'fine', { courbes: 'polygon' });
    expect(commandes(droit)).not.toMatch(/[Cc]/);
    expect(droit.length).toBeLessThan(base.length);
    expect(compterTraces(lancer('aplats', 'fine', { empilement: 'cutout' }))).toBeGreaterThan(compterTraces(base));
    const couleurs = (svg: string) => new Set(svg.match(/fill="#[0-9A-Fa-f]{6}"/g)).size;
    expect(couleurs(lancer('aplats', 'fine', { couleursMax: 2 }))).toBe(2);
    expect(lancer('aplats', 'fine', { simplify: 4 }).length).toBeLessThan(base.length);
  });
});
