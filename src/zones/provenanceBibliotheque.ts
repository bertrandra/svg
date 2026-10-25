// Ouvrir une forme de la bibliotheque comme un nouveau dessin : le dessin garde la provenance de la forme
// (CC BY 3.0 de game-icons.net, ou l'origine d'une source libre), donc tout ce qu'on en ecrit ensuite la porte. Le texte rendu est le SVG
// que l'editeur ecrirait lui-meme, pas celui de la bibliotheque : c'est ainsi que la mention arrive jusqu'aux
// exports faits depuis la page, qui relisent le SVG sans passer par l'editeur.

import { ecrireDessin, lireDessin, marquerOrigine } from '../engine/editionSvg.js';
import { origineDeForme } from '../model/credits.js';

/**
 * Le SVG de la forme `id` de la bibliotheque (de la source `source`, game-icons a defaut), avec son origine ; le SVG tel quel
 * si la lecture le refusait (cela ne s'est jamais vu : un test lit toutes les formes de chaque source).
 */
export function svgDeBibliotheque(id: string, svg: string, source?: string): string {
  const lu = lireDessin(svg);
  return 'erreur' in lu ? svg : ecrireDessin(marquerOrigine(lu.dessin, origineDeForme(source, id)), 3);
}
