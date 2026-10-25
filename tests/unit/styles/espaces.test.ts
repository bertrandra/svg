import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cssJetons } from '../../../src/styles/jetons.js';
import { COUCHES, ESPACES, RAYONS } from '../../../src/styles/espaces.js';

// Comme les couleurs et les tailles de texte, un espacement, un rayon et une couche sont des jetons.
const racine = join(import.meta.dirname, '..', '..', '..');
const FEUILLES = ['outils/editeur-svg/base.css', 'outils/editeur-svg/editeur.css', 'outils/editeur-svg/page.html'];
const lire = (f: string) => readFileSync(join(racine, f), 'utf8');
const PROPRIETES = /(?<![\w-])(?:padding|margin)(?:-[a-z-]+)?\s*:\s*([^;}]+)|(?<![\w-])(?:row-|column-)?gap\s*:\s*([^;}]+)/g;

describe('les mesures de mise en page', () => {
  it('declare chaque mesure dans le :root genere, l espacement croissant', () => {
    for (const m of [...ESPACES, ...RAYONS, ...COUCHES]) expect(cssJetons()).toContain('--' + m.id + ': ' + m.valeur + ';');
    const pas = ESPACES.map(e => Number.parseFloat(e.valeur));
    expect([...pas].sort((a, b) => a - b)).toEqual(pas);
  });

  it('aucun espacement ecrit en dur : seulement 0, un filet de 1 px, auto ou un jeton', () => {
    for (const f of FEUILLES) {
      const libres = [...lire(f).matchAll(PROPRIETES)].map(m => (m[1] ?? m[2] ?? '').trim())
        .filter(v => /\d+(?:\.\d+)?(?:px|rem|em)\b/.test(v.replace(/var\(--[a-z0-9-]+\)/g, '').replace(/(?<![\d.])1px\b/g, '')));
      expect(libres, f).toEqual([]);
    }
  });

  it('aucun rayon ni couche ecrits en dur', () => {
    for (const f of FEUILLES) {
      const texte = lire(f);
      const rayons = [...texte.matchAll(/border-radius\s*:\s*([^;}]+)/g)].map(m => (m[1] ?? '').trim()).filter(v => /[1-9]\d*px/.test(v));
      const couches = [...texte.matchAll(/z-index\s*:\s*([^;}]+)/g)].map(m => (m[1] ?? '').trim()).filter(v => /^\d/.test(v) && v !== '0' && v !== '1');
      expect(rayons, f).toEqual([]);
      expect(couches, f).toEqual([]);
    }
  });

  it('chaque mesure du registre sert, et toute mesure lue existe', () => {
    const tout = FEUILLES.map(lire).join('\n');
    const ids = new Set([...ESPACES, ...RAYONS, ...COUCHES].map(m => m.id));
    for (const id of ids) expect(tout, id).toContain('var(--' + id + ')');
    const lues = [...tout.matchAll(/var\(--((?:esp|rayon|couche)-[a-z0-9-]+)\)/g)].map(m => m[1] ?? '');
    expect(lues.filter(id => !ids.has(id))).toEqual([]);
  });
});
