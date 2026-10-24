// L'alpha avant tout le reste : les bords translucides d'un PNG anticrenele (ou d'un GIF redimensionne)
// sont des pixels « a moitie » du dessin, que le traceur lit comme autant de couleurs parasites, un
// liseré clair ou sombre autour de chaque forme. On les aplatit : sur le fond de l'image quand elle
// en a un d'opaque, sinon (fond deja transparent) l'alpha devient tout ou rien et la couleur reste.

import { couleurDuBord } from '../detourage.js';
import type { Rgb } from '../../util/couleur.js';
import type { ImageRgba } from './types.js';

/** Sous cet alpha, un pixel est « absent » ; a partir de lui, il compte (meme seuil que le detourage). */
export const ALPHA_PRESENT = 128;

/** Vrai quand la moitie au moins du pourtour est opaque : l'image a un fond a elle. */
function pourtourOpaque(img: ImageRgba): boolean {
  const { data, largeur: l, hauteur: h } = img;
  let opaques = 0, total = 0;
  const voir = (i: number) => { total++; if ((data[i * 4 + 3] ?? 0) >= ALPHA_PRESENT) opaques++; };
  for (let x = 0; x < l; x++) { voir(x); voir((h - 1) * l + x); }
  for (let y = 1; y < h - 1; y++) { voir(y * l); voir(y * l + l - 1); }
  return total > 0 && opaques * 2 >= total;
}

/** Le fond d'une image : la couleur dominante de son pourtour s'il est opaque, sinon null. */
export function fondOpaque(img: ImageRgba): Rgb | null {
  return pourtourOpaque(img) ? couleurDuBord(img.data, img.largeur, img.hauteur) : null;
}

/**
 * Aplatit les pixels translucides (alpha de 1 a 254). Avec un fond opaque, chacun est compose sur lui et
 * devient opaque : le detourage retirera ensuite ce qui est du fond. Sans fond, l'alpha passe a 0 ou
 * 255 (selon qu'il atteint la moitie) et la couleur est gardee telle quelle.
 */
export function aplatirAlpha(img: ImageRgba): ImageRgba {
  const { data, largeur, hauteur } = img;
  const sortie = new Uint8ClampedArray(data);
  const fond = fondOpaque(img);
  for (let i = 0; i < largeur * hauteur; i++) {
    const a = data[i * 4 + 3] ?? 0;
    if (a === 0 || a === 255) continue;
    if (fond) {
      const k = 255 - a;
      sortie[i * 4] = ((data[i * 4] ?? 0) * a + fond.r * k + 127) / 255;
      sortie[i * 4 + 1] = ((data[i * 4 + 1] ?? 0) * a + fond.g * k + 127) / 255;
      sortie[i * 4 + 2] = ((data[i * 4 + 2] ?? 0) * a + fond.b * k + 127) / 255;
      sortie[i * 4 + 3] = 255;
    } else sortie[i * 4 + 3] = a >= ALPHA_PRESENT ? 255 : 0;
  }
  return { data: sortie, largeur, hauteur };
}
