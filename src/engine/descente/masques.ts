// La descente des masques d'opacite vers un dessin plat (ADR-0012, etape 6, annexe 5 §4) : un exporteur de traces (PDF ecrit a la
// main d'aujourd'hui, SVG de decoupe, DXF, EPS, fichiers de production, SVG « a plat ») ne sait pas composer une luminance. Le masque
// est ignore, et c'est dit a l'export : ce qu'il masquait est exporte entier, sans lui. Le PDF l'ecrira en masque doux a l'etape 13 ;
// il declarera alors `masques: 'natif'`, et cette regle le lui laissera. Le SVG et le PNG (le navigateur dessine le SVG) ne descendent
// pas. Un rendu en image (`raster`) n'existe pas encore : il descend comme `approche`. Pure ; elle passe avant celle des groupes, qui
// lit encore la table.

import { visibleEffectif, type DessinSvg, type Groupe } from '../editionSvg.js';
import type { RegleDescente } from '../aplatir.js';

/** Ce qui se dit a l'export (« Approché par ce format : … »). */
export const MSG_DESCENTE_MASQUES = 'les masques d’opacité (ignorés : ce qu’ils masquaient est exporté entier)';

/** Le dessin sans masques ; le meme objet s'il n'en porte pas. La perte n'est dite que pour un groupe masque qui s'exporte. */
export function descendreMasques(d: DessinSvg): { readonly dessin: DessinSvg; readonly pertes: readonly string[] } {
  const table = d.groupes;
  if (!table || !Object.values(table).some(g => g.masque)) return { dessin: d, pertes: [] };
  let vu = false;
  const groupes: Record<string, Groupe> = {};
  for (const [id, g] of Object.entries(table)) {
    if (!g.masque) { groupes[id] = g; continue; }
    // Un groupe masque (ou sous un groupe masque) ne s'exporte pas plus qu'il ne s'enregistre : il perd son masque sans rien dire.
    if (visibleEffectif(d, id)) vu = true;
    const { masque: _m, ...reste } = g;
    void _m;
    groupes[id] = reste;
  }
  return { dessin: { ...d, groupes }, pertes: vu ? [MSG_DESCENTE_MASQUES] : [] };
}

export const descenteMasques: RegleDescente = {
  fonction: 'masques',
  descendre: (d, niveau) => (niveau === 'natif' ? { dessin: d, pertes: [] } : descendreMasques(d))
};
