// Les effets du modele v2 (ADR-0012, etape 7 ; annexe 1 §3, annexe 3 §2, annexe 4 B) : un flou et une ombre portee, au plus, sur une
// feuille ou un groupe. Ce fichier tient le calcul pur que partagent la lecture, l'ecriture, les transformations, la boite visuelle et
// le projet : bornes, ecarts sous une matrice, marge de l'etendue, texte exact du <filter> ecrit. Il ne sait rien du SVG lu (c'est
// `fonctions/effets.ts`) ni de l'arbre (la region d'un groupe se mesure la-bas).
//
// L'ombre vit dans le repere du PLAN (la lumiere ne tourne pas avec la forme) : une transformation multiplie son decalage par le
// facteur de la matrice, sans le tourner. Un flou suit la matrice exactement tant que son ellipse reste dans les axes (echelle par
// axe, quart de tour, similitude d'un flou isotrope) ; sinon il prend l'ecart moyen (moyenne geometrique), seule valeur qu'un
// `stdDeviation` a deux nombres puisse porter.

import type { Boite, Effets, Flou, Matrice, OmbrePortee } from './types.js';
import { facteur } from './geometrie.js';
import { nb } from './chemins.js';
import type { Definition } from './definitions.js';

/** Les noeuds (feuilles et groupes) a effet qu'une lecture garde, au plus (annexe 5 §2) ; les suivants perdent leurs effets, et c'est dit. */
export const NOEUDS_A_EFFET_MAX = 2000;

/** L'ecart d'un flou ou d'une ombre, au plus : le quart du plus grand cote du plan (annexe 5 §2). Au-dela, plus rien ne se voit. */
export const ecartMax = (vb: readonly [number, number, number, number]): number => Math.max(vb[2], vb[3]) / 4;

/** Le decalage d'une ombre, au plus : le plus grand cote du plan (une ombre plus loin quitte le dessin). */
export const decalageMax = (vb: readonly [number, number, number, number]): number => Math.max(vb[2], vb[3]);

/** Vrai si une valeur porte un effet du modele (un objet `Effets` non vide). */
export const aDesEffets = (e: Effets | undefined): e is Effets => e !== undefined && (e.flou !== undefined || e.ombre !== undefined);

/**
 * Les ecarts, dans le plan, d'un flou d'ecarts (sx, sy) pose dans un repere de matrice `m` : la covariance M S Mt du noyau. Exacts
 * quand l'ellipse reste dans les axes (aucune rotation, un quart de tour, ou une similitude d'un flou isotrope) ; sinon l'ecart moyen,
 * isotrope (la racine du determinant : la meme surface de flou), et `approche` le dit.
 */
export function ecartsSous(sx: number, sy: number, m: Matrice): { readonly ex: number; readonly ey: number; readonly approche: boolean } {
  const [a, b, c, d] = m;
  // Les cas exacts sans racine : une echelle par axe, un quart de tour (les axes s'echangent).
  if (b === 0 && c === 0) return egaliser(sx * Math.abs(a), sy * Math.abs(d), false);
  if (a === 0 && d === 0) return egaliser(sy * Math.abs(c), sx * Math.abs(b), false);
  const xx = a * a * sx * sx + c * c * sy * sy, yy = b * b * sx * sx + d * d * sy * sy, xy = a * b * sx * sx + c * d * sy * sy;
  if (Math.abs(xy) <= 1e-9 * Math.max(xx, yy)) return egaliser(Math.sqrt(xx), Math.sqrt(yy), false);
  const moyen = Math.sqrt(sx * sy * Math.abs(a * d - b * c));
  return { ex: moyen, ey: moyen, approche: true };
}

/** Deux ecarts egaux a l'arrondi du calcul pres deviennent le meme nombre : un flou isotrope le reste. */
function egaliser(ex: number, ey: number, approche: boolean): { readonly ex: number; readonly ey: number; readonly approche: boolean } {
  return Math.abs(ex - ey) <= 1e-9 * Math.max(ex, ey) ? { ex, ey: ex, approche } : { ex, ey, approche };
}

/** Un flou d'ecarts (ex, ey) du modele : isotrope sans `ecartY`. */
export const flouDe = (ex: number, ey: number): Flou => (ex === ey ? { ecart: ex } : { ecart: ex, ecartY: ey });

/**
 * Les effets transformes par `m` (annexe 3 §2) : le flou suit la matrice (`ecartsSous`), l'ombre garde sa direction dans le plan et
 * prend le facteur de la matrice (decalage et ecart). Le meme objet quand rien ne change (une translation).
 */
export function transformerEffets(e: Effets, m: Matrice): Effets {
  const k = facteur(m);
  let flou = e.flou;
  if (flou) {
    const s = ecartsSous(flou.ecart, flou.ecartY ?? flou.ecart, m);
    if (s.ex !== flou.ecart || s.ey !== (flou.ecartY ?? flou.ecart)) flou = flouDe(s.ex, s.ey);
  }
  let ombre = e.ombre;
  if (ombre && k !== 1) ombre = { ...ombre, dx: ombre.dx * k, dy: ombre.dy * k, ecart: ombre.ecart * k };
  if (flou === e.flou && ombre === e.ombre) return e;
  return { ...(flou ? { flou } : {}), ...(ombre ? { ombre } : {}) };
}

/** Ce dont les effets elargissent la boite d'un noeud (annexe 4 B §2) : trois fois le plus grand ecart, plus le plus grand decalage. */
export function margeEffets(e: Effets): number {
  const ecarts = [e.flou?.ecart ?? 0, e.flou?.ecartY ?? 0, e.ombre?.ecart ?? 0];
  return 3 * Math.max(...ecarts) + (e.ombre ? Math.max(Math.abs(e.ombre.dx), Math.abs(e.ombre.dy)) : 0);
}

/** La boite elargie de `marge` de chaque cote ; la meme boite pour une marge nulle. */
export const elargir = (b: Boite, marge: number): Boite => (marge > 0 ? { x: b.x - marge, y: b.y - marge, l: b.l + 2 * marge, h: b.h + 2 * marge } : b);

// ---------------------------------------------------------------- l'ecriture

/**
 * Les effets tels qu'ils s'ecrivent a cette precision (annexe 2 §5 : ecarts et decalages a la precision du plan, opacite au millieme),
 * c'est-a-dire tels que la relecture les rendra : la region se calcule sur eux, et le point fixe tient. null si rien ne s'ecrirait
 * (un flou dont les deux ecarts s'arrondissent a zero, sans ombre : un navigateur ne ferait rien).
 */
export function effetsEcrits(e: Effets, precision: number): Effets | null {
  const r = (v: number): number => Number(nb(v, precision));
  let flou: Flou | undefined;
  if (e.flou) {
    const ex = r(e.flou.ecart), ey = r(e.flou.ecartY ?? e.flou.ecart);
    if (ex > 0 || ey > 0) flou = flouDe(ex, ey);
  }
  const ombre: OmbrePortee | undefined = e.ombre
    ? { dx: r(e.ombre.dx), dy: r(e.ombre.dy), ecart: r(e.ombre.ecart), couleur: e.ombre.couleur, opacite: Number(nb(e.ombre.opacite, 3)) }
    : undefined;
  if (!flou && !ombre) return null;
  return { ...(flou ? { flou } : {}), ...(ombre ? { ombre } : {}) };
}

/** La region ecrite d'un filtre : la boite arrondie VERS L'EXTERIEUR a la precision du plan (elle ne rogne jamais l'effet). */
export function regionEcrite(b: Boite, precision: number): Boite {
  const k = 10 ** precision;
  const x0 = Math.floor(b.x * k), y0 = Math.floor(b.y * k), x1 = Math.ceil((b.x + b.l) * k), y1 = Math.ceil((b.y + b.h) * k);
  return { x: x0 / k, y: y0 / k, l: (x1 - x0) / k, h: (y1 - y0) / k };
}

const COULEUR = /^#[0-9a-f]{6}$/;

/**
 * Le <filter> d'effets deja arrondis (`effetsEcrits`) sur une region deja arrondie (`regionEcrite`), aux formes exactes de l'annexe 4
 * B §2 : region explicite en unites du plan, `color-interpolation-filters="sRGB"` toujours (le defaut lineaire varie d'un moteur a
 * l'autre), l'ombre DECOMPOSEE (pas `feDropShadow`, qu'Illustrator et les Inkscape anciens ignorent). null pour une couleur d'ombre
 * qui n'est pas #rrggbb (un dessin construit a la main) : rien plutot qu'un attribut libre.
 */
export function definitionFiltre(e: Effets, region: Boite, precision: number): Definition | null {
  const p = (v: number): string => nb(v, precision);
  if (e.ombre && !COULEUR.test(e.ombre.couleur)) return null;
  const ecarts = (f: Flou): string => {
    const x = p(f.ecart), y = p(f.ecartY ?? f.ecart);
    return x === y ? x : x + ' ' + y;
  };
  let enfants = '';
  if (e.ombre) {
    const o = e.ombre;
    enfants += '<feGaussianBlur in="SourceAlpha" stdDeviation="' + p(o.ecart) + '" result="a"/>'
      + '<feOffset in="a" dx="' + p(o.dx) + '" dy="' + p(o.dy) + '" result="b"/>'
      + '<feFlood flood-color="' + o.couleur + '" flood-opacity="' + nb(o.opacite, 3) + '" result="c"/>'
      + '<feComposite in="c" in2="b" operator="in" result="d"/>';
    enfants += e.flou
      ? '<feGaussianBlur in="SourceGraphic" stdDeviation="' + ecarts(e.flou) + '" result="e"/><feMerge><feMergeNode in="d"/><feMergeNode in="e"/></feMerge>'
      : '<feMerge><feMergeNode in="d"/><feMergeNode in="SourceGraphic"/></feMerge>';
  } else if (e.flou) enfants = '<feGaussianBlur stdDeviation="' + ecarts(e.flou) + '"/>';
  else return null;
  return {
    genre: 'f',
    balise: 'filter',
    attributs: ' filterUnits="userSpaceOnUse" x="' + p(region.x) + '" y="' + p(region.y) + '" width="' + p(region.l) + '" height="' + p(region.h) + '" color-interpolation-filters="sRGB"',
    enfants
  };
}
