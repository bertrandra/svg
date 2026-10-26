// Un GIF decode sans le navigateur (ADR-0012, etape 13a) : la premiere image seulement (un navigateur anime les suivantes ; le PDF
// n'anime rien, c'est dit), posee sur l'ecran logique, son index transparent en alpha, sa table de couleurs deroulee. La
// decompression LZW est ecrite ici, bornee par la taille de l'image : un flux hostile ne produit jamais plus de pixels que l'en-tete
// n'en annonce. Pur, sans DOM ; ne leve jamais (un GIF abime rend null).

import type { Pixels } from './png.js';

export interface GifDecode extends Pixels {
  /** Vrai si le fichier porte plus d'une image (une animation) : seule la premiere est rendue. */
  readonly anime: boolean;
}

const le16 = (o: Uint8Array, i: number): number => (o[i] ?? 0) | ((o[i + 1] ?? 0) << 8);

/** Les sous-blocs de donnees a partir de `i`, mis bout a bout, et la position qui les suit. */
function sousBlocs(o: Uint8Array, i: number): { donnees: Uint8Array; suite: number } {
  const morceaux: Uint8Array[] = [];
  let total = 0;
  while (i < o.length) {
    const n = o[i] ?? 0;
    i++;
    if (n === 0) break;
    morceaux.push(o.subarray(i, Math.min(o.length, i + n)));
    total += Math.min(n, o.length - i);
    i += n;
  }
  const donnees = new Uint8Array(total);
  let k = 0;
  for (const m of morceaux) { donnees.set(m, k); k += m.length; }
  return { donnees, suite: i };
}

/** La decompression LZW d'un GIF (codes de taille variable, du poids faible au poids fort), au plus `max` index. */
function lzw(d: Uint8Array, tailleMin: number, max: number): Uint8Array {
  const out = new Uint8Array(max);
  if (tailleMin < 2 || tailleMin > 8) return out;
  const effacer = 1 << tailleMin, finCode = effacer + 1;
  const prefixe = new Int32Array(4096), suffixe = new Uint8Array(4096), premier = new Uint8Array(4096), longueur = new Uint16Array(4096);
  for (let c = 0; c < effacer; c++) { prefixe[c] = -1; suffixe[c] = c; premier[c] = c; longueur[c] = 1; }
  let taille = tailleMin + 1, suivant = finCode + 1, ancien = -1, n = 0;
  let acc = 0, nbits = 0, i = 0;
  while (n < max) {
    while (nbits < taille && i < d.length) { acc |= (d[i++] ?? 0) << nbits; nbits += 8; }
    if (nbits < taille) break;
    const code = acc & ((1 << taille) - 1);
    acc >>>= taille; nbits -= taille;
    if (code === effacer) { taille = tailleMin + 1; suivant = finCode + 1; ancien = -1; continue; }
    if (code === finCode) break;
    if (ancien === -1) {
      if (code >= effacer) break;
      out[n++] = code;
      ancien = code;
      continue;
    }
    // Le code connu donne son premier caractere a l'entree nouvelle ; le code suivant (KwKwK) est l'ancien plus son premier.
    let k: number;
    if (code < suivant) k = premier[code] ?? 0;
    else if (code === suivant) k = premier[ancien] ?? 0;
    else break;
    if (suivant < 4096) {
      prefixe[suivant] = ancien; suffixe[suivant] = k; premier[suivant] = premier[ancien] ?? 0; longueur[suivant] = (longueur[ancien] ?? 0) + 1;
      suivant++;
      if (suivant === 1 << taille && taille < 12) taille++;
    }
    // La chaine du code, ecrite depuis sa fin ; ce qui deborde de l'image est perdu.
    const len = longueur[code] ?? 0;
    for (let j = n + len - 1, p = code; p >= 0 && j >= n; j--) { if (j < max) out[j] = suffixe[p] ?? 0; p = prefixe[p] ?? -1; }
    n += len;
    ancien = code;
  }
  return out;
}

/**
 * La premiere image d'un GIF sur son ecran logique : RVB, et l'alpha si un index est transparent ou si l'image ne couvre pas tout
 * l'ecran (le fond d'un GIF dans une page est transparent). null si les octets ne sont pas un GIF lisible.
 */
export function decoderGif(o: Uint8Array): GifDecode | null {
  if (o.length < 13 || !/^GIF8[79]a$/.test(String.fromCharCode(...o.subarray(0, 6)))) return null;
  const L = le16(o, 6), H = le16(o, 8), drapeaux = o[10] ?? 0;
  if (!(L > 0 && H > 0)) return null;
  let i = 13;
  let globale: Uint8Array | null = null;
  if (drapeaux & 0x80) { const n = 3 << ((drapeaux & 7) + 1); globale = o.subarray(i, i + n); i += n; }
  let transparent = -1, images = 0;
  let resultat: Omit<GifDecode, 'anime'> | null = null;
  while (i < o.length) {
    const b = o[i] ?? 0;
    if (b === 0x3b) break;
    if (b === 0x21) {
      const etiquette = o[i + 1] ?? 0;
      // L'extension de controle graphique : l'index transparent de l'image qui suit.
      if (etiquette === 0xf9 && !resultat && (o[i + 2] ?? 0) >= 4) transparent = (o[i + 3] ?? 0) & 1 ? (o[i + 6] ?? 0) : -1;
      i = sousBlocs(o, i + 2).suite;
      continue;
    }
    if (b !== 0x2c) return resultat ? { ...resultat, anime: images > 1 } : null;
    images++;
    const x0 = le16(o, i + 1), y0 = le16(o, i + 3), w = le16(o, i + 5), h = le16(o, i + 7), d = o[i + 9] ?? 0;
    i += 10;
    let table = globale;
    if (d & 0x80) { const n = 3 << ((d & 7) + 1); table = o.subarray(i, i + n); i += n; }
    const tailleMin = o[i] ?? 0;
    const { donnees, suite } = sousBlocs(o, i + 1);
    i = suite;
    if (resultat) continue;
    if (!table || !(w > 0 && h > 0)) return null;
    const index = lzw(donnees, tailleMin, w * h);
    const couleur = new Uint8Array(L * H * 3), alpha = new Uint8Array(L * H);
    // Les lignes d'une image entrelacee arrivent par passes : 0, 4, 2, 1 (tous les 8, 8, 4, 2).
    const ordre: number[] = [];
    if (d & 0x40) for (const [debut, pas] of [[0, 8], [4, 8], [2, 4], [1, 2]] as const) for (let y = debut; y < h; y += pas) ordre.push(y);
    else for (let y = 0; y < h; y++) ordre.push(y);
    ordre.forEach((y, rang) => {
      const Y = y0 + y;
      if (Y >= H) return;
      for (let x = 0; x < w; x++) {
        const X = x0 + x;
        if (X >= L) continue;
        const v = index[rang * w + x] ?? 0, px = Y * L + X;
        if (v === transparent || 3 * v + 2 >= table.length) continue;
        couleur[px * 3] = table[3 * v] ?? 0; couleur[px * 3 + 1] = table[3 * v + 1] ?? 0; couleur[px * 3 + 2] = table[3 * v + 2] ?? 0;
        alpha[px] = 255;
      }
    });
    resultat = { l: L, h: H, canaux: 3, couleur, alpha: alpha.every(a => a === 255) ? null : alpha };
  }
  return resultat ? { ...resultat, anime: images > 1 } : null;
}
