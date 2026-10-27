// Ce que l'editeur dit quand un outil vectorise un texte vivant (ADR-0022) : booleen, contour en forme, decalage, angles,
// jonctions, combiner ou separer changent son trace sans le connaitre ; la garde (garderTextes) lui retire son texte, et la
// phrase de l'action le dit. Pur : des phrases.

import type { DessinSvg } from '../engine/editionSvg.js';
import { t } from '../util/i18n.js';

export const PHRASE_TEXTE_VECTORISE = t('Le texte est vectorisé : il n’est plus modifiable comme texte (Ctrl+Z le rend).');

/** La phrase d'une action, suivie de l'avertissement quand l'une des formes choisies etait un texte vivant. */
export function avecVectorisation(phrase: string, dessin: DessinSvg, ids: readonly string[]): string {
  const textes = dessin.formes.filter(f => f.texte && ids.includes(f.id)).length;
  if (!textes) return phrase;
  return phrase + ' ' + (textes > 1 ? t('Les {n} textes sont vectorisés : ils ne sont plus modifiables comme texte (Ctrl+Z les rend).', { n: textes }) : PHRASE_TEXTE_VECTORISE);
}
