// Agrandir une petite source avant de la tracer : un logo de 120 pixels de large n'a pas assez de
// pixels pour que le traceur place ses courbes, il trace des marches d'escalier. Interpolation
// bicubique de Catmull-Rom (douce, sans flou, un peu de reprise sur les contours) en facteur 2 exact :
// les deux positions de sortie par pixel source tombent a 1/4 et 3/4, donc deux jeux de quatre poids
// fixes, des fractions binaires exactes. Le calcul se fait en alpha premultiplie (un pixel absent
// n'envoie pas sa couleur dans ses voisins) et ligne a ligne : jamais plus de quatre lignes en memoire.

import type { ImageRgba } from './types.js';

/** Au-dela, l'agrandissement est refuse (memoire) : le cote de sortie ne depasse pas 4096. */
export const COTE_AGRANDI_MAX = 4096;

// Poids de Catmull-Rom a t = 1/4 (sortie impaire, apres le pixel) ; ceux de t = 3/4 en sont le miroir.
const W_QUART = [-0.0703125, 0.8671875, 0.2265625, -0.0234375] as const;
const W_TROIS_QUARTS = [-0.0234375, 0.2265625, 0.8671875, -0.0703125] as const;

/** Vrai quand l'image peut etre doublee sans depasser la limite. */
export const peutAgrandir = (largeur: number, hauteur: number): boolean => largeur * 2 <= COTE_AGRANDI_MAX && hauteur * 2 <= COTE_AGRANDI_MAX;

/** Une ligne source doublee en largeur, en alpha premultiplie : 4 flottants par pixel (R*a, V*a, B*a, a), de 0 a 255. */
function ligneDoublee(data: Uint8ClampedArray, largeur: number, y: number, sortie: Float32Array): void {
  const base = y * largeur;
  for (let x = 0; x < largeur; x++) {
    for (let moitie = 0; moitie < 2; moitie++) {
      const w = moitie === 0 ? W_TROIS_QUARTS : W_QUART;
      // Sortie paire (2x) : entre x-1 et x ; sortie impaire (2x+1) : entre x et x+1.
      const debut = moitie === 0 ? x - 2 : x - 1;
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < 4; k++) {
        const xx = Math.min(largeur - 1, Math.max(0, debut + k)), j = (base + xx) * 4;
        const alpha = data[j + 3] ?? 0, p = (w[k] ?? 0) * alpha / 255;
        r += (data[j] ?? 0) * p; g += (data[j + 1] ?? 0) * p; b += (data[j + 2] ?? 0) * p; a += (w[k] ?? 0) * alpha;
      }
      const o = (x * 2 + moitie) * 4;
      sortie[o] = r; sortie[o + 1] = g; sortie[o + 2] = b; sortie[o + 3] = a;
    }
  }
}

/** Double l'image (largeur et hauteur). L'entree n'est pas modifiee ; une image trop grande est rendue telle quelle. */
export function agrandirX2(img: ImageRgba): ImageRgba {
  const { data, largeur: l, hauteur: h } = img;
  if (!peutAgrandir(l, h)) return img;
  const lg = l * 2, hg = h * 2;
  const sortie = new Uint8ClampedArray(lg * hg * 4);
  // Quatre lignes doublees en anneau : la ligne source y vit a l'emplacement y mod 4.
  const anneau = [0, 1, 2, 3].map(() => new Float32Array(lg * 4));
  const etiquette = [-1, -1, -1, -1];
  const ligne = (y: number): Float32Array => {
    const yy = Math.min(h - 1, Math.max(0, y)), emplacement = yy & 3, tampon = anneau[emplacement] ?? new Float32Array(lg * 4);
    if (etiquette[emplacement] !== yy) { ligneDoublee(data, l, yy, tampon); etiquette[emplacement] = yy; }
    return tampon;
  };
  for (let y = 0; y < h; y++) {
    for (let moitie = 0; moitie < 2; moitie++) {
      const w = moitie === 0 ? W_TROIS_QUARTS : W_QUART, debut = moitie === 0 ? y - 2 : y - 1;
      // Les quatre lignes sont demandees d'abord : l'anneau en tient exactement quatre.
      const lignes = [ligne(debut), ligne(debut + 1), ligne(debut + 2), ligne(debut + 3)];
      const o = (y * 2 + moitie) * lg * 4;
      for (let x = 0; x < lg * 4; x += 4) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let k = 0; k < 4; k++) {
          const t = lignes[k], wk = w[k] ?? 0;
          if (!t) continue;
          r += (t[x] ?? 0) * wk; g += (t[x + 1] ?? 0) * wk; b += (t[x + 2] ?? 0) * wk; a += (t[x + 3] ?? 0) * wk;
        }
        // Retour a l'alpha droit ; un alpha nul n'a pas de couleur. Le facteur vient de l'alpha brut, avant
        // bornage : la reprise de Catmull-Rom depasse 255 sur un contour, et la couleur doit depasser avec.
        if (a < 0.5) { sortie[o + x + 3] = 0; continue; }
        const k = 255 / a;
        sortie[o + x] = r * k; sortie[o + x + 1] = g * k; sortie[o + x + 2] = b * k; sortie[o + x + 3] = Math.min(255, a);
      }
    }
  }
  return { data: sortie, largeur: lg, hauteur: hg };
}
