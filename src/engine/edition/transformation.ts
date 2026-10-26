// La transformation d'une feuille et d'un groupe par une matrice (ADR-0012, annexe 8, etape 0) : le seul endroit ou une feuille se
// transforme, pour que chaque champ du modele v2 (la matrice d'un degrade, l'ecart d'un flou, le cadre d'une image) suive sa forme
// sans qu'on edite `transformer`, `dupliquer`, `coller` ni `inserer`. Sur une feuille plate, exactement le calcul d'avant.

import type { Forme, Groupe, Matrice } from './types.js';
import { echellerTrait } from './trait.js';
import { facteur, transformerChemin } from './geometrie.js';
import { avecTexteTransforme } from './texteVivant.js';
import type { Fonctionnalite, OutilsTransformation } from './fonctionnalites.js';
import { FONCTIONNALITES } from './catalogue.js';

/**
 * La feuille transformee par `m` : son trace, son trait (a l'echelle `k`, par defaut celle de `m`), son texte vivant, puis les champs
 * v2 de chaque fonctionnalite. Les identifiants, la visibilite et le verrou ne changent pas : a l'appelant de les poser.
 */
export function transformerFeuille(f: Forme, m: Matrice, k = facteur(m), fonctions: readonly Fonctionnalite[] = FONCTIONNALITES): Forme {
  const g: Forme = avecTexteTransforme({ ...echellerTrait(f, k), d: transformerChemin(f.d, m) }, f, m);
  return fonctions.reduce<Forme>((x, c) => c.transformation?.feuille?.(x, m) ?? x, g);
}

/**
 * Le groupe dans la fermeture d'une transformation (annexe 1 §9) : sa decoupe, son masque, ses effets suivent. Le meme sinon. Les
 * feuilles et les groupes d'un contenu imbrique peint (un masque) se transforment par ces memes fonctions (etape 6).
 */
export function transformerGroupe(g: Groupe, m: Matrice, fonctions: readonly Fonctionnalite[] = FONCTIONNALITES): Groupe {
  const outils: OutilsTransformation = { feuille: f => transformerFeuille(f, m, facteur(m), fonctions), groupe: x => transformerGroupe(x, m, fonctions) };
  return fonctions.reduce<Groupe>((x, c) => c.transformation?.groupe?.(x, m, outils) ?? x, g);
}
