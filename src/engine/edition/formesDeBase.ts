// Les formes de base (ADR-0033) : ce que la palette des formes trace d'un glisser ou au clavier, a partir d'une boite (le trace
// a deux coins) et de quelques parametres. Chaque forme est un chemin ordinaire (ADR-0001 : M, L, C, Z absolus) que rien ne
// distingue d'un autre une fois pose : il ne garde pas ses parametres. Pur et deterministe : memes entrees, memes commandes.
//
// Deux familles. Les formes « en fractions de boite » (triangle, cœur, fleche, nuage…) se construisent dans une boite unite
// puis s'etirent a la boite tracee ; leur dessin normalise ne depend que des parametres entiers ou a choix (cotes, sens),
// ce qui permet de les reconnaitre plus tard par simple comparaison (description.ts, voir `reconnaitreFormeDeBase`). Le
// rectangle arrondi garde un rayon absolu (des coins ronds qui ne s'ecrasent pas), borne a la moitie du petit cote.
//
// Les quatre formes d'avant (rectangle, ellipse, etoile, ligne) passent par les fonctions de formes.ts, inchangees : un
// rectangle, une ellipse ou une etoile a cinq branches tracees comme avant donnent les memes octets.

import type { Chemin, Commande } from './types.js';
import { boiteChemin } from './geometrie.js';
import { ellipse, etoile, polygone, rectangle } from './formes.js';
import { au } from '../../util/tableaux.js';
import { t } from '../../util/i18n.js';

/** Les formes de la palette, dans l'ordre ou elle les range. */
export const FORMES_DE_BASE = [
  'rectangle', 'carre', 'rectangle-arrondi', 'ellipse', 'cercle',
  'triangle', 'losange', 'parallelogramme', 'trapeze', 'polygone', 'etoile',
  'coeur', 'fleche', 'croix', 'anneau', 'demi-cercle', 'goutte', 'lune', 'nuage',
  'etiquette', 'badge', 'bulle',
  'ligne', 'arc', 'spirale', 'vague'
] as const;
export type FormeDeBase = typeof FORMES_DE_BASE[number];

/**
 * Ce qu'on sait d'une forme sans la tracer : son nom (minuscule, tel qu'on le dit dans une phrase), son genre grammatical,
 * si c'est un trait ouvert (une ligne : le style d'une ligne, sans fond) et la proportion largeur / hauteur de la boite que
 * le clavier pose quand on n'a pas trace de boite (Entree au reticule).
 */
export interface FicheForme { readonly nom: string; readonly feminin: boolean; readonly trait: boolean; readonly proportion: number }

const fiche = (nom: string, feminin: boolean, proportion = 1, trait = false): FicheForme => ({ nom, feminin, trait, proportion });

export const FICHES_FORMES: Readonly<Record<FormeDeBase, FicheForme>> = {
  rectangle: fiche('rectangle', false), carre: fiche('carré', false), 'rectangle-arrondi': fiche('rectangle arrondi', false),
  ellipse: fiche('ellipse', true), cercle: fiche('cercle', false),
  triangle: fiche('triangle', false), losange: fiche('losange', false), parallelogramme: fiche('parallélogramme', false, 1.5),
  trapeze: fiche('trapèze', false, 1.5), polygone: fiche('polygone', false), etoile: fiche('étoile', true),
  coeur: fiche('cœur', false), fleche: fiche('flèche', true, 2), croix: fiche('croix', true), anneau: fiche('anneau', false),
  'demi-cercle': fiche('demi-cercle', false, 2), goutte: fiche('goutte', true, 0.75), lune: fiche('lune', true, 0.75),
  nuage: fiche('nuage', false, 1.5), etiquette: fiche('étiquette', true, 2), badge: fiche('badge festonné', false),
  bulle: fiche('bulle de dialogue', true, 4 / 3),
  ligne: fiche('ligne', true, 1, true), arc: fiche('arc', false, 2, true), spirale: fiche('spirale', true, 1, true), vague: fiche('vague', true, 3, true)
};

export type AngleTriangle = 'isocele' | 'rectangle';
export type PointeFleche = 'simple' | 'double';
export type SensFleche = 'droite' | 'gauche' | 'haut' | 'bas';
export type PortionCercle = 'demi' | 'quart';

/**
 * Les reglages des formes a venir : une donnee de la session, jamais ecrite. Les fractions sont des parts de la boite (les bras de
 * la croix, de la largeur ; l'epaisseur de l'anneau, du rayon) ; le rayon des coins est en unites du plan.
 */
export interface ParametresFormes {
  readonly rayonCoins: number;
  readonly triangle: AngleTriangle;
  readonly cotes: number;
  readonly branches: number;
  readonly creux: number;
  readonly pointe: PointeFleche;
  readonly sens: SensFleche;
  readonly bras: number;
  readonly epaisseurAnneau: number;
  readonly portion: PortionCercle;
  readonly festons: number;
  readonly tours: number;
  readonly ondulations: number;
}

/** Les bornes de chaque reglage chiffre : un reglage hors bornes y est ramene, jamais refuse. */
export const BORNES_FORMES = {
  cotes: [3, 12], branches: [3, 20], creux: [0.1, 0.75], bras: [0.1, 0.8], epaisseurAnneau: [0.05, 0.9],
  festons: [6, 24], tours: [1, 10], ondulations: [1, 12]
} as const satisfies Readonly<Record<string, readonly [number, number]>>;

/** Les valeurs de depart : l'etoile d'avant (cinq branches, creux 0,4), un hexagone, une croix de trois tiers. */
export const PARAMETRES_FORMES_DEFAUT: ParametresFormes = {
  rayonCoins: 10, triangle: 'isocele', cotes: 6, branches: 5, creux: 0.4, pointe: 'simple', sens: 'droite', bras: 1 / 3,
  epaisseurAnneau: 0.3, portion: 'demi', festons: 12, tours: 3, ondulations: 3
};

const borner = (v: number, [min, max]: readonly [number, number]): number => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min);
const entier = (v: number, b: readonly [number, number]): number => Math.round(borner(v, b));

/** Les reglages ramenes dans leurs bornes (les entiers arrondis, le rayon jamais negatif). */
export function bornerParametres(p: ParametresFormes): ParametresFormes {
  return {
    ...p,
    rayonCoins: Number.isFinite(p.rayonCoins) ? Math.max(0, p.rayonCoins) : 0,
    cotes: entier(p.cotes, BORNES_FORMES.cotes), branches: entier(p.branches, BORNES_FORMES.branches),
    creux: borner(p.creux, BORNES_FORMES.creux), bras: borner(p.bras, BORNES_FORMES.bras),
    epaisseurAnneau: borner(p.epaisseurAnneau, BORNES_FORMES.epaisseurAnneau),
    festons: entier(p.festons, BORNES_FORMES.festons), tours: entier(p.tours, BORNES_FORMES.tours), ondulations: entier(p.ondulations, BORNES_FORMES.ondulations)
  };
}

/** La regle de remplissage d'une forme : l'anneau est un cercle perce, son trou se lit en evenodd (et tourne en sens inverse). */
export const regleDeForme = (forme: FormeDeBase): 'nonzero' | 'evenodd' => (forme === 'anneau' ? 'evenodd' : 'nonzero');

// La constante des quarts d'ellipse, la meme que celle de formes.ts.
const K = 0.5522847498;

type P = readonly [number, number];
const m = (p: P): Commande => ({ c: 'M', p: [p[0], p[1]] });
const z: Commande = { c: 'Z', p: [] };

/** Un arc d'ellipse de l'angle a0 a a1 (radians, y vers le bas), en cubiques d'au plus un quart de tour ; sans son point de depart. */
function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): Commande[] {
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 2) - 1e-9)), pas = (a1 - a0) / n, k = (4 / 3) * Math.tan(pas / 4);
  const out: Commande[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = a0 + i * pas, t1 = t0 + pas, c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
    out.push({ c: 'C', p: [cx + rx * (c0 - k * s0), cy + ry * (s0 + k * c0), cx + rx * (c1 + k * s1), cy + ry * (s1 - k * c1), cx + rx * c1, cy + ry * s1] });
  }
  return out;
}

/** Un chemin pose dans la boite : sa boite exacte (extrema des courbes compris) devient celle qu'on a tracee. */
function ajuster(d: readonly Commande[], x: number, y: number, l: number, h: number): Commande[] {
  const b = boiteChemin(d);
  if (!b) return [];
  const sx = b.l > 0 ? l / b.l : 0, sy = b.h > 0 ? h / b.h : 0, ox = b.l > 0 ? x : x + l / 2, oy = b.h > 0 ? y : y + h / 2;
  return d.map(c => ({ c: c.c, p: c.p.map((v, i) => (i % 2 ? oy + (v - b.y) * sy : ox + (v - b.x) * sx)) }));
}

/** Une ligne brisee fermee dont les sommets sont donnes en fractions de la boite. */
const enFractions = (x: number, y: number, l: number, h: number, pts: readonly P[]): Commande[] => polygone(pts.map(([u, v]) => [x + u * l, y + v * h] as const), true);

/** Un rectangle aux coins arrondis en quarts de cercle ; un rayon nul rend le rectangle, un rayon trop grand la moitie du petit cote. */
export function rectangleArrondi(x: number, y: number, l: number, h: number, rayon: number): Commande[] {
  if (!(l > 0 && h > 0)) return [];
  const r = Math.min(Math.max(0, rayon), l / 2, h / 2), k = r * K, x1 = x + l, y1 = y + h;
  if (!(r > 0)) return rectangle(x, y, l, h);
  // Un bord droit plus court qu'un millionieme n'existe pas : deux coins se touchent (une pilule, ou un cercle pour un carre).
  const bordH = l - 2 * r > l * 1e-9, bordV = h - 2 * r > h * 1e-9;
  const out: Commande[] = [m([x + r, y])];
  if (bordH) out.push({ c: 'L', p: [x1 - r, y] });
  out.push({ c: 'C', p: [x1 - r + k, y, x1, y + r - k, x1, y + r] });
  if (bordV) out.push({ c: 'L', p: [x1, y1 - r] });
  out.push({ c: 'C', p: [x1, y1 - r + k, x1 - r + k, y1, x1 - r, y1] });
  if (bordH) out.push({ c: 'L', p: [x + r, y1] });
  out.push({ c: 'C', p: [x + r - k, y1, x, y1 - r + k, x, y1 - r] });
  if (bordV) out.push({ c: 'L', p: [x, y + r] });
  out.push({ c: 'C', p: [x, y + r - k, x + r - k, y, x + r, y] }, z);
  return out;
}

/** Un polygone regulier a `cotes` cotes, un sommet en haut, etire a la boite. */
export function polygoneRegulier(x: number, y: number, l: number, h: number, cotes: number): Commande[] {
  const n = entier(cotes, BORNES_FORMES.cotes);
  const pts: P[] = Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; return [Math.cos(a), Math.sin(a)] as const; });
  return ajuster(polygone(pts, true), x, y, l, h);
}

// Le cœur, en six cubiques symetriques dans la boite unite : deux lobes ronds, une pointe en bas, un creux en haut.
const COEUR: readonly Commande[] = [
  m([0.5, 0.22]),
  { c: 'C', p: [0.55, 0.08, 0.65, 0, 0.76, 0] }, { c: 'C', p: [0.9, 0, 1, 0.1, 1, 0.27] }, { c: 'C', p: [1, 0.55, 0.72, 0.75, 0.5, 1] },
  { c: 'C', p: [0.28, 0.75, 0, 0.55, 0, 0.27] }, { c: 'C', p: [0, 0.1, 0.1, 0, 0.24, 0] }, { c: 'C', p: [0.35, 0, 0.45, 0.08, 0.5, 0.22] }, z
];

/** Une fleche vers la droite (une pointe) ou dans les deux sens, en fractions de boite, puis tournee vers son sens. */
function fleche(x: number, y: number, l: number, h: number, pointe: PointeFleche, sens: SensFleche): Commande[] {
  const droite: readonly P[] = pointe === 'double'
    ? [[0, 0.5], [0.3, 0], [0.3, 0.28], [0.7, 0.28], [0.7, 0], [1, 0.5], [0.7, 1], [0.7, 0.72], [0.3, 0.72], [0.3, 1]]
    : [[0, 0.28], [0.6, 0.28], [0.6, 0], [1, 0.5], [0.6, 1], [0.6, 0.72], [0, 0.72]];
  const tourner = (p: P): P => (sens === 'gauche' ? [1 - p[0], p[1]] : sens === 'haut' ? [p[1], 1 - p[0]] : sens === 'bas' ? [p[1], p[0]] : p);
  return enFractions(x, y, l, h, droite.map(tourner));
}

/** Une croix (un plus) aux bras de `bras` de la largeur et de la hauteur. */
function croix(x: number, y: number, l: number, h: number, bras: number): Commande[] {
  const t = borner(bras, BORNES_FORMES.bras), a = (1 - t) / 2, b = (1 + t) / 2;
  return enFractions(x, y, l, h, [[a, 0], [b, 0], [b, a], [1, a], [1, b], [b, b], [b, 1], [a, 1], [a, b], [0, b], [0, a], [a, a]]);
}

/** Un anneau : l'ellipse de la boite et un trou concentrique parcouru en sens inverse (un trou en evenodd comme en nonzero). */
export function anneau(x: number, y: number, l: number, h: number, epaisseur: number): Commande[] {
  if (!(l > 0 && h > 0)) return [];
  const e = borner(epaisseur, BORNES_FORMES.epaisseurAnneau), rx = (l / 2) * (1 - e), ry = (h / 2) * (1 - e), cx = x + l / 2, cy = y + h / 2, kx = rx * K, ky = ry * K;
  return [
    ...ellipse(x, y, l, h),
    m([cx + rx, cy]),
    { c: 'C', p: [cx + rx, cy - ky, cx + kx, cy - ry, cx, cy - ry] },
    { c: 'C', p: [cx - kx, cy - ry, cx - rx, cy - ky, cx - rx, cy] },
    { c: 'C', p: [cx - rx, cy + ky, cx - kx, cy + ry, cx, cy + ry] },
    { c: 'C', p: [cx + kx, cy + ry, cx + rx, cy + ky, cx + rx, cy] },
    z
  ];
}

/** Le demi-disque (bord plat en bas) ou le quart de disque (centre en bas a gauche) qui remplit la boite ; ouvert, l'arc seul. */
function portionDisque(x: number, y: number, l: number, h: number, portion: PortionCercle, ferme: boolean): Commande[] {
  if (portion === 'quart') {
    const kx = l * K, ky = h * K;
    return [m([x, y + h]), { c: 'L', p: [x, y] }, { c: 'C', p: [x + kx, y, x + l, y + h - ky, x + l, y + h] }, z];
  }
  const rx = l / 2, cx = x + rx, cy = y + h, kx = rx * K, ky = h * K;
  const out: Commande[] = [m([x, cy]), { c: 'C', p: [x, cy - ky, cx - kx, y, cx, y] }, { c: 'C', p: [cx + kx, y, x + l, cy - ky, x + l, cy] }];
  return ferme ? [...out, z] : out;
}

/** La goutte : une pointe en haut, deux flancs en cubiques qui rejoignent un fond en demi-cercle sans cassure. */
function goutte(): Commande[] {
  return [m([0, -2.2]), { c: 'C', p: [0.45, -1.55, 1, -0.8, 1, 0] }, ...arc(0, 0, 1, 1, 0, Math.PI), { c: 'C', p: [-1, -0.8, -0.45, -1.55, 0, -2.2] }, z];
}

/** L'intersection haute de deux cercles qui se coupent (la plus petite ordonnee). */
function intersectionHaute(c1: P, r1: number, c2: P, r2: number): P {
  const dx = c2[0] - c1[0], dy = c2[1] - c1[1], d = Math.hypot(dx, dy), a = (r1 * r1 - r2 * r2 + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const mx = c1[0] + (a * dx) / d, my = c1[1] + (a * dy) / d, p: P = [mx + (hh * dy) / d, my - (hh * dx) / d], q: P = [mx - (hh * dy) / d, my + (hh * dx) / d];
  return p[1] <= q[1] ? p : q;
}
const angle = (c: P, p: P): number => Math.atan2(p[1] - c[1], p[0] - c[0]);
/** Le plus petit angle equivalent a `a` qui depasse `depuis` : un arc qui tourne toujours dans le sens des aiguilles d'une montre. */
const apres = (a: number, depuis: number): number => { let v = a; while (v <= depuis) v += 2 * Math.PI; return v; };

/** La lune en croissant : le grand cercle prive d'un cercle decale vers la droite, cornes a droite. */
function lune(): Commande[] {
  const d = 0.45, r2 = 0.85, xi = (1 - r2 * r2 + d * d) / (2 * d), yi = Math.sqrt(1 - xi * xi), a = Math.atan2(yi, xi), b = Math.atan2(yi, xi - d);
  return [m([xi, -yi]), ...arc(0, 0, 1, 1, -a, -2 * Math.PI + a), ...arc(d, 0, r2, r2, b, 2 * Math.PI - b), z];
}

/** Le nuage : trois bosses en arcs de cercle sur un fond plat. */
function nuage(): Commande[] {
  const c1: P = [0.25, 0.62], r1 = 0.2, c2: P = [0.5, 0.42], r2 = 0.28, c3: P = [0.76, 0.6], r3 = 0.22;
  const i12 = intersectionHaute(c1, r1, c2, r2), i23 = intersectionHaute(c2, r2, c3, r3);
  const a1 = apres(angle(c1, i12), Math.PI / 2), a2 = angle(c2, i12), b2 = apres(angle(c2, i23), a2), a3 = angle(c3, i23), b3 = apres(Math.PI / 2, a3);
  return [m([c1[0], c1[1] + r1]), ...arc(c1[0], c1[1], r1, r1, Math.PI / 2, a1), ...arc(c2[0], c2[1], r2, r2, a2, b2), ...arc(c3[0], c3[1], r3, r3, a3, b3), z];
}

/** La bulle de dialogue : un rectangle aux coins arrondis (en fractions de boite) et une queue en bas a gauche. */
function bulle(): Commande[] {
  const rx = 0.12, ry = 0.16, bas = 0.75, kx = rx * K, ky = ry * K;
  return [
    m([rx, 0]), { c: 'L', p: [1 - rx, 0] }, { c: 'C', p: [1 - rx + kx, 0, 1, ry - ky, 1, ry] }, { c: 'L', p: [1, bas - ry] },
    { c: 'C', p: [1, bas - ry + ky, 1 - rx + kx, bas, 1 - rx, bas] }, { c: 'L', p: [0.42, bas] }, { c: 'L', p: [0.2, 1] }, { c: 'L', p: [0.26, bas] },
    { c: 'L', p: [rx, bas] }, { c: 'C', p: [rx - kx, bas, 0, bas - ry + ky, 0, bas - ry] }, { c: 'L', p: [0, ry] }, { c: 'C', p: [0, ry - ky, rx - kx, 0, rx, 0] }, z
  ];
}

/** Le badge festonne : `n` demi-cercles poses sur les cordes d'un cercle, le premier en haut. */
function badge(festons: number): Commande[] {
  const n = entier(festons, BORNES_FORMES.festons), cr = Math.cos(Math.PI / n), rho = Math.sin(Math.PI / n), a0 = -Math.PI / 2 - Math.PI / n;
  const out: Commande[] = [m([Math.cos(a0), Math.sin(a0)])];
  for (let k = 0; k < n; k++) {
    const t = -Math.PI / 2 + (2 * Math.PI * k) / n;
    out.push(...arc(cr * Math.cos(t), cr * Math.sin(t), rho, rho, t - Math.PI / 2, t + Math.PI / 2));
  }
  out.push(z);
  return out;
}

/** La spirale : des demi-cercles de rayon croissant autour de deux centres voisins, deux par tour, ouverte. */
function spirale(tours: number): Commande[] {
  const n = 2 * entier(tours, BORNES_FORMES.tours), out: Commande[] = [m([1, 0])];
  for (let k = 1; k <= n; k++) out.push(...(k % 2 ? arc(0, 0, k, k, 0, -Math.PI) : arc(1, 0, k, k, Math.PI, 0)));
  return out;
}

/** La vague : `ondulations` periodes, une cubique par demi-onde (sommet exact au milieu), ouverte. */
function vague(ondulations: number): Commande[] {
  const n = 2 * entier(ondulations, BORNES_FORMES.ondulations), w = 1 / n, a = 4 / 3, out: Commande[] = [m([0, 0])];
  for (let i = 0; i < n; i++) { const s = i % 2 ? a : -a, x0 = i * w; out.push({ c: 'C', p: [x0 + 0.36 * w, s, x0 + 0.64 * w, s, x0 + w, 0] }); }
  return out;
}

/**
 * La forme de base `forme` dans la boite (x, y, l, h), avec ses reglages. Une boite sans surface rend un chemin vide, sauf pour
 * la ligne (qui va du coin haut gauche au coin bas droit : le glisser d'une ligne passe par formeTracee, pas par ici).
 */
export function formeDeBase(forme: FormeDeBase, x: number, y: number, l: number, h: number, reglages: ParametresFormes = PARAMETRES_FORMES_DEFAUT): Commande[] {
  if (forme === 'ligne') return polygone([[x, y], [x + l, y + h]], false);
  if (!(l > 0 && h > 0)) return [];
  const p = reglages, s = Math.min(l, h);
  switch (forme) {
    case 'rectangle': return rectangle(x, y, l, h);
    case 'carre': return rectangle(x, y, s, s);
    case 'rectangle-arrondi': return rectangleArrondi(x, y, l, h, p.rayonCoins);
    case 'ellipse': return ellipse(x, y, l, h);
    case 'cercle': return ellipse(x, y, s, s);
    case 'triangle': return enFractions(x, y, l, h, p.triangle === 'rectangle' ? [[0, 0], [1, 1], [0, 1]] : [[0.5, 0], [1, 1], [0, 1]]);
    case 'losange': return enFractions(x, y, l, h, [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]);
    case 'parallelogramme': return enFractions(x, y, l, h, [[0.25, 0], [1, 0], [0.75, 1], [0, 1]]);
    case 'trapeze': return enFractions(x, y, l, h, [[0.2, 0], [0.8, 0], [1, 1], [0, 1]]);
    case 'polygone': return polygoneRegulier(x, y, l, h, p.cotes);
    case 'etoile': return etoile(x, y, l, h, entier(p.branches, BORNES_FORMES.branches), borner(p.creux, BORNES_FORMES.creux));
    case 'coeur': return ajuster(COEUR, x, y, l, h);
    case 'fleche': return fleche(x, y, l, h, p.pointe, p.sens);
    case 'croix': return croix(x, y, l, h, p.bras);
    case 'anneau': return anneau(x, y, l, h, p.epaisseurAnneau);
    case 'demi-cercle': return portionDisque(x, y, l, h, p.portion, true);
    case 'goutte': return ajuster(goutte(), x, y, l, h);
    case 'lune': return ajuster(lune(), x, y, l, h);
    case 'nuage': return ajuster(nuage(), x, y, l, h);
    case 'etiquette': return enFractions(x, y, l, h, [[0.22, 0], [1, 0], [1, 1], [0.22, 1], [0, 0.5]]);
    case 'badge': return ajuster(badge(p.festons), x, y, l, h);
    case 'bulle': return ajuster(bulle(), x, y, l, h);
    case 'arc': return portionDisque(x, y, l, h, 'demi', false);
    case 'spirale': return ajuster(spirale(p.tours), x, y, l, h);
    case 'vague': return ajuster(vague(p.ondulations), x, y, l, h);
  }
}

// ------------------------------------------------------------------ la reconnaissance (description.ts)

/** Un chemin ramene a sa boite de points (ancres et poignees) : invariant par deplacement et par etirement dans les axes. */
interface Normalise { readonly signature: string; readonly v: readonly number[] }

function normaliser(d: Chemin): Normalise | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of d) for (let i = 0; i + 1 < c.p.length; i += 2) {
    const x = c.p[i] ?? 0, y = c.p[i + 1] ?? 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const l = x1 - x0, h = y1 - y0;
  if (!(l > 0 && h > 0)) return null;
  return { signature: d.map(c => c.c).join(''), v: d.flatMap(c => c.p.map((v, i) => (i % 2 ? (v - y0) / h : (v - x0) / l))) };
}

/** Un modele : le dessin normalise d'une forme de base pour des reglages donnes, et le nom a dire selon la boite. */
interface Modele { readonly n: Normalise; readonly genre: (l: number, h: number) => string }

/**
 * Le nom d'une forme de la palette, dans la langue de l'interface (ADR-0042 : les noms des formes de base sont des donnees, traduites
 * a l'affichage ; leur dictionnaire est celui du modele). Les noms composes ici (« polygone à 7 côtés ») ont le leur.
 */
const nomFiche = (forme: FormeDeBase): string => t(FICHES_FORMES[forme].nom);

const NOMS_POLYGONES: Readonly<Record<number, () => string>> = { 4: () => nomFiche('losange'), 5: () => t('pentagone'), 6: () => t('hexagone'), 8: () => t('octogone') };
const presque = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(a, b) * 0.01;

let modeles: Map<string, Modele[]> | null = null;

/** Les modeles, faits une fois et ranges par suite de commandes : une forme ne se compare qu'a ceux de sa signature. */
function lesModeles(): Map<string, Modele[]> {
  if (modeles) return modeles;
  const index = new Map<string, Modele[]>();
  // Le nom est une fonction, appelee a la reconnaissance : dit dans la langue de l'interface, pas dans celle du chargement.
  const ajouter = (forme: FormeDeBase, genre: (l: number, h: number) => string, reglages: Partial<ParametresFormes> = {}) => {
    const n = normaliser(formeDeBase(forme, 0, 0, 1, 1, { ...PARAMETRES_FORMES_DEFAUT, ...reglages }));
    if (!n) return;
    const liste = index.get(n.signature) ?? [];
    liste.push({ n, genre });
    index.set(n.signature, liste);
  };
  const nomme = (forme: FormeDeBase, reglages: Partial<ParametresFormes> = {}) => ajouter(forme, () => nomFiche(forme), reglages);
  nomme('losange');
  nomme('parallelogramme');
  nomme('trapeze');
  for (let c = 5; c <= BORNES_FORMES.cotes[1]; c++) ajouter('polygone', NOMS_POLYGONES[c] ?? (() => t('polygone à {n} côtés', { n: c })), { cotes: c });
  nomme('coeur');
  for (const sens of ['droite', 'gauche', 'haut', 'bas'] as const) nomme('fleche', { sens });
  for (const sens of ['droite', 'gauche', 'haut', 'bas'] as const) ajouter('fleche', () => t('flèche double'), { sens, pointe: 'double' });
  ajouter('demi-cercle', (l, h) => (presque(l, 2 * h) ? nomFiche('demi-cercle') : t('demi-ellipse')));
  ajouter('demi-cercle', (l, h) => (presque(l, h) ? t('quart de cercle') : t('quart d’ellipse')), { portion: 'quart' });
  nomme('goutte');
  nomme('lune');
  nomme('nuage');
  nomme('bulle');
  nomme('etiquette');
  for (let n = BORNES_FORMES.festons[0]; n <= BORNES_FORMES.festons[1]; n++) nomme('badge', { festons: n });
  nomme('arc');
  for (let tours = BORNES_FORMES.tours[0]; tours <= BORNES_FORMES.tours[1]; tours++) nomme('spirale', { tours });
  for (let o = BORNES_FORMES.ondulations[0]; o <= BORNES_FORMES.ondulations[1]; o++) nomme('vague', { ondulations: o });
  modeles = index;
  return index;
}

// Un chemin plus long que le plus long modele (le badge a 24 festons : 50 commandes) ne se compare a rien.
const COMMANDES_MAX = 64;
// L'ecart admis, en part de la boite : l'ecriture au millieme et une relecture ne doivent pas faire perdre son nom a une forme.
const ECART = 0.002;

type Pt = readonly [number, number];
const sommets = (d: Chemin): Pt[] => d.flatMap(c => (c.c === 'Z' ? [] : [[c.p[c.p.length - 2] ?? 0, c.p[c.p.length - 1] ?? 0] as const]));
const proche = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;

/** Un rectangle aux coins en quarts de courbe : quatre cubiques, toutes les ancres sur les bords de la boite, aucune dans un coin. */
function estRectangleArrondi(d: Chemin): boolean {
  if (d.filter(c => c.c === 'C').length !== 4 || d.filter(c => c.c === 'M').length !== 1 || d.some(c => c.c === 'Q')) return false;
  const p = sommets(d), b = boiteChemin(d);
  if (!b || p.length < 5) return false;
  const tol = Math.max(b.l, b.h) * ECART, x1 = b.x + b.l, y1 = b.y + b.h;
  return p.every(([x, y]) => {
    const bordX = proche(x, b.x, tol) || proche(x, x1, tol), bordY = proche(y, b.y, tol) || proche(y, y1, tol);
    return (bordX || bordY) && !(bordX && bordY);
  });
}

/** Une croix : douze sommets, des bords tous horizontaux ou verticaux, symetrique sur les deux axes de sa boite. */
function estCroix(d: Chemin): boolean {
  const p = sommets(d), b = boiteChemin(d);
  if (p.length !== 12 || !b || d.some(c => c.c !== 'M' && c.c !== 'L' && c.c !== 'Z')) return false;
  const tol = Math.max(b.l, b.h) * ECART, cx = b.x + b.l / 2, cy = b.y + b.h / 2;
  const droits = p.every((a, i) => { const q = p[(i + 1) % 12] ?? a; return proche(a[0], q[0], tol) || proche(a[1], q[1], tol); });
  const symetrique = (f: (q: Pt) => Pt) => p.every(q => { const s = f(q); return p.some(r => proche(r[0], s[0], tol) && proche(r[1], s[1], tol)); });
  return droits && symetrique(([x, y]) => [2 * cx - x, y]) && symetrique(([x, y]) => [x, 2 * cy - y]);
}

/** Les sous-chemins d'un chemin, coupes a chaque M. */
function morceaux(d: Chemin): Chemin[] {
  const out: Commande[][] = [];
  for (const c of d) { if (c.c === 'M' || !out.length) out.push([]); out[out.length - 1]?.push(c); }
  return out;
}

/** Quatre cubiques entre les milieux des bords de leur boite : une ellipse, comme la trace l'outil (ou un cercle d'un fichier). */
export function estEllipseChemin(d: Chemin, tol: number): boolean {
  // Les conditions les moins cheres d'abord : un trace de mille points ne calcule pas sa boite pour rien.
  if (d.length > 6 || d.filter(c => c.c === 'C').length !== 4 || d.some(c => c.c !== 'M' && c.c !== 'C' && c.c !== 'Z')) return false;
  const b = boiteChemin(d);
  if (!b) return false;
  const cx = b.x + b.l / 2, cy = b.y + b.h / 2;
  const p = sommets(d).slice(0, 4);
  const surAxe = p.filter(a => proche(a[0], cx, tol) || proche(a[1], cy, tol)).length;
  const aMilieuX = p.filter(a => proche(a[0], cx, tol)).length, aMilieuY = p.filter(a => proche(a[1], cy, tol)).length;
  return surAxe === 4 && aMilieuX === 2 && aMilieuY === 2;
}

/** Deux ellipses de meme centre, l'une dans l'autre : un anneau. */
function estAnneau(d: Chemin): boolean {
  const [a, b, ...reste] = morceaux(d);
  if (!a || !b || reste.length) return false;
  const ba = boiteChemin(a), bb = boiteChemin(b);
  if (!ba || !bb) return false;
  const tol = Math.max(ba.l, ba.h, bb.l, bb.h) * ECART;
  return estEllipseChemin(a, tol) && estEllipseChemin(b, tol)
    && proche(ba.x + ba.l / 2, bb.x + bb.l / 2, tol) && proche(ba.y + ba.h / 2, bb.y + bb.h / 2, tol) && Math.abs(ba.l - bb.l) > tol;
}

/**
 * Le nombre de branches d'une etoile comme la trace l'outil (meme etiree) : 2N sommets, la premiere pointe en haut, les pointes sur
 * une ellipse, les creux sur une ellipse semblable plus petite. Null pour tout autre chemin.
 */
export function branchesEtoile(d: Chemin): number | null {
  const p = sommets(d);
  if (p.length < 6 || p.length % 2 || p.length > 2 * BORNES_FORMES.branches[1] || d.some(c => c.c !== 'M' && c.c !== 'L' && c.c !== 'Z') || !d.some(c => c.c === 'Z')) return null;
  const n = p.length / 2, pointes = p.filter((_, i) => i % 2 === 0), creux = p.filter((_, i) => i % 2 === 1);
  const cx = pointes.reduce((s, q) => s + q[0], 0) / n, cy = pointes.reduce((s, q) => s + q[1], 0) / n;
  const ry = cy - au(pointes, 0)[1], a = (k: number) => -Math.PI / 2 + (2 * Math.PI * k) / n, b = (k: number) => a(k) + Math.PI / n;
  // Le rayon horizontal se lit sur la pointe la plus loin de l'axe vertical.
  let kx = 0;
  for (let k = 0; k < n; k++) if (Math.abs(Math.cos(a(k))) > Math.abs(Math.cos(a(kx)))) kx = k;
  const rx = Math.abs(((pointes[kx]?.[0] ?? cx) - cx) / Math.cos(a(kx)));
  if (!(rx > 0 && ry > 0)) return null;
  const tol = Math.max(rx, ry) * 0.01;
  if (!pointes.every((q, k) => proche(q[0], cx + rx * Math.cos(a(k)), tol) && proche(q[1], cy + ry * Math.sin(a(k)), tol))) return null;
  // Le creux commun se lit sur le premier creux, par sa composante la plus franche.
  const c0 = au(creux, 0), cos0 = Math.cos(b(0)), sin0 = Math.sin(b(0));
  const c = Math.abs(cos0) > Math.abs(sin0) ? (c0[0] - cx) / (rx * cos0) : (c0[1] - cy) / (ry * sin0);
  if (!(c > 0.05 && c < 0.9)) return null;
  return creux.every((q, k) => proche(q[0], cx + c * rx * Math.cos(b(k)), tol) && proche(q[1], cy + c * ry * Math.sin(b(k)), tol)) ? n : null;
}

/**
 * Le nom d'une forme de base reconnue dans un chemin (« cœur », « hexagone », « flèche double », « anneau »…), ou null. Ce que
 * description.ts sait deja dire (rectangle, carre, ellipse, cercle, triangle, ligne) passe avant ; ici, ce que la palette ajoute.
 */
export function reconnaitreFormeDeBase(d: Chemin): string | null {
  if (!d.length || d.length > COMMANDES_MAX) return null;
  const n = normaliser(d);
  if (n) {
    for (const modele of lesModeles().get(n.signature) ?? []) {
      if (modele.n.v.every((v, i) => Math.abs(v - (n.v[i] ?? Infinity)) <= ECART)) {
        const b = boiteChemin(d);
        return b ? modele.genre(b.l, b.h) : null;
      }
    }
  }
  const branches = branchesEtoile(d);
  if (branches !== null) return branches === 5 ? nomFiche('etoile') : t('étoile à {n} branches', { n: branches });
  if (estCroix(d)) return nomFiche('croix');
  if (estAnneau(d)) return nomFiche('anneau');
  if (estRectangleArrondi(d)) return nomFiche('rectangle-arrondi');
  return null;
}
