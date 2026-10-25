// Les filtres d'un flux (ISO 32000-1, 7.4) : ce qui ramene ses octets bruts a ses octets lisibles. FlateDecode (zlib) est le
// seul qui compte vraiment ; sa decompression vient du dehors (`Decompression`, faite par le navigateur dans `io/pdf.ts`). Les
// filtres de texte (ASCIIHex, ASCII85) et RunLength sont ecrits ici, purs. LZW, et les compressions d'image (DCT, JPX, JBIG2,
// CCITT) ne servent pas a un trace : un flux de contenu qui les emploie est refuse en le nommant. Toute sortie compte dans le
// budget de decompression (LIMITES_PDF.decompresses), RunLength et ASCII85 compris, qui multiplient aussi.

import { LIMITES_PDF, RefusPdf, SyntaxePdf, type Decompression, enFrancais } from './limites.js';
import { estNombre, type Dict } from './objets.js';
import { estBlanc } from './lexique.js';

/** Le budget de decompression d'une lecture : la sortie de chaque flux, comptee une fois meme si la lecture reprend. */
export interface Budget { readonly parCle: Map<number, number>; total: number }

export const nouveauBudget = (): Budget => ({ parCle: new Map(), total: 0 });

/** Ce qu'il faut pour decoder : la decompression injectee et le budget. */
export interface Decodage { readonly decompresser: Decompression; readonly budget: Budget }

const NOMS_FILTRES: Readonly<Record<string, string>> = {
  Fl: 'FlateDecode', AHx: 'ASCIIHexDecode', A85: 'ASCII85Decode', LZW: 'LZWDecode', RL: 'RunLengthDecode', CCF: 'CCITTFaxDecode', DCT: 'DCTDecode'
};

/** Le nom long d'un filtre (les abreviations viennent des images en ligne). */
export const nomFiltre = (f: string): string => NOMS_FILTRES[f] ?? f;

function compter(d: Decodage, cle: number, n: number): void {
  if (!d.budget.parCle.has(cle)) { d.budget.parCle.set(cle, n); d.budget.total += n; }
  if (d.budget.total > LIMITES_PDF.decompresses) throw refusTrop();
}

const refusTrop = (): RefusPdf => new RefusPdf('Ce PDF se décompresse en plus de ' + enFrancais(LIMITES_PDF.decompresses / 1048576) + ' Mo : il est trop lourd pour être lu ici (ou c’est une bombe de décompression).');

/**
 * Les octets lisibles d'un flux : chaque filtre dans l'ordre, puis son predicteur. `cle` nomme le flux (sa position dans le
 * fichier) ; chaque etape a sa propre cle derivee, pour que deux FlateDecode enchaines ne se confondent pas.
 */
export function decoder(brut: Uint8Array, filtres: readonly string[], params: readonly (Dict | null)[], cle: number, d: Decodage): Uint8Array {
  if (filtres.length > LIMITES_PDF.filtres) throw new RefusPdf('Ce PDF enchaîne plus de ' + LIMITES_PDF.filtres + ' filtres sur un même flux : il ne se lit pas ici.');
  let octets = brut;
  filtres.forEach((f, i) => {
    const k = cle * 16 + i, p = params[i] ?? null;
    switch (nomFiltre(f)) {
      case 'FlateDecode': octets = predire(inflater(octets, k, d), p); break;
      case 'ASCIIHexDecode': octets = asciiHex(octets); break;
      case 'ASCII85Decode': octets = ascii85(octets); break;
      case 'RunLengthDecode': octets = runLength(octets); break;
      case 'LZWDecode': throw new RefusPdf('Ce PDF emploie la compression LZW, un format ancien que cette page ne lit pas : réenregistrez-le depuis un logiciel récent, puis rouvrez-le.');
      case 'Crypt': throw new RefusPdf('Ce PDF est chiffré : il ne s’ouvre pas ici. Enregistrez-en une copie sans protection, puis rouvrez-la.');
      case 'DCTDecode': case 'JPXDecode': case 'JBIG2Decode': case 'CCITTFaxDecode':
        throw new RefusPdf('Ce PDF dessine sa page avec une compression d’image (' + nomFiltre(f) + ') : il ne contient pas de tracé lisible ici.');
      default: throw new RefusPdf('Ce PDF emploie un filtre inconnu (« ' + f.slice(0, 40) + ' ») : il ne se lit pas ici.');
    }
    if (nomFiltre(f) !== 'FlateDecode') compter(d, k, octets.length);
  });
  return octets;
}

function inflater(brut: Uint8Array, cle: number, d: Decodage): Uint8Array {
  const reste = LIMITES_PDF.decompresses - d.budget.total + (d.budget.parCle.get(cle) ?? 0);
  const r = d.decompresser(brut, Math.max(0, reste), cle);
  if (r === 'trop') throw refusTrop();
  if (r === 'indisponible') throw new RefusPdf('Ce navigateur ne sait pas décompresser les flux de ce PDF (DecompressionStream manque) : ouvrez-le dans un navigateur récent.');
  if (r === 'illisible') throw new SyntaxePdf('un flux compressé est illisible');
  compter(d, cle, r.length);
  return r;
}

/** Le predicteur d'un flux FlateDecode (7.4.4.4) : PNG (10 a 15) ou TIFF 2, sur des composantes de 8 bits. */
function predire(octets: Uint8Array, p: Dict | null): Uint8Array {
  const predicteur = p ? p.get('Predictor') : undefined;
  if (!estNombre(predicteur) || predicteur <= 1) return octets;
  const lire = (cle: string, defaut: number) => { const v = p?.get(cle); return estNombre(v) ? Math.floor(v) : defaut; };
  const couleurs = lire('Colors', 1), bits = lire('BitsPerComponent', 8), colonnes = lire('Columns', 1);
  if (couleurs < 1 || couleurs > 32 || colonnes < 1 || colonnes > 1 << 20 || ![1, 2, 4, 8, 16].includes(bits)) throw new SyntaxePdf('un prédicteur aux paramètres invalides');
  const pixel = Math.max(1, Math.ceil((couleurs * bits) / 8)), ligne = Math.ceil((couleurs * bits * colonnes) / 8);
  if (predicteur === 2) {
    if (bits !== 8) throw new SyntaxePdf('un prédicteur TIFF sur des composantes de ' + bits + ' bits');
    const out = Uint8Array.from(octets);
    for (let i = 0; i < out.length; i++) if (i % ligne >= pixel) out[i] = ((out[i] ?? 0) + (out[i - pixel] ?? 0)) & 0xff;
    return out;
  }
  return predirePng(octets, ligne, pixel);
}

function predirePng(octets: Uint8Array, ligne: number, pixel: number): Uint8Array {
  const lignes = Math.floor(octets.length / (ligne + 1));
  const out = new Uint8Array(lignes * ligne);
  for (let y = 0; y < lignes; y++) {
    const type = octets[y * (ligne + 1)] ?? 0, src = y * (ligne + 1) + 1, dst = y * ligne;
    for (let x = 0; x < ligne; x++) {
      const brut = octets[src + x] ?? 0;
      const a = x >= pixel ? out[dst + x - pixel] ?? 0 : 0, b = y > 0 ? out[dst - ligne + x] ?? 0 : 0;
      const c = x >= pixel && y > 0 ? out[dst - ligne + x - pixel] ?? 0 : 0;
      let v = brut;
      if (type === 1) v = brut + a;
      else if (type === 2) v = brut + b;
      else if (type === 3) v = brut + ((a + b) >> 1);
      else if (type === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v = brut + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      out[dst + x] = v & 0xff;
    }
  }
  return out;
}

function asciiHex(octets: Uint8Array): Uint8Array {
  const out = new Uint8Array(Math.ceil(octets.length / 2));
  let n = 0, moitie = -1;
  for (const c of octets) {
    if (c === 62) break;
    const v = c >= 48 && c <= 57 ? c - 48 : c >= 65 && c <= 70 ? c - 55 : c >= 97 && c <= 102 ? c - 87 : -1;
    if (v < 0) { if (estBlanc(c)) continue; throw new SyntaxePdf('un flux ASCIIHex porte un caractère étranger'); }
    if (moitie < 0) moitie = v; else { out[n++] = moitie * 16 + v; moitie = -1; }
  }
  if (moitie >= 0) out[n++] = moitie * 16;
  return out.subarray(0, n);
}

function ascii85(octets: Uint8Array): Uint8Array {
  // Au plus quatre octets par caractere (« z ») : la sortie se borne a l'avance.
  const out = new Uint8Array(octets.length * 4);
  let n = 0, groupe = 0, compte = 0;
  for (let i = 0; i < octets.length; i++) {
    const c = octets[i] ?? 0;
    if (c === 126) break; // « ~> »
    if (estBlanc(c)) continue;
    if (c === 122 && compte === 0) { out.fill(0, n, n + 4); n += 4; continue; }
    if (c < 33 || c > 117) throw new SyntaxePdf('un flux ASCII85 porte un caractère étranger');
    groupe = groupe * 85 + (c - 33);
    if (++compte === 5) {
      out[n++] = (groupe >>> 24) & 255; out[n++] = (groupe >>> 16) & 255; out[n++] = (groupe >>> 8) & 255; out[n++] = groupe & 255;
      groupe = 0; compte = 0;
    }
  }
  if (compte > 1) {
    for (let k = compte; k < 5; k++) groupe = groupe * 85 + 84;
    for (let k = 0; k < compte - 1; k++) out[n++] = (groupe >>> (24 - 8 * k)) & 255;
  }
  return out.subarray(0, n);
}

function runLength(octets: Uint8Array): Uint8Array {
  // Deux passes : la premiere mesure (et borne) la sortie, la seconde l'ecrit dans un tableau d'octets alloue une fois.
  let taille = 0;
  for (let i = 0; i < octets.length;) {
    const l = octets[i] ?? 128;
    if (l === 128) break;
    if (l < 128) { taille += Math.min(l + 1, octets.length - i - 1); i += l + 2; } else { taille += 257 - l; i += 2; }
    if (taille > LIMITES_PDF.decompresses) throw refusTrop();
  }
  const out = new Uint8Array(taille);
  let n = 0;
  for (let i = 0; i < octets.length && n < taille;) {
    const l = octets[i++] ?? 128;
    if (l === 128) break;
    if (l < 128) { for (let k = 0; k <= l && i < octets.length; k++) out[n++] = octets[i++] ?? 0; }
    else { out.fill(octets[i++] ?? 0, n, n + 257 - l); n += 257 - l; }
  }
  return out.subarray(0, n);
}
