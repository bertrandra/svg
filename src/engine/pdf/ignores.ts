// Ce que la lecture d'un PDF n'a pas repris, ou seulement approche, dit en francais (ADR-0009, ADR-0020) : des groupes
// nominaux, comme les `ignores` d'un SVG, que la page montre une fois a l'ouverture (« Non repris a l'ouverture : … »).

import type { Pertes } from './etat.js';
import { enFrancais } from './limites.js';
import { EPAISSEUR_FILET } from './trace.js';

const compte = (n: number, mot: string, pluriel = mot + 's'): string => enFrancais(n) + ' ' + (n > 1 ? pluriel : mot);

/** Les phrases des pertes, dans un ordre fixe : du plus visible au plus discret. */
export function phrasesPertes(p: Pertes): string[] {
  const r: string[] = [];
  if (p.textes) r.push(compte(p.textes, 'texte') + ' (convertissez le texte en contours dans votre logiciel avant d’exporter le PDF)');
  if (p.images) r.push(compte(p.images, 'image') + ' (une image se vectorise par « Convertir une image »)');
  if (p.decoupes) r.push('les découpes (masques d’écrêtage) de ' + compte(p.decoupes, 'forme') + ' : ce qu’elles cachaient se voit');
  if (p.motifs) r.push('les dégradés et motifs de ' + compte(p.motifs, 'forme') + ', remplacés par une couleur unie');
  if (p.degrades) r.push(compte(p.degrades, 'dégradé') + ' peint' + (p.degrades > 1 ? 's' : '') + ' hors de toute forme');
  if (p.masquees) r.push(compte(p.masquees, 'forme') + ' de calques masqués');
  if (p.annotations) r.push(compte(p.annotations, 'annotation') + ' (commentaires, tampons, champs de formulaire)');
  if (p.masquesDoux) r.push('les masques de transparence de ' + compte(p.masquesDoux, 'forme'));
  if (p.fusions) r.push('les modes de fusion (produit, superposition…) de ' + compte(p.fusions, 'forme'));
  if (p.filets) r.push('l’épaisseur nulle de ' + compte(p.filets, 'trait') + ' (filets du PDF), tracés à ' + String(EPAISSEUR_FILET).replace('.', ',') + ' pt');
  if (p.cmjn) r.push('les couleurs CMJN, converties en RVB sans profil (valeurs approchées)');
  if (p.approchees) r.push('les tons directs et couleurs Lab, approchés en RVB');
  if (p.illisible) r.push('une partie illisible du contenu de la page');
  return r;
}
