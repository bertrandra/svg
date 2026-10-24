// Les clones <use> (ADR-0009, troisieme lot) : retrouver la cible d'un href, lire le cadre d'un <use> et le
// transformer en matrice pour un <symbol> (viewBox + preserveAspectRatio), verifier que rien ne depasse
// du cadre qu'un navigateur rognerait. La marche elle-meme (heritage, cycles, profondeur) vit dans
// `parcours.ts`. Tout est pur.

import type { Noeud } from '../../util/xml.js';
import type { Boite, Forme, Matrice } from './types.js';
import { boiteAvecTrait } from './etendue.js';

/** Combien de <use> peuvent s'emboiter (un <use> dont la cible contient un <use>…). Au-dela : refus. */
export const PROFONDEUR_USE_MAX = 16;
/**
 * Combien de clones la lecture accepte en tout (un <use> deplie compte un, chaque forme qu'il produit un de plus) : une
 * « bombe » de <use> emboites, meme sans aucune forme visible au bout, ne gele pas l'onglet.
 */
export const CLONES_MAX = 20000;

export type Cible = { readonly noeud: Noeud } | { readonly absente: true } | { readonly externe: string };

/**
 * La cible du href d'un <use>. `href` l'emporte sur `xlink:href` (SVG 2). Seul un renvoi au document
 * lui-meme (`#id`) se resout ; un fichier, une adresse ou une donnee en ligne est externe. Un href vide
 * ou absent, ou un identifiant qui n'existe pas, n'a pas de cible : un navigateur ne dessine rien.
 */
export function cibleDe(u: Noeud, ids: ReadonlyMap<string, Noeud>): Cible {
  const href = (u.attributs.href ?? u.attributs['xlink:href'] ?? '').trim();
  // Le nettoyage des SVG ouverts (util/svg.ts) retire un renvoi externe mais le garde dans cet attribut inerte.
  const retire = (u.attributs['data-href-externe'] ?? '').trim();
  const dit = (t: string) => ({ externe: t.length > 60 ? t.slice(0, 57) + '…' : t });
  if (href === '') return retire === '' ? { absente: true } : dit(retire);
  if (!href.startsWith('#')) return dit(href);
  let id = href.slice(1);
  try { id = decodeURIComponent(id); } catch { /* un % isole : l'identifiant tel quel */ }
  const noeud = ids.get(id);
  return noeud ? { noeud } : { absente: true };
}

type Longueur = { readonly v: number } | 'unite';

/** Une longueur de <use> : un nombre, `px` ou un pourcentage de `reference`. Une autre unite n'est pas calculee. */
export function longueurUse(v: string | undefined, reference: number, defaut: number): Longueur {
  if (v === undefined || v.trim() === '') return { v: defaut };
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(px|%)?\s*$/i.exec(v);
  if (!m) return 'unite';
  const x = Number(m[1]);
  return { v: (m[2] ?? '') === '%' ? (reference * x) / 100 : x };
}

export interface Aspect {
  /** Position du contenu dans le cadre, de 0 (min) a 1 (max), par axe ; null pour `none` (etirement sans proportions). */
  readonly alignement: readonly [number, number] | null;
  readonly tranche: boolean;
}

const ASPECT_DEFAUT: Aspect = { alignement: [0.5, 0.5], tranche: false };
const POSITION: Readonly<Record<string, number>> = { Min: 0, Mid: 0.5, Max: 1 };

/** `preserveAspectRatio` : les dix alignements et meet / slice ; une valeur illisible vaut le defaut, comme dans un navigateur. */
export function lireAspect(v: string | undefined): Aspect {
  const mots = (v ?? '').trim().split(/\s+/).filter(Boolean);
  if (mots[0] === 'defer') mots.shift();
  const [align, mode, reste] = mots;
  if (align === undefined || reste !== undefined || (mode !== undefined && mode !== 'meet' && mode !== 'slice')) return ASPECT_DEFAUT;
  const tranche = mode === 'slice';
  if (align === 'none') return { alignement: null, tranche };
  const m = /^x(Min|Mid|Max)Y(Min|Mid|Max)$/.exec(align);
  const ax = POSITION[m?.[1] ?? ''], ay = POSITION[m?.[2] ?? ''];
  return ax === undefined || ay === undefined ? ASPECT_DEFAUT : { alignement: [ax, ay], tranche };
}

/** Le `viewBox` d'un <symbol>, ou null s'il manque ou ne se lit pas (un navigateur l'ignore alors). 'vide' quand il desactive le rendu. */
export function lireVue(v: string | undefined): readonly [number, number, number, number] | 'vide' | null {
  const n = (v ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (n.length !== 4 || !n.every(Number.isFinite)) return null;
  const [x = 0, y = 0, l = 0, h = 0] = n;
  return l < 0 || h < 0 ? null : l === 0 || h === 0 ? 'vide' : [x, y, l, h];
}

export interface Cadre { readonly x: number; readonly y: number; readonly l: number; readonly h: number }

/**
 * La matrice qui amene les coordonnees d'un <symbol> dans le cadre de son <use> : sans viewBox, une simple
 * translation au coin du cadre ; avec, l'echelle de `meet` (le plus petit des deux rapports, tout le
 * viewBox est vu) ou de `slice` (le plus grand, le cadre est rempli), placee par l'alignement.
 */
export function matriceCadre(vue: readonly [number, number, number, number] | null, cadre: Cadre, aspect: Aspect): Matrice {
  if (!vue) return [1, 0, 0, 1, cadre.x, cadre.y];
  const [vx, vy, vl, vh] = vue, sx = cadre.l / vl, sy = cadre.h / vh;
  if (!aspect.alignement) return [sx, 0, 0, sy, cadre.x - vx * sx, cadre.y - vy * sy];
  const s = aspect.tranche ? Math.max(sx, sy) : Math.min(sx, sy);
  const [ax, ay] = aspect.alignement;
  return [s, 0, 0, s, cadre.x - vx * s + (cadre.l - vl * s) * ax, cadre.y - vy * s + (cadre.h - vh * s) * ay];
}

/** L'inverse d'une matrice, ou null si elle ecrase le plan. */
export function inverse(m: Matrice): Matrice | null {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-12) return null;
  const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

const coinsDe = (b: Boite): ReadonlyArray<readonly [number, number]> => [[b.x, b.y], [b.x + b.l, b.y], [b.x, b.y + b.h], [b.x + b.l, b.y + b.h]];

/**
 * Vrai si une forme (trait compris) sort du cadre. `versCadre` ramene les coordonnees ecrites aux
 * coordonnees dans lesquelles le cadre est donne ; la tolerance absorbe le bruit de calcul d'un contenu
 * qui touche exactement le bord.
 */
export function depasseDuCadre(formes: readonly Forme[], versCadre: Matrice, cadre: Cadre): boolean {
  const tol = 1e-4 * Math.max(cadre.l, cadre.h) + 1e-9;
  for (const f of formes) {
    const b = boiteAvecTrait(f);
    if (!b) continue;
    for (const [px, py] of coinsDe(b)) {
      const x = versCadre[0] * px + versCadre[2] * py + versCadre[4], y = versCadre[1] * px + versCadre[3] * py + versCadre[5];
      if (x < cadre.x - tol || y < cadre.y - tol || x > cadre.x + cadre.l + tol || y > cadre.y + cadre.h + tol) return true;
    }
  }
  return false;
}
