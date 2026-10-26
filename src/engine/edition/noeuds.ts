// Les types de nœuds d'un chemin : angle (poignees independantes, ou rentrees), lisse (poignees alignees,
// longueurs libres), symetrique (poignees alignees et de meme longueur). Le type n'est pas une donnee du
// dessin (le SVG n'en porte pas) : il se lit sur la geometrie, et c'est la geometrie qu'on change pour
// en changer. Ce module sait lire les deux cotes d'un nœud (le segment qui y arrive, celui qui en part,
// boucle fermee comprise), nommer son type, le convertir, et deplacer une poignee en entrainant
// l'autre selon le type (le glisser de la souris).

import type { Chemin, Commande, DessinSvg } from './types.js';
import { ancre, depart } from './chemins.js';
import { t } from '../../util/i18n.js';
import { sousChemin, surChemin } from './points.js';
import { fois, moins, norme, plus, unitaire, vectoriel, scalaire, type Pt } from './vecteurs.js';

export type TypeNoeud = 'angle' | 'lisse' | 'symetrique';

/** Un cote d'un nœud : la commande qui le porte (null pour la droite implicite d'un Z), sa poignee si c'est une courbe, et le point voisin sinon. */
export interface Cote {
  readonly cmd: number | null;
  /** La poignee (cubique) ou son equivalent (une quadratique, ramenee au tiers) ; null pour une droite. */
  readonly poignee: Pt | null;
  readonly quadratique: boolean;
  /** Le vecteur du nœud vers la poignee, ou vers le point voisin pour une droite. */
  readonly direction: Pt;
}

export interface Noeud {
  readonly point: Pt;
  readonly entrant: Cote | null;
  readonly sortant: Cote | null;
  /** Null pour une extremite (un seul cote). */
  readonly type: TypeNoeud | null;
}

const pt = (c: Commande, k: number): Pt => [c.p[k] ?? 0, c.p[k + 1] ?? 0];
const memePoint = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

/** L'indice de la derniere commande qui trace dans [a, b[ (celle d'avant les Z). */
function dernierTrace(d: Chemin, a: number, b: number): number {
  let k = b - 1;
  while (k > a && d[k]?.c === 'Z') k--;
  return k;
}

function coteEntrant(d: Chemin, e: number, noeud: Pt): Cote {
  const c = d[e];
  if (c?.c === 'C') { const h = pt(c, 2); return { cmd: e, poignee: h, quadratique: false, direction: moins(h, noeud) }; }
  if (c?.c === 'Q') { const q = pt(c, 0), h = plus(noeud, fois(moins(q, noeud), 2 / 3)); return { cmd: e, poignee: h, quadratique: true, direction: moins(h, noeud) }; }
  return { cmd: e, poignee: null, quadratique: false, direction: moins(depart(d, e), noeud) };
}

function coteSortant(d: Chemin, s: number, noeud: Pt): Cote {
  const c = d[s];
  if (c?.c === 'C') { const h = pt(c, 0); return { cmd: s, poignee: h, quadratique: false, direction: moins(h, noeud) }; }
  if (c?.c === 'Q') { const q = pt(c, 0), h = plus(noeud, fois(moins(q, noeud), 2 / 3)); return { cmd: s, poignee: h, quadratique: true, direction: moins(h, noeud) }; }
  const a = c ? ancre(c) : null;
  return { cmd: s, poignee: null, quadratique: false, direction: a ? moins(a, noeud) : [0, 0] };
}

/** Le type que disent les deux cotes d'un nœud : poignees opposees et alignees, de meme longueur ou non, sinon un angle. */
function typeDe(e: Cote, s: Cote): TypeNoeud {
  const le = norme(e.direction), ls = norme(s.direction);
  if (le < 1e-9 || ls < 1e-9) return 'angle';
  const u = unitaire(e.direction), v = unitaire(s.direction);
  if (scalaire(u, v) >= 0 || Math.abs(vectoriel(u, v)) > 1e-3) return 'angle';
  return e.poignee && s.poignee && Math.abs(le - ls) <= 1e-3 * Math.max(le, ls) ? 'symetrique' : 'lisse';
}

/** Les cotes du nœud porte par la commande `i`, ou null si `i` n'est pas une ancre. */
export function lireNoeud(d: Chemin, i: number): Noeud | null {
  const c = d[i], point = c ? ancre(c) : null;
  if (!c || !point) return null;
  const [a, b] = sousChemin(d, i), fin = dernierTrace(d, a, b);
  const ferme = d.slice(a, b).some(x => x.c === 'Z');
  const debut = ancre(d[a] ?? c) ?? point, dernier = ancre(d[fin] ?? c) ?? point;
  const boucle = ferme && memePoint(debut, dernier);
  const aSuivant = a + 1 <= fin;
  let entrant: Cote | null = null, sortant: Cote | null = null;
  if (i === a || (i === fin && boucle)) {
    if (ferme) entrant = boucle ? coteEntrant(d, fin, debut) : { cmd: null, poignee: null, quadratique: false, direction: moins(dernier, debut) };
    if (aSuivant) sortant = coteSortant(d, a + 1, debut);
  } else if (i === fin) {
    entrant = coteEntrant(d, i, point);
    if (ferme) sortant = { cmd: null, poignee: null, quadratique: false, direction: moins(debut, point) };
  } else {
    entrant = coteEntrant(d, i, point);
    sortant = coteSortant(d, i + 1, point);
  }
  return { point: i === fin && boucle ? debut : point, entrant, sortant, type: entrant && sortant ? typeDe(entrant, sortant) : null };
}

/** Le type du nœud `i` ; null pour une extremite. */
export const typeDeNoeud = (d: Chemin, i: number): TypeNoeud | null => lireNoeud(d, i)?.type ?? null;

/** Vrai si le nœud touche au moins une courbe : sinon il n'a aucune poignee a regler. */
export const aDesPoignees = (d: Chemin, i: number): boolean => { const n = lireNoeud(d, i); return !!n && !!(n.entrant?.poignee || n.sortant?.poignee); };

/** Pose une poignee : `k = 1` la seconde de la cubique qui arrive, `k = 0` la premiere de celle qui part. Une quadratique devient cubique, sans changer de forme. */
function poserPoignee(d: Commande[], cmd: number, k: 0 | 1, p: Pt): void {
  const c = d[cmd];
  if (!c) return;
  if (c.c === 'Q') {
    const dep = depart(d, cmd), q = pt(c, 0), fin = pt(c, 2);
    d[cmd] = { c: 'C', p: [...plus(dep, fois(moins(q, dep), 2 / 3)), ...plus(fin, fois(moins(q, fin), 2 / 3)), fin[0], fin[1]] };
  }
  const x = d[cmd];
  if (x?.c !== 'C') return;
  const q = [...x.p];
  q[2 * k] = p[0]; q[2 * k + 1] = p[1];
  d[cmd] = { c: 'C', p: q };
}

/** Les deux poignees d'un nœud, posees ; rend un nouveau chemin. */
function avecPoignees(d: Chemin, n: Noeud, entrant: Pt | null, sortant: Pt | null): Commande[] {
  const r = [...d];
  if (entrant && n.entrant?.cmd != null && n.entrant.poignee) poserPoignee(r, n.entrant.cmd, 1, entrant);
  if (sortant && n.sortant?.cmd != null && n.sortant.poignee) poserPoignee(r, n.sortant.cmd, 0, sortant);
  return r;
}

// Des cles, evaluees au chargement avant la langue (le francais) ; `t(MSG_X)` les traduit quand on les dit.
export const MSG_EXTREMITE = t('Une extrémité n’a qu’une poignée : il n’y a rien à aligner.');
export const MSG_DROIT = t('Ce point est entre deux segments droits : il n’a pas de poignées à régler.');
export const MSG_SYMETRIE_DROITE = t('Un point voisin d’un segment droit ne peut pas être symétrique : choisissez « Lisse ».');
export const MSG_POIGNEES_RENTREES = t('Les poignées de ce point sont rentrées : tirez-en une pour la sortir, puis alignez-les.');

/**
 * Convertit le nœud `i` : `angle` rentre ses poignees (elles deviennent independantes, a tirer une a une),
 * `lisse` les aligne en gardant leurs longueurs, `symetrique` les aligne a longueur egale. L'axe est la
 * bissectrice des deux poignees ; si un cote est une droite, il la suit. Le meme chemin (meme reference)
 * quand le nœud est deja de ce type.
 */
export function convertirNoeud(d: Chemin, i: number, type: TypeNoeud): { chemin: Chemin } | { erreur: string } {
  const n = lireNoeud(d, i);
  if (!n || !n.entrant || !n.sortant) return { erreur: t(MSG_EXTREMITE) };
  if (!n.entrant.poignee && !n.sortant.poignee) return { erreur: t(MSG_DROIT) };
  // Un nœud symetrique est aussi lisse : le demander ne change rien.
  if (n.type === type || (type === 'lisse' && n.type === 'symetrique')) return { chemin: d };
  const { point, entrant: e, sortant: s } = n;
  if (type === 'angle') return { chemin: avecPoignees(d, n, point, point) };
  const le = e.poignee ? norme(e.direction) : 0, ls = s.poignee ? norme(s.direction) : 0;
  if (type === 'symetrique' && (!e.poignee || !s.poignee)) return { erreur: t(MSG_SYMETRIE_DROITE) };
  if (le < 1e-9 && ls < 1e-9 && e.poignee && s.poignee) return { erreur: t(MSG_POIGNEES_RENTREES) };
  // L'axe, du cote sortant : la droite voisine s'impose ; sinon la moyenne de la sortie et de l'oppose de l'entree.
  let axe: Pt;
  if (!e.poignee) axe = unitaire(fois(e.direction, -1));
  else if (!s.poignee) axe = unitaire(s.direction);
  else {
    const moyen = moins(norme(s.direction) > 1e-9 ? unitaire(s.direction) : [0, 0], norme(e.direction) > 1e-9 ? unitaire(e.direction) : [0, 0]);
    axe = norme(moyen) > 1e-9 ? unitaire(moyen) : unitaire(norme(s.direction) > 1e-9 ? s.direction : fois(e.direction, -1));
  }
  const lg = type === 'symetrique' ? (le + ls) / 2 : null;
  return { chemin: avecPoignees(d, n, e.poignee ? moins(point, fois(axe, lg ?? le)) : null, s.poignee ? plus(point, fois(axe, lg ?? ls)) : null) };
}

/** Convertit le nœud `i` de la forme `id` ; le meme dessin quand rien ne change. */
export function convertirNoeudForme(dessin: DessinSvg, id: string, i: number, type: TypeNoeud): DessinSvg | { erreur: string } {
  const f = dessin.formes.find(x => x.id === id);
  if (!f) return dessin;
  const r = convertirNoeud(f.d, i, type);
  if ('erreur' in r) return r;
  return surChemin(dessin, id, () => r.chemin);
}

/**
 * Deplace la poignee `k` de la commande `i` en (x, y), et entraine l'autre poignee du meme nœud selon son
 * type tel que le dessin de depart le dit : lisse, elle reste alignee et garde sa longueur ; symetrique,
 * alignee et de meme longueur ; angle, ou `rompre`, elle ne bouge pas. Comme le dessin de depart ne change
 * pas pendant un glisser, rompre puis relacher donne a chaque instant l'un ou l'autre.
 */
export function deplacerPoigneeLiee(dessin: DessinSvg, id: string, i: number, k: 0 | 1, x: number, y: number, rompre = false): DessinSvg {
  const f = dessin.formes.find(v => v.id === id), c = f?.d[i];
  if (!f || !c || (c.c !== 'C' && !(c.c === 'Q' && k === 0))) return dessin;
  // Le nœud de la poignee : la fin de la commande pour la seconde poignee, le depart pour la premiere.
  const noeud = k === 1 ? i : i - 1;
  const n = c.c === 'C' ? lireNoeud(f.d, noeud) : null;
  const poignee: Pt = [x, y];
  const cote = n && (k === 1 ? n.entrant : n.sortant), autre = n && (k === 1 ? n.sortant : n.entrant);
  if (rompre || !n || !cote || !autre || cote.cmd !== i || !n.type || n.type === 'angle' || !autre.poignee || autre.cmd === null || autre.quadratique) {
    return surChemin(dessin, id, d => d.map((v, j) => (j === i ? { c: v.c, p: v.p.map((q, m) => (m === 2 * k ? x : m === 2 * k + 1 ? y : q)) } : v)));
  }
  const dir = moins(poignee, n.point), l = norme(dir);
  if (l < 1e-9) return surChemin(dessin, id, d => d.map((v, j) => (j === i ? { c: v.c, p: v.p.map((q, m) => (m === 2 * k ? x : m === 2 * k + 1 ? y : q)) } : v)));
  const longueurAutre = n.type === 'symetrique' ? l : norme(autre.direction);
  const opposee = moins(n.point, fois(unitaire(dir), longueurAutre));
  return surChemin(dessin, id, d => {
    const r = [...d];
    poserPoignee(r, i, k, poignee);
    poserPoignee(r, autre.cmd ?? i, k === 1 ? 0 : 1, opposee);
    return r;
  });
}
