// Un chemin aplati en polylignes, pour tout ce qui epaissit ou decale un trace : contour en forme,
// decalage. Chaque sous-chemin devient une suite de points, ouverte ou fermee, avec pour chaque sommet
// ce qu'il est : un vrai coin (la jonction demandee s'y applique) ou un point d'une courbe aplatie (la
// jonction n'y a pas de sens : le trace y est lisse, une pointe y deformerait le decalage).
//
// L'aplatissement est celui des booleens (meme borne d'ecart, meme nombre de segments) : un contour
// etendu et une union de formes partent du meme polygone. Pur et deterministe : des + - * / et des
// racines carrees, jamais de sin ni de cos dont la derniere decimale varie d'un moteur a l'autre.

import type { Chemin, Commande } from '../edition/types.js';
import { cubique, quadratique, seconde, segments } from '../booleens.js';

export type Pt = readonly [number, number];

export interface Polyligne {
  readonly pts: readonly Pt[];
  readonly ferme: boolean;
  /** Pour chaque sommet : vrai si c'est un coin du trace, faux si c'est un point d'une courbe (ou d'une droite prolongee). */
  readonly coin: readonly boolean[];
  /** Un point seul (tiret de longueur nulle, sous-chemin reduit a un point) : la direction du trace en ce point, pour orienter un bout carre. */
  readonly direction?: Pt;
}

export const moins = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
export const plus = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
export const fois = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
export const scalaire = (a: Pt, b: Pt): number => a[0] * b[0] + a[1] * b[1];
export const vectoriel = (a: Pt, b: Pt): number => a[0] * b[1] - a[1] * b[0];
export const norme = (a: Pt): number => Math.sqrt(a[0] * a[0] + a[1] * a[1]);
export const unitaire = (a: Pt): Pt => { const n = norme(a); return n > 0 ? [a[0] / n, a[1] / n] : [0, 0]; };
/** Le vecteur tourne d'un quart de tour (a gauche en axes mathematiques, a droite a l'ecran ou y descend). */
export const quart = (a: Pt): Pt => [-a[1], a[0]];

/** En deca, deux points sont le meme : un segment plus court n'a pas de direction. */
const EPS = 1e-9;
/** Un virage de moins de ce sinus (environ un demi-degre) n'est pas un coin : a la precision d'ecriture du trace, la tangente continue. */
const SINUS_COIN = 0.01;

/** Le premier vecteur non nul, normalise : la tangente d'une courbe dont des points de controle se confondent. */
function premier(candidats: readonly Pt[]): Pt | null {
  for (const c of candidats) if (norme(c) > EPS) return unitaire(c);
  return null;
}

/** La tangente au depart et a l'arrivee d'une commande, ou null quand elle ne trace rien. */
function tangentes(a: Pt, c: Commande): { debut: Pt | null; fin: Pt | null } {
  const p = (k: number): Pt => [c.p[k] ?? 0, c.p[k + 1] ?? 0];
  if (c.c === 'C') return { debut: premier([moins(p(0), a), moins(p(2), a), moins(p(4), a)]), fin: premier([moins(p(4), p(2)), moins(p(4), p(0)), moins(p(4), a)]) };
  if (c.c === 'Q') return { debut: premier([moins(p(0), a), moins(p(2), a)]), fin: premier([moins(p(2), p(0)), moins(p(2), a)]) };
  const t = premier([moins(p(0), a)]);
  return { debut: t, fin: t };
}

/** Deux tangentes font-elles un coin ? Un demi-tour en est un, une suite a peine tordue n'en est pas. */
function estCoin(entrant: Pt | null, sortant: Pt | null): boolean {
  if (!entrant || !sortant) return false;
  return scalaire(entrant, sortant) < 0 || Math.abs(vectoriel(entrant, sortant)) > SINUS_COIN;
}

/** Les points d'une commande aplatie, de l'apres-depart a l'arrivee comprise. */
function aplatirCommande(a: Pt, c: Commande, tolerance: number): Pt[] {
  const p = c.p;
  if (c.c === 'L') return [[p[0] ?? 0, p[1] ?? 0]];
  const sortie: Pt[] = [];
  if (c.c === 'C') {
    const [x1, y1, x2, y2, x3, y3] = [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 0, p[4] ?? 0, p[5] ?? 0];
    const n = segments(3, Math.max(seconde(a[0], a[1], x1, y1, x2, y2), seconde(x1, y1, x2, y2, x3, y3)), tolerance);
    for (let k = 1; k < n; k++) sortie.push([cubique(a[0], x1, x2, x3, k / n), cubique(a[1], y1, y2, y3, k / n)]);
    sortie.push([x3, y3]);
  } else {
    const [x1, y1, x2, y2] = [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 0];
    const n = segments(2, seconde(a[0], a[1], x1, y1, x2, y2), tolerance);
    for (let k = 1; k < n; k++) sortie.push([quadratique(a[0], x1, x2, k / n), quadratique(a[1], y1, y2, k / n)]);
    sortie.push([x2, y2]);
  }
  return sortie;
}

/** Les sous-chemins d'un chemin, chacun avec son M et son eventuel Z. */
function decouper(d: Chemin): Commande[][] {
  const r: Commande[][] = [];
  for (const c of d) {
    if (c.c === 'M' || !r.length) r.push([]);
    r[r.length - 1]?.push(c);
  }
  return r;
}

interface Brut { pts: Pt[]; coin: boolean[] }

/** Retire les points confondus avec leur predecesseur : un coin d'un des deux reste un coin. */
function sansDoublons(b: Brut, ferme: boolean): Brut {
  const pts: Pt[] = [], coin: boolean[] = [];
  b.pts.forEach((p, k) => {
    const q = pts[pts.length - 1];
    if (q && norme(moins(p, q)) <= EPS) { coin[coin.length - 1] = (coin[coin.length - 1] ?? false) || (b.coin[k] ?? false); return; }
    pts.push(p);
    coin.push(b.coin[k] ?? false);
  });
  // Un anneau qui retombe sur son depart : le dernier point n'est que le depart revu.
  const premierPt = pts[0], dernierPt = pts[pts.length - 1];
  if (ferme && pts.length > 1 && premierPt && dernierPt && norme(moins(dernierPt, premierPt)) <= EPS) {
    coin[0] = (coin[0] ?? false) || (coin[coin.length - 1] ?? false);
    pts.pop(); coin.pop();
  }
  return { pts, coin };
}

/** Un sous-chemin en polyligne, ou null s'il ne trace rien (un M seul). */
function polyligneDe(sous: readonly Commande[], tolerance: number): Polyligne | null {
  const debut = sous[0];
  if (!debut || debut.c !== 'M') return null;
  const depart: Pt = [debut.p[0] ?? 0, debut.p[1] ?? 0];
  const ferme = sous.some(c => c.c === 'Z');
  const brut: Brut = { pts: [depart], coin: [false] };
  let courant = depart, sortante: Pt | null = null, premiereEntree: Pt | null = null, traces = 0;
  const pousser = (c: Commande) => {
    const t = tangentes(courant, c);
    if (!t.debut) return;
    const points = aplatirCommande(courant, c, tolerance);
    if (traces === 0) premiereEntree = t.debut;
    else brut.coin[brut.coin.length - 1] = estCoin(sortante, t.debut);
    for (const q of points) { brut.pts.push(q); brut.coin.push(false); }
    sortante = t.fin;
    courant = points[points.length - 1] ?? courant;
    traces++;
  };
  for (const c of sous.slice(1)) if (c.c !== 'M' && c.c !== 'Z') pousser(c);
  // Un Z referme par une droite si le trace ne revient pas sur son depart.
  if (ferme && norme(moins(courant, depart)) > EPS) pousser({ c: 'L', p: [depart[0], depart[1]] });
  if (ferme && traces > 0) brut.coin[0] = estCoin(sortante, premiereEntree);
  const net = sansDoublons(brut, ferme);
  if (!sous.some(c => c.c !== 'M')) return null;
  if (net.pts.length === 1) return { pts: net.pts, ferme: false, coin: net.coin, direction: [1, 0] };
  return { pts: net.pts, ferme: ferme && net.pts.length > 2, coin: net.coin };
}

/** Les polylignes d'un chemin, une par sous-chemin qui trace quelque chose, aplaties a `tolerance` pres. */
export function polylignesDeChemin(d: Chemin, tolerance: number): Polyligne[] {
  return decouper(d).flatMap(s => { const p = polyligneDe(s, tolerance); return p ? [p] : []; });
}

/** Une polyligne fermee d'un anneau de polygone (sans point de fermeture repete) : un sommet est un coin si le virage depasse trente degres. */
export function polyligneDAnneau(anneau: readonly Pt[]): Polyligne {
  const n = anneau.length;
  const pts = anneau.filter((p, k) => { const q = anneau[(k + n - 1) % n]; return !q || norme(moins(p, q)) > EPS; });
  const m = pts.length;
  const coin = pts.map((p, k) => {
    const a = pts[(k + m - 1) % m], b = pts[(k + 1) % m];
    if (!a || !b) return false;
    const u = unitaire(moins(p, a)), v = unitaire(moins(b, p));
    // Au dela de trente degres (cosinus sous 0,866) un sommet est un coin ; en deca, il suit une courbe aplatie.
    return scalaire(u, v) < 0.8660254037844386;
  });
  return { pts, ferme: true, coin };
}
