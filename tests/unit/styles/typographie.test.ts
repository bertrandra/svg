import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cssJetons } from '../../../src/styles/jetons.js';
import { TAILLES } from '../../../src/styles/typographie.js';

// Comme les couleurs (ADR-0007), une taille de texte est un jeton : la feuille lit une variable, jamais une valeur.
const racine = join(import.meta.dirname, '..', '..', '..');
const FEUILLES = ['outils/editeur-svg/base.css', 'outils/editeur-svg/editeur.css', 'outils/editeur-svg/page.html'];
const lire = (f: string) => readFileSync(join(racine, f), 'utf8');

describe('la typographie de l interface', () => {
  it('declare cinq tailles en rem, croissantes, et les deux familles', () => {
    const valeurs = TAILLES.map(t => Number.parseFloat(t.valeur));
    expect(TAILLES.every(t => /^\d*\.?\d+rem$/.test(t.valeur))).toBe(true);
    expect([...valeurs].sort((a, b) => a - b)).toEqual(valeurs);
    for (const t of TAILLES) expect(cssJetons()).toContain('--' + t.id + ': ' + t.valeur + ';');
    expect(cssJetons()).toMatch(/--sans: "Instrument Sans"/);
    expect(cssJetons()).toMatch(/--mono: "IBM Plex Mono"/);
  });

  it('aucune feuille n ecrit une taille de texte : elle lit un jeton declare', () => {
    const ids = new Set(TAILLES.map(t => t.id));
    for (const f of FEUILLES) {
      const tailles = [...lire(f).matchAll(/font-size:\s*([^;}"]+)/g)].map(m => (m[1] ?? '').trim());
      const libres = tailles.filter(v => !/^var\(--texte-[a-z-]+\)$/.test(v) && v !== 'inherit');
      expect(libres, f).toEqual([]);
      const inconnus = tailles.map(v => /^var\(--(texte-[a-z-]+)\)$/.exec(v)?.[1]).filter((id): id is string => id !== undefined && !ids.has(id));
      expect(inconnus, f).toEqual([]);
    }
  });

  it('chaque taille du registre sert', () => {
    const tout = FEUILLES.map(lire).join('\n');
    for (const t of TAILLES) expect(tout, t.id).toContain('var(--' + t.id + ')');
  });

  it('aucun composant n ecrit une taille de texte en ligne', () => {
    // Les styles en ligne des zones ne portent que des donnees du dessin (une couleur, une hauteur de fenetrage).
    const sortie = execSync('grep -rlE "fontSize|font-size" src/zones src/ui 2>/dev/null || true', { cwd: racine, encoding: 'utf8' }).trim();
    expect(sortie.split('\n').filter(Boolean).filter(f => !f.endsWith('embarque.tsx'))).toEqual([]);
  });
});
