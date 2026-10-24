import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { porterCss, porterSelecteur, remEnPixels, separerSelecteurs } from '../../../src/util/cssPortee.js';

const R = '.editeur-svg';

describe('separerSelecteurs', () => {
  it('coupe aux virgules du premier niveau seulement', () => {
    expect(separerSelecteurs('a, b:not(.x, .y) ,c[data-k="1,2"]')).toEqual(['a', 'b:not(.x, .y)', 'c[data-k="1,2"]']);
  });
});

describe('porterSelecteur', () => {
  it('reprend un selecteur sous la racine', () => {
    expect(porterSelecteur('button:hover', R)).toEqual(['.editeur-svg button:hover']);
    expect(porterSelecteur('.editeur-svg-toile .coin', R)).toEqual(['.editeur-svg .editeur-svg-toile .coin']);
  });

  it('remplace body et :root par la racine, et laisse html de cote', () => {
    expect(porterSelecteur('body', R)).toEqual([R]);
    expect(porterSelecteur(':root', R)).toEqual([R]);
    expect(porterSelecteur('html', R)).toEqual([]);
  });

  it('garde le :root de l hote pour choisir le theme', () => {
    expect(porterSelecteur(':root:not([data-theme="light"])', R)).toEqual([':root:not([data-theme="light"]) .editeur-svg']);
    expect(porterSelecteur(':root[data-theme="dark"]', R)).toEqual([':root[data-theme="dark"] .editeur-svg']);
  });

  it('couvre la racine elle-meme avec *', () => {
    expect(porterSelecteur('*', R)).toEqual([R, '.editeur-svg *']);
    expect(porterSelecteur('*::before', R)).toEqual(['.editeur-svg *::before']);
  });

  it('ne double pas un selecteur qui part deja de la racine', () => {
    expect(porterSelecteur('.editeur-svg button.danger', R)).toEqual(['.editeur-svg button.danger']);
    expect(porterSelecteur('.editeur-svg', R)).toEqual(['.editeur-svg']);
  });
});

describe('porterCss', () => {
  it('cantonne les regles, les listes et les at-rules imbriquees', () => {
    const css = `
      /* un commentaire { qui ne compte pas */
      * { box-sizing: border-box; }
      html, body { height: 100%; }
      button, .a > b { color: red; }
      @media (max-width: 900px) { .x { top: 0; } :root:not([data-theme="light"]) { --c: #000; } }`;
    expect(porterCss(css, R)).toBe(
      '.editeur-svg,.editeur-svg *{ box-sizing: border-box; }' +
      '.editeur-svg{ height: 100%; }' +
      '.editeur-svg button,.editeur-svg .a > b{ color: red; }' +
      '@media (max-width: 900px){.editeur-svg .x{ top: 0; }:root:not([data-theme="light"]) .editeur-svg{ --c: #000; }}'
    );
  });

  it('prefixe les animations, leur definition et leur emploi, sans toucher aux proprietes voisines', () => {
    const css = '.m { animation: apparition 0.2s ease-out; animation-duration: 1s; } @keyframes apparition { from { opacity: 0; } } .apparition { color: red; }';
    const sortie = porterCss(css, R);
    expect(sortie).toContain('@keyframes editeur-apparition{ from { opacity: 0; } }');
    expect(sortie).toContain('animation: editeur-apparition 0.2s ease-out;');
    expect(sortie).toContain('animation-duration: 1s;');
    expect(sortie).toContain('.editeur-svg .apparition{');
  });

  it('ne se laisse pas tromper par une accolade dans une chaine', () => {
    expect(porterCss('.a::before { content: "}{"; color: red; } .b { top: 0; }', R))
      .toBe('.editeur-svg .a::before{ content: "}{"; color: red; }.editeur-svg .b{ top: 0; }');
  });

  it('laisse passer une instruction sans bloc et un @font-face', () => {
    expect(porterCss('@import url(x.css); @font-face { font-family: F; } p { margin: 0; }', R))
      .toBe('@import url(x.css);@font-face{ font-family: F; }.editeur-svg p{ margin: 0; }');
  });
});

describe('remEnPixels', () => {
  it('convertit les rem a seize pixels le rem, negatifs et fractions compris', () => {
    expect(remEnPixels('a { font-size: 0.85rem; margin: -0.5rem 1rem .25rem 0; }')).toBe('a { font-size: 13.6px; margin: -8px 16px 4px 0; }');
  });

  it('laisse les autres unites et les noms qui finissent en rem', () => {
    expect(remEnPixels('a { width: 12px; padding: 2em; }.x-3rem { top: 0; }')).toBe('a { width: 12px; padding: 2em; }.x-3rem { top: 0; }');
  });
});

describe('porterCss sur les feuilles reelles de l editeur', () => {
  const dossier = resolve(__dirname, '../../../outils/editeur-svg');
  const sortie = porterCss(['jetons.css', 'base.css', 'editeur.css'].map(f => readFileSync(join(dossier, f), 'utf8')).join('\n'), R);

  /** Tous les selecteurs de la sortie, at-rules imbriquees comprises. */
  const selecteurs = [...sortie.matchAll(/(?:^|[{}])([^{}@]+)\{/g)].flatMap(m => separerSelecteurs(m[1] ?? ''));

  it('ne laisse aucun selecteur nu qui toucherait la page de l hote', () => {
    const nus = selecteurs.filter(s => !s.startsWith(R) && !s.startsWith(':root') && !/^(from|to|\d+%)$/.test(s));
    expect(nus).toEqual([]);
  });

  it('garde les jetons de couleur et le mode sombre, attaches a la racine', () => {
    expect(sortie).toMatch(/\.editeur-svg\{\s*--table:/);
    expect(sortie).toMatch(/:root\[data-theme="dark"\] \.editeur-svg\{/);
    expect(sortie).toMatch(/@media \(prefers-color-scheme: dark\)\{:root:not\(\[data-theme="light"\]\) \.editeur-svg\{/);
  });

  it('rend les accolades equilibrees et prefixe les animations', () => {
    expect([...sortie].filter(c => c === '{').length).toBe([...sortie].filter(c => c === '}').length);
    expect(sortie.includes('@keyframes editeur-apparition{')).toBe(true);
    expect(/@keyframes (?!editeur-)/.test(sortie)).toBe(false);
    // Toute animation employee est definie : un nom oublie dans la feuille partagee ne s'animerait plus.
    const definies = new Set([...sortie.matchAll(/@keyframes ([\w-]+)/g)].map(m => m[1]));
    const employees = [...sortie.matchAll(/animation: ([\w-]+) /g)].map(m => m[1]);
    expect(employees.filter(n => !definies.has(n))).toEqual([]);
  });
});
