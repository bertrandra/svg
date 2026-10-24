// Le style du trait au-dela de la couleur et de l'epaisseur : pointilles, bouts, jonctions, limite de pointe.
// Un seul endroit pour le lire (CSS), l'ecrire (SVG, PDF, toile), le mettre a l'echelle et le regler, sans
// quoi chaque module le ferait a sa facon. Tout champ est ABSENT quand il vaut ce que l'ecriture posait
// deja : c'est ce qui garde chaque SVG d'avant, octet pour octet.

import type { BoutNonPlat, Forme, JonctionNonRonde } from './types.js';
import { nb } from './chemins.js';
import { MSG_DECALAGE_UNITE, MSG_JONCTIONS_SVG2, MSG_POINTILLES_UNITE, type Proprietes } from './ignores.js';

/** La limite de pointe de SVG quand rien ne la dit. */
export const LIMITE_MITRE_DEFAUT = 4;

export type ChampsTrait = Pick<Forme, 'pointilles' | 'decalagePointilles' | 'bout' | 'jonction' | 'limiteMitre'>;

const CLES_TRAIT = ['pointilles', 'decalagePointilles', 'bout', 'jonction', 'limiteMitre'] as const;

// ---------------------------------------------------------------- lecture

const NOMBRE_UNITE = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|[a-z]+)?$/i;

type Longueur = { v: number } | 'unite' | 'invalide';

/**
 * Une longueur de pointille. Seul le nombre nu (et `px`, qui en SVG est l'unite du plan) se garde : un
 * pourcentage ou une autre unite demande une taille de reference qu'on ne calcule pas, et se dit. Une
 * valeur negative ou illisible est une erreur de syntaxe que tout navigateur ecarte : rien a dire.
 */
function lireLongueur(t: string): Longueur {
  const m = NOMBRE_UNITE.exec(t);
  const v = Number(m?.[1]);
  if (!m || !Number.isFinite(v) || v < 0) return 'invalide';
  const unite = (m[2] ?? '').toLowerCase();
  return unite === '' || unite === 'px' ? { v } : 'unite';
}

/**
 * Un motif en liste paire : un motif impair se repete une fois (specification SVG, « 5 3 2 » vaut
 * « 5 3 2 5 3 2 »), ce qui est ce que fait tout navigateur. On range la liste paire plutot que la liste lue : le
 * modele, la toile, le PDF et l'inspecteur n'ont ainsi qu'un seul cas a connaitre. Vide si le motif ne trace
 * rien de plus qu'un trait plein (liste vide, ou tout a zero), `null` s'il est invalide.
 */
export function normaliserPointilles(motif: readonly number[]): readonly number[] | null {
  if (motif.some(v => !Number.isFinite(v) || v < 0)) return null;
  if (!motif.some(v => v > 0)) return [];
  return motif.length % 2 ? [...motif, ...motif] : [...motif];
}

function lirePointilles(texte: string, k: number): { liste: readonly number[]; perte: boolean } {
  const t = texte.trim().toLowerCase();
  if (t === '' || t === 'none') return { liste: [], perte: false };
  const lus = t.split(/[\s,]+/).filter(Boolean).map(lireLongueur);
  if (lus.some(x => x === 'invalide')) return { liste: [], perte: false };
  if (lus.some(x => x === 'unite')) return { liste: [], perte: true };
  const motif = normaliserPointilles(lus.map(x => (typeof x === 'object' ? x.v : 0)));
  return { liste: (motif ?? []).map(v => v * k), perte: false };
}

function lireDecalage(texte: string, k: number): { v: number; perte: boolean } {
  const t = texte.trim().toLowerCase();
  const m = NOMBRE_UNITE.exec(t);
  const v = Number(m?.[1]);
  if (!m || !Number.isFinite(v)) return { v: 0, perte: false };
  const unite = m[2] ?? '';
  return unite === '' || unite === 'px' ? { v: v * k, perte: false } : { v: 0, perte: true };
}

/**
 * Le style de trait d'une forme, tel que ses proprietes heritees le disent. `k` est l'echelle de la
 * forme (les transformations des groupes) : les longueurs de pointille la suivent, comme l'epaisseur.
 * `ignores` dit ce qui est valide en CSS mais n'est pas porte (unites, jonctions de SVG 2).
 */
export function lireTrait(h: Proprietes, k: number): { champs: ChampsTrait; ignores: string[] } {
  const ignores: string[] = [];
  const motif = lirePointilles(h['stroke-dasharray'] ?? '', k);
  if (motif.perte) ignores.push(MSG_POINTILLES_UNITE);
  let decalage = 0;
  if (motif.liste.length) {
    const d = lireDecalage(h['stroke-dashoffset'] ?? '', k);
    if (d.perte) ignores.push(MSG_DECALAGE_UNITE);
    decalage = d.v;
  }
  const b = (h['stroke-linecap'] ?? '').trim().toLowerCase();
  const bout: BoutNonPlat | null = b === 'round' || b === 'square' ? b : null;
  const j = (h['stroke-linejoin'] ?? '').trim().toLowerCase();
  const jonction: JonctionNonRonde | null = j === 'miter' || j === 'bevel' ? j : null;
  if (j === 'arcs' || j === 'miter-clip') ignores.push(MSG_JONCTIONS_SVG2);
  // La limite n'agit que sur une jonction en pointe ; en dessous de 1 elle est invalide, donc ecartee par un navigateur.
  const limite = Number((h['stroke-miterlimit'] ?? '').trim() || Number.NaN);
  const utile = jonction === 'miter' && Number.isFinite(limite) && limite >= 1 && limite !== LIMITE_MITRE_DEFAUT;
  return {
    champs: {
      ...(motif.liste.length ? { pointilles: motif.liste } : {}),
      ...(motif.liste.length && decalage !== 0 ? { decalagePointilles: decalage } : {}),
      ...(bout ? { bout } : {}),
      ...(jonction ? { jonction } : {}),
      ...(utile ? { limiteMitre: limite } : {})
    },
    ignores
  };
}

// ---------------------------------------------------------------- ecriture

/** Les pointilles tels qu'ils s'ecrivent (au millieme), ou null si l'arrondi les a reduits a un trait plein. */
export function pointillesEcrits(f: ChampsTrait): { liste: string[]; decalage: string } | null {
  const liste = (f.pointilles ?? []).map(v => nb(v, 3));
  if (!liste.some(x => x !== '0')) return null;
  return { liste, decalage: nb(f.decalagePointilles ?? 0, 3) };
}

/**
 * Les attributs SVG du style de trait, dans l'ordre ou ils s'ecrivent. `stroke-linejoin` y est toujours,
 * `round` faute d'autre : c'est ce que l'ecriture posait avant que le modele porte la jonction. Le reste
 * n'apparait que s'il differe du defaut de SVG, et ne s'ecrit que ce qu'une relecture reconnait (pas de
 * limite de pointe sans pointe, pas de pointille arrondi a zero), pour qu'un SVG relu se reecrive pareil.
 */
export function attributsTrait(f: ChampsTrait): [string, string][] {
  const r: [string, string][] = [['stroke-linejoin', f.jonction ?? 'round']];
  if (f.bout) r.push(['stroke-linecap', f.bout]);
  if (f.jonction === 'miter' && f.limiteMitre !== undefined) {
    const l = nb(f.limiteMitre, 3);
    if (l !== String(LIMITE_MITRE_DEFAUT) && f.limiteMitre >= 1) r.push(['stroke-miterlimit', l]);
  }
  const p = pointillesEcrits(f);
  if (p) {
    r.push(['stroke-dasharray', p.liste.join(' ')]);
    if (p.decalage !== '0') r.push(['stroke-dashoffset', p.decalage]);
  }
  return r;
}

// ---------------------------------------------------------------- echelle, comparaison, reglage

/**
 * La forme mise a l'echelle `k` (le facteur lineaire d'une transformation) : l'epaisseur, les longueurs
 * des pointilles et leur decalage suivent, pour que le trait garde son aspect. La limite de pointe est
 * un rapport (pointe sur epaisseur) : elle ne change pas.
 */
export function echellerTrait(f: Forme, k: number): Forme {
  const e = { ...f, epaisseur: f.epaisseur * k };
  if (!f.pointilles) return e;
  return {
    ...e,
    pointilles: f.pointilles.map(v => v * k),
    ...(f.decalagePointilles !== undefined ? { decalagePointilles: f.decalagePointilles * k } : {})
  };
}

/** Vrai si deux formes ont le meme style de trait (champs absents compris). */
export function memeTrait(a: ChampsTrait, b: ChampsTrait): boolean {
  const pa = a.pointilles ?? [], pb = b.pointilles ?? [];
  return a.bout === b.bout && a.jonction === b.jonction && a.limiteMitre === b.limiteMitre
    && (a.decalagePointilles ?? 0) === (b.decalagePointilles ?? 0) && pa.length === pb.length && pa.every((v, i) => v === pb[i]);
}

/** Ce qu'on peut regler sur le style de trait : `butt`, `round` (jonction) et `null` (pointilles) reviennent au defaut, donc retirent le champ. */
export interface ReglageTrait {
  /** `null`, une liste vide ou toute a zero : trait plein. Une liste invalide (negatif, NaN) est ecartee. */
  pointilles?: readonly number[] | null;
  decalagePointilles?: number;
  bout?: 'butt' | BoutNonPlat;
  jonction?: 'round' | JonctionNonRonde;
  limiteMitre?: number;
}

/** La forme avec son style de trait regle ; la meme forme si rien ne change (l'historique s'en sert). */
export function reglerTrait(f: Forme, r: ReglageTrait): Forme {
  const motif = r.pointilles === undefined ? (f.pointilles ?? []) : r.pointilles === null ? [] : (normaliserPointilles(r.pointilles) ?? f.pointilles ?? []);
  const bout = r.bout === undefined ? f.bout : r.bout === 'butt' ? undefined : r.bout;
  const jonction = r.jonction === undefined ? f.jonction : r.jonction === 'round' ? undefined : r.jonction;
  const decalage = r.decalagePointilles ?? f.decalagePointilles ?? 0;
  const limite = r.limiteMitre ?? f.limiteMitre;
  const reste = Object.fromEntries(Object.entries(f).filter(([c]) => !(CLES_TRAIT as readonly string[]).includes(c)));
  const g = {
    ...reste,
    ...(motif.length ? { pointilles: motif } : {}),
    ...(motif.length && Number.isFinite(decalage) && decalage !== 0 ? { decalagePointilles: decalage } : {}),
    ...(bout ? { bout } : {}),
    ...(jonction ? { jonction } : {}),
    // Une limite ne se garde que pour une pointe, et valide : sinon elle ne dirait rien que le navigateur ne ferait.
    ...(jonction === 'miter' && limite !== undefined && Number.isFinite(limite) && limite >= 1 && limite !== LIMITE_MITRE_DEFAUT ? { limiteMitre: limite } : {})
  } as Forme;
  return memeTrait(f, g) ? f : g;
}

// ---------------------------------------------------------------- le motif, pour l'inspecteur

export type GenrePointilles = 'plein' | 'tirets' | 'pointilles' | 'mixte';

/** Le genre d'un motif : tirets (trait et blanc egaux), pointilles (points : un trait nul, qu'un bout rond rend visible), ou mixte. */
export function genrePointilles(motif: readonly number[] | undefined): GenrePointilles {
  if (!motif || motif.length === 0) return 'plein';
  if (motif.length === 2) {
    const [a = 0, b = 0] = motif;
    if (a === 0 && b > 0) return 'pointilles';
    if (a > 0 && a === b) return 'tirets';
  }
  return 'mixte';
}

/** Un motif de depart pour un genre, proportionnel a l'epaisseur du trait (au moins 1, pour qu'un trait fin reste lisible). */
export function motifDeGenre(genre: GenrePointilles, epaisseur: number): readonly number[] {
  const w = Math.max(epaisseur, 1);
  const arrondi = (v: number) => Math.round(v * 1000) / 1000;
  switch (genre) {
    case 'plein': return [];
    case 'tirets': return [arrondi(3 * w), arrondi(3 * w)];
    case 'pointilles': return [0, arrondi(2 * w)];
    case 'mixte': return [arrondi(4 * w), arrondi(2 * w), arrondi(w), arrondi(2 * w)];
  }
}
