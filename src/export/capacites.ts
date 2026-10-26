// Ce que chaque exporteur sait du modele v2 (ADR-0012, annexe 5 §4) : il recoit le dessin par `aplatirPour(dessin, ses capacites)`
// et dit les pertes. Le SVG natif et le PNG (le navigateur dessine le SVG) n'en ont pas besoin : ils ecrivent tout.

import type { Capacites } from '../engine/aplatir.js';

const TOUT_APPROCHE: Capacites = {
  groupes: 'approche', decoupes: 'approche', masques: 'approche', degrades: 'approche', motifs: 'approche', effets: 'approche', texte: 'natif', images: 'approche'
};

/** Le SVG de decoupe : des contours seuls. */
export const CAPACITES_SVG_DECOUPE: Capacites = TOUT_APPROCHE;
/**
 * Le PDF ecrit a la main (etape 13a) : degrades en `shading`, decoupes en chemin de decoupe, masques en masque doux, images en XObject
 * (la scene native de `aplatirPour`, ecrite par `pdfNatif.ts`). Les effets restent abandonnes : leur rendu en image demanderait un
 * rasteriseur (`io`) et une resolution d'export du PDF, qui n'existe pas (la resolution des options est celle du PNG). Les motifs
 * restent approches jusqu'a leur pavage (`/Pattern` de type 1, apres l'etape 9). L'opacite d'un groupe dont les feuilles se
 * recouvrent s'ecrit en groupe de transparence (exacte, la ou les autres formats la multiplient sur les feuilles et le disent).
 */
export const CAPACITES_PDF: Capacites = { ...TOUT_APPROCHE, groupes: 'natif', decoupes: 'natif', masques: 'natif', degrades: 'natif', images: 'natif' };
export const CAPACITES_DXF: Capacites = TOUT_APPROCHE;
export const CAPACITES_EPS: Capacites = TOUT_APPROCHE;
/** Les fichiers d'un contexte de production (Cricut : decoupe, stylo, Print Then Cut, archive par operation). */
export const CAPACITES_PRODUCTION: Capacites = TOUT_APPROCHE;
