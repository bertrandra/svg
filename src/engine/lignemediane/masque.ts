// La premiere etape de la ligne mediane (ADR-0021) : separer le trait du fond, puis nettoyer le masque.
// Le trait se lit par son ecart de luminosite au fond (la couleur du bord) : une encre noire sur papier
// blanc comme une craie blanche sur ardoise, une encre bleue comme une mine grise. Un pixel transparent
// (deja detoure) est du fond. Tout est entier ou en + - * / : la meme image rend le meme masque partout.
//
// Le masque est borde d'une ligne et d'une colonne de fond de chaque cote : les huit voisins d'un pixel
// existent toujours, et aucune etape n'a de cas particulier au bord de l'image.

import type { Rgb } from '../../util/couleur.js';
import type { ImageRgba } from '../pixels/types.js';

export interface Masque {
  largeur: number;
  hauteur: number;
  /** La largeur bordee (largeur + 2) : le pas d'une ligne a la suivante dans `bits`. */
  pas: number;
  /** 1 pour un pixel du trait, 0 pour le fond ; (largeur + 2) x (hauteur + 2), bord compris. */
  bits: Uint8Array;
}

export function creerMasque(largeur: number, hauteur: number): Masque {
  return { largeur, hauteur, pas: largeur + 2, bits: new Uint8Array((largeur + 2) * (hauteur + 2)) };
}

/** L'indice borde du pixel (x, y) de l'image. */
export const indice = (m: Masque, x: number, y: number): number => (y + 1) * m.pas + x + 1;

/** Le centre, dans le plan de l'image, du pixel d'indice borde `i`. */
export function centre(m: Masque, i: number): readonly [number, number] {
  const x = i % m.pas, y = (i - x) / m.pas;
  return [x - 0.5, y - 0.5];
}

/** Les huit voisins d'un indice borde, dans un ordre fixe (de gauche a droite, de haut en bas). */
export const voisins8 = (pas: number): readonly number[] => [-pas - 1, -pas, -pas + 1, -1, 1, pas - 1, pas, pas + 1];

// La luminosite a la ponderation entiere de la television (299, 587, 114) : pas de puissance, pas de flottant.
const luma = (r: number, g: number, b: number): number => 299 * r + 587 * g + 114 * b;

/** L'ecart de luminosite de chaque pixel au fond, de 0 a 255 ; 0 pour un pixel transparent. */
export function contrastes(img: ImageRgba, fond: Rgb): Uint8Array {
  const n = img.largeur * img.hauteur, sortie = new Uint8Array(n), lf = luma(fond.r, fond.g, fond.b), d = img.data;
  for (let i = 0; i < n; i++) {
    if ((d[i * 4 + 3] ?? 0) < 128) continue;
    sortie[i] = Math.min(255, Math.floor(Math.abs(luma(d[i * 4] ?? 0, d[i * 4 + 1] ?? 0, d[i * 4 + 2] ?? 0) - lf) / 1000));
  }
  return sortie;
}

/**
 * Le seuil d'Otsu sur les ecarts : celui qui separe le mieux deux populations (le fond, le trait). Sur un
 * palier (une image sans anticrenelage, ou tous les seuils se valent), le milieu du palier : un trait noir pur
 * sur blanc pur se coupe a mi-chemin, pas au premier gris venu. Borne a [1, 254].
 */
export function seuilOtsu(ecarts: Uint8Array): number {
  const h = new Float64Array(256);
  for (const v of ecarts) h[v] = (h[v] ?? 0) + 1;
  const total = ecarts.length;
  let somme = 0;
  for (let i = 0; i < 256; i++) somme += i * (h[i] ?? 0);
  let sB = 0, wB = 0, meilleur = -1, de = 128, a = 128;
  for (let i = 0; i < 255; i++) {
    wB += h[i] ?? 0;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sB += i * (h[i] ?? 0);
    const mB = sB / wB, mF = (somme - sB) / wF, entre = wB * wF * (mB - mF) * (mB - mF);
    if (entre > meilleur) { meilleur = entre; de = i; a = i; } else if (entre === meilleur) a = i;
  }
  return Math.max(1, Math.min(254, Math.floor((de + a) / 2)));
}

/** Le masque du trait : les pixels dont l'ecart au fond depasse le seuil. Rend aussi leur nombre. */
export function masquer(ecarts: Uint8Array, largeur: number, hauteur: number, seuil: number): { masque: Masque; encre: number } {
  const m = creerMasque(largeur, hauteur);
  let encre = 0;
  for (let y = 0; y < hauteur; y++) for (let x = 0; x < largeur; x++) {
    if ((ecarts[y * largeur + x] ?? 0) > seuil) { m.bits[indice(m, x, y)] = 1; encre++; }
  }
  return { masque: m, encre };
}

/**
 * Remplit la composante de `depart` (pixels de valeur `valeur`), en 8-connexite ou en 4, et rend ses indices
 * dans `tampon` (leur nombre). `vu` marque ce qui est deja pris. Une pile explicite : pas de recursion.
 */
function composante(m: Masque, depart: number, valeur: number, offsets: readonly number[], vu: Uint8Array, tampon: Int32Array): number {
  let n = 0, haut = 0;
  const pile = tampon;
  // La pile et la liste partagent le tampon : on lit en tete (n) pendant qu'on empile derriere (haut).
  pile[haut++] = depart;
  vu[depart] = 1;
  while (n < haut) {
    const i = pile[n++] ?? 0;
    for (const o of offsets) {
      const j = i + o;
      if (j < 0 || j >= m.bits.length || vu[j] || m.bits[j] !== valeur) continue;
      vu[j] = 1;
      pile[haut++] = j;
    }
  }
  return n;
}

/** Retire les taches du trait de moins de `aireMin` pixels (8-connexite). Rend le nombre de pixels retires. */
export function retirerTaches(m: Masque, aireMin: number): number {
  if (aireMin <= 1) return 0;
  const vu = new Uint8Array(m.bits.length), tampon = new Int32Array(m.bits.length), v8 = voisins8(m.pas);
  let retires = 0;
  for (let i = 0; i < m.bits.length; i++) {
    if (!m.bits[i] || vu[i]) continue;
    const n = composante(m, i, 1, v8, vu, tampon);
    if (n >= aireMin) continue;
    for (let k = 0; k < n; k++) m.bits[tampon[k] ?? 0] = 0;
    retires += n;
  }
  return retires;
}

/**
 * Bouche les trous du trait de moins de `aireMin` pixels : un blanc enferme (4-connexite, la duale de la
 * 8-connexite du trait) qui ne touche pas le bord. Un point blanc dans un trait epais ferait une boucle
 * dans le squelette ; l'oeil d'un « o », plus grand, reste.
 */
export function boucherTrous(m: Masque, aireMin: number): number {
  if (aireMin <= 1) return 0;
  const vu = new Uint8Array(m.bits.length), tampon = new Int32Array(m.bits.length), v4 = [-m.pas, -1, 1, m.pas];
  // Le dehors d'abord : tout le fond relie au bord borde.
  composante(m, 0, 0, v4, vu, tampon);
  let bouches = 0;
  for (let i = 0; i < m.bits.length; i++) {
    if (m.bits[i] || vu[i]) continue;
    const n = composante(m, i, 0, v4, vu, tampon);
    if (n >= aireMin) continue;
    for (let k = 0; k < n; k++) m.bits[tampon[k] ?? 0] = 1;
    bouches += n;
  }
  return bouches;
}
