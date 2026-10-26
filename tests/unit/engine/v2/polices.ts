// Des fontes factices pour lire le texte d'un SVG en lettres dans les cas v2 (ADR-0020, etape 13c) : chaque lettre est un rectangle a
// coin coupe, dont la hauteur depend du caractere, sur une avance fixe. Les references ne dependent ainsi d'aucun fichier de fonte : une
// mise a jour des fontes embarquees ne les deplace pas. Toutes les polices demandees rendent la meme fonte.

import type { Glyphes, PolicesTexte } from '../../../../src/engine/editionSvg.js';

export const glyphesFactices: Glyphes = {
  unitesParEm: 1000,
  contour: (c, x, y, t) => {
    if (c === ' ') return [];
    const k = t / 1000, l = 480 * k, h = (500 + (c.charCodeAt(0) % 5) * 60) * k;
    return [{ type: 'M', x, y }, { type: 'L', x: x + l, y }, { type: 'L', x: x + l, y: y - h * 0.8 }, { type: 'L', x: x + l * 0.7, y: y - h }, { type: 'L', x, y: y - h }, { type: 'Z' }];
  },
  avance: c => (c === ' ' ? 300 : 600),
  crenage: () => 0
};

export const policesFactices: PolicesTexte = { glyphes: () => glyphesFactices };
