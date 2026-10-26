// Ce que la lecture d'un PDF n'a pas repris, ou seulement approche, dit en francais (ADR-0009, ADR-0020) : des groupes
// nominaux, comme les `ignores` d'un SVG, que la page montre une fois a l'ouverture (« Non repris a l'ouverture : … »).

import type { Pertes } from './etat.js';
import { enFrancais } from './limites.js';
import { EPAISSEUR_FILET } from './trace.js';
import { nombre, t } from '../../util/i18n.js';

/** « 3 textes » : le nombre dans la langue, puis le mot deja traduit, au pluriel au-dela de un (un « s », sauf pluriel donne). */
const compte = (n: number, mot: string, pluriel = mot + 's'): string => enFrancais(n) + ' ' + (n > 1 ? pluriel : mot);

/** Les phrases des pertes, dans un ordre fixe : du plus visible au plus discret. */
export function phrasesPertes(p: Pertes): string[] {
  const r: string[] = [];
  const textes = (n: number) => compte(n, t('texte')), formes = (n: number) => compte(n, t('forme'));
  if (p.textes) r.push(t('{n} (convertissez le texte en contours dans votre logiciel avant d’exporter le PDF)', { n: textes(p.textes) }));
  if (p.textesSansPolice) r.push(t('{n} (les polices de remplacement ne sont pas chargées : le fichier polices.js manque à côté de la page)', { n: textes(p.textesSansPolice) }));
  if (p.textesInvisibles) r.push(t('{n} (couche de reconnaissance de caractères, ou texte qui ne sert qu’à découper)', { n: compte(p.textesInvisibles, t('texte invisible'), t('textes invisibles')) }));
  if (p.textesDecoupe) r.push(t('la découpe par le texte de {n} (le texte est repris, pas ce qu’il découpait)', { n: textes(p.textesDecoupe) }));
  if (p.caracteresInconnus) r.push(t('{n} sans glyphe connue', { n: compte(p.caracteresInconnus, t('caractère')) }));
  if (p.codageInconnu) r.push(t('le codage des caractères d’une police composite (lu comme Identity, le texte peut être faux)'));
  if (p.images) r.push(t('{n} (une image se vectorise par « Convertir une image »)', { n: compte(p.images, t('image')) }));
  if (p.decoupes) r.push(t('les découpes (masques d’écrêtage) de {n} : ce qu’elles cachaient se voit', { n: formes(p.decoupes) }));
  if (p.motifs) r.push(t('les dégradés et motifs de {n}, remplacés par une couleur unie', { n: formes(p.motifs) }));
  if (p.degrades) r.push(t(p.degrades > 1 ? '{n} peints hors de toute forme' : '{n} peint hors de toute forme', { n: compte(p.degrades, t('dégradé')) }));
  if (p.masquees) r.push(t('{n} de calques masqués', { n: formes(p.masquees) }));
  if (p.annotations) r.push(t('{n} (commentaires, tampons, champs de formulaire)', { n: compte(p.annotations, t('annotation')) }));
  if (p.masquesDoux) r.push(t('les masques de transparence de {n}', { n: formes(p.masquesDoux) }));
  if (p.fusions) r.push(t('les modes de fusion (produit, superposition…) de {n}', { n: formes(p.fusions) }));
  if (p.filets) r.push(t('l’épaisseur nulle de {n} (filets du PDF), tracés à {epaisseur} pt', { n: compte(p.filets, t('trait')), epaisseur: nombre(EPAISSEUR_FILET) }));
  if (p.cmjn) r.push(t('les couleurs CMJN, converties en RVB sans profil (valeurs approchées)'));
  if (p.approchees) r.push(t('les tons directs et couleurs Lab, approchés en RVB'));
  if (p.illisible) r.push(t('une partie illisible du contenu de la page'));
  return r;
}
