// La descente des degrades vers un dessin plat (ADR-0012, annexe 5 §4) : pour un exporteur qui ne sait pas peindre un degrade (PDF
// d'aujourd'hui, SVG de decoupe, DXF, EPS, fichiers de production, SVG « a plat »), la peinture part et la couleur de repli reste ; elle
// est deja dans `remplissage` ou `contour` (annexe 1 §6), rien n'est a calculer. Un exporteur qui le sait (« natif » : le PDF a
// l'etape 13) garde le degrade. Un motif n'est pas un degrade : sa regle viendra avec lui (etape 9), le filet s'en charge d'ici la.

import type { DessinSvg, Forme } from '../editionSvg.js';
import { estDegrade } from '../edition/degrades.js';
import type { RegleDescente } from '../aplatir.js';

/** Ce que l'export dit avoir approche. */
export const PERTE_DEGRADES = 'les dégradés (remplacés par leur couleur moyenne)';

/** La forme sans ses degrades : la couleur de repli prend leur place, telle quelle. La meme forme si elle n'en porte pas. */
function sansDegrades(f: Forme): Forme {
  const r = estDegrade(f.peintureRemplissage), c = estDegrade(f.peintureContour);
  if (!r && !c) return f;
  const x: Record<string, unknown> = { ...f };
  if (r) delete x.peintureRemplissage;
  if (c) delete x.peintureContour;
  return x as unknown as Forme;
}

export const degrades: RegleDescente = {
  fonction: 'degrades',
  descendre(d: DessinSvg, niveau) {
    if (niveau === 'natif') return { dessin: d, pertes: [] };
    let change = false;
    const formes = d.formes.map(f => { const x = sansDegrades(f); if (x !== f) change = true; return x; });
    return change ? { dessin: { ...d, formes }, pertes: [PERTE_DEGRADES] } : { dessin: d, pertes: [] };
  }
};
