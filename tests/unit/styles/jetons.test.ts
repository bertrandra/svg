import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AA, JETONS, PAIRES, ROLES, contrasteDe, cssJetons, lire, tableauJetons, valeur } from '../../../src/styles/jetons.js';

// Le registre est la seule source des couleurs de l'interface : ces tests le confrontent au CSS de la
// page et au code, et tiennent les contrastes. Ajouter un jeton, c'est l'ajouter dans src/styles/jetons.ts,
// puis le lire par var(--nom) ; ACTUALISER_REFERENCES=1 regenere docs/jetons.md.

const racine = join(__dirname, '../../..');
const page = readFileSync(join(racine, 'outils/editeur-svg/page.html'), 'utf8');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(nom => {
    const chemin = join(dir, nom);
    if (statSync(chemin).isDirectory()) return sources(chemin);
    return /\.(ts|tsx)$/.test(nom) ? [chemin] : [];
  });
}
const code = sources(join(racine, 'src')).filter(f => !f.endsWith('styles/jetons.ts')).map(f => readFileSync(f, 'utf8')).join('\n');

/** Les variables lues ou ecrites dans un texte : `var(--x)` et `--x:`. */
const lues = (texte: string) => new Set([...texte.matchAll(/var\(--([a-z][a-z0-9-]*)/g)].map(m => m[1] ?? ''));

const HEX = /^#[0-9a-f]{6}$/;
const RGBA = /^rgba\(\d{1,3}, \d{1,3}, \d{1,3}, (0|1|0?\.\d+)\)$/;
const NON_COULEURS = new Set(['sans', 'mono']);

describe('le registre', () => {
  it('a des identifiants uniques, en minuscules et tirets, et des valeurs que le CSS lit', () => {
    const ids = JETONS.map(j => j.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const j of JETONS) {
      expect(j.id, j.id).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
      expect(HEX.test(j.clair) || RGBA.test(j.clair), j.id + ' clair : ' + j.clair).toBe(true);
      expect(HEX.test(j.sombre) || RGBA.test(j.sombre), j.id + ' sombre : ' + j.sombre).toBe(true);
      expect(j.description.length, j.id + ' sans description').toBeGreaterThan(8);
    }
  });

  it('range chaque jeton sous un role connu, et chaque role a au moins un jeton', () => {
    const roles = new Set(ROLES.map(r => r[0]));
    expect(JETONS.every(j => roles.has(j.role))).toBe(true);
    for (const [role] of ROLES) expect(JETONS.some(j => j.role === role), role).toBe(true);
  });

  it('nomme une erreur sur un jeton inconnu, et lit les deux themes', () => {
    expect(() => lire('cyan-fonce')).toThrow('cyan-fonce');
    expect(valeur('cyan', 'clair')).toBe('#00719c');
    expect(valeur('cyan', 'sombre')).toBe('#4fb3dc');
  });
});

describe('les contrastes', () => {
  it('tiennent le minimum exige pour chaque paire, en clair comme en sombre', () => {
    for (const p of PAIRES) {
      expect(contrasteDe(p, 'clair'), p.texte + ' sur ' + p.fond + ' (clair)').toBeGreaterThanOrEqual(p.minimum);
      expect(contrasteDe(p, 'sombre'), p.texte + ' sur ' + p.fond + ' (sombre)').toBeGreaterThanOrEqual(p.minimum);
    }
  });

  it('ne reference que des jetons du registre, en hexadecimal opaque', () => {
    for (const p of PAIRES) for (const id of [p.texte, p.fond]) expect(HEX.test(lire(id).clair) && HEX.test(lire(id).sombre), id).toBe(true);
    expect(PAIRES.every(p => p.minimum >= AA)).toBe(true);
  });
});

describe('le CSS genere', () => {
  const css = cssJetons();

  it('declare chaque jeton dans :root, avec ses deux polices', () => {
    const racineCss = /:root \{([^}]*)\}/.exec(css)?.[1] ?? '';
    for (const j of JETONS) expect(racineCss, j.id).toContain('--' + j.id + ': ' + j.clair + ';');
    expect(racineCss).toContain('--sans:');
    expect(racineCss).toContain('--mono:');
  });

  it('ne met dans les blocs sombres que ce qui change, sous les deux declencheurs', () => {
    const sombres = css.split('@media (prefers-color-scheme: dark)')[1] ?? '';
    for (const j of JETONS) {
      const attendu = '--' + j.id + ': ' + j.sombre + ';';
      if (j.clair === j.sombre) expect(sombres, j.id).not.toContain('--' + j.id + ':');
      else expect(sombres, j.id).toContain(attendu);
    }
    expect(css).toContain(':root:not([data-theme="light"])');
    expect(css).toContain(':root[data-theme="dark"]');
    expect(css.match(/color-scheme: dark;/g)?.length).toBe(2);
  });

  it('se genere toujours pareil', () => {
    expect(cssJetons()).toBe(css);
  });
});

describe('la page et le code', () => {
  it('ne definissent aucune couleur a la main : tout passe par un jeton', () => {
    expect(page).toContain('/*JETONS*/');
    expect(page.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], 'couleur hexadecimale en dur dans page.html').toEqual([]);
    expect(page.match(/rgba?\(/g) ?? [], 'rgb() en dur dans page.html').toEqual([]);
    expect(page.match(/^\s*--[a-z-]+:/gm) ?? [], 'variable declaree dans page.html : elle va dans le registre').toEqual([]);
  });

  it('ne lisent que des jetons qui existent', () => {
    const connus = new Set(JETONS.map(j => j.id));
    const inconnus = [...lues(page), ...lues(code)].filter(id => !connus.has(id) && !NON_COULEURS.has(id));
    expect(inconnus).toEqual([]);
  });

  it('n\'ont aucun jeton orphelin : chacun est lu quelque part', () => {
    const utilises = new Set([...lues(page), ...lues(code)]);
    expect(JETONS.map(j => j.id).filter(id => !utilises.has(id))).toEqual([]);
  });
});

describe('docs/jetons.md', () => {
  const fichier = join(racine, 'docs/jetons.md');
  const entete = '# Les jetons de couleur\n\nGénéré depuis `src/styles/jetons.ts` (ADR-0007) : ne pas modifier à la main. `ACTUALISER_REFERENCES=1 npx vitest run tests/unit/styles` le régénère.\n\n';

  it('est a jour avec le registre', () => {
    const attendu = entete + tableauJetons();
    if (process.env.ACTUALISER_REFERENCES === '1') writeFileSync(fichier, attendu);
    expect(readFileSync(fichier, 'utf8'), 'docs/jetons.md est périmé : ACTUALISER_REFERENCES=1').toBe(attendu);
  });
});
