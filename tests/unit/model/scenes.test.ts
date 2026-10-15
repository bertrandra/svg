import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SCENES } from '../../../src/model/scenes.js';
import { EVENEMENTS } from '../../../src/model/bibliotheque.js';

const jeu = JSON.parse(readFileSync(resolve(__dirname, '../../../node_modules/@iconify-json/game-icons/icons.json'), 'utf8')) as { icons: Record<string, unknown> };

describe('scenes', () => {
  it('ne cite que des formes du jeu et des evenements connus, dans le plan', () => {
    for (const s of SCENES) {
      expect(EVENEMENTS.some(e => e.id === s.evenement), s.id).toBe(true);
      for (const e of s.elements) {
        expect(jeu.icons[e.id], s.id + ' : ' + e.id).toBeDefined();
        expect(e.x >= 0 && e.y >= 0 && e.x + e.taille <= 1.001 && e.y + e.taille <= 1.001, s.id + ' : ' + e.id).toBe(true);
      }
    }
    expect(new Set(SCENES.map(s => s.id)).size).toBe(SCENES.length);
  });
});
