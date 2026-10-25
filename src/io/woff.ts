// Une fonte WOFF (1.0) redevient une fonte sfnt (TrueType ou OpenType) : les lecteurs de tables du projet (crenage GPOS,
// ligatures GSUB) lisent le repertoire sfnt, et le catalogue telechargeable sert du WOFF (ADR-0025 ; opentype.js ne lit pas le
// WOFF2, qu'on ne telecharge donc jamais). Chaque table compressee se decompresse par zlib (DecompressionStream, io/pdf.ts),
// bornee a la taille que le repertoire annonce. Tout ce qui sort des bornes est refuse, jamais lu « au mieux ».

import { decompresserZlib } from './pdf.js';

/** Les bornes d'un fichier WOFF : au-dela, ce n'est pas une fonte de texte qu'on telecharge pour composer. */
export const LIMITES_WOFF = { tables: 256, octets: 32 * 1024 * 1024 } as const;

const SIGNATURE_WOFF = 0x774f4646;
const SFNT = new Set([0x00010000, 0x4f54544f, 0x74727565]);

/** Le type d'un fichier de fonte d'apres sa signature. */
export function genreFonte(o: Uint8Array): 'woff' | 'woff2' | 'sfnt' | null {
  if (o.length < 12) return null;
  const s = new DataView(o.buffer, o.byteOffset, o.byteLength).getUint32(0);
  return s === SIGNATURE_WOFF ? 'woff' : s === 0x774f4632 ? 'woff2' : SFNT.has(s) ? 'sfnt' : null;
}

/** Les octets sfnt d'une fonte WOFF ou deja sfnt, ou la raison de la refuser. */
export async function enSfnt(o: Uint8Array): Promise<ArrayBuffer | { erreur: string }> {
  const genre = genreFonte(o);
  if (genre === 'sfnt') return o.slice().buffer;
  if (genre === 'woff2') return { erreur: 'ce fichier est en WOFF2, que l’éditeur ne sait pas lire' };
  if (genre !== 'woff') return { erreur: 'ce fichier n’est pas une fonte (ni WOFF, ni TTF, ni OTF)' };
  const v = new DataView(o.buffer, o.byteOffset, o.byteLength);
  try {
    const saveur = v.getUint32(4), n = v.getUint16(12), total = v.getUint32(16);
    if (!SFNT.has(saveur) || n < 1 || n > LIMITES_WOFF.tables || total > LIMITES_WOFF.octets || 44 + n * 20 > o.length) return { erreur: 'en-tête WOFF invalide' };
    const entrees: Array<{ etiquette: number; decalage: number; compresse: number; longueur: number; somme: number }> = [];
    for (let i = 0; i < n; i++) {
      const p = 44 + i * 20;
      entrees.push({ etiquette: v.getUint32(p), decalage: v.getUint32(p + 4), compresse: v.getUint32(p + 8), longueur: v.getUint32(p + 12), somme: v.getUint32(p + 16) });
    }
    const aligne = (x: number) => (x + 3) & ~3;
    let taille = 12 + n * 16;
    for (const e of entrees) {
      if (e.decalage + e.compresse > o.length || e.compresse > e.longueur || e.longueur > LIMITES_WOFF.octets) return { erreur: 'table WOFF hors du fichier' };
      taille += aligne(e.longueur);
    }
    if (taille > LIMITES_WOFF.octets) return { erreur: 'fonte WOFF trop grande' };
    const sortie = new Uint8Array(taille), w = new DataView(sortie.buffer);
    // L'en-tete sfnt : le nombre de tables et les trois valeurs de recherche binaire que la norme en deduit.
    let puissance = 1, log = 0;
    while (puissance * 2 <= n) { puissance *= 2; log++; }
    w.setUint32(0, saveur); w.setUint16(4, n); w.setUint16(6, puissance * 16); w.setUint16(8, log); w.setUint16(10, n * 16 - puissance * 16);
    let position = 12 + n * 16;
    for (let i = 0; i < n; i++) {
      const e = entrees[i] as (typeof entrees)[number];
      const brut = o.subarray(e.decalage, e.decalage + e.compresse);
      let table: Uint8Array;
      if (e.compresse < e.longueur) {
        const d = await decompresserZlib(brut, e.longueur);
        if (d === 'indisponible') return { erreur: 'ce navigateur ne sait pas décompresser une fonte WOFF (DecompressionStream manque)' };
        if (typeof d === 'string' || d.length !== e.longueur) return { erreur: 'table WOFF illisible' };
        table = d;
      } else table = brut;
      const r = 12 + i * 16;
      w.setUint32(r, e.etiquette); w.setUint32(r + 4, e.somme); w.setUint32(r + 8, position); w.setUint32(r + 12, e.longueur);
      sortie.set(table, position);
      position += aligne(e.longueur);
    }
    return sortie.buffer;
  } catch {
    return { erreur: 'fonte WOFF illisible' };
  }
}
