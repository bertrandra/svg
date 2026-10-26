// Les liens des ilots (ADR-0040). Une forme pleine a couper qui a un trou (le centre d'un O, d'un A, d'un D) laisse, une fois la
// lame passee, un morceau de feuille entierement entoure par la zone decoupee : en pochoir, ou l'on garde la feuille et retire la
// forme, ce morceau tombe. C'est un ilot. Un lien (un pont) est une bande de feuille laissee en travers de la zone decoupee, qui
// retient l'ilot au reste de la feuille : la forme perd cette bande, le reste ne change pas.
//
// Le sens retenu : un ilot est un anneau interieur de la region peinte d'une forme a couper (sa regle de remplissage comprise,
// pair-impair ou selon le sens du trace). Les ilots imbriques (le centre du R d'un ®) en sont aussi : le trou du R est un anneau
// interieur du polygone du R, l'espace entre le cercle et le R un anneau interieur du polygone du cercle. Chaque ilot se relie a
// la matiere qui l'entoure de l'autre cote de SON polygone : le centre du R au fond du ®, le fond du ® au reste de la feuille ; de
// proche en proche, toute la feuille se tient.
//
// Le placement : `nombre` positions egalement espacees le long du bord de l'ilot ; autour de chacune, le lien le plus court vers
// le bord exterieur de son polygone (le point le plus proche, donc perpendiculaire a ce bord, et localement au bord de l'ilot
// quand on minimise sur la fenetre), en evitant les coins (penalite de virage) et tout trajet qui couperait un autre trou. Le
// depart de la serie est choisi parmi huit decalages pour la serie la plus courte. La bande est un rectangle de `largeur` qui
// deborde de chaque cote, rogne a la seule matiere de son polygone (le morceau qui porte le milieu du lien) : elle ne touche
// jamais une autre partie de la forme. Pur et deterministe ; les ilots d'une forme se memorisent par forme.

import clipping, { type MultiPolygon, type Pair, type Polygon, type Ring } from 'polygon-clipping';
import { cheminDeRegion, cheminLisseDeRegion, regionDeForme, toleranceBooleen } from '../booleens.js';
import { boiteForme, estPlat, feuillesDe, sansTexte, verrouilleEffectif, visibleEffectif, type Boite, type DessinSvg, type Forme } from '../editionSvg.js';
import { aireDeRegion } from '../contour/region.js';
import { unirRegions } from './silhouette.js';
import { MM_PAR_POUCE, UNITES_PLAN_PAR_POUCE, type Procede } from '../../model/contextes.js';
import { pluriel } from '../../util/texte.js';
import { au } from '../../util/tableaux.js';
import { operationDe } from './operations.js';
import { POINTS_MAX_MESURE } from './finesse.js';

const mm = (v: number): number => (v / MM_PAR_POUCE) * UNITES_PLAN_PAR_POUCE;

/** La largeur d'un lien par defaut (2 mm, la demande du proprietaire), et ses bornes, en unites du plan. */
export const LARGEUR_LIEN_DEFAUT = mm(2);
export const LARGEUR_LIEN_MIN = mm(0.5);
export const LARGEUR_LIEN_MAX = mm(10);
/** Le nombre de liens par ilot, par defaut et ses bornes. */
export const NOMBRE_LIENS_DEFAUT = 3;
export const NOMBRE_LIENS_MIN = 1;
export const NOMBRE_LIENS_MAX = 12;
/** En deca de cette aire (un carre de la plus petite largeur de lien), un trou n'est qu'une miette : il n'est pas un ilot. */
export const ILOT_AIRE_MIN = LARGEUR_LIEN_MIN * LARGEUR_LIEN_MIN;

export interface OptionsLiens {
  /** La largeur d'un lien, en unites du plan. */
  readonly largeur: number;
  /** Le nombre de liens par ilot. */
  readonly nombre: number;
  /** Rebatir les courbes de la forme (comme les booleens) ; vrai par defaut. */
  readonly lisser?: boolean;
}

export const LIENS_DEFAUT: OptionsLiens = { largeur: LARGEUR_LIEN_DEFAUT, nombre: NOMBRE_LIENS_DEFAUT };

/** Les reglages ramenes dans leurs bornes : une valeur illisible vaut le defaut, le nombre est entier. */
export function bornerLiens(o: OptionsLiens): OptionsLiens {
  const largeur = Number.isFinite(o.largeur) ? Math.min(LARGEUR_LIEN_MAX, Math.max(LARGEUR_LIEN_MIN, o.largeur)) : LARGEUR_LIEN_DEFAUT;
  const nombre = Number.isFinite(o.nombre) ? Math.min(NOMBRE_LIENS_MAX, Math.max(NOMBRE_LIENS_MIN, Math.round(o.nombre))) : NOMBRE_LIENS_DEFAUT;
  return { ...o, largeur, nombre };
}

/** Un ilot : l'anneau interieur `anneau` du polygone `polygone` de la region peinte, et son aire. */
export interface Ilot { readonly polygone: number; readonly anneau: number; readonly aire: number }

const aireAnneau = (r: Ring): number => {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = au(r, i), q = au(r, (i + 1) % r.length);
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
};

/** Les ilots d'une region : ses anneaux interieurs, moins les miettes. */
function ilotsDeRegion(region: MultiPolygon): Ilot[] {
  const r: Ilot[] = [];
  region.forEach((poly, polygone) => poly.forEach((anneau, k) => {
    if (k === 0) return;
    const aire = aireAnneau(anneau);
    if (aire > ILOT_AIRE_MIN) r.push({ polygone, anneau: k, aire });
  }));
  return r;
}

interface Mesure { readonly region: MultiPolygon; readonly ilots: readonly Ilot[] }
const memo = new WeakMap<Forme, Map<number, Mesure>>();
const RIEN: Mesure = { region: [], ilots: [] };

/** La region d'une forme et ses ilots ; `borne`, une forme trop chargee n'est pas mesuree (le panneau juge en continu). */
function mesurer(f: Forme, tolerance: number, borne = true): Mesure {
  if (f.remplissage === null || f.image || (borne && f.d.length > POINTS_MAX_MESURE)) return RIEN;
  let parTolerance = memo.get(f);
  if (!parTolerance) { parTolerance = new Map(); memo.set(f, parTolerance); }
  const connue = parTolerance.get(tolerance);
  if (connue) return connue;
  const region = regionDeForme(f, tolerance), r = { region, ilots: ilotsDeRegion(region) };
  parTolerance.set(tolerance, r);
  return r;
}

/**
 * Les ilots d'une forme : rien pour une forme sans fond (un trait n'a pas d'interieur), une image, ou une forme trop chargee pour
 * un panneau qui juge en continu. Memorise par forme et par tolerance (ADR-0008).
 */
export const ilotsDe = (f: Forme, tolerance: number): readonly Ilot[] => mesurer(f, tolerance).ilots;

const visibleDans = (d: DessinSvg, f: Forme): boolean => (estPlat(d) ? f.visible : visibleEffectif(d, f.id));
const seCroisent = (a: Boite, b: Boite): boolean => a.x <= b.x + b.l && b.x <= a.x + a.l && a.y <= b.y + b.h && b.y <= a.y + a.h;

/**
 * Les ilots d'une forme qui tomberont vraiment : ceux qu'aucune autre forme a couper de la meme couleur (le meme tapis) ne couvre
 * entierement. Un trou bouche par une forme posee dessus (le contour d'un carre devenu un anneau, sur le carre) ne laisse aucun
 * morceau de feuille : la lame y decoupe la forme du dessus. Un trou couvert en partie reste un ilot (le cas prudent).
 */
export function ilotsQuiTombent(dessin: DessinSvg, f: Forme, procede: Procede | null, tolerance: number, borne = true): readonly Ilot[] {
  const { region, ilots } = mesurer(f, tolerance, borne);
  if (!ilots.length || f.remplissage === null) return ilots;
  const couleur = f.remplissage.toLowerCase();
  const memes = dessin.formes.filter(g => g !== f && g.remplissage !== null && !g.image && g.remplissage.toLowerCase() === couleur && visibleDans(dessin, g)
    && (procede === null || operationDe(g, procede) === 'decoupe'));
  if (!memes.length) return ilots;
  return ilots.filter(il => {
    const trou = au(au(region, il.polygone), il.anneau), b = boiteDAnneau(trou);
    const dessus = memes.filter(g => { const bg = boiteForme(g); return bg !== null && seCroisent(b, bg); });
    if (!dessus.length) return true;
    const couvert = clipping.intersection([trou], unirRegions(dessus.map(g => regionDeForme(g, tolerance))));
    return aireDeRegion(couvert) < il.aire * 0.999;
  });
}

function boiteDAnneau(r: Ring): Boite {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x: x0, y: y0, l: x1 - x0, h: y1 - y0 };
}

// ---------------------------------------------------------------- geometrie du placement

type Point = readonly [number, number];

/** L'anneau sans son point de fermeture (polygon-clipping repete le premier point a la fin). */
const ouvert = (r: Ring): Pair[] => {
  const n = r.length, a = r[0], z = r[n - 1];
  return n > 1 && a && z && a[0] === z[0] && a[1] === z[1] ? r.slice(0, -1) : r.slice();
};

/** Un anneau parcouru a l'abscisse curviligne : ses longueurs cumulees et le point a une abscisse (modulo le perimetre). */
function abscisses(pts: readonly Pair[]): { longueur: number; point: (s: number) => Point } {
  const cumul: number[] = [0];
  for (let i = 0; i < pts.length; i++) {
    const p = au(pts, i), q = au(pts, (i + 1) % pts.length);
    cumul.push(au(cumul, i) + Math.hypot(q[0] - p[0], q[1] - p[1]));
  }
  const longueur = au(cumul, pts.length);
  const point = (s0: number): Point => {
    const s = ((s0 % longueur) + longueur) % longueur;
    let lo = 0, hi = pts.length;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (au(cumul, m) <= s) lo = m; else hi = m; }
    const p = au(pts, lo), q = au(pts, (lo + 1) % pts.length), l = au(cumul, lo + 1) - au(cumul, lo);
    const t = l > 0 ? (s - au(cumul, lo)) / l : 0;
    return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  };
  return { longueur, point };
}

/** Le point le plus proche de `p` sur les anneaux donnes, et sa distance. */
function plusProche(p: Point, anneaux: readonly (readonly Pair[])[]): { q: Point; d: number } {
  let q: Point = p, d = Infinity;
  for (const r of anneaux) for (let i = 0; i < r.length; i++) {
    const a = au(r, i), b = au(r, (i + 1) % r.length);
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    const x = a[0] + dx * t, y = a[1] + dy * t, e = Math.hypot(p[0] - x, p[1] - y);
    if (e < d) { d = e; q = [x, y]; }
  }
  return { q, d };
}

const orient = (a: Point, b: Point, c: Point): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** Vrai si le segment [a, b] coupe un cote d'un des anneaux (au sens strict). */
function coupe(a: Point, b: Point, anneaux: readonly (readonly Pair[])[]): boolean {
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
  for (const r of anneaux) for (let i = 0; i < r.length; i++) {
    const c = au(r, i), d = au(r, (i + 1) % r.length);
    if (Math.max(c[0], d[0]) < x0 || Math.min(c[0], d[0]) > x1 || Math.max(c[1], d[1]) < y0 || Math.min(c[1], d[1]) > y1) continue;
    const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
    if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;
  }
  return false;
}

/** Vrai si le point est dans l'anneau (pair-impair). */
function dansAnneau(p: Point, r: readonly Pair[]): boolean {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = au(r, i), b = au(r, j);
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

/** Vrai si le point est dans la matiere du polygone : dans son bord exterieur, hors de ses trous. */
const dansPolygone = (p: Point, poly: readonly (readonly Pair[])[]): boolean => poly.length > 0 && dansAnneau(p, au(poly, 0)) && poly.slice(1).every(h => !dansAnneau(p, h));

/** L'angle (radians, dans [0, pi]) dont tourne le bord entre trois points. */
function virage(a: Point, p: Point, b: Point): number {
  const ux = p[0] - a[0], uy = p[1] - a[1], vx = b[0] - p[0], vy = b[1] - p[1];
  const nu = Math.hypot(ux, uy), nv = Math.hypot(vx, vy);
  if (!(nu > 0) || !(nv > 0)) return 0;
  return Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (nu * nv))));
}

interface Candidat { readonly p: Point; readonly q: Point; readonly score: number }

/** Au plus, tant d'echantillons le long d'un ilot : le cout reste celui d'un geste, pas d'un calcul. */
const ECHANTILLONS_MAX = 512;
/** Les departs de serie essayes, en fractions de l'espacement. */
const DECALAGES = 8;
/** La fenetre de chaque lien autour de sa position reguliere, en fraction de l'espacement : les liens restent repartis. */
const FENETRE = 0.35;

/**
 * Les candidats de lien le long de l'ilot `trou` (anneau ouvert) : pour chaque echantillon, le lien le plus court vers `cibles`,
 * s'il ne coupe aucun autre bord ; null sinon.
 */
function candidats(trou: readonly Pair[], cibles: readonly (readonly Pair[])[], anneaux: readonly (readonly Pair[])[], poly: readonly (readonly Pair[])[], o: OptionsLiens, tolerance: number): Array<Candidat | null> {
  const { longueur, point } = abscisses(trou);
  if (!(longueur > 0)) return [];
  const w = o.largeur, hw = w / 2;
  const n = Math.min(ECHANTILLONS_MAX, Math.max(o.nombre * 16, Math.ceil(longueur / (w / 4))));
  const r: Array<Candidat | null> = [];
  for (let i = 0; i < n; i++) {
    const s = ((i + 0.5) * longueur) / n, p = point(s);
    const { q, d } = plusProche(p, cibles);
    if (!(d > tolerance)) { r.push(null); continue; }
    const ux = (q[0] - p[0]) / d, uy = (q[1] - p[1]) / d, vx = -uy, vy = ux;
    // Le milieu dans la matiere, et ni l'axe ni les bords de la bande ne traversent un autre bord (un autre trou, un repli).
    const e = Math.min(d * 0.02, tolerance);
    const a: Point = [p[0] + ux * e, p[1] + uy * e], b: Point = [q[0] - ux * e, q[1] - uy * e];
    const m: Point = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    if (!dansPolygone(m, poly) || coupe(a, b, anneaux)) { r.push(null); continue; }
    const bord = (k: number): boolean => {
      const a2: Point = [p[0] + ux * d * 0.2 + vx * hw * k, p[1] + uy * d * 0.2 + vy * hw * k];
      const b2: Point = [q[0] - ux * d * 0.2 + vx * hw * k, q[1] - uy * d * 0.2 + vy * hw * k];
      return coupe(a2, b2, anneaux);
    };
    if (bord(1) || bord(-1)) { r.push(null); continue; }
    // Un lien pose sur un coin du trou serait mal tenu (et la lame y tourne) : le virage du bord a une largeur de part et d autre
    // le penalise, ce qui garde les bords du lien a une demi-largeur au moins du coin.
    const tourne = virage(point(s - w), p, point(s + w));
    r.push({ p, q, score: d + w * tourne });
  }
  return r;
}

/** Les `nombre` liens retenus parmi les candidats : un par fenetre reguliere, la serie la plus complete puis la plus courte. */
function choisir(c: ReadonlyArray<Candidat | null>, nombre: number, largeur: number): Candidat[] {
  const n = c.length;
  if (!n) return [];
  // Dans sa fenetre, le lien le plus court ; a longueur egale (un cercle), le plus proche de sa place reguliere : les liens
  // restent egalement espaces. Un lien qui toucherait le precedent (plus pres qu'une largeur et un dixieme) est ecarte : deux
  // bandes fondues n'en font qu'une.
  const meilleur = (de: number, a: number, centre: number, serie: readonly Candidat[]): Candidat | null => {
    let m: Candidat | null = null, sm = Infinity;
    for (let i = de; i <= a; i++) {
      const x = c[((i % n) + n) % n] ?? null;
      if (!x || serie.some(y => Math.hypot(x.p[0] - y.p[0], x.p[1] - y.p[1]) < largeur * 1.1)) continue;
      const s = x.score + (Math.abs(i - centre) / n) * largeur * 0.5;
      if (s < sm) { m = x; sm = s; }
    }
    return m;
  };
  if (nombre === 1) { const m = meilleur(0, n - 1, (n - 1) / 2, []); return m ? [m] : []; }
  const pas = n / nombre;
  let retenu: Candidat[] = [], total = Infinity;
  for (let k = 0; k < DECALAGES; k++) {
    const serie: Candidat[] = [];
    let somme = 0;
    for (let j = 0; j < nombre; j++) {
      const centre = (k * pas) / DECALAGES + j * pas;
      const m = meilleur(Math.ceil(centre - FENETRE * pas), Math.floor(centre + FENETRE * pas), centre, serie);
      if (m) { serie.push(m); somme += m.score; }
    }
    if (serie.length > retenu.length || (serie.length === retenu.length && somme < total - 1e-9)) { retenu = serie; total = somme; }
  }
  return retenu;
}

/**
 * Ce qu'un lien retire de son polygone : le rectangle de [p, q], deborde d'une largeur de chaque cote, moins la matiere du polygone
 * qu'il croiserait ailleurs que sur le lien (le morceau qui ne porte pas son milieu). On retire le rectangle entier plutot que sa
 * part rognee a la matiere : des bords confondus au flottant pres laisseraient au moteur de decoupe un fil de zero de large, et la
 * bande ne trancherait pas.
 */
function bande(l: Candidat, largeur: number, poly: Polygon): MultiPolygon | null {
  const d = Math.hypot(l.q[0] - l.p[0], l.q[1] - l.p[1]);
  const ux = (l.q[0] - l.p[0]) / d, uy = (l.q[1] - l.p[1]) / d, vx = -uy * largeur / 2, vy = ux * largeur / 2;
  const a: Pair = [l.p[0] - ux * largeur, l.p[1] - uy * largeur], b: Pair = [l.q[0] + ux * largeur, l.q[1] + uy * largeur];
  const rect: Ring = [[a[0] - vx, a[1] - vy], [b[0] - vx, b[1] - vy], [b[0] + vx, b[1] + vy], [a[0] + vx, a[1] + vy], [a[0] - vx, a[1] - vy]];
  const morceaux = clipping.intersection([rect], poly);
  const m: Point = [(l.p[0] + l.q[0]) / 2, (l.p[1] + l.q[1]) / 2];
  if (!morceaux.some(x => dansPolygone(m, x))) return null;
  const ailleurs = morceaux.filter(x => !dansPolygone(m, x));
  return ailleurs.length ? clipping.difference([rect], ailleurs) : [[rect]];
}

/** Les bandes des liens d'un ilot (l'anneau `rang` du polygone) : vers le bord exterieur, sinon, faute de mieux, vers un autre trou. */
function liensDIlot(poly: Polygon, rang: number, o: OptionsLiens, tolerance: number): MultiPolygon[] {
  const anneaux = poly.map(ouvert), trou = au(anneaux, rang), exterieur = au(anneaux, 0);
  const autres = anneaux.filter((_, i) => i !== 0 && i !== rang);
  let choisis = choisir(candidats(trou, [exterieur], anneaux, anneaux, o, tolerance), o.nombre, o.largeur);
  if (!choisis.length && autres.length) choisis = choisir(candidats(trou, autres, anneaux, anneaux, o, tolerance), o.nombre, o.largeur);
  return choisis.flatMap(l => { const b = bande(l, o.largeur, poly); return b ? [b] : []; });
}

// ---------------------------------------------------------------- l'operation

export interface ResultatLiens {
  /** Le dessin, le meme objet quand rien n'a change. */
  readonly dessin: DessinSvg;
  readonly liens: number;
  readonly ilots: number;
  /** Les formes qui ont recu des liens. */
  readonly formes: readonly string[];
  /** Les ilots qui ont recu moins de liens que demande (la place manquait, ou un autre trou barrait le chemin). */
  readonly incomplets: number;
  /** La phrase dite : ce qui a ete fait, ou pourquoi rien. */
  readonly phrase: string;
}

/** Les formes que l'operation peut toucher : visibles, deverrouillees, pleines, a couper (une forme a ecrire n'a pas d'ilot). */
function formesVisees(dessin: DessinSvg, ids: readonly string[], procede: Procede | null): Forme[] {
  const riche = !estPlat(dessin);
  const feuilles = new Set(riche ? feuillesDe(dessin, ids) : ids);
  return dessin.formes.filter(f => feuilles.has(f.id) && f.remplissage !== null && !f.image
    && (riche ? visibleEffectif(dessin, f.id) && !verrouilleEffectif(dessin, f.id) : f.visible && !f.verrouille)
    && (procede === null || operationDe(f, procede) === 'decoupe'));
}

/** La forme et ses liens : sa region moins les bandes, courbes rebaties ; null si elle n'a pas d'ilot. */
function avecLiens(f: Forme, ilots: readonly Ilot[], o: OptionsLiens, tolerance: number): { forme: Forme; liens: number; ilots: number; incomplets: number } | null {
  if (!ilots.length) return null;
  // La region meme dont les ilots ont ete tires (memorisee) : leurs rangs y designent les bons anneaux.
  const { region } = mesurer(f, tolerance, false);
  // Chaque polygone perd ses propres bandes, et lui seul : un rectangle qui deborde ne mord jamais une autre partie de la forme.
  const bandes = new Map<number, MultiPolygon[]>();
  let incomplets = 0, liens = 0;
  for (const il of ilots) {
    const b = liensDIlot(au(region, il.polygone), il.anneau, o, tolerance);
    if (b.length < o.nombre) incomplets++;
    liens += b.length;
    bandes.set(il.polygone, [...(bandes.get(il.polygone) ?? []), ...b]);
  }
  if (!liens) return { forme: f, liens: 0, ilots: ilots.length, incomplets };
  const reste: MultiPolygon = region.flatMap((poly, i) => { const b = bandes.get(i); return b ? clipping.difference(poly, ...b) : [poly]; });
  const courbe = o.lisser !== false && f.d.some(c => c.c === 'C' || c.c === 'Q');
  const d = courbe ? cheminLisseDeRegion(reste, tolerance) : cheminDeRegion(reste);
  return { forme: { ...sansTexte(f), d, regle: 'nonzero' }, liens, ilots: ilots.length, incomplets };
}

/**
 * Ajoute des liens a chaque ilot des formes nommees (ADR-0040) : tous les ilots d'une forme en une fois, ilots imbriques compris,
 * chaque forme traitee. Chaque forme garde son identifiant, son style, son operation et sa place ; son texte vivant, s'il en avait,
 * devient des contours. `procede` (null hors d'un contexte de production) ecarte les formes a ecrire. Pur : une operation de
 * l'historique comme une autre.
 */
export function ajouterLiens(dessin: DessinSvg, ids: readonly string[], options: OptionsLiens = LIENS_DEFAUT, procede: Procede | null = null, tolerance = toleranceBooleen(dessin)): ResultatLiens {
  const o = bornerLiens(options);
  const visees = formesVisees(dessin, ids, procede);
  if (!visees.length) return { dessin, liens: 0, ilots: 0, formes: [], incomplets: 0, phrase: 'Choisissez d’abord une forme pleine à couper : une forme à écrire, ou sans fond, n’a pas d’îlot.' };
  const nouvelles = new Map<string, Forme>();
  let liens = 0, ilots = 0, incomplets = 0;
  for (const f of visees) {
    const r = avecLiens(f, ilotsQuiTombent(dessin, f, procede, tolerance, false), o, tolerance);
    if (!r) continue;
    ilots += r.ilots; incomplets += r.incomplets;
    if (r.liens) { liens += r.liens; nouvelles.set(f.id, r.forme); }
  }
  if (!ilots) {
    return { dessin, liens: 0, ilots: 0, formes: [], incomplets: 0, phrase: (visees.length > 1 ? 'Ces formes n’ont' : 'Cette forme n’a') + ' pas d’îlot : rien ne tombera à la découpe.' };
  }
  if (!liens) return { dessin, liens: 0, ilots, formes: [], incomplets, phrase: 'Aucun lien ne trouve sa place : un autre trou barre chaque chemin vers l’extérieur.' };
  const formes = dessin.formes.map(f => nouvelles.get(f.id) ?? f);
  return { dessin: { ...dessin, formes }, liens, ilots, formes: [...nouvelles.keys()], incomplets, phrase: phraseLiens(liens, ilots, incomplets) };
}

/** « 3 liens posés sur 1 îlot. », et ce qui manque quand un ilot n'a pas tous les siens. */
export function phraseLiens(liens: number, ilots: number, incomplets = 0): string {
  const base = pluriel(liens, 'lien') + ' posé' + (liens > 1 ? 's' : '') + ' sur ' + pluriel(ilots, 'îlot') + '.';
  return incomplets ? base + ' ' + (incomplets > 1 ? incomplets + ' îlots en ont reçu' : 'Un îlot en a reçu') + ' moins que demandé : la place manquait.' : base;
}
