// La derniere lecture d'un SVG, gardee. A l'ouverture d'un fichier la page le lit pour verifier qu'il
// s'ouvre, puis pour ses chiffres (formes, points, poids), et l'editeur le lit encore pour son dessin :
// trois lectures du meme texte, 85 ms chacune pour cinq mille formes. `lireDessin` est pur et son
// resultat ne change jamais : relire le meme texte rend le meme dessin, avec ses textes d'ecriture deja
// calcules. On ne garde que la derniere lecture, pour ne pas retenir un dessin que personne ne rouvre.

import { lireDessin } from '../engine/editionSvg.js';

type Lecture = ReturnType<typeof lireDessin>;

let derniere: { svg: string; lecture: Lecture } | null = null;

/** `lireDessin`, sans relire un texte identique a celui qu'on vient de lire. */
export function lireDessinMemo(svg: string): Lecture {
  if (derniere && derniere.svg === svg) return derniere.lecture;
  const lecture = lireDessin(svg);
  derniere = { svg, lecture };
  return lecture;
}
