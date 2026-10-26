// Les effets du modele vers le projet JSON et retour (ADR-0030, ADR-0012 etape 7) : champ pour champ, dans l'ordre du format
// (model/projetV2/effets.ts), a pleine precision : un projet rouvert reecrit le meme SVG a l'octet. Pur.

import type { EffetsProjet } from '../../model/projetV2/effets.js';
import type { Effets } from '../editionSvg.js';

/** Des effets du modele en effets de projet. */
export function effetsProjet(e: Effets): EffetsProjet {
  return {
    ...(e.flou ? { flou: { ecart: e.flou.ecart, ...(e.flou.ecartY !== undefined ? { ecartY: e.flou.ecartY } : {}) } } : {}),
    ...(e.ombre ? { ombre: { dx: e.ombre.dx, dy: e.ombre.dy, ecart: e.ombre.ecart, couleur: e.ombre.couleur, opacite: e.ombre.opacite } } : {})
  };
}

/** Des effets de projet (deja valides) en effets du modele. */
export function effetsDuProjet(e: EffetsProjet): Effets {
  return {
    ...(e.flou ? { flou: { ecart: e.flou.ecart, ...(e.flou.ecartY !== undefined ? { ecartY: e.flou.ecartY } : {}) } } : {}),
    ...(e.ombre ? { ombre: { dx: e.ombre.dx, dy: e.ombre.dy, ecart: e.ombre.ecart, couleur: e.ombre.couleur, opacite: e.ombre.opacite } } : {})
  };
}
