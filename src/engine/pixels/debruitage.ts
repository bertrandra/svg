// Le debruitage qui garde les bords : le grain d'un JPEG ou d'un scan fait de chaque aplat un nuage de
// couleurs voisines, que le traceur decoupe en poussieres. Une mediane 3x3 efface le sel et le poivre
// sans arrondir les angles ; un filtre bilateral (moyenne ponderee par la distance de couleur) lisse
// le grain doux sans traverser un contour. Force 1 : la mediane ; 2 : le bilateral ; 3 : les deux.
// Entiers partout dans les poids : le resultat ne depend pas de l'arrondi d'une machine.

import { ALPHA_PRESENT } from './alpha.js';
import type { ImageRgba } from './types.js';

/** Les poids spatiaux du bilateral 5x5 : le binome (1 4 6 4 1), produit exterieur. */
const BINOME = [1, 4, 6, 4, 1] as const;
/** Ecart de couleur (ecart-type) du bilateral, selon la force : plus haut, plus de grain traverse. */
const SIGMA_BILATERAL: Record<2 | 3, number> = { 2: 18, 3: 36 };

/** La mediane de neuf valeurs, par un reseau de tri (19 echanges) : pas de tableau, pas d'allocation. */
function mediane9(a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number): number {
  let t: number;
  if (b > c) { t = b; b = c; c = t; } if (e > f) { t = e; e = f; f = t; } if (h > i) { t = h; h = i; i = t; }
  if (a > b) { t = a; a = b; b = t; } if (d > e) { t = d; d = e; e = t; } if (g > h) { t = g; g = h; h = t; }
  if (b > c) { t = b; b = c; c = t; } if (e > f) { t = e; e = f; f = t; } if (h > i) { t = h; h = i; i = t; }
  if (a > d) { t = a; a = d; d = t; } if (f > i) { t = f; f = i; i = t; } if (e > h) { t = e; e = h; h = t; }
  if (d > g) { t = d; d = g; g = t; } if (b > e) { t = b; b = e; e = t; } if (c > f) { t = c; c = f; f = t; }
  if (e > h) { t = e; e = h; h = t; } if (e > c) { t = e; e = c; c = t; } if (g > e) { t = g; g = e; e = t; }
  if (e > c) { t = e; e = c; c = t; }
  return e;
}

/** La valeur d'un voisin sur un canal, ou celle du centre quand le voisin est absent (alpha) : rien n'y deteint. */
const voisin = (data: Uint8ClampedArray, j: number, c: number, centre: number): number => ((data[j + 3] ?? 0) >= ALPHA_PRESENT ? (data[j + c] ?? centre) : centre);

/** Mediane 3x3 par canal. Un voisin hors image compte pour le centre (bord replique), un voisin absent aussi. */
export function mediane3(img: ImageRgba): ImageRgba {
  const { data, largeur: l, hauteur: h } = img;
  const sortie = new Uint8ClampedArray(data);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - 1) * l, y1 = y * l, y2 = Math.min(h - 1, y + 1) * l;
    for (let x = 0; x < l; x++) {
      const o4 = (y1 + x) * 4;
      if ((data[o4 + 3] ?? 0) < ALPHA_PRESENT) continue;
      const x0 = Math.max(0, x - 1), x2 = Math.min(l - 1, x + 1);
      const o0 = (y0 + x0) * 4, o1 = (y0 + x) * 4, o2 = (y0 + x2) * 4, o3 = (y1 + x0) * 4, o5 = (y1 + x2) * 4, o6 = (y2 + x0) * 4, o7 = (y2 + x) * 4, o8 = (y2 + x2) * 4;
      for (let c = 0; c < 3; c++) {
        const v = data[o4 + c] ?? 0;
        sortie[o4 + c] = mediane9(voisin(data, o0, c, v), voisin(data, o1, c, v), voisin(data, o2, c, v), voisin(data, o3, c, v), v,
          voisin(data, o5, c, v), voisin(data, o6, c, v), voisin(data, o7, c, v), voisin(data, o8, c, v));
      }
    }
  }
  return { data: sortie, largeur: l, hauteur: h };
}

/** La table des poids de couleur du bilateral : indexee par l'ecart moyen |dR|+|dV|+|dB| / 3, de 0 a 255. */
function poidsCouleur(sigma: number): Uint16Array {
  const t = new Uint16Array(256);
  for (let d = 0; d < 256; d++) t[d] = Math.round(256 * Math.exp(-(d * d) / (2 * sigma * sigma)));
  return t;
}

/** Bilateral 5x5 : chaque pixel devient la moyenne de son voisinage, pesee par la proximite et par la ressemblance. */
export function bilateral5(img: ImageRgba, sigma: number): ImageRgba {
  const { data, largeur: l, hauteur: h } = img;
  const sortie = new Uint8ClampedArray(data);
  const wc = poidsCouleur(sigma);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      const centre = (y * l + x) * 4;
      if ((data[centre + 3] ?? 0) < ALPHA_PRESENT) continue;
      const r0 = data[centre] ?? 0, g0 = data[centre + 1] ?? 0, b0 = data[centre + 2] ?? 0;
      let sr = 0, sg = 0, sb = 0, sw = 0;
      for (let dy = -2; dy <= 2; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        const wy = BINOME[dy + 2] ?? 1;
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= l) continue;
          const j = (yy * l + xx) * 4;
          if ((data[j + 3] ?? 0) < ALPHA_PRESENT) continue;
          const r = data[j] ?? 0, g = data[j + 1] ?? 0, b = data[j + 2] ?? 0;
          const ecart = (Math.abs(r - r0) + Math.abs(g - g0) + Math.abs(b - b0)) / 3 | 0;
          const w = wy * (BINOME[dx + 2] ?? 1) * (wc[ecart] ?? 0);
          sr += r * w; sg += g * w; sb += b * w; sw += w;
        }
      }
      sortie[centre] = sr / sw;
      sortie[centre + 1] = sg / sw;
      sortie[centre + 2] = sb / sw;
    }
  }
  return { data: sortie, largeur: l, hauteur: h };
}

/** Debruite avec la force donnee (0 : rien). */
export function debruiter(img: ImageRgba, force: number): ImageRgba {
  if (force <= 0) return img;
  if (force === 1) return mediane3(img);
  if (force === 2) return bilateral5(img, SIGMA_BILATERAL[2]);
  return bilateral5(mediane3(img), SIGMA_BILATERAL[3]);
}
