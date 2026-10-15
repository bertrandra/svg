// Le texte converti en formes (ADR-0004) : chaque lettre devient un chemin, a partir des contours de
// sa glyphe. Le lecteur de fonte vit cote io/ ; ici, seulement la mise en ligne (avances, crenage,
// interlettrage) et la conversion des commandes de glyphe en chemin, pures et deterministes. Le SVG
// ecrit ne contient jamais de <text>.

import { boiteChemin, prochainId, type Chemin, type Commande, type DessinSvg, type Forme, type Style } from './editionSvg.js';

/** Une commande de contour telle qu'un lecteur de fonte la rend (M, L, C, Q, Z, en absolu). */
export interface CommandeGlyphe { type: 'M' | 'L' | 'C' | 'Q' | 'Z'; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }

/** Ce que l'on demande a la fonte pour chaque caractere : son contour a une taille et une position, et son avance. */
export interface Glyphes {
  unitesParEm: number;
  /** Les commandes du contour du caractere, pose en (x, y) sur la ligne de base, a la taille donnee. */
  contour(caractere: string, x: number, y: number, taille: number): CommandeGlyphe[];
  /** L'avance du caractere, en unites de la fonte. */
  avance(caractere: string): number;
  /** Le crenage entre deux caracteres, en unites de la fonte. */
  crenage(gauche: string, droite: string): number;
}

export interface OptionsTexte { taille: number; interlettrage?: number; interligne?: number; x?: number; y?: number }

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
  return out;
}

export interface Lettre { caractere: string; d: Chemin }

/**
 * Met un texte en lettres : une forme par caractere visible, les espaces avancent sans forme, un
 * retour a la ligne descend d'un interligne. Les lettres se suivent par leur avance et leur crenage.
 */
export function composer(texte: string, glyphes: Glyphes, options: OptionsTexte): Lettre[] {
  const taille = options.taille, k = taille / glyphes.unitesParEm;
  const interlettrage = (options.interlettrage ?? 0) * taille, interligne = (options.interligne ?? 1.2) * taille;
  let x = options.x ?? 0, y = options.y ?? 0;
  const lettres: Lettre[] = [];
  let precedent: string | null = null;
  for (const ch of [...texte]) {
    if (ch === '\n') { x = options.x ?? 0; y += interligne; precedent = null; continue; }
    if (precedent !== null) x += glyphes.crenage(precedent, ch) * k;
    if (!/\s/.test(ch)) {
      const d = cheminDeGlyphe(glyphes.contour(ch, x, y, taille));
      if (d.some(c => c.c !== 'M' && c.c !== 'Z')) lettres.push({ caractere: ch, d });
    }
    x += glyphes.avance(ch) * k + interlettrage;
    precedent = ch;
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
