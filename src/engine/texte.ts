// Le texte converti en formes (ADR-0004) : chaque lettre devient un chemin, a partir des contours de
// sa glyphe. Le lecteur de fonte vit cote io/ ; ici, seulement la mise en ligne (avances, crenage,
// interlettrage) et la conversion des commandes de glyphe en chemin, pures et deterministes. Le SVG
// ecrit ne contient jamais de <text>.

import { ancre, boiteChemin, prochainId, type Chemin, type Commande, type DessinSvg, type Forme, type Style } from './editionSvg.js';
import { au } from '../util/tableaux.js';

/** Une commande de contour telle qu'un lecteur de fonte la rend (M, L, C, Q, Z, en absolu). */
export interface CommandeGlyphe { type: 'M' | 'L' | 'C' | 'Q' | 'Z'; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }

/**
 * Ce que l'on demande a la fonte pour chaque caractere : son contour a une taille et une position, et son avance.
 * « Caractere » est ici une chaine d'un seul caractere, ou, pour une ligature, la chaine de tous ceux qu'elle
 * remplace (« fi ») : `contour`, `avance` et `crenage` la prennent alors pour une seule glyphe.
 */
export interface Glyphes {
  unitesParEm: number;
  /** Les commandes du contour du caractere, pose en (x, y) sur la ligne de base, a la taille donnee. */
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
}

export interface OptionsTexte {
  taille: number;
  interlettrage?: number;
  interligne?: number;
  x?: number;
  y?: number;
  /**
   * Remplacer par leur ligature les caracteres que la fonte lie (« fi », « fl »…) : une seule forme, l'avance de la
   * glyphe de ligature. Absent ou faux : une forme par caractere, comme avant (c'est ce qui garde chaque SVG deja ecrit).
   * Sans effet avec un interlettrage non nul (un texte espace ne se lie pas, comme en CSS) ou une fonte sans ligature.
   */
  ligatures?: boolean;
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

export interface Lettre{ caractere: string; d: Chemin }

/**
 * Combien de caracteres, a partir de `i`, se lient en une glyphe : 0 sans ligature, et 0 si la ligature enjambe un
 * blanc ou un retour a la ligne (une ligature ne traverse jamais deux mots).
 */
function tailleLigature(glyphes: Glyphes, cars: readonly string[], i: number): number {
  const n = glyphes.ligature?.(cars, i) ?? 0;
  return n >= 2 && !cars.slice(i, i + n).some(c => /\s/.test(c)) ? n : 0;
}

/**
 * Met un texte en lettres : une forme par caractere visible, les espaces avancent sans forme, un
 * retour a la ligne descend d'un interligne. Les lettres se suivent par leur avance et leur crenage. Avec
 * `ligatures`, des caracteres que la fonte lie ne font qu'une forme ; le crenage se calcule alors avec la
 * glyphe de ligature, des deux cotes.
 */
export function composer(texte: string, glyphes: Glyphes, options: OptionsTexte): Lettre[] {
  const taille = options.taille, k = taille / glyphes.unitesParEm;
  const interlettrage = (options.interlettrage ?? 0) * taille, interligne = (options.interligne ?? 1.2) * taille;
  const lier = options.ligatures === true && glyphes.ligature !== undefined && interlettrage === 0;
  let x = options.x ?? 0, y = options.y ?? 0;
  const lettres: Lettre[] = [];
  let precedent: string | null = null;
  const cars = [...texte];
  for (let i = 0; i < cars.length;) {
    const ch = au(cars, i);
    if (ch === '\n') { x = options.x ?? 0; y += interligne; precedent = null; i++; continue; }
    const n = lier ? tailleLigature(glyphes, cars, i) : 0;
    const groupe = n ? cars.slice(i, i + n).join('') : ch;
    if (precedent !== null) x += glyphes.crenage(precedent, groupe) * k;
    if (!/\s/.test(ch)) {
      const d = cheminDeGlyphe(glyphes.contour(groupe, x, y, taille));
      if (d.some(c => c.c !== 'M' && c.c !== 'Z')) lettres.push({ caractere: groupe, d });
    }
    x += glyphes.avance(groupe) * k + interlettrage;
    precedent = groupe;
    i += n || 1;
  }
  return lettres;
}

/** Ajoute les lettres au dessin, au premier plan, avec le style donne ; rend les identifiants. */
export function ajouterTexte(dessin: DessinSvg, lettres: readonly Lettre[], style: Style): { dessin: DessinSvg; ids: string[] } {
  let n = prochainId(dessin);
  const ids: string[] = [];
  const formes: Forme[] = lettres.filter(l => boiteChemin(l.d)).map(l => {
    const id = 'f' + n++;
    ids.push(id);
    const contour = style.contour, remplissage = style.remplissage ?? (contour ? null : '#000000');
    return { id, d: l.d, remplissage, contour, epaisseur: contour ? style.epaisseur || 1 : 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false };
  });
  return { dessin: formes.length ? { ...dessin, formes: [...dessin.formes, ...formes] } : dessin, ids };
}
