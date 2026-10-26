import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nomDeCouleur, phraseOpacite } from '../../../src/model/nomsCouleurs.js';
import { definirDictionnaire, definirLangue } from '../../../src/util/i18n.js';

describe('le nom approche d’une couleur', () => {
  it('dit les neutres par leur clarte', () => {
    expect(nomDeCouleur('#000000')).toBe('Noir');
    expect(nomDeCouleur('#15181d')).toBe('Noir');
    expect(nomDeCouleur('#ffffff')).toBe('Blanc');
    expect(nomDeCouleur('#333333')).toBe('Gris foncé');
    expect(nomDeCouleur('#808080')).toBe('Gris');
    expect(nomDeCouleur('#e9ecef')).toBe('Gris clair');
  });

  it('dit la famille d’une teinte, nuancee par sa clarte', () => {
    const noms = Object.fromEntries(['#ff0000', '#c81e28', '#8b0000', '#ffc0cb', '#ffa500', '#8b4513', '#ffff00', '#808000', '#00ff00', '#2e8b57', '#006400', '#40e0d0', '#0000ff', '#1428a0', '#87ceeb', '#800080', '#ff00ff', '#f4e9d8', '#f5f5dc'].map(h => [h, nomDeCouleur(h)]));
    expect(noms).toEqual({
      '#ff0000': 'Rouge', '#c81e28': 'Rouge', '#8b0000': 'Rouge foncé', '#ffc0cb': 'Rose', '#ffa500': 'Orange', '#8b4513': 'Brun',
      '#ffff00': 'Jaune', '#808000': 'Olive', '#00ff00': 'Vert clair', '#2e8b57': 'Vert', '#006400': 'Vert foncé', '#40e0d0': 'Turquoise clair',
      '#0000ff': 'Bleu', '#1428a0': 'Bleu foncé', '#87ceeb': 'Bleu clair', '#800080': 'Violet foncé', '#ff00ff': 'Magenta', '#f4e9d8': 'Beige', '#f5f5dc': 'Beige'
    });
  });

  it('rend le texte tel quel pour ce qui n’est pas un code, et sait le #rgb', () => {
    expect(nomDeCouleur('rebeccapurple')).toBe('rebeccapurple');
    expect(nomDeCouleur('#f00')).toBe('Rouge');
  });

  it('dit une opacite en pourcentage, rien pour une couleur pleine', () => {
    expect(phraseOpacite(undefined)).toBe('');
    expect(phraseOpacite(1)).toBe('');
    expect(phraseOpacite(0.5)).toBe('opacité 50 %');
  });

  it('se dit en anglais par le dictionnaire, la nuance avant le nom (ADR-0042)', () => {
    definirDictionnaire('en', JSON.parse(readFileSync(resolve(__dirname, '../../../src/i18n/en/model.json'), 'utf8')) as Record<string, string>);
    definirLangue('en');
    try {
      expect(nomDeCouleur('#1428a0')).toBe('Dark blue');
      expect(nomDeCouleur('#87ceeb')).toBe('Light blue');
      expect(nomDeCouleur('#8b4513')).toBe('Brown');
      expect(nomDeCouleur('#333333')).toBe('Dark gray');
      expect(phraseOpacite(0.5)).toBe('opacity 50%');
    } finally {
      definirLangue('fr');
    }
  });
});
