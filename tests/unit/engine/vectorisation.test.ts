import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { convertPixels } from '@visioncortex/vtracer';
import { aTracer, compterTraces, svgContours, optionsTraceur, svgDuTraceur, TRACES_MAX, type Traceur } from '../../../src/engine/vectorisation.js';
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
    // scripts/construire.mjs remplace ces lignes ; une autre version du paquet doit se revoir.
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
