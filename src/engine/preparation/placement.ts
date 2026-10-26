// Dupliquer sur la feuille (ADR-0039) : la selection, une seule piece meme faite de plusieurs formes, copiee et rangee dans la feuille
// posee sur le tapis, sans chevaucher ce qui y est deja, avec un espacement entre les pieces et une marge au bord. Deux optimisations :
//
// - « simple » : par boites englobantes, en rangees de gauche a droite et de haut en bas ; avec la rotation permise, les deux
//   orientations sont essayees et la meilleure gardee ;
// - « avancee » : sur les contours reels (aplatis par les booleens, ADR-0004), placement glouton « en haut a gauche » sur une grille
//   au pas de l'espacement, aux quatre quarts de tour si la rotation est permise. Deux pieces sont assez loin quand leurs contours
//   sont a l'espacement l'un de l'autre : c'est exactement l'intersection vide des deux contours elargis d'un demi-espacement a angles
//   ronds, sans calculer l'elargissement. L'avancee garde le meilleur des deux calculs : elle pose toujours au moins autant.
//
// Le calcul est pur et deterministe ; l'avancee se fait par tranches (`avancerPlacement`) bornees par un nombre d'essais, pour que la
// page mesure le temps et rende la main (io/placement.ts) : le moteur ne lit jamais l'horloge.

import {
  boiteAvecTrait, copierPar, dupliquer, feuillesDe, transformer, type Boite, type DessinSvg, type Forme, type Matrice
} from '../editionSvg.js';
import type { MultiPolygon } from 'polygon-clipping';
import { toleranceBooleen } from '../booleens.js';
import { regionPeinte, unirRegions } from './silhouette.js';
import { pluriel } from '../../util/texte.js';

export type Optimisation = 'simple' | 'avancee';
export type QuartDeTour = 0 | 90 | 180 | 270;

export interface OptionsPlacement {
  /** Les copies a ajouter, l'original en plus ; « remplir » : autant qu'il en tient. */
  readonly quantite: number | 'remplir';
  /** L'ecart entre deux pieces, en unites du plan. */
  readonly espacement: number;
  /** L'ecart au bord de la feuille, en unites du plan. */
  readonly marge: number;
  /** Permettre de tourner les copies d'un quart de tour (et d'un demi-tour en avancee). */
  readonly rotation: boolean;
  readonly optimisation: Optimisation;
}

/** Les bornes : au-dela, un geste maladroit ne doit pas figer l'onglet. */
export const PLACEMENT_MAX = {
  /** Copies posees en un geste. */
  copies: 2000,
  /** L'espacement et la marge, en unites du plan (2 po). */
  ecart: 192,
  /** Les positions d'une grille d'imbrication, par orientation : le pas grandit au-dela. */
  positions: 160_000
} as const;

/** L'espacement par defaut pour la decoupe : 2 mm, en unites du plan. */
export const ESPACEMENT_DEFAUT = (2 / 25.4) * 96;
/** La marge par defaut au bord de la feuille : 2 mm aussi. */
export const MARGE_DEFAUT = (2 / 25.4) * 96;

/** Une copie posee : sa transformation depuis l'original (un quart de tour autour du centre de sa boite, puis un deplacement). */
export interface Pose { readonly matrice: Matrice; readonly angle: QuartDeTour; readonly boite: Boite }

export interface ResultatPlacement {
  readonly dessin: DessinSvg;
  /** L'original puis les copies, a choisir ensuite. */
  readonly ids: readonly string[];
  readonly copies: number;
  /** Les copies demandees ; null pour « remplir ». */
  readonly demandees: number | null;
  /** Les copies tournees. */
  readonly tournees: number;
  /** Le budget d'essais de l'avancee a ete epuise : le meilleur placement trouve est rendu. */
  readonly limite: boolean;
  readonly erreur?: string;
}

// ------------------------------------------------------------------------------------------------------------- geometrie

type Point = readonly [number, number];
type Anneau = readonly Point[];
/** Une piece : ses anneaux (exterieurs et trous, fermes implicitement) et sa boite. */
interface Piece { readonly anneaux: readonly Anneau[]; readonly boite: Boite }

const EPS = 1e-6;

/** Le quart de tour `a` autour de (cx, cy), dans le sens horaire a l'ecran, aux coefficients exacts. */
export function matriceQuart(a: QuartDeTour, cx: number, cy: number): Matrice {
  if (a === 90) return [0, 1, -1, 0, cx + cy, cy - cx];
  if (a === 180) return [-1, 0, 0, -1, 2 * cx, 2 * cy];
  if (a === 270) return [0, -1, 1, 0, cx - cy, cy + cx];
  return [1, 0, 0, 1, 0, 0];
}

const appliquer = (m: Matrice, [x, y]: Point): Point => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const avecDeplacement = (m: Matrice, dx: number, dy: number): Matrice => [m[0], m[1], m[2], m[3], m[4] + dx, m[5] + dy];

/** La boite d'un quart de tour de `b` autour de son centre : la meme, couchee pour 90 et 270. */
const boiteTournee = (b: Boite, a: QuartDeTour): Boite => (a === 90 || a === 270
  ? { x: b.x + b.l / 2 - b.h / 2, y: b.y + b.h / 2 - b.l / 2, l: b.h, h: b.l }
  : b);

const boiteDesAnneaux = (anneaux: readonly Anneau[]): Boite => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of anneaux) for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x: x0, y: y0, l: x1 - x0, h: y1 - y0 };
};

const deplacerPiece = (p: Piece, m: Matrice): Piece => {
  const anneaux = p.anneaux.map(r => r.map(q => appliquer(m, q)));
  return { anneaux, boite: boiteDesAnneaux(anneaux) };
};

const rectangle = (b: Boite): Anneau => [[b.x, b.y], [b.x + b.l, b.y], [b.x + b.l, b.y + b.h], [b.x, b.y + b.h]];

/** Vrai quand deux boites, l'une elargie de `d`, se touchent. */
const boitesProches = (a: Boite, b: Boite, d: number): boolean =>
  a.x - d < b.x + b.l && b.x < a.x + a.l + d && a.y - d < b.y + b.h && b.y < a.y + a.h + d;

/** Le carre de la distance d'un point a un segment. */
function distance2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  const x = ax + t * dx - px, y = ay + t * dy - py;
  return x * x + y * y;
}

const orient = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

/** Vrai quand deux segments se coupent ou se touchent. */
function seCoupent(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orient(a[0], a[1], b[0], b[1], c[0], c[1]), o2 = orient(a[0], a[1], b[0], b[1], d[0], d[1]);
  const o3 = orient(c[0], c[1], d[0], d[1], a[0], a[1]), o4 = orient(c[0], c[1], d[0], d[1], b[0], b[1]);
  return ((o1 > 0) !== (o2 > 0) || Math.abs(o1) < EPS || Math.abs(o2) < EPS) && ((o3 > 0) !== (o4 > 0) || Math.abs(o3) < EPS || Math.abs(o4) < EPS);
}

/** Vrai quand le point est dans la region (pair-impair sur tous les anneaux : les trous en sont exclus). */
function dedans(anneaux: readonly Anneau[], [px, py]: Point): boolean {
  let c = false;
  for (const r of anneaux) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i], b = r[j];
      if (a && b && (a[1] > py) !== (b[1] > py) && px < ((b[0] - a[0]) * (py - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
  }
  return c;
}

/**
 * Vrai quand deux pieces sont a moins de `d` l'une de l'autre (ou se chevauchent, ou l'une contient l'autre) : l'intersection non
 * vide de leurs contours elargis de d/2 a angles ronds. Une piece posee dans le trou d'une autre, assez loin de ses bords, ne la
 * touche pas.
 */
function tropPres(p: Piece, q: Piece, d: number): boolean {
  if (!boitesProches(p.boite, q.boite, d)) return false;
  const d2 = d * d;
  for (const rp of p.anneaux) {
    for (let i = 0; i < rp.length; i++) {
      const a = rp[i], b = rp[(i + 1) % rp.length];
      if (!a || !b) continue;
      const ex0 = Math.min(a[0], b[0]) - d, ex1 = Math.max(a[0], b[0]) + d, ey0 = Math.min(a[1], b[1]) - d, ey1 = Math.max(a[1], b[1]) + d;
      for (const rq of q.anneaux) {
        for (let k = 0; k < rq.length; k++) {
          const c = rq[k], e = rq[(k + 1) % rq.length];
          if (!c || !e) continue;
          if (Math.max(c[0], e[0]) < ex0 || Math.min(c[0], e[0]) > ex1 || Math.max(c[1], e[1]) < ey0 || Math.min(c[1], e[1]) > ey1) continue;
          if (seCoupent(a, b, c, e)) return true;
          if (d > 0 && (distance2(a[0], a[1], c[0], c[1], e[0], e[1]) < d2 || distance2(b[0], b[1], c[0], c[1], e[0], e[1]) < d2
            || distance2(c[0], c[1], a[0], a[1], b[0], b[1]) < d2 || distance2(e[0], e[1], a[0], a[1], b[0], b[1]) < d2)) return true;
        }
      }
    }
  }
  // Aucun bord ne se croise ni ne s'approche : l'une est entierement dans l'autre, ou elles sont disjointes.
  const pp = p.anneaux[0]?.[0], qq = q.anneaux[0]?.[0];
  return (pp !== undefined && dedans(q.anneaux, pp)) || (qq !== undefined && dedans(p.anneaux, qq));
}

// ------------------------------------------------------------------------------------------------------------- la piece

/** La piece : les formes de la selection, visibles et deverrouillees, et leur boite (trait compris). */
interface Unite { readonly ids: readonly string[]; readonly formes: readonly Forme[]; readonly boite: Boite }

/** Les anneaux d'une region des booleens, sans leur point de fermeture repete. */
const anneauxDeRegion = (m: MultiPolygon): Anneau[] => m.flatMap(poly => poly.map(anneau => anneau.slice(0, -1).map(([x, y]) => [x, y] as Point)));

/**
 * Le contour d'une forme pour l'imbrication : ce qu'elle peint, fond et trait (les booleens l'aplatissent et le memorisent par forme) ;
 * sa boite, trait compris, si la region ne se calcule pas (elle ne sous-estime jamais).
 */
function regionDe(f: Forme, tolerance: number): MultiPolygon {
  const r = regionPeinte(f, tolerance);
  if (r.length) return r;
  const b = boiteAvecTrait(f);
  return b ? [[[...rectangle(b), [b.x, b.y]] as Array<[number, number]>]] : [];
}

function uniteDe(dessin: DessinSvg, ids: readonly string[]): Unite | null {
  const voulus = new Set(feuillesDe(dessin, ids));
  const formes = dessin.formes.filter(f => voulus.has(f.id) && f.visible && !f.verrouille);
  const boites = formes.map(boiteAvecTrait).filter((b): b is Boite => b !== null);
  if (!formes.length || !boites.length) return null;
  const x = Math.min(...boites.map(b => b.x)), y = Math.min(...boites.map(b => b.y));
  const boite = { x, y, l: Math.max(...boites.map(b => b.x + b.l)) - x, h: Math.max(...boites.map(b => b.y + b.h)) - y };
  return { ids: formes.map(f => f.id), formes, boite };
}

/** Le contour de la piece pour l'imbrication : ses formes unies (un oeil pose sur un visage n'y fait pas un trou). */
function pieceDe(u: Unite, tolerance: number): Piece {
  const anneaux = anneauxDeRegion(unirRegions(u.formes.map(f => regionDe(f, tolerance))));
  if (!anneaux.length) anneaux.push(rectangle(u.boite));
  return { anneaux, boite: boiteDesAnneaux(anneaux) };
}

/**
 * La tolerance d'aplatissement de l'imbrication : un huitieme de l'espacement (un demi-point du plan au moins), bien plus large que
 * celle des booleens, pour que les courbes n'aient que quelques dizaines de cotes. Un contour aplati s'ecarte de la courbe d'au plus
 * cette tolerance : deux pieces se comparent donc a l'espacement plus deux tolerances, et la courbe vraie garde l'espacement.
 */
export const toleranceImbrication = (dessin: DessinSvg, espacement: number): number => Math.max(toleranceBooleen(dessin), espacement / 8, 0.5);

/**
 * Les obstacles : les formes deja posees que la machine coupera ou ecrira (visibles et peintes, verrouillees comprises) et qui touchent
 * la feuille, chacune par son contour reel (avancee : on peut glisser une piece dans ses creux) ou sa boite (simple). Une forme
 * masquee n'en est pas une ; une forme hors de la feuille est ignoree.
 */
function obstaclesDe(dessin: DessinSvg, u: Unite, tolerance: number | null, feuille: Boite): Piece[] {
  const dans = new Set(u.ids);
  return dessin.formes.filter(f => f.visible && !dans.has(f.id) && (f.remplissage !== null || (f.contour !== null && f.epaisseur > 0))).flatMap(f => {
    const b = boiteAvecTrait(f);
    if (!b || !boitesProches(b, feuille, 0)) return [];
    const anneaux = tolerance !== null ? anneauxDeRegion(regionDe(f, tolerance)) : [rectangle(b)];
    return anneaux.length ? [{ anneaux, boite: boiteDesAnneaux(anneaux) }] : [];
  });
}

const reduite = (r: Boite, m: number): Boite => ({ x: r.x + m, y: r.y + m, l: r.l - 2 * m, h: r.h - 2 * m });

// ------------------------------------------------------------------------------------------------------------- simple

/** Le placement par boites, dans une orientation : rangee par rangee, en sautant chaque obstacle par la droite. */
function rangees(u: Unite, region: Boite, obstacles: readonly Boite[], esp: number, a: QuartDeTour, voulues: number): Pose[] {
  const b = boiteTournee(u.boite, a), poses: Pose[] = [], occupees: Boite[] = [...obstacles];
  const cx = u.boite.x + u.boite.l / 2, cy = u.boite.y + u.boite.h / 2, rot = matriceQuart(a, cx, cy);
  for (let y = region.y; y + b.h <= region.y + region.h + EPS && poses.length < voulues; y += b.h + esp) {
    let x = region.x;
    while (x + b.l <= region.x + region.l + EPS && poses.length < voulues) {
      const ici = { x, y, l: b.l, h: b.h };
      const genes = occupees.filter(o => boitesProches(ici, o, esp - EPS));
      if (!genes.length) {
        poses.push({ matrice: avecDeplacement(rot, x - b.x, y - b.y), angle: a, boite: ici });
        occupees.push(ici);
        x += b.l + esp;
      } else x = Math.max(...genes.map(o => o.x + o.l)) + esp;
    }
  }
  return poses;
}

function placementSimple(u: Unite, region: Boite, obstacles: readonly Piece[], o: OptionsPlacement, voulues: number): Pose[] {
  const boites = [u.boite, ...obstacles.map(p => p.boite)];
  const droites = rangees(u, region, boites, o.espacement, 0, voulues);
  if (!o.rotation || droites.length >= voulues) return droites;
  const couchees = rangees(u, region, boites, o.espacement, 90, voulues);
  return couchees.length > droites.length ? couchees : droites;
}

// ------------------------------------------------------------------------------------------------------------- avancee

/** Une orientation de l'imbrication : la piece tournee a l'origine, et le curseur de sa grille (les positions d'avant ne vont plus). */
interface Orientation { readonly angle: QuartDeTour; readonly rot: Matrice; readonly piece: Piece; readonly nx: number; readonly ny: number; curseur: number }

/** L'etat d'une imbrication en cours : ce qui est pose, et ou chaque orientation en est de sa grille. */
export interface EtatPlacement {
  readonly unite: Unite | null;
  readonly region: Boite;
  readonly options: OptionsPlacement;
  readonly voulues: number;
  readonly pas: number;
  /** L'ecart que deux contours aplatis doivent garder : l'espacement, plus deux tolerances d'aplatissement. */
  readonly ecart: number;
  readonly orientations: readonly Orientation[];
  readonly posees: Pose[];
  readonly pieces: Piece[];
  /** Les essais faits (un essai : une position comparee aux pieces voisines). */
  essais: number;
  fini: boolean;
  /** Le placement simple, calcule d'abord : l'avancee ne rend jamais moins. */
  readonly simple: readonly Pose[];
  readonly erreur?: string;
}

/** Les copies voulues : la quantite bornee, ou le plafond pour « remplir ». */
const copiesVoulues = (q: OptionsPlacement['quantite']): number => (q === 'remplir' ? PLACEMENT_MAX.copies : Math.min(PLACEMENT_MAX.copies, Math.max(0, Math.floor(q))));

function refuser(o: OptionsPlacement, region: Boite, erreur: string): EtatPlacement {
  return { unite: null, region, options: o, voulues: 0, pas: 1, ecart: 0, orientations: [], posees: [], pieces: [], essais: 0, fini: true, simple: [], erreur };
}

/**
 * Le depart d'un placement : la piece, les obstacles, la region (la feuille moins sa marge), et deja le placement simple. Pour
 * l'optimisation simple, il est fini des le depart.
 */
export function preparerPlacement(dessin: DessinSvg, ids: readonly string[], feuille: Boite, o: OptionsPlacement): EtatPlacement {
  const region = reduite(feuille, o.marge);
  if (!(o.espacement >= 0) || !(o.marge >= 0) || o.espacement > PLACEMENT_MAX.ecart || o.marge > PLACEMENT_MAX.ecart) {
    return refuser(o, region, 'L’espacement et la marge vont de 0 à ' + PLACEMENT_MAX.ecart / 96 * 25.4 + ' mm.');
  }
  const voulues = copiesVoulues(o.quantite);
  if (o.quantite !== 'remplir' && !(voulues >= 1)) return refuser(o, region, 'Demandez au moins une copie.');
  const u = uniteDe(dessin, ids);
  if (!u) return refuser(o, region, 'Choisissez d’abord une forme visible et déverrouillée à dupliquer.');
  if (!(region.l > 0) || !(region.h > 0)) return refuser(o, region, 'La feuille est trop petite pour sa marge.');
  const simple = placementSimple(u, region, obstaclesDe(dessin, u, null, feuille), o, voulues);
  const base: EtatPlacement = { unite: u, region, options: o, voulues, pas: 1, ecart: o.espacement, orientations: [], posees: [], pieces: [], essais: 0, fini: true, simple };
  if (o.optimisation === 'simple' || simple.length >= voulues) return base;
  // La grille de l'imbrication : au pas de l'espacement (un tiers de millimetre au moins), elargi si elle compterait trop de positions.
  const surface = region.l * region.h;
  const pas = Math.max(o.espacement, 1.25, Math.sqrt(surface / PLACEMENT_MAX.positions));
  const cx = u.boite.x + u.boite.l / 2, cy = u.boite.y + u.boite.h / 2;
  const tolerance = toleranceImbrication(dessin, o.espacement), piece = pieceDe(u, tolerance);
  const angles: readonly QuartDeTour[] = o.rotation ? [0, 90, 180, 270] : [0];
  const orientations: Orientation[] = angles.map(angle => {
    const rot = matriceQuart(angle, cx, cy), tournee = deplacerPiece(piece, rot);
    const b = boiteTournee(u.boite, angle);
    // La piece se range par sa boite, trait compris ; sa grille ne la fait jamais sortir de la region.
    const nx = Math.floor((region.l - b.l) / pas + EPS) + 1, ny = Math.floor((region.h - b.h) / pas + EPS) + 1;
    return { angle, rot, piece: tournee, nx: Math.max(0, nx), ny: Math.max(0, ny), curseur: 0 };
  });
  return { ...base, pas, ecart: o.espacement + 2 * tolerance, orientations, pieces: [piece, ...obstaclesDe(dessin, u, tolerance, feuille)], fini: false };
}

/** La position `i` de la grille d'une orientation : le deplacement depuis l'original tourne, et la boite qu'il donne. */
function position(e: EtatPlacement, or: Orientation, i: number): { dx: number; dy: number; boite: Boite } | null {
  const u = e.unite;
  if (!u) return null;
  const b = boiteTournee(u.boite, or.angle), gx = i % or.nx, gy = Math.floor(i / or.nx);
  const x = e.region.x + gx * e.pas, y = e.region.y + gy * e.pas;
  return { dx: x - b.x, dy: y - b.y, boite: { x, y, l: b.l, h: b.h } };
}

/** Vrai quand la piece de cette orientation, deplacee, est assez loin de tout ce qui est pose. Compte un essai. */
function libre(e: EtatPlacement, or: Orientation, dx: number, dy: number, boite: Boite): boolean {
  e.essais++;
  const esp = e.ecart;
  let mobile: Piece | null = null;
  for (const p of e.pieces) {
    if (!boitesProches(boite, p.boite, esp)) continue;
    mobile ??= deplacerPiece(or.piece, [1, 0, 0, 1, dx, dy]);
    if (tropPres(mobile, p, esp)) return false;
  }
  return true;
}

/**
 * Avance l'imbrication d'au plus `essais` essais : chaque copie prend, parmi les orientations, la premiere position libre de la grille
 * dans l'ordre de lecture (haut, puis gauche), et la plus haute puis la plus a gauche des orientations. Une position refusee l'est pour
 * toujours (les pieces ne font que s'ajouter) : chaque orientation garde son curseur, et la grille ne se parcourt qu'une fois.
 */
export function avancerPlacement(e0: EtatPlacement, essais: number): EtatPlacement {
  if (e0.fini || !e0.unite) return e0;
  // Un etat neuf a chaque tranche : celui qu'on recoit ne change pas.
  const e: EtatPlacement = { ...e0, orientations: e0.orientations.map(o => ({ ...o })), posees: [...e0.posees], pieces: [...e0.pieces] };
  const borne = e.essais + Math.max(1, essais);
  while (e.posees.length < e.voulues) {
    let meilleure: { or: Orientation; i: number; dx: number; dy: number; boite: Boite } | null = null;
    for (const or of e.orientations) {
      const total = or.nx * or.ny;
      while (or.curseur < total) {
        if (e.essais >= borne) return e;
        const q = position(e, or, or.curseur);
        if (q && libre(e, or, q.dx, q.dy, q.boite)) break;
        or.curseur++;
      }
      if (or.curseur >= total) continue;
      const q = position(e, or, or.curseur);
      if (q && (!meilleure || q.boite.y < meilleure.boite.y - EPS || (Math.abs(q.boite.y - meilleure.boite.y) <= EPS && q.boite.x < meilleure.boite.x))) meilleure = { or, i: or.curseur, ...q };
    }
    if (!meilleure) break;
    const m = avecDeplacement(meilleure.or.rot, meilleure.dx, meilleure.dy);
    e.posees.push({ matrice: m, angle: meilleure.or.angle, boite: meilleure.boite });
    e.pieces.push(deplacerPiece(meilleure.or.piece, [1, 0, 0, 1, meilleure.dx, meilleure.dy]));
  }
  e.fini = true;
  return e;
}

/** Le meilleur placement trouve : l'imbrication, ou le simple s'il en pose autant ou plus (a egalite, le simple, plus regulier). */
export const posesDe = (e: EtatPlacement): readonly Pose[] => (e.posees.length > e.simple.length ? e.posees : e.simple);

/** Pose les copies trouvees dans le dessin : une seule operation, que l'historique garde comme une entree. */
export function finirPlacement(dessin: DessinSvg, e: EtatPlacement): ResultatPlacement {
  const demandees = e.options.quantite === 'remplir' ? null : e.voulues;
  if (e.erreur || !e.unite) return { dessin, ids: [], copies: 0, demandees, tournees: 0, limite: false, erreur: e.erreur ?? 'Rien à dupliquer.' };
  const poses = posesDe(e), u = e.unite, limite = !e.fini;
  if (!poses.length) return { dessin, ids: u.ids, copies: 0, demandees, tournees: 0, limite, erreur: 'Aucune copie ne tient sur la feuille : agrandissez la feuille, réduisez l’espacement ou la marge, ou permettez la rotation.' };
  const tournees = poses.filter(p => p.angle !== 0).length;
  if (!dessin.groupes) {
    const r = copierPar(dessin, u.ids, poses.map(p => p.matrice));
    return { dessin: r.dessin, ids: r.ids, copies: poses.length, demandees, tournees, limite, ...(r.erreur ? { erreur: r.erreur } : {}) };
  }
  // Le modele riche : chaque copie passe par la duplication des noeuds (un groupe se copie avec son sous-arbre), puis se transforme.
  let d = dessin;
  const ids: string[] = [...u.ids];
  for (const p of poses) {
    const r = dupliquer(d, u.ids, 0, 0);
    d = transformer(r.dessin, r.ids, p.matrice);
    ids.push(...r.ids);
  }
  return { dessin: d, ids, copies: poses.length, demandees, tournees, limite };
}

/** Le placement d'un trait, sans tranches : ce que les tests et l'optimisation simple appellent. */
export function placerSurFeuille(dessin: DessinSvg, ids: readonly string[], feuille: Boite, o: OptionsPlacement, essaisMax = Infinity): ResultatPlacement {
  const e = preparerPlacement(dessin, ids, feuille, o);
  return finirPlacement(dessin, avancerPlacement(e, essaisMax));
}

/** La phrase d'un placement fait : combien de copies, et pourquoi pas plus. */
export function phrasePlacement(r: ResultatPlacement): string {
  if (r.erreur && !r.copies) return r.erreur;
  const posees = pluriel(r.copies, 'copie') + ' ' + (r.copies > 1 ? 'posées' : 'posée');
  const tournees = r.tournees ? ' (' + r.tournees + ' tournée' + (r.tournees > 1 ? 's' : '') + ')' : '';
  const limite = r.limite ? ' Le calcul a atteint sa limite : c’est le meilleur placement trouvé.' : '';
  if (r.demandees === null) return posees + tournees + ' : la feuille est pleine.' + limite + ' Ctrl+Z les retire.';
  if (r.copies < r.demandees) return r.copies + ' copie' + (r.copies > 1 ? 's posées' : ' posée') + ' sur ' + r.demandees + tournees + ' : la feuille est pleine.' + limite + ' Ctrl+Z les retire.';
  return posees + tournees + ' sur la feuille.' + limite + ' Ctrl+Z les retire.';
}
