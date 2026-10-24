import { describe, it, expect } from 'vitest';
import { lireDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { au } from '../../../src/util/tableaux.js';
import { phraseOutil, phrasePoint, phrasePosition, phraseReticule, phraseRotation, phraseSelection, phraseTaille, phraseZoom } from '../../../src/zones/annonces.js';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160">'
  + '<rect x="40" y="60" width="120" height="80" fill="#c81e28"/>'
  + '<circle cx="80" cy="80" r="40" fill="#1428a0"/>'
  + '<path d="M130 120 Q170 40 210 120 L170 130" fill="none" stroke="#15181d"/></svg>';
const d: DessinSvg = (() => { const r = lireDessin(SVG); if ('erreur' in r) throw new Error(r.erreur); return r.dessin; })();

describe('phraseSelection', () => {
  it('decrit une forme : son rang, son genre, sa couleur, ses mesures', () => {
    expect(phraseSelection(d, ['f1'])).toBe('Forme 1 sélectionnée : rectangle, fond rouge #c81e28, 120 × 80 à 40, 60.');
    expect(phraseSelection(d, ['f2'])).toBe('Forme 2 sélectionnée : cercle, fond bleu #1428a0, 80 × 80 à 40, 40.');
  });

  it('dit qu une forme vient d etre ajoutee', () => {
    expect(phraseSelection(d, ['f1'], true)).toMatch(/^Forme 1 ajoutée et sélectionnée : rectangle/);
  });

  it('compte une selection multiple et dit la selection vide', () => {
    expect(phraseSelection(d, ['f1', 'f2', 'f3'])).toBe('3 formes sélectionnées.');
    expect(phraseSelection(d, [])).toBe('Sélection vidée.');
  });
});

describe('les autres phrases', () => {
  it('dit l outil et ce que le clavier y fait', () => {
    expect(phraseOutil('plume')).toMatch(/Entrée pose un point/);
    expect(phraseOutil('rectangle')).toMatch(/réticule/);
    expect(phraseOutil('points')).toMatch(/Tab/);
    expect(phraseOutil('selection')).toMatch(/Alt/);
  });

  it('dit le point actif : son rang, sa nature, sa place', () => {
    const f = au(d.formes, 2);
    expect(phrasePoint(f, 0)).toBe('Point 1 sur 3 : départ, à 130, 120.');
    expect(phrasePoint(f, 1)).toBe('Point 2 sur 3 : courbe, à 210, 120.');
    expect(phrasePoint(f, 2)).toBe('Point 3 sur 3 : angle, à 170, 130.');
    expect(phrasePoint(f, 9)).toBe('Aucun point actif.');
  });

  it('dit la place, la taille, la rotation, le reticule et le zoom', () => {
    expect(phrasePosition(d, ['f1'])).toBe('À 40, 60.');
    expect(phraseTaille(d, ['f1'])).toBe('120 × 80.');
    expect(phrasePosition(d, ['inconnue'])).toBe('');
    expect(phraseRotation(15)).toBe('Tournée de 15° vers la droite.');
    expect(phraseRotation(-1)).toBe('Tournée de 1° vers la gauche.');
    expect(phraseReticule([12.5, 80])).toBe('Réticule à 12,5, 80.');
    expect(phraseZoom(1.254)).toBe('Zoom 125 %.');
  });
});
