// Les bornes de la lecture (docs/securite.md) : chacune refuse en nommant, et aucune ne touche un SVG ordinaire.

import { describe, it, expect } from 'vitest';
import { lireDessin, lireChemin, lireTransformation } from '../../../src/engine/editionSvg.js';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const svg = (corps: string, attrs = 'viewBox="0 0 100 100"'): string => `<svg ${NS} ${attrs}>${corps}</svg>`;
const refus = (t: string): string => {
  const r = lireDessin(t);
  if (!('erreur' in r)) throw new Error('lu');
  return r.erreur;
};

describe('lireDessin : coordonnees et plan', () => {
  it('refuse des coordonnees demesurees ou qui debordent, au lieu d ecrire NaN ou Infinity', () => {
    expect(refus(svg('<rect width="1e308" height="1e308"/>'))).toContain('coordonnées démesurées');
    expect(refus(svg('<g transform="scale(1e308) scale(1e308)"><rect width="5" height="5"/></g>'))).toContain('coordonnées démesurées');
    expect(refus(svg('<path d="M0 0 A5 5 0 0 1 1e12 1e12"/>'))).toContain('coordonnées démesurées');
  });

  it('lit un nombre en exposant demesure comme une erreur de syntaxe : ce qui precede reste', () => {
    expect(lireChemin('M1 2 L3 4 L1e999 5')).toHaveLength(2);
    expect(lireChemin('M1e999 5')).toHaveLength(0);
  });

  it('refuse un plan de travail demesure, accepte une carte en metres projetes', () => {
    expect(refus(svg('<rect width="5" height="5"/>', 'viewBox="0 0 1e30 1e30"'))).toContain('plan de travail démesuré');
    const carte = lireDessin(svg('<rect x="2e7" y="1e7" width="5" height="5"/>', 'viewBox="0 0 2.1e7 2.1e7"'));
    expect('dessin' in carte).toBe(true);
  });

  it('ne garde pas un dessin dont toutes les formes sont vides', () => {
    expect(refus(svg('<path d="M1e999 1"/><rect width="0" height="5"/>'))).toBe('Ce SVG ne contient aucune forme à éditer.');
  });
});

describe('lireDessin : peinture', () => {
  it('refuse une peinture qui n est pas une couleur lisible : elle serait ecrite telle quelle dans fill="…"', () => {
    expect(refus(svg('<path d="M0 0h5v5z" fill="red url(https://x.invalid/)"/>'))).toContain('peinture');
    expect(refus(svg('<path d="M0 0h5v5z" stroke="a;b"/>'))).toContain('peinture');
  });

  it('garde les peintures ordinaires : couleurs, mots-cles, fonctions modernes', () => {
    for (const fill of ['#c81e28', 'RED', 'rgb(1 2 3 / 50%)', 'hsl(10 50% 50%)', 'inherit', 'context-fill', 'color-mix(in srgb, red 50%, blue)']) {
      expect('dessin' in lireDessin(svg(`<path d="M0 0h5v5z" fill="${fill}"/>`)), fill).toBe(true);
    }
  });
});

describe('lireDessin : bornes de travail', () => {
  it('refuse une imbrication trop profonde, par la lecture comme par l analyse, sans lever', () => {
    expect(refus(svg('<g>'.repeat(5000)))).toContain('trop profond');
    expect(refus(svg('<g>'.repeat(1030) + '</g>'.repeat(1030)))).toContain('trop profond');
  });

  it('lit mille groupes imbriques (la pile des fonctions recursives tient)', () => {
    expect('dessin' in lireDessin(svg('<g>'.repeat(1000) + '<rect width="5" height="5"/>' + '</g>'.repeat(1000)))).toBe(true);
  });

  it('borne les clones <use> d un gros chemin par les donnees de trace, pas seulement par leur nombre', () => {
    const gros = 'M0 0' + 'L5 5'.repeat(100_000);
    const t0 = Date.now();
    expect(refus(svg(`<defs><path id="g" d="${gros}"/></defs>${'<use href="#g"/>'.repeat(2000)}`))).toContain('données de tracé');
    expect(Date.now() - t0).toBeLessThan(8000);
  });

  it('borne les confrontations regle x element : 100 000 regles universelles sur 1 000 formes', () => {
    const t0 = Date.now();
    expect(refus(svg(`<style>${'*{fill:#abc}'.repeat(100_000)}</style>${'<rect width="1" height="1"/>'.repeat(1000)}`))).toContain('trop de règles de style');
    expect(Date.now() - t0).toBeLessThan(4000);
  });

  it('classe les regles sans changer le resultat : classe, identifiant, type et universelles melangees gardent l ordre de la cascade', () => {
    const r = lireDessin(svg('<style>rect{fill:#111}*{stroke:#222}.a{fill:#333}#z{fill:#444}.a.b{fill:#555}rect.b{stroke:#666}</style><rect id="z" class="a b" width="5" height="5"/>'));
    expect('dessin' in r && r.dessin.formes[0]).toMatchObject({ remplissage: '#444444', contour: '#666666' });
  });

  it('lit une liste de transformations en temps lineaire, meme remplie de « scale( » jamais fermes', () => {
    const t0 = Date.now();
    expect(lireTransformation('scale('.repeat(200_000))).toBeNull();
    expect(lireTransformation('translate(1 1) '.repeat(50_000))).not.toBeNull();
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(lireTransformation('translate(1,2) , scale(2)')).toEqual([2, 0, 0, 2, 1, 2]);
    expect(lireTransformation('translate(1) bruit')).toBeNull();
  });
});
