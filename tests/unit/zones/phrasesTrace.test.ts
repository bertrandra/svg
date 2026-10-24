import { describe, expect, it } from 'vitest';
import {
  nomDeType, phraseArrondi, phraseCasse, phraseContourEnForme, phraseConversion, phraseDecalage, phraseInversion, phraseJonction, phraseSuppressionFidele
} from '../../../src/zones/phrasesTrace.js';

describe('les phrases des outils de trace', () => {
  it('dit le contour transformé, au singulier et au pluriel, et ce qui a été laissé', () => {
    expect(phraseContourEnForme(1, 0)).toBe('Contour transformé en forme.');
    expect(phraseContourEnForme(3, 0)).toBe('3 contours transformés en formes.');
    expect(phraseContourEnForme(1, 1)).toBe('Contour transformé en forme. 1 forme sans contour utile laissée telle quelle.');
    expect(phraseContourEnForme(2, 2)).toBe('2 contours transformés en formes. 2 formes sans contour utile laissées telles quelles.');
  });

  it('dit le sens et la distance du décalage, et les formes qui ont disparu', () => {
    expect(phraseDecalage(1, 5, 0)).toBe('Contour décalé de 5 vers l’extérieur.');
    expect(phraseDecalage(2, -2.5, 0)).toBe('2 contours décalés de 2,5 vers l’intérieur.');
    expect(phraseDecalage(1, -30, 1)).toBe('Contour décalé de 30 vers l’intérieur. 1 forme n’avait plus de place et a disparu : Ctrl+Z la rend.');
    expect(phraseDecalage(0, -30, 2)).toBe('2 formes n’avaient plus de place et ont disparu : Ctrl+Z les rend.');
    expect(phraseDecalage(3, -4, 0, 1)).toBe('3 contours décalés de 4 vers l’intérieur. 1 forme laissée telle quelle : un tracé ouvert n’a pas d’intérieur.');
  });

  it('dit les angles arrondis, ceux dont le rayon a baissé, et l’absence d’angle', () => {
    expect(phraseArrondi(4, 0, 10, 10)).toBe('4 angles arrondis au rayon 10.');
    expect(phraseArrondi(1, 0, 2.5, 2.5)).toBe('1 angle arrondi au rayon 2,5.');
    expect(phraseArrondi(4, 2, 30, 20)).toBe('4 angles arrondis ; 2 angles ramenés à un rayon plus petit, 20 au minimum, faute de place sur les côtés.');
    expect(phraseArrondi(2, 1, 30, 12)).toBe('2 angles arrondis ; 1 angle ramené à un rayon plus petit, 12 au minimum, faute de place sur les côtés.');
    expect(phraseArrondi(0, 0, 5, 0)).toMatch(/^Aucun angle à arrondir/);
  });

  it('dit le type d’un point converti, ou déjà là', () => {
    expect(phraseConversion('lisse', true)).toBe('Point converti en lisse : poignées alignées.');
    expect(phraseConversion('symetrique', true)).toBe('Point converti en symétrique : poignées alignées et de même longueur.');
    expect(phraseConversion('angle', true)).toBe('Point converti en angle : poignées rentrées, à tirer une à une.');
    expect(phraseConversion('symetrique', false)).toBe('Ce point est déjà symétrique.');
    expect(nomDeType('symetrique')).toBe('symétrique');
  });

  it('dit casser, joindre, fermer et inverser', () => {
    expect(phraseCasse(2)).toBe('Tracé cassé en deux au point choisi.');
    expect(phraseCasse(1)).toBe('Tracé ouvert au point choisi : ses deux bouts s’y superposent.');
    expect(phraseJonction('joint')).toBe('Deux tracés joints en un seul.');
    expect(phraseJonction('ferme')).toBe('Tracé fermé.');
    expect(phraseJonction('ferme', 3)).toBe('3 tracés fermés.');
    expect(phraseInversion(1)).toBe('Sens du tracé inversé.');
    expect(phraseInversion(4)).toBe('4 formes : sens du tracé inversé.');
    expect(phraseSuppressionFidele).toBe('Point retiré, courbe conservée.');
  });
});
