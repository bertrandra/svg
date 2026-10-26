// Les octets et les dimensions d'une image integree (ADR-0012, annexe 4 partie C, etape 12), lus sans decodeur : le base64 d'une
// adresse `data:` decode a la main, puis la largeur et la hauteur prises dans l'en-tete (IHDR du PNG, SOF du JPEG, ecran logique du
// GIF, VP8/VP8L/VP8X du WebP). C'est ce qui permet de refuser la bombe de decompression (un PNG de 200 octets qui annonce
// 65 000 x 65 000 pixels) avant que le decodeur du navigateur ne la voie. La nature se decide sur les octets (natureOctets.ts,
// ADR-0036), jamais sur le type annonce. Pur, sans DOM ; ne leve jamais.

import { natureDesOctets } from '../natureOctets.js';

/** Les natures qu'une image integree peut avoir : celles que tout lecteur de SVG dessine. */
export type NatureImageIntegree = 'png' | 'jpeg' | 'gif' | 'webp';

export interface DimensionsImage { readonly nature: NatureImageIntegree; readonly l: number; readonly h: number }

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const VALEURS: Int16Array = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) t[ALPHABET.charCodeAt(i)] = i;
  return t;
})();

/**
 * Les octets d'un texte base64 sans blanc (les blancs se retirent avant) ; null s'il n'en est pas un : longueur non multiple de 4,
 * caractere hors de l'alphabet, « = » ailleurs qu'a la fin. Lineaire.
 */
export function decoderBase64(b64: string): Uint8Array | null {
  const n = b64.length;
  if (n === 0 || n % 4 !== 0) return null;
  const remplissage = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((n / 4) * 3 - remplissage);
  // Le « = » final compte pour zero ; ailleurs, il est hors de l'alphabet.
  const valeur = (i: number): number => {
    const c = b64.charCodeAt(i);
    if (c === 61 && i >= n - remplissage) return 0;
    return c < 128 ? (VALEURS[c] ?? -1) : -1;
  };
  let o = 0;
  for (let i = 0; i < n; i += 4) {
    const a = valeur(i), b = valeur(i + 1), c = valeur(i + 2), d = valeur(i + 3);
    if (a < 0 || b < 0 || c < 0 || d < 0) return null;
    const triple = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < out.length) out[o++] = (triple >> 16) & 0xff;
    if (o < out.length) out[o++] = (triple >> 8) & 0xff;
    if (o < out.length) out[o++] = triple & 0xff;
  }
  return out;
}

/** La taille en octets d'un base64 sans blanc, sans le decoder. */
export const octetsBase64 = (b64: string): number => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

const be16 = (o: Uint8Array, i: number): number => ((o[i] ?? 0) << 8) | (o[i + 1] ?? 0);
const be32 = (o: Uint8Array, i: number): number => (((o[i] ?? 0) << 24) >>> 0) + (((o[i + 1] ?? 0) << 16) | ((o[i + 2] ?? 0) << 8) | (o[i + 3] ?? 0));
const le16 = (o: Uint8Array, i: number): number => (o[i] ?? 0) | ((o[i + 1] ?? 0) << 8);
const le24 = (o: Uint8Array, i: number): number => (o[i] ?? 0) | ((o[i + 1] ?? 0) << 8) | ((o[i + 2] ?? 0) << 16);
const texte4 = (o: Uint8Array, i: number): string => String.fromCharCode(o[i] ?? 0, o[i + 1] ?? 0, o[i + 2] ?? 0, o[i + 3] ?? 0);

function png(o: Uint8Array): readonly [number, number] | null {
  // Le premier bloc d'un PNG est IHDR, de 13 octets : largeur et hauteur en gros-boutiste, 1 a 2^31 - 1.
  if (o.length < 24 || be32(o, 8) !== 13 || texte4(o, 12) !== 'IHDR') return null;
  return [be32(o, 16), be32(o, 20)];
}

function gif(o: Uint8Array): readonly [number, number] | null {
  return o.length < 10 ? null : [le16(o, 6), le16(o, 8)];
}

/** Les marqueurs SOF qui portent les dimensions (C4 DHT, C8 JPG et CC DAC n'en sont pas). */
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function jpeg(o: Uint8Array): readonly [number, number] | null {
  // Les segments se suivent par leur longueur : chaque tour avance d'au moins deux octets, la boucle est bornee par la taille.
  let i = 2;
  while (i + 3 < o.length) {
    if (o[i] !== 0xff) return null;
    let m = o[i + 1] ?? 0;
    // Des octets de remplissage 0xFF peuvent preceder un marqueur.
    while (m === 0xff && i + 2 < o.length) { i++; m = o[i + 1] ?? 0; }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    // Le debut des donnees (SOS) ou la fin (EOI) sans trame : pas de dimensions.
    if (m === 0xda || m === 0xd9) return null;
    const longueur = be16(o, i + 2);
    if (longueur < 2) return null;
    if (SOF.has(m)) return i + 8 < o.length ? [be16(o, i + 7), be16(o, i + 5)] : null;
    i += 2 + longueur;
  }
  return null;
}

function webp(o: Uint8Array): readonly [number, number] | null {
  if (o.length < 30) return null;
  const bloc = texte4(o, 12);
  // VP8 (avec perte) : le code de depart 9D 01 2A, puis largeur et hauteur sur 14 bits.
  if (bloc === 'VP8 ') return o[23] === 0x9d && o[24] === 0x01 && o[25] === 0x2a ? [le16(o, 26) & 0x3fff, le16(o, 28) & 0x3fff] : null;
  // VP8L (sans perte) : la signature 0x2F, puis largeur - 1 et hauteur - 1 sur 14 bits chacune.
  if (bloc === 'VP8L') {
    if (o[20] !== 0x2f) return null;
    const b = (o[21] ?? 0) | ((o[22] ?? 0) << 8) | ((o[23] ?? 0) << 16) | ((o[24] ?? 0) << 24);
    return [(b & 0x3fff) + 1, ((b >>> 14) & 0x3fff) + 1];
  }
  // VP8X (etendu) : la toile, largeur - 1 et hauteur - 1 sur 24 bits.
  if (bloc === 'VP8X') return [le24(o, 24) + 1, le24(o, 27) + 1];
  return null;
}

/**
 * La nature et les dimensions (en pixels) d'une image, lues dans son en-tete ; null si les octets ne sont pas ceux d'un PNG, d'un
 * JPEG, d'un GIF ou d'un WebP, ou si l'en-tete ne donne pas des dimensions non nulles.
 */
export function dimensionsImage(o: Uint8Array): DimensionsImage | null {
  const nature = natureDesOctets(o);
  const lu = nature === 'png' ? png(o) : nature === 'jpeg' ? jpeg(o) : nature === 'gif' ? gif(o) : nature === 'webp' ? webp(o) : null;
  if (!lu || (nature !== 'png' && nature !== 'jpeg' && nature !== 'gif' && nature !== 'webp')) return null;
  const [l, h] = lu;
  return l > 0 && h > 0 ? { nature, l, h } : null;
}
