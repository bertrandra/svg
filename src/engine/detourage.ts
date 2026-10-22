// Retirer le fond d'une image matricielle : les pixels de la couleur du bord deviennent
// transparents. Pur : un tableau RGBA en entree, modifie en place, un compte en sortie. Deux
// portees : depuis le bord, par propagation, un blanc au coeur du dessin (l'oeil d'une lettre
// fermee, un aplat) reste ; sur toute l'image, chaque pixel de cette couleur s'efface, ou qu'il
// soit, pour une transparence complete.

import { ecartPercu, versHex, type Rgb } from '../util/couleur.js';

export interface Detourage {
  /** La couleur de fond retiree. */
  fond: string;
  /** Les pixels rendus transparents. */
  retires: number;
  /** La part de l'image retiree, de 0 a 1. */
  part: number;
}

/** Au-dela de cet ecart percu avec le bord, un pixel n'est plus du fond. */
export const TOLERANCE_DEFAUT = 0.08;

/** Ou le fond s'efface : `bord`, les pixels relies au pourtour ; `partout`, chaque pixel de cette couleur. */
export type PorteeDetourage = 'bord' | 'partout';

const lire = (p: Uint8ClampedArray, i: number): Rgb => ({ r: p[i * 4] ?? 0, g: p[i * 4 + 1] ?? 0, b: p[i * 4 + 2] ?? 0 });

/** La couleur la plus frequente sur le pourtour : le fond, s'il y en a un. */
export function couleurDuBord(pixels: Uint8ClampedArray, largeur: number, hauteur: number): Rgb {
  const comptes = new Map<string, { rgb: Rgb; n: number }>();
  const voir = (i: number) => {
    if ((pixels[i * 4 + 3] ?? 0) < 128) return;
    const rgb = lire(pixels, i), cle = versHex(rgb);
    const e = comptes.get(cle);
    if (e) e.n++; else comptes.set(cle, { rgb, n: 1 });
  };
  for (let x = 0; x < largeur; x++) { voir(x); voir((hauteur - 1) * largeur + x); }
  for (let y = 1; y < hauteur - 1; y++) { voir(y * largeur); voir(y * largeur + largeur - 1); }
  let meilleur: { rgb: Rgb; n: number } | null = null;
  for (const e of [...comptes.values()].sort((a, b) => b.n - a.n || versHex(a.rgb).localeCompare(versHex(b.rgb)))) { meilleur = e; break; }
  return meilleur?.rgb ?? { r: 255, g: 255, b: 255 };
}

/**
 * Rend transparents les pixels du fond, en place. Le fond est la couleur du bord, a `tolerance`
 * pres (ecart percu) : propagee depuis chaque pixel du pourtour vers ses voisins de meme couleur
 * (`bord`), ou effacee ou qu'elle soit (`partout`). Une image deja transparente sur ses bords n'est
 * pas touchee.
 */
export function detourer(pixels: Uint8ClampedArray, largeur: number, hauteur: number, tolerance = TOLERANCE_DEFAUT, portee: PorteeDetourage = 'bord'): Detourage {
  const fond = couleurDuBord(pixels, largeur, hauteur);
  const n = largeur * hauteur;
  const estFond = (i: number) => (pixels[i * 4 + 3] ?? 0) >= 128 && ecartPercu(lire(pixels, i), fond) <= tolerance;
  if (portee === 'partout') {
    let retires = 0;
    for (let i = 0; i < n; i++) if (estFond(i)) { pixels[i * 4 + 3] = 0; retires++; }
    return { fond: versHex(fond), retires, part: n ? Math.round((retires / n) * 1000) / 1000 : 0 };
  }
  const vu = new Uint8Array(n);
  const pile: number[] = [];
  const pousser = (i: number) => { if (!vu[i] && estFond(i)) { vu[i] = 1; pile.push(i); } };
  for (let x = 0; x < largeur; x++) { pousser(x); pousser((hauteur - 1) * largeur + x); }
  for (let y = 0; y < hauteur; y++) { pousser(y * largeur); pousser(y * largeur + largeur - 1); }
  let retires = 0;
  while (pile.length) {
    const i = pile.pop() ?? 0;
    pixels[i * 4 + 3] = 0;
    retires++;
    const x = i % largeur, y = (i - x) / largeur;
    if (x > 0) pousser(i - 1);
    if (x < largeur - 1) pousser(i + 1);
    if (y > 0) pousser(i - largeur);
    if (y < hauteur - 1) pousser(i + largeur);
  }
  return { fond: versHex(fond), retires, part: n ? Math.round((retires / n) * 1000) / 1000 : 0 };
}
