// Des images synthetiques deterministes pour les tests du pretraitement : aucun fichier, aucun
// hasard (un generateur congruentiel a graine fixe). Un « logo » a trois aplats, un « photo » en
// degrades, chacun avec ou sans bruit de type JPEG.

import type { ImageRgba } from '../../../src/engine/pixels/types.js';

/** Un generateur a graine : la meme suite a chaque appel. */
export function graine(depart: number): () => number {
  let s = depart >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

export type Couleur4 = readonly [number, number, number, number];

export function peindre(largeur: number, hauteur: number, couleurDe: (x: number, y: number) => Couleur4): ImageRgba {
  const data = new Uint8ClampedArray(largeur * hauteur * 4);
  for (let y = 0; y < hauteur; y++) for (let x = 0; x < largeur; x++) data.set(couleurDe(x, y), (y * largeur + x) * 4);
  return { data, largeur, hauteur };
}

/** Un disque rouge, un carre bleu et un anneau vert sur fond blanc : un logo a trois aplats. */
export function logo(largeur = 96, hauteur = 64): ImageRgba {
  return peindre(largeur, hauteur, (x, y) => {
    const d = Math.hypot(x - largeur * 0.3, y - hauteur * 0.5);
    if (d < hauteur * 0.3) return [200, 30, 40, 255];
    if (x > largeur * 0.55 && x < largeur * 0.8 && y > hauteur * 0.25 && y < hauteur * 0.75) return [20, 60, 190, 255];
    const e = Math.hypot(x - largeur * 0.88, y - hauteur * 0.5);
    if (e < hauteur * 0.2 && e > hauteur * 0.1) return [30, 150, 60, 255];
    return [255, 255, 255, 255];
  });
}

/** Le meme logo avec du bruit par pixel (amplitude `force`, a graine fixe) : le grain d'un JPEG mediocre. */
export function logoBruite(largeur = 96, hauteur = 64, force = 14, depart = 7): ImageRgba {
  const base = logo(largeur, hauteur), alea = graine(depart);
  const data = new Uint8ClampedArray(base.data);
  for (let i = 0; i < largeur * hauteur; i++) {
    for (let c = 0; c < 3; c++) data[i * 4 + c] = (data[i * 4 + c] ?? 0) + Math.round((alea() - 0.5) * 2 * force);
  }
  return { data, largeur, hauteur };
}

/** Un « photo » : des degrades doux et du grain, des milliers de couleurs. */
export function photo(largeur = 80, hauteur = 60, depart = 11): ImageRgba {
  const alea = graine(depart);
  return peindre(largeur, hauteur, (x, y) => [
    Math.round(40 + 180 * (x / largeur) + (alea() - 0.5) * 10),
    Math.round(60 + 140 * (y / hauteur) + (alea() - 0.5) * 10),
    Math.round(200 - 120 * ((x + y) / (largeur + hauteur)) + (alea() - 0.5) * 10),
    255
  ]);
}

/** Les couleurs distinctes (RGB) des pixels opaques d'une image. */
export function couleursDistinctes(img: ImageRgba): number {
  const vues = new Set<number>();
  for (let i = 0; i < img.largeur * img.hauteur; i++) {
    if ((img.data[i * 4 + 3] ?? 0) === 0) continue;
    vues.add(((img.data[i * 4] ?? 0) << 16) | ((img.data[i * 4 + 1] ?? 0) << 8) | (img.data[i * 4 + 2] ?? 0));
  }
  return vues.size;
}
