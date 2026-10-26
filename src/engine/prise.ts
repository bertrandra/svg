// Prendre une forme sous le pointeur (ADR-0029), en pur : quelles formes un clic au point (x, y) du plan peut prendre, la
// meilleure d'abord, avec une tolerance et une cible minimale en pixels d'ecran, donc les memes a tout zoom. La toile
// (zones/PriseToile.tsx) l'appelle pour le clic comme pour le survol : ce qu'on voit est ce qu'on prend.
//
// Les regles :
// - une forme masquee ou verrouillee ne se prend jamais (elle laisse passer le clic, comme avant) ;
// - une forme remplie (ou toute forme en vue « contours ») se prend sur sa surface, regle de remplissage respectee ;
// - un trait se prend sur son encre (demi-epaisseur), et toute forme a moins de `tolerance` pixels de son trace ;
// - un texte vivant se prend sur sa boite entiere, entre ses lettres aussi ; pose sur ou dans une forme (ADR-0031), sur ses
//   lettres comme une forme ordinaire (sa boite couvrirait la forme qui le porte, qu'on ne prendrait plus) ;
// - une forme plus petite que la cible a l'ecran se prend dans sa boite gonflee jusqu'a la cible ;
// - parmi les candidates, la plus haute dont la surface contient le point gagne, sauf un trait sans remplissage pose
//   au-dessus d'elle et a portee (un filet sur un fond se prend sans viser au pixel) ; sans surface sous le point, la plus
//   proche gagne (a egalite, la plus haute).
//
// Ce qui ne depend que d'une forme immuable (sa boite avec trait, son trace aplati) se memorise par forme (ADR-0008) ; les
// boites d'un dessin se rangent une fois par tableau de formes, et le survol ne fait le calcul fin que pres du point.

import type { Boite, Contenu, Forme } from './edition/types.js';
import { boiteChemin, boiteForme } from './edition/geometrie.js';
import { boiteAvecTrait } from './edition/etendue.js';
import { estPlat } from './edition/arbre.js';
import { unitesPrenables } from './edition/contexteEdition.js';

/** La tolerance autour d'un trace, en pixels d'ecran : a la souris (ou au stylet), au doigt. */
export const TOLERANCE_SOURIS = 6;
export const TOLERANCE_DOIGT = 12;
/** La cible minimale d'une petite forme, en pixels d'ecran : deux fois la tolerance. */
export const CIBLE_SOURIS = 12;
export const CIBLE_DOIGT = 24;

export interface OptionsPrise {
  /** Pixels d'ecran par unite du plan. */
  readonly zoom: number;
  /** En pixels d'ecran. */
  readonly tolerance: number;
  /** En pixels d'ecran. */
  readonly cible: number;
  /** La vue « contours » : chaque forme y est un trace, qui se prend aussi par sa surface (comme `pointer-events: all`). */
  readonly contours?: boolean;
}

/** Les options d'un pointeur : plus larges au doigt. */
export const optionsPrise = (zoom: number, doigt: boolean, contours = false): OptionsPrise => ({
  zoom, tolerance: doigt ? TOLERANCE_DOIGT : TOLERANCE_SOURIS, cible: doigt ? CIBLE_DOIGT : CIBLE_SOURIS, contours
});

/** Une forme que le point peut prendre. */
export interface Candidate {
  readonly id: string;
  /** Son rang dans le dessin (0 tout au fond). */
  readonly rang: number;
  /** Le point est sur ce qu'elle peint (surface, encre du trait), sur sa boite (texte) ou dans sa cible minimale. */
  readonly dedans: boolean;
  /** La distance au trace, en pixels d'ecran, hors de l'encre ; 0 dedans. */
  readonly ecart: number;
  /** Un trait sans surface : il passe devant la surface d'une forme plus basse quand il est a portee. */
  readonly filet: boolean;
}

/** Un sous-chemin aplati : les points x0, y0, x1, y1… et s'il est ferme par Z. */
export interface Trace { readonly pts: Float64Array; readonly ferme: boolean }

const etendues = new WeakMap<Forme, Boite | null>();
const traces = new WeakMap<Forme, readonly Trace[]>();
const rangees = new WeakMap<readonly Forme[], Float64Array>();

/** La boite que la forme peint, trait compris (pointes et bouts carres). La selection par zone la relit (engine/selection.ts). */
export function etendue(f: Forme): Boite | null {
  let b = etendues.get(f);
  if (b === undefined) { b = boiteAvecTrait(f); etendues.set(f, b); }
  return b;
}

/**
 * Les boites d'un dessin, quatre nombres par forme (x0, y0, x1, y1), NaN pour une forme qu'on ne prend pas : un tableau
 * de formes est immuable, il se range une fois ; le survol ne parcourt plus que des nombres.
 */
export function rangee(formes: readonly Forme[]): Float64Array {
  let r = rangees.get(formes);
  if (r) return r;
  r = new Float64Array(formes.length * 4).fill(NaN);
  formes.forEach((f, i) => {
    if (!f.visible || f.verrouille) return;
    const b = etendue(f);
    if (!b) return;
    r[i * 4] = b.x; r[i * 4 + 1] = b.y; r[i * 4 + 2] = b.x + b.l; r[i * 4 + 3] = b.y + b.h;
  });
  rangees.set(formes, r);
  return r;
}

/**
 * Le nombre de segments d'une courbe pour une erreur au plus `eps` : la fleche d'une Bezier decoupee en n est au plus
 * M / (8 n^2) fois son degre, M la plus grande difference seconde des points de controle.
 */
function morceaux(m: number, degre: number, eps: number): number {
  return Math.max(1, Math.min(64, Math.ceil(Math.sqrt((degre * (degre - 1) * m) / (8 * eps)))));
}

/** Le chemin aplati en polylignes, a un dix-millieme de sa boite pres : de quoi tester un point a tout zoom raisonnable. */
export function aplatir(f: Forme): readonly Trace[] {
  const deja = traces.get(f);
  if (deja) return deja;
  const b = boiteChemin(f.d);
  const eps = Math.max(1e-9, b ? Math.hypot(b.l, b.h) / 10000 : 1);
  const out: Trace[] = [];
  let pts: number[] = [], debut: [number, number] = [0, 0], x = 0, y = 0;
  // Un sous-chemin d'un seul point (un M sans suite) ne peint rien : il ne compte pas.
  const clore = (ferme: boolean) => { if (pts.length >= 4) out.push({ pts: Float64Array.from(pts), ferme }); pts = []; };
  const ouvrir = () => { if (!pts.length) pts.push(x, y); };
  for (const c of f.d) {
    const p = c.p;
    if (c.c === 'M') { clore(false); x = p[0] ?? 0; y = p[1] ?? 0; debut = [x, y]; pts.push(x, y); }
    else if (c.c === 'Z') { clore(true); [x, y] = debut; }
    else if (c.c === 'L') { ouvrir(); x = p[0] ?? 0; y = p[1] ?? 0; pts.push(x, y); }
    else if (c.c === 'Q') {
      ouvrir();
      const x1 = p[0] ?? 0, y1 = p[1] ?? 0, x2 = p[2] ?? 0, y2 = p[3] ?? 0;
      const n = morceaux(Math.hypot(x - 2 * x1 + x2, y - 2 * y1 + y2), 2, eps);
      for (let k = 1; k <= n; k++) {
        const t = k / n, u = 1 - t;
        pts.push(u * u * x + 2 * u * t * x1 + t * t * x2, u * u * y + 2 * u * t * y1 + t * t * y2);
      }
      x = x2; y = y2;
    } else {
      ouvrir();
      const x1 = p[0] ?? 0, y1 = p[1] ?? 0, x2 = p[2] ?? 0, y2 = p[3] ?? 0, x3 = p[4] ?? 0, y3 = p[5] ?? 0;
      const m = Math.max(Math.hypot(x - 2 * x1 + x2, y - 2 * y1 + y2), Math.hypot(x1 - 2 * x2 + x3, y1 - 2 * y2 + y3));
      const n = morceaux(m, 3, eps);
      for (let k = 1; k <= n; k++) {
        const t = k / n, u = 1 - t;
        pts.push(u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
      }
      x = x3; y = y3;
    }
  }
  clore(false);
  traces.set(f, out);
  return out;
}

/** Le point est-il dans la surface ? Chaque sous-chemin se ferme, comme le remplissage le fait ; la regle decide. */
export function dansSurface(ts: readonly Trace[], px: number, py: number, regle: Forme['regle']): boolean {
  let enroulement = 0, croisements = 0;
  for (const { pts } of ts) {
    const n = pts.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = pts[i * 2] ?? 0, ay = pts[i * 2 + 1] ?? 0, bx = pts[j * 2] ?? 0, by = pts[j * 2 + 1] ?? 0;
      if ((ay <= py) !== (by <= py)) {
        const xi = ax + ((py - ay) / (by - ay)) * (bx - ax);
        if (xi > px) { croisements++; enroulement += by > ay ? 1 : -1; }
      }
    }
  }
  return regle === 'evenodd' ? croisements % 2 === 1 : enroulement !== 0;
}

/** La distance du point au trace : ses segments, et la fermeture d'un sous-chemin quand `fermer` (le bord d'une surface). */
function distanceAuTrace(ts: readonly Trace[], px: number, py: number, fermer: boolean): number {
  let d2 = Infinity;
  for (const { pts, ferme } of ts) {
    const n = pts.length / 2, fin = ferme || fermer ? n : n - 1;
    for (let i = 0; i < fin; i++) {
      const j = (i + 1) % n;
      const ax = pts[i * 2] ?? 0, ay = pts[i * 2 + 1] ?? 0, bx = pts[j * 2] ?? 0, by = pts[j * 2 + 1] ?? 0;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
      d2 = Math.min(d2, (ax + t * dx - px) ** 2 + (ay + t * dy - py) ** 2);
    }
  }
  return Math.sqrt(d2);
}

/** La distance d'un point a une boite (0 dedans). */
const distanceBoite = (b: Boite, px: number, py: number): number =>
  Math.hypot(Math.max(b.x - px, 0, px - b.x - b.l), Math.max(b.y - py, 0, py - b.y - b.h));

/** Une boite gonflee jusqu'a `cote` dans chaque direction, autour de son centre. */
function gonflee(b: Boite, cote: number): Boite {
  const l = Math.max(b.l, cote), h = Math.max(b.h, cote);
  return { x: b.x + b.l / 2 - l / 2, y: b.y + b.h / 2 - h / 2, l, h };
}

/** Ce que la forme donne sous le point, ou null si elle est hors de portee. Unites du plan ; l'ecart rendu est en pixels. */
function essayer(f: Forme, rang: number, px: number, py: number, o: OptionsPrise): Candidate | null {
  const tol = o.tolerance / o.zoom, cible = o.cible / o.zoom;
  const e = etendue(f);
  if (!e) return null;
  // Une image integree (ADR-0012, etape 12) peint tout son cadre, sans remplissage ni trait : elle se prend sur sa surface.
  const surface = !!o.contours || f.remplissage !== null || f.image !== undefined;
  // Un texte pose sur ou dans une forme (ADR-0031) se prend par ses lettres : sa boite couvrirait la forme qui le porte.
  const boiteTexte = !!f.texte && !f.texte.disposition;
  const base = { id: f.id, rang, filet: !surface && !boiteTexte };
  // Une petite forme : sa cible minimale compte comme sa surface.
  if (e.l < cible && e.h < cible && distanceBoite(gonflee(e, cible), px, py) === 0) return { ...base, dedans: true, ecart: 0 };
  if (boiteTexte) {
    const b = boiteForme(f);
    if (!b) return null;
    const d = distanceBoite(b, px, py);
    return d === 0 ? { ...base, dedans: true, ecart: 0 } : d <= tol ? { ...base, dedans: false, ecart: d * o.zoom } : null;
  }
  const ts = aplatir(f);
  if (surface && dansSurface(ts, px, py, f.regle)) return { ...base, dedans: true, ecart: 0 };
  // En vue « contours », le trait se dessine en filet d'un pixel : son epaisseur ne compte pas.
  const demi = f.contour && !o.contours ? f.epaisseur / 2 : 0;
  const d = distanceAuTrace(ts, px, py, surface);
  if (demi > 0 && d <= demi) return { ...base, dedans: true, ecart: 0 };
  const ecart = Math.max(0, d - demi);
  return ecart <= tol ? { ...base, dedans: false, ecart: ecart * o.zoom } : null;
}

/** Les formes que le point (x, y) du plan peut prendre, la meilleure d'abord (voir l'en-tete pour l'ordre). */
export function candidates(formes: readonly Forme[], x: number, y: number, o: OptionsPrise): Candidate[] {
  return ordonner(trouver(formes, x, y, o, null));
}

/** Les candidates d'un point, dans l'ordre des formes ; `garder` ecarte d'avance les rangs qu'on ne prend pas (null : tous). */
function trouver(formes: readonly Forme[], x: number, y: number, o: OptionsPrise, garder: readonly (string | null)[] | null): Candidate[] {
  if (!(o.zoom > 0)) return [];
  const r = rangee(formes);
  // La marge du tri grossier : la tolerance, ou la demi-cible d'une petite forme, la plus grande des deux.
  const marge = Math.max(o.tolerance, o.cible / 2) / o.zoom;
  const trouvees: Candidate[] = [];
  for (let i = 0; i < formes.length; i++) {
    if (garder && !garder[i]) continue;
    const x0 = r[i * 4] ?? NaN;
    // NaN : forme masquee, verrouillee ou vide ; toute comparaison est fausse, la forme est ecartee.
    if (!(x - x0 >= -marge) || !((r[i * 4 + 2] ?? NaN) - x >= -marge) || !(y - (r[i * 4 + 1] ?? NaN) >= -marge) || !((r[i * 4 + 3] ?? NaN) - y >= -marge)) continue;
    const f = formes[i];
    const c = f ? essayer(f, i, x, y, o) : null;
    if (c) trouvees.push(c);
  }
  return trouvees;
}

/**
 * Les noeuds que le point peut prendre dans le contexte d'edition (ADR-0012, annexe 6 §2), le meilleur d'abord. Un dessin plat :
 * exactement `candidates` (un seul niveau, une feuille par unite). Un dessin riche : les feuilles hors du contexte, masquees ou
 * verrouillees (elles ou un ancetre) ne se prennent pas ; une feuille prise remonte a l'enfant du contexte qui la contient (un
 * groupe, ou elle-meme), a la place de sa meilleure feuille, sans doublon. `rang` reste celui de la feuille touchee.
 */
export function candidatesDans(d: Contenu, contexte: string | null, x: number, y: number, o: OptionsPrise): Candidate[] {
  if (estPlat(d)) return candidates(d.formes, x, y, o);
  const unites = unitesPrenables(d, contexte), vus = new Set<string>(), out: Candidate[] = [];
  for (const c of ordonner(trouver(d.formes, x, y, o, unites))) {
    const id = unites[c.rang];
    if (!id || vus.has(id)) continue;
    vus.add(id);
    out.push({ ...c, id });
  }
  return out;
}

/** L'ordre des candidates : un filet a portee au-dessus de la surface la plus haute, puis les surfaces du haut vers le bas, puis les plus proches. */
export function ordonner(c: readonly Candidate[]): Candidate[] {
  const dedans = c.filter(x => x.dedans).sort((a, b) => b.rang - a.rang);
  const pres = c.filter(x => !x.dedans).sort((a, b) => a.ecart - b.ecart || b.rang - a.rang);
  const haute = dedans[0];
  const filet = haute ? pres.find(x => x.filet && x.rang > haute.rang) : undefined;
  return filet ? [filet, ...dedans, ...pres.filter(x => x !== filet)] : [...dedans, ...pres];
}

/** La forme qu'un clic prend au point (x, y) du plan, ou null. */
export function formeSousPoint(formes: readonly Forme[], x: number, y: number, o: OptionsPrise): string | null {
  return candidates(formes, x, y, o)[0]?.id ?? null;
}

/**
 * Alt+clic : la candidate qui suit la premiere deja choisie, en boucle ; si aucune ne l'est, celle du dessous de la
 * meilleure (la deuxieme). Null sans candidate.
 */
export function formeDessous(ids: readonly string[], choisies: readonly string[]): string | null {
  const n = ids.length;
  if (!n) return null;
  const sel = new Set(choisies);
  const i = ids.findIndex(id => sel.has(id));
  return i < 0 ? ids[Math.min(1, n - 1)] ?? null : ids[(i + 1) % n] ?? null;
}

/**
 * Ce que le lisere de survol dessine pour montrer ce qu'un clic prendra : la boite d'un texte, ou la cible minimale d'une
 * petite forme ; null pour le chemin de la forme lui-meme.
 */
export function zoneDePrise(f: Forme, o: OptionsPrise): Boite | null {
  const e = etendue(f), cible = o.cible / o.zoom;
  if (e && e.l < cible && e.h < cible) return gonflee(e, cible);
  return f.texte && !f.texte.disposition ? boiteForme(f) : null;
}
