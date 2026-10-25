// Des fontes factices pour les tests du texte vivant : aucune vraie fonte, des octets qui ne dependent d'aucun fichier tiers.

import type { Glyphes } from '../../../src/engine/editionSvg.js';

/** Un rectangle de 500 x 700 unites par lettre, une avance de 600 (900 pour « W »), un crenage pour « AV ». */
export const glyphesCarres: Glyphes = {
  unitesParEm: 1000,
  contour: (_c, x, y, t) => {
    const k = t / 1000, l = 500 * k, h = 700 * k;
    return [{ type: 'M', x, y }, { type: 'L', x: x + l, y }, { type: 'L', x: x + l, y: y - h }, { type: 'L', x, y: y - h }, { type: 'Z' }];
  },
  avance: c => (c === 'W' ? 900 : 600),
  crenage: (a, b) => (a === 'A' && b === 'V' ? -100 : 0)
};
