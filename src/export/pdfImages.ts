// Les images integrees d'une scene en XObject image PDF (ADR-0012, etape 13a ; ISO 32000-1, 8.9.5). Un JPEG passe tel quel
// (`/DCTDecode`) ; un PNG sans alpha garde son flux compresse (`/FlateDecode` et `/Predictor 15` : le PDF defiltre lui-meme) ; un PNG
// a alpha, a transparence par cle, entrelace ou de seize bits est decode (sa decompression vient de `io`, donnee ici en octets), sa
// couleur et son alpha recompresses a la main (`deflate.ts`), l'alpha en `/SMask` ; un GIF est decode ici (sa premiere image). Un
// WebP n'a pas de decodeur raisonnable en pur : il reste abandonne, et c'est dit. Pur et deterministe.

import { decoderBase64, type ImageIntegree } from '../engine/editionSvg.js';
import type { NoeudScene, Scene } from '../engine/aplatir.js';
import { decoderPng, fluxTelQuel, lirePng, tailleDecompressee, type Pixels } from '../engine/images/png.js';
import { decoderGif } from '../engine/images/gif.js';
import { lireJpeg } from '../engine/images/jpeg.js';
import { natureDesOctets } from '../engine/natureOctets.js';
import { deflateZlib } from './deflate.js';

/** Une image prete a ecrire : son flux, celui de son alpha s'il y en a un, ses dimensions et son orientation EXIF. */
export interface ImagePdf {
  readonly l: number;
  readonly h: number;
  /** 1 a 8 (EXIF) ; 1 hors d'un JPEG. */
  readonly orientation: number;
  /** Le dictionnaire, sans `/SMask` ni `/Length` (le PDF les ajoute). */
  readonly dict: string;
  readonly flux: Uint8Array;
  readonly alpha?: { readonly dict: string; readonly flux: Uint8Array };
  /** Gardee en RVB (le CMJN de l'export ne convertit pas les pixels). */
  readonly rvb: boolean;
}

export interface ImagesPdf {
  readonly parDonnees: ReadonlyMap<string, ImagePdf>;
  /** Ce qui est approche ou perdu, a dire a l'export ; `perdus` en est la part qui ne s'exporte pas. */
  readonly pertes: readonly string[];
  readonly perdus: readonly string[];
}

/** Un flux zlib a decompresser hors du coeur pur (`io`), et la taille exacte qu'il doit rendre. */
export interface FluxADecompresser { readonly donnees: string; readonly flux: Uint8Array; readonly max: number }

export const MSG_IMAGES_PDF = {
  webp: (n: number) => (n === 1 ? 'une image WebP (ce format ne la lit pas : elle n’est pas exportée)' : n + ' images WebP (ce format ne les lit pas : elles ne sont pas exportées)'),
  illisible: (n: number) => (n === 1 ? 'une image illisible (elle n’est pas exportée)' : n + ' images illisibles (elles ne sont pas exportées)'),
  jpeg: (n: number) => (n === 1 ? 'une image JPEG d’un codage que ce format ne lit pas (elle n’est pas exportée)' : n + ' images JPEG d’un codage que ce format ne lit pas (elles ne sont pas exportées)'),
  anime: 'une image GIF animée (seule sa première image est exportée)',
  cmjn: 'les images (gardées en RVB : ce format ne convertit pas leurs pixels en CMJN)'
} as const;

/** Les images d'une scene, contenus de masques et tuiles de motifs compris, chacune une fois (par ses donnees). */
function imagesDe(scene: Scene): ImageIntegree[] {
  const vues = new Map<string, ImageIntegree>();
  const visiter = (n: NoeudScene): void => {
    if (n.genre === 'image') { if (!vues.has(n.source.donnees)) vues.set(n.source.donnees, n.source); return; }
    if (n.genre === 'portee') { n.enfants.forEach(visiter); n.masque?.contenu.noeuds.forEach(visiter); return; }
    // La tuile d'un motif est une scene a son tour.
    for (const p of [n.fond, n.trait]) if (p && 'tuile' in p) p.contenu.noeuds.forEach(visiter);
  };
  scene.noeuds.forEach(visiter);
  return [...vues.values()];
}

const octetsDe = (donnees: string): Uint8Array | null => decoderBase64(donnees.slice(donnees.indexOf(',') + 1));

/** Les flux PNG que l'ecriture doit voir decompresses (`io`, puis `preparerImagesPdf`). */
export function aDecompresser(scene: Scene): FluxADecompresser[] {
  const out: FluxADecompresser[] = [];
  for (const img of imagesDe(scene)) {
    const o = octetsDe(img.donnees), p = o && natureDesOctets(o) === 'png' ? lirePng(o) : null;
    if (p && !fluxTelQuel(p)) out.push({ donnees: img.donnees, flux: p.idat, max: tailleDecompressee(p) });
  }
  return out;
}

const ENTETE = (l: number, h: number) => '/Type /XObject /Subtype /Image /Width ' + l + ' /Height ' + h;

/**
 * La couleur d'un pixel tout transparent n'est pas vue, sauf par un lecteur qui lisse l'image agrandie : il melange couleur et alpha
 * separement, et la couleur cachee (souvent un magenta de couleur cle, ou du noir) deborde sur le bord visible. Chaque pixel
 * transparent prend la moyenne de ses voisins visibles (quatre directions) ; rien de ce qui se voit ne change.
 */
function deborder(p: Pixels): Uint8Array {
  const { l, h, canaux, alpha } = p;
  if (!alpha) return p.couleur;
  const out = p.couleur.slice();
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) {
    const i = y * l + x;
    if (alpha[i] !== 0) continue;
    const voisins = [x > 0 ? i - 1 : -1, x + 1 < l ? i + 1 : -1, y > 0 ? i - l : -1, y + 1 < h ? i + l : -1].filter(j => j >= 0 && (alpha[j] ?? 0) > 0);
    if (!voisins.length) continue;
    for (let c = 0; c < canaux; c++) out[i * canaux + c] = Math.round(voisins.reduce((s, j) => s + (p.couleur[j * canaux + c] ?? 0), 0) / voisins.length);
  }
  return out;
}

/** Des pixels decodes : la couleur et l'alpha, chacun en huit bits, recompresses. */
function depuisPixels(p: Pixels): ImagePdf {
  const espace = p.canaux === 1 ? '/DeviceGray' : '/DeviceRGB';
  return {
    l: p.l, h: p.h, orientation: 1, rvb: p.canaux === 3,
    dict: ENTETE(p.l, p.h) + ' /ColorSpace ' + espace + ' /BitsPerComponent 8 /Interpolate true /Filter /FlateDecode',
    flux: deflateZlib(deborder(p)),
    ...(p.alpha ? { alpha: { dict: ENTETE(p.l, p.h) + ' /ColorSpace /DeviceGray /BitsPerComponent 8 /Interpolate true /Filter /FlateDecode', flux: deflateZlib(p.alpha) } } : {})
  };
}

const hex = (o: Uint8Array) => Array.from(o, v => v.toString(16).padStart(2, '0')).join('');

/**
 * Les images d'une scene, pretes a ecrire, et ce que l'export doit en dire. `decompresses` donne, par donnees, le flux PNG decompresse
 * (`aDecompresser`) ; une image qui en a besoin et ne l'a pas est perdue, et dite. `cmjn` : l'export est en CMJN.
 */
export function preparerImagesPdf(scene: Scene, decompresses: ReadonlyMap<string, Uint8Array>, cmjn = false): ImagesPdf {
  const parDonnees = new Map<string, ImagePdf>();
  let webp = 0, illisibles = 0, jpegs = 0, anime = false;
  for (const img of imagesDe(scene)) {
    const o = octetsDe(img.donnees), nature = o ? natureDesOctets(o) : null;
    let pret: ImagePdf | null = null;
    if (o && nature === 'jpeg') {
      const j = lireJpeg(o);
      if (j && !j.lisible) { jpegs++; continue; }
      if (j) {
        const espace = j.composantes === 1 ? '/DeviceGray' : j.composantes === 3 ? '/DeviceRGB' : '/DeviceCMYK';
        pret = {
          l: j.l, h: j.h, orientation: j.orientation, rvb: j.composantes === 3,
          dict: ENTETE(j.l, j.h) + ' /ColorSpace ' + espace + ' /BitsPerComponent 8 /Interpolate true' + (j.composantes === 4 && j.adobe ? ' /Decode [1 0 1 0 1 0 1 0]' : '') + ' /Filter /DCTDecode',
          flux: o
        };
      }
    } else if (o && nature === 'png') {
      const p = lirePng(o);
      if (p && fluxTelQuel(p)) {
        const couleurs = p.type === 2 ? 3 : 1;
        const espace = p.type === 0 ? '/DeviceGray' : p.type === 2 ? '/DeviceRGB' : '[/Indexed /DeviceRGB ' + ((p.palette?.length ?? 3) / 3 - 1) + ' <' + hex(p.palette ?? new Uint8Array(3)) + '>]';
        pret = {
          l: p.l, h: p.h, orientation: 1, rvb: p.type !== 0,
          dict: ENTETE(p.l, p.h) + ' /ColorSpace ' + espace + ' /BitsPerComponent ' + p.profondeur + ' /Interpolate true /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors ' + couleurs + ' /BitsPerComponent ' + p.profondeur + ' /Columns ' + p.l + ' >>',
          flux: p.idat
        };
      } else if (p) {
        const brut = decompresses.get(img.donnees), px = brut ? decoderPng(p, brut) : null;
        if (px) pret = depuisPixels(px);
      }
    } else if (o && nature === 'gif') {
      const g = decoderGif(o);
      if (g) { pret = depuisPixels(g); anime ||= g.anime; }
    } else if (nature === 'webp') { webp++; continue; }
    if (pret) parDonnees.set(img.donnees, pret);
    else illisibles++;
  }
  const perdus = [...(webp ? [MSG_IMAGES_PDF.webp(webp)] : []), ...(jpegs ? [MSG_IMAGES_PDF.jpeg(jpegs)] : []), ...(illisibles ? [MSG_IMAGES_PDF.illisible(illisibles)] : [])];
  const approches = [...(anime ? [MSG_IMAGES_PDF.anime] : []), ...(cmjn && [...parDonnees.values()].some(i => i.rvb) ? [MSG_IMAGES_PDF.cmjn] : [])];
  return { parDonnees, pertes: [...approches, ...perdus], perdus };
}
