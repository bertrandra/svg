// Ce que chaque exporteur sait du modele v2 (ADR-0012, annexe 5 §4) : il recoit le dessin par `aplatirPour(dessin, ses capacites)`
// et dit les pertes. Le SVG natif et le PNG (le navigateur dessine le SVG) n'en ont pas besoin : ils ecrivent tout.

import type { Capacites } from '../engine/aplatir.js';

const TOUT_APPROCHE: Capacites = {
  groupes: 'approche', decoupes: 'approche', masques: 'approche', degrades: 'approche', motifs: 'approche', effets: 'approche', texte: 'natif', images: 'approche'
};

/** Le SVG de decoupe : des contours seuls. */
export const CAPACITES_SVG_DECOUPE: Capacites = TOUT_APPROCHE;
/** Le PDF ecrit a la main, aujourd'hui : les effets se rasteriseront par `io` quand la resolution d'export le permettra (etape 13). */
export const CAPACITES_PDF: Capacites = TOUT_APPROCHE;
export const CAPACITES_DXF: Capacites = TOUT_APPROCHE;
export const CAPACITES_EPS: Capacites = TOUT_APPROCHE;
/** Les fichiers d'un contexte de production (Cricut : decoupe, stylo, Print Then Cut, archive par operation). */
export const CAPACITES_PRODUCTION: Capacites = TOUT_APPROCHE;
