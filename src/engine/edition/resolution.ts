// La resolution des references d'un SVG riche (ADR-0012, annexe 8 §5.2, paquet 3-A) : une peinture `url(#id)` vers sa definition, une
// chaine `href` d'heritage (degrades aujourd'hui, motifs a l'etape 9), les longueurs en nombres, pixels ou pourcentages. Ecrite pour
// servir aussi aux decoupes, masques, motifs et filtres (etapes 5, 6, 7, 9) : rien ici ne sait ce qu'est un degrade.
//
// Pur et borne : une chaine ne depasse jamais `CHAINE_HREF_MAX` maillons, un cycle se dit, un renvoi a un autre fichier se dit ; rien
// n'est jamais telecharge ni devine. Ne leve jamais.

import type { Noeud } from '../../util/xml.js';

/** Les maillons d'une chaine `href` (un degrade ou un motif qui herite d'un autre), au plus (annexe 5 §2). */
export const CHAINE_HREF_MAX = 16;
/** L'imbrication des definitions (un masque qui contient un motif qui contient un masque…), au plus (annexe 5 §2). */
export const PROFONDEUR_DEFS_MAX = 8;
/** Les noeuds de toutes les definitions lues (feuilles, groupes, peintures distinctes), au plus (annexe 5 §2). */
export const NOEUDS_DEFS_MAX = 20_000;

/** Une reference `url(…)` lue : vers un element du document (et la couleur de secours qui la suit), ou vers ailleurs. */
export type Reference =
  | { readonly genre: 'locale'; readonly id: string; readonly secours?: string }
  | { readonly genre: 'externe'; readonly adresse: string };

/**
 * Une valeur `url(#id)`, `url("#id")`, `url('#id')`, suivie ou non d'une couleur de secours (`url(#a) red`) ; null si ce n'est pas une
 * reference. Ce qui ne commence pas par « # » renvoie a un autre fichier ou a une adresse : jamais suivi.
 */
export function lireReference(valeur: string): Reference | null {
  const m = /^\s*url\(\s*(["']?)([^"')]*)\1\s*\)\s*(.*?)\s*$/is.exec(valeur);
  if (!m) return null;
  const cible = (m[2] ?? '').trim(), reste = (m[3] ?? '').trim();
  if (!cible.startsWith('#')) return { genre: 'externe', adresse: cible.slice(0, 80) };
  return { genre: 'locale', id: cible.slice(1), ...(reste ? { secours: reste } : {}) };
}

/** Le renvoi d'heritage d'un element : `href` l'emporte sur `xlink:href` (SVG 2), comme dans un navigateur. */
export const hrefDe = (n: Noeud): string | undefined => n.attributs.href ?? n.attributs['xlink:href'];

/** Une chaine d'heritage suivie : les maillons, de l'element a son plus lointain ancetre ; ou ce qui l'a arretee. */
export type Chaine =
  | { readonly maillons: readonly Noeud[] }
  | { readonly cycle: string }
  | { readonly externe: string }
  | { readonly trop: true };

/**
 * La chaine `href` d'un element : lui, puis l'element qu'il cite, et ainsi de suite tant que la cible est `admise` (un degrade ne
 * herite que d'un degrade : une cible d'un autre genre ou absente arrete la chaine sans rien refuser, comme un navigateur qui
 * l'ignore). Un cycle, un renvoi a un autre fichier ou plus de `CHAINE_HREF_MAX` maillons arretent tout et se disent.
 */
export function chaineHref(n: Noeud, ids: ReadonlyMap<string, Noeud>, admise: (c: Noeud) => boolean): Chaine {
  const maillons: Noeud[] = [n], vus = new Set<Noeud>([n]);
  for (let courant = n; ;) {
    const h = hrefDe(courant)?.trim();
    if (h === undefined || h === '') return { maillons };
    if (!h.startsWith('#')) return { externe: h.slice(0, 80) };
    const cible = ids.get(h.slice(1));
    if (!cible || !admise(cible)) return { maillons };
    if (vus.has(cible)) return { cycle: h.slice(1, 41) };
    if (maillons.length >= CHAINE_HREF_MAX) return { trop: true };
    maillons.push(cible);
    vus.add(cible);
    courant = cible;
  }
}

/** Le premier maillon qui porte cet attribut (l'element lui-meme d'abord, puis ceux dont il herite). */
export function attributHerite(maillons: readonly Noeud[], nom: string): string | undefined {
  for (const m of maillons) { const v = m.attributs[nom]; if (v !== undefined) return v; }
  return undefined;
}

/** Une longueur lue : un nombre, ou une part (un pourcentage, a rapporter a une reference), ou une unite qu'on ne calcule pas. */
export type Longueur = { readonly v: number; readonly part: boolean } | 'unite' | null;

/**
 * Une longueur d'attribut de definition : un nombre, des pixels, ou un pourcentage (rendu en part : `50%` vaut 0,5). Null si absente
 * ou illisible (l'attribut est alors ignore, comme dans un navigateur) ; 'unite' pour mm, em… qu'on ne convertit pas ici.
 */
export function lireLongueur(v: string | undefined): Longueur {
  if (v === undefined) return null;
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(px|%|[a-z]+)?\s*$/i.exec(v);
  if (!m) return null;
  const x = Number(m[1]);
  if (!Number.isFinite(x)) return null;
  const u = (m[2] ?? '').toLowerCase();
  if (u === '%') return { v: x / 100, part: true };
  if (u === '' || u === 'px') return { v: x, part: false };
  return 'unite';
}

/** Une position d'arret ou une opacite : un nombre ou un pourcentage, bornee dans [0 ; 1] ; `defaut` si illisible. */
export function lireFraction(v: string | undefined, defaut: number): number {
  const l = lireLongueur(v);
  if (l === null || l === 'unite') return defaut;
  return Math.min(1, Math.max(0, l.v));
}
