// Couper et recoller des chemins : casser un tracé en un nœud, joindre deux tracés ouverts par leurs
// bouts (ou fermer un tracé ouvert), inverser le sens d'un tracé, retirer un nœud sans changer la courbe.
// Chaque operation est pure et rend un nouveau dessin, ou le meme quand rien ne change.

import type { Chemin, Commande, DessinSvg, Forme } from './types.js';
import { ancre, depart } from './chemins.js';
import { sousChemin, surChemin } from './points.js';
import { prochainId, surFormes } from './operations.js';
import { ajusterCubiques } from './ajustement.js';
import { fois, moins, norme, plus, type Pt } from './vecteurs.js';
import { couper, evaluer, tangente, type Seg } from './filet.js';

const pt = (c: Commande, k: number): Pt => [c.p[k] ?? 0, c.p[k + 1] ?? 0];
const memePoint = (a: Pt, b: Pt) => norme(moins(a, b)) < 1e-6;

/** Les sous-chemins d'un chemin, chacun avec son M. */
function decouper(d: Chemin): Commande[][] {
  const r: Commande[][] = [];
  for (const c of d) {
    if (c.c === 'M' || !r.length) r.push([]);
    r[r.length - 1]?.push(c);
  }
  return r;
}

const estFerme = (s: readonly Commande[]) => s.some(c => c.c === 'Z');
/** L'ancre de depart et d'arrivee d'un sous-chemin (l'arrivee ignore les Z). */
const bouts = (s: readonly Commande[]): [Pt, Pt] => {
  const premier = s[0], dernier = [...s].reverse().find(c => c.c !== 'Z');
  const a = premier ? ancre(premier) : null, b = dernier ? ancre(dernier) : null;
  return [a ?? [0, 0], b ?? a ?? [0, 0]];
};

// ---------------------------------------------------------------- inverser

/** Un sous-chemin parcouru a l'envers : meme trace, autre sens. Un Z reste a la fin ; deux inversions rendent le chemin d'origine. */
function inverserSous(s: readonly Commande[]): Commande[] {
  const dernier = s.length - 1;
  const ferme = s[dernier]?.c === 'Z';
  // Un Z au milieu (un trace apres la fermeture) ne se renverse pas simplement : on le laisse tel quel.
  if (s.slice(0, ferme ? -1 : undefined).some(c => c.c === 'Z')) return [...s];
  const corps = ferme ? s.slice(0, -1) : s;
  const ancres: Pt[] = corps.map(c => ancre(c) ?? [0, 0]);
  const fin = ancres[ancres.length - 1];
  if (!fin || corps.length < 2) return [...s];
  const sortie: Commande[] = [{ c: 'M', p: [fin[0], fin[1]] }];
  for (let k = corps.length - 1; k >= 1; k--) {
    const c = corps[k], vers = ancres[k - 1];
    if (!c || !vers) continue;
    if (c.c === 'C') sortie.push({ c: 'C', p: [c.p[2] ?? 0, c.p[3] ?? 0, c.p[0] ?? 0, c.p[1] ?? 0, vers[0], vers[1]] });
    else if (c.c === 'Q') sortie.push({ c: 'Q', p: [c.p[0] ?? 0, c.p[1] ?? 0, vers[0], vers[1]] });
    else sortie.push({ c: 'L', p: [vers[0], vers[1]] });
  }
  if (ferme) sortie.push({ c: 'Z', p: [] });
  return sortie;
}

/** Le chemin parcouru a l'envers, sous-chemin par sous-chemin. */
export const inverserChemin = (d: Chemin): Chemin => decouper(d).flatMap(inverserSous);

/** Inverse le sens du trace des formes choisies (deverrouillees). */
export function inverserSens(dessin: DessinSvg, ids: readonly string[]): DessinSvg {
  return surFormes(dessin, ids, f => (f.verrouille ? f : { ...f, d: inverserChemin(f.d) }));
}

// ---------------------------------------------------------------- casser

export const MSG_BOUT_NE_SE_CASSE_PAS = 'Un bout du tracé ne se casse pas : choisissez un point du milieu.';

/** Un tracé ferme, rouvert en son nœud `local` (indice dans le sous-chemin) : un seul tracé ouvert qui part du nœud et y revient. */
function ouvrirBoucle(s: readonly Commande[], local: number): Commande[] {
  const corps = s.filter(c => c.c !== 'Z'), [debut, fin] = bouts(corps);
  // Sans retour explicite au depart, la fermeture est une droite qu'il faut ecrire.
  const boucle: Commande[] = memePoint(debut, fin) ? [...corps] : [...corps, { c: 'L', p: [debut[0], debut[1]] }];
  const dernier = boucle.length - 1;
  if (local === 0 || local === dernier) return boucle;
  const noeud = ancre(boucle[local] ?? { c: 'Z', p: [] }) ?? debut;
  return [{ c: 'M', p: [noeud[0], noeud[1]] }, ...boucle.slice(local + 1), ...boucle.slice(1, local + 1)];
}

/**
 * Casse le sous-chemin du nœud `i` en ce nœud. Un tracé ouvert donne deux tracés ouverts (le nœud est le
 * bout de chacun) ; un tracé ferme donne un tracé ouvert dont les deux bouts sont ce nœud. `avant` et `apres`
 * sont les sous-chemins d'origine qui precedent et suivent celui qu'on casse.
 */
export function casserEnNoeud(d: Chemin, i: number): { avant: Chemin; morceaux: Chemin[]; apres: Chemin } | { erreur: string } {
  const c = d[i], point = c ? ancre(c) : null;
  if (!c || !point) return { erreur: 'Choisissez un point à casser.' };
  const [a, b] = sousChemin(d, i), sous = d.slice(a, b), local = i - a;
  const avant = d.slice(0, a), apres = d.slice(b);
  if (estFerme(sous)) return { avant, morceaux: [ouvrirBoucle(sous, local)], apres };
  if (local === 0 || local === sous.length - 1) return { erreur: MSG_BOUT_NE_SE_CASSE_PAS };
  return { avant, morceaux: [sous.slice(0, local + 1), [{ c: 'M', p: [point[0], point[1]] }, ...sous.slice(local + 1)]], apres };
}

/**
 * Casse la forme `id` au nœud `i`. La premiere partie garde la forme (et ses autres sous-chemins) ; la seconde
 * devient une forme neuve juste au-dessus, de meme style. Rend les identifiants des morceaux.
 */
export function casserForme(dessin: DessinSvg, id: string, i: number): { dessin: DessinSvg; ids: string[] } | { erreur: string } {
  const forme = dessin.formes.find(f => f.id === id);
  if (!forme || forme.verrouille) return { erreur: 'Cette forme est verrouillée : déverrouillez-la pour la casser.' };
  const r = casserEnNoeud(forme.d, i);
  if ('erreur' in r) return r;
  const [premier, second] = r.morceaux;
  if (!premier) return { erreur: MSG_BOUT_NE_SE_CASSE_PAS };
  const principale: Forme = { ...forme, d: [...r.avant, ...premier, ...r.apres] };
  if (!second) return { dessin: { ...dessin, formes: dessin.formes.map(f => (f === forme ? principale : f)) }, ids: [id] };
  const neuve: Forme = { ...forme, id: 'f' + prochainId(dessin), d: second };
  return { dessin: { ...dessin, formes: dessin.formes.flatMap(f => (f === forme ? [principale, neuve] : [f])) }, ids: [id, neuve.id] };
}

// ---------------------------------------------------------------- joindre

export const MSG_JOINDRE = 'Choisissez un tracé ouvert à fermer, ou deux tracés ouverts à joindre.';

/** Le tracé ouvert unique d'une forme (un seul sous-chemin, sans Z), ou null. */
const unSeulOuvert = (f: Forme): Commande[] | null => { const s = decouper(f.d); const [un] = s; return s.length === 1 && un && !estFerme(un) && un.length > 1 ? un : null; };

/** Le sous-chemin `b` colle au bout du sous-chemin `a` : un segment droit entre leurs bouts s'ils ne se touchent pas. */
function recoller(a: readonly Commande[], b: readonly Commande[]): Commande[] {
  const [, finA] = bouts(a), [debutB] = bouts(b);
  return [...a, ...(memePoint(finA, debutB) ? [] : [{ c: 'L' as const, p: [debutB[0], debutB[1]] }]), ...b.slice(1)];
}

export interface ResultatJonction {
  readonly dessin: DessinSvg;
  /** La forme qui porte le resultat (null si rien n'a ete fait). */
  readonly id: string | null;
  /** `ferme` : un tracé a ete ferme ; `joint` : deux tracés n'en font plus qu'un. */
  readonly genre?: 'ferme' | 'joint';
  readonly erreur?: string;
}

const rien = (dessin: DessinSvg, erreur: string): ResultatJonction => ({ dessin, id: null, erreur });

/** Ferme tous les sous-chemins ouverts d'une forme : un Z, la droite de fermeture se trace seule. */
function fermerForme(dessin: DessinSvg, f: Forme): ResultatJonction {
  const sous = decouper(f.d);
  if (sous.every(estFerme)) return rien(dessin, 'Ce tracé est déjà fermé.');
  const d = sous.flatMap(s => (estFerme(s) ? s : [...s, { c: 'Z' as const, p: [] }]));
  return { dessin: surFormes(dessin, [f.id], x => ({ ...x, d })), id: f.id, genre: 'ferme' };
}

/**
 * Joint deux tracés ouverts par leurs bouts les plus proches (un segment droit comble l'ecart), ou ferme un
 * seul tracé ouvert. Le resultat prend le style et la place de la forme la plus haute ; l'autre disparait.
 */
export function joindreExtremites(dessin: DessinSvg, ids: readonly string[]): ResultatJonction {
  const voulus = new Set(ids);
  const choisies = dessin.formes.filter(f => voulus.has(f.id) && !f.verrouille);
  const [un, deux, trop] = choisies;
  if (!un || trop) return rien(dessin, MSG_JOINDRE);
  if (!deux) return fermerForme(dessin, un);
  const a = unSeulOuvert(un), b = unSeulOuvert(deux);
  if (!a || !b) return rien(dessin, 'Chaque forme à joindre doit être un seul tracé ouvert.');
  const [da, fa] = bouts(a), [db, fb] = bouts(b);
  const essais = [
    { ecart: norme(moins(fa, db)), d: recoller(a, b) },
    { ecart: norme(moins(fa, fb)), d: recoller(a, inverserSous(b)) },
    { ecart: norme(moins(da, db)), d: recoller(inverserSous(a), b) },
    { ecart: norme(moins(da, fb)), d: recoller(b, a) }
  ];
  const meilleur = essais.reduce((m, e) => (e.ecart < m.ecart ? e : m));
  const haute = deux;
  const unie: Forme = { ...haute, d: meilleur.d };
  return { dessin: { ...dessin, formes: dessin.formes.filter(f => f !== un).map(f => (f === haute ? unie : f)) }, id: unie.id, genre: 'joint' };
}

// ---------------------------------------------------------------- retirer un nœud sans changer la courbe

export const MSG_NOEUD_PORTE = 'Ce point porte la courbe : le retirer la déformerait. « Supprimer le point » le retire et laisse la courbe se refermer.';
export const MSG_TROIS_POINTS = 'Un tracé garde au moins trois points : supprimez plutôt la forme.';

/** Un segment de chemin vu comme `Seg` (une quadratique est elevee en cubique). */
function segDe(a: Pt, c: Commande): Seg {
  if (c.c === 'C') return { droit: false, a, c1: pt(c, 0), c2: pt(c, 2), b: pt(c, 4) };
  if (c.c === 'Q') { const q = pt(c, 0), b = pt(c, 2); return { droit: false, a, c1: plus(a, fois(moins(q, a), 2 / 3)), c2: plus(b, fois(moins(q, b), 2 / 3)), b }; }
  const b = pt(c, 0);
  return { droit: true, a, c1: a, c2: b, b };
}

/** L'ecart du point au segment [p, q]. */
function ecartSegment(p: Pt, a: Pt, b: Pt): number {
  const ab = moins(b, a), l2 = ab[0] * ab[0] + ab[1] * ab[1];
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2)) : 0;
  return norme(moins(p, plus(a, fois(ab, t))));
}

/**
 * Si les deux cubiques sont les deux moities d'une meme cubique (ce que rend « Ajouter un point »), la cubique
 * d'origine : au point de coupe t, les poignees voisines sont dans le rapport t / (1 - t), et les poignees
 * exterieures valent t et (1 - t) fois celles de l'original. On la rend si, recoupee en t, elle redonne les deux.
 */
function fusionExacte(s1: Seg, s2: Seg, tolerance: number): Seg | null {
  const g = norme(moins(s1.b, s1.c2)), d = norme(moins(s2.c1, s2.a));
  if (g + d < 1e-12) return null;
  const t = g / (g + d);
  if (!(t > 1e-3 && t < 1 - 1e-3)) return null;
  const c1 = plus(s1.a, fois(moins(s1.c1, s1.a), 1 / t)), c2 = plus(s2.b, fois(moins(s2.c2, s2.b), 1 / (1 - t)));
  const fusion: Seg = { droit: false, a: s1.a, c1, c2, b: s2.b };
  const [x, y] = couper(fusion, t);
  const proche = (p: Pt, q: Pt) => norme(moins(p, q)) <= tolerance;
  return proche(x.c1, s1.c1) && proche(x.c2, s1.c2) && proche(y.c1, s2.c1) && proche(y.c2, s2.c2) ? fusion : null;
}

/**
 * Retire le nœud `i` de la forme `id` en gardant la courbe : les deux segments qui s'y touchaient sont remplaces
 * par un seul, une droite s'ils sont alignes, sinon une cubique ajustee sur eux a `tolerance` pres. Un nœud
 * qui porte la courbe (coin, ou courbure que seuls deux segments tiennent) se refuse, nomme.
 */
export function supprimerNoeudEnGardantLaCourbe(dessin: DessinSvg, id: string, i: number, tolerance: number): DessinSvg | { erreur: string } {
  const forme = dessin.formes.find(f => f.id === id), c = forme?.d[i], suivante = forme?.d[i + 1];
  if (!forme || !c || !suivante) return dessin;
  if (c.c === 'M' || c.c === 'Z' || suivante.c === 'M' || suivante.c === 'Z') return { erreur: 'Ce point est un départ ou une arrivée : seul un point du milieu se retire en gardant la courbe.' };
  const [a, b] = sousChemin(forme.d, i);
  if (forme.d.slice(a + 1, b).filter(x => x.c !== 'Z').length <= 2) return { erreur: MSG_TROIS_POINTS };
  const p0 = depart(forme.d, i), s1 = segDe(p0, c), s2 = segDe(s1.b, suivante), p3 = s2.b;
  const exacte = !s1.droit && !s2.droit ? fusionExacte(s1, s2, tolerance) : null;
  let fusion: Commande;
  if (s1.droit && s2.droit) {
    if (ecartSegment(s1.b, p0, p3) > tolerance) return { erreur: MSG_NOEUD_PORTE };
    fusion = { c: 'L', p: [p3[0], p3[1]] };
  } else if (exacte) {
    fusion = { c: 'C', p: [exacte.c1[0], exacte.c1[1], exacte.c2[0], exacte.c2[1], p3[0], p3[1]] };
  } else {
    const pas = 48, pts: Pt[] = [];
    for (let k = 0; k <= pas; k++) pts.push(evaluer(s1, k / pas));
    for (let k = 1; k <= pas; k++) pts.push(evaluer(s2, k / pas));
    const pieces = ajusterCubiques(pts, tolerance, tangente(s1, 0), fois(tangente(s2, 1), -1));
    const unique = pieces?.length === 1 ? pieces[0] : undefined;
    if (!unique) return { erreur: MSG_NOEUD_PORTE };
    fusion = { c: 'C', p: [unique.c1[0], unique.c1[1], unique.c2[0], unique.c2[1], p3[0], p3[1]] };
  }
  return surChemin(dessin, id, d => [...d.slice(0, i), fusion, ...d.slice(i + 2)]);
}
