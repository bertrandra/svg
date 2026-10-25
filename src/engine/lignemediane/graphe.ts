// Du squelette au graphe (ADR-0021) : les extremites (un voisin) et les jonctions (trois voisins ou plus,
// les pixels de jonction voisins fondus en un seul noeud, a leur barycentre) sont des noeuds ; entre deux
// noeuds, une arete suit les pixels a deux voisins. Ce qui reste a deux voisins sans noeud forme une boucle
// fermee (un « o »). Un pixel seul est un point (celui d'un « i »).
//
// L'elagage retire les barbules : une arete courte entre une extremite et une jonction, artefact de
// l'amincissement aux coins d'un trait epais. Apres chaque passe, un noeud reste a deux aretes se fond : ses
// deux aretes n'en font qu'une. Tout se parcourt dans un ordre fixe (ordre de lecture des pixels, puis des
// indices) : le meme squelette rend le meme graphe.

import { centre, voisins8, type Masque } from './masque.js';

export type Pt = readonly [number, number];

export interface Noeud { x: number; y: number }
/** Une arete du noeud `a` au noeud `b` ; ses points commencent a la position de `a` et finissent a celle de `b`. */
export interface Arete { a: number; b: number; pts: Pt[] }

export interface Graphe {
  noeuds: Noeud[];
  /** Les aretes vivantes ; null pour une arete retiree ou fondue dans une autre. */
  aretes: Array<Arete | null>;
  /** Les boucles sans noeud : la polyligne, sans repeter le premier point. */
  boucles: Pt[][];
  /** Les pixels isoles. */
  points: Pt[];
}

export const longueur = (pts: readonly Pt[]): number => {
  let s = 0;
  for (let k = 1; k < pts.length; k++) {
    const p = pts[k - 1], q = pts[k];
    if (p && q) s += Math.sqrt((q[0] - p[0]) * (q[0] - p[0]) + (q[1] - p[1]) * (q[1] - p[1]));
  }
  return s;
};

/** Ajoute un point s'il differe du dernier : un noeud d'un seul pixel a la position de son pixel. */
function pousser(pts: Pt[], p: Pt): void {
  const d = pts[pts.length - 1];
  if (!d || d[0] !== p[0] || d[1] !== p[1]) pts.push(p);
}

/** Les noeuds : les jonctions fondues par 8-connexite, puis les extremites. `id` recoit le noeud de chaque pixel. */
function poserNoeuds(m: Masque, deg: Uint8Array, id: Int32Array, noeuds: Noeud[], points: Pt[]): void {
  const v8 = voisins8(m.pas), pile: number[] = [];
  for (let i = 0; i < m.bits.length; i++) {
    if (!m.bits[i] || id[i] !== -1) continue;
    const d = deg[i] ?? 0;
    if (d === 0) { points.push(centre(m, i)); continue; }
    if (d === 2) continue;
    const n = noeuds.length;
    let sx = 0, sy = 0, compte = 0;
    pile.push(i); id[i] = n;
    while (pile.length) {
      const j = pile.pop() ?? 0, [x, y] = centre(m, j);
      sx += x; sy += y; compte++;
      if (d < 3) continue;
      for (const o of v8) {
        const k = j + o;
        if (m.bits[k] && id[k] === -1 && (deg[k] ?? 0) >= 3) { id[k] = n; pile.push(k); }
      }
    }
    noeuds.push({ x: sx / compte, y: sy / compte });
  }
}

/** Suit les pixels a deux voisins depuis `p` (un pixel de noeud) par son voisin `q`, jusqu'au noeud suivant. */
function suivre(m: Masque, id: Int32Array, vu: Uint8Array, noeuds: Noeud[], p: number, q: number): Arete {
  const v8 = voisins8(m.pas), a = id[p] ?? 0, na = noeuds[a] ?? { x: 0, y: 0 };
  const pts: Pt[] = [[na.x, na.y]];
  pousser(pts, centre(m, p));
  let prec = p, cour = q;
  for (;;) {
    pousser(pts, centre(m, cour));
    const ic = id[cour] ?? -1;
    if (ic >= 0) {
      const nb = noeuds[ic] ?? { x: 0, y: 0 };
      pousser(pts, [nb.x, nb.y]);
      return { a, b: ic, pts };
    }
    vu[cour] = 1;
    let suivant = -1;
    for (const o of v8) {
      const k = cour + o;
      if (k !== prec && m.bits[k] && !vu[k] && (id[k] ?? -1) !== a) { suivant = k; break; }
    }
    // Faute de suite (un retour sur l'arete deja suivie, ou le noeud de depart), l'arete revient a son noeud.
    if (suivant < 0) {
      for (const o of v8) { const k = cour + o; if (k !== prec && (id[k] ?? -1) === a) { suivant = k; break; } }
    }
    if (suivant < 0) {
      const b = noeuds.length;
      const [x, y] = centre(m, cour);
      noeuds.push({ x, y });
      id[cour] = b;
      return { a, b, pts };
    }
    prec = cour; cour = suivant;
  }
}

/** Une boucle sans noeud, depuis son premier pixel en ordre de lecture. */
function suivreBoucle(m: Masque, vu: Uint8Array, depart: number): Pt[] {
  const v8 = voisins8(m.pas), pts: Pt[] = [];
  let prec = -1, cour = depart;
  for (;;) {
    pts.push(centre(m, cour));
    vu[cour] = 1;
    let suivant = -1;
    for (const o of v8) {
      const k = cour + o;
      if (k !== prec && m.bits[k] && !vu[k]) { suivant = k; break; }
    }
    if (suivant < 0) return pts;
    prec = cour; cour = suivant;
  }
}

/** Le graphe d'un squelette d'un pixel. */
export function suivreSquelette(m: Masque): Graphe {
  const n = m.bits.length, v8 = voisins8(m.pas), deg = new Uint8Array(n), id = new Int32Array(n).fill(-1), vu = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!m.bits[i]) continue;
    let d = 0;
    for (const o of v8) d += m.bits[i + o] ?? 0;
    deg[i] = d;
  }
  const g: Graphe = { noeuds: [], aretes: [], boucles: [], points: [] };
  poserNoeuds(m, deg, id, g.noeuds, g.points);
  // Les aretes sans pixel interieur (une extremite collee a une jonction, deux extremites voisines) ne se suivent qu'une fois.
  const directes = new Set<number>();
  for (let p = 0; p < n; p++) {
    const ip = id[p] ?? -1;
    if (ip < 0 || (deg[p] ?? 0) === 0) continue;
    for (const o of v8) {
      const q = p + o, iq = id[q] ?? -1;
      if (!m.bits[q] || iq === ip || vu[q]) continue;
      if (iq >= 0) {
        const cle = Math.min(p, q) * n + Math.max(p, q);
        if (directes.has(cle)) continue;
        directes.add(cle);
      }
      g.aretes.push(suivre(m, id, vu, g.noeuds, p, q));
    }
  }
  for (let i = 0; i < n; i++) if (m.bits[i] && !vu[i] && (id[i] ?? -1) < 0 && (deg[i] ?? 0) === 2) g.boucles.push(suivreBoucle(m, vu, i));
  return g;
}

/** Le degre de chaque noeud (une arete qui revient a son noeud compte deux fois). */
export function degres(g: Graphe): number[] {
  const d = g.noeuds.map(() => 0);
  for (const e of g.aretes) if (e) { d[e.a] = (d[e.a] ?? 0) + 1; d[e.b] = (d[e.b] ?? 0) + 1; }
  return d;
}

/** Les aretes vivantes de chaque noeud, dans l'ordre de leurs indices. */
function incidences(g: Graphe): number[][] {
  const inc: number[][] = g.noeuds.map(() => []);
  g.aretes.forEach((e, k) => { if (e) { inc[e.a]?.push(k); if (e.b !== e.a) inc[e.b]?.push(k); } });
  return inc;
}

/**
 * Fond chaque noeud a deux aretes : les deux n'en font plus qu'une. Une arete seule qui revient a son noeud
 * devient une boucle fermee.
 */
export function fondreDegres2(g: Graphe): void {
  const inc = incidences(g), d = degres(g);
  for (let v = 0; v < g.noeuds.length; v++) {
    if (d[v] !== 2) continue;
    const liste = (inc[v] ?? []).filter(k => g.aretes[k]);
    const [k1, k2] = liste;
    const e1 = k1 !== undefined ? g.aretes[k1] : null;
    if (!e1 || k1 === undefined) continue;
    if (liste.length === 1) {
      // Une boucle accrochee a un noeud qui n'a plus qu'elle : une boucle fermee.
      g.boucles.push(e1.pts.slice(0, -1));
      g.aretes[k1] = null;
      d[v] = 0;
      continue;
    }
    const e2 = k2 !== undefined ? g.aretes[k2] : null;
    if (!e2 || k2 === undefined) continue;
    // e1 oriente pour finir en v, e2 pour en partir.
    const p1 = e1.b === v ? e1.pts : [...e1.pts].reverse(), de = e1.b === v ? e1.a : e1.b;
    const p2 = e2.a === v ? e2.pts : [...e2.pts].reverse(), vers = e2.a === v ? e2.b : e2.a;
    const fusion: Arete = { a: de, b: vers, pts: [...p1, ...p2.slice(1)] };
    g.aretes[k1] = null; g.aretes[k2] = null;
    const k = g.aretes.length;
    g.aretes.push(fusion);
    for (const w of new Set([de, vers])) inc[w] = (inc[w] ?? []).filter(x => x !== k1 && x !== k2).concat(k);
    d[v] = 0;
  }
}

/**
 * Retire les barbules de moins de `longueurMin` : une arete d'une extremite a une jonction. Les plus courtes
 * d'abord ; une jonction garde toujours au moins deux aretes (deux barbules d'un « Y » minuscule ne
 * l'effacent pas). Passes repetees jusqu'a ce que rien ne bouge, bornees.
 */
export function elaguer(g: Graphe, longueurMin: number): number {
  let retirees = 0;
  fondreDegres2(g);
  if (!(longueurMin > 0)) return 0;
  for (let passe = 0; passe < 16; passe++) {
    const d = degres(g);
    const barbules = g.aretes
      .map((e, k) => ({ e, k, l: e ? longueur(e.pts) : Infinity }))
      .filter(({ e, l }) => e && e.a !== e.b && l < longueurMin && ((d[e.a] === 1 && (d[e.b] ?? 0) >= 3) || (d[e.b] === 1 && (d[e.a] ?? 0) >= 3)))
      .sort((x, y) => x.l - y.l || x.k - y.k);
    let change = false;
    for (const { e, k } of barbules) {
      if (!e) continue;
      const j = d[e.a] === 1 ? e.b : e.a, bout = j === e.a ? e.b : e.a;
      if ((d[j] ?? 0) < 3) continue;
      g.aretes[k] = null;
      d[j] = (d[j] ?? 0) - 1; d[bout] = 0;
      retirees++; change = true;
    }
    fondreDegres2(g);
    if (!change) break;
  }
  return retirees;
}

/** La direction d'une arete depuis son noeud `v`, lue a `portee` le long de l'arete (pres du noeud, le squelette plie). */
function directionDepuis(e: Arete, v: number, portee: number): Pt {
  const pts = e.a === v ? e.pts : [...e.pts].reverse(), depart = pts[0];
  if (!depart) return [0, 0];
  let parcouru = 0, cible = depart;
  for (let k = 1; k < pts.length && parcouru < portee; k++) {
    const p = pts[k - 1], q = pts[k];
    if (!p || !q) break;
    parcouru += Math.sqrt((q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2);
    cible = q;
  }
  const x = cible[0] - depart[0], y = cible[1] - depart[1], l = Math.sqrt(x * x + y * y);
  return l > 0 ? [x / l, y / l] : [0, 0];
}

/** Sous ce cosinus (plus de 127 degres), deux branches se prolongent : a travers une jonction, ou d'une jonction a l'autre. */
export const COS_PROLONGE = -0.6;
const prolonge = (a: Pt, b: Pt): boolean => a[0] * b[0] + a[1] * b[1] < COS_PROLONGE;

/**
 * Vrai si deux jonctions de trois branches, reliees par l'arete `e`, sont un seul croisement : chaque branche de l'une
 * prolonge une branche de l'autre, et les deux branches d'une meme jonction ne se prolongent pas (sinon c'est un « H »,
 * dont chaque jambe traverse deja sa jonction).
 */
function estCroisement(g: Graphe, e: Arete, k: number, portee: number): boolean {
  const branches = (v: number) => g.aretes.flatMap((f, j) => (f && j !== k && f.a !== f.b && (f.a === v || f.b === v) ? [directionDepuis(f, v, portee)] : []));
  const [a1, a2] = branches(e.a), [b1, b2] = branches(e.b);
  if (!a1 || !a2 || !b1 || !b2 || prolonge(a1, a2) || prolonge(b1, b2)) return false;
  return (prolonge(a1, b1) && prolonge(a2, b2)) || (prolonge(a1, b2) && prolonge(a2, b1));
}

/**
 * Fond deux jonctions de trois branches reliees par une arete plus courte que `longueurMax`, quand elles sont un seul
 * croisement : le squelette d'un « X » (ou d'un « 8 ») trace epais a deux jonctions reliees par un segment, d'autant plus
 * long que l'angle est aigu, la ou l'oeil voit un croisement de quatre branches. Le noeud garde prend le milieu ; les
 * aretes du noeud fondu y sont rebranchees. Les plus courtes d'abord.
 */
export function fondreJonctionsProches(g: Graphe, longueurMax: number, portee: number): number {
  let fondues = 0;
  for (let passe = 0; passe < 64; passe++) {
    const d = degres(g);
    let meilleure = -1, l = Infinity;
    g.aretes.forEach((e, k) => {
      if (!e || e.a === e.b || d[e.a] !== 3 || d[e.b] !== 3) return;
      const le = longueur(e.pts);
      if (le < longueurMax && le < l && estCroisement(g, e, k, portee)) { l = le; meilleure = k; }
    });
    const e = meilleure >= 0 ? g.aretes[meilleure] : null;
    if (!e) break;
    const na = g.noeuds[e.a], nb = g.noeuds[e.b];
    if (!na || !nb) break;
    const milieu: Pt = [(na.x + nb.x) / 2, (na.y + nb.y) / 2];
    g.noeuds[e.a] = { x: milieu[0], y: milieu[1] };
    g.aretes[meilleure] = null;
    g.aretes.forEach((f, k) => {
      if (!f || (f.a !== e.a && f.a !== e.b && f.b !== e.a && f.b !== e.b)) return;
      const pts = [...f.pts];
      if (f.a === e.a || f.a === e.b) pts.unshift(milieu);
      if (f.b === e.a || f.b === e.b) pts.push(milieu);
      g.aretes[k] = { a: f.a === e.b ? e.a : f.a, b: f.b === e.b ? e.a : f.b, pts };
    });
    fondues++;
  }
  return fondues;
}
