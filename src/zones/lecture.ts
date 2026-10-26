// La derniere lecture d'un SVG, gardee. A l'ouverture d'un fichier la page le lit pour verifier qu'il
// s'ouvre, puis pour ses chiffres (formes, points, poids), et l'editeur le lit encore pour son dessin :
// trois lectures du meme texte, 85 ms chacune pour cinq mille formes. `lireDessin` est pur et son
// resultat ne change jamais : relire le meme texte rend le meme dessin, avec ses textes d'ecriture deja
// calcules. On ne garde que la derniere lecture, pour ne pas retenir un dessin que personne ne rouvre.
// Le modele lu (ADR-0012 : plat ou riche) fait partie de la cle : le meme texte ne se lit pas pareil dans les deux.

import { lireDessin } from '../engine/editionSvg.js';

type Lecture = ReturnType<typeof lireDessin>;
type Modele = 'plat' | 'riche';

let derniere: { svg: string; modele: Modele; lecture: Lecture } | null = null;

/** `lireDessin`, sans relire un texte identique a celui qu'on vient de lire dans le meme modele. */
export function lireDessinMemo(svg: string, modele: Modele = 'plat'): Lecture {
  if (derniere && derniere.svg === svg && derniere.modele === modele) return derniere.lecture;
  const lecture = lireDessin(svg, modele === 'plat' ? {} : { modele });
  derniere = { svg, modele, lecture };
  return lecture;
}
