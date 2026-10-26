import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { JETONS } from '../../../src/styles/jetons.js';
import { nomNavigateur } from '../../e2e/aide.js';

// La promesse de docs/navigateurs.md est un texte : ce fichier la confronte au code. Une fonctionnalite qui entre dans
// src/ ou dans les feuilles sans figurer au tableau, une version au-dessus du plancher sans repli, un saut de test
// sans sa raison ecrite, une extension WebAssembly nouvelle : chacun echoue ici, en disant quoi ecrire.

const racine = join(__dirname, '../../..');
const lire = (...chemin: string[]) => readFileSync(join(racine, ...chemin), 'utf8');

function fichiers(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap(nom => {
    const chemin = join(dir, nom);
    if (statSync(chemin).isDirectory()) return fichiers(chemin, ext);
    return ext.test(nom) ? [chemin] : [];
  });
}

const DOC = lire('docs/navigateurs.md');
const SOURCES_TS = fichiers(join(racine, 'src'), /\.tsx?$/).filter(f => !/model[\\/](lexique|bibliotheque)\.ts$/.test(f)).map(f => readFileSync(f, 'utf8')).join('\n');
const FEUILLES = ['base.css', 'editeur.css', 'page.html'].map(f => lire('outils/editeur-svg', f)).join('\n');

/** Les lignes du tableau des fonctionnalites : nom, versions (null = jamais), repli. */
interface Ligne { nom: string; chrome: number | null; firefox: number | null; safari: number | null; repli: string }
function tableau(): Ligne[] {
  const debut = DOC.indexOf('| Fonctionnalité |');
  const lignes = DOC.slice(debut).split('\n').slice(2);
  lignes.splice(lignes.findIndex(l => !l.startsWith('| ')));
  const version = (c: string): number | null => { const m = /^([\d.]+)/.exec(c.trim()); return m?.[1] ? Number(m[1]) : null; };
  return lignes.map(l => {
    const [nom = '', chrome = '', firefox = '', safari = '', ...repli] = l.slice(2, -2).split(' | ');
    return { nom: nom.trim().replace(/^`|`$/g, ''), chrome: version(chrome), firefox: version(firefox), safari: version(safari), repli: repli.join(' | ').trim() };
  });
}

const PLANCHER = (() => {
  const m = /<!-- plancher: chrome=([\d.]+) firefox=([\d.]+) safari=([\d.]+) -->/.exec(DOC);
  if (!m) throw new Error('docs/navigateurs.md a perdu sa ligne « plancher »');
  return { chrome: Number(m[1]), firefox: Number(m[2]), safari: Number(m[3]) };
})();

describe('docs/navigateurs.md : le tableau', () => {
  const lignes = tableau();

  it('se lit : des lignes, des noms uniques, un repli ecrit partout', () => {
    expect(lignes.length).toBeGreaterThan(30);
    expect(new Set(lignes.map(l => l.nom)).size).toBe(lignes.length);
    for (const l of lignes) expect(l.repli.length, l.nom + ' sans repli ni dégradation').toBeGreaterThan(10);
  });

  it('exige un repli reel de toute fonctionnalite au-dessus du plancher de la promesse', () => {
    for (const l of lignes) {
      const au_dessus = (l.chrome === null || l.chrome > PLANCHER.chrome) || (l.firefox === null || l.firefox > PLANCHER.firefox) || (l.safari === null || l.safari > PLANCHER.safari);
      if (au_dessus) expect(l.repli, l.nom + ' dépasse le plancher : il lui faut un repli, pas « Aucun »').not.toMatch(/^Aucun/);
    }
  });
});

/** Ce que le code emploie : un nom du tableau et la regle qui le detecte, dans le TypeScript ou dans les feuilles. */
const SONDES: ReadonlyArray<{ nom: string; motif: RegExp; dans: 'ts' | 'css' }> = [
  { nom: 'color-mix()', motif: /color-mix\(/, dans: 'css' },
  { nom: ':focus-visible', motif: /:focus-visible/, dans: 'css' },
  { nom: ':where()', motif: /:where\(/, dans: 'css' },
  { nom: 'content-visibility', motif: /content-visibility/, dans: 'css' },
  { nom: 'contain-intrinsic-size', motif: /contain-intrinsic-size/, dans: 'css' },
  { nom: 'scrollbar-width', motif: /scrollbar-width/, dans: 'css' },
  { nom: 'accent-color', motif: /accent-color/, dans: 'css' },
  { nom: 'scrollbar-color', motif: /scrollbar-color/, dans: 'css' },
  { nom: ':is()', motif: /:is\(/, dans: 'css' },
  { nom: 'text-underline-offset', motif: /text-underline-offset/, dans: 'css' },
  { nom: 'font-variant-numeric', motif: /font-variant-numeric/, dans: 'css' },
  { nom: 'hover: none', motif: /hover: none/, dans: 'css' },
  { nom: 'dvh', motif: /\d+dvh/, dans: 'css' },
  { nom: 'inset', motif: /[\s{;]inset:/, dans: 'css' },
  { nom: 'overflow-wrap', motif: /overflow-wrap/, dans: 'css' },
  { nom: 'touch-action', motif: /touch-action/, dans: 'css' },
  { nom: 'user-select', motif: /user-select/, dans: 'css' },
  { nom: 'forced-colors', motif: /forced-colors/, dans: 'css' },
  { nom: 'pointer: coarse', motif: /pointer: coarse/, dans: 'css' },
  { nom: 'prefers-reduced-motion', motif: /prefers-reduced-motion/, dans: 'css' },
  { nom: 'prefers-color-scheme', motif: /prefers-color-scheme/, dans: 'ts' },
  { nom: 'all: revert', motif: /all:revert/, dans: 'ts' },
  { nom: 'clip-path', motif: /clipPath|clip-path/, dans: 'ts' },
  { nom: '<filter>', motif: /feGaussianBlur/, dans: 'ts' },
  { nom: 'mask-type', motif: /mask-type/, dans: 'ts' },
  { nom: 'vector-effect', motif: /vector-effect/, dans: 'css' },
  { nom: '<details>', motif: /<details/, dans: 'ts' },
  { nom: 'type="color"', motif: /type="color"/, dans: 'ts' },
  { nom: 'Object.hasOwn', motif: /Object\.hasOwn/, dans: 'ts' },
  { nom: '\\p{…}', motif: /\\p\{/, dans: 'ts' },
  { nom: 'ResizeObserver', motif: /ResizeObserver/, dans: 'ts' },
  { nom: 'matchMedia', motif: /matchMedia/, dans: 'ts' },
  { nom: 'PointerEvent', motif: /PointerEvent/, dans: 'ts' },
  { nom: 'setPointerCapture', motif: /setPointerCapture/, dans: 'ts' },
  { nom: 'wheel', motif: /'wheel'/, dans: 'ts' },
  { nom: 'WebAssembly', motif: /WebAssembly/, dans: 'ts' },
  { nom: 'inert', motif: /\.inert\b/, dans: 'ts' },
  { nom: 'focusVisible', motif: /focusVisible/, dans: 'ts' },
  { nom: 'navigator.clipboard', motif: /navigator\.clipboard/, dans: 'ts' },
  { nom: 'URL.createObjectURL', motif: /URL\.createObjectURL/, dans: 'ts' },
  { nom: 'localStorage', motif: /localStorage/, dans: 'ts' },
  { nom: 'TextEncoder', motif: /TextEncoder/, dans: 'ts' },
  { nom: 'DecompressionStream', motif: /DecompressionStream/, dans: 'ts' },
  { nom: 'fetch', motif: /\bfetch\(/, dans: 'ts' },
  { nom: 'crypto.subtle', motif: /crypto\.subtle/, dans: 'ts' },
  { nom: 'caches', motif: /\bcaches\.open\(/, dans: 'ts' },
  { nom: 'queryLocalFonts', motif: /queryLocalFonts/, dans: 'ts' },
  { nom: 'Blob.arrayBuffer', motif: /\.arrayBuffer\(\)/, dans: 'ts' },
  { nom: 'canvas', motif: /createElement\('canvas'\)/, dans: 'ts' },
  { nom: 'requestAnimationFrame', motif: /requestAnimationFrame/, dans: 'ts' },
  { nom: 'toLocaleDateString', motif: /toLocaleDateString/, dans: 'ts' },
  { nom: 'localeCompare', motif: /localeCompare/, dans: 'ts' },
  { nom: 'Math.sin', motif: /Math\.(sin|cos|tan|atan2|hypot|cbrt|exp|log10)\(/, dans: 'ts' }
];

describe('ce que le code emploie figure au tableau', () => {
  const noms = new Set(tableau().map(l => l.nom));

  it('connait chaque fonctionnalite detectee dans src/ et dans les feuilles', () => {
    const inconnues = SONDES.filter(s => s.motif.test(s.dans === 'ts' ? SOURCES_TS : FEUILLES)).filter(s => !noms.has(s.nom)).map(s => s.nom);
    expect(inconnues, 'à ajouter au tableau de docs/navigateurs.md (versions minimales et repli)').toEqual([]);
  });

  it('n\'a pas de ligne pour ce que le code n\'emploie plus (hors les « evite » ecrits)', () => {
    const evites = new Set([':has()', 'lookbehind `(?<!`']);
    const orphelines = [...noms].filter(n => !evites.has(n) && !n.startsWith('lookbehind') && !SONDES.some(s => s.nom === n));
    expect(orphelines, 'ligne du tableau sans sonde : l’ajouter à SONDES de ce test').toEqual([]);
  });

  it('interdit ce que le plancher ne permet pas', () => {
    const interdits: Array<[string, RegExp, 'ts' | 'css']> = [
      [':has()', /:has\(/, 'css'],
      ['lookbehind', /\(\?<[=!]/, 'ts'],
      ['structuredClone', /\bstructuredClone\b/, 'ts'],
      ['at()', /\.at\(/, 'ts'],
      ['findLast', /\bfindLast(Index)?\(/, 'ts'],
      ['toSorted', /\.(toSorted|toReversed|toSpliced)\(/, 'ts'],
      ['replaceAll', /\.replaceAll\(/, 'ts'],
      ['Promise.withResolvers', /Promise\.(withResolvers|try)\b|Array\.fromAsync/, 'ts'],
      ['randomUUID', /randomUUID/, 'ts'],
      ['@layer / @container', /@(layer|container)\b/, 'css'],
      ['imbrication CSS', /\{[^{}]*\n\s+&\s/, 'css']
    ];
    const trouves = interdits.filter(([, motif, dans]) => motif.test(dans === 'ts' ? SOURCES_TS.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '') : FEUILLES.replace(/\/\*[\s\S]*?\*\//g, ''))).map(([nom]) => nom);
    expect(trouves, 'au-dessus du plancher de docs/navigateurs.md : écrire un repli, ou ajouter la ligne au tableau et retirer l’interdit').toEqual([]);
  });
});

describe('les replis de color-mix()', () => {
  const connus = new Set(JETONS.filter(j => j.role === 'repli').map(j => j.id));
  const lignes = FEUILLES.split('\n');

  it('suivent chaque regle qui emploie color-mix(), avec le meme selecteur et un jeton de repli qui existe', () => {
    const avecMix = lignes.map((l, i) => [l, i] as const).filter(([l]) => l.includes('color-mix(') && l.includes('{') && !l.trimStart().startsWith('@supports') && !l.includes('color-mix(in srgb, currentcolor'));
    expect(avecMix.length).toBeGreaterThanOrEqual(16);
    for (const [ligne, i] of avecMix) {
      const selecteur = ligne.split('{')[0]?.trim() ?? '';
      const suivante = lignes[i + 1] ?? '';
      expect(suivante, 'pas de repli sous : ' + selecteur).toMatch(/^@supports not \(color: color-mix\(in srgb, currentcolor, currentcolor\)\) \{ /);
      expect(suivante.includes('{ ' + selecteur + ' {'), 'le repli ne vise pas le même sélecteur : ' + selecteur).toBe(true);
      const jetons = [...suivante.matchAll(/var\(--(repli-[a-z0-9-]+)\)/g)].map(m => m[1] ?? '');
      expect(jetons.length, selecteur).toBeGreaterThan(0);
      for (const j of jetons) expect(connus.has(j), j + ' absent du registre').toBe(true);
    }
  });

  it('n\'ont pas un jeton de repli de trop', () => {
    const lus = new Set([...FEUILLES.matchAll(/var\(--(repli-[a-z0-9-]+)\)/g)].map(m => m[1] ?? ''));
    expect([...connus].filter(j => !lus.has(j))).toEqual([]);
  });
});

describe('les sauts de test', () => {
  it('ont chacun leur raison ecrite dans docs/navigateurs.md, mot pour mot', () => {
    const specs = fichiers(join(racine, 'tests/e2e'), /\.e2e\.ts$/).map(f => readFileSync(f, 'utf8')).join('\n');
    // Aucun saut aujourd'hui (le dernier, celui du contraste force, est leve : l'emulation agit dans les trois moteurs) ; le
    // jour ou un saut revient, sa raison doit etre ecrite.
    const raisons = [...specs.matchAll(/sauteSauf\(\[[^\]]*\],\s*'([^']+)'\)/g)].map(m => m[1] ?? '');
    for (const r of raisons) expect(DOC, 'raison absente de docs/navigateurs.md : ' + r).toContain(r);
    expect(specs.match(/\.skipIf\(/g)?.length ?? 0, 'un skipIf qui ne passe pas par sauteSauf(moteurs, raison)').toBe(raisons.length);
  });
});

describe('NAVIGATEUR', () => {
  it('vaut chromium par defaut et accepte les trois moteurs', () => {
    expect(nomNavigateur(undefined)).toBe('chromium');
    expect(nomNavigateur('')).toBe('chromium');
    expect(nomNavigateur(' WebKit ')).toBe('webkit');
    expect(nomNavigateur('firefox')).toBe('firefox');
  });

  it('refuse un nom inconnu au lieu de retomber sur Chromium', () => {
    expect(() => nomNavigateur('safari')).toThrow(/chromium, firefox ou webkit/);
  });
});

describe('le traceur WebAssembly', () => {
  it('ne demande que des extensions connues du plancher (Chrome 96, Firefox 79, Safari 15)', () => {
    const o = readFileSync(join(racine, 'node_modules/@visioncortex/vtracer/pkg/vtracer_wasm_bg.wasm'));
    let i = 8;
    const leb = (): number => { let r = 0, s = 0; for (;;) { const x = o[i++] ?? 0; r |= (x & 0x7f) << s; s += 7; if (x < 0x80) return r; } };
    let caracteristiques = '';
    while (i < o.length) {
      const id = o[i++];
      const fin = leb() + i;
      if (id === 0) {
        const n = leb();
        if (o.subarray(i, i + n).toString() === 'target_features') caracteristiques = o.subarray(i + n, fin).toString('latin1');
      }
      i = fin;
    }
    expect(caracteristiques.length, 'section target_features absente : relire les extensions à la main').toBeGreaterThan(0);
    const demandees = [...caracteristiques.matchAll(/\+[\s\S]([a-z-]+)/g)].map(m => m[1] ?? '').sort();
    expect(demandees).toEqual(['bulk-memory', 'multivalue', 'mutable-globals', 'nontrapping-fptoint', 'reference-types', 'sign-ext']);
  });
});
