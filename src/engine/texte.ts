// Le texte converti en formes (ADR-0004) : chaque lettre devient un chemin, a partir des contours de
// sa glyphe. Le lecteur de fonte vit cote io/ ; ici, seulement la mise en ligne (avances, crenage,
// interlettrage) et la conversion des commandes de glyphe en chemin, pures et deterministes. Le SVG
// ecrit ne contient jamais de <text>.

import { boiteChemin, cheminDeGlyphe, prochainId, type Chemin, type DessinSvg, type Forme, type Glyphes, type Style } from './editionSvg.js';
import { au } from '../util/tableaux.js';

// Les glyphes et leur conversion en chemin vivent dans edition/glyphes.ts, partages avec le texte lu d'un SVG ou d'un PDF.
export type { CommandeGlyphe, Glyphes } from './editionSvg.js';
export { cheminDeGlyphe };

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

export interface Lettre{ caractere: string; d: Chemin }

/**
 * Un groupe de caracteres pose d'un coup (un caractere, ou les caracteres d'une ligature) : de quoi placer un curseur de
 * saisie entre deux caracteres sans recomposer (ADR-0027). `debut` compte en points de code dans le texte compose, `x` est
 * l'abscisse ou sa glyphe commence (crenage compris), `avance` sa largeur sans l'interlettrage qui la suit.
 */
export interface GroupeCompose { debut: number; n: number; x: number; avance: number }

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
  return composerEtMesurer(texte, glyphes, options).lettres;
}

/**
 * `composer`, et ou s'arrete la plume : l'abscisse apres le dernier caractere de la derniere ligne, interlettrage compris.
 * Le texte vivant (texte/bloc.ts) s'en sert pour aligner une ligne au centre ou a droite ; les lettres sont exactement
 * celles de `composer`, qui n'en est que l'enveloppe (ses references d'ecriture ne bougent pas).
 */
export function composerEtMesurer(texte: string, glyphes: Glyphes, options: OptionsTexte): { lettres: Lettre[]; fin: number; groupes: GroupeCompose[] } {
  const taille = options.taille, k = taille / glyphes.unitesParEm;
  const interlettrage = (options.interlettrage ?? 0) * taille, interligne = (options.interligne ?? 1.2) * taille;
  const lier = options.ligatures === true && glyphes.ligature !== undefined && interlettrage === 0;
  let x = options.x ?? 0, y = options.y ?? 0;
  const lettres: Lettre[] = [], groupes: GroupeCompose[] = [];
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
    const avance = glyphes.avance(groupe) * k;
    groupes.push({ debut: i, n: n || 1, x, avance });
    x += avance + interlettrage;
    precedent = groupe;
    i += n || 1;
  }
  return { lettres, fin: x, groupes };
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
