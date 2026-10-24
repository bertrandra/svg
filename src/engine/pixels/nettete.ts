// Nettete et clarte : un masque flou (unsharp mask) redonne de la tenue a un contour amolli par un
// redimensionnement ou un JPEG, et un gamma eclaircit ou assombrit les demi-teintes sans toucher au noir
// ni au blanc. Le flou du masque est un 3x3 binomial (1 2 1) separable, calcule en entiers et pondere par la
// presence : un pixel absent (alpha) n'envoie pas sa couleur dans le contour d'a cote.

import { ALPHA_PRESENT } from './alpha.js';
import type { ImageRgba } from './types.js';

/** Le gain du masque flou, selon la force 1 a 3 : la part du detail (pixel moins flou) qu'on rajoute. */
const GAIN_NETTETE: Record<1 | 2 | 3, number> = { 1: 0.6, 2: 1.2, 3: 2 };

/** Le flou 3x3 binomial de chaque canal, pondere par la presence (1 si alpha present, sinon 0). */
function flouPresent(img: ImageRgba): Float32Array {
  const { data, largeur: l, hauteur: h } = img;
  // Passe horizontale : somme ponderee de la couleur (x presence) et somme des poids, par pixel.
  const num = new Int32Array(l * h * 3), den = new Int32Array(l * h);
  const present = (i: number) => ((data[i * 4 + 3] ?? 0) >= ALPHA_PRESENT ? 1 : 0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      const i = y * l + x, g = y * l + Math.max(0, x - 1), d = y * l + Math.min(l - 1, x + 1);
      const wg = present(g), wi = 2 * present(i), wd = present(d);
      den[i] = wg + wi + wd;
      for (let c = 0; c < 3; c++) num[i * 3 + c] = (data[g * 4 + c] ?? 0) * wg + (data[i * 4 + c] ?? 0) * wi + (data[d * 4 + c] ?? 0) * wd;
    }
  }
  // Passe verticale, puis division : le flou en flottant (le seul), pose dans un tampon de sortie.
  const flou = new Float32Array(l * h * 3);
  for (let y = 0; y < h; y++) {
    const yh = Math.max(0, y - 1) * l, yb = Math.min(h - 1, y + 1) * l;
    for (let x = 0; x < l; x++) {
      const i = y * l + x, n = (den[yh + x] ?? 0) + 2 * (den[i] ?? 0) + (den[yb + x] ?? 0);
      for (let c = 0; c < 3; c++) {
        const s = (num[(yh + x) * 3 + c] ?? 0) + 2 * (num[i * 3 + c] ?? 0) + (num[(yb + x) * 3 + c] ?? 0);
        flou[i * 3 + c] = n > 0 ? s / n : (data[i * 4 + c] ?? 0);
      }
    }
  }
  return flou;
}

/** Masque flou : pixel + gain x (pixel - flou). Force 0 : rien. Les pixels absents ne bougent pas. */
export function affuter(img: ImageRgba, force: number): ImageRgba {
  if (force <= 0) return img;
  const gain = GAIN_NETTETE[Math.min(3, Math.max(1, Math.round(force))) as 1 | 2 | 3];
  const { data, largeur: l, hauteur: h } = img;
  const flou = flouPresent(img), sortie = new Uint8ClampedArray(data);
  for (let i = 0; i < l * h; i++) {
    if ((data[i * 4 + 3] ?? 0) < ALPHA_PRESENT) continue;
    for (let c = 0; c < 3; c++) {
      const v = data[i * 4 + c] ?? 0;
      sortie[i * 4 + c] = v + gain * (v - (flou[i * 3 + c] ?? v));
    }
  }
  return { data: sortie, largeur: l, hauteur: h };
}

/** Gamma > 1 eclaircit les demi-teintes, < 1 les assombrit ; 1 ne change rien. Table de 256 entrees. */
export function corrigerGamma(img: ImageRgba, gamma: number): ImageRgba {
  if (gamma === 1 || !(gamma > 0)) return img;
  const table = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) table[v] = Math.round(255 * Math.pow(v / 255, 1 / gamma));
  const { data, largeur: l, hauteur: h } = img;
  const sortie = new Uint8ClampedArray(data);
  for (let i = 0; i < l * h; i++) {
    sortie[i * 4] = table[data[i * 4] ?? 0] ?? 0;
    sortie[i * 4 + 1] = table[data[i * 4 + 1] ?? 0] ?? 0;
    sortie[i * 4 + 2] = table[data[i * 4 + 2] ?? 0] ?? 0;
  }
  return { data: sortie, largeur: l, hauteur: h };
}
