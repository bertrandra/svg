// Les operations booleennes entre formes (ADR-0004) : union, soustraction, intersection,
// exclusion. Les courbes sont aplaties en segments, assez fins pour que l'ecart au trace d'origine reste
// sous une tolerance geometrique, les polygones passent par un moteur de decoupe (polygon-clipping,
// algorithme de Martinez, pur et deterministe), et le resultat est une forme en segments droits, les
// trous en anneaux interieurs ; a la demande (`lisser`), les suites de sommets qui tournent doucement
// redeviennent des courbes. Le remplissage d'une forme se lit comme un navigateur le peint : pair-impair,
// ou selon le sens du trace.

import clipping, { type MultiPolygon, type Pair, type Polygon, type Ring } from 'polygon-clipping';
import {
  ancre, avecOrigines, depart, estPlat, feuillesDe, MSG_MEME_PARENT, normaliser, originesDe, prochainId, verrouilleEffectif, visibleEffectif,
  type Chemin, type Commande, type DessinSvg, type Forme
} from './editionSvg.js';
import { reconstruireAnneau } from './edition/ajustement.js';
import { t } from '../util/i18n.js';

export type Booleen = 'union' | 'soustraction' | 'intersection' | 'exclusion';
export const BOOLEENS: readonly Booleen[] = ['union', 'soustraction', 'intersection', 'exclusion'];

export const cubique = (a: number, b: number, c: number, d: number, t: number) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d;
export const quadratique = (a: number, b: number, c: number, t: number) => (1 - t) ** 2 * a + 2 * (1 - t) * t * b + t * t * c;

/** Le plus petit nombre de segments, et le plus grand : au-dela, une courbe n'a plus rien a gagner d'etre aplatie plus fin. */
const SEGMENTS_MIN = 1, SEGMENTS_MAX = 512;

/**
 * Le nombre de segments egaux (en t) qui tiennent une courbe de Bezier a `tolerance` pres : l'ecart maximal
 * entre la courbe et sa corde est borne par d(d-1)/8 * M / n^2, ou M est la plus grande seconde difference
 * des points de controle (Wang) ; d'ou n >= racine(d(d-1) M / (8 tolerance)). Une droite en demande un seul.
 */
export const segments = (degre: 2 | 3, secondeDifference: number, tolerance: number) =>
  Math.max(SEGMENTS_MIN, Math.min(SEGMENTS_MAX, Math.ceil(Math.sqrt((degre * (degre - 1) * secondeDifference) / (8 * Math.max(tolerance, 1e-9))))));

/** La norme de x0 - 2 x1 + x2 : l'ecart d'un point de controle a la corde de ses voisins. */
export const seconde = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) => Math.hypot(x0 - 2 * x1 + x2, y0 - 2 * y1 + y2);

/** Les anneaux d'un chemin, aplatis a `tolerance` pres (ecart maximal au trace) : un anneau par sous-chemin, fermes. */
export function aplatir(d: Chemin, tolerance: number): Ring[] {
  const anneaux: Ring[] = [];
  let courant: Ring = [];
  const pousser = (x: number, y: number) => { courant.push([x, y]); };
  const clore = () => { if (courant.length >= 3) anneaux.push(courant); courant = []; };
  d.forEach((c, i) => {
    if (c.c === 'M') { clore(); pousser(c.p[0] ?? 0, c.p[1] ?? 0); return; }
    if (c.c === 'Z') { clore(); const debut = anneaux[anneaux.length - 1]?.[0]; if (debut && d[i + 1] && d[i + 1]?.c !== 'M') pousser(debut[0], debut[1]); return; }
    if (c.c === 'L') { pousser(c.p[0] ?? 0, c.p[1] ?? 0); return; }
    const [x0, y0] = depart(d, i), p = c.p;
    if (c.c === 'C') {
      const [x1, y1, x2, y2, x3, y3] = [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 0, p[4] ?? 0, p[5] ?? 0];
      const n = segments(3, Math.max(seconde(x0, y0, x1, y1, x2, y2), seconde(x1, y1, x2, y2, x3, y3)), tolerance);
      for (let k = 1; k <= n; k++) pousser(cubique(x0, x1, x2, x3, k / n), cubique(y0, y1, y2, y3, k / n));
    } else {
      const [x1, y1, x2, y2] = [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 0];
      const n = segments(2, seconde(x0, y0, x1, y1, x2, y2), tolerance);
      for (let k = 1; k <= n; k++) pousser(quadratique(x0, x1, x2, k / n), quadratique(y0, y1, y2, k / n));
    }
  });
  clore();
  return anneaux;
}

/** L'aire signee d'un anneau : positive dans le sens horaire a l'ecran (y vers le bas). */
export function aireSignee(r: Ring): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i] ?? [0, 0], q = r[(i + 1) % r.length] ?? [0, 0];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

const vide: MultiPolygon = [];
const unirTous = (polys: Polygon[]): MultiPolygon => (polys.length ? clipping.union(polys[0] ?? [], ...polys.slice(1)) : vide);

/**
 * La region peinte d'une forme, en multipolygone. Pair-impair : l'exclusion de ses anneaux. Selon le
 * sens du trace : l'union des anneaux d'un sens, moins celle des anneaux de l'autre sens, ce qui
 * creuse un trou dessine a contresens et garde pleins deux anneaux emboites de meme sens.
 */
export const regionDeForme = (f: Forme, tolerance: number): MultiPolygon => regionDeChemin(f.d, f.regle, tolerance);

/** La region peinte d'un chemin sous une regle de remplissage : ce que `regionDeForme` fait d'une forme, pour un chemin nu (decalage, contour). */
export function regionDeChemin(d: Chemin, regle: Forme['regle'], tolerance: number): MultiPolygon {
  const anneaux = aplatir(d, tolerance).filter(r => Math.abs(aireSignee(r)) > 1e-12);
  if (!anneaux.length) return vide;
  if (regle === 'evenodd') return anneaux.length === 1 ? [[anneaux[0] ?? []]] : clipping.xor([anneaux[0] ?? []], ...anneaux.slice(1).map(r => [r]));
  const horaires = anneaux.filter(r => aireSignee(r) > 0).map(r => [r]), autres = anneaux.filter(r => aireSignee(r) < 0).map(r => [r]);
  if (!horaires.length || !autres.length) return unirTous(horaires.length ? horaires : autres);
  const a = unirTous(horaires), b = unirTous(autres);
  return clipping.xor(a, b);
}

/** Le chemin d'un multipolygone : chaque anneau ferme, en segments droits. */
export function cheminDeRegion(region: MultiPolygon, precision = 3): Commande[] {
  const out: Commande[] = [];
  const arrondi = (v: number) => Number(v.toFixed(precision));
  for (const poly of region) for (const anneau of poly) {
    const pts: Pair[] = anneau.length > 1 && anneau[0]?.[0] === anneau[anneau.length - 1]?.[0] && anneau[0]?.[1] === anneau[anneau.length - 1]?.[1] ? anneau.slice(0, -1) : anneau;
    if (pts.length < 3) continue;
    pts.forEach((p, i) => out.push({ c: i ? 'L' : 'M', p: [arrondi(p[0]), arrondi(p[1])] }));
    out.push({ c: 'Z', p: [] });
  }
  return out;
}

/**
 * Le chemin d'un multipolygone, avec les suites de sommets qui tournent doucement reconstruites en courbes
 * cubiques (ajustement.ts) : chaque courbe reste a moins de `tolerance` de l'anneau, les coins restent des
 * coins. Un anneau que l'ajustement ne tient pas reste en segments droits. Les sommets sont eux-memes a
 * `tolerance` du trace d'origine, et une courbe ideale s'ecarte de leurs cordes d'autant : l'ajustement
 * se mesure donc a deux fois la tolerance, ce qui borne l'ecart au trace d'origine a trois tolerances.
 */
export function cheminLisseDeRegion(region: MultiPolygon, tolerance: number, precision = 3, rectilignes = false): Commande[] {
  const out: Commande[] = [];
  const arrondi = (v: number) => Number(v.toFixed(precision));
  for (const poly of region) for (const anneau of poly) {
    const pts: Pair[] = anneau.length > 1 && anneau[0]?.[0] === anneau[anneau.length - 1]?.[0] && anneau[0]?.[1] === anneau[anneau.length - 1]?.[1] ? anneau.slice(0, -1) : anneau;
    if (pts.length < 3) continue;
    for (const c of reconstruireAnneau(pts, 2 * tolerance, rectilignes)) out.push({ c: c.c, p: c.p.map(arrondi) });
  }
  return out;
}

/** Vrai si la forme a une aire : une ligne nue (contour seul) ne se combine pas. */
const pleine = (f: Forme) => f.remplissage !== null;

export interface OptionsBooleen {
  /** Rebatir en courbes les contours qui etaient courbes : le resultat pese moins et reste lisse a tout grossissement. */
  lisser?: boolean;
}

/** La tolerance d'aplatissement d'un dessin : un vingt-millieme de sa plus grande dimension, en ecart maximal au trace. */
export const toleranceBooleen = (dessin: DessinSvg): number => Math.max(dessin.vb[2], dessin.vb[3]) / 20000;

/**
 * Applique l'operation aux formes choisies, dans l'ordre de l'empilement : pour la soustraction, la
 * plus basse moins toutes les autres. Le resultat prend le style et la place de la plus basse ; les
 * autres disparaissent. Rend le dessin inchange, avec sa raison, si l'operation ne s'applique pas.
 */
export function appliquerBooleen(dessin: DessinSvg, ids: readonly string[], op: Booleen, tolerance = toleranceBooleen(dessin), options: OptionsBooleen = {}): { dessin: DessinSvg; id: string | null; erreur?: string } {
  if (!estPlat(dessin)) return booleenRiche(dessin, ids, op, tolerance, options);
  return booleenDeFormes(dessin, ids, op, tolerance, options);
}

/**
 * Le chemin riche (ADR-0012, annexe 3 §2) : un groupe choisi compte par ses feuilles visibles et deverrouillees (par heritage), qui
 * doivent toutes etre dans le meme groupe ; le resultat prend la place et le parent de la plus basse. Un groupe que l'operation
 * viderait part avec ses formes.
 */
function booleenRiche(dessin: DessinSvg, ids: readonly string[], op: Booleen, tolerance: number, options: OptionsBooleen): { dessin: DessinSvg; id: string | null; erreur?: string } {
  const feuilles = feuillesDe(dessin, ids).filter(id => visibleEffectif(dessin, id) && !verrouilleEffectif(dessin, id));
  if (new Set(dessin.formes.filter(f => feuilles.includes(f.id)).map(f => f.parent)).size > 1) return { dessin, id: null, erreur: t(MSG_MEME_PARENT) };
  const r = booleenDeFormes(dessin, feuilles, op, tolerance, options);
  return r.dessin === dessin ? r : { ...r, dessin: normaliser(r.dessin) };
}

function booleenDeFormes(dessin: DessinSvg, ids: readonly string[], op: Booleen, tolerance: number, options: OptionsBooleen): { dessin: DessinSvg; id: string | null; erreur?: string } {
  const voulus = new Set(ids);
  const choisies = dessin.formes.filter(f => voulus.has(f.id) && !f.verrouille && f.visible);
  if (choisies.length < 2) return { dessin, id: null, erreur: t('Choisissez au moins deux formes visibles et déverrouillées.') };
  if (!choisies.every(pleine)) return { dessin, id: null, erreur: t('Une forme sans remplissage n’a pas d’aire : donnez-lui une couleur, ou retirez-la de la sélection.') };
  const regions = choisies.map(f => regionDeForme(f, tolerance));
  const [premiere, ...autres] = regions;
  if (!premiere) return { dessin, id: null };
  let resultat: MultiPolygon;
  if (op === 'union') resultat = clipping.union(premiere, ...autres);
  else if (op === 'intersection') resultat = clipping.intersection(premiere, ...autres);
  else if (op === 'soustraction') resultat = clipping.difference(premiere, ...autres);
  else resultat = clipping.xor(premiere, ...autres);
  // Rebatir en courbes n'a de sens que si une des formes en avait ; une figure toute droite reste telle quelle.
  const courbe = options.lisser === true && choisies.some(f => f.d.some(c => c.c === 'C' || c.c === 'Q'));
  const d = courbe ? cheminLisseDeRegion(resultat, tolerance) : cheminDeRegion(resultat);
  const basse = choisies[0];
  if (!basse) return { dessin, id: null };
  if (!d.length) {
    // Rien ne reste : la forme la plus basse disparait avec les autres, comme dans un logiciel de dessin.
    return { dessin: { ...dessin, formes: dessin.formes.filter(f => !voulus.has(f.id) || f.verrouille || !f.visible) }, id: null };
  }
  // Le resultat descend de toutes les formes de l'operation (meme la soustraite : son contour a taille le resultat).
  const forme: Forme = avecOrigines({ ...basse, id: 'f' + prochainId(dessin), d, regle: 'nonzero' }, originesDe(choisies));
  const formes = dessin.formes.flatMap(f => (f === basse ? [forme] : voulus.has(f.id) && !f.verrouille && f.visible ? [] : [f]));
  return { dessin: { ...dessin, formes }, id: forme.id };
}

/** Le dernier point d'un chemin, pour les tests et l'affichage. */
export const dernierPoint = (d: Chemin): [number, number] | null => { for (let i = d.length - 1; i >= 0; i--) { const a = ancre(d[i] ?? { c: 'Z', p: [] }); if (a) return a; } return null; };
