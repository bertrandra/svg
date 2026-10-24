// Les outils de polyligne et d'ajustement de courbes, purs et deterministes : la simplification d'un
// tracé (Ramer-Douglas-Peucker) et l'ajustement de courbes de Bezier cubiques sur une suite de points
// (Schneider, « An Algorithm for Automatically Fitting Digitized Curves », Graphics Gems, 1990).
//
// Determinisme : rien que des + - * / et des racines carrees (arrondies exactement par la norme IEEE),
// jamais de sin, cos ni pow dont la derniere decimale varie d'un moteur a l'autre ; les iterations ont
// un nombre fixe ; les egalites se departagent par le premier indice. Un ajustement n'est rendu que
// verifie : chaque point source est a moins de la tolerance de la courbe, et chaque point de la courbe
// a moins de la tolerance de la polyligne source. Sinon on rend null, et l'appelant garde ses segments.

export type Pt = readonly [number, number];

/** Une courbe cubique ajustee sur les points `de` a `a` (inclus) de la suite source. */
export interface PieceCubique { readonly c1: Pt; readonly c2: Pt; readonly fin: Pt; readonly de: number; readonly a: number }

const moins = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const plus = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const fois = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
const scalaire = (a: Pt, b: Pt): number => a[0] * b[0] + a[1] * b[1];
const longueur = (a: Pt): number => Math.sqrt(scalaire(a, a));
const unitaire = (a: Pt): Pt => { const l = longueur(a); return l > 0 ? [a[0] / l, a[1] / l] : [0, 0]; };

/** Le carre de la distance d'un point au segment [a, b]. */
export function distanceSegment2(p: Pt, a: Pt, b: Pt): number {
  const ab = moins(b, a), ap = moins(p, a), l2 = scalaire(ab, ab);
  const t = l2 > 0 ? Math.max(0, Math.min(1, scalaire(ap, ab) / l2)) : 0;
  const q = plus(a, fois(ab, t)), d = moins(p, q);
  return scalaire(d, d);
}

/** Le carre de la distance d'un point a une polyligne (a un seul point : a ce point). */
export function distancePolyligne2(p: Pt, pts: readonly Pt[], de = 0, a = pts.length - 1): number {
  let m = Infinity;
  const premier = pts[de];
  if (premier && de >= a) { const d = moins(p, premier); return scalaire(d, d); }
  for (let i = de; i < a; i++) {
    const s = pts[i], t = pts[i + 1];
    if (s && t) m = Math.min(m, distanceSegment2(p, s, t));
  }
  return m;
}

/**
 * Ramer-Douglas-Peucker sur une polyligne ouverte : les indices gardes, extremites comprises. Tout point
 * retire est a moins de `tolerance` de la corde qui le remplace. Refaire l'operation sur le resultat, a la
 * meme tolerance, ne retire plus rien : les points choisis restent les plus ecartes de leur intervalle.
 */
export function simplifierPolyligne(pts: readonly Pt[], tolerance: number): number[] {
  const n = pts.length;
  if (n <= 2 || !(tolerance > 0)) return pts.map((_, i) => i);
  const garde = new Array<boolean>(n).fill(false), t2 = tolerance * tolerance;
  garde[0] = true;
  garde[n - 1] = true;
  const pile: Array<[number, number]> = [[0, n - 1]];
  for (let intervalle = pile.pop(); intervalle; intervalle = pile.pop()) {
    const [i, j] = intervalle, a = pts[i], b = pts[j];
    if (!a || !b || j - i < 2) continue;
    let pire = -1, indice = -1;
    for (let k = i + 1; k < j; k++) {
      const p = pts[k];
      const d = p ? distanceSegment2(p, a, b) : 0;
      if (d > pire) { pire = d; indice = k; }
    }
    if (pire > t2 && indice > 0) { garde[indice] = true; pile.push([i, indice], [indice, j]); }
  }
  return garde.flatMap((g, i) => (g ? [i] : []));
}

// ---------------------------------------------------------------- courbes cubiques

type Cubique = readonly [Pt, Pt, Pt, Pt];

const evaluer = (c: Cubique, u: number): Pt => {
  const v = 1 - u, b0 = v * v * v, b1 = 3 * u * v * v, b2 = 3 * u * u * v, b3 = u * u * u;
  return [b0 * c[0][0] + b1 * c[1][0] + b2 * c[2][0] + b3 * c[3][0], b0 * c[0][1] + b1 * c[1][1] + b2 * c[2][1] + b3 * c[3][1]];
};

/** La derivee premiere (ordre 1) ou seconde (ordre 2) de la cubique en u. */
function deriver(c: Cubique, u: number, ordre: 1 | 2): Pt {
  const [p0, p1, p2, p3] = c, v = 1 - u;
  if (ordre === 1) return plus(plus(fois(moins(p1, p0), 3 * v * v), fois(moins(p2, p1), 6 * v * u)), fois(moins(p3, p2), 3 * u * u));
  return plus(fois(plus(moins(p2, fois(p1, 2)), p0), 6 * v), fois(plus(moins(p3, fois(p2, 2)), p1), 6 * u));
}

/** Les parametres des points `i0`..`i1` par longueur de corde, de 0 a 1. */
function parametrer(pts: readonly Pt[], i0: number, i1: number): number[] {
  const u = [0];
  for (let i = i0 + 1; i <= i1; i++) {
    const a = pts[i - 1], b = pts[i];
    u.push((u[u.length - 1] ?? 0) + (a && b ? longueur(moins(b, a)) : 0));
  }
  const total = u[u.length - 1] ?? 0;
  return u.map(x => (total > 0 ? x / total : 0));
}

/** La cubique des moindres carres entre les points `i0` et `i1`, aux tangentes d'extremite donnees (t2 pointe vers l'interieur). */
function genererBezier(pts: readonly Pt[], i0: number, i1: number, u: readonly number[], t1: Pt, t2: Pt): Cubique {
  const p0 = pts[i0] ?? [0, 0], p3 = pts[i1] ?? [0, 0];
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  for (let k = 0; k <= i1 - i0; k++) {
    const t = u[k] ?? 0, v = 1 - t, b0 = v * v * v, b1 = 3 * t * v * v, b2 = 3 * t * t * v, b3 = t * t * t;
    const a1 = fois(t1, b1), a2 = fois(t2, b2);
    c00 += scalaire(a1, a1); c01 += scalaire(a1, a2); c11 += scalaire(a2, a2);
    const reste = moins(pts[i0 + k] ?? p0, plus(fois(p0, b0 + b1), fois(p3, b2 + b3)));
    x0 += scalaire(a1, reste); x1 += scalaire(a2, reste);
  }
  const det = c00 * c11 - c01 * c01, corde = longueur(moins(p3, p0));
  let alpha1 = det !== 0 ? (x0 * c11 - x1 * c01) / det : 0, alpha2 = det !== 0 ? (c00 * x1 - c01 * x0) / det : 0;
  // Des poignees nulles ou renversees donneraient une boucle : on retombe sur le tiers de la corde.
  if (alpha1 < 1e-6 * corde || alpha2 < 1e-6 * corde) { alpha1 = corde / 3; alpha2 = corde / 3; }
  return [p0, plus(p0, fois(t1, alpha1)), plus(p3, fois(t2, alpha2)), p3];
}

/** Un pas de Newton-Raphson par point pour rapprocher chaque parametre du point le plus proche de la courbe. */
function reparametrer(pts: readonly Pt[], i0: number, c: Cubique, u: readonly number[]): number[] {
  return u.map((t, k) => {
    const p = pts[i0 + k];
    if (!p) return t;
    const d = moins(evaluer(c, t), p), d1 = deriver(c, t, 1), d2 = deriver(c, t, 2);
    const den = scalaire(d1, d1) + scalaire(d, d2);
    return den === 0 ? t : Math.max(0, Math.min(1, t - scalaire(d, d1) / den));
  });
}

/** Le plus grand ecart au carre entre les points et la courbe aux parametres u, et l'indice (dans pts) qui le porte. */
function ecartMax(pts: readonly Pt[], i0: number, i1: number, c: Cubique, u: readonly number[]): { e2: number; indice: number } {
  let e2 = 0, indice = Math.floor((i0 + i1) / 2);
  for (let k = 1; k < i1 - i0; k++) {
    const p = pts[i0 + k];
    if (!p) continue;
    const d = moins(evaluer(c, u[k] ?? 0), p), e = scalaire(d, d);
    if (e > e2) { e2 = e; indice = i0 + k; }
  }
  return { e2, indice };
}

const PROFONDEUR_MAX = 14;

/** Ajuste les points i0..i1 par une ou plusieurs cubiques ; null si la profondeur de coupe est atteinte. */
function ajusterTranche(pts: readonly Pt[], i0: number, i1: number, t1: Pt, t2: Pt, tolerance: number, profondeur: number): PieceCubique[] | null {
  const p0 = pts[i0], p3 = pts[i1];
  if (!p0 || !p3) return null;
  if (i1 - i0 === 1) {
    const d = fois(moins(p3, p0), 1 / 3);
    return [{ c1: plus(p0, d), c2: moins(p3, d), fin: p3, de: i0, a: i1 }];
  }
  let u = parametrer(pts, i0, i1), c = genererBezier(pts, i0, i1, u, t1, t2), m = ecartMax(pts, i0, i1, c, u);
  const t2max = tolerance * tolerance;
  if (m.e2 > t2max && m.e2 < 16 * t2max) {
    for (let essai = 0; essai < 4 && m.e2 > t2max; essai++) {
      u = reparametrer(pts, i0, c, u);
      c = genererBezier(pts, i0, i1, u, t1, t2);
      m = ecartMax(pts, i0, i1, c, u);
    }
  }
  if (m.e2 <= t2max) return [{ c1: c[1], c2: c[2], fin: p3, de: i0, a: i1 }];
  if (profondeur >= PROFONDEUR_MAX) return null;
  const coupe = Math.max(i0 + 1, Math.min(i1 - 1, m.indice)), avant = pts[coupe - 1], apres = pts[coupe + 1], centre = pts[coupe];
  if (!avant || !apres || !centre) return null;
  const tangente = unitaire(moins(avant, apres));
  const gauche = ajusterTranche(pts, i0, coupe, t1, tangente, tolerance, profondeur + 1);
  const droite = gauche && ajusterTranche(pts, coupe, i1, fois(tangente, -1), t2, tolerance, profondeur + 1);
  return gauche && droite ? [...gauche, ...droite] : null;
}

const ECHANTILLONS = 24;

/** Vrai si les pieces restent a moins de `tolerance` de la polyligne source, et la polyligne d'elles. */
function verifier(pts: readonly Pt[], pieces: readonly PieceCubique[], tolerance: number): boolean {
  const t2 = tolerance * tolerance;
  for (const piece of pieces) {
    const depart = pts[piece.de];
    if (!depart) return false;
    const c: Cubique = [depart, piece.c1, piece.c2, piece.fin];
    const echantillons: Pt[] = [];
    for (let k = 0; k <= ECHANTILLONS; k++) echantillons.push(evaluer(c, k / ECHANTILLONS));
    for (const e of echantillons) if (distancePolyligne2(e, pts, piece.de, piece.a) > t2) return false;
    for (let i = piece.de; i <= piece.a; i++) { const p = pts[i]; if (p && distancePolyligne2(p, echantillons) > t2) return false; }
  }
  return true;
}

/**
 * La tangente en `a`, avancant vers b puis c : la direction du premier segment, corrigee de la moitie de
 * son virage vers le second. Le premier segment seul penche d'un demi-pas vers l'interieur de la courbe.
 */
const tangenteAuBout = (a: Pt, b: Pt, c: Pt): Pt => {
  const u = unitaire(moins(b, a)), v = unitaire(moins(c, b));
  return unitaire(moins(fois(u, 1.5), fois(v, 0.5)));
};

/**
 * Ajuste une suite de points par des cubiques enchainees, a `tolerance` pres (verifie dans les deux sens),
 * ou rend null. Les tangentes d'extremite se deduisent des premiers et derniers segments, sauf si on les
 * donne (`tanDebut` va dans le sens du trace, `tanFin` revient vers l'interieur) : une boucle sans angle
 * se ferme ainsi sans pli.
 */
export function ajusterCubiques(pts: readonly Pt[], tolerance: number, tanDebut?: Pt, tanFin?: Pt): PieceCubique[] | null {
  const n = pts.length, a = pts[0], b = pts[1], y = pts[n - 2], z = pts[n - 1];
  if (n < 2 || !a || !b || !y || !z || !(tolerance > 0)) return null;
  const c = pts[2], x = pts[n - 3];
  const t1 = tanDebut ?? (c ? tangenteAuBout(a, b, c) : unitaire(moins(b, a))), t2 = tanFin ?? (x ? tangenteAuBout(z, y, x) : unitaire(moins(y, z)));
  const pieces = ajusterTranche(pts, 0, n - 1, t1, t2, tolerance * 0.5, 0);
  return pieces && verifier(pts, pieces, tolerance * 0.9) ? pieces : null;
}

// ---------------------------------------------------------------- anneaux

/** Une commande de chemin, en absolu : la forme que rend la reconstruction d'un anneau. */
export interface CommandeAnneau { readonly c: 'M' | 'L' | 'C' | 'Z'; readonly p: readonly number[] }

// Au-dela de 30 degres de deviation d'un segment au suivant, un sommet est un coin et non un point de courbe.
const COS_COIN = 0.8660254037844386;

/** Sous ce sinus, un virage est nul : le trace continue droit. */
const SINUS_DROIT = 1e-4;
/** Un segment huit fois plus long que son voisin est un cote droit contre une courbe aplatie finement. */
const RAPPORT_DROIT = 8;

/**
 * Les indices des coins d'un anneau (sans point de fermeture repete). Avec `rectilignes`, la ou un long cote
 * droit rejoint une courbe aplatie en petits segments (un cote qui prolonge un arc de cercle) devient aussi un
 * point de coupure : une seule cubique ne tient ni le cote ni l'arc, et sans cette coupure l'anneau entier
 * reste en segments.
 */
function coins(pts: readonly Pt[], rectilignes: boolean): number[] {
  const n = pts.length, out: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[(i + n - 1) % n], q = pts[i], r = pts[(i + 1) % n];
    if (!p || !q || !r) continue;
    const a = moins(q, p), b = moins(r, q), la = longueur(a), lb = longueur(b);
    if (la === 0 || lb === 0 || scalaire(a, b) < COS_COIN * la * lb) { out.push(i); continue; }
    const sinus = Math.abs(a[0] * b[1] - a[1] * b[0]) / (la * lb);
    if (rectilignes && sinus > SINUS_DROIT && Math.max(la, lb) > RAPPORT_DROIT * Math.min(la, lb)) out.push(i);
  }
  return out;
}

/** Une piece cubique est-elle une droite, a la tolerance pres ? */
function estDroite(depart: Pt, p: PieceCubique, tolerance: number): boolean {
  const t2 = tolerance * tolerance;
  return distanceSegment2(p.c1, depart, p.fin) <= t2 && distanceSegment2(p.c2, depart, p.fin) <= t2;
}

/** Les commandes (L ou C) d'une tranche de points entre deux coins, en courbes quand c'est plus court et sur. */
function tranche(pts: readonly Pt[], tolerance: number, tanDebut?: Pt, tanFin?: Pt): CommandeAnneau[] {
  const segments = pts.length - 1;
  const droit = (): CommandeAnneau[] => pts.slice(1).map(q => ({ c: 'L', p: [q[0], q[1]] }));
  if (segments < 3) return droit();
  const pieces = ajusterCubiques(pts, tolerance, tanDebut, tanFin);
  // Une courbe pese trois points : on ne la prend que si elle est plus courte que les droites qu'elle remplace.
  if (!pieces || pieces.length * 3 >= segments) return droit();
  let depart = pts[0] ?? [0, 0];
  return pieces.map((p): CommandeAnneau => {
    const sortie: CommandeAnneau = estDroite(depart, p, tolerance) ? { c: 'L', p: [p.fin[0], p.fin[1]] } : { c: 'C', p: [p.c1[0], p.c1[1], p.c2[0], p.c2[1], p.fin[0], p.fin[1]] };
    depart = p.fin;
    return sortie;
  });
}

/**
 * Reconstruit un anneau de polygone (sans point de fermeture repete) en commandes M, L, C, Z : les suites
 * de sommets qui tournent doucement redeviennent des courbes cubiques, a `tolerance` pres ; les coins et
 * tout ce que l'ajustement ne tient pas a cette tolerance restent des segments droits.
 */
export function reconstruireAnneau(anneau: readonly Pt[], tolerance: number, rectilignes = false): CommandeAnneau[] {
  const pts = anneau.filter((p, i) => { const q = anneau[(i + anneau.length - 1) % anneau.length]; return !q || p[0] !== q[0] || p[1] !== q[1]; });
  const n = pts.length, premier = pts[0];
  if (n < 4 || !premier) return n ? [{ c: 'M', p: [premier?.[0] ?? 0, premier?.[1] ?? 0] }, ...pts.slice(1).map((q): CommandeAnneau => ({ c: 'L', p: [q[0], q[1]] })), { c: 'Z', p: [] }] : [];
  const sommets = coins(pts, rectilignes), depart = sommets[0] ?? 0;
  const tournee = [...pts.slice(depart), ...pts.slice(0, depart)];
  const out: CommandeAnneau[] = [{ c: 'M', p: [tournee[0]?.[0] ?? 0, tournee[0]?.[1] ?? 0] }];
  if (!sommets.length) {
    // Aucun coin : une seule boucle, dont les tangentes de jonction se prennent sur les voisins de part et d'autre.
    const suivant = tournee[1], precedent = tournee[n - 1];
    if (!suivant || !precedent) return [];
    out.push(...tranche([...tournee, premier], tolerance, unitaire(moins(suivant, precedent)), unitaire(moins(precedent, suivant))));
  } else {
    const bornes = sommets.map(s => s - depart).map(s => (s < 0 ? s + n : s));
    for (let k = 0; k < bornes.length; k++) {
      const a = bornes[k] ?? 0, b = k + 1 < bornes.length ? bornes[k + 1] ?? n : n;
      out.push(...tranche([...tournee.slice(a, b), tournee[b % n] ?? premier], tolerance));
    }
  }
  const dernier = out[out.length - 1], debut = out[0];
  // Le dernier point revient au depart : le Z le trace.
  if (dernier && debut && dernier.c === 'L' && dernier.p[0] === debut.p[0] && dernier.p[1] === debut.p[1]) out.pop();
  out.push({ c: 'Z', p: [] });
  return out;
}
