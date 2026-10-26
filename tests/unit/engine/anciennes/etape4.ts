// Le corps d'avant l'etape 4 (ADR-0012, annexe 7 §3, « loi du dessin plat ») de `peintureDite` (engine/description.ts) : un cote peint
// d'un degrade se dit desormais par son degrade (« fond dégradé linéaire du rouge … au bleu … ») et non par sa couleur de repli.
// Recopie tel quel ; il ne sert qu'a la loi du dessin plat et disparait a la bascule (etape 14).

import { couleurDite } from '../../../../src/engine/description.js';
import type { Forme } from '../../../../src/engine/editionSvg.js';

/** « fond rouge #c81e28, contour noir #000000 », ou « sans fond ni contour ». */
export function peintureDiteAncienne(f: Forme): string {
  const morceaux: string[] = [];
  morceaux.push(f.remplissage ? 'fond ' + couleurDite(f.remplissage) : 'sans fond');
  if (f.contour) morceaux.push('contour ' + couleurDite(f.contour));
  return morceaux.join(', ');
}
