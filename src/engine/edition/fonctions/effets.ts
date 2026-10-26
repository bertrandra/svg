// Les effets du modele v2 (ADR-0012, etape 7 ; annexe 1 §3, annexe 2 §3 et §5, annexe 4 B, annexe 5) : une feuille ou un groupe dont
// le `filter` renvoie a un <filter> du sous-ensemble portable (un flou gaussien, une ombre portee, ou les deux) garde ses `effets`, en
// unites du plan ; l'ecriture pose un <filter> aux formes exactes de l'annexe 4 B §2 dans <defs>, sous un identifiant d'empreinte, et
// cite `filter="url(#ed-f-…)"` au rang `filtre` ; une transformation emmene ses effets (calcul dans `edition/effets.ts`).
//
// Lecture (mode riche seulement : le mode plat ne consulte aucune fonctionnalite et refuse comme avant, « un filtre ») : le filtre se
// lit en EVALUANT ses primitives (`in`, `in2`, `result` resolus comme un navigateur le fait), puis le resultat se reconnait : un
// feGaussianBlur sur le graphique ; un feDropShadow ; l'ombre decomposee (flou de l'alpha, decalage, aplat, composition `in`,
// fusion sous le graphique) ; l'ombre puis un flou du graphique fusionne. Tout autre primitive refuse le SVG en la nommant (« un
// filtre (feTurbulence) ») ; toute autre combinaison des primitives admises aussi. Ce qui se perd se dit : la region d'origine
// remplacee quand elle rognait l'effet, le RVB lineaire calcule en sRVB, un ecart ou un decalage bornes, un flou anisotrope sous une
// rotation. Sous une transformation, l'ecart se met a l'echelle et le decalage de l'ombre tourne avec la matrice A LA LECTURE, puis
// vit dans le repere du plan.
//
// Ecriture : la region est la boite visuelle du noeud (trait et effets des enfants compris) elargie de la marge de ses effets, arrondie
// vers l'exterieur ; elle se mesure sur la geometrie TELLE QU'ELLE S'ECRIT (les coordonnees arrondies), pour que la relecture redonne
// la meme region a l'octet (le point fixe de l'annexe 2 §3).

import type { Noeud } from '../../../util/xml.js';
import type { Fonctionnalite, Marche, AttributEcrit, ContexteEcriture } from '../fonctionnalites.js';
import { RANG_FEUILLE, RANG_GROUPE } from '../fonctionnalites.js';
import type { Pret } from '../parcours.js';
import type { Boite, Effets, Flou, Forme, Groupe, ImageIntegree, Matrice, OmbrePortee } from '../types.js';
import { IDENTITE } from '../types.js';
import { proprietesDe, type Analyse } from '../cascade.js';
import { COULEUR_COURANTE, lirePeintureAlpha, type PeintureLue } from '../peinture.js';
import { arrondirOpacite } from '../opacites.js';
import { boiteChemin, unir } from '../geometrie.js';
import { boiteAvecTrait } from '../etendue.js';
import { arbreDe, type NoeudArbre } from '../arbre.js';
import { nb } from '../chemins.js';
import { LIMITE_MITRE_DEFAUT, pointillesEcrits } from '../trait.js';
import { ANIMATIONS, MSG_ANIMATIONS } from '../ignores.js';
import { hrefDe, lireFraction, lireLongueur, lireReference, type Longueur } from '../resolution.js';
import {
  aDesEffets, decalageMax, definitionFiltre, ecartMax, ecartsSous, effetsEcrits, elargir, flouDe, margeEffets, NOEUDS_A_EFFET_MAX, regionEcrite,
  transformerEffets
} from '../effets.js';
import { ecrireImage, rectangleImage } from './images.js';

// ---------------------------------------------------------------- phrases

const nombreDit = (v: number): string => v.toLocaleString('fr-FR', { maximumFractionDigits: 3 });

/** Ce que la lecture riche dit perdre (`ignores`, annexe 5 §1). */
export const MSG_EFFETS = {
  lineaire: 'un flou calculé en RVB linéaire se calcule en sRVB (différence légère sur les bords colorés)',
  region: 'la région d’un filtre plus étroite que son effet : l’effet s’écrit en entier',
  anisotrope: 'un flou anisotrope sous une rotation ou un cisaillement : écart moyen',
  ombreAnisotrope: 'une ombre au flou anisotrope ou déformé : écart moyen',
  nombreux: 'les effets de plus de ' + NOEUDS_A_EFFET_MAX.toLocaleString('fr-FR') + ' formes ou groupes (les suivants sont ignorés)',
  reference: 'les filtres url(#…) qui ne renvoient à aucun filtre (la forme est dessinée sans, comme le prévoit la spécification)',
  illisible: 'un nombre illisible dans un filtre (sa valeur par défaut est prise, comme dans un navigateur)'
} as const;

/** L'ecart borne a `ECART_MAX` (le quart du plus grand cote du plan), et dit. */
export const msgEcartBorne = (max: number): string => 'un flou ou une ombre dont l’écart dépassait la limite : borné à ' + nombreDit(max);
/** Le decalage d'une ombre borne au plus grand cote du plan, et dit. */
export const msgDecalageBorne = (max: number): string => 'une ombre dont le décalage dépassait la limite : borné à ' + nombreDit(max);

/** Ce que la lecture riche refuse en le nommant (apres « Ce SVG contient … »). */
export const REFUS_EFFETS = {
  forme: 'un filtre qui n’est ni un flou ni une ombre portée',
  css: 'un filtre CSS (blur(), drop-shadow()…)',
  chaine: 'une chaîne de plusieurs filtres',
  externe: 'un filtre qui renvoie à un fichier ou une adresse extérieurs',
  heritage: 'un filtre qui hérite d’un autre (href)',
  long: 'un filtre trop long (plus de 16 primitives)',
  vide: 'un filtre sans primitive (la forme ne se dessinerait pas)',
  regionVide: 'un filtre dont la région est vide (la forme ne se dessinerait pas)',
  boite: 'un filtre en unités de boîte (primitiveUnits) sur un groupe ou un élément sans boîte'
} as const;

/** Une primitive hors du sous-ensemble, nommee (annexe 4 B §3). */
export const refusPrimitive = (nom: string): string => 'un filtre (' + nom.slice(0, 40) + ')';
/** Une entree que le sous-ensemble ne lit pas (l'arriere-plan, la peinture). */
export const refusEntree = (nom: string): string => 'un filtre qui emploie l’arrière-plan ou la peinture (' + nom + ')';

// ---------------------------------------------------------------- bornes de lecture

/** Les primitives d'un filtre, au plus (les formes reconnues en ont sept) ; et les noeuds d'un feMerge. */
export const PRIMITIVES_MAX = 16;

const PRIMITIVES: ReadonlySet<string> = new Set(['feGaussianBlur', 'feOffset', 'feFlood', 'feComposite', 'feMerge', 'feDropShadow']);
const ENTREES_REFUSEES: ReadonlySet<string> = new Set(['BackgroundImage', 'BackgroundAlpha', 'FillPaint', 'StrokePaint']);

// ---------------------------------------------------------------- l'evaluation d'un filtre

/** Une image intermediaire d'un filtre, en unites de primitive (pas encore dans le plan). */
type Image =
  | { readonly k: 'source' }
  | { readonly k: 'alpha' }
  | { readonly k: 'aplat'; readonly couleur: string; readonly opacite: number }
  | { readonly k: 'flou'; readonly de: Image; readonly sx: number; readonly sy: number; readonly lineaire: boolean }
  | { readonly k: 'decalage'; readonly de: Image; readonly dx: number; readonly dy: number }
  | { readonly k: 'dans'; readonly a: Image; readonly b: Image }
  | { readonly k: 'pile'; readonly couches: readonly Image[] };

const SOURCE: Image = { k: 'source' };
const ALPHA: Image = { k: 'alpha' };

/** Un flou : un ecart negatif, ou deux ecarts nuls, desactivent la primitive (son resultat est son entree), comme le dit la specification. */
const flou = (de: Image, sx: number, sy: number, lineaire: boolean): Image => (sx < 0 || sy < 0 || (sx === 0 && sy === 0) ? de : { k: 'flou', de, sx, sy, lineaire });
const decalage = (de: Image, dx: number, dy: number): Image => (dx === 0 && dy === 0 ? de : { k: 'decalage', de, dx, dy });
/** Une pile (de bas en haut) ; une seule couche est cette couche. Jamais aplatie : une pile de piles reste petite. */
const pile = (couches: readonly Image[]): Image => (couches.length === 1 ? (couches[0] ?? SOURCE) : { k: 'pile', couches });

/** Ce qu'un filtre lu donne, avant les unites et le plan. */
interface FiltreLu {
  readonly unitesBoite: boolean;
  readonly primitivesBoite: boolean;
  readonly region: readonly [Longueur, Longueur, Longueur, Longueur];
  readonly sousRegions: boolean;
  readonly illisible: boolean;
  readonly resultat: Image;
}

/** Un nombre d'attribut de primitive : la valeur par defaut s'il est absent ; illisible, la valeur par defaut aussi, et c'est note. */
function nombre(v: string | undefined, defaut: number, note: { illisible: boolean }): number {
  if (v === undefined || v.trim() === '') return defaut;
  const t = v.trim();
  const x = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(t) ? Number(t) : NaN;
  if (Number.isFinite(x)) return x;
  note.illisible = true;
  return defaut;
}

/** Les ecarts d'un `stdDeviation` (un ou deux nombres) ; la valeur par defaut s'il est absent ou illisible. */
function ecartsLus(v: string | undefined, defaut: number, note: { illisible: boolean }): readonly [number, number] {
  if (v === undefined || v.trim() === '') return [defaut, defaut];
  const t = v.trim().split(/[\s,]+/);
  if (t.length > 2) { note.illisible = true; return [defaut, defaut]; }
  const x = nombre(t[0], NaN, note), y = t.length === 2 ? nombre(t[1], NaN, note) : x;
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : [defaut, defaut];
}

/** Une propriete d'element de filtre : feuille de style, `style`, puis attribut (elles ne sont pas toutes dans la cascade de la lecture). */
const propriete = (a: Analyse, n: Noeud, nom: string): string | undefined => (proprietesDe(a, n)[nom] ?? n.attributs[nom])?.trim();

/** Vrai si une primitive calcule en RVB lineaire : `color-interpolation-filters` herite, lineaire par defaut. */
function enLineaire(a: Analyse, n: Noeud): boolean {
  let x: Noeud | undefined = n;
  for (let i = 0; x && i < 64; i++, x = a.parents.get(x)) {
    const v = propriete(a, x, 'color-interpolation-filters')?.toLowerCase();
    if (v === undefined || v === '' || v === 'inherit') continue;
    return v !== 'srgb';
  }
  return true;
}

/** La couleur courante d'un aplat (`currentColor`) : la premiere `color` posee sur lui ou ses ancetres, le noir sinon. */
function couleurCourante(a: Analyse, n: Noeud): PeintureLue {
  let x: Noeud | undefined = n;
  for (let i = 0; x && i < 64; i++, x = a.parents.get(x)) {
    const c = propriete(a, x, 'color');
    if (c && !['inherit', 'currentcolor', 'none'].includes(c.toLowerCase())) return lirePeintureAlpha(c);
  }
  return COULEUR_COURANTE;
}

/** L'aplat d'un feFlood ou d'un feDropShadow : une couleur `#rrggbb` (le noir pour ce qui n'en est pas une) et son opacite. */
function aplatDe(a: Analyse, n: Noeud): { readonly couleur: string; readonly opacite: number } {
  const brute = propriete(a, n, 'flood-color') ?? 'black';
  const lue = lirePeintureAlpha(brute, couleurCourante(a, n));
  const hex = lue.couleur !== null && /^#[0-9a-f]{6}$/.test(lue.couleur);
  const alpha = lue.couleur === null ? 0 : hex ? lue.alpha : 1;
  return { couleur: hex && lue.couleur ? lue.couleur : '#000000', opacite: arrondirOpacite(lireFraction(propriete(a, n, 'flood-opacity'), 1) * alpha) };
}

/** Lit un <filter> une fois par lecture : ses unites, sa region, et l'image que ses primitives calculent ; ou ce qui le refuse. */
function lireFiltre(cible: Noeud, marche: Marche): FiltreLu | { readonly refus: string } {
  const a = marche.parcours.analyse;
  if (hrefDe(cible)?.trim()) return { refus: REFUS_EFFETS.heritage };
  const primitives: Noeud[] = [];
  for (const e of cible.enfants) {
    if (ANIMATIONS.has(e.nom)) { marche.ignorer(MSG_ANIMATIONS); continue; }
    // title, desc, metadata, ou un element sans rapport : un navigateur les ignore dans un filtre.
    if (!e.nom.startsWith('fe')) continue;
    if (!PRIMITIVES.has(e.nom)) return { refus: refusPrimitive(e.nom) };
    primitives.push(e);
  }
  if (!primitives.length) return { refus: REFUS_EFFETS.vide };
  if (primitives.length > PRIMITIVES_MAX || primitives.some(p => p.nom === 'feMerge' && p.enfants.length > PRIMITIVES_MAX)) return { refus: REFUS_EFFETS.long };
  const note = { illisible: false };
  const resultats = new Map<string, Image>();
  let precedent: Image = SOURCE, sousRegions = false;
  // Une entree : absente, le resultat precedent (le graphique pour la premiere) ; un nom inconnu aussi (une reference en avant ne compte pas).
  const entree = (v: string | undefined): Image | { readonly refus: string } => {
    const t = v?.trim();
    if (t === undefined || t === '') return precedent;
    if (t === 'SourceGraphic') return SOURCE;
    if (t === 'SourceAlpha') return ALPHA;
    if (ENTREES_REFUSEES.has(t)) return { refus: refusEntree(t) };
    return resultats.get(t) ?? precedent;
  };
  for (const p of primitives) {
    if (['x', 'y', 'width', 'height'].some(k => p.attributs[k] !== undefined)) sousRegions = true;
    const de = entree(p.attributs.in);
    if ('refus' in de) return de;
    let image: Image;
    switch (p.nom) {
      case 'feGaussianBlur': {
        const [sx, sy] = ecartsLus(p.attributs.stdDeviation, 0, note);
        image = flou(de, sx, sy, enLineaire(a, p));
        break;
      }
      case 'feOffset':
        image = decalage(de, nombre(p.attributs.dx, 0, note), nombre(p.attributs.dy, 0, note));
        break;
      case 'feFlood':
        image = { k: 'aplat', ...aplatDe(a, p) };
        break;
      case 'feComposite': {
        const b = entree(p.attributs.in2);
        if ('refus' in b) return b;
        const op = (p.attributs.operator ?? 'over').trim();
        if (op === 'in') image = { k: 'dans', a: de, b };
        else if (op === 'over') image = pile([b, de]);
        else return { refus: REFUS_EFFETS.forme };
        break;
      }
      case 'feMerge': {
        const couches: Image[] = [];
        for (const m of p.enfants) {
          if (m.nom !== 'feMergeNode') continue;
          const c = entree(m.attributs.in);
          if ('refus' in c) return c;
          couches.push(c);
        }
        if (!couches.length) return { refus: REFUS_EFFETS.forme };
        image = pile(couches);
        break;
      }
      default: {
        // feDropShadow : une ombre (ecart 2, decalage 2 et 2 par defaut) sous son entree.
        const [sx, sy] = ecartsLus(p.attributs.stdDeviation, 2, note);
        const ombre: Image = { k: 'dans', a: { k: 'aplat', ...aplatDe(a, p) }, b: decalage(flou(de, sx, sy, false), nombre(p.attributs.dx, 2, note), nombre(p.attributs.dy, 2, note)) };
        image = pile([ombre, de]);
      }
    }
    const r = p.attributs.result?.trim();
    if (r) resultats.set(r, image);
    precedent = image;
  }
  if (note.illisible) marche.ignorer(MSG_EFFETS.illisible);
  return {
    unitesBoite: cible.attributs.filterUnits?.trim() !== 'userSpaceOnUse',
    primitivesBoite: cible.attributs.primitiveUnits?.trim() === 'objectBoundingBox',
    region: [lireLongueur(cible.attributs.x), lireLongueur(cible.attributs.y), lireLongueur(cible.attributs.width), lireLongueur(cible.attributs.height)],
    sousRegions,
    illisible: note.illisible,
    resultat: precedent
  };
}

// ---------------------------------------------------------------- la reconnaissance

/** Des effets reconnus, en unites de primitive. */
interface EffetsBruts {
  readonly flou?: { readonly sx: number; readonly sy: number; readonly lineaire: boolean };
  readonly ombre?: { readonly sx: number; readonly sy: number; readonly dx: number; readonly dy: number; readonly couleur: string; readonly opacite: number };
}

/** La silhouette d'une ombre : l'alpha du graphique (une composition `in` ne lit que l'alpha), au plus un flou et un decalage. */
function silhouette(i: Image): { sx: number; sy: number; dx: number; dy: number } | null {
  const r = { sx: 0, sy: 0, dx: 0, dy: 0 };
  let flous = 0, decalages = 0;
  for (let x = i, n = 0; n < 3; n++) {
    if (x.k === 'source' || x.k === 'alpha') return r;
    if (x.k === 'flou' && !flous++) { r.sx = x.sx; r.sy = x.sy; x = x.de; continue; }
    if (x.k === 'decalage' && !decalages++) { r.dx = x.dx; r.dy = x.dy; x = x.de; continue; }
    return null;
  }
  return null;
}

/** Une ombre : un aplat compose `in` dans une silhouette. */
function ombreDe(i: Image): EffetsBruts['ombre'] | null {
  if (i.k !== 'dans' || i.a.k !== 'aplat') return null;
  const s = silhouette(i.b);
  return s ? { ...s, couleur: i.a.couleur, opacite: i.a.opacite } : null;
}

/** Les effets que calcule l'image finale d'un filtre, ou null si elle n'est pas du sous-ensemble (annexe 4 B §3). */
function reconnaitre(r: Image): EffetsBruts | null {
  if (r.k === 'source') return {};
  if (r.k === 'flou' && r.de.k === 'source') return { flou: { sx: r.sx, sy: r.sy, lineaire: r.lineaire } };
  if (r.k !== 'pile' || r.couches.length !== 2) return null;
  const [bas, haut] = r.couches;
  const ombre = bas ? ombreDe(bas) : null;
  if (!ombre || !haut) return null;
  if (haut.k === 'source') return { ombre };
  if (haut.k === 'flou' && haut.de.k === 'source') return { ombre, flou: { sx: haut.sx, sy: haut.sy, lineaire: haut.lineaire } };
  return null;
}

// ---------------------------------------------------------------- la memoire d'une lecture

interface Memoire {
  readonly filtres: Map<Noeud, FiltreLu | { readonly refus: string }>;
  /** Les regions d'origine des groupes a effets, dans le plan, pour dire si elles rognaient ce que leurs feuilles y dessinent. */
  readonly regions: Map<string, { readonly region: Boite; readonly marge: number; dit: boolean }>;
  compte: number;
}
const memoires = new WeakMap<object, Memoire>();
function memoire(marche: Marche): Memoire {
  let m = memoires.get(marche.parcours);
  if (!m) { m = { filtres: new Map(), regions: new Map(), compte: 0 }; memoires.set(marche.parcours, m); }
  return m;
}

// ---------------------------------------------------------------- du filtre lu aux effets du plan

/** La region d'un filtre, dans le repere de l'element ; null si une longueur ne se calcule pas (une unite), ou s'il faut une boite absente. */
function regionLocale(lu: FiltreLu, boite: Boite | null, plan: readonly [number, number, number, number]): Boite | null | 'vide' {
  const [lx, ly, ll, lh] = lu.region;
  if (lx === 'unite' || ly === 'unite' || ll === 'unite' || lh === 'unite') return null;
  if (lu.unitesBoite && !boite) return null;
  // En unites de boite, un nombre et un pourcentage sont une part de la boite ; en unites du plan, un pourcentage est une part du plan.
  const val = (l: Longueur, defaut: number, origine: number, ref: number): number => {
    if (l === null || l === 'unite') return lu.unitesBoite ? origine + defaut * ref : defaut * ref;
    return lu.unitesBoite ? origine + l.v * ref : l.part ? l.v * ref : l.v;
  };
  const b = boite ?? { x: 0, y: 0, l: 0, h: 0 };
  const rl = lu.unitesBoite ? b.l : plan[2], rh = lu.unitesBoite ? b.h : plan[3];
  const x = val(lx, -0.1, b.x, rl), y = val(ly, -0.1, b.y, rh);
  const l = lu.unitesBoite ? val(ll, 1.2, 0, rl) : ll === null ? 1.2 * rl : ll.part ? ll.v * rl : ll.v;
  const h = lu.unitesBoite ? val(lh, 1.2, 0, rh) : lh === null ? 1.2 * rh : lh.part ? lh.v * rh : lh.v;
  if (!(l > 0) || !(h > 0)) return 'vide';
  // Une region qui deborde a l'infini (1e308 fois la boite) ne rogne rien : il n'y a rien a dire.
  return [x, y, l, h].every(Number.isFinite) ? { x, y, l, h } : null;
}

/** La boite (alignee sur les axes) d'un rectangle du repere de l'element, dans le plan. */
function versPlan(b: Boite, m: Matrice): Boite {
  const coins = [[b.x, b.y], [b.x + b.l, b.y], [b.x, b.y + b.h], [b.x + b.l, b.y + b.h]].map(([x = 0, y = 0]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] as const);
  const xs = coins.map(c => c[0]), ys = coins.map(c => c[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  return { x: x0, y: y0, l: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
}

/** Vrai si `b` tient dans `r`, a l'arrondi du calcul pres. */
function contient(r: Boite, b: Boite): boolean {
  const e = 1e-6 * Math.max(1, Math.abs(r.x), Math.abs(r.y), r.l, r.h);
  return b.x >= r.x - e && b.y >= r.y - e && b.x + b.l <= r.x + r.l + e && b.y + b.h <= r.y + r.h + e;
}

/** Un ecart borne a `max` (et dit) ; un ecart que le calcul a rendu infini l'est aussi. */
function borner(v: number, max: number, marche: Marche): number {
  if (Number.isFinite(v) && v <= max + 1e-3) return Math.min(v, max);
  marche.ignorer(msgEcartBorne(max));
  return max;
}

function bornerDecalage(v: number, max: number, marche: Marche): number {
  if (Number.isFinite(v) && Math.abs(v) <= max + 1e-3) return Math.max(-max, Math.min(v, max));
  marche.ignorer(msgDecalageBorne(max));
  return v < 0 ? -max : max;
}

/** Les effets du modele, dans le plan, de ce qu'un filtre reconnu calcule dans le repere `m` d'un element de boite `boite`. */
function effetsDuPlan(brut: EffetsBruts, lu: FiltreLu, boite: Boite | null, m: Matrice, marche: Marche): Effets | { readonly refus: string } {
  const plan = marche.parcours.plan, max = ecartMax(plan), maxD = decalageMax(plan);
  // En unites de boite, un ecart et un decalage sont des parts de la boite (largeur en x, hauteur en y).
  const [kx, ky] = lu.primitivesBoite ? (boite ? [boite.l, boite.h] : [NaN, NaN]) : [1, 1];
  if (!Number.isFinite(kx) || !Number.isFinite(ky)) return { refus: REFUS_EFFETS.boite };
  let flouLu: Flou | undefined, ombreLue: OmbrePortee | undefined;
  if (brut.flou) {
    const s = ecartsSous(brut.flou.sx * kx, brut.flou.sy * ky, m);
    if (s.approche) marche.ignorer(MSG_EFFETS.anisotrope);
    if (brut.flou.lineaire) marche.ignorer(MSG_EFFETS.lineaire);
    flouLu = flouDe(borner(s.ex, max, marche), borner(s.ey, max, marche));
  }
  if (brut.ombre) {
    const o = brut.ombre;
    const s = ecartsSous(o.sx * kx, o.sy * ky, m);
    if (s.approche || s.ex !== s.ey) marche.ignorer(MSG_EFFETS.ombreAnisotrope);
    const dx = o.dx * kx, dy = o.dy * ky;
    // Le decalage tourne avec la matrice a la lecture (annexe 4 B §3), puis vit dans le repere du plan.
    ombreLue = {
      dx: bornerDecalage(m[0] * dx + m[2] * dy, maxD, marche),
      dy: bornerDecalage(m[1] * dx + m[3] * dy, maxD, marche),
      ecart: borner(s.ex === s.ey ? s.ex : Math.sqrt(s.ex * s.ey), max, marche),
      couleur: o.couleur,
      opacite: o.opacite
    };
  }
  return { ...(flouLu ? { flou: flouLu } : {}), ...(ombreLue ? { ombre: ombreLue } : {}) };
}

/**
 * Les effets d'un element (feuille ou groupe) dont le `filter` vaut `valeur`, ou rien (aucun filtre, un filtre sans effet, une
 * reference qui ne mene a aucun filtre et qui est dite). Les refus passent par `marche.refuser`.
 */
function effetsLus(valeur: string, boite: Boite | null, pret: Pret, marche: Marche): { readonly effets: Effets; readonly lu: FiltreLu } | null {
  const ref = lireReference(valeur);
  if (!ref) { marche.refuser(REFUS_EFFETS.css); return null; }
  if (ref.genre === 'externe') { marche.refuser(REFUS_EFFETS.externe); return null; }
  if (ref.secours !== undefined) { marche.refuser(REFUS_EFFETS.chaine); return null; }
  const cible = marche.parcours.analyse.ids.get(ref.id);
  if (!cible || cible.nom !== 'filter') { marche.ignorer(MSG_EFFETS.reference); return null; }
  const memo = memoire(marche);
  let lu = memo.filtres.get(cible);
  if (!lu) { lu = lireFiltre(cible, marche); memo.filtres.set(cible, lu); }
  if ('refus' in lu) { marche.refuser(lu.refus); return null; }
  const brut = reconnaitre(lu.resultat);
  if (!brut) { marche.refuser(REFUS_EFFETS.forme); return null; }
  if (!brut.flou && !brut.ombre) return null;
  const effets = effetsDuPlan(brut, lu, boite, pret.m, marche);
  if ('refus' in effets) { marche.refuser(effets.refus); return null; }
  if (++memo.compte > NOEUDS_A_EFFET_MAX) { marche.ignorer(MSG_EFFETS.nombreux); return null; }
  return { effets, lu };
}

/** La boite d'une feuille dans son propre repere (de quoi resoudre `objectBoundingBox`) ; null si elle n'en a pas. */
function boiteLocale(f: Forme, n: Noeud, pret: Pret, marche: Marche): Boite | null {
  if (f.image) return { x: f.image.x, y: f.image.y, l: f.image.l, h: f.image.h };
  return marche.boiteForme(n, { ...pret, m: IDENTITE });
}

/** Ce qu'une feuille dessine dans les groupes a effets qui l'entourent : si elle deborde de leur region d'origine, c'est dit. */
function verifierRegionsDesGroupes(f: Forme, marche: Marche): void {
  const memo = memoires.get(marche.parcours), table = marche.parcours.groupes;
  if (!memo?.regions.size || !table || f.parent === undefined) return;
  const propre = f.effets ? margeEffets(f.effets) : 0;
  let b: Boite | null | undefined;
  for (let id: string | undefined = f.parent, n = 0; id !== undefined && n < 128; id = table.get(id)?.parent, n++) {
    const r = memo.regions.get(id);
    if (!r || r.dit) continue;
    b ??= boiteAvecTrait(f);
    if (b && !contient(r.region, elargir(b, propre + r.marge))) { r.dit = true; marche.ignorer(MSG_EFFETS.region); }
  }
}

function lireFeuille(f: Forme, n: Noeud, pret: Pret, marche: Marche): Forme {
  const v = pret.pr.filter?.trim();
  if (!v || v === 'none') { verifierRegionsDesGroupes(f, marche); return f; }
  const boite = boiteLocale(f, n, pret, marche);
  const r = effetsLus(v, boite, pret, marche);
  if (!r) return f;
  const lue: Forme = { ...f, effets: r.effets };
  // La region d'origine, si elle rognait l'effet : l'ecriture la remplace par une region entiere, et le dit.
  const locale = regionLocale(r.lu, boite, marche.parcours.plan);
  if (locale === 'vide') { marche.refuser(REFUS_EFFETS.regionVide); return f; }
  const visible = boiteAvecTrait(lue);
  if (r.lu.sousRegions || (locale && visible && !contient(versPlan(locale, pret.m), elargir(visible, margeEffets(r.effets))))) marche.ignorer(MSG_EFFETS.region);
  verifierRegionsDesGroupes(lue, marche);
  return lue;
}

function lireGroupe(g: Groupe, _n: Noeud, pret: Pret, marche: Marche): Groupe {
  const v = pret.pr.filter?.trim();
  if (!v || v === 'none') return g;
  const r = effetsLus(v, null, pret, marche);
  if (!r) return g;
  if (r.lu.sousRegions) marche.ignorer(MSG_EFFETS.region);
  // Une region en unites du plan se confronte a chaque feuille du groupe, a mesure qu'elle se lit ; en unites de boite, la boite du
  // groupe n'est connue qu'apres ses feuilles : rien n'est dit (l'ecriture pose de toute facon une region entiere).
  if (!r.lu.unitesBoite) {
    const locale = regionLocale(r.lu, null, marche.parcours.plan);
    if (locale === 'vide') { marche.refuser(REFUS_EFFETS.regionVide); return g; }
    if (locale) memoire(marche).regions.set(g.id, { region: versPlan(locale, pret.m), marge: margeEffets(r.effets), dit: false });
  }
  return { ...g, effets: r.effets };
}

// ---------------------------------------------------------------- la boite telle qu'elle s'ecrit

const arrondi = (v: number, precision: number): number => Number(nb(v, precision));

/** Les nombres d'un attribut ecrit (ecrireImage), ou undefined. */
function attributEcrit(s: string, nom: string): string | undefined {
  return new RegExp(' ' + nom + '="([^"]*)"').exec(s)?.[1];
}

/** Une image telle qu'elle s'ecrit : son cadre (dans son repere) et la matrice de son `transform`, absente si elle s'est pliee dans le cadre. */
interface ImageEcrite { readonly cadre: Boite; readonly matrice?: Matrice }

const imagesEcrites = new WeakMap<Forme, Map<number, ImageEcrite | null>>();
/** Le cadre et la matrice qu'ecrit `ecrireImage` (relus dans son texte : la relecture verra exactement ces nombres). Memorises par forme. */
function imageEcrite(f: Forme, precision: number): ImageEcrite | null {
  let t = imagesEcrites.get(f);
  if (!t) { t = new Map(); imagesEcrites.set(f, t); }
  if (t.has(precision)) return t.get(precision) ?? null;
  const s = ecrireImage(f, precision) ?? '';
  const v = (nom: string): number => Number(attributEcrit(s, nom));
  const m = attributEcrit(s, 'transform')?.slice(7, -1).split(' ').map(Number);
  const cadre: Boite = { x: v('x'), y: v('y'), l: v('width'), h: v('height') };
  const r: ImageEcrite | null = s && [cadre.x, cadre.y, cadre.l, cadre.h].every(Number.isFinite)
    ? { cadre, ...(m && m.length === 6 && m.every(Number.isFinite) ? { matrice: m as unknown as Matrice } : {}) }
    : null;
  t.set(precision, r);
  return r;
}

/** La boite, dans le plan, d'un rectangle de son repere pose par `m`. */
const boitePosee = (b: Boite, m: Matrice): Boite | null => {
  const image: ImageIntegree = { donnees: '', x: b.x, y: b.y, l: b.l, h: b.h, matrice: m };
  return boiteChemin(rectangleImage(image));
};

/**
 * Les effets du plan ramenes dans le repere d'un element qui ecrit sa transformation (une image tournee) : un filtre agit dans le
 * repere de l'element qui le cite, la lecture y a applique la matrice, l'ecriture l'y retire. Exact pour une similitude ; un flou que
 * la matrice deformerait prend l'ecart moyen.
 */
function effetsLocaux(e: Effets, m: Matrice): Effets {
  const det = m[0] * m[3] - m[1] * m[2];
  const inv: Matrice = [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, 0, 0];
  let flouLocal: Flou | undefined, ombre: OmbrePortee | undefined;
  if (e.flou) { const s = ecartsSous(e.flou.ecart, e.flou.ecartY ?? e.flou.ecart, inv); flouLocal = flouDe(s.ex, s.ey); }
  if (e.ombre) {
    const o = e.ombre, s = ecartsSous(o.ecart, o.ecart, inv);
    ombre = { ...o, dx: inv[0] * o.dx + inv[2] * o.dy, dy: inv[1] * o.dx + inv[3] * o.dy, ecart: s.ex === s.ey ? s.ex : Math.sqrt(s.ex * s.ey) };
  }
  return { ...(flouLocal ? { flou: flouLocal } : {}), ...(ombre ? { ombre } : {}) };
}

const boitesEcrites = new WeakMap<Forme, Map<number, Boite | null>>();

/**
 * La boite visuelle d'une feuille (trait compris) telle que la relecture de son ecriture la rendra : coordonnees a la precision du
 * plan, epaisseur et limite de pointe au millieme ; une image, par le cadre et la matrice qu'elle ecrit. Memorisee par forme.
 */
export function boiteEcrite(f: Forme, precision: number): Boite | null {
  let t = boitesEcrites.get(f);
  if (!t) { t = new Map(); boitesEcrites.set(f, t); }
  if (t.has(precision)) return t.get(precision) ?? null;
  let b: Boite | null;
  if (f.image) {
    const i = imageEcrite(f, precision);
    b = i ? (i.matrice ? boitePosee(i.cadre, i.matrice) : i.cadre) : null;
  } else {
    const limite = f.jonction === 'miter' && f.limiteMitre !== undefined && f.limiteMitre >= 1 ? arrondi(f.limiteMitre, 3) : LIMITE_MITRE_DEFAUT;
    const { pointilles: _p, limiteMitre: _l, ...reste } = f;
    void _p; void _l;
    const ecrite: Forme = {
      ...reste,
      d: f.d.map(c => ({ c: c.c, p: c.p.map(v => arrondi(v, precision)) })),
      epaisseur: arrondi(f.epaisseur, 3),
      ...(limite !== LIMITE_MITRE_DEFAUT ? { limiteMitre: limite } : {}),
      ...(f.contour && pointillesEcrits(f) && f.pointilles ? { pointilles: f.pointilles } : {})
    };
    b = boiteAvecTrait(ecrite);
  }
  t.set(precision, b);
  return b;
}

/**
 * Le filtre d'une feuille tel qu'il s'ecrit : les effets ecrits (dans le repere de l'element), la boite de base dans ce repere, et la
 * matrice qui pose ce repere dans le plan (absente : le plan). null sans effet a ecrire.
 */
function filtreDeFeuille(f: Forme, precision: number): { readonly effets: Effets; readonly base: Boite; readonly matrice?: Matrice } | null {
  if (!aDesEffets(f.effets)) return null;
  const i = f.image ? imageEcrite(f, precision) : null;
  if (i?.matrice) {
    const ecrits = effetsEcrits(effetsLocaux(f.effets, i.matrice), precision);
    return ecrits ? { effets: ecrits, base: i.cadre, matrice: i.matrice } : null;
  }
  const base = boiteEcrite(f, precision), ecrits = effetsEcrits(f.effets, precision);
  return base && ecrits ? { effets: ecrits, base } : null;
}

/** La boite d'un noeud de l'arbre tel qu'il s'ecrit, ses effets compris ; null s'il ne s'ecrit pas (masque, sans trace). */
function boiteNoeudEcrit(n: NoeudArbre, precision: number): Boite | null {
  if (n.genre === 'feuille') {
    if (!n.forme.visible) return null;
    const filtre = filtreDeFeuille(n.forme, precision);
    if (!filtre) return boiteEcrite(n.forme, precision);
    const region = elargir(filtre.base, margeEffets(filtre.effets));
    return filtre.matrice ? boitePosee(region, filtre.matrice) : region;
  }
  if (!n.groupe.visible) return null;
  const b = unir(n.enfants.map(x => boiteNoeudEcrit(x, precision))), e = n.groupe.effets ? effetsEcrits(n.groupe.effets, precision) : null;
  return b && e ? elargir(b, margeEffets(e)) : b;
}

/** L'attribut `filter` d'effets ecrits sur une boite de base (sans ses propres effets), sa definition deposee au recueil. */
function attributFiltre(ecrits: Effets | null, base: Boite | null, rang: number, e: ContexteEcriture): readonly AttributEcrit[] {
  if (!ecrits || !base) return [];
  const def = definitionFiltre(ecrits, regionEcrite(elargir(base, margeEffets(ecrits)), e.precision), e.precision);
  return def ? [[rang, ' filter="url(#' + e.definitions.poser(def) + ')"']] : [];
}

function attributsFeuille(f: Forme, e: ContexteEcriture): readonly AttributEcrit[] {
  const filtre = filtreDeFeuille(f, e.precision);
  return filtre ? attributFiltre(filtre.effets, filtre.base, RANG_FEUILLE.filtre, e) : [];
}

function attributsGroupe(g: Groupe, e: ContexteEcriture): readonly AttributEcrit[] {
  if (!aDesEffets(g.effets)) return [];
  const noeud = arbreDe(e.courant()).parId.get(g.id);
  const base = noeud && noeud.genre === 'groupe' ? unir(noeud.enfants.map(x => boiteNoeudEcrit(x, e.precision))) : null;
  return attributFiltre(effetsEcrits(g.effets, e.precision), base, RANG_GROUPE.filtre, e);
}

// ---------------------------------------------------------------- la fonctionnalite

export const effets: Fonctionnalite = {
  nom: 'effets',
  lecture: { prises: ['filtre'], feuille: lireFeuille, groupe: lireGroupe },
  ecriture: {
    attributsFeuille,
    attributsGroupe
  },
  transformation: {
    feuille(f, m) {
      if (!f.effets) return f;
      const t = transformerEffets(f.effets, m);
      return t === f.effets ? f : { ...f, effets: t };
    },
    groupe(g, m) {
      if (!g.effets) return g;
      const t = transformerEffets(g.effets, m);
      return t === g.effets ? g : { ...g, effets: t };
    }
  },
  etendue: {
    feuille: (f, b) => (aDesEffets(f.effets) ? elargir(b, margeEffets(f.effets)) : b),
    groupe: (g, b) => (aDesEffets(g.effets) ? elargir(b, margeEffets(g.effets)) : b)
  }
};
