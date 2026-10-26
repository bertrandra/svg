// Ce que la lecture perdait sans le dire (ADR-0012, annexe 5 §1) : le mode de fusion, l'ordre de peinture et le trait non mis a
// l'echelle. Aucun n'est porte par le modele (un groupe compose normalement, le contour se peint par-dessus le fond, un trait
// s'ecrit a l'echelle) ; ils sont maintenant DITS, dans les deux modes de lecture. Ces phrases changent un message a l'ouverture,
// jamais un octet ecrit. Pur.
//
// `isolation` n'a pas de phrase : sans mode de fusion (que le modele n'a pas), isoler un groupe ne change aucun rendu ; quand il
// accompagne un mode de fusion, c'est la phrase du mode de fusion qui le dit.

import type { Noeud } from '../../util/xml.js';
import type { Proprietes } from './ignores.js';
import { t } from '../../util/i18n.js';

// Des cles, evaluees au chargement avant la langue (le francais) ; `t(MSG_X)` les traduit quand on les dit.
export const MSG_FUSION = t('le mode de fusion (mix-blend-mode) : les formes se superposent normalement');
export const MSG_ORDRE_PEINTURE = t('l’ordre de peinture (paint-order) : le contour se peint par-dessus le fond');
export const MSG_VECTOR_EFFECT = t('vector-effect (trait non mis à l’échelle) : il s’écrit à l’échelle');

/**
 * La valeur d'une propriete : celle de la cascade (style, feuille), sinon l'attribut de presentation. `paint-order` et
 * `vector-effect` sont des attributs de presentation que la cascade ne recense pas ; `mix-blend-mode` n'en est pas un, mais un
 * navigateur ne l'ignore pas pour autant dans une feuille ou un `style`.
 */
const valeur = (pr: Proprietes, n: Noeud, nom: string): string => (pr[nom] ?? n.attributs[nom] ?? '').trim().toLowerCase();

/**
 * Vrai si cet ordre de peinture peint le contour avant le fond : les mots nommes d'abord, puis ceux qui manquent dans l'ordre par
 * defaut (fond, contour, marqueurs). `normal`, ou tout ordre qui garde le fond avant le contour, est le rendu qu'on ecrit.
 */
function contourAvantFond(ordre: string): boolean {
  if (ordre === '' || ordre === 'normal') return false;
  const mots = ordre.split(/\s+/), connus = new Set(['fill', 'stroke', 'markers']);
  if (!mots.every(m => connus.has(m))) return false;
  const complet = [...mots, ...[...connus].filter(m => !mots.includes(m))];
  return complet.indexOf('stroke') < complet.indexOf('fill');
}

/** Les phrases d'`ignores` de ce que cet element pose et que le modele ne porte pas ; vide le plus souvent. */
export function ignoresDeFusion(pr: Proprietes, n: Noeud): string[] {
  const out: string[] = [];
  const fusion = valeur(pr, n, 'mix-blend-mode');
  if (fusion !== '' && fusion !== 'normal' && fusion !== 'initial' && fusion !== 'inherit' && fusion !== 'unset') out.push(t(MSG_FUSION));
  if (contourAvantFond(valeur(pr, n, 'paint-order'))) out.push(t(MSG_ORDRE_PEINTURE));
  const effet = valeur(pr, n, 'vector-effect');
  if (effet !== '' && effet !== 'none' && effet !== 'inherit' && effet !== 'initial' && effet !== 'unset') out.push(t(MSG_VECTOR_EFFECT));
  return out;
}
