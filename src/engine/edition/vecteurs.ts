// Les petits calculs de vecteurs du plan que les outils de trace (angles, nœuds) partagent. Rien que des
// + - * / et des racines carrees : le resultat est le meme sur tout moteur.

export type Pt = readonly [number, number];

export const moins = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
export const plus = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
export const fois = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
export const scalaire = (a: Pt, b: Pt): number => a[0] * b[0] + a[1] * b[1];
export const vectoriel = (a: Pt, b: Pt): number => a[0] * b[1] - a[1] * b[0];
export const norme = (a: Pt): number => Math.sqrt(a[0] * a[0] + a[1] * a[1]);
export const unitaire = (a: Pt): Pt => { const n = norme(a); return n > 0 ? [a[0] / n, a[1] / n] : [0, 0]; };
/** Le vecteur tourne d'un quart de tour : (x, y) devient (-y, x). */
export const quart = (a: Pt): Pt => [-a[1], a[0]];
export const milieu = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
