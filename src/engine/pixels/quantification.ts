// Reduire une image a N couleurs (2 a 64) : des centres choisis par eloignement pondere dans OKLab (une
// distance y a du sens pour l'oeil), affines par quelques iterations de Lloyd (k-means). Deterministe de bout en bout : aucun
// tirage, un depart fixe (le point le plus lourd), des departages par l'indice. L'image est d'abord ramenee a un
// histogramme de 32 768 cases (5 bits par canal) : la quantification travaille sur au plus ce nombre de
// points ponderes, quelle que soit la taille de l'image, puis chaque pixel prend la couleur de sa case.
// Option « garder le fond » : la couleur du pourtour entre dans la palette telle quelle, a l'octet, et
// n'est jamais deplacee par les iterations.

import { ecartPercu, versHex, versOklab, type Rgb } from '../../util/couleur.js';
import { ALPHA_PRESENT, fondOpaque } from './alpha.js';
import type { ImageRgba } from './types.js';

export const COULEURS_MIN = 2;
export const COULEURS_MAX = 64;
const CASES = 1 << 15;
const ITERATIONS = 8;
/** En deca de cet ecart OKLab, un pixel est « de la couleur du fond » : il va a la couleur gardee, quoi qu'il en coute aux autres. */
const ECART_FOND = 0.06;

export interface ResultatQuantification {
  image: ImageRgba;
  /** La palette finale, les plus presentes d'abord, en #rrggbb. */
  palette: string[];
}

/** Les points de l'histogramme : une case non vide donne sa couleur moyenne, son poids et ses coordonnees OKLab. */
interface Points { n: number; poids: Float64Array; l: Float64Array; a: Float64Array; b: Float64Array; rgb: Float64Array; caseDe: Int32Array }

function histogramme(img: ImageRgba): Points {
  const { data, largeur, hauteur } = img;
  const compte = new Uint32Array(CASES), somme = new Float64Array(CASES * 3);
  for (let i = 0; i < largeur * hauteur; i++) {
    if ((data[i * 4 + 3] ?? 0) < ALPHA_PRESENT) continue;
    const r = data[i * 4] ?? 0, g = data[i * 4 + 1] ?? 0, b = data[i * 4 + 2] ?? 0;
    const c = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    compte[c] = (compte[c] ?? 0) + 1;
    somme[c * 3] = (somme[c * 3] ?? 0) + r; somme[c * 3 + 1] = (somme[c * 3 + 1] ?? 0) + g; somme[c * 3 + 2] = (somme[c * 3 + 2] ?? 0) + b;
  }
  let n = 0;
  for (let c = 0; c < CASES; c++) if ((compte[c] ?? 0) > 0) n++;
  const p: Points = { n, poids: new Float64Array(n), l: new Float64Array(n), a: new Float64Array(n), b: new Float64Array(n), rgb: new Float64Array(n * 3), caseDe: new Int32Array(n) };
  let k = 0;
  for (let c = 0; c < CASES; c++) {
    const w = compte[c] ?? 0;
    if (!w) continue;
    const r = (somme[c * 3] ?? 0) / w, g = (somme[c * 3 + 1] ?? 0) / w, b = (somme[c * 3 + 2] ?? 0) / w, lab = versOklab({ r, g, b });
    p.poids[k] = w; p.l[k] = lab.l; p.a[k] = lab.a; p.b[k] = lab.b;
    p.rgb[k * 3] = r; p.rgb[k * 3 + 1] = g; p.rgb[k * 3 + 2] = b; p.caseDe[k] = c;
    k++;
  }
  return p;
}

const v = (t: ArrayLike<number>, i: number): number => t[i] ?? 0;

/**
 * Les centres initiaux, par eloignement ponderé (le depart de k-means++ sans tirage) : le premier est le
 * point le plus lourd (ou la couleur imposee), chaque suivant maximise (poids x distance au centre le plus
 * proche). Un aplat bruite, qui s'etale sur des dizaines de cases, ne recoit donc qu'un centre, et
 * une couleur rare mais lointaine en recoit un : ce que la coupe mediane, qui partage les gros nuages,
 * ne fait pas. Egalite : l'indice le plus bas. Moins de `k` centres s'il n'y a pas assez de points distincts.
 */
function departEloigne(p: Points, k: number, imposee: [number, number, number] | null): Float64Array {
  const centres: number[] = [];
  const dmin = new Float64Array(p.n).fill(Infinity);
  const ajouter = (l: number, a: number, b: number) => {
    centres.push(l, a, b);
    for (let i = 0; i < p.n; i++) { const d = (v(p.l, i) - l) ** 2 + (v(p.a, i) - a) ** 2 + (v(p.b, i) - b) ** 2; if (d < v(dmin, i)) dmin[i] = d; }
  };
  if (imposee) {
    ajouter(imposee[0], imposee[1], imposee[2]);
    // Ce qui ressemble a la couleur imposee est deja servi : aucun autre centre ne s'y installe.
    for (let i = 0; i < p.n; i++) if (v(dmin, i) <= ECART_FOND ** 2) dmin[i] = 0;
  }
  while (centres.length / 3 < k) {
    let choisi = -1, meilleur = 0;
    for (let i = 0; i < p.n; i++) {
      // Sans centre encore, tout est a distance infinie : le plus lourd l'emporte ; ensuite, poids x distance.
      const score = v(dmin, i) === Infinity ? v(p.poids, i) * 1e9 : v(p.poids, i) * v(dmin, i);
      if (score > meilleur) { meilleur = score; choisi = i; }
    }
    // Plus aucun point a distance : toutes les couleurs distinctes ont leur centre.
    if (choisi < 0) break;
    ajouter(v(p.l, choisi), v(p.a, choisi), v(p.b, choisi));
  }
  return Float64Array.from(centres);
}

/** Le centre le plus proche de chaque point (l'indice le plus bas a egalite) ; rend le nombre de points qui ont change. */
function affecter(p: Points, centres: Float64Array, k: number, parPoint: Int32Array, fixes: number): number {
  let changes = 0;
  for (let i = 0; i < p.n; i++) {
    const l = v(p.l, i), a = v(p.a, i), b = v(p.b, i);
    let meilleur = 0, dmin = Infinity;
    // La couleur gardee prend tout ce qui lui ressemble : un fond bruite ne se partage pas avec un autre centre.
    const dfixe = fixes ? (l - v(centres, 0)) ** 2 + (a - v(centres, 1)) ** 2 + (b - v(centres, 2)) ** 2 : Infinity;
    for (let c = dfixe <= ECART_FOND ** 2 ? k : 0; c < k; c++) {
      const d = (l - v(centres, c * 3)) ** 2 + (a - v(centres, c * 3 + 1)) ** 2 + (b - v(centres, c * 3 + 2)) ** 2;
      if (d < dmin) { dmin = d; meilleur = c; }
    }
    if (dfixe <= ECART_FOND ** 2) meilleur = 0;
    if (parPoint[i] !== meilleur) { parPoint[i] = meilleur; changes++; }
  }
  return changes;
}

/**
 * Lloyd : chaque centre devient la moyenne ponderee de ses points. Un centre vide reprend le point le plus
 * mal servi (erreur ponderee maximale) ; les `fixes` premiers centres ne bougent jamais.
 */
function affiner(p: Points, centres: Float64Array, k: number, fixes: number): Int32Array {
  const parPoint = new Int32Array(p.n).fill(-1);
  for (let tour = 0; tour < ITERATIONS; tour++) {
    if (affecter(p, centres, k, parPoint, fixes) === 0) break;
    const somme = new Float64Array(k * 4);
    for (let i = 0; i < p.n; i++) {
      const c = v(parPoint, i), w = v(p.poids, i);
      somme[c * 4] = v(somme, c * 4) + w; somme[c * 4 + 1] = v(somme, c * 4 + 1) + w * v(p.l, i);
      somme[c * 4 + 2] = v(somme, c * 4 + 2) + w * v(p.a, i); somme[c * 4 + 3] = v(somme, c * 4 + 3) + w * v(p.b, i);
    }
    for (let c = fixes; c < k; c++) {
      const w = v(somme, c * 4);
      if (w > 0) { centres[c * 3] = v(somme, c * 4 + 1) / w; centres[c * 3 + 1] = v(somme, c * 4 + 2) / w; centres[c * 3 + 2] = v(somme, c * 4 + 3) / w; continue; }
      let pire = 0, emax = -1;
      for (let i = 0; i < p.n; i++) {
        const o = v(parPoint, i) * 3, e = v(p.poids, i) * ((v(p.l, i) - v(centres, o)) ** 2 + (v(p.a, i) - v(centres, o + 1)) ** 2 + (v(p.b, i) - v(centres, o + 2)) ** 2);
        if (e > emax) { emax = e; pire = i; }
      }
      centres[c * 3] = v(p.l, pire); centres[c * 3 + 1] = v(p.a, pire); centres[c * 3 + 2] = v(p.b, pire);
    }
  }
  affecter(p, centres, k, parPoint, fixes);
  return parPoint;
}

/**
 * La couleur du fond, moyennee sur le pourtour : la couleur dominante du bord, puis la moyenne des pixels du
 * bord qui lui ressemblent (le grain d'un fond bruite s'annule). Un fond presque blanc devient le blanc pur.
 */
function fondMoyen(img: ImageRgba, dominante: Rgb): Rgb {
  const { data, largeur: l, hauteur: h } = img;
  let r = 0, g = 0, b = 0, n = 0;
  const voir = (i: number) => {
    if ((data[i * 4 + 3] ?? 0) < ALPHA_PRESENT) return;
    const c = { r: data[i * 4] ?? 0, g: data[i * 4 + 1] ?? 0, b: data[i * 4 + 2] ?? 0 };
    if (ecartPercu(c, dominante) > 0.06) return;
    r += c.r; g += c.g; b += c.b; n++;
  };
  for (let x = 0; x < l; x++) { voir(x); voir((h - 1) * l + x); }
  for (let y = 1; y < h - 1; y++) { voir(y * l); voir(y * l + l - 1); }
  const moy = n ? { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) } : dominante;
  return Math.min(moy.r, moy.g, moy.b) >= 240 ? { r: 255, g: 255, b: 255 } : moy;
}

/** La couleur a garder telle quelle : le fond opaque du pourtour, sinon le blanc ; null si aucun pixel ne lui ressemble. */
function couleurGardee(img: ImageRgba, p: Points): Rgb | null {
  const dominante = fondOpaque(img);
  const cible = dominante ? fondMoyen(img, dominante) : { r: 255, g: 255, b: 255 }, lab = versOklab(cible);
  for (let i = 0; i < p.n; i++) {
    if ((v(p.l, i) - lab.l) ** 2 + (v(p.a, i) - lab.a) ** 2 + (v(p.b, i) - lab.b) ** 2 <= ECART_FOND ** 2) return cible;
  }
  return null;
}

/** La palette finale (moyennes RGB des cases de chaque centre, la couleur gardee a l'octet) triee par presence. */
function paletteFinale(p: Points, parPoint: Int32Array, k: number, gardee: Rgb | null): { hex: string[]; indice: Int32Array } {
  const poids = new Float64Array(k), rgb = new Float64Array(k * 3);
  for (let i = 0; i < p.n; i++) {
    const c = v(parPoint, i), w = v(p.poids, i);
    poids[c] = v(poids, c) + w;
    for (let j = 0; j < 3; j++) rgb[c * 3 + j] = v(rgb, c * 3 + j) + w * v(p.rgb, i * 3 + j);
  }
  const entrees: Array<{ c: number; hex: string; poids: number }> = [];
  for (let c = 0; c < k; c++) {
    const w = v(poids, c);
    if (w <= 0) continue;
    const hex = c === 0 && gardee ? versHex(gardee) : versHex({ r: Math.round(v(rgb, c * 3) / w), g: Math.round(v(rgb, c * 3 + 1) / w), b: Math.round(v(rgb, c * 3 + 2) / w) });
    entrees.push({ c, hex, poids: w });
  }
  // Deux centres qui s'arrondissent a la meme couleur n'en font qu'une.
  const parHex = new Map<string, { hex: string; poids: number }>();
  for (const e of entrees) { const x = parHex.get(e.hex); if (x) x.poids += e.poids; else parHex.set(e.hex, { hex: e.hex, poids: e.poids }); }
  const ordre = [...parHex.values()].sort((a, b) => b.poids - a.poids || (a.hex < b.hex ? -1 : 1));
  const rang = new Map(ordre.map((e, i) => [e.hex, i]));
  const indice = new Int32Array(k).fill(-1);
  for (const e of entrees) indice[e.c] = rang.get(e.hex) ?? 0;
  return { hex: ordre.map(e => e.hex), indice };
}

/**
 * Reduit l'image a au plus `n` couleurs (de 2 a 64). Les pixels absents (alpha) restent tels quels.
 * `garderFond` : la couleur du pourtour (ou le blanc) reste exactement elle-meme et compte parmi les `n`.
 */
export function quantifier(img: ImageRgba, n: number, garderFond = false): ResultatQuantification {
  const cible = Math.min(COULEURS_MAX, Math.max(COULEURS_MIN, Math.round(n)));
  const p = histogramme(img);
  if (p.n === 0) return { image: img, palette: [] };
  const gardee = garderFond ? couleurGardee(img, p) : null;
  const lab = gardee ? versOklab(gardee) : null;
  const centres = departEloigne(p, cible, lab ? [lab.l, lab.a, lab.b] : null);
  const fixes = gardee ? 1 : 0, k = centres.length / 3;
  const parPoint = affiner(p, centres, k, fixes);
  const { hex, indice } = paletteFinale(p, parPoint, k, gardee);
  const couleurs = hex.map(h => parseInt(h.slice(1), 16));
  const parCase = new Int32Array(CASES).fill(-1);
  for (let i = 0; i < p.n; i++) parCase[v(p.caseDe, i)] = v(indice, v(parPoint, i));
  const { data, largeur, hauteur } = img, sortie = new Uint8ClampedArray(data);
  for (let i = 0; i < largeur * hauteur; i++) {
    if ((data[i * 4 + 3] ?? 0) < ALPHA_PRESENT) continue;
    const c = (((data[i * 4] ?? 0) >> 3) << 10) | (((data[i * 4 + 1] ?? 0) >> 3) << 5) | ((data[i * 4 + 2] ?? 0) >> 3);
    const x = v(couleurs, v(parCase, c));
    sortie[i * 4] = x >> 16; sortie[i * 4 + 1] = (x >> 8) & 255; sortie[i * 4 + 2] = x & 255;
  }
  return { image: { data: sortie, largeur, hauteur }, palette: hex };
}
