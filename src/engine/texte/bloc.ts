// La composition d'un texte vivant (ADR-0022) : des lignes, alignees sur l'origine, l'une sous l'autre d'un interligne.
// Chaque ligne est composee par `composer` (engine/texte.ts), sans rien y changer : memes avances, meme crenage, memes
// ligatures. Pur et deterministe ; la fonte arrive par l'interface `Glyphes`, chargee cote io/.

import { transformerChemin, type Chemin, type Commande, type TexteVivant } from '../editionSvg.js';
import { composerEtMesurer, type Glyphes, type Lettre } from '../texte.js';
import { naturePolice } from '../../model/polices.js';
import { glyphesMedians } from './mediane.js';

/** Ce que la composition lit d'un texte vivant : tout sauf sa police (deja chargee en glyphes) et sa matrice. */
export type ReglagesBloc = Pick<TexteVivant, 'texte' | 'taille' | 'interlettrage' | 'interligne' | 'alignement' | 'ligatures'>;

const decaler = (d: Chemin, dx: number): Commande[] => (dx === 0 ? [...d] : d.map(c => ({ c: c.c, p: c.p.map((v, i) => (i % 2 === 0 ? Number((v + dx).toFixed(3)) : v)) })));

/**
 * Le decalage d'une ligne selon l'alignement : 0 a gauche, la moitie de sa largeur au centre, toute sa largeur a droite. La
 * largeur est l'avance de ses caracteres (`fin`, ou s'arrete la plume), sans l'interlettrage qui suivrait le dernier. Le
 * curseur de saisie (texte/curseur.ts) le reprend : il tombe ainsi exactement entre les lettres composees.
 */
export function decalageLigne(t: Pick<ReglagesBloc, 'taille' | 'interlettrage' | 'alignement'>, ligne: string, fin: number): number {
  const largeur = ligne.length ? fin - t.interlettrage * t.taille : 0;
  return t.alignement === 'centre' ? -largeur / 2 : t.alignement === 'droite' ? -largeur : 0;
}

/**
 * Les lettres d'un texte, dans le repere de composition : la premiere ligne de base passe par l'origine, chaque ligne
 * suivante descend d'un interligne ; une ligne alignee a gauche commence a l'origine, centree s'y centre, a droite y finit.
 * La largeur d'une ligne est l'avance de ses caracteres, sans l'interlettrage qui suivrait le dernier.
 */
export function composerBloc(t: ReglagesBloc, glyphes: Glyphes): Lettre[] {
  const lettres: Lettre[] = [];
  t.texte.split('\n').forEach((ligne, i) => {
    const r = composerEtMesurer(ligne, glyphes, { taille: t.taille, interlettrage: t.interlettrage, ligatures: t.ligatures, x: 0, y: i * t.interligne * t.taille });
    const dx = decalageLigne(t, ligne, r.fin);
    for (const l of r.lettres) lettres.push({ caractere: l.caractere, d: decaler(l.d, dx) });
  });
  return lettres;
}

/**
 * Les glyphes qui dessinent un texte : celles de sa police, ou, en trace « median » (ADR-0027), leur ligne au milieu du trait
 * (texte/mediane.ts). Une police a trait unique a deja sa ligne : elle se dessine telle quelle.
 */
export const glyphesDuTexte = (t: Pick<TexteVivant, 'police' | 'trace'>, glyphes: Glyphes): Glyphes =>
  (t.trace === 'median' && naturePolice(t.police.id) !== 'trait' ? glyphesMedians(glyphes) : glyphes);

/** Les lettres d'un texte vivant posees dans le plan, par sa matrice : une par caractere visible (ou par ligature). */
export function lettresDuTexte(t: TexteVivant, glyphes: Glyphes): Lettre[] {
  return composerBloc(t, glyphesDuTexte(t, glyphes)).map(l => ({ caractere: l.caractere, d: transformerChemin(l.d, t.matrice) }));
}

/** Les contours d'un texte vivant dans le plan : ses lettres mises bout a bout, en un seul chemin (vide si rien ne se dessine). */
export const cheminDuTexte = (t: TexteVivant, glyphes: Glyphes): Commande[] => lettresDuTexte(t, glyphes).flatMap(l => l.d);
