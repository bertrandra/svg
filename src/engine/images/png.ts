// Un PNG lu sans decodeur du navigateur (ADR-0012, etape 13a) : ses blocs (IHDR, PLTE, tRNS, IDAT), puis, une fois ses donnees
// decompressees AILLEURS (la decompression est injectee : `io`), ses lignes defiltrees (les cinq filtres de la specification, et
// l'entrelacement Adam7) en echantillons de huit bits, la couleur d'un cote et l'alpha de l'autre. C'est ce que le PDF ecrit : un
// PNG sans alpha garde son flux tel quel (le PDF sait defiltrer, `/Predictor 15`) ; un PNG a alpha, a transparence par cle, entrelace
// ou a seize bits passe par ici. Pur, sans DOM ; ne leve jamais (un PNG abime rend null).

export interface PngLu {
  readonly l: number;
  readonly h: number;
  /** Bits par echantillon : 1, 2, 4, 8 ou 16. */
  readonly profondeur: number;
  /** 0 gris, 2 RVB, 3 palette, 4 gris et alpha, 6 RVB et alpha. */
  readonly type: 0 | 2 | 3 | 4 | 6;
  readonly entrelace: boolean;
  /** La palette (triplets RVB), pour le type 3. */
  readonly palette: Uint8Array | null;
  /** Le bloc tRNS tel quel : alphas de palette, ou couleur cle (sur deux octets par echantillon). */
  readonly transparence: Uint8Array | null;
  /** Les donnees des blocs IDAT, mises bout a bout : un flux zlib. */
  readonly idat: Uint8Array;
}

/** Les pixels decodes : la couleur (1 ou 3 echantillons de 8 bits par pixel) et l'alpha (1 par pixel), absent s'il est partout plein. */
export interface Pixels {
  readonly l: number;
  readonly h: number;
  readonly canaux: 1 | 3;
  readonly couleur: Uint8Array;
  readonly alpha: Uint8Array | null;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PROFONDEURS: Readonly<Record<number, readonly number[]>> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
const ECHANTILLONS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

const be32 = (o: Uint8Array, i: number): number => (((o[i] ?? 0) << 24) >>> 0) + (((o[i + 1] ?? 0) << 16) | ((o[i + 2] ?? 0) << 8) | (o[i + 3] ?? 0));
const nomBloc = (o: Uint8Array, i: number): string => String.fromCharCode(o[i] ?? 0, o[i + 1] ?? 0, o[i + 2] ?? 0, o[i + 3] ?? 0);

/** Les blocs d'un PNG ; null si ce n'en est pas un, ou si son en-tete est hors de la specification. */
export function lirePng(o: Uint8Array): PngLu | null {
  if (o.length < 33 || SIGNATURE.some((v, i) => o[i] !== v)) return null;
  let l = 0, h = 0, profondeur = 0, type = -1, entrelace = false, vuIhdr = false;
  let palette: Uint8Array | null = null, transparence: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  let total = 0;
  for (let i = 8; i + 12 <= o.length;) {
    const n = be32(o, i), nom = nomBloc(o, i + 4), debut = i + 8, fin = debut + n;
    if (fin + 4 > o.length) break;
    const d = o.subarray(debut, fin);
    if (nom === 'IHDR') {
      if (n !== 13) return null;
      l = be32(d, 0); h = be32(d, 4); profondeur = d[8] ?? 0; type = d[9] ?? -1; entrelace = d[12] === 1;
      if ((d[10] ?? 0) !== 0 || (d[11] ?? 0) !== 0 || (d[12] ?? 0) > 1) return null;
      vuIhdr = true;
    } else if (nom === 'PLTE') palette = d.slice();
    else if (nom === 'tRNS') transparence = d.slice();
    else if (nom === 'IDAT') { idat.push(d); total += d.length; }
    else if (nom === 'IEND') break;
    i = fin + 4;
  }
  if (!vuIhdr || !(l > 0 && h > 0) || !(PROFONDEURS[type] ?? []).includes(profondeur) || !total) return null;
  if (type === 3 && (!palette || palette.length % 3 !== 0 || palette.length === 0)) return null;
  const flux = new Uint8Array(total);
  let k = 0;
  for (const m of idat) { flux.set(m, k); k += m.length; }
  return { l, h, profondeur, type: type as PngLu['type'], entrelace, palette: type === 3 ? palette : null, transparence, idat: flux };
}

/**
 * Vrai si le PDF peut garder le flux tel quel (FlateDecode et `/Predictor 15`) : ni alpha, ni transparence par cle, ni
 * entrelacement, et au plus huit bits (seize bits demandent un PDF 1.5).
 */
export const fluxTelQuel = (p: PngLu): boolean => !p.entrelace && p.transparence === null && p.profondeur <= 8 && (p.type === 0 || p.type === 2 || p.type === 3);

/** Les sept passes d'Adam7 : depart et pas, en colonnes puis en lignes. */
const ADAM7: readonly (readonly [number, number, number, number])[] = [[0, 8, 0, 8], [4, 8, 0, 8], [0, 4, 4, 8], [2, 4, 0, 4], [0, 2, 2, 4], [1, 2, 0, 2], [0, 1, 1, 2]];

const octetsLigne = (p: PngLu, largeur: number): number => Math.ceil((largeur * (ECHANTILLONS[p.type] ?? 1) * p.profondeur) / 8);

/** Les passes (largeur, hauteur, depart et pas) d'une image, une seule sans entrelacement. */
function passes(p: PngLu): { l: number; h: number; x0: number; dx: number; y0: number; dy: number }[] {
  if (!p.entrelace) return [{ l: p.l, h: p.h, x0: 0, dx: 1, y0: 0, dy: 1 }];
  return ADAM7.map(([x0, dx, y0, dy]) => ({ l: Math.ceil((p.l - x0) / dx), h: Math.ceil((p.h - y0) / dy), x0, dx, y0, dy })).map(q => ({ ...q, l: Math.max(0, q.l), h: Math.max(0, q.h) }));
}

/** La taille exacte des donnees decompressees (un octet de filtre par ligne de chaque passe) : la borne de la decompression. */
export function tailleDecompressee(p: PngLu): number {
  return passes(p).reduce((s, q) => s + (q.l && q.h ? q.h * (1 + octetsLigne(p, q.l)) : 0), 0);
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/**
 * Les pixels d'un PNG, ses donnees deja decompressees (`brut`). La couleur en gris ou en RVB sur huit bits (seize bits ramenes a huit
 * par arrondi, une profondeur plus petite etiree a 0..255, une palette deroulee), l'alpha de huit bits (canal alpha, ou transparence
 * par cle et alphas de palette), absent s'il est plein partout. null si les donnees sont courtes ou un filtre inconnu.
 */
export function decoderPng(p: PngLu, brut: Uint8Array): Pixels | null {
  const n = p.l * p.h, canauxEntree = ECHANTILLONS[p.type] ?? 1;
  const gris = p.type === 0 || p.type === 4, canaux: 1 | 3 = gris ? 1 : 3;
  const couleur = new Uint8Array(n * canaux), alpha = new Uint8Array(n).fill(255);
  const bpp = Math.max(1, Math.ceil((canauxEntree * p.profondeur) / 8));
  const maxEch = (1 << Math.min(p.profondeur, 8)) - 1;
  const palette = p.palette, trns = p.transparence;
  // La couleur cle (types 0 et 2), comparee a la valeur brute de l'echantillon.
  const cle = trns && (p.type === 0 || p.type === 2) ? Array.from({ length: p.type === 0 ? 1 : 3 }, (_, i) => ((trns[2 * i] ?? 0) << 8) | (trns[2 * i + 1] ?? 0)) : null;
  let partiel = false;
  let pos = 0;
  for (const q of passes(p)) {
    if (!q.l || !q.h) continue;
    const ol = octetsLigne(p, q.l);
    let prec = new Uint8Array(ol), ligne = new Uint8Array(ol);
    for (let y = 0; y < q.h; y++) {
      if (pos + 1 + ol > brut.length) return null;
      const filtre = brut[pos] ?? 0;
      const src = brut.subarray(pos + 1, pos + 1 + ol);
      pos += 1 + ol;
      for (let i = 0; i < ol; i++) {
        const x = src[i] ?? 0, a = i >= bpp ? (ligne[i - bpp] ?? 0) : 0, b = prec[i] ?? 0, c = i >= bpp ? (prec[i - bpp] ?? 0) : 0;
        let v: number;
        switch (filtre) {
          case 0: v = x; break;
          case 1: v = x + a; break;
          case 2: v = x + b; break;
          case 3: v = x + ((a + b) >> 1); break;
          case 4: v = x + paeth(a, b, c); break;
          default: return null;
        }
        ligne[i] = v & 0xff;
      }
      // Les echantillons de la ligne, puis le pixel.
      const ech = (k: number): number => {
        if (p.profondeur === 8) return ligne[k] ?? 0;
        if (p.profondeur === 16) return ((ligne[2 * k] ?? 0) << 8) | (ligne[2 * k + 1] ?? 0);
        const bit = k * p.profondeur, octet = ligne[bit >> 3] ?? 0;
        return (octet >> (8 - p.profondeur - (bit & 7))) & maxEch;
      };
      const huit = (v: number): number => (p.profondeur === 16 ? Math.round(v / 257) : p.profondeur === 8 ? v : Math.round((v * 255) / maxEch));
      const yy = q.y0 + y * q.dy;
      for (let x = 0; x < q.l; x++) {
        const px = yy * p.l + q.x0 + x * q.dx, k0 = x * canauxEntree;
        if (p.type === 3) {
          const idx = ech(k0);
          couleur[px * 3] = palette?.[idx * 3] ?? 0; couleur[px * 3 + 1] = palette?.[idx * 3 + 1] ?? 0; couleur[px * 3 + 2] = palette?.[idx * 3 + 2] ?? 0;
          if (trns && idx < trns.length) alpha[px] = trns[idx] ?? 255;
        } else if (gris) {
          const g = ech(k0);
          couleur[px] = huit(g);
          if (p.type === 4) alpha[px] = huit(ech(k0 + 1));
          else if (cle && g === cle[0]) alpha[px] = 0;
        } else {
          const r = ech(k0), v = ech(k0 + 1), b = ech(k0 + 2);
          couleur[px * 3] = huit(r); couleur[px * 3 + 1] = huit(v); couleur[px * 3 + 2] = huit(b);
          if (p.type === 6) alpha[px] = huit(ech(k0 + 3));
          else if (cle && r === cle[0] && v === cle[1] && b === cle[2]) alpha[px] = 0;
        }
        if (alpha[px] !== 255) partiel = true;
      }
      [prec, ligne] = [ligne, prec];
    }
  }
  return { l: p.l, h: p.h, canaux, couleur, alpha: partiel ? alpha : null };
}
