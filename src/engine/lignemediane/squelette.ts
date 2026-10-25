// Le squelette d'un pixel d'epaisseur (ADR-0021) : l'amincissement de Guo et Hall (1989, algorithme A1),
// suivi d'un retrait des marches d'escalier, et la distance de chaque pixel du trait au fond (pour mesurer
// l'epaisseur du trait d'origine).
//
// Pourquoi Guo-Hall plutot que Zhang-Suen : les deux sont paralleles en deux sous-iterations et
// deterministes, mais Zhang-Suen efface entierement un trait diagonal de deux pixels d'epaisseur et un
// carre de 2 x 2 (un point d'un « i » ecrit fin disparait), et laisse des squelettes de deux pixels sur les
// diagonales. Guo-Hall garde ces cas, avec la meme simplicite et le meme cout.

import { voisins8, type Masque } from './masque.js';

/** Les huit voisins d'un pixel, en booleens 0/1 : p2 au nord, puis dans le sens des aiguilles d'une montre. */
function lireVoisins(b: Uint8Array, i: number, pas: number): readonly [number, number, number, number, number, number, number, number] {
  return [b[i - pas] ?? 0, b[i - pas + 1] ?? 0, b[i + 1] ?? 0, b[i + pas + 1] ?? 0, b[i + pas] ?? 0, b[i + pas - 1] ?? 0, b[i - 1] ?? 0, b[i - pas - 1] ?? 0];
}

/** Vrai si Guo-Hall retire ce pixel a cette sous-iteration (0 ou 1). */
function aRetirer(b: Uint8Array, i: number, pas: number, sous: 0 | 1): boolean {
  const [p2, p3, p4, p5, p6, p7, p8, p9] = lireVoisins(b, i, pas);
  const c = (+(!p2 && (p3 || p4))) + (+(!p4 && (p5 || p6))) + (+(!p6 && (p7 || p8))) + (+(!p8 && (p9 || p2)));
  if (c !== 1) return false;
  const n1 = (p9 | p2) + (p3 | p4) + (p5 | p6) + (p7 | p8);
  const n2 = (p2 | p3) + (p4 | p5) + (p6 | p7) + (p8 | p9);
  const n = Math.min(n1, n2);
  if (n < 2 || n > 3) return false;
  const m = sous === 0 ? ((p6 | p7 | (p9 ? 0 : 1)) & p8) : ((p2 | p3 | (p5 ? 0 : 1)) & p4);
  return m === 0;
}

/**
 * Amincit le masque en place jusqu'a un squelette 8-connexe d'un pixel. Chaque sous-iteration decide sur
 * l'etat d'avant elle (parallele), puis retire : l'ordre de lecture ne change rien au resultat. Le nombre
 * d'iterations est borne par la demi-epaisseur du trait le plus epais ; une garde l'arrete de toute facon.
 */
export function amincir(m: Masque): number {
  const b = m.bits;
  let candidats: number[] = [];
  for (let i = 0; i < b.length; i++) if (b[i]) candidats.push(i);
  const garde = m.largeur + m.hauteur + 2;
  let iterations = 0;
  for (; iterations < garde; iterations++) {
    let change = false;
    for (const sous of [0, 1] as const) {
      const retires = candidats.filter(i => b[i] && aRetirer(b, i, m.pas, sous));
      for (const i of retires) b[i] = 0;
      if (retires.length) change = true;
    }
    candidats = candidats.filter(i => b[i]);
    if (!change) break;
  }
  return iterations;
}

/**
 * Retire les marches d'escalier : un pixel en coin interieur (deux voisins orthogonaux pris, les deux autres
 * et la diagonale opposee vides) relie deux pixels deja voisins en diagonale. Sans ce retrait, trois pixels
 * en L sont chacun voisins des deux autres, et le suivi du squelette y voit une jonction ou une boucle. Un
 * tel pixel est toujours simple (son retrait ne coupe ni ne perce rien) ; la passe est sequentielle, en
 * ordre de lecture fixe.
 */
export function retirerMarches(m: Masque): number {
  const b = m.bits, pas = m.pas;
  let retires = 0;
  for (let i = 0; i < b.length; i++) {
    if (!b[i]) continue;
    const [n, ne, e, se, s, so, o, no] = lireVoisins(b, i, pas);
    const coin = (n && e && !s && !o && !so) || (n && o && !s && !e && !se) || (s && e && !n && !o && !no) || (s && o && !n && !e && !ne);
    if (coin) { b[i] = 0; retires++; }
  }
  return retires;
}

/** Le nombre de voisins d'un pixel du squelette. */
export function degre(m: Masque, i: number): number {
  let d = 0;
  for (const o of voisins8(m.pas)) d += m.bits[i + o] ?? 0;
  return d;
}

/** La transformee de distance exacte d'une ligne (Felzenszwalb et Huttenlocher), en place dans `d`. */
function distance1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    const fq = (f[q] ?? 0) + q * q;
    let vk = v[k] ?? 0, s = (fq - ((f[vk] ?? 0) + vk * vk)) / (2 * q - 2 * vk);
    while (s <= (z[k] ?? 0) && k > 0) {
      k--;
      vk = v[k] ?? 0;
      s = (fq - ((f[vk] ?? 0) + vk * vk)) / (2 * q - 2 * vk);
    }
    k++;
    v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while ((z[k + 1] ?? Infinity) < q) k++;
    const vk = v[k] ?? 0;
    d[q] = (q - vk) * (q - vk) + (f[vk] ?? 0);
  }
}

// Une distance « infinie » finie : la soustraction de deux infinis rendrait NaN. Le bord borde garantit un
// pixel de fond sur chaque ligne et chaque colonne, donc aucune distance ne reste a cette valeur.
const LOIN = 1e12;

/**
 * Le carre de la distance euclidienne de chaque pixel du trait au centre du pixel de fond le plus proche
 * (0 pour le fond), sur le masque borde. Exacte, en deux passes (colonnes puis lignes), lineaire en pixels.
 */
export function distances2(m: Masque): Float64Array {
  const l = m.pas, h = m.hauteur + 2, cote = Math.max(l, h);
  const sortie = new Float64Array(l * h);
  const f = new Float64Array(cote), d = new Float64Array(cote), v = new Int32Array(cote), z = new Float64Array(cote + 1);
  for (let x = 0; x < l; x++) {
    for (let y = 0; y < h; y++) f[y] = m.bits[y * l + x] ? LOIN : 0;
    distance1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) sortie[y * l + x] = d[y] ?? 0;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) f[x] = sortie[y * l + x] ?? 0;
    distance1d(f, l, d, v, z);
    for (let x = 0; x < l; x++) sortie[y * l + x] = d[x] ?? 0;
  }
  return sortie;
}
