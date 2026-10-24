// Ouvrir une forme de la bibliotheque comme un nouveau dessin : le dessin garde la provenance de la forme
// (CC BY 3.0 de game-icons.net), donc tout ce qu'on en ecrit ensuite porte la mention. Le texte rendu est le SVG
// que l'editeur ecrirait lui-meme, pas celui de la bibliotheque : c'est ainsi que la mention arrive jusqu'aux
// exports faits depuis la page, qui relisent le SVG sans passer par l'editeur.

import { ecrireDessin, lireDessin, marquerOrigine } from '../engine/editionSvg.js';
import { origineDeBibliotheque } from '../model/credits.js';

/** Le SVG de la forme `id` de la bibliotheque, credite ; le SVG tel quel si la lecture le refusait (cela ne s'est jamais vu : un test lit les 4 000 formes). */
export function svgDeBibliotheque(id: string, svg: string): string {
  const lu = lireDessin(svg);
  return 'erreur' in lu ? svg : ecrireDessin(marquerOrigine(lu.dessin, origineDeBibliotheque(id)), 3);
}
