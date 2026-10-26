// Les degrades lineaires et radiaux du modele v2 (ADR-0012, etape 3 ; annexe 1 §3, annexe 2 §2 et §5, annexe 5) : une peinture
// `fill` ou `stroke` en `url(#…)` vers un <linearGradient> ou un <radialGradient> devient `peintureRemplissage` ou `peintureContour`,
// avec sa couleur de repli a la place de la couleur ; l'ecriture pose la definition dans <defs> sous un identifiant d'empreinte et
// cite `url(#ed-d-…)` a la place de la couleur ; une transformation de la forme emmene son degrade.
//
// Lecture (mode riche seulement : le mode plat ne consulte aucune fonctionnalite et refuse comme avant, « un dégradé ou un motif ») :
// unites de boite et pourcentages resolus, `gradientTransform` compose avec tout ce qui pose la forme, chaine `href` suivie (attributs
// et arrets herites, bornee, cycle refuse), arrets tries et bornes (64), `stop-color`/`stop-opacity` par la cascade (classes et
// style compris). Ce qu'un navigateur ne peint pas (reference absente, degrade sans arret, boite plate, matrice degeneree) ne peint
// rien ici non plus, et c'est dit. Un renvoi a un autre fichier est refuse. Un motif (<pattern>) attend l'etape 9 : il reste refuse.

import type { Noeud } from '../../../util/xml.js';
import type { Fonctionnalite, Marche, PeintureResolue } from '../fonctionnalites.js';
import type { Pret } from '../parcours.js';
import type { ArretDegrade, Degrade, Forme, Matrice, Peinture } from '../types.js';
import { IDENTITE } from '../types.js';
import { proprietesDe, type Analyse } from '../cascade.js';
import { lirePeintureAlpha, COULEUR_COURANTE, type PeintureLue } from '../peinture.js';
import { arrondirOpacite } from '../opacites.js';
import { lireTransformation, multiplier } from '../geometrie.js';
import { COORDONNEE_MAX } from '../limites.js';
import { attributHerite, chaineHref, lireFraction, lireLongueur, lireReference, NOEUDS_DEFS_MAX, type Longueur } from '../resolution.js';
import { ARRETS_MAX, couleurDeRepli, definitionDegrade, estDegrade, transformerDegrade } from '../degrades.js';
import type { Definition, Recueil } from '../definitions.js';

// ---------------------------------------------------------------- phrases

/** Ce que la lecture riche dit perdre (`ignores`). */
export const MSG_DEGRADES = {
  arrets: 'les arrêts de dégradé au-delà de ' + ARRETS_MAX + ' (les derniers sont ignorés)',
  interpolation: 'l’espace colorimétrique des dégradés (color-interpolation) : toujours sRVB',
  reference: 'les peintures url(#…) qui ne renvoient à aucun dégradé (rien n’est peint, ou leur couleur de secours, comme dans un navigateur)',
  sansArret: 'les dégradés sans arrêt de couleur (rien n’est peint, comme dans un navigateur)',
  boitePlate: 'les dégradés en unités de boîte sur une forme sans largeur ou sans hauteur (rien n’est peint, comme dans un navigateur)',
  degenere: 'les dégradés dont la transformation est dégénérée (rien n’est peint, comme dans un navigateur)'
} as const;

/** Ce que la lecture riche refuse en le nommant (apres « Ce SVG contient … »). */
export const REFUS_DEGRADES = {
  externe: 'une peinture ou un dégradé qui renvoie à un fichier ou une adresse extérieurs',
  cycle: 'un cycle de dégradés',
  chaine: 'des dégradés qui héritent l’un de l’autre sur plus de 16 niveaux',
  unite: 'un dégradé dont une coordonnée n’est ni un nombre, ni des pixels, ni un pourcentage',
  transformation: 'un dégradé dont la transformation est illisible',
  demesure: 'un dégradé aux coordonnées démesurées (au-delà de ± ' + COORDONNEE_MAX.toLocaleString('fr-FR') + ')',
  trop: 'trop de dégradés distincts (plus de ' + NOEUDS_DEFS_MAX.toLocaleString('fr-FR') + ')'
} as const;

// ---------------------------------------------------------------- lecture d'une definition (sans la forme qui l'emploie)

const GENRES: Readonly<Record<string, Degrade['genre']>> = { linearGradient: 'lineaire', radialGradient: 'radial' };
const estElementDegrade = (n: Noeud): boolean => n.nom === 'linearGradient' || n.nom === 'radialGradient';

/** Une definition lue une fois par lecture : tout ce qui ne depend pas de la forme qui l'emploie. */
interface DefinitionLue {
  readonly genre: Degrade['genre'];
  readonly boite: boolean;
  readonly transformation: Matrice;
  readonly etalement?: 'reflect' | 'repeat';
  readonly longueurs: Readonly<Record<string, Longueur>>;
  readonly arrets: readonly ArretDegrade[];
}

/** La couleur courante d'un arret (`currentColor`) : la premiere `color` posee sur lui ou ses ancetres, le noir sinon. */
function couleurCourante(a: Analyse, n: Noeud): PeintureLue {
  let x: Noeud | undefined = n;
  for (let i = 0; x && i < 64; i++, x = a.parents.get(x)) {
    const c = (proprietesDe(a, x).color ?? x.attributs.color)?.trim();
    if (c && !['inherit', 'currentcolor', 'none'].includes(c.toLowerCase())) return lirePeintureAlpha(c);
  }
  return COULEUR_COURANTE;
}

/** Un arret : sa position (pas encore triee), sa couleur `#rrggbb` (le noir pour une valeur qui n'en est pas une) et son opacite. */
function lireArret(a: Analyse, s: Noeud): ArretDegrade {
  const pr = proprietesDe(a, s);
  const brute = (pr['stop-color'] ?? s.attributs['stop-color'] ?? '').trim();
  const lue = brute === '' ? { couleur: '#000000', alpha: 1 } : lirePeintureAlpha(brute, couleurCourante(a, s));
  // « transparent » est un noir sans opacite ; tout ce qui n'est pas une couleur (none, url(…), un nom inconnu) vaut le noir initial.
  const transparent = brute.toLowerCase() === 'transparent';
  const couleur = lue.couleur !== null && /^#[0-9a-f]{6}$/.test(lue.couleur) ? lue.couleur : '#000000';
  const alpha = transparent ? 0 : lue.couleur !== null && /^#[0-9a-f]{6}$/.test(lue.couleur) ? lue.alpha : 1;
  const opacite = arrondirOpacite(lireFraction(pr['stop-opacity'] ?? s.attributs['stop-opacity'], 1) * alpha);
  return { position: lireFraction(s.attributs.offset, 0), couleur, ...(opacite < 1 ? { opacite } : {}) };
}

const ATTRIBUTS: Readonly<Record<Degrade['genre'], readonly string[]>> = { lineaire: ['x1', 'y1', 'x2', 'y2'], radial: ['cx', 'cy', 'r', 'fx', 'fy', 'fr'] };

/** La definition d'un degrade et de ceux dont il herite ; ou la phrase de son refus. Les pertes sont dites par `marche`. */
function lireDefinition(cible: Noeud, marche: Marche): DefinitionLue | { readonly refus: string } {
  const a = marche.parcours.analyse;
  const genre = GENRES[cible.nom] ?? 'lineaire';
  const chaine = chaineHref(cible, a.ids, estElementDegrade);
  if ('cycle' in chaine) return { refus: REFUS_DEGRADES.cycle + ' (« #' + chaine.cycle + ' »)' };
  if ('externe' in chaine) return { refus: REFUS_DEGRADES.externe };
  if ('trop' in chaine) return { refus: REFUS_DEGRADES.chaine };
  const maillons = chaine.maillons;
  const texteTransformation = attributHerite(maillons, 'gradientTransform');
  const transformation = texteTransformation === undefined ? IDENTITE : lireTransformation(texteTransformation);
  if (!transformation) return { refus: REFUS_DEGRADES.transformation };
  const etalement = attributHerite(maillons, 'spreadMethod')?.trim();
  // Les coordonnees ne s'heritent que d'un degrade du meme genre (un radial n'a pas de x1) ; le reste, de tout degrade de la chaine.
  const memes = maillons.filter(m => m.nom === cible.nom);
  const longueurs: Record<string, Longueur> = {};
  for (const nom of ATTRIBUTS[genre]) longueurs[nom] = lireLongueur(attributHerite(memes, nom));
  // Les arrets sont ceux du premier maillon qui en porte (un degrade sans arret prend ceux dont il herite).
  const porteur = maillons.find(m => m.enfants.some(e => e.nom === 'stop'));
  const arrets: ArretDegrade[] = [];
  let trop = false;
  for (const e of porteur?.enfants ?? []) {
    if (e.nom !== 'stop') continue;
    if (arrets.length >= ARRETS_MAX) { trop = true; break; }
    const lu = lireArret(a, e);
    // Une position plus petite que la precedente vaut la precedente (les arrets ne reculent jamais).
    const avant = arrets[arrets.length - 1]?.position ?? 0;
    arrets.push(lu.position < avant ? { ...lu, position: avant } : lu);
  }
  if (trop) marche.ignorer(MSG_DEGRADES.arrets);
  const interpolation = (proprietesDe(a, cible)['color-interpolation'] ?? attributHerite(maillons, 'color-interpolation'))?.trim().toLowerCase();
  if (interpolation === 'linearrgb') marche.ignorer(MSG_DEGRADES.interpolation);
  return {
    genre,
    boite: attributHerite(maillons, 'gradientUnits')?.trim() !== 'userSpaceOnUse',
    transformation,
    ...(etalement === 'reflect' || etalement === 'repeat' ? { etalement } : {}),
    longueurs,
    arrets
  };
}

// ---------------------------------------------------------------- la peinture d'une forme

/**
 * Une peinture qui n'en est pas une (rien a peindre, ou la couleur de secours d'une reference qui ne mene a aucun degrade) : le crochet
 * de lecture ne sait rendre qu'une peinture du modele, alors il en rend une, marquee ici, que le crochet `feuille` remplace aussitot
 * par ce qu'un navigateur peindrait. Aucune ne survit a la lecture.
 */
const SUBSTITUTS = new WeakMap<Peinture, PeintureLue>();
function substitut(lue: PeintureLue): PeintureResolue {
  const peinture: Degrade = { genre: 'lineaire', x1: 0, y1: 0, x2: 0, y2: 0, arrets: [] };
  SUBSTITUTS.set(peinture, lue);
  return { peinture, repli: '#000000' };
}
const RIEN: PeintureLue = { couleur: null, alpha: 1 };

/** Ce que la lecture retient par lecture : les definitions lues, et les peintures resolues (partagees entre les formes identiques). */
interface Memoire { readonly definitions: Map<Noeud, DefinitionLue | { readonly refus: string }>; readonly peintures: Map<string, PeintureResolue>; trop: boolean }
const memoires = new WeakMap<object, Memoire>();
function memoire(marche: Marche): Memoire {
  let m = memoires.get(marche.parcours);
  if (!m) { m = { definitions: new Map(), peintures: new Map(), trop: false }; memoires.set(marche.parcours, m); }
  return m;
}

/**
 * Les grandeurs d'un degrade dans son repere, et la matrice qui le pose dans le repere de la forme : en unites de boite, la boite
 * locale de la forme (avant sa propre transformation) ; en unites du plan, les pourcentages rapportes au plan de travail.
 */
function geometrie(def: DefinitionLue, boite: { x: number; y: number; l: number; h: number } | null, plan: readonly [number, number, number, number]): { valeurs: Record<string, number>; base: Matrice } | 'unite' {
  const [, , w, h] = plan, diagonale = Math.sqrt((w * w + h * h) / 2);
  const reference: Readonly<Record<string, number>> = def.boite ? { x: 1, y: 1, r: 1 } : { x: w, y: h, r: diagonale };
  const axe = (nom: string): 'x' | 'y' | 'r' => (nom.startsWith('x') || nom === 'cx' || nom === 'fx' ? 'x' : nom.startsWith('y') || nom === 'cy' || nom === 'fy' ? 'y' : 'r');
  const DEFAUTS: Readonly<Record<string, number>> = { x1: 0, y1: 0, x2: 1, y2: 0, cx: 0.5, cy: 0.5, r: 0.5, fr: 0 };
  const valeurs: Record<string, number> = {};
  for (const nom of ATTRIBUTS[def.genre]) {
    const l = def.longueurs[nom] ?? null;
    if (l === 'unite') return 'unite';
    const ref = reference[axe(nom)] ?? 1;
    // Un rayon negatif est une erreur : l'attribut est ignore, comme dans un navigateur (sa valeur par defaut).
    const lue = l === null || (axe(nom) === 'r' && l.v < 0) ? null : l.part ? l.v * ref : l.v;
    if (lue !== null) valeurs[nom] = lue;
    else if (nom === 'fx') valeurs[nom] = valeurs.cx ?? 0;
    else if (nom === 'fy') valeurs[nom] = valeurs.cy ?? 0;
    else valeurs[nom] = (DEFAUTS[nom] ?? 0) * ref;
  }
  const base: Matrice = def.boite && boite ? [boite.l, 0, 0, boite.h, boite.x, boite.y] : IDENTITE;
  return { valeurs, base };
}

const fini = (v: number): boolean => Number.isFinite(v) && Math.abs(v) <= COORDONNEE_MAX;

/** Le degrade du modele d'une definition lue, pour une forme posee par `pret` ; ou la peinture qui le remplace. */
function peintureDe(cible: Noeud, def: DefinitionLue, n: Noeud, pret: Pret, marche: Marche): PeintureResolue {
  if (def.arrets.length === 0) { marche.ignorer(MSG_DEGRADES.sansArret); return substitut(RIEN); }
  const boite = def.boite ? marche.boiteForme(n, { ...pret, m: IDENTITE }) : null;
  if (def.boite && (!boite || !(boite.l > 0) || !(boite.h > 0))) { marche.ignorer(MSG_DEGRADES.boitePlate); return substitut(RIEN); }
  const g = geometrie(def, boite, marche.parcours.plan);
  if (g === 'unite') { marche.refuser(REFUS_DEGRADES.unite); return substitut(RIEN); }
  const m = multiplier(multiplier(pret.m, g.base), def.transformation);
  if (!m.every(fini) || !Object.values(g.valeurs).every(fini)) { marche.refuser(REFUS_DEGRADES.demesure); return substitut(RIEN); }
  if (!(Math.abs(m[0] * m[3] - m[1] * m[2]) > 1e-12)) { marche.ignorer(MSG_DEGRADES.degenere); return substitut(RIEN); }
  // La cle tient a la definition et a la matrice : deux formes au meme degrade, posees pareil, partagent le meme objet.
  const memo = memoire(marche), cle = cleNoeud(memo, cible) + ':' + m.join(','), connue = memo.peintures.get(cle);
  if (connue) return connue;
  if (memo.peintures.size >= NOEUDS_DEFS_MAX) { if (!memo.trop) marche.refuser(REFUS_DEGRADES.trop); memo.trop = true; return substitut(RIEN); }
  const v = g.valeurs;
  // Un seul arret peint sa couleur partout ; un degrade de longueur ou de rayon nuls aussi, celle du dernier (comme un navigateur).
  const dernier = def.arrets[def.arrets.length - 1] ?? { position: 1, couleur: '#000000' };
  const nul = def.genre === 'lineaire' ? v.x1 === v.x2 && v.y1 === v.y2 : !((v.r ?? 0) > 0);
  const arrets: readonly ArretDegrade[] = def.arrets.length === 1 || nul ? [{ ...dernier, position: 0 }, { ...dernier, position: 1 }] : def.arrets;
  const commun = { arrets, ...(def.etalement ? { etalement: def.etalement } : {}) };
  const brut: Degrade = def.genre === 'lineaire'
    ? { genre: 'lineaire', x1: v.x1 ?? 0, y1: v.y1 ?? 0, x2: v.x2 ?? 0, y2: v.y2 ?? 0, ...commun }
    : {
      genre: 'radial', cx: v.cx ?? 0, cy: v.cy ?? 0, r: v.r ?? 0,
      ...(v.fx !== v.cx ? { fx: v.fx ?? 0 } : {}), ...(v.fy !== v.cy ? { fy: v.fy ?? 0 } : {}), ...((v.fr ?? 0) > 0 ? { fr: v.fr ?? 0 } : {}),
      ...commun
    };
  const peinture = transformerDegrade(brut, m);
  const r: PeintureResolue = { peinture, repli: couleurDeRepli(arrets) };
  memo.peintures.set(cle, r);
  return r;
}

/** La couleur de secours d'une reference (`url(#a) red`), ou rien a peindre. */
const secours = (s: string | undefined): PeintureLue => {
  if (s === undefined) return RIEN;
  const l = lirePeintureAlpha(s);
  return l.couleur === null || /^#[0-9a-f]{6}$/.test(l.couleur) ? l : RIEN;
};

function resoudre(url: string, cote: 'remplissage' | 'contour', n: Noeud, pret: Pret, marche: Marche): PeintureResolue | null {
  // La valeur telle qu'elle est ecrite (la lecture des couleurs l'a mise en minuscules, or un identifiant tient a sa casse).
  const brute = (cote === 'remplissage' ? pret.heritees.fill : pret.heritees.stroke) ?? url;
  const ref = lireReference(brute) ?? lireReference(url);
  if (!ref) return null;
  if (ref.genre === 'externe') { marche.refuser(REFUS_DEGRADES.externe); return substitut(RIEN); }
  const cible = marche.parcours.analyse.ids.get(ref.id);
  // Un motif : l'etape 9. Ne rien rendre laisse le refus d'aujourd'hui (« un dégradé ou un motif »).
  if (cible?.nom === 'pattern') return null;
  if (!cible || !estElementDegrade(cible)) { marche.ignorer(MSG_DEGRADES.reference); return substitut(secours(ref.secours)); }
  const memo = memoire(marche);
  let def = memo.definitions.get(cible);
  if (!def) { def = lireDefinition(cible, marche); memo.definitions.set(cible, def); }
  if ('refus' in def) { marche.refuser(def.refus); return substitut(RIEN); }
  return peintureDe(cible, def, n, pret, marche);
}

const numeros = new WeakMap<Memoire, Map<Noeud, number>>();
function cleNoeud(memo: Memoire, n: Noeud): number {
  let m = numeros.get(memo);
  if (!m) { m = new Map(); numeros.set(memo, m); }
  let k = m.get(n);
  if (k === undefined) { k = m.size; m.set(n, k); }
  return k;
}

// ---------------------------------------------------------------- les substituts remplaces

const sans = <K extends keyof Forme>(f: Forme, cles: readonly K[]): Forme => {
  const x: Record<string, unknown> = { ...f };
  for (const k of cles) delete x[k];
  return x as unknown as Forme;
};

/** La forme ou un substitut de contour devient ce qu'un navigateur peindrait : rien (ni trait ni style de trait), ou une couleur. */
function sansSubstitutContour(f: Forme, lue: PeintureLue): Forme {
  const base = sans(f, ['peintureContour']);
  if (lue.couleur !== null) {
    const o = arrondirOpacite((f.opaciteContour ?? 1) * lue.alpha);
    return { ...sans(base, ['opaciteContour']), contour: lue.couleur, ...(o < 1 ? { opaciteContour: o } : {}) };
  }
  // Sans trait, fond et forme ne font qu'un : l'opacite du fond rejoint celle de la forme (la regle de `lireOpacites`).
  const nu = sans(base, ['opaciteContour', 'opaciteRemplissage', 'pointilles', 'decalagePointilles', 'bout', 'jonction', 'limiteMitre']);
  return { ...nu, contour: null, epaisseur: 0, opacite: f.remplissage !== null ? arrondirOpacite(f.opacite * (f.opaciteRemplissage ?? 1)) : f.opacite };
}

function sansSubstitutRemplissage(f: Forme, lue: PeintureLue): Forme {
  const base = sans(f, ['peintureRemplissage', 'opaciteRemplissage']);
  if (lue.couleur === null) return { ...base, remplissage: null };
  if (f.contour === null) return { ...base, remplissage: lue.couleur, opacite: arrondirOpacite(f.opacite * lue.alpha) };
  const o = arrondirOpacite((f.opaciteRemplissage ?? 1) * lue.alpha);
  return { ...base, remplissage: lue.couleur, ...(o < 1 ? { opaciteRemplissage: o } : {}) };
}

function completer(f: Forme): Forme {
  const c = f.peintureContour ? SUBSTITUTS.get(f.peintureContour) : undefined;
  const r = f.peintureRemplissage ? SUBSTITUTS.get(f.peintureRemplissage) : undefined;
  if (!c && !r) return f;
  const x = c ? sansSubstitutContour(f, c) : f;
  return r ? sansSubstitutRemplissage(x, r) : x;
}

// ---------------------------------------------------------------- ecriture et transformation

const definitions = new WeakMap<Degrade, Definition[]>();
/** La definition d'un degrade a une precision, memorisee (un degrade ne change jamais : mille formes ne le recomposent qu'une fois). */
function definitionMemo(d: Degrade, precision: number): Definition {
  let t = definitions.get(d);
  if (!t) { t = []; definitions.set(d, t); }
  let x = t[precision];
  if (!x) { x = definitionDegrade(d, precision); t[precision] = x; }
  return x;
}

const posees = new WeakMap<Recueil, Map<Definition, string>>();
/** L'identifiant d'une definition dans le recueil de cette ecriture : posee une fois, citee ensuite sans recomposer son texte. */
function poser(r: Recueil, d: Definition): string {
  let t = posees.get(r);
  if (!t) { t = new Map(); posees.set(r, t); }
  let id = t.get(d);
  if (id === undefined) { id = r.poser(d); t.set(d, id); }
  return id;
}

const peintes = new WeakMap<Forme, { readonly r: string | null; readonly c: string | null; readonly x: Forme }>();
/**
 * La forme repeinte en `url(#…)`, memorisee par forme (la derniere repeinte, avec ses identifiants : une forme s'ecrit presque
 * toujours avec les memes) : l'ecriture plate garde alors son cache par forme d'une ecriture a l'autre.
 */
function repeinte(f: Forme, r: string | null, c: string | null): Forme {
  const deja = peintes.get(f);
  if (deja && deja.r === r && deja.c === c) return deja.x;
  const x: Forme = { ...f, ...(r ? { remplissage: 'url(#' + r + ')' } : {}), ...(c ? { contour: 'url(#' + c + ')' } : {}) };
  peintes.set(f, { r, c, x });
  return x;
}

export const degrades: Fonctionnalite = {
  nom: 'degrades',
  lecture: { peinture: resoudre, feuille: completer },
  ecriture: {
    peindreFeuille(f, e) {
      const pr = estDegrade(f.peintureRemplissage) ? f.peintureRemplissage : null, pc = estDegrade(f.peintureContour) ? f.peintureContour : null;
      if (!pr && !pc) return f;
      const r = pr ? poser(e.definitions, definitionMemo(pr, e.precision)) : null;
      const c = pc ? poser(e.definitions, definitionMemo(pc, e.precision)) : null;
      return repeinte(f, r, c);
    }
  },
  transformation: {
    feuille(f, m) {
      const pr = estDegrade(f.peintureRemplissage) ? f.peintureRemplissage : null, pc = estDegrade(f.peintureContour) ? f.peintureContour : null;
      if (!pr && !pc) return f;
      const r = pr ? transformerDegrade(pr, m) : null;
      // Un meme degrade au fond et au trait reste un seul objet (une seule definition ecrite).
      const c = pc ? (pc === pr ? r : transformerDegrade(pc, m)) : null;
      return { ...f, ...(r ? { peintureRemplissage: r } : {}), ...(c ? { peintureContour: c } : {}) };
    }
  }
};
