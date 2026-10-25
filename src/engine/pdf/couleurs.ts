// Les espaces de couleur d'un PDF (ISO 32000-1, 8.6) ramenes au #rrggbb du dessin a plat. DeviceGray et DeviceRGB sont exacts ;
// ICCBased, CalGray et CalRGB sont lus comme l'espace d'appareil de meme nombre de composantes (ce que fait tout lecteur qui ne
// gere pas les profils : le plus souvent sRGB). Le reste est une approximation, que la lecture dit :
//   - CMJN (DeviceCMYK, ICC a quatre composantes) : R = (1 - C)(1 - N), le meme calcul naif que `depuisCmjnNaif`, l'inverse
//     exact de ce qu'ecrit notre export CMJN ;
//   - Lab : vers XYZ au blanc du fichier, puis sRGB (adaptation de von Kries, sans profil) ;
//   - Separation et DeviceN (tons directs) : la fonction de teinte vers l'espace de remplacement ; a defaut, la teinte en gris.
// Indexed passe par sa table. Les motifs et degrades sont traites par l'appelant (contenu.ts).

import { versHex } from '../../util/couleur.js';
import { lireFonction, type Fonction } from './fonctions.js';
import { estChaine, estDict, estFlux, estNom, estNombre, estTableau, type Dict, type ObjetPdf } from './objets.js';
import type { DocumentPdf } from './structure.js';

export type Espace =
  | { readonly k: 'gris' } | { readonly k: 'rvb' } | { readonly k: 'cmjn' }
  | { readonly k: 'lab'; readonly blanc: readonly [number, number, number] }
  | { readonly k: 'indexe'; readonly base: Espace; readonly max: number; readonly table: Uint8Array }
  | { readonly k: 'separation'; readonly n: number; readonly alt: Espace; readonly f: Fonction | null; readonly aucune: boolean }
  | { readonly k: 'motif'; readonly sous: Espace | null };

export const GRIS: Espace = { k: 'gris' }, RVB: Espace = { k: 'rvb' }, CMJN: Espace = { k: 'cmjn' };

const PROFONDEUR_MAX = 8;

/** L'espace nomme ou decrit par `o` ; un nom inconnu des ressources retombe sur le gris (et la lecture le dit). */
export function lireEspace(doc: DocumentPdf, o: ObjetPdf | undefined, ressources: Dict | null, profondeur = 0): Espace {
  if (profondeur > PROFONDEUR_MAX) return GRIS;
  const v = doc.resoudre(o);
  if (estNom(v)) {
    switch (v) {
      case 'DeviceGray': case 'G': case 'CalGray': return GRIS;
      case 'DeviceRGB': case 'RGB': case 'CalRGB': return RVB;
      case 'DeviceCMYK': case 'CMYK': return CMJN;
      case 'Pattern': return { k: 'motif', sous: null };
      default: {
        const nomme = doc.valeur(doc.dict(ressources, 'ColorSpace'), v);
        return nomme === null ? GRIS : lireEspace(doc, nomme, ressources, profondeur + 1);
      }
    }
  }
  if (!estTableau(v) || !v.length) return GRIS;
  const famille = doc.resoudre(v[0]);
  switch (famille) {
    case 'CalGray': return GRIS;
    case 'CalRGB': return RVB;
    case 'Lab': return lab(doc, v[1]);
    case 'ICCBased': return icc(doc, v[1], ressources, profondeur);
    case 'Indexed': case 'I': return indexe(doc, v, ressources, profondeur);
    case 'Separation': case 'DeviceN': return separation(doc, v, ressources, profondeur);
    case 'Pattern': return { k: 'motif', sous: v.length > 1 ? lireEspace(doc, v[1], ressources, profondeur + 1) : null };
    default: return lireEspace(doc, famille, ressources, profondeur + 1);
  }
}

function lab(doc: DocumentPdf, o: ObjetPdf | undefined): Espace {
  const d = doc.resoudre(o), blanc = estDict(d) ? doc.tableau(d, 'WhitePoint') : null;
  const w = (blanc ?? []).map(x => doc.resoudre(x));
  return { k: 'lab', blanc: w.length >= 3 && w.every(estNombre) ? [w[0] as number, w[1] as number, w[2] as number] : [0.9642, 1, 0.8249] };
}

function icc(doc: DocumentPdf, o: ObjetPdf | undefined, ressources: Dict | null, profondeur: number): Espace {
  const f = doc.resoudre(o);
  if (!estFlux(f)) return RVB;
  const alt = f.dict.get('Alternate');
  if (alt !== undefined) return lireEspace(doc, alt, ressources, profondeur + 1);
  const n = doc.resoudre(f.dict.get('N'));
  return n === 1 ? GRIS : n === 4 ? CMJN : RVB;
}

function indexe(doc: DocumentPdf, v: readonly ObjetPdf[], ressources: Dict | null, profondeur: number): Espace {
  const base = lireEspace(doc, v[1], ressources, profondeur + 1);
  const max = doc.resoudre(v[2]), t = doc.resoudre(v[3]);
  const table = estChaine(t) ? Uint8Array.from(t.v, c => c.charCodeAt(0) & 0xff) : estFlux(t) ? doc.donnees(t) : new Uint8Array(0);
  return { k: 'indexe', base, max: estNombre(max) ? Math.max(0, Math.min(255, Math.floor(max))) : 0, table };
}

function separation(doc: DocumentPdf, v: readonly ObjetPdf[], ressources: Dict | null, profondeur: number): Espace {
  const noms = doc.resoudre(v[1]);
  const n = estTableau(noms) ? Math.max(1, noms.length) : 1;
  const tous = estTableau(noms) ? noms.map(x => doc.resoudre(x)) : [noms];
  return { k: 'separation', n, alt: lireEspace(doc, v[2], ressources, profondeur + 1), f: lireFonction(doc, v[3]), aucune: tous.every(x => x === 'None') };
}

/** Le nombre de composantes qu'attend `sc` ou `scn` dans cet espace. */
export function composantes(e: Espace): number {
  switch (e.k) {
    case 'gris': case 'indexe': return 1;
    case 'rvb': case 'lab': return 3;
    case 'cmjn': return 4;
    case 'separation': return e.n;
    case 'motif': return e.sous ? composantes(e.sous) : 0;
  }
}

/** La couleur que pose `cs` ou `CS` en changeant d'espace (8.6.8). */
export function couleurInitiale(e: Espace): number[] {
  switch (e.k) {
    case 'cmjn': return [0, 0, 0, 1];
    case 'separation': return new Array<number>(e.n).fill(1);
    case 'motif': return [];
    default: return new Array<number>(composantes(e)).fill(0);
  }
}

/** Vrai si la couleur de cet espace n'est qu'approchee (et la lecture le dit). */
export const approchee = (e: Espace): boolean =>
  e.k === 'cmjn' || e.k === 'lab' || e.k === 'separation' || (e.k === 'indexe' && approchee(e.base));

const borne = (v: number | undefined) => Math.min(1, Math.max(0, Number.isFinite(v) ? (v as number) : 0));

/** La couleur en RVB 0..1, ou null pour « ne rien peindre » (le ton direct « None »). */
export function versRvb(e: Espace, v: readonly number[], profondeur = 0): [number, number, number] | null {
  if (profondeur > PROFONDEUR_MAX) return [0, 0, 0];
  switch (e.k) {
    case 'gris': { const g = borne(v[0]); return [g, g, g]; }
    case 'rvb': return [borne(v[0]), borne(v[1]), borne(v[2])];
    case 'cmjn': { const k = 1 - borne(v[3]); return [(1 - borne(v[0])) * k, (1 - borne(v[1])) * k, (1 - borne(v[2])) * k]; }
    case 'lab': return labVersRvb(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, e.blanc);
    case 'indexe': {
      const i = Math.min(e.max, Math.max(0, Math.round(v[0] ?? 0))), n = composantes(e.base);
      const c = Array.from({ length: n }, (_, k) => (e.table[i * n + k] ?? 0) / 255);
      return versRvb(e.base, e.base.k === 'lab' ? [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0].map((x, k) => (k ? x * 255 - 128 : x * 100)) : c, profondeur + 1);
    }
    case 'separation': {
      if (e.aucune) return null;
      const r = e.f?.(v.slice(0, e.n));
      if (r && r.length >= composantes(e.alt)) return versRvb(e.alt, r, profondeur + 1);
      // Sans fonction lisible : la teinte moyenne, en gris (une encre a 100 % est noire).
      const t = v.slice(0, e.n).reduce((a, b) => a + borne(b), 0) / e.n;
      return [1 - t, 1 - t, 1 - t];
    }
    case 'motif': return null;
  }
}

function labVersRvb(l: number, a: number, b: number, blanc: readonly [number, number, number]): [number, number, number] {
  const fy = (l + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const g = (t: number) => (t > 6 / 29 ? t * t * t : 3 * (6 / 29) * (6 / 29) * (t - 4 / 29));
  // Von Kries vers le blanc D65 de sRGB, puis la matrice XYZ -> sRGB lineaire.
  const x = g(fx) * blanc[0] * (0.95047 / (blanc[0] || 1)), y = g(fy) * blanc[1] * (1 / (blanc[1] || 1)), z = g(fz) * blanc[2] * (1.08883 / (blanc[2] || 1));
  const lin = [3.2406 * x - 1.5372 * y - 0.4986 * z, -0.9689 * x + 1.8758 * y + 0.0415 * z, 0.0557 * x - 0.204 * y + 1.057 * z];
  const s = lin.map(c => { const v = Math.min(1, Math.max(0, c)); return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; });
  return [s[0] ?? 0, s[1] ?? 0, s[2] ?? 0];
}

/** Le #rrggbb d'une couleur RVB 0..1. */
export const hexDe = (c: readonly [number, number, number]): string => versHex({ r: c[0] * 255, g: c[1] * 255, b: c[2] * 255 });
