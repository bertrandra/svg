// Des glyphes aux formes du dessin a plat (ADR-0004, ADR-0020) : le contour d'une glyphe, lu par une fonte cote io/, devient
// un chemin, pose par une matrice dans le repere du dessin. Partage par le texte compose dans l'editeur (engine/texte.ts), le
// texte d'un SVG lu (texteSvg.ts) et celui d'un PDF (engine/pdf) : une lettre, une forme ; jamais de <text> dans un SVG ecrit.

import type { Commande, Forme, Matrice } from './types.js';
import { ancre } from './chemins.js';
import { multiplier, transformerChemin } from './geometrie.js';

/** Une commande de contour telle qu'un lecteur de fonte la rend (M, L, C, Q, Z, en absolu). */
export interface CommandeGlyphe { type: 'M' | 'L' | 'C' | 'Q' | 'Z'; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }

/**
 * Ce que l'on demande a la fonte pour chaque caractere : son contour a une taille et une position, et son avance.
 * « Caractere » est ici une chaine d'un seul caractere, ou, pour une ligature, la chaine de tous ceux qu'elle
 * remplace (« fi ») : `contour`, `avance` et `crenage` la prennent alors pour une seule glyphe.
 */
export interface Glyphes {
  unitesParEm: number;
  /** Les commandes du contour du caractere, pose en (x, y) sur la ligne de base, a la taille donnee (Y vers le bas). */
  contour(caractere: string, x: number, y: number, taille: number): CommandeGlyphe[];
  /** L'avance du caractere, en unites de la fonte. */
  avance(caractere: string): number;
  /** Le crenage entre deux caracteres, en unites de la fonte. */
  crenage(gauche: string, droite: string): number;
  /**
   * Facultatif : la fonte sait former des ligatures (elle en porte au moins une). Combien de caracteres de `caracteres`, a
   * partir de `debut`, ne forment qu'une glyphe : au moins 2, ou 0 quand aucune ligature ne s'y applique. Une fonte qui
   * n'en a pas ne definit pas cette methode, ce qui permet a l'interface de ne proposer l'option que pour elle.
   */
  ligature?(caracteres: readonly string[], debut: number): number;
  /** Facultatif : vrai si la fonte a une glyphe pour ce caractere (sinon elle dessinerait sa glyphe « manquante »). */
  possede?(caractere: string): boolean;
}

/**
 * Ferme les contours qui reviennent a leur point de depart sans le dire. opentype.js 2.0 n'emet jamais de
 * Z : un contour finit sur son premier point, et un trait y poserait deux bouts en capuchon au lieu d'une
 * jointure. Un dernier segment droit qui retombe sur le depart est retire : le Z le trace a sa place. Un
 * contour deja ferme, ou qui ne revient pas a son depart, reste tel quel.
 */
function fermerContours(chemin: readonly Commande[]): Commande[] {
  const out: Commande[] = [];
  let debut = 0;
  const clore = (fin: number) => {
    const contour = out.slice(debut, fin), premier = contour[0], dernier = contour[contour.length - 1];
    if (!premier || !dernier || premier.c !== 'M' || contour.length < 3 || dernier.c === 'Z') return;
    const a = ancre(premier), b = ancre(dernier);
    if (!a || !b || a[0] !== b[0] || a[1] !== b[1]) return;
    if (dernier.c !== 'L') out.splice(fin, 0, { c: 'Z', p: [] });
    else if (contour.length >= 4) out.splice(fin - 1, 1, { c: 'Z', p: [] });
  };
  for (const c of chemin) {
    if (c.c === 'M') { clore(out.length); debut = out.length; }
    out.push(c);
  }
  clore(out.length);
  return out;
}

/** Un chemin a partir des commandes d'une glyphe ; les valeurs manquantes valent 0. */
export function cheminDeGlyphe(commandes: readonly CommandeGlyphe[], precision = 3): Commande[] {
  const n = (v: number | undefined) => Number((v ?? 0).toFixed(precision));
  const out: Commande[] = [];
  for (const c of commandes) {
    if (c.type === 'Z') out.push({ c: 'Z', p: [] });
    else if (c.type === 'C') out.push({ c: 'C', p: [n(c.x1), n(c.y1), n(c.x2), n(c.y2), n(c.x), n(c.y)] });
    else if (c.type === 'Q') out.push({ c: 'Q', p: [n(c.x1), n(c.y1), n(c.x), n(c.y)] });
    else out.push({ c: c.type, p: [n(c.x), n(c.y)] });
  }
  return fermerContours(out);
}

/**
 * Une source de contours : une fonte de remplacement (par caractere) ou le programme de fonte d'un PDF (par numero de glyphe).
 * `contour` rend le contour en unites de la fonte, origine sur la ligne de base, Y vers le bas ; null pour une glyphe absente.
 */
export interface SourceContours {
  readonly unitesParEm: number;
  contour(cle: string | number): readonly CommandeGlyphe[] | null;
}

/** La source de contours d'une fonte par caractere (l'interface `Glyphes`) ; une glyphe que la fonte n'a pas vaut null. */
export const sourceDeGlyphes = (g: Glyphes): SourceContours => ({
  unitesParEm: g.unitesParEm,
  contour: cle => (typeof cle !== 'string' || (g.possede && !g.possede(cle)) ? null : g.contour(cle, 0, 0, g.unitesParEm))
});

/** Une glyphe a poser : sa cle dans la source, et la matrice qui porte son em (1 = la taille du texte, Y vers le bas) dans le dessin. */
export interface GlypheAPoser { readonly cle: string | number; readonly m: Matrice }

/** L'inclinaison d'une italique synthetique (12 degres, celle des navigateurs), dans le repere de l'em, Y vers le bas. */
export const PENCHE: Matrice = [1, 0, -Math.tan((12 * Math.PI) / 180), 1, 0, 0];

/** Le style des formes d'un texte : tout ce qu'une forme porte, sauf son identifiant et son trace. */
export type StyleGlyphes = Omit<Forme, 'id' | 'd' | 'regle' | 'visible' | 'verrouille'>;

/**
 * Les formes de glyphes posees : une par glyphe qui dessine quelque chose (un espace avance sans forme). `manquantes` compte les
 * glyphes que la source n'a pas. Les contours se lisent a la taille de l'em de la fonte (des unites entieres le plus souvent),
 * arrondis au millieme, puis se posent par la matrice : le meme texte, la meme fonte, les memes octets.
 */
export function formesDeGlyphes(poses: readonly GlypheAPoser[], source: SourceContours, style: StyleGlyphes, idDe: (rang: number) => string): { formes: Forme[]; manquantes: number } {
  const formes: Forme[] = [];
  let manquantes = 0;
  const k = 1 / (source.unitesParEm || 1000);
  for (const g of poses) {
    const commandes = source.contour(g.cle);
    if (!commandes) { manquantes++; continue; }
    // Un segment nul juste apres un deplacement (opentype.js en pose un au debut de chaque contour TrueType) ne dessine rien.
    const d = cheminDeGlyphe(commandes).filter((c, i, t) => !(c.c === 'L' && t[i - 1]?.c === 'M' && c.p[0] === t[i - 1]?.p[0] && c.p[1] === t[i - 1]?.p[1]));
    if (!d.some(c => c.c !== 'M' && c.c !== 'Z')) continue;
    const posee = transformerChemin(d, multiplier(g.m, [k, 0, 0, k, 0, 0]));
    formes.push({ id: idDe(formes.length), d: posee, ...style, regle: 'nonzero', visible: true, verrouille: false });
  }
  return { formes, manquantes };
}
