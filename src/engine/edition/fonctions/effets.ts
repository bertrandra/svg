// Les effets du modele v2 (ADR-0012, etape 7 ; annexe 1 §3, annexe 2 §3 et §5, annexe 4 B, annexe 5) : une feuille ou un groupe dont
// le `filter` renvoie a un <filter> du sous-ensemble portable (un flou gaussien, une ombre portee, ou les deux) garde ses `effets`, en
// unites du plan ; l'ecriture pose un <filter> aux formes exactes de l'annexe 4 B §2 dans <defs>, sous un identifiant d'empreinte, et
// cite `filter="url(#ed-f-…)"` au rang `filtre` ; une transformation emmene ses effets (calcul dans `edition/effets.ts`).
//
// Lecture (mode riche seulement : le mode plat ne consulte aucune fonctionnalite et refuse comme avant, « un filtre ») : le filtre se
// lit en EVALUANT ses primitives (`in`, `in2`, `result` resolus comme un navigateur le fait), puis le resultat se reconnait : un
// feGaussianBlur sur le graphique ; un feDropShadow ; l'ombre decomposee (flou de l'alpha, decalage, aplat, composition `in`,
// fusion sous le graphique) ; l'ombre puis un flou du graphique fusionne. Les idiomes des editeurs (etape 13b : matrices de couleurs
// et fusions de Figma, Sketch, Illustrator) passent par le meme calcul (edition/filtres.ts) : lus quand ils equivalent a ces formes,
// neutres quand ils ne changent rien (Adobe_OpacityMaskFilter), refuses sinon en nommant l'idiome (« une ombre intérieure (Figma) »).
// Tout autre primitive refuse le SVG en la nommant (« un filtre (feTurbulence) »). Ce qui se perd se dit : la region d'origine
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
import {
  ALPHA, SOURCE, REFUS_IDIOMES, aplat, appliquerMatrice, arithmetique, avecIdiome, dans, decalage, flou, fusion, hors, matriceCouleurs, matriceDeTeinte, pile,
  reconnaitre, type EffetsBruts, type Idiome, type Image
} from '../filtres.js';
import { nombre as nombreDeLaLangue, t } from '../../../util/i18n.js';

// ---------------------------------------------------------------- phrases

const nombreDit = (v: number): string => nombreDeLaLangue(v, 3);

// Les phrases sont des accesseurs : traduites (et leurs nombres formates) dans la langue de l'interface au moment ou on les lit.

/** Ce que la lecture riche dit perdre (`ignores`, annexe 5 §1). */
export const MSG_EFFETS = {
  get lineaire(): string { return t('un flou calculé en RVB linéaire se calcule en sRVB (différence légère sur les bords colorés)'); },
  get region(): string { return t('la région d’un filtre plus étroite que son effet : l’effet s’écrit en entier'); },
  get regionNeutre(): string { return t('la région d’un filtre sans effet plus étroite que la forme : la forme s’écrit entière'); },
  get anisotrope(): string { return t('un flou anisotrope sous une rotation ou un cisaillement : écart moyen'); },
  get ombreAnisotrope(): string { return t('une ombre au flou anisotrope ou déformé : écart moyen'); },
  get nombreux(): string { return t('les effets de plus de {n} formes ou groupes (les suivants sont ignorés)', { n: nombreDeLaLangue(NOEUDS_A_EFFET_MAX) }); },
  get reference(): string { return t('les filtres url(#…) qui ne renvoient à aucun filtre (la forme est dessinée sans, comme le prévoit la spécification)'); },
  get illisible(): string { return t('un nombre illisible dans un filtre (sa valeur par défaut est prise, comme dans un navigateur)'); }
};

/** L'ecart borne a `ECART_MAX` (le quart du plus grand cote du plan), et dit. */
export const msgEcartBorne = (max: number): string => t('un flou ou une ombre dont l’écart dépassait la limite : borné à {max}', { max: nombreDit(max) });
/** Le decalage d'une ombre borne au plus grand cote du plan, et dit. */
export const msgDecalageBorne = (max: number): string => t('une ombre dont le décalage dépassait la limite : borné à {max}', { max: nombreDit(max) });

/** Ce que la lecture riche refuse en le nommant (apres « Ce SVG contient … »). */
export const REFUS_EFFETS = {
  get forme(): string { return t('un filtre qui n’est ni un flou ni une ombre portée'); },
  get css(): string { return t('un filtre CSS (blur(), drop-shadow()…)'); },
  get chaine(): string { return t('une chaîne de plusieurs filtres'); },
  get externe(): string { return t('un filtre qui renvoie à un fichier ou une adresse extérieurs'); },
  get heritage(): string { return t('un filtre qui hérite d’un autre (href)'); },
  get long(): string { return t('un filtre trop long (plus de 16 primitives)'); },
  get vide(): string { return t('un filtre sans primitive (la forme ne se dessinerait pas)'); },
  get regionVide(): string { return t('un filtre dont la région est vide (la forme ne se dessinerait pas)'); },
  get boite(): string { return t('un filtre en unités de boîte (primitiveUnits) sur un groupe ou un élément sans boîte'); }
};

/** Une primitive hors du sous-ensemble, nommee (annexe 4 B §3). */
export const refusPrimitive = (nom: string): string => t('un filtre ({nom})', { nom: nom.slice(0, 40) });
/** Une entree que le sous-ensemble ne lit pas (l'arriere-plan, la peinture). */
export const refusEntree = (nom: string): string => t('un filtre qui emploie l’arrière-plan ou la peinture ({nom})', { nom });

// ---------------------------------------------------------------- bornes de lecture

/** Les primitives d'un filtre, au plus (les formes reconnues en ont sept, une ombre de Figma huit) ; et les noeuds d'un feMerge. */
export const PRIMITIVES_MAX = 16;

/**
 * Les primitives que l'evaluation sait calculer. feColorMatrix et feBlend ne s'ecrivent jamais (annexe 2 §6) : ils se lisent pour
 * reconnaitre les idiomes des editeurs (etape 13b), qui se ramenent a un flou et une ombre portee ou sont refuses en le nommant.
 */
const PRIMITIVES: ReadonlySet<string> = new Set(['feGaussianBlur', 'feOffset', 'feFlood', 'feComposite', 'feMerge', 'feDropShadow', 'feColorMatrix', 'feBlend']);
const ENTREES_REFUSEES: ReadonlySet<string> = new Set(['BackgroundImage', 'BackgroundAlpha', 'FillPaint', 'StrokePaint']);

// ---------------------------------------------------------------- l'evaluation d'un filtre (le calcul : edition/filtres.ts)

/** Ce qu'un filtre lu donne, avant les unites et le plan. */
interface FiltreLu {
  readonly unitesBoite: boolean;
  readonly primitivesBoite: boolean;
  readonly region: readonly [Longueur, Longueur, Longueur, Longueur];
  readonly sousRegions: boolean;
  readonly illisible: boolean;
  readonly resultat: Image;
  /** L'editeur dont le filtre porte l'idiome, pour nommer un refus. */
  readonly idiome?: Idiome;
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

/**
 * L'editeur dont un filtre porte l'idiome, pour nommer ce qui est refuse (jamais pour accepter : la reconnaissance passe par le calcul).
 * Illustrator nomme ses filtres (`AI_Shadow_1`, `Adobe_OpacityMaskFilter`) ; Figma pose un aplat transparent sous ses fusions
 * (« BackgroundImageFix ») ; Sketch teint ses ombres par une matrice, sans aplat ni fusion.
 */
function idiomeDe(cible: Noeud, primitives: readonly Noeud[], a: Analyse): Idiome | undefined {
  if (/^(?:AI_|Adobe_)/.test(cible.attributs.id ?? '')) return 'Illustrator';
  const transparents = new Set(primitives.flatMap(p => (p.nom === 'feFlood' && aplatDe(a, p).opacite === 0 && p.attributs.result?.trim() ? [p.attributs.result.trim()] : [])));
  if (primitives.some(p => p.nom === 'feBlend' && [p.attributs.in, p.attributs.in2].some(v => v !== undefined && transparents.has(v.trim())))) return 'Figma';
  const teinte = (p: Noeud): boolean => {
    const x = p.nom === 'feColorMatrix' ? matriceCouleurs(p.attributs.type, p.attributs.values) : null;
    return x !== null && matriceDeTeinte(x);
  };
  if (!primitives.some(p => p.nom === 'feFlood' || p.nom === 'feBlend') && primitives.some(teinte)) return 'Sketch';
  return undefined;
}

/** Lit un <filter> une fois par lecture : ses unites, sa region, et l'image que ses primitives calculent ; ou ce qui le refuse. */
function lireFiltre(cible: Noeud, marche: Marche): FiltreLu | { readonly refus: string } {
  const a = marche.parcours.analyse;
  if (hrefDe(cible)?.trim()) return { refus: REFUS_EFFETS.heritage };
  const primitives: Noeud[] = [];
  for (const e of cible.enfants) {
    if (ANIMATIONS.has(e.nom)) { marche.ignorer(t(MSG_ANIMATIONS)); continue; }
    // title, desc, metadata, ou un element sans rapport : un navigateur les ignore dans un filtre.
    if (e.nom.startsWith('fe')) primitives.push(e);
  }
  if (!primitives.length) return { refus: REFUS_EFFETS.vide };
  const court = primitives.length <= PRIMITIVES_MAX && !primitives.some(p => p.nom === 'feMerge' && p.enfants.length > PRIMITIVES_MAX);
  // L'idiome ne se cherche que dans un filtre court : une chaine demesuree est refusee sans rien lire de ses valeurs.
  const idiome = court ? idiomeDe(cible, primitives, a) : undefined;
  const refus = (phrase: string): { readonly refus: string } => ({ refus: avecIdiome(phrase, idiome) });
  const inconnue = primitives.find(p => !PRIMITIVES.has(p.nom));
  if (inconnue) return refus(refusPrimitive(inconnue.nom));
  if (!court) return { refus: REFUS_EFFETS.long };
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
      case 'feFlood': {
        const f = aplatDe(a, p);
        image = aplat(f.couleur, f.opacite);
        break;
      }
      case 'feComposite': {
        const b = entree(p.attributs.in2);
        if ('refus' in b) return b;
        const op = (p.attributs.operator ?? 'over').trim();
        if (op === 'in') image = dans(de, b);
        else if (op === 'over') image = pile([b, de]);
        else if (op === 'out') image = hors(de, b);
        else if (op === 'arithmetic') {
          const k = (n: string): number => nombre(p.attributs[n], 0, note);
          image = arithmetique(de, b, k('k1'), k('k2'), k('k3'), k('k4'));
        } else return refus(REFUS_EFFETS.forme);
        break;
      }
      case 'feColorMatrix': {
        const x = matriceCouleurs(p.attributs.type, p.attributs.values);
        if (!x) return refus(REFUS_IDIOMES.matrice);
        const r = appliquerMatrice(de, x, enLineaire(a, p));
        if ('refus' in r) return refus(r.refus);
        image = r;
        break;
      }
      case 'feBlend': {
        const b = entree(p.attributs.in2);
        if ('refus' in b) return b;
        const r = fusion(de, b, p.attributs.mode);
        if ('refus' in r) return refus(r.refus);
        image = r;
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
        if (!couches.length) return refus(REFUS_EFFETS.forme);
        image = pile(couches);
        break;
      }
      default: {
        // feDropShadow : une ombre (ecart 2, decalage 2 et 2 par defaut) sous son entree.
        const [sx, sy] = ecartsLus(p.attributs.stdDeviation, 2, note);
        const f = aplatDe(a, p);
        const ombre = dans(aplat(f.couleur, f.opacite), decalage(flou(de, sx, sy, false), nombre(p.attributs.dx, 2, note), nombre(p.attributs.dy, 2, note)));
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
    resultat: precedent,
    ...(idiome ? { idiome } : {})
  };
}

// ---------------------------------------------------------------- la memoire d'une lecture

interface Memoire {
  readonly filtres: Map<Noeud, FiltreLu | { readonly refus: string }>;
  /** Les regions d'origine des groupes a effets, dans le plan, pour dire si elles rognaient ce que leurs feuilles y dessinent. */
  readonly regions: Map<string, { readonly region: Boite; readonly marge: number; readonly phrase: string; dit: boolean }>;
  /** Les groupes dont l'ombre exige des feuilles opaques (Figma), et la phrase du refus sinon. */
  readonly pleines: Map<string, string>;
  compte: number;
}
const memoires = new WeakMap<object, Memoire>();
function memoire(marche: Marche): Memoire {
  let m = memoires.get(marche.parcours);
  if (!m) { m = { filtres: new Map(), regions: new Map(), pleines: new Map(), compte: 0 }; memoires.set(marche.parcours, m); }
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

/** Ce qu'un filtre lu donne a un element : ses effets (aucun pour un filtre neutre, l'identite d'Illustrator par exemple). */
interface Lu {
  readonly effets: Effets | null;
  readonly lu: FiltreLu;
  /** L'ombre ne vaut celle du modele que sous une forme opaque (alpha durci ou ombre retiree sous la forme, Figma). */
  readonly pleine: boolean;
}

/**
 * Les effets d'un element (feuille ou groupe) dont le `filter` vaut `valeur` ; null s'il n'y a rien a lire (une reference qui ne mene
 * a aucun filtre et qui est dite, un refus). Les refus passent par `marche.refuser`.
 */
function effetsLus(valeur: string, boite: Boite | null, pret: Pret, marche: Marche): Lu | null {
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
  const brut: EffetsBruts | { readonly refus: string } = reconnaitre(lu.resultat);
  if ('refus' in brut) { marche.refuser(avecIdiome(brut.refus, lu.idiome)); return null; }
  if (!brut.flou && !brut.ombre) return { effets: null, lu, pleine: false };
  const effets = effetsDuPlan(brut, lu, boite, pret.m, marche);
  if ('refus' in effets) { marche.refuser(effets.refus); return null; }
  if (++memo.compte > NOEUDS_A_EFFET_MAX) { marche.ignorer(MSG_EFFETS.nombreux); return null; }
  return { effets, lu, pleine: brut.pleine === true };
}

/** La boite d'une feuille dans son propre repere (de quoi resoudre `objectBoundingBox`) ; null si elle n'en a pas. */
function boiteLocale(f: Forme, n: Noeud, pret: Pret, marche: Marche): Boite | null {
  if (f.image) return { x: f.image.x, y: f.image.y, l: f.image.l, h: f.image.h };
  return marche.boiteForme(n, { ...pret, m: IDENTITE });
}

/** Ce qu'une feuille dessine dans les groupes a filtre qui l'entourent : si elle deborde de leur region d'origine, c'est dit. */
function verifierRegionsDesGroupes(f: Forme, marche: Marche): void {
  const memo = memoires.get(marche.parcours), table = marche.parcours.groupes;
  if (!memo?.regions.size || !table || f.parent === undefined) return;
  const propre = f.effets ? margeEffets(f.effets) : 0;
  let b: Boite | null | undefined;
  for (let id: string | undefined = f.parent, n = 0; id !== undefined && n < 128; id = table.get(id)?.parent, n++) {
    const r = memo.regions.get(id);
    if (!r || r.dit) continue;
    b ??= boiteAvecTrait(f);
    if (b && !contient(r.region, elargir(b, propre + r.marge))) { r.dit = true; marche.ignorer(r.phrase); }
  }
}

/** Une peinture sans transparence : un degrade aux arrets pleins (un motif peut laisser voir entre ses tuiles). */
const peintureOpaque = (p: Forme['peintureRemplissage']): boolean => p === undefined || (p.genre !== 'motif' && p.arrets.every(a => (a.opacite ?? 1) >= 1));

/**
 * Vrai si la feuille est opaque partout ou elle peint (a l'anticrenelage pres) : opacites pleines, peintures pleines, sans effet propre
 * (un flou ou une ombre adoucissent l'alpha), une image en JPEG seulement (les autres natures portent un alpha).
 */
function feuilleOpaque(f: Forme): boolean {
  if (f.opacite < 1 || (f.opaciteRemplissage ?? 1) < 1 || (f.opaciteContour ?? 1) < 1 || aDesEffets(f.effets)) return false;
  if (f.image) return f.image.donnees.startsWith('data:image/jpeg');
  return peintureOpaque(f.peintureRemplissage) && peintureOpaque(f.peintureContour);
}

/**
 * Une feuille dans un groupe dont l'ombre ne vaut celle du modele que sous une forme opaque (Figma) : elle doit l'etre, et chaque groupe
 * entre elle et lui aussi (ni opacite, ni masque, ni effet) ; sinon le SVG est refuse en le nommant. L'opacite, le masque ou la decoupe
 * du groupe a filtre lui-meme s'appliquent apres le filtre : ils ne comptent pas.
 */
function verifierPleines(f: Forme, marche: Marche): void {
  const memo = memoires.get(marche.parcours), table = marche.parcours.groupes;
  if (!memo?.pleines.size || !table || f.parent === undefined) return;
  let opaque = feuilleOpaque(f);
  for (let id: string | undefined = f.parent, n = 0; id !== undefined && n < 128; n++) {
    const g = table.get(id);
    const phrase = memo.pleines.get(id);
    if (phrase !== undefined && !opaque) { memo.pleines.delete(id); marche.refuser(phrase); }
    if (!g) return;
    if ((g.opacite ?? 1) < 1 || g.masque || aDesEffets(g.effets)) opaque = false;
    id = g.parent;
  }
}

function lireFeuille(f: Forme, n: Noeud, pret: Pret, marche: Marche): Forme {
  verifierPleines(f, marche);
  const v = pret.pr.filter?.trim();
  if (!v || v === 'none') { verifierRegionsDesGroupes(f, marche); return f; }
  const boite = boiteLocale(f, n, pret, marche);
  const r = effetsLus(v, boite, pret, marche);
  if (!r) return f;
  if (r.pleine && !feuilleOpaque(f)) { marche.refuser(avecIdiome(REFUS_IDIOMES.transparente, r.lu.idiome)); return f; }
  const lue: Forme = r.effets ? { ...f, effets: r.effets } : f;
  const marge = r.effets ? margeEffets(r.effets) : 0;
  // La region d'origine, si elle rognait l'effet (ou la forme, sous un filtre neutre) : l'ecriture la remplace par une region entiere
  // (ou n'en ecrit pas), et le dit.
  const locale = regionLocale(r.lu, boite, marche.parcours.plan);
  if (locale === 'vide') { marche.refuser(REFUS_EFFETS.regionVide); return f; }
  const visible = boiteAvecTrait(lue);
  if (r.lu.sousRegions || (locale && visible && !contient(versPlan(locale, pret.m), elargir(visible, marge)))) marche.ignorer(r.effets ? MSG_EFFETS.region : MSG_EFFETS.regionNeutre);
  verifierRegionsDesGroupes(lue, marche);
  return lue;
}

function lireGroupe(g: Groupe, _n: Noeud, pret: Pret, marche: Marche): Groupe {
  const v = pret.pr.filter?.trim();
  if (!v || v === 'none') return g;
  const r = effetsLus(v, null, pret, marche);
  if (!r) return g;
  const phrase = r.effets ? MSG_EFFETS.region : MSG_EFFETS.regionNeutre;
  if (r.lu.sousRegions) marche.ignorer(phrase);
  // Une region en unites du plan se confronte a chaque feuille du groupe, a mesure qu'elle se lit ; en unites de boite, la boite du
  // groupe n'est connue qu'apres ses feuilles : rien n'est dit (l'ecriture pose de toute facon une region entiere).
  if (!r.lu.unitesBoite) {
    const locale = regionLocale(r.lu, null, marche.parcours.plan);
    if (locale === 'vide') { marche.refuser(REFUS_EFFETS.regionVide); return g; }
    if (locale) memoire(marche).regions.set(g.id, { region: versPlan(locale, pret.m), marge: r.effets ? margeEffets(r.effets) : 0, phrase, dit: false });
  }
  // L'opacite des feuilles se verifie a mesure qu'elles se lisent (le crochet est appele avant elles).
  if (r.pleine) memoire(marche).pleines.set(g.id, avecIdiome(REFUS_IDIOMES.transparente, r.lu.idiome));
  return r.effets ? { ...g, effets: r.effets } : g;
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
