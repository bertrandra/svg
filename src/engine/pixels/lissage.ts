// Lisser les bords par un filtre de mode : chaque pixel prend la couleur la plus frequente de son
// voisinage 3x3. Le grignotage de JPEG (un pixel de teinte intermediaire sur un contour, un trait d'un
// pixel d'une couleur parasite) disparait ; un aplat, un contour franc, un angle ne bougent pas. Aucune
// couleur nouvelle : le pixel rendu est toujours un pixel du voisinage. Pour changer, une couleur doit
// battre celle du centre d'au moins deux voisins ; entre candidates, la premiere dans l'ordre de lecture, pour que le resultat ne depende de rien d'autre que de l'image.

import { ALPHA_PRESENT } from './alpha.js';
import type { ImageRgba } from './types.js';

/**
 * Une passe. `precision` : les bits de poids faible ignores pour juger que deux couleurs sont « la
 * meme » (0 apres une quantification, ou les couleurs sont exactes ; 3 sinon, pour qu'un grain
 * de quelques niveaux ne les distingue pas).
 */
export function passeDeMode(img: ImageRgba, precision: number): ImageRgba {
  const { data, largeur: l, hauteur: h } = img;
  const sortie = new Uint8ClampedArray(data);
  const cles = new Uint32Array(l * h);
  for (let i = 0; i < l * h; i++) {
    cles[i] = ((((data[i * 4] ?? 0) >> precision) << 16) | (((data[i * 4 + 1] ?? 0) >> precision) << 8) | ((data[i * 4 + 2] ?? 0) >> precision)) >>> 0;
  }
  const voisins = new Int32Array(9);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      const i = y * l + x;
      if ((data[i * 4 + 3] ?? 0) < ALPHA_PRESENT) continue;
      // Les voisins presents, dans l'ordre de lecture ; le centre y est (a son rang).
      let n = 0, egaux = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= l) continue;
          const j = yy * l + xx;
          if ((data[j * 4 + 3] ?? 0) < ALPHA_PRESENT) continue;
          voisins[n++] = j;
          if (j !== i && cles[j] === cles[i]) egaux++;
        }
      }
      // Le centre avec au moins quatre voisins pareils et un voisinage de huit ou plus est deja majoritaire.
      if (egaux >= 4 || n <= 1) continue;
      let meilleur = i, effectif = egaux + 1;
      for (let a = 0; a < n; a++) {
        const ja = voisins[a] ?? i, cle = cles[ja];
        let compte = 0;
        for (let b = 0; b < n; b++) if (cles[voisins[b] ?? i] === cle) compte++;
        if (compte > effectif) { effectif = compte; meilleur = ja; }
      }
      // Il faut battre le centre d'au moins deux voisins : un angle droit (4 contre 5) garde son coin, un trait
      // d'un pixel (3 contre 6) ou un pixel isole (1 contre 8) disparait.
      if (meilleur !== i && effectif >= egaux + 3) { sortie[i * 4] = data[meilleur * 4] ?? 0; sortie[i * 4 + 1] = data[meilleur * 4 + 1] ?? 0; sortie[i * 4 + 2] = data[meilleur * 4 + 2] ?? 0; }
    }
  }
  return { data: sortie, largeur: l, hauteur: h };
}

/** Lisse les bords par `passes` passes (0 : rien). */
export function lisserBords(img: ImageRgba, passes: number, precision: number): ImageRgba {
  let r = img;
  for (let p = 0; p < passes; p++) r = passeDeMode(r, precision);
  return r;
}
