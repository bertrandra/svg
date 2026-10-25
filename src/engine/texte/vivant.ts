// Les operations du texte vivant (ADR-0022) : en creer un, le retaper ou le restyler. Le moteur ne charge aucune fonte :
// l'interface compose (texte/bloc.ts, avec les glyphes que io/polices.ts lui donne) et passe les contours a ces
// operations pures, qui rendent un nouveau dessin, ou le meme quand rien ne change.

import { prochainId, type Chemin, type DessinSvg, type Forme, type Matrice, type Style, type TexteVivant } from '../editionSvg.js';
import type { NaturePolice } from '../../model/polices.js';

/** La peinture d'un texte selon la nature de sa police : un fond pour une police a contour, un trait sans fond pour une police a trait. */
export type PeintureTexte = Pick<Forme, 'remplissage' | 'contour' | 'epaisseur'>;

/**
 * La peinture d'un texte neuf, d'apres le style courant. Une police a contour prend le remplissage (noir faute de mieux) et
 * le contour courants, comme le texte en formes d'avant ; une police a trait se dessine en traces ouverts : aucun fond, le
 * trait a la couleur courante (celle du contour, a defaut celle du remplissage), a l'epaisseur demandee.
 */
export function peintureDuTexte(nature: NaturePolice, style: Style, largeurTrait: number): PeintureTexte {
  if (nature === 'trait') return { remplissage: null, contour: style.contour ?? style.remplissage ?? '#000000', epaisseur: largeurTrait };
  const contour = style.contour;
  return { remplissage: style.remplissage ?? (contour ? null : '#000000'), contour, epaisseur: contour ? style.epaisseur || 1 : 0 };
}

/** Le texte vivant par defaut d'une creation : pose a l'origine, sans interlettrage, interligne 1,2, aligne a gauche. */
export function nouveauTexte(texte: string, police: TexteVivant['police'], taille: number, matrice: Matrice, reglages: Partial<Pick<TexteVivant, 'interlettrage' | 'interligne' | 'alignement' | 'ligatures'>> = {}): TexteVivant {
  return { texte, police, taille, interlettrage: 0, interligne: 1.2, alignement: 'gauche', ligatures: false, ...reglages, matrice };
}

/** Ajoute un texte vivant au premier plan : une seule forme, ses contours composes et de quoi les recomposer. */
export function creerTexte(dessin: DessinSvg, texte: TexteVivant, d: Chemin, peinture: PeintureTexte): { dessin: DessinSvg; id: string | null } {
  if (!d.some(c => c.c !== 'M' && c.c !== 'Z')) return { dessin, id: null };
  const id = 'f' + prochainId(dessin);
  const forme: Forme = { id, d, ...peinture, opacite: 1, texte, regle: 'nonzero', visible: true, verrouille: false };
  return { dessin: { ...dessin, formes: [...dessin.formes, forme] }, id };
}

const memeTexte = (a: TexteVivant, b: TexteVivant): boolean =>
  a.texte === b.texte && a.police.id === b.police.id && a.police.version === b.police.version && a.police.famille === b.police.famille && a.taille === b.taille
  && a.interlettrage === b.interlettrage && a.interligne === b.interligne && a.alignement === b.alignement && a.ligatures === b.ligatures
  && a.matrice.every((v, i) => v === b.matrice[i]);

/**
 * La nouvelle peinture d'un texte dont la police change de nature : vers le trait, le fond devient la couleur du trait (a
 * l'epaisseur donnee) et disparait ; vers le contour, le trait devient le fond. La meme peinture si la nature ne change pas.
 */
export function basculerPeinture(f: Forme, vers: NaturePolice, largeurTrait: number): PeintureTexte {
  const avant: PeintureTexte = { remplissage: f.remplissage, contour: f.contour, epaisseur: f.epaisseur };
  if (vers === 'trait') return f.remplissage === null && f.contour !== null ? avant : { remplissage: null, contour: f.remplissage ?? f.contour ?? '#000000', epaisseur: largeurTrait };
  return f.remplissage !== null ? avant : { remplissage: f.contour ?? '#000000', contour: null, epaisseur: 0 };
}

/**
 * Pose un texte retape ou restyle sur sa forme : le texte, ses contours recomposes, et, quand la police change de nature,
 * la peinture qui va avec. Le meme dessin si la forme n'est pas un texte, est verrouillee, ou ne change pas. Des contours
 * vides (un texte qui ne dessine rien) laissent la forme telle quelle : on ne pose pas une forme invisible.
 */
export function poserTexte(dessin: DessinSvg, id: string, texte: TexteVivant, d: Chemin, peinture?: PeintureTexte): DessinSvg {
  const f = dessin.formes.find(x => x.id === id);
  if (!f?.texte || f.verrouille || !d.some(c => c.c !== 'M' && c.c !== 'Z')) return dessin;
  const p = peinture ?? { remplissage: f.remplissage, contour: f.contour, epaisseur: f.epaisseur };
  if (memeTexte(f.texte, texte) && p.remplissage === f.remplissage && p.contour === f.contour && p.epaisseur === f.epaisseur) return dessin;
  const neuve: Forme = { ...f, ...p, texte, d };
  return { ...dessin, formes: dessin.formes.map(x => (x === f ? neuve : x)) };
}

/** Les textes vivants parmi ces formes (toutes si `ids` est absent), dans l'ordre du dessin. */
export const textesDe = (dessin: DessinSvg, ids?: readonly string[]): Forme[] => dessin.formes.filter(f => f.texte && (!ids || ids.includes(f.id)));
