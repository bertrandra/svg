// Ce qu'un PDF doit savoir d'un JPEG pour l'ecrire tel quel en `/DCTDecode` (ADR-0012, etape 13a) : ses dimensions, son nombre de
// composantes (gris, RVB, CMJN), sa precision, son codage (le PDF lit le JPEG de base et progressif de huit bits ; ni l'arithmetique,
// ni le sans perte, ni douze bits), le marqueur Adobe (un CMJN d'Adobe est ecrit inverse) et l'orientation EXIF (que le navigateur
// applique a l'affichage). Rien n'est decode : les octets passent tels quels. Pur, sans DOM ; ne leve jamais.

export interface JpegLu {
  readonly l: number;
  readonly h: number;
  readonly composantes: 1 | 3 | 4;
  /** Faux pour un codage que le PDF ne lit pas (arithmetique, sans perte, hierarchique, plus de huit bits). */
  readonly lisible: boolean;
  /** Le marqueur APP14 « Adobe » est present (un CMJN y est inverse). */
  readonly adobe: boolean;
  /** L'orientation EXIF, 1 a 8 ; 1 sans EXIF. */
  readonly orientation: number;
}

const be16 = (o: Uint8Array, i: number): number => ((o[i] ?? 0) << 8) | (o[i + 1] ?? 0);

/** L'orientation d'un bloc EXIF (« Exif\0\0 » puis un en-tete TIFF), 1 faute de mieux. */
function orientationExif(o: Uint8Array, debut: number, fin: number): number {
  const t = debut + 6;
  if (fin - debut < 14 || String.fromCharCode(o[debut] ?? 0, o[debut + 1] ?? 0, o[debut + 2] ?? 0, o[debut + 3] ?? 0) !== 'Exif') return 1;
  const petit = o[t] === 0x49 && o[t + 1] === 0x49, grand = o[t] === 0x4d && o[t + 1] === 0x4d;
  if (!petit && !grand) return 1;
  const u16 = (i: number) => (petit ? (o[i] ?? 0) | ((o[i + 1] ?? 0) << 8) : be16(o, i));
  const u32 = (i: number) => (petit ? (u16(i) | (u16(i + 2) << 16)) >>> 0 : ((be16(o, i) << 16) | be16(o, i + 2)) >>> 0);
  const ifd = t + u32(t + 4);
  if (ifd + 2 > fin) return 1;
  const n = u16(ifd);
  for (let k = 0; k < n && ifd + 2 + 12 * (k + 1) <= fin; k++) {
    const e = ifd + 2 + 12 * k;
    if (u16(e) === 0x0112) { const v = u16(e + 8); return v >= 1 && v <= 8 ? v : 1; }
  }
  return 1;
}

/** L'en-tete d'un JPEG ; null si ses segments ne menent a aucune trame. */
export function lireJpeg(o: Uint8Array): JpegLu | null {
  if (o[0] !== 0xff || o[1] !== 0xd8) return null;
  let i = 2, adobe = false, orientation = 1;
  while (i + 3 < o.length) {
    if (o[i] !== 0xff) return null;
    let m = o[i + 1] ?? 0;
    while (m === 0xff && i + 2 < o.length) { i++; m = o[i + 1] ?? 0; }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    if (m === 0xda || m === 0xd9) return null;
    const longueur = be16(o, i + 2);
    if (longueur < 2) return null;
    const debut = i + 4, fin = Math.min(o.length, i + 2 + longueur);
    if (m === 0xee && fin - debut >= 5 && String.fromCharCode(...o.subarray(debut, debut + 5)) === 'Adobe') adobe = true;
    if (m === 0xe1 && orientation === 1) orientation = orientationExif(o, debut, fin);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      const precision = o[debut] ?? 0, h = be16(o, debut + 1), l = be16(o, debut + 3), n = o[debut + 5] ?? 0;
      if (!(l > 0 && h > 0) || (n !== 1 && n !== 3 && n !== 4)) return null;
      return { l, h, composantes: n, lisible: (m === 0xc0 || m === 0xc1 || m === 0xc2) && precision === 8, adobe, orientation };
    }
    i += 2 + longueur;
  }
  return null;
}
