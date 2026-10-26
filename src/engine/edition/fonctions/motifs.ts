// Les motifs du modele v2 (ADR-0012, etape 9 ; annexe 1 §3, annexe 2 §2 et §5, annexe 5) : une peinture `fill` ou `stroke` en
// `url(#…)` vers un <pattern> devient `peintureRemplissage` ou `peintureContour`, avec sa couleur de repli a la place de la couleur ;
// l'ecriture pose `<pattern id="ed-p-…" patternUnits="userSpaceOnUse" x y width height [patternTransform]>` et sa tuile dans <defs>,
// sous un identifiant d'empreinte, et cite `url(#ed-p-…)` a la place de la couleur ; une transformation de la forme emmene son motif
// (sa matrice se compose, comme celle d'un degrade).
//
// Le repere d'un motif : `x y l h` sont la tuile dans le repere du motif, `matrice` porte ce repere dans le plan (patternTransform
// compose avec tout ce qui pose la forme), et le CONTENU de la tuile est dans le repere de la tuile, son origine au coin (x, y),
// comme un navigateur le dessine (chaque repetition de la tuile y translate son contenu). Les unites de boite (patternUnits,
// patternContentUnits) et le viewBox (avec preserveAspectRatio) sont cuits a la lecture ; l'ecriture n'a qu'a recopier la tuile.
//
// Les identifiants d'une tuile forment un espace a part (annexe 1 §2 : « un seul espace par dessin, contenus de decoupes et de
// masques compris » ; la tuile d'un motif n'y est pas). Une peinture se partage donc comme un degrade, sans renumerotation : mille
// formes repetees en grille portent le meme objet, un projet rouvert en porte mille copies egales, et `verifierDessin` juge chaque
// tuile pour elle-meme. `prochainNumero` les compte quand meme : un numero neuf ne reprend jamais celui d'une feuille de tuile.
//
// Lecture (mode riche seulement : le mode plat ne consulte aucune fonctionnalite et refuse comme avant, « un dégradé ou un motif ») :
// chaine `href` suivie (attributs et contenu herites, bornee, cycle refuse), contenu lu par `contenus.ts` (feuilles, groupes, degrades,
// decoupes, masques, effets, motifs imbriques ; pile, tables et budget communs a toutes les definitions). Refus nommes : renvoi a un
// autre fichier, cycle (un motif peint par sa propre tuile), imbrication au-dela de `PROFONDEUR_DEFS_MAX`, contenus au-dela de
// `NOEUDS_DEFS_MAX`, tuile vide, nulle ou plus petite qu'un centieme, coordonnees demesurees, une image dans une tuile (l'ecriture la
// saurait poser, `xmlns:xlink` compris ; mais le projet JSON porte une copie de la tuile par forme peinte, sans partage, et n'en verifie
// pas les octets : une image de 4 Mo sur mille formes y pese 4 Go). Dit : une tuile qui deborde (`overflow: visible`) est rognee.

import type { Noeud } from '../../../util/xml.js';
import type { Fonctionnalite, Marche, PeintureResolue, ContexteEcriture } from '../fonctionnalites.js';
import type { Contexte, Pret } from '../parcours.js';
import type { Contenu, Forme, Groupe, Matrice, Motif, Peinture } from '../types.js';
import { IDENTITE } from '../types.js';
import type { Proprietes } from '../ignores.js';
import { proprietesDe } from '../cascade.js';
import { heriter } from '../heritage.js';
import { lireTransformation, multiplier } from '../geometrie.js';
import { lireAspect, lireVue, matriceCadre } from '../clones.js';
import { nb } from '../chemins.js';
import { normaliser, visibleEffectif } from '../arbre.js';
import { COORDONNEE_MAX } from '../limites.js';
import { attributHerite, chaineHref, lireLongueur, lireReference, NOEUDS_DEFS_MAX, PROFONDEUR_DEFS_MAX } from '../resolution.js';
import { ancetresDe, etatContenus, lireContenu, visiterSousBudget } from '../contenus.js';
import { lireCode, versOklab, depuisOklch, versHex } from '../../../util/couleur.js';
import { aireDeChemin, longueurDeChemin } from '../../nuancier/surfaces.js';
import type { Recueil } from '../definitions.js';
import { nombre } from '../../../util/i18n.js';

// ---------------------------------------------------------------- phrases

/** La plus petite tuile (largeur et hauteur, dans le repere du motif) : en dessous, rien de lisible ne se repete, et la tuile ecrite au centieme serait nulle. */
export const TUILE_MIN = 0.01;

/** Ce que la lecture riche refuse en le nommant (apres « Ce SVG contient … », annexe 5 §1). */
export const REFUS_MOTIFS = {
  externe: 'une peinture ou un motif qui renvoie à un fichier ou une adresse extérieurs',
  cycle: 'un cycle de motifs',
  chaine: 'des motifs qui héritent l’un de l’autre sur plus de 16 niveaux',
  profondeur: 'des définitions emboîtées sur plus de ' + PROFONDEUR_DEFS_MAX + ' niveaux (motifs, masques, découpes)',
  trop: 'des motifs trop lourds (plus de ' + nombre(NOEUDS_DEFS_MAX) + ' formes dans leurs définitions)',
  nombreux: 'trop de motifs distincts (plus de ' + nombre(NOEUDS_DEFS_MAX) + ')',
  vide: 'un motif dont la tuile est vide, nulle ou plus petite qu’un centième (rien ne s’y répète)',
  unite: 'un motif dont une longueur n’est ni un nombre, ni des pixels, ni un pourcentage',
  transformation: 'un motif dont la transformation est illisible ou dégénérée',
  demesure: 'un motif aux coordonnées démesurées (au-delà de ± ' + nombre(COORDONNEE_MAX) + ')',
  image: 'une image dans la tuile d’un motif'
} as const;

/** Ce que la lecture riche dit perdre (`ignores`). */
export const MSG_MOTIFS = {
  debord: 'un motif dont la tuile déborde (overflow: visible) : il est rogné à la tuile'
} as const;

// ---------------------------------------------------------------- calcul pur : repli, transformation

/** Vrai pour une peinture qui est un motif. */
export const estMotif = (p: Peinture | undefined): p is Motif => p !== undefined && p.genre === 'motif';

const memoReplis = new WeakMap<Contenu, string>();

/**
 * La couleur de repli d'un motif (annexe 1 §6) : la moyenne OKLab des couleurs de sa tuile, chacune ponderee par ce qu'elle couvre (l'aire
 * d'un fond, la longueur d'un trait par son epaisseur, comme le nuancier) et par son opacite ; ce que la tuile laisse transparent ne compte
 * pas (le repli dit la couleur du motif, pas celle d'un fond qu'on ne connait pas). Un motif imbrique ou un degrade y comptent par leur
 * propre repli. Rien de peint : le noir. Un #rrggbb toujours ; memorise par tuile (un motif ne change jamais).
 */
export function couleurDeRepliMotif(c: Contenu): string {
  const deja = memoReplis.get(c);
  if (deja) return deja;
  const points: { l: number; a: number; b: number; poids: number; surface: number }[] = [];
  const ajouter = (couleur: string | null, opacite: number, surface: number): void => {
    const rgb = couleur ? lireCode(couleur) : null;
    if (!rgb || !(surface > 0)) return;
    const p = versOklab(rgb);
    points.push({ ...p, poids: surface * Math.max(0, opacite), surface });
  };
  for (const f of c.formes) {
    if (!visibleEffectif(c, f.id)) continue;
    if (f.remplissage !== null) ajouter(f.remplissage, f.opacite * (f.opaciteRemplissage ?? 1), aireDeChemin(f.d, f.regle));
    if (f.contour !== null && f.epaisseur > 0) ajouter(f.contour, f.opacite * (f.opaciteContour ?? 1), longueurDeChemin(f.d) * f.epaisseur);
  }
  const moyenne = (poids: (p: (typeof points)[number]) => number): { l: number; a: number; b: number } | null => {
    const total = points.reduce((s, p) => s + poids(p), 0);
    if (!(total > 0) || !Number.isFinite(total)) return null;
    let l = 0, a = 0, b = 0;
    for (const p of points) { const k = poids(p) / total; l += p.l * k; a += p.a * k; b += p.b * k; }
    return { l, a, b };
  };
  const m = moyenne(p => p.poids) ?? moyenne(p => p.surface);
  let repli = '#000000';
  if (m) {
    const h = (Math.atan2(m.b, m.a) * 180) / Math.PI;
    repli = versHex(depuisOklch({ l: m.l, c: Math.hypot(m.a, m.b), h: h < 0 ? h + 360 : h }));
  }
  memoReplis.set(c, repli);
  return repli;
}

const estIdentite = (m: Matrice): boolean => m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;

const estTranslation = (m: Matrice): boolean => m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1;

/**
 * Le motif pose par `m` en plus de ce qui le posait deja. Une translation d'un motif sans matrice deplace sa tuile (le contenu, dans le
 * repere de la tuile, la suit : deplacer est le cas le plus courant, et le modele reste simple) ; tout le reste compose la matrice,
 * exactement. Le contenu ne bouge jamais (il reste le meme objet, partage). Le meme motif sous l'identite.
 */
export function transformerMotif(p: Motif, m: Matrice): Motif {
  if (estIdentite(m)) return p;
  if (estTranslation(m) && p.matrice === undefined) return { ...p, x: p.x + m[4], y: p.y + m[5] };
  const matrice = multiplier(m, p.matrice ?? IDENTITE);
  if (estIdentite(matrice)) { const { matrice: _m, ...reste } = p; void _m; return reste; }
  return { ...p, matrice };
}

// ---------------------------------------------------------------- lecture

const estPattern = (n: Noeud): boolean => n.nom === 'pattern';
/** Ce qui ne se dessine jamais : un maillon qui n'a que cela n'a pas de contenu (il herite celui du suivant). */
const MUETS = new Set(['title', 'desc', 'metadata']);

/** Ce que la lecture retient par lecture : les contenus lus (par source et matrice) et les peintures resolues (partagees). */
interface Memoire {
  readonly contenus: Map<string, Contenu>;
  readonly peintures: Map<string, PeintureResolue>;
  readonly numeros: Map<Noeud, number>;
  trop: boolean;
}
const memoires = new WeakMap<object, Memoire>();
function memoire(marche: Marche): Memoire {
  let m = memoires.get(marche.parcours);
  if (!m) { m = { contenus: new Map(), peintures: new Map(), numeros: new Map(), trop: false }; memoires.set(marche.parcours, m); }
  return m;
}
function numero(memo: Memoire, n: Noeud): number {
  let k = memo.numeros.get(n);
  if (k === undefined) { k = memo.numeros.size; memo.numeros.set(n, k); }
  return k;
}

/** Une peinture qui ne survit pas : le SVG est refuse (la marche l'a dit), il faut seulement rendre quelque chose au crochet. */
const REFUSEE: PeintureResolue = { peinture: { genre: 'motif', x: 0, y: 0, l: 1, h: 1, contenu: { formes: [] } }, repli: '#000000' };

const fini = (v: number): boolean => Number.isFinite(v) && Math.abs(v) <= COORDONNEE_MAX;

/** Les groupes d'un contenu dans l'ordre de leurs numeros : la table ne depend pas de l'ordre ou la lecture les a croises. */
const parNumero = (g: ReadonlyArray<readonly [string, Groupe]>): Array<readonly [string, Groupe]> =>
  [...g].sort((a, b) => Number(a[0].slice(1)) - Number(b[0].slice(1)) || (a[0] < b[0] ? -1 : 1));

/**
 * La tuile d'un <pattern> (et de ceux dont il herite), pour une forme posee par `pret` : son rectangle, sa matrice dans le plan et son
 * contenu ; ou null si le SVG est refuse (dit par `marche`).
 */
function lireMotif(cible: Noeud, n: Noeud, pret: Pret, marche: Marche): PeintureResolue | null {
  const p = marche.parcours, a = p.analyse;
  const etat = etatContenus(marche);
  const chaine = chaineHref(cible, a.ids, estPattern);
  if ('cycle' in chaine) { marche.refuser(REFUS_MOTIFS.cycle + ' (« #' + chaine.cycle + ' »)'); return null; }
  if ('externe' in chaine) { marche.refuser(REFUS_MOTIFS.externe); return null; }
  if ('trop' in chaine) { marche.refuser(REFUS_MOTIFS.chaine); return null; }
  const maillons = chaine.maillons;
  // Le contenu est celui du premier maillon qui en porte (un motif sans enfant prend celui dont il herite).
  const porteur = maillons.find(m => m.enfants.some(e => !MUETS.has(e.nom)));
  if (etat.actives.includes(cible) || (porteur && etat.actives.includes(porteur))) {
    marche.refuser(REFUS_MOTIFS.cycle + ' (« #' + (cible.attributs.id ?? '').slice(0, 40) + ' »)');
    return null;
  }
  if (etat.actives.length >= PROFONDEUR_DEFS_MAX) { marche.refuser(REFUS_MOTIFS.profondeur); return null; }
  const texteTransformation = attributHerite(maillons, 'patternTransform');
  const transformation = texteTransformation === undefined ? IDENTITE : lireTransformation(texteTransformation);
  if (!transformation) { marche.refuser(REFUS_MOTIFS.transformation); return null; }
  const tuileEnBoite = attributHerite(maillons, 'patternUnits')?.trim() !== 'userSpaceOnUse';
  const contenuEnBoite = attributHerite(maillons, 'patternContentUnits')?.trim() === 'objectBoundingBox';
  const vue = lireVue(attributHerite(maillons, 'viewBox'));
  // La boite de la forme dans son repere (avant sa propre matrice) : ce que mesurent les unites de boite.
  const boite = tuileEnBoite || (contenuEnBoite && vue === null) ? marche.boiteForme(n, { ...pret, m: IDENTITE }) : null;
  if ((tuileEnBoite || (contenuEnBoite && vue === null)) && (!boite || !(boite.l > 0) || !(boite.h > 0))) { marche.refuser(REFUS_MOTIFS.vide); return null; }
  // Le rectangle de la tuile : en unites de boite, des parts de la boite ; en unites du plan, des coordonnees (un pourcentage du plan).
  const plan = p.plan;
  const longueur = (nom: 'x' | 'y' | 'width' | 'height', axe: number): number | 'unite' => {
    const l = lireLongueur(attributHerite(maillons, nom));
    if (l === 'unite') return 'unite';
    if (l === null) return 0;
    return tuileEnBoite ? l.v : l.part ? l.v * axe : l.v;
  };
  const lus = [longueur('x', plan[2]), longueur('y', plan[3]), longueur('width', plan[2]), longueur('height', plan[3])];
  if (lus.some(v => v === 'unite')) { marche.refuser(REFUS_MOTIFS.unite); return null; }
  const [fx, fy, fl, fh] = lus as number[];
  const b = boite ?? { x: 0, y: 0, l: 1, h: 1 };
  const x = tuileEnBoite ? b.x + (fx ?? 0) * b.l : fx ?? 0, y = tuileEnBoite ? b.y + (fy ?? 0) * b.h : fy ?? 0;
  const l = tuileEnBoite ? (fl ?? 0) * b.l : fl ?? 0, h = tuileEnBoite ? (fh ?? 0) * b.h : fh ?? 0;
  if (![x, y, l, h].every(fini)) { marche.refuser(REFUS_MOTIFS.demesure); return null; }
  if (!(l >= TUILE_MIN) || !(h >= TUILE_MIN) || vue === 'vide' || !porteur) { marche.refuser(REFUS_MOTIFS.vide); return null; }
  const matrice = multiplier(pret.m, transformation);
  if (!matrice.every(fini) || !(Math.abs(matrice[0] * matrice[3] - matrice[1] * matrice[2]) > 1e-12)) { marche.refuser(REFUS_MOTIFS.transformation); return null; }
  // Le repere du contenu dans la tuile : le viewBox cadre dans la tuile (il l'emporte sur les unites du contenu), sinon la boite.
  const repere: Matrice = vue ? matriceCadre(vue, { x: 0, y: 0, l, h }, lireAspect(attributHerite(maillons, 'preserveAspectRatio')))
    : contenuEnBoite ? [b.l, 0, 0, b.h, 0, 0] : IDENTITE;
  if (!repere.every(fini)) { marche.refuser(REFUS_MOTIFS.demesure); return null; }
  const memo = memoire(marche);
  const cleContenu = numero(memo, porteur) + ':' + repere.join(',');
  let contenu = memo.contenus.get(cleContenu);
  if (!contenu) {
    const lu = lireTuile(porteur, repere, pret.profondeur, marche);
    if (!lu) return null;
    contenu = lu;
    memo.contenus.set(cleContenu, contenu);
  }
  if (!contenu.formes.length) { marche.refuser(REFUS_MOTIFS.vide); return null; }
  const debord = (proprietesDe(a, cible).overflow ?? attributHerite(maillons, 'overflow') ?? '').trim().toLowerCase();
  if (debord === 'visible' || debord === 'auto') marche.ignorer(MSG_MOTIFS.debord);
  // La cle tient au contenu, a la tuile et a la matrice : deux formes au meme motif, posees pareil, partagent le meme objet.
  const cle = cleContenu + '|' + [x, y, l, h].join(',') + '|' + matrice.join(',');
  const connue = memo.peintures.get(cle);
  if (connue) return connue;
  if (memo.peintures.size >= NOEUDS_DEFS_MAX) { if (!memo.trop) marche.refuser(REFUS_MOTIFS.nombreux); memo.trop = true; return null; }
  // Une matrice qui n'est qu'une translation deplace la tuile (le contenu la suit), comme `transformerMotif` le fait.
  const motif: Motif = estTranslation(matrice)
    ? { genre: 'motif', x: x + matrice[4], y: y + matrice[5], l, h, contenu }
    : { genre: 'motif', x, y, l, h, matrice, contenu };
  const r: PeintureResolue = { peinture: motif, repli: couleurDeRepliMotif(contenu) };
  memo.peintures.set(cle, r);
  return r;
}

/** Le contenu d'une tuile, dans son repere (`repere` : le viewBox ou la boite), par la lecture commune des contenus ; null si refuse. */
function lireTuile(porteur: Noeud, repere: Matrice, profondeur: number, marche: Marche): Contenu | null {
  const p = marche.parcours, a = p.analyse;
  const table = p.groupes;
  if (!table) { marche.refuser('un dégradé ou un motif'); return null; }
  const etat = etatContenus(marche);
  // Les enfants heritent de l'endroit ou le <pattern> est ecrit, pas de la forme qu'il peint.
  const chaine = ancetresDe(a, porteur);
  const heritees = chaine.slice().reverse().reduce<Proprietes>((h, x) => heriter(h, proprietesDe(a, x)), {});
  const ctx: Contexte = { m: repere, heritees, opacite: 1, profondeur };
  const lu = lireContenu(marche, etat, table, porteur, () => visiterSousBudget(marche, etat, porteur.enfants, e => marche.visiter(e, ctx), REFUS_MOTIFS.trop), REFUS_MOTIFS.trop);
  if (!lu) return null;
  if (lu.feuilles.some(f => f.image)) { marche.refuser(REFUS_MOTIFS.image); return null; }
  return normaliser<Contenu>(lu.groupes.length ? { formes: lu.feuilles, groupes: Object.fromEntries(parNumero(lu.groupes)) } : { formes: lu.feuilles });
}

function resoudre(url: string, cote: 'remplissage' | 'contour', n: Noeud, pret: Pret, marche: Marche): PeintureResolue | null {
  // La valeur telle qu'elle est ecrite (la lecture des couleurs l'a mise en minuscules, or un identifiant tient a sa casse).
  const brute = (cote === 'remplissage' ? pret.heritees.fill : pret.heritees.stroke) ?? url;
  const ref = lireReference(brute) ?? lireReference(url);
  if (!ref || ref.genre !== 'locale') return null;
  const cible = marche.parcours.analyse.ids.get(ref.id);
  // Tout ce qui n'est pas un <pattern> (un degrade, une reference absente) revient a la fonctionnalite des degrades.
  if (!cible || !estPattern(cible)) return null;
  return lireMotif(cible, n, pret, marche) ?? REFUSEE;
}

// ---------------------------------------------------------------- ecriture

/** `matrix(a b c d e f)` : les composantes lineaires a cinq decimales au moins, les translations a la precision (annexe 2 §5). */
const ecrireMatrice = (m: Matrice, precision: number): string => {
  const k = Math.max(precision, 5);
  return 'matrix(' + [nb(m[0], k), nb(m[1], k), nb(m[2], k), nb(m[3], k), nb(m[4], precision), nb(m[5], precision)].join(' ') + ')';
};

/**
 * Le <pattern> d'un motif, canonique : toujours en unites du plan (tuile et contenu), la tuile a la precision, la matrice seulement si
 * elle n'est pas l'identite une fois ecrite ; puis le contenu, ecrit comme le dessin (ses propres definitions — degrades, decoupes,
 * masques, filtres, motifs imbriques — se deposent avant le <pattern> qui les cite).
 */
function poserMotif(p: Motif, e: ContexteEcriture): string {
  const c = (v: number) => nb(v, e.precision), k = Math.max(e.precision, 5), m = p.matrice;
  // Une matrice qui, ecrite, n'est qu'une translation se plie dans la tuile (le contenu suit la tuile) : la forme canonique.
  const translation = !m || (nb(m[0], k) === '1' && nb(m[1], k) === '0' && nb(m[2], k) === '0' && nb(m[3], k) === '1');
  const x = p.x + (m && translation ? m[4] : 0), y = p.y + (m && translation ? m[5] : 0);
  const attributs = ' patternUnits="userSpaceOnUse" x="' + c(x) + '" y="' + c(y) + '" width="' + c(p.l) + '" height="' + c(p.h) + '"'
    + (m && !translation ? ' patternTransform="' + ecrireMatrice(m, e.precision) + '"' : '');
  return e.definitions.poser({ genre: 'p', balise: 'pattern', attributs, enfants: e.contenu(p.contenu) });
}

const posees = new WeakMap<Recueil, Map<Motif, string>>();
/** L'identifiant d'un motif dans le recueil de cette ecriture : ecrit une fois, cite ensuite (mille formes au meme motif). */
function idMotif(p: Motif, e: ContexteEcriture): string {
  let t = posees.get(e.definitions);
  if (!t) { t = new Map(); posees.set(e.definitions, t); }
  let id = t.get(p);
  if (id === undefined) { id = poserMotif(p, e); t.set(p, id); }
  return id;
}

const peintes = new WeakMap<Forme, { readonly r: string | null; readonly c: string | null; readonly x: Forme }>();
/** La forme repeinte en `url(#…)`, memorisee par forme : l'ecriture plate garde alors son cache par forme d'une ecriture a l'autre. */
function repeinte(f: Forme, r: string | null, c: string | null): Forme {
  const deja = peintes.get(f);
  if (deja && deja.r === r && deja.c === c) return deja.x;
  const x: Forme = { ...f, ...(r ? { remplissage: 'url(#' + r + ')' } : {}), ...(c ? { contour: 'url(#' + c + ')' } : {}) };
  peintes.set(f, { r, c, x });
  return x;
}

export const motifs: Fonctionnalite = {
  nom: 'motifs',
  lecture: { peinture: resoudre },
  ecriture: {
    peindreFeuille(f, e) {
      const pr = estMotif(f.peintureRemplissage) ? f.peintureRemplissage : null, pc = estMotif(f.peintureContour) ? f.peintureContour : null;
      if (!pr && !pc) return f;
      const r = pr ? idMotif(pr, e) : null;
      const c = pc ? idMotif(pc, e) : null;
      return repeinte(f, r, c);
    }
  },
  transformation: {
    feuille(f, m) {
      const pr = estMotif(f.peintureRemplissage) ? f.peintureRemplissage : null, pc = estMotif(f.peintureContour) ? f.peintureContour : null;
      if (!pr && !pc) return f;
      const r = pr ? transformerMotif(pr, m) : null;
      // Un meme motif au fond et au trait reste un seul objet (une seule definition ecrite).
      const c = pc ? (pc === pr ? r : transformerMotif(pc, m)) : null;
      if (r === pr && c === pc) return f;
      return { ...f, ...(r ? { peintureRemplissage: r } : {}), ...(c ? { peintureContour: c } : {}) };
    }
  }
};
