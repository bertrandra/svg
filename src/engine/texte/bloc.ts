// La composition d'un texte vivant (ADR-0021) : des lignes, alignees sur l'origine, l'une sous l'autre d'un interligne.
// Chaque ligne est composee par `composer` (engine/texte.ts), sans rien y changer : memes avances, meme crenage, memes
// ligatures. Pur et deterministe ; la fonte arrive par l'interface `Glyphes`, chargee cote io/.

import { transformerChemin, type Chemin, type Commande, type TexteVivant } from '../editionSvg.js';
import { composerEtMesurer, type Glyphes, type Lettre } from '../texte.js';

/** Ce que la composition lit d'un texte vivant : tout sauf sa police (deja chargee en glyphes) et sa matrice. */
export type ReglagesBloc = Pick<TexteVivant, 'texte' | 'taille' | 'interlettrage' | 'interligne' | 'alignement' | 'ligatures'>;

const decaler = (d: Chemin, dx: number): Commande[] => (dx === 0 ? [...d] : d.map(c => ({ c: c.c, p: c.p.map((v, i) => (i % 2 === 0 ? Number((v + dx).toFixed(3)) : v)) })));

/**
 * Les lettres d'un texte, dans le repere de composition : la premiere ligne de base passe par l'origine, chaque ligne
 * suivante descend d'un interligne ; une ligne alignee a gauche commence a l'origine, centree s'y centre, a droite y finit.
 * La largeur d'une ligne est l'avance de ses caracteres, sans l'interlettrage qui suivrait le dernier.
 */
export function composerBloc(t: ReglagesBloc, glyphes: Glyphes): Lettre[] {
  const lettres: Lettre[] = [];
  t.texte.split('\n').forEach((ligne, i) => {
    const r = composerEtMesurer(ligne, glyphes, { taille: t.taille, interlettrage: t.interlettrage, ligatures: t.ligatures, x: 0, y: i * t.interligne * t.taille });
    const largeur = ligne.length ? r.fin - t.interlettrage * t.taille : 0;
    const dx = t.alignement === 'centre' ? -largeur / 2 : t.alignement === 'droite' ? -largeur : 0;
    for (const l of r.lettres) lettres.push({ caractere: l.caractere, d: decaler(l.d, dx) });
  });
  return lettres;
}

/** Les lettres d'un texte vivant posees dans le plan, par sa matrice : une par caractere visible (ou par ligature). */
export function lettresDuTexte(t: TexteVivant, glyphes: Glyphes): Lettre[] {
  return composerBloc(t, glyphes).map(l => ({ caractere: l.caractere, d: transformerChemin(l.d, t.matrice) }));
}

/** Les contours d'un texte vivant dans le plan : ses lettres mises bout a bout, en un seul chemin (vide si rien ne se dessine). */
export const cheminDuTexte = (t: TexteVivant, glyphes: Glyphes): Commande[] => lettresDuTexte(t, glyphes).flatMap(l => l.d);
