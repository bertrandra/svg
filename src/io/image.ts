// Convertir une image en SVG, cote navigateur (ADR-0002) : une image PNG ou JPG est
// decodee, ramenee a une taille raisonnable, detouree, puis enveloppee dans un SVG qui l'embarque,
// ou tracee en vrais vecteurs par vtracer (WebAssembly, charge a la demande). Le detourage et la
// vectorisation se rejouent depuis les pixels d'origine gardes en memoire (`source`), sans perte
// cumulee. Le calcul (detourage, extraction des couleurs, options du traceur) est celui du moteur ;
// ici, seulement le canevas qui decode et le traceur qu'on charge.

import { nettoyerSvg } from '../util/svg.js';
import { couleursPixels, type CouleurExtraite } from '../engine/extraction.js';
import { detourer, type Detourage } from '../engine/detourage.js';
import { aTracer, compterTraces, optionsTraceur, svgDuTraceur, TRACES_MAX, TRAITEMENT_DEFAUT, type Traceur, type Traitement } from '../engine/vectorisation.js';
import { chargerTraceur } from './vtracer.js';

export { TRAITEMENT_DEFAUT, type Traitement };

/** L'image deposee, avant tout detourage, a la taille ou on la traite : de quoi tout refaire. */
export interface SourceImage { pixels: Uint8ClampedArray; largeur: number; hauteur: number }

export interface ImageConvertie {
  svg: string;
  couleurs: CouleurExtraite[];
  /** Vrai pour une image enveloppee ; faux pour de vrais vecteurs. */
  matriciel: boolean;
  /** Ce que le detourage a retire ; null si rien n'a ete retire. */
  detourage: Detourage | null;
  source: SourceImage;
  traitement: Traitement;
  /** Le nombre de traces d'une image vectorisee ; null pour une image enveloppee. */
  traces: number | null;
  /** Le temps du traitement, en millisecondes : la mesure d'un essai, jamais une entree du calcul. */
  duree: number;
}

/** Au-dela, une image pese pour rien : un dessin se lit a cette taille sur tout support. */
export const COTE_MAX = 1024;
/** La reduction sur laquelle les couleurs se comptent : assez pour les aplats, vite calculee. */
const COTE_EXTRACTION = 96;

function chargerImage(fichier: Blob): Promise<HTMLImageElement> {
  return new Promise((ok, ko) => {
    const url = URL.createObjectURL(fichier), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); ko(new Error('image illisible')); };
    img.src = url;
  });
}

function toile(l: number, h: number): { t: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const t = document.createElement('canvas');
  t.width = Math.max(1, l); t.height = Math.max(1, h);
  const ctx = t.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canevas indisponible');
  return { t, ctx };
}

function envelopper(png: string, l: number, h: number): string {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + l + ' ' + h + '" width="' + l + '" height="' + h + '">'
    + '<image href="' + png + '" width="' + l + '" height="' + h + '"/></svg>';
}

/** Les couleurs d'une image, comptees sur une reduction : assez pour les aplats, vite calculees. */
function couleursDe(t: HTMLCanvasElement): CouleurExtraite[] {
  const r = Math.min(1, COTE_EXTRACTION / Math.max(t.width, t.height)), petit = toile(Math.max(1, Math.round(t.width * r)), Math.max(1, Math.round(t.height * r)));
  petit.ctx.drawImage(t, 0, 0, petit.t.width, petit.t.height);
  return couleursPixels(petit.ctx.getImageData(0, 0, petit.t.width, petit.t.height).data);
}

// La raison technique d'un echec, montree telle quelle : sans elle, un refus du navigateur (WASM
// bloque par la page hote) ne se distingue pas d'une image intracable.
const raison = (e: unknown): string => (e instanceof Error ? e.message : String(e)).slice(0, 160);

/**
 * Detoure (ou non) une copie de l'image d'origine, puis l'enveloppe ou la vectorise. Le traceur se
 * charge au premier besoin ; une image tracee en milliers de formes n'est plus un dessin, et c'est dit.
 */
export async function traiterImage(source: SourceImage, traitement: Traitement, traceur?: Traceur): Promise<ImageConvertie | { erreur: string }> {
  const debut = performance.now();
  const { largeur: l, hauteur: h } = source;
  const pixels = new Uint8ClampedArray(source.pixels);
  const detourage = traitement.detourer ? detourer(pixels, l, h, traitement.tolerance, traitement.portee) : null;
  const { t, ctx } = toile(l, h);
  ctx.putImageData(new ImageData(pixels, l, h), 0, 0);
  const couleurs = couleursDe(t);
  const commun = { couleurs, detourage: detourage?.retires ? detourage : null, source, traitement };
  const duree = () => Math.max(1, Math.round(performance.now() - debut));
  if (!traitement.vecteurs) {
    const propre = nettoyerSvg(envelopper(t.toDataURL('image/png'), l, h));
    if (!propre) return { erreur: 'Cette image ne s’enveloppe pas : déposez un autre PNG ou JPG.' };
    return { ...commun, svg: propre.svg, matriciel: true, traces: null, duree: duree() };
  }
  if (!aTracer(pixels)) return { erreur: 'Rien à tracer : le détourage a tout retiré. Réduisez sa tolérance, ou désactivez-le.' };
  let tracer: Traceur;
  try { tracer = traceur ?? await chargerTraceur(); } catch (e) { return { erreur: 'Le vectoriseur ne s’est pas chargé dans ce navigateur (' + raison(e) + ').' }; }
  const options = optionsTraceur(traitement.vecteurs.mode, traitement.vecteurs.finesse, couleurs.map(c => c.hex), traitement.vecteurs.fins);
  let brut: string;
  try { brut = tracer(new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength), l, h, options); } catch (e) { return { erreur: 'La vectorisation a échoué sur cette image : changez de mode ou de grain (' + raison(e) + ').' }; }
  const propre = nettoyerSvg(svgDuTraceur(brut));
  if (!propre) return { erreur: 'La vectorisation n’a rien donné de lisible : changez de mode ou de grain.' };
  const traces = compterTraces(propre.svg);
  if (!traces) return { erreur: 'Rien à tracer : le détourage a tout retiré. Réduisez sa tolérance, ou désactivez-le.' };
  if (traces > TRACES_MAX) return { erreur: traces + ' tracés : c’est une photo plus qu’un dessin. Choisissez un grain plus lisse.' };
  return { ...commun, svg: propre.svg, matriciel: false, traces, duree: duree() };
}

/**
 * L'image telle que le traitement la laisserait avant de la tracer : detouree si le traitement le
 * veut, en PNG. C'est la moitie gauche de la comparaison, calculee sans le traceur, donc instantanee.
 */
export function apercuDetoure(source: SourceImage, traitement: Pick<Traitement, 'detourer' | 'tolerance' | 'portee'>): string {
  const { largeur: l, hauteur: h } = source;
  const pixels = new Uint8ClampedArray(source.pixels);
  if (traitement.detourer) detourer(pixels, l, h, traitement.tolerance, traitement.portee);
  const { t, ctx } = toile(l, h);
  ctx.putImageData(new ImageData(pixels, l, h), 0, 0);
  return t.toDataURL('image/png');
}

/** Decode une image PNG, JPG, GIF ou WebP, reduite a COTE_MAX : la source sur laquelle tout se rejoue. */
export async function lireSource(fichier: Blob): Promise<SourceImage | { erreur: string }> {
  let img: HTMLImageElement;
  try { img = await chargerImage(fichier); } catch { return { erreur: 'Cette image ne se lit pas : déposez un PNG, un JPG, un GIF ou un WebP.' }; }
  const e = Math.min(1, COTE_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const l = Math.max(1, Math.round(img.naturalWidth * e)), h = Math.max(1, Math.round(img.naturalHeight * e));
  const { ctx } = toile(l, h);
  ctx.drawImage(img, 0, 0, l, h);
  return { pixels: ctx.getImageData(0, 0, l, h).data, largeur: l, hauteur: h };
}

/** Ce que l'image est devenue, en une ligne. */
export function resumeConversion(r: ImageConvertie): string {
  const fond = r.detourage ? 'fond ' + r.detourage.fond.toUpperCase() + ' retiré ' + (r.traitement.portee === 'partout' ? 'partout' : 'depuis le bord') + ' (' + Math.round(r.detourage.part * 100) + ' %)' : r.traitement.detourer ? 'aucun fond à retirer' : 'fond gardé';
  const forme = r.traces !== null ? r.traces + ' tracé' + (r.traces > 1 ? 's' : '') + ' vectoriel' + (r.traces > 1 ? 's' : '') : 'image enveloppée';
  return fond + ' · ' + forme + ' · ' + Math.max(1, Math.round(r.svg.length / 1024)) + ' Ko';
}

/** Le dessin en PNG, a la largeur donnee (la hauteur suit le plan), fond transparent. */
export async function versPng(svg: string, largeur: number): Promise<Blob> {
  const img = await chargerImage(new Blob([svg], { type: 'image/svg+xml' }));
  const l = Math.max(1, Math.round(largeur)), h = Math.max(1, Math.round((img.naturalHeight / Math.max(1, img.naturalWidth)) * l));
  const { t, ctx } = toile(l, h);
  ctx.drawImage(img, 0, 0, l, h);
  return new Promise((ok, ko) => t.toBlob(b => (b ? ok(b) : ko(new Error('rendu refusé'))), 'image/png'));
}
