// Choisir des formes par une zone (ADR-0035), en pur : un rectangle (le cadre) ou un polygone (le lasso), et deux regles.
//
// - « touchee » (la regle par defaut) : la forme est prise des que ce qu'elle peint touche la zone, meme en partie. Ce
//   qu'elle peint, c'est son trace reel, pas sa boite : sa surface remplie (regle de remplissage respectee) et l'encre de son
//   trait (demi-epaisseur). Un anneau dont la zone ne couvre que le trou n'est pas pris, ni une diagonale dont la zone
//   n'occupe que le coin vide de la boite.
// - « dedans » : la forme n'est prise que si tout ce qu'elle peint est dans la zone (sa boite avec trait, pointes comprises,
//   pour un rectangle).
//
// Le calcul touche est exact a l'aplatissement des courbes pres (un dix-millieme de leur boite, celui de la prise du clic,
// engine/prise.ts) : la forme touche la zone si un sommet de son trace est dans la zone, si une arete de son trace croise un
// bord de la zone, si la zone est dans sa surface (un seul point de la zone suffit a le dire quand rien ne se croise), ou si
// le trait passe a moins d'une demi-epaisseur de la zone (distance exacte entre deux polygones qui ne se croisent pas : elle
// est atteinte en un sommet de l'un). Les memes limites que la prise : pointes de jonction et bouts carres comptent par la
// demi-epaisseur seulement (ils comptent entiers dans la regle « dedans » d'un cadre), un pointille compte comme un trait plein.
//
// Comme pour le clic (ADR-0029) : une forme masquee ou verrouillee n'est jamais prise ; en vue « contours », chaque forme est un
// trace qui se prend aussi par sa surface, et son trait n'a plus d'epaisseur ; un texte vivant libre se prend par sa boite
// entiere (entre ses lettres aussi), un texte pose sur ou dans une forme par ses lettres.
//
// Ce qui ne depend que d'une forme immuable (boite avec trait, trace aplati) est deja memorise par forme dans prise.ts
// (ADR-0008) ; les boites d'un dessin y sont rangees une fois par tableau de formes, et le calcul fin ne se fait que pour les
// formes dont la boite croise celle de la zone sans y etre contenue.

import type { Boite, DessinSvg, Forme, Operation } from './edition/types.js';
import { boiteForme } from './edition/geometrie.js';
import { aplatir, dansSurface, etendue, rangee, type Trace } from './prise.js';
import { operationDe } from './preparation/operations.js';
import type { Procede } from '../model/contextes.js';

/** Ce qu'une zone prend : ce qu'elle touche, ou ce qu'elle contient entierement. */
export type RegleZone = 'touche' | 'dedans';

/** Ce que le geste fait de la selection : la remplacer, y ajouter (Maj), en retirer (Alt). */
export type EffetZone = 'remplacer' | 'ajouter' | 'retirer';

export type PointZone = readonly [number, number];

/** Un cadre (rectangle aligne aux axes, unites du plan) ou un lasso (polygone ferme, au moins trois points). */
export type Zone = { readonly rect: Boite } | { readonly lasso: readonly PointZone[] };

/** Une zone preparee : son polygone (x0, y0, x1, y1…), sa boite, et son rectangle si c'en est un. */
interface ZonePrete {
  readonly pts: Float64Array;
  readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number;
  readonly rect: boolean;
  /**
   * Les aretes du lasso rangees par bandes horizontales (indices de leur premier sommet) : un point ou un segment ne se compare
   * qu'aux aretes de ses bandes. Sans elles, un lasso de 200 points sur 5 000 formes coutait 25 ms (mesure) ; vide pour un cadre.
   */
  readonly bandes: readonly (readonly number[])[];
  readonly hBande: number;
}

/** Le nombre de bandes d'un lasso : une pour quatre aretes, entre 1 et 64. */
const bandesPour = (n: number): number => Math.max(1, Math.min(64, Math.ceil(n / 4)));

function preparer(z: Zone): ZonePrete | null {
  if ('rect' in z) {
    const { x, y, l, h } = z.rect;
    if (![x, y, l, h].every(Number.isFinite) || l < 0 || h < 0) return null;
    return { pts: Float64Array.of(x, y, x + l, y, x + l, y + h, x, y + h), x0: x, y0: y, x1: x + l, y1: y + h, rect: true, bandes: [], hBande: 0 };
  }
  const p = z.lasso.filter(q => Number.isFinite(q[0]) && Number.isFinite(q[1]));
  if (p.length < 3) return null;
  const pts = new Float64Array(p.length * 2);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  p.forEach(([x, y], i) => { pts[i * 2] = x; pts[i * 2 + 1] = y; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
  const nb = bandesPour(p.length), hBande = (y1 - y0) / nb || 1;
  const bandes: number[][] = Array.from({ length: nb }, () => []);
  for (let i = 0; i < p.length; i++) {
    const j = (i + 1) % p.length, ya = pts[i * 2 + 1] ?? 0, yb = pts[j * 2 + 1] ?? 0;
    const de = Math.max(0, Math.min(nb - 1, Math.floor((Math.min(ya, yb) - y0) / hBande))), a = Math.max(0, Math.min(nb - 1, Math.floor((Math.max(ya, yb) - y0) / hBande)));
    for (let k = de; k <= a; k++) bandes[k]?.push(i);
  }
  return { pts, x0, y0, x1, y1, rect: false, bandes, hBande };
}

/**
 * Vrai des que `f` est vrai pour une arete (indice de son premier sommet) qui peut croiser la tranche horizontale [ya, yb] : les
 * quatre bords d'un cadre, les aretes des bandes d'un lasso (une arete a cheval sur deux bandes peut etre vue deux fois).
 */
function uneArete(z: ZonePrete, ya: number, yb: number, f: (i: number) => boolean): boolean {
  if (z.rect) return f(0) || f(1) || f(2) || f(3);
  const nb = z.bandes.length;
  const de = Math.max(0, Math.floor((ya - z.y0) / z.hBande)), a = Math.min(nb - 1, Math.floor((yb - z.y0) / z.hBande));
  for (let k = de; k <= a; k++) for (const i of z.bandes[k] ?? []) if (f(i)) return true;
  return false;
}

/** Les deux sommets de l'arete i de la zone. */
function arete(z: ZonePrete, i: number): readonly [number, number, number, number] {
  const j = (i + 1) % (z.pts.length / 2);
  return [z.pts[i * 2] ?? 0, z.pts[i * 2 + 1] ?? 0, z.pts[j * 2] ?? 0, z.pts[j * 2 + 1] ?? 0];
}

/** Le point est-il dans la zone, bord compris ? Le lasso suit la regle « nonzero » : une boucle qui se recoupe reste pleine. */
function dansZone(z: ZonePrete, px: number, py: number): boolean {
  if (px < z.x0 || px > z.x1 || py < z.y0 || py > z.y1) return false;
  if (z.rect) return true;
  // Une seule bande : chaque arete y est une fois.
  let w = 0;
  uneArete(z, py, py, i => {
    const [ax, ay, bx, by] = arete(z, i);
    if ((ay <= py) !== (by <= py)) {
      const xi = ax + ((py - ay) / (by - ay)) * (bx - ax);
      if (xi > px) w += by > ay ? 1 : -1;
    }
    return false;
  });
  return w !== 0;
}

/** Le signe du produit vectoriel (b - a) x (c - a). */
const orient = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

/** Deux segments fermes se touchent-ils (croisement, contact, recouvrement colineaire) ? */
function segmentsSeTouchent(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const o1 = orient(ax, ay, bx, by, cx, cy), o2 = orient(ax, ay, bx, by, dx, dy), o3 = orient(cx, cy, dx, dy, ax, ay), o4 = orient(cx, cy, dx, dy, bx, by);
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;
  const sur = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    Math.min(px, qx) <= rx && rx <= Math.max(px, qx) && Math.min(py, qy) <= ry && ry <= Math.max(py, qy);
  return (o1 === 0 && sur(ax, ay, bx, by, cx, cy)) || (o2 === 0 && sur(ax, ay, bx, by, dx, dy))
    || (o3 === 0 && sur(cx, cy, dx, dy, ax, ay)) || (o4 === 0 && sur(cx, cy, dx, dy, bx, by));
}

/** La distance au carre du point au segment. */
function distance2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return (ax + t * dx - px) ** 2 + (ay + t * dy - py) ** 2;
}

/** Les aretes d'un trace : celles de chaque sous-chemin, et sa fermeture quand il est ferme par Z ou quand `fermer` (une surface). */
function* aretes(ts: readonly Trace[], fermer: boolean): Generator<readonly [number, number, number, number]> {
  for (const { pts, ferme } of ts) {
    const n = pts.length / 2, fin = ferme || fermer ? n : n - 1;
    for (let i = 0; i < fin; i++) {
      const j = (i + 1) % n;
      yield [pts[i * 2] ?? 0, pts[i * 2 + 1] ?? 0, pts[j * 2] ?? 0, pts[j * 2 + 1] ?? 0];
    }
  }
}

/** Le segment touche-t-il le rectangle plein (x0, y0)-(x1, y1) ? Liang-Barsky : le segment rogne au rectangle n'est pas vide. */
function segmentDansRectangle(ax: number, ay: number, bx: number, by: number, x0: number, y0: number, x1: number, y1: number): boolean {
  if (Math.max(ax, bx) < x0 || Math.min(ax, bx) > x1 || Math.max(ay, by) < y0 || Math.min(ay, by) > y1) return false;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  const bornes: readonly (readonly [number, number])[] = [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]];
  for (const [p, q] of bornes) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}

/** Une arete du lasso touche-t-elle la boite pleine ? Sinon la boite est tout entiere dans le lasso, ou tout entiere dehors. */
function bordDansBoite(z: ZonePrete, x0: number, y0: number, x1: number, y1: number): boolean {
  return uneArete(z, y0, y1, i => { const [ax, ay, bx, by] = arete(z, i); return segmentDansRectangle(ax, ay, bx, by, x0, y0, x1, y1); });
}

/** Une arete du trace touche-t-elle un bord de la zone ? Pour un cadre, le segment contre le rectangle plein (ses sommets dedans sont deja vus). */
function areteTouche(z: ZonePrete, ax: number, ay: number, bx: number, by: number): boolean {
  if (Math.max(ax, bx) < z.x0 || Math.min(ax, bx) > z.x1 || Math.max(ay, by) < z.y0 || Math.min(ay, by) > z.y1) return false;
  if (z.rect) return segmentDansRectangle(ax, ay, bx, by, z.x0, z.y0, z.x1, z.y1);
  return uneArete(z, Math.min(ay, by), Math.max(ay, by), i => { const [cx, cy, dx, dy] = arete(z, i); return segmentsSeTouchent(ax, ay, bx, by, cx, cy, dx, dy); });
}

/**
 * Une arete du trace passe-t-elle a moins de `demi` (au plus, ou strictement) du bord de la zone, quand elles ne se croisent pas ?
 * La distance de deux segments disjoints est atteinte en une extremite de l'un : le minimum des distances d'un sommet a l'autre.
 * Seules les aretes de la zone a moins de `demi` en hauteur peuvent compter.
 */
function presDuBord(z: ZonePrete, ax: number, ay: number, bx: number, by: number, demi: number, strict: boolean): boolean {
  const d2 = demi * demi;
  return uneArete(z, Math.min(ay, by) - demi, Math.max(ay, by) + demi, i => {
    const [cx, cy, dx, dy] = arete(z, i);
    const d = Math.min(distance2(ax, ay, cx, cy, dx, dy), distance2(bx, by, cx, cy, dx, dy), distance2(cx, cy, ax, ay, bx, by), distance2(dx, dy, ax, ay, bx, by));
    return strict ? d < d2 : d <= d2;
  });
}

/** Un trace fait des quatre coins d'une boite : la boite d'un texte libre se traite comme une surface. */
const traceDeBoite = (b: Boite): readonly Trace[] => [{ pts: Float64Array.of(b.x, b.y, b.x + b.l, b.y, b.x + b.l, b.y + b.h, b.x, b.y + b.h), ferme: true }];

/** Ce que la forme peint, tel que la zone le juge : son trace, si c'est une surface, sa regle, et la demi-epaisseur de son trait. */
interface Peint { readonly ts: readonly Trace[]; readonly surface: boolean; readonly regle: Forme['regle']; readonly demi: number }

function peint(f: Forme, contours: boolean): Peint | null {
  if (f.texte && !f.texte.disposition) {
    const b = boiteForme(f);
    return b ? { ts: traceDeBoite(b), surface: true, regle: 'nonzero', demi: 0 } : null;
  }
  return { ts: aplatir(f), surface: contours || f.remplissage !== null, regle: f.regle, demi: f.contour && !contours ? f.epaisseur / 2 : 0 };
}

/** La forme touche-t-elle la zone ? (sa boite croise deja celle de la zone sans y etre contenue) */
function toucheFine(p: Peint, z: ZonePrete): boolean {
  const { ts, surface, regle, demi } = p;
  // Un sommet du trace dans la zone : la forme y peint (son bord, ou son trait).
  for (const { pts } of ts) for (let i = 0; i < pts.length; i += 2) if (dansZone(z, pts[i] ?? 0, pts[i + 1] ?? 0)) return true;
  // Une arete qui croise un bord de la zone : de part et d'autre d'une arete de surface, l'un des cotes est rempli.
  for (const [ax, ay, bx, by] of aretes(ts, surface)) if (areteTouche(z, ax, ay, bx, by)) return true;
  // Rien ne se croise : la zone est tout entiere d'un seul cote du trace, un de ses points dit si elle est dans la surface.
  if (surface && dansSurface(ts, z.pts[0] ?? 0, z.pts[1] ?? 0, regle)) return true;
  if (demi <= 0) return false;
  for (const [ax, ay, bx, by] of aretes(ts, false)) {
    if (Math.max(ax, bx) < z.x0 - demi || Math.min(ax, bx) > z.x1 + demi || Math.max(ay, by) < z.y0 - demi || Math.min(ay, by) > z.y1 + demi) continue;
    if (presDuBord(z, ax, ay, bx, by, demi, false)) return true;
  }
  return false;
}

/** Tout ce que la forme peint est-il dans le lasso ? (le cadre se contente de la boite avec trait, exacte) */
function dedansLasso(p: Peint, z: ZonePrete): boolean {
  const { ts, surface, regle, demi } = p;
  for (const { pts } of ts) for (let i = 0; i < pts.length; i += 2) if (!dansZone(z, pts[i] ?? 0, pts[i + 1] ?? 0)) return false;
  for (const [ax, ay, bx, by] of aretes(ts, surface)) if (areteTouche(z, ax, ay, bx, by)) return false;
  // Un lasso qui se recoupe peut laisser un ilot vide au milieu d'une surface : un sommet du lasso dans la surface le dit.
  if (surface) for (let i = 0; i < z.pts.length; i += 2) if (dansSurface(ts, z.pts[i] ?? 0, z.pts[i + 1] ?? 0, regle)) return false;
  if (demi <= 0) return true;
  for (const [ax, ay, bx, by] of aretes(ts, false)) if (presDuBord(z, ax, ay, bx, by, demi, true)) return false;
  return true;
}

/** Les options d'une prise par zone. */
export interface OptionsZone {
  readonly regle: RegleZone;
  /** La vue « contours » : chaque forme se prend aussi par sa surface, son trait sans epaisseur. */
  readonly contours?: boolean;
}

/** La forme est-elle prise par la zone ? Masquee ou verrouillee : jamais. */
export function formePrise(f: Forme, zone: Zone, o: OptionsZone): boolean {
  const z = preparer(zone);
  return !!z && f.visible && !f.verrouille && prise(f, z, o);
}

function prise(f: Forme, z: ZonePrete, o: OptionsZone): boolean {
  const e = etendue(f);
  if (!e) return false;
  const ex1 = e.x + e.l, ey1 = e.y + e.h;
  if (ex1 < z.x0 || e.x > z.x1 || ey1 < z.y0 || e.y > z.y1) return false;
  const contenue = e.x >= z.x0 && ex1 <= z.x1 && e.y >= z.y0 && ey1 <= z.y1;
  if (z.rect && contenue) return true;
  // Un lasso dont aucun bord ne touche la boite de la forme : la boite est tout entiere dedans (prise, par les deux regles) ou
  // dehors. Seules les formes que le bord du lasso traverse demandent le calcul fin : sans cela, chaque sommet de chaque forme
  // se testait contre chaque arete du lasso (270 ms pour un lasso de 200 points sur 5 000 formes, mesure).
  if (!z.rect && !bordDansBoite(z, e.x, e.y, ex1, ey1)) return dansZone(z, e.x, e.y);
  if (o.regle === 'dedans') {
    if (z.rect || !contenue) return false;
    const p = peint(f, !!o.contours);
    return !!p && dedansLasso(p, z);
  }
  const p = peint(f, !!o.contours);
  return !!p && toucheFine(p, z);
}

/**
 * Les formes que la zone prend, dans l'ordre du dessin. Les boites rangees de prise.ts (NaN pour une forme masquee, verrouillee
 * ou vide) ecartent d'abord tout ce qui est loin de la zone.
 */
export function formesDansZone(formes: readonly Forme[], zone: Zone, o: OptionsZone): string[] {
  const z = preparer(zone);
  if (!z) return [];
  const r = rangee(formes);
  const out: string[] = [];
  for (let i = 0; i < formes.length; i++) {
    // NaN : toute comparaison est fausse, la forme est ecartee.
    if (!((r[i * 4 + 2] ?? NaN) >= z.x0) || !((r[i * 4] ?? NaN) <= z.x1) || !((r[i * 4 + 3] ?? NaN) >= z.y0) || !((r[i * 4 + 1] ?? NaN) <= z.y1)) continue;
    const f = formes[i];
    if (f && prise(f, z, o)) out.push(f.id);
  }
  return out;
}

/** La selection apres le geste : remplacee, augmentee (dans l'ordre : l'ancienne puis les nouvelles), ou diminuee. */
export function appliquerZone(sel: readonly string[], pris: readonly string[], effet: EffetZone): string[] {
  if (effet === 'remplacer') return [...pris];
  if (effet === 'ajouter') { const deja = new Set(sel); return [...sel, ...pris.filter(id => !deja.has(id))]; }
  const retires = new Set(pris);
  return sel.filter(id => !retires.has(id));
}

/** Le rectangle de deux coins, dans n'importe quel ordre. */
export const rectangleDe = (a: PointZone, b: PointZone): Boite =>
  ({ x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), l: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) });

/**
 * Le point suivant d'un lasso trace au pointeur, ou null s'il est trop pres du dernier (moins de `pas`, en unites du plan) : un
 * lasso de quelques centaines de points suffit a tout geste, et chaque point coute dans le calcul.
 */
export function pointLasso(lasso: readonly PointZone[], p: PointZone, pas: number): PointZone | null {
  const d = lasso[lasso.length - 1];
  return d && Math.hypot(p[0] - d[0], p[1] - d[1]) < pas ? null : p;
}

// ---------------------------------------------------------------------------------------------
// Les selections du menu Edition : tout, inverser, meme fond, meme contour, meme type, a couper, a ecrire.
// ---------------------------------------------------------------------------------------------

/** Une forme qu'on peut choisir : visible et deverrouillee. */
const choisissable = (f: Forme): boolean => f.visible && !f.verrouille;

/** Toutes les formes qu'on peut choisir. */
export const toutesChoisissables = (d: DessinSvg): string[] => d.formes.filter(choisissable).map(f => f.id);

/** Les formes qu'on peut choisir et qui ne le sont pas. */
export function inverserSelection(d: DessinSvg, sel: readonly string[]): string[] {
  const choisies = new Set(sel);
  return d.formes.filter(f => choisissable(f) && !choisies.has(f.id)).map(f => f.id);
}

/** Le type d'une forme, pour « Sélectionner le même type » : un texte vivant, un trait (sans fond), ou une forme pleine. */
export type TypeForme = 'texte' | 'trait' | 'pleine';
export const typeDeForme = (f: Forme): TypeForme => (f.texte ? 'texte' : f.remplissage === null ? 'trait' : 'pleine');

/** Les modeles de la selection (dans l'ordre du dessin). */
const modeles = (d: DessinSvg, sel: readonly string[]): Forme[] => { const s = new Set(sel); return d.formes.filter(f => s.has(f.id)); };

/**
 * Les formes choisissables qui partagent une valeur avec une forme de la selection : la valeur de chaque modele (son fond, son
 * contour, son type), null comptant pour rien. Vide quand aucun modele n'a de valeur.
 */
function memes<T>(d: DessinSvg, sel: readonly string[], valeur: (f: Forme) => T | null): { valeurs: T[]; ids: string[] } {
  const valeurs = [...new Set(modeles(d, sel).map(valeur).filter((v): v is T => v !== null))];
  if (!valeurs.length) return { valeurs, ids: [] };
  const voulues = new Set<T>(valeurs);
  return { valeurs, ids: d.formes.filter(f => { const v = choisissable(f) ? valeur(f) : null; return v !== null && voulues.has(v); }).map(f => f.id) };
}

/** Les formes de meme couleur de fond qu'une forme choisie ; `valeurs` : les couleurs cherchees. */
export const memeFond = (d: DessinSvg, sel: readonly string[]) => memes(d, sel, f => f.remplissage);
/** Les formes de meme couleur de contour qu'une forme choisie. */
export const memeContour = (d: DessinSvg, sel: readonly string[]) => memes(d, sel, f => f.contour);
/** Les formes de meme type (texte, trait, forme pleine) qu'une forme choisie. */
export const memeType = (d: DessinSvg, sel: readonly string[]) => memes(d, sel, typeDeForme);

/** Les formes choisissables que la machine coupe, ou ecrit, sous le procede du moment (ADR-0028). */
export function formesParOperation(d: DessinSvg, procede: Procede, operation: Operation): string[] {
  return d.formes.filter(f => choisissable(f) && operationDe(f, procede) === operation).map(f => f.id);
}
