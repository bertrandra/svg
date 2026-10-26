// Convertir une image en SVG, cote navigateur (ADR-0002) : une image PNG ou JPG est
// decodee, ramenee a une taille raisonnable, detouree, puis enveloppee dans un SVG qui l'embarque,
// ou tracee en vrais vecteurs par vtracer (WebAssembly, charge a la demande). Le detourage et la
// vectorisation se rejouent depuis les pixels d'origine gardes en memoire (`source`), sans perte
// cumulee. Le calcul (detourage, extraction des couleurs, options du traceur) est celui du moteur ;
// ici, seulement le canevas qui decode et le traceur qu'on charge.

import { nettoyerSvg } from '../util/svg.js';
import { t } from '../util/i18n.js';
import { pluriel } from '../util/texte.js';
import { couleursPixels, type CouleurExtraite } from '../engine/extraction.js';
import { couleurDuBord, detourer, type Detourage } from '../engine/detourage.js';
import { tracerLigneMediane, type MesureLigne } from '../engine/lignemediane.js';
import {
  compterCouleurs, couleursExactes, COULEURS_MAX, normaliserPretraitement, pretraiter, type ClePretraitement, type ReglagesPretraitement, type ResultatPretraitement
} from '../engine/pretraitement.js';
import { aTracer, compterTraces, COULEURS_PALETTE_MAX, optionsTraceur, parVtracer, svgDuTraceur, TRACES_MAX, TRAITEMENT_DEFAUT, type Traceur, type Traitement } from '../engine/vectorisation.js';
import { chargerTraceur } from './vtracer.js';

export { TRAITEMENT_DEFAUT, type Traitement };
export type { ReglagesPretraitement };

/** L'image deposee, avant tout detourage, a la taille ou on la traite : de quoi tout refaire. */
export interface SourceImage { pixels: Uint8ClampedArray; largeur: number; hauteur: number }

/** Ce que le pretraitement a fait d'une image, quand il en a fait quelque chose. */
export interface InfoPretraitement {
  etapes: ClePretraitement[];
  /** Les dimensions de l'image que le traceur a lue (le double de la source si elle a ete agrandie). */
  largeur: number;
  hauteur: number;
  /** Les couleurs distinctes de la source, et de l'image que le traceur a lue (fond detoure compris). */
  couleursAvant: number;
  couleurs: number;
}

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
  /** Present seulement quand un pretraitement a ete joue. */
  pretraite?: InfoPretraitement;
  /** Present seulement pour la ligne mediane : ce que l'image a dit d'elle (epaisseur, seuil, couleur du trait). */
  ligne?: MesureLigne;
}

/** Au-dela, une image pese pour rien : un dessin se lit a cette taille sur tout support. */
export const COTE_MAX = 1024;
/** La reduction sur laquelle les couleurs se comptent : assez pour les aplats, vite calculee. */
const COTE_EXTRACTION = 96;

export function chargerImage(fichier: Blob): Promise<HTMLImageElement> {
  return new Promise((ok, ko) => {
    const url = URL.createObjectURL(fichier), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); ko(new Error(t('image illisible'))); };
    img.src = url;
  });
}

export function toile(l: number, h: number): { t: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canevas = document.createElement('canvas');
  canevas.width = Math.max(1, l); canevas.height = Math.max(1, h);
  const ctx = canevas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error(t('Canevas indisponible'));
  return { t: canevas, ctx };
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

/**
 * Le pretraitement d'une source, memorise sur le dernier couple (source, reglages) : l'apercu « Pretraitee » et le
 * trace qui suit lisent le meme resultat sans le recalculer. Sans reglage, la source elle-meme (aucune copie).
 * Le tampon rendu est partage : qui veut l'ecrire (detourer) en prend une copie.
 */
let memo: { source: SourceImage; cle: string; resultat: ResultatPretraitement } | null = null;

export function pretraiterSource(source: SourceImage, reglages: ReglagesPretraitement | undefined): ResultatPretraitement {
  const n = normaliserPretraitement(reglages), brut = { data: source.pixels, largeur: source.largeur, hauteur: source.hauteur };
  if (!n) return pretraiter(brut, undefined);
  const cle = JSON.stringify(n);
  if (memo && memo.source === source && memo.cle === cle) return memo.resultat;
  const resultat = pretraiter(brut, n);
  memo = { source, cle, resultat };
  return resultat;
}

const infoPretraitement = (pre: ResultatPretraitement, source: SourceImage, pixels: Uint8ClampedArray): InfoPretraitement | null => (pre.etapes.length
  ? { etapes: pre.etapes, largeur: pre.image.largeur, hauteur: pre.image.hauteur, couleursAvant: compterCouleurs({ data: source.pixels, largeur: source.largeur, hauteur: source.hauteur }), couleurs: compterCouleurs({ data: pixels, largeur: pre.image.largeur, hauteur: pre.image.hauteur }) }
  : null);

/** Rend a un SVG agrandi la taille de la source : le plan (viewBox) garde la precision doublee, la page le taille d'origine. */
export function ramenerATaille(svg: string, largeur: number, hauteur: number): string {
  return svg.replace(/<svg\b[^>]*>/i, ouverture => ouverture.replace(/\swidth\s*=\s*("[^"]*"|'[^']*')/i, ' width="' + largeur + '"').replace(/\sheight\s*=\s*("[^"]*"|'[^']*')/i, ' height="' + hauteur + '"'));
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
  // Le pretraitement vient avant le detourage : un fond reduit a une couleur exacte se detoure sans tolerance. Sans
  // reglage touche, l'image est la source elle-meme et rien ne change d'un octet.
  const pre = pretraiterSource(source, traitement.pretraitement);
  const { largeur: l, hauteur: h } = pre.image;
  const pixels = new Uint8ClampedArray(pre.image.data);
  const detourage = traitement.detourer ? detourer(pixels, l, h, traitement.tolerance, traitement.portee) : null;
  const { t: canevas, ctx } = toile(l, h);
  ctx.putImageData(new ImageData(pixels, l, h), 0, 0);
  // Une image reduite a N couleurs a des couleurs exactes : on les compte telles quelles (le canevas reduit les melangerait).
  const exactes = pre.palette ? couleursExactes({ data: pixels, largeur: l, hauteur: h }, COULEURS_MAX) : null;
  const couleurs = exactes ?? couleursDe(canevas);
  const pretraite = infoPretraitement(pre, source, pixels);
  const commun = { couleurs, detourage: detourage?.retires ? detourage : null, source, traitement, ...(pretraite ? { pretraite } : {}) };
  const duree = () => Math.max(1, Math.round(performance.now() - debut));
  const taille = (svg: string) => (pre.agrandie ? ramenerATaille(svg, source.largeur, source.hauteur) : svg);
  if (!traitement.vecteurs) {
    const propre = nettoyerSvg(envelopper(canevas.toDataURL('image/png'), l, h));
    if (!propre) return { erreur: t('Cette image ne s’enveloppe pas : déposez un autre PNG ou JPG.') };
    return { ...commun, svg: taille(propre.svg), matriciel: true, traces: null, duree: duree() };
  }
  if (!aTracer(pixels)) return { erreur: t('Rien à tracer : le détourage a tout retiré. Réduisez sa tolérance, ou désactivez-le.') };
  if (!parVtracer(traitement.vecteurs.mode)) {
    // La ligne mediane ne charge pas vtracer : tout est du moteur pur. Le fond est la couleur du bord de l'image
    // pretraitee, avant detourage (celle que le detourage a retiree) ; un pixel detoure est du fond.
    const ligne = tracerLigneMediane({ data: pixels, largeur: l, hauteur: h }, couleurDuBord(pre.image.data, l, h), traitement.vecteurs.finesse, traitement.vecteurs.ligne);
    if ('erreur' in ligne) return ligne;
    const propre = nettoyerSvg(ligne.svg);
    if (!propre) return { erreur: t('La ligne médiane n’a rien donné de lisible : changez de grain.') };
    return { ...commun, svg: taille(propre.svg), matriciel: false, traces: ligne.traces, ligne: ligne.mesure, duree: duree() };
  }
  let tracer: Traceur;
  try { tracer = traceur ?? await chargerTraceur(); } catch (e) { return { erreur: t('Le vectoriseur ne s’est pas chargé dans ce navigateur ({raison}).', { raison: raison(e) }) }; }
  const options = optionsTraceur(traitement.vecteurs.mode, traitement.vecteurs.finesse, couleurs.map(c => c.hex), traitement.vecteurs.fins, exactes ? COULEURS_MAX : COULEURS_PALETTE_MAX);
  let brut: string;
  try { brut = tracer(new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength), l, h, options); } catch (e) { return { erreur: t('La vectorisation a échoué sur cette image : changez de mode ou de grain ({raison}).', { raison: raison(e) }) }; }
  const propre = nettoyerSvg(svgDuTraceur(brut));
  if (!propre) return { erreur: t('La vectorisation n’a rien donné de lisible : changez de mode ou de grain.') };
  const traces = compterTraces(propre.svg);
  if (!traces) return { erreur: t('Rien à tracer : le détourage a tout retiré. Réduisez sa tolérance, ou désactivez-le.') };
  if (traces > TRACES_MAX) return { erreur: t('{n} tracés : c’est une photo plus qu’un dessin. Choisissez un grain plus lisse.', { n: traces }) };
  return { ...commun, svg: taille(propre.svg), matriciel: false, traces, duree: duree() };
}

/** L'image du pretraitement vue avant le trace : le PNG, ses dimensions, ses couleurs, ce qui a ete joue. */
export interface ApercuPretraite { url: string; largeur: number; hauteur: number; couleurs: number; couleursAvant: number; etapes: ClePretraitement[]; palette: string[] | null }

/**
 * L'image que le traceur lira : pretraitee, puis detouree si le traitement le veut, en PNG. Sans
 * pretraitement c'est l'apercu detoure. Calcule sans le traceur ; le tampon pretraite est partage avec le trace qui suivra.
 */
export function apercuPretraite(source: SourceImage, traitement: Pick<Traitement, 'detourer' | 'tolerance' | 'portee' | 'pretraitement'>): ApercuPretraite {
  const pre = pretraiterSource(source, traitement.pretraitement);
  const { largeur: l, hauteur: h } = pre.image;
  const pixels = new Uint8ClampedArray(pre.image.data);
  if (traitement.detourer) detourer(pixels, l, h, traitement.tolerance, traitement.portee);
  const { t: canevas, ctx } = toile(l, h);
  ctx.putImageData(new ImageData(pixels, l, h), 0, 0);
  return {
    url: canevas.toDataURL('image/png'), largeur: l, hauteur: h, etapes: pre.etapes, palette: pre.palette,
    couleurs: compterCouleurs({ data: pixels, largeur: l, hauteur: h }), couleursAvant: compterCouleurs({ data: source.pixels, largeur: source.largeur, hauteur: source.hauteur })
  };
}

/**
 * L'image telle que le traitement la laisserait avant de la tracer : detouree si le traitement le
 * veut, en PNG. C'est la moitie gauche de la comparaison, calculee sans le traceur, donc instantanee.
 */
export function apercuDetoure(source: SourceImage, traitement: Pick<Traitement, 'detourer' | 'tolerance' | 'portee'>): string {
  const { largeur: l, hauteur: h } = source;
  const pixels = new Uint8ClampedArray(source.pixels);
  if (traitement.detourer) detourer(pixels, l, h, traitement.tolerance, traitement.portee);
  const { t: canevas, ctx } = toile(l, h);
  ctx.putImageData(new ImageData(pixels, l, h), 0, 0);
  return canevas.toDataURL('image/png');
}

/** Decode une image PNG, JPG, GIF ou WebP, reduite a COTE_MAX : la source sur laquelle tout se rejoue. */
export async function lireSource(fichier: Blob): Promise<SourceImage | { erreur: string }> {
  let img: HTMLImageElement;
  try { img = await chargerImage(fichier); } catch { return { erreur: t('Cette image ne se lit pas : déposez un PNG, un JPG, un GIF ou un WebP.') }; }
  const e = Math.min(1, COTE_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const l = Math.max(1, Math.round(img.naturalWidth * e)), h = Math.max(1, Math.round(img.naturalHeight * e));
  const { ctx } = toile(l, h);
  ctx.drawImage(img, 0, 0, l, h);
  return { pixels: ctx.getImageData(0, 0, l, h).data, largeur: l, hauteur: h };
}

/** Ce que l'image est devenue, en une ligne. */
export function resumeConversion(r: ImageConvertie): string {
  const fond = r.detourage
    ? t('fond {couleur} retiré {ou} ({part} %)', { couleur: r.detourage.fond.toUpperCase(), ou: r.traitement.portee === 'partout' ? t('partout') : t('depuis le bord'), part: Math.round(r.detourage.part * 100) })
    : r.traitement.detourer ? t('aucun fond à retirer') : t('fond gardé');
  const forme = r.traces === null ? t('image telle quelle') : r.ligne ? t('{traces} · une ligne au milieu du trait', { traces: pluriel(r.traces, 'tracé') }) : pluriel(r.traces, 'tracé vectoriel');
  return t('{fond} · {forme} · {ko} Ko', { fond, forme, ko: Math.max(1, Math.round(r.svg.length / 1024)) });
}

/** Le dessin en PNG, a la largeur donnee (la hauteur suit le plan), fond transparent. */
export async function versPng(svg: string, largeur: number): Promise<Blob> {
  const img = await chargerImage(new Blob([svg], { type: 'image/svg+xml' }));
  const l = Math.max(1, Math.round(largeur)), h = Math.max(1, Math.round((img.naturalHeight / Math.max(1, img.naturalWidth)) * l));
  const { t: canevas, ctx } = toile(l, h);
  ctx.drawImage(img, 0, 0, l, h);
  return new Promise((ok, ko) => canevas.toBlob(b => (b ? ok(b) : ko(new Error(t('rendu refusé')))), 'image/png'));
}
