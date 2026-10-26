// Le brouillon des effets pendant un geste (ADR-0012, etape 7, paquet 7-B ; annexe 6 §6, annexe 7 §4). Un flou ou une ombre se
// recalculent a chaque image ; vingt noeuds a effet tiennent le budget d'un geste (30 images par seconde), au-dela la toile les
// retire le temps d'un glisser, d'un redimensionnement ou d'une rotation, et les rend au relacher : `data-brouillon` sur les noeuds de
// la toile, les filtres retires par la feuille de style (editeur.css), le dessin et ce qui s'ecrit n'en savent rien. La page le dit
// une fois (« Effets affichés au repos »). Les mesures sont dans l'annexe 8 du plan, §0.

import { aDesEffets, type DessinSvg } from '../engine/editionSvg.js';
import { t } from '../util/i18n.js';

/** Au-dela de ce nombre de feuilles et de groupes a effet, les effets ne se rendent qu'au repos (annexe 6 §6). */
export const SEUIL_EFFETS_AU_REPOS = 20;

/** La phrase dite une fois, au premier geste qui retire les effets. */
export const phraseEffetsAuRepos = (): string => t('Effets affichés au repos : au-delà de {n} formes ou groupes à effet, flous et ombres se masquent pendant un geste.', { n: SEUIL_EFFETS_AU_REPOS });
/** La constante d'avant, pour Gestes.ts : evaluee au chargement du module, donc en francais ; la fonction suit la langue de la session. */
export const PHRASE_EFFETS_AU_REPOS = phraseEffetsAuRepos();

const memo = new WeakMap<DessinSvg, number>();

/** Le nombre de feuilles et de groupes visibles qui portent un flou ou une ombre ; memorise par dessin (un dessin ne change jamais). */
export function noeudsAEffet(d: DessinSvg): number {
  const deja = memo.get(d);
  if (deja !== undefined) return deja;
  let n = 0;
  for (const f of d.formes) if (f.visible && aDesEffets(f.effets)) n++;
  for (const g of Object.values(d.groupes ?? {})) if (g.visible && aDesEffets(g.effets)) n++;
  memo.set(d, n);
  return n;
}

/** Les effets de ce dessin ne se rendent qu'au repos : un geste pose le brouillon. */
export const effetsAuRepos = (d: DessinSvg): boolean => noeudsAEffet(d) > SEUIL_EFFETS_AU_REPOS;
