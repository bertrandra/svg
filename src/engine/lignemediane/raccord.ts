// L'enchainement des traces (ADR-0021), pour que le stylo se leve le moins possible :
//   - a une jonction, deux aretes qui se prolongent (un « X », la barre d'un « T ») ne font qu'un trace ;
//   - un trait scanne se coupe ou l'encre a manque : deux bouts libres (des extremites, pas des jonctions)
//     a moins de la distance donnee, qui se font face, se rejoignent par un segment droit.
// Les paires se choisissent par critere croissant (rectitude, distance), puis par indice : le meme ensemble
// de traces rend les memes enchainements.

import { COS_PROLONGE, type Pt } from './graphe.js';

/**
 * Un trace : une polyligne, fermee ou non ; `libres` dit si chacun de ses bouts est une extremite libre ;
 * `noeuds`, le noeud du graphe ou finit chaque bout (-1 sans noeud).
 */
export interface Trace { pts: Pt[]; ferme: boolean; libres: readonly [boolean, boolean]; noeuds?: readonly [number, number] }

interface Bout { trace: number; cote: 0 | 1; p: Pt; t: Pt }

const unitaire = (x: number, y: number): Pt => { const l = Math.sqrt(x * x + y * y); return l > 0 ? [x / l, y / l] : [0, 0]; };

/** La direction sortante d'un bout : du point a quelques pixels en dedans vers le bout. */
function tangenteSortante(pts: readonly Pt[], cote: 0 | 1): Pt {
  const n = pts.length, bout = cote === 0 ? pts[0] : pts[n - 1];
  if (!bout) return [0, 0];
  let parcouru = 0, avant = bout;
  for (let k = 1; k < n && parcouru < 4; k++) {
    const q = cote === 0 ? pts[k] : pts[n - 1 - k];
    if (!q) break;
    parcouru += Math.sqrt((q[0] - avant[0]) ** 2 + (q[1] - avant[1]) ** 2);
    avant = q;
  }
  return unitaire(bout[0] - avant[0], bout[1] - avant[1]);
}

/** Les bouts libres des traces ouverts de plus d'un point. */
function boutsLibres(traces: readonly Trace[]): Bout[] {
  const bouts: Bout[] = [];
  traces.forEach((t, k) => {
    if (t.ferme || t.pts.length < 2) return;
    for (const cote of [0, 1] as const) {
      const p = cote === 0 ? t.pts[0] : t.pts[t.pts.length - 1];
      if (t.libres[cote] && p) bouts.push({ trace: k, cote, p, t: tangenteSortante(t.pts, cote) });
    }
  });
  return bouts;
}

const longueurTrace = (pts: readonly Pt[]): number => {
  let s = 0;
  for (let k = 1; k < pts.length; k++) { const p = pts[k - 1], q = pts[k]; if (p && q) s += Math.sqrt((q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2); }
  return s;
};

/** Les paires de bouts a raccorder : proches, face a face, la plus courte d'abord. */
function paires(bouts: readonly Bout[], traces: readonly Trace[], distance: number): Array<[number, number]> {
  const candidats: Array<{ i: number; j: number; d: number }> = [];
  // Une grille de pas `distance` : on ne compare que des bouts de cases voisines.
  const cases = new Map<string, number[]>();
  const cle = (x: number, y: number) => Math.floor(x / distance) + ',' + Math.floor(y / distance);
  bouts.forEach((b, i) => { const c = cle(b.p[0], b.p[1]); cases.set(c, [...(cases.get(c) ?? []), i]); });
  bouts.forEach((b, i) => {
    const cx = Math.floor(b.p[0] / distance), cy = Math.floor(b.p[1] / distance);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      for (const j of cases.get((cx + dx) + ',' + (cy + dy)) ?? []) {
        const c = bouts[j];
        if (j <= i || !c) continue;
        const ex = c.p[0] - b.p[0], ey = c.p[1] - b.p[1], d = Math.sqrt(ex * ex + ey * ey);
        if (d > distance) continue;
        // Les deux bouts d'un meme trace ne se ferment en boucle que si le trace est bien plus long que la coupure.
        if (b.trace === c.trace && longueurTrace(traces[b.trace]?.pts ?? []) <= 3 * Math.max(d, 1)) continue;
        if (d > 1.5) {
          const u = unitaire(ex, ey);
          if (b.t[0] * u[0] + b.t[1] * u[1] < 0.2 || -(c.t[0] * u[0] + c.t[1] * u[1]) < 0.2) continue;
        }
        candidats.push({ i, j, d });
      }
    }
  });
  candidats.sort((x, y) => x.d - y.d || x.i - y.i || x.j - y.j);
  const pris = new Set<number>(), choisies: Array<[number, number]> = [];
  for (const { i, j } of candidats) {
    if (pris.has(i) || pris.has(j)) continue;
    pris.add(i); pris.add(j);
    choisies.push([i, j]);
  }
  return choisies;
}

/**
 * Raccorde les coupures de moins de `distance` : rend les traces, les raccordes enchaines en un seul (ferme
 * s'il revient a son depart). Sans distance, les traces tels quels.
 */
export function raccorder(traces: readonly Trace[], distance: number): Trace[] {
  if (!(distance > 0)) return [...traces];
  const bouts = boutsLibres(traces);
  const choisies = paires(bouts, traces, distance).flatMap(([i, j]): Array<[number, number]> => {
    const a = bouts[i], b = bouts[j];
    return a && b ? [[2 * a.trace + a.cote, 2 * b.trace + b.cote]] : [];
  });
  return enchainer(traces, choisies);
}

/** La direction qui part d'un bout de jonction vers l'interieur du trace, lue a `portee` du noeud (pres du noeud, le squelette plie). */
function directionSortante(pts: readonly Pt[], cote: 0 | 1, portee: number): Pt {
  const n = pts.length, depart = cote === 0 ? pts[0] : pts[n - 1];
  if (!depart) return [0, 0];
  let parcouru = 0, avant = depart, cible = depart;
  for (let k = 1; k < n; k++) {
    const q = cote === 0 ? pts[k] : pts[n - 1 - k];
    if (!q) break;
    parcouru += Math.sqrt((q[0] - avant[0]) ** 2 + (q[1] - avant[1]) ** 2);
    avant = q; cible = q;
    if (parcouru >= portee) break;
  }
  return unitaire(cible[0] - depart[0], cible[1] - depart[1]);
}

/**
 * Traverse les jonctions : a chaque noeud, les deux aretes qui se prolongent le mieux ne font qu'un trace, puis
 * les deux suivantes, tant qu'il en reste qui se prolongent. `portee` : la longueur sur laquelle se lit la
 * direction d'une arete (une fois et demie l'epaisseur du trait, ou le squelette ne plie plus).
 */
export function traverserJonctions(traces: readonly Trace[], portee: number): Trace[] {
  const parNoeud = new Map<number, Array<{ bout: number; t: Pt }>>();
  traces.forEach((tr, k) => {
    if (tr.ferme || !tr.noeuds) return;
    for (const cote of [0, 1] as const) {
      const v = tr.noeuds[cote];
      if (v < 0 || tr.libres[cote]) continue;
      parNoeud.set(v, [...(parNoeud.get(v) ?? []), { bout: 2 * k + cote, t: directionSortante(tr.pts, cote, portee) }]);
    }
  });
  const choisies: Array<[number, number]> = [], seules: Array<{ bout: number; pont: readonly [number, number]; t: Pt }> = [];
  for (const v of [...parNoeud.keys()].sort((a, b) => a - b)) {
    const bouts = parNoeud.get(v) ?? [], candidats: Array<{ i: number; j: number; c: number }> = [];
    for (let i = 0; i < bouts.length; i++) for (let j = i + 1; j < bouts.length; j++) {
      const a = bouts[i], b = bouts[j];
      if (!a || !b) continue;
      const c = a.t[0] * b.t[0] + a.t[1] * b.t[1];
      if (c < COS_PROLONGE) candidats.push({ i, j, c });
    }
    candidats.sort((x, y) => x.c - y.c || x.i - y.i || x.j - y.j);
    const pris = new Set<number>();
    for (const { i, j } of candidats) {
      const a = bouts[i], b = bouts[j];
      if (!a || !b || pris.has(i) || pris.has(j)) continue;
      pris.add(i); pris.add(j);
      choisies.push([a.bout, b.bout]);
    }
    // Une branche qui ne traverse pas (la jambe d'un « T ») viendra toucher le premier pont de son noeud.
    const premier = choisies.length && pris.size ? choisies[choisies.length - pris.size / 2] : undefined;
    if (premier) bouts.forEach((b, i) => { if (!pris.has(i)) seules.push({ bout: b.bout, pont: premier, t: b.t }); });
  }
  const restes = apparierSeules(traces, seules, 2 * portee, choisies);
  // Pres du noeud, le squelette plie vers la troisieme branche (la barre d'un « T » plonge vers sa jambe) : les
  // deux aretes qui se prolongent perdent leurs points a moins d'une demi-portee du noeud, et se rejoignent droit.
  const copies = traces.map(t => ({ ...t, pts: [...t.pts] }));
  for (const bout of choisies.flat()) {
    const t = copies[bout >> 1];
    if (t) t.pts = rogner(t.pts, (bout & 1) as 0 | 1, portee / 2);
  }
  for (const { bout, pont } of restes) {
    const t = copies[bout >> 1], a = boutDe(copies, pont[0]), b = boutDe(copies, pont[1]);
    if (!t || !a || !b) continue;
    const k = (bout & 1) === 0 ? 0 : t.pts.length - 1, p = t.pts[k];
    if (p) t.pts[k] = projeter(p, a, b);
  }
  return enchainer(copies, choisies);
}

/**
 * Au croisement aigu d'un trait epais, le squelette d'un « X » a deux jonctions de trois branches : a chacune, une
 * diagonale traverse et l'autre reste seule. Deux branches seules qui se prolongent (plus de 127 degres), a moins de
 * `distance`, sont la meme diagonale coupee par le croisement : elles s'apparient (ajoutees a `choisies`). Rend les
 * branches seules qui restent.
 */
function apparierSeules<S extends { bout: number; t: Pt }>(traces: readonly Trace[], seules: readonly S[], distance: number, choisies: Array<[number, number]>): S[] {
  const candidats: Array<{ i: number; j: number; d: number }> = [];
  seules.forEach((a, i) => seules.forEach((b, j) => {
    const pa = boutDe(traces, a.bout), pb = boutDe(traces, b.bout);
    if (j <= i || !pa || !pb || a.bout >> 1 === b.bout >> 1 || a.t[0] * b.t[0] + a.t[1] * b.t[1] >= COS_PROLONGE) return;
    const d = Math.sqrt((pb[0] - pa[0]) ** 2 + (pb[1] - pa[1]) ** 2);
    if (d > 0 && d <= distance) candidats.push({ i, j, d });
  }));
  candidats.sort((x, y) => x.d - y.d || x.i - y.i || x.j - y.j);
  const pris = new Set<number>();
  for (const { i, j } of candidats) {
    const a = seules[i], b = seules[j];
    if (!a || !b || pris.has(i) || pris.has(j)) continue;
    pris.add(i); pris.add(j);
    choisies.push([a.bout, b.bout]);
  }
  return seules.filter((_, i) => !pris.has(i));
}

const boutDe = (traces: readonly Trace[], bout: number): Pt | undefined => {
  const t = traces[bout >> 1];
  return t ? ((bout & 1) === 0 ? t.pts[0] : t.pts[t.pts.length - 1]) : undefined;
};

/** Le point du segment [a, b] le plus proche de p. */
function projeter(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return [a[0] + t * dx, a[1] + t * dy];
}

/** Retire d'un bout les points a moins de `rayon` du point de ce bout, en gardant au moins deux points. */
function rogner(pts: readonly Pt[], cote: 0 | 1, rayon: number): Pt[] {
  const r = cote === 0 ? [...pts] : [...pts].reverse(), bout = r[0];
  if (!bout) return [...pts];
  let k = 1;
  while (k < r.length - 2) {
    const q = r[k];
    if (!q || (q[0] - bout[0]) ** 2 + (q[1] - bout[1]) ** 2 >= rayon * rayon) break;
    k++;
  }
  const garde = r.slice(k);
  return cote === 0 ? garde : garde.reverse();
}

/**
 * Enchaine les traces dont les bouts sont apparies (un bout s'indexe 2 x trace + cote) : chaque chaine devient un
 * seul trace, ferme s'il revient a son depart. Les traces sans paire restent tels quels, dans leur ordre.
 */
export function enchainer(traces: readonly Trace[], choisies: ReadonlyArray<readonly [number, number]>): Trace[] {
  if (!choisies.length) return [...traces];
  const partenaire = new Map<number, number>();
  for (const [a, b] of choisies) { partenaire.set(a, b); partenaire.set(b, a); }
  const utilise = new Uint8Array(traces.length), sortie: Trace[] = [];
  const enchainer = (k0: number, entree: 0 | 1): Trace => {
    const pts: Pt[] = [];
    let k = k0, cote: 0 | 1 = entree, libreDebut = traces[k0]?.libres[entree] ?? false, libreFin = false, ferme = false;
    const noeudDebut = traces[k0]?.noeuds?.[entree] ?? -1;
    let noeudFin = -1;
    for (;;) {
      const t = traces[k];
      if (!t) break;
      utilise[k] = 1;
      pts.push(...(cote === 0 ? t.pts : [...t.pts].reverse()));
      const sortieBout = 2 * k + (1 - cote), p = partenaire.get(sortieBout);
      libreFin = t.libres[(1 - cote) as 0 | 1];
      noeudFin = t.noeuds?.[(1 - cote) as 0 | 1] ?? -1;
      if (p === undefined) break;
      const suivant = p >> 1;
      if (suivant === k0 && (p & 1) === entree) { ferme = true; break; }
      if (utilise[suivant]) break;
      k = suivant; cote = (p & 1) as 0 | 1;
    }
    if (ferme) { libreDebut = false; libreFin = false; }
    return { pts, ferme, libres: [libreDebut, libreFin], noeuds: ferme ? [-1, -1] : [noeudDebut, noeudFin] };
  };
  // D'abord les chaines qui ont un bout sans partenaire, depuis ce bout ; puis les cycles qui restent.
  traces.forEach((t, k) => {
    if (utilise[k] || t.ferme) return;
    if (!partenaire.has(2 * k)) sortie.push(enchainer(k, 0));
    else if (!partenaire.has(2 * k + 1)) sortie.push(enchainer(k, 1));
  });
  traces.forEach((t, k) => {
    if (utilise[k]) return;
    sortie.push(t.ferme ? t : enchainer(k, 0));
  });
  return sortie;
}
