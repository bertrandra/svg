// Le curseur d'un texte saisi sur la toile (ADR-0027) : ou tombe le curseur entre deux caracteres, ce qu'une selection
// couvre, quel index est sous le pointeur, ou mene une fleche vers le haut ou le bas. Tout se lit dans la composition meme
// (`composerEtMesurer`, le decalage de texte/bloc.ts) : les memes avances, le meme crenage, les memes ligatures, donc un
// curseur exactement entre les lettres dessinees. Pur et deterministe ; le champ de saisie, le DOM et les evenements vivent
// dans zones/SaisieTexte.tsx.
//
// Les index sont ceux d'un champ de texte (unites UTF-16, comme `selectionStart`), pas des points de code : le champ porte
// la selection, le moteur la dessine. Les longueurs sont dans le repere de composition (premiere ligne de base a l'origine,
// Y vers le bas) ; `versPlan` les porte dans le plan par la matrice du texte.

import type { Matrice } from '../editionSvg.js';
import { composerEtMesurer, type Glyphes } from '../texte.js';
import { au } from '../../util/tableaux.js';
import { decalageLigne, type ReglagesBloc } from './bloc.js';

/**
 * La hauteur d'un curseur au-dessus et au-dessous de la ligne de base, en part de la taille : le cadratin d'une fonte
 * ordinaire. L'interface `Glyphes` ne dit ni l'ascendante ni la descendante ; le cadratin suffit a montrer la ligne.
 */
export const HAUT_CURSEUR = 0.8;
export const BAS_CURSEUR = 0.2;
/** La largeur qui montre un retour a la ligne choisi, en part de la taille. */
const LARGEUR_RETOUR = 0.3;

export type PointTexte = readonly [number, number];
export interface RectTexte { readonly x: number; readonly y: number; readonly l: number; readonly h: number }

/** Une ligne du texte : ses index (le premier caractere, et celui qui suit le dernier), sa ligne de base, et l'abscisse du curseur devant chaque index. */
export interface LigneSaisie {
  readonly debut: number;
  readonly fin: number;
  readonly base: number;
  /** De `debut` a `fin` inclus : `fin - debut + 1` abscisses. */
  readonly xs: readonly number[];
}

export interface MiseEnPage {
  readonly lignes: readonly LigneSaisie[];
  readonly taille: number;
  /** La longueur du texte, en unites UTF-16. */
  readonly longueur: number;
}

/**
 * Les lignes d'un texte et l'abscisse du curseur devant chacun de ses caracteres. Un curseur se pose ou la glyphe commence
 * (apres le crenage avec la precedente) ; dans une ligature, il partage son avance a parts egales, comme un navigateur ; en fin
 * de ligne, il tombe a la largeur de la ligne (sans l'interlettrage qui suivrait), celle qui sert a l'aligner.
 */
export function miseEnPage(t: ReglagesBloc, glyphes: Glyphes): MiseEnPage {
  const lignes: LigneSaisie[] = [];
  let debut = 0;
  t.texte.split('\n').forEach((ligne, i) => {
    const r = composerEtMesurer(ligne, glyphes, { taille: t.taille, interlettrage: t.interlettrage, ligatures: t.ligatures, x: 0, y: 0 });
    const dx = decalageLigne(t, ligne, r.fin);
    // L'index UTF-16 de chaque point de code : `composer` compte en points de code, le champ en unites.
    const unites: number[] = [];
    let u = 0;
    for (const c of ligne) { unites.push(u); u += c.length; }
    const xs: Array<number | null> = Array.from({ length: ligne.length + 1 }, () => null);
    for (const g of r.groupes) {
      for (let j = 0; j < g.n; j++) {
        const o = unites[g.debut + j];
        if (o !== undefined) xs[o] = g.x + (g.avance * j) / g.n;
      }
    }
    xs[ligne.length] = ligne.length ? r.fin - t.interlettrage * t.taille : 0;
    // La seconde moitie d'une paire de substitution n'est pas un point de code : son curseur est celui de la premiere.
    const pleines: number[] = [];
    for (const x of xs) pleines.push((x ?? pleines[pleines.length - 1] ?? 0) + dx);
    lignes.push({ debut, fin: debut + ligne.length, base: i * t.interligne * t.taille, xs: pleines });
    debut += ligne.length + 1;
  });
  return { lignes, taille: t.taille, longueur: t.texte.length };
}

const borner = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/** Le rang de la ligne qui porte l'index : la derniere qui commence avant lui (la fin d'une ligne est a elle, pas a la suivante). */
export function ligneDe(m: MiseEnPage, i: number): number {
  let k = 0;
  m.lignes.forEach((l, j) => { if (l.debut <= i) k = j; });
  return k;
}

/** L'abscisse du curseur a cet index (borne au texte). */
export function xAuIndex(m: MiseEnPage, i: number): number {
  const l = au(m.lignes, ligneDe(m, i));
  return au(l.xs, borner(i - l.debut, 0, l.xs.length - 1));
}

/** Le curseur a cet index : un trait vertical, du haut au bas du cadratin de sa ligne. */
export function curseurAuIndex(m: MiseEnPage, i: number): { readonly x: number; readonly y1: number; readonly y2: number } {
  const l = au(m.lignes, ligneDe(m, i));
  return { x: xAuIndex(m, i), y1: l.base - HAUT_CURSEUR * m.taille, y2: l.base + BAS_CURSEUR * m.taille };
}

/** L'index de la ligne dont le curseur est le plus proche de cette abscisse ; a egalite, le premier. */
function indexDansLigne(l: LigneSaisie, x: number): number {
  let meilleur = 0, ecart = Infinity;
  l.xs.forEach((v, j) => { const e = Math.abs(v - x); if (e < ecart) { ecart = e; meilleur = j; } });
  return l.debut + meilleur;
}

/** L'index sous un point du repere de composition : la ligne dont le cadratin est le plus proche, puis le curseur le plus proche. */
export function indexAuPoint(m: MiseEnPage, p: PointTexte): number {
  const milieu = (BAS_CURSEUR - HAUT_CURSEUR) / 2 * m.taille;
  let ligne = au(m.lignes, 0), ecart = Infinity;
  for (const l of m.lignes) { const e = Math.abs(l.base + milieu - p[1]); if (e < ecart) { ecart = e; ligne = l; } }
  return indexDansLigne(ligne, p[0]);
}

/**
 * Ou mene une fleche vers le haut (-1) ou le bas (1) : l'index de la ligne voisine le plus proche de l'abscisse voulue (celle
 * du curseur, ou celle qu'on gardait d'une fleche a l'autre). Au-dela de la premiere ligne, le debut du texte ; de la
 * derniere, sa fin, comme un champ de texte.
 */
export function indexVertical(m: MiseEnPage, i: number, sens: -1 | 1, x: number = xAuIndex(m, i)): number {
  const k = ligneDe(m, i) + sens;
  if (k < 0) return 0;
  if (k >= m.lignes.length) return m.longueur;
  return indexDansLigne(au(m.lignes, k), x);
}

/**
 * Les rectangles d'une selection, un par ligne qu'elle touche, du haut au bas du cadratin. Un retour a la ligne choisi se
 * montre par un peu de largeur apres la fin de sa ligne (une ligne vide choisie se voit aussi).
 */
export function rectanglesSelection(m: MiseEnPage, a: number, b: number): RectTexte[] {
  const debut = Math.min(a, b), fin = Math.max(a, b), r: RectTexte[] = [];
  if (debut === fin) return r;
  const h = (HAUT_CURSEUR + BAS_CURSEUR) * m.taille;
  for (const l of m.lignes) {
    const s = Math.max(debut, l.debut), e = Math.min(fin, l.fin), retour = fin > l.fin && debut <= l.fin;
    if (s > e || (s === e && !retour)) continue;
    const x1 = au(l.xs, s - l.debut), x2 = au(l.xs, e - l.debut) + (retour ? LARGEUR_RETOUR * m.taille : 0);
    r.push({ x: Math.min(x1, x2), y: l.base - HAUT_CURSEUR * m.taille, l: Math.abs(x2 - x1), h });
  }
  return r;
}

/** La boite du texte en saisie, curseurs compris : du curseur le plus a gauche au plus a droite, du haut de la premiere ligne au bas de la derniere. */
export function boiteMiseEnPage(m: MiseEnPage): RectTexte {
  const xs = m.lignes.flatMap(l => l.xs), premiere = au(m.lignes, 0), derniere = au(m.lignes, m.lignes.length - 1);
  const x = Math.min(...xs), y = premiere.base - HAUT_CURSEUR * m.taille;
  return { x, y, l: Math.max(...xs) - x, h: derniere.base + BAS_CURSEUR * m.taille - y };
}

/** Un point du repere de composition porte dans le plan par la matrice du texte. */
export const versPlan = (mat: Matrice, p: PointTexte): PointTexte => [mat[0] * p[0] + mat[2] * p[1] + mat[4], mat[1] * p[0] + mat[3] * p[1] + mat[5]];

/** Un point du plan ramene dans le repere de composition ; null si la matrice ecrase le plan. */
export function depuisPlan(mat: Matrice, p: PointTexte): PointTexte | null {
  const det = mat[0] * mat[3] - mat[1] * mat[2];
  if (Math.abs(det) < 1e-12) return null;
  const x = p[0] - mat[4], y = p[1] - mat[5];
  return [(mat[3] * x - mat[2] * y) / det, (mat[0] * y - mat[1] * x) / det];
}

/** Les quatre coins d'un rectangle de composition dans le plan, dans l'ordre du tour (un polygone, la matrice pouvant tourner). */
export const coinsDansPlan = (mat: Matrice, r: RectTexte): PointTexte[] =>
  ([[r.x, r.y], [r.x + r.l, r.y], [r.x + r.l, r.y + r.h], [r.x, r.y + r.h]] as const).map(p => versPlan(mat, p));

/** Vrai si un point du plan tombe dans la boite du texte, elargie d'une marge (en part de la taille). */
export function dansLeTexte(m: MiseEnPage, mat: Matrice, p: PointTexte, marge = 0.25): boolean {
  const q = depuisPlan(mat, p);
  if (!q) return false;
  const b = boiteMiseEnPage(m), e = marge * m.taille;
  return q[0] >= b.x - e && q[0] <= b.x + b.l + e && q[1] >= b.y - e && q[1] <= b.y + b.h + e;
}

type Genre = 'mot' | 'blanc' | 'retour' | 'autre';
const genreDe = (c: string | undefined): Genre =>
  c === undefined || c === '\n' ? 'retour' : /\s/.test(c) ? 'blanc' : /[\p{L}\p{N}_'’-]/u.test(c) ? 'mot' : 'autre';

/**
 * Le mot sous l'index (un double-clic) : la suite de caracteres du meme genre que celui qui suit le curseur (ou qui le
 * precede, en fin de ligne) : lettres et chiffres, blancs, ou ponctuation. Un retour a la ligne ne se choisit pas : rien.
 */
export function motAutour(texte: string, i: number): readonly [number, number] {
  const j = genreDe(texte[i]) === 'retour' && i > 0 ? i - 1 : i, genre = genreDe(texte[j]);
  if (genre === 'retour') return [i, i];
  let a = j, b = j + 1;
  while (a > 0 && genreDe(texte[a - 1]) === genre) a--;
  while (b < texte.length && genreDe(texte[b]) === genre) b++;
  return [a, b];
}
