// La descente des effets (ADR-0012, annexe 5 §4, etape 7) : un exporteur de traces (SVG de decoupe, DXF, EPS, fichiers de production,
// PDF ecrit a la main d'aujourd'hui, SVG « a plat ») ne porte ni flou ni ombre. Les effets sont abandonnes, la forme reste, et c'est dit
// a l'export. Le rendu en image par `io` (le niveau `raster` du PDF, a l'etape 13) n'existe pas encore : `raster` descend comme
// `approche`. Le SVG et le PNG (le navigateur dessine le SVG) ne descendent pas. Elle passe avant les groupes, qui lisent encore la
// table (un groupe a effets perd les siens ici, sa structure ensuite).

import { visibleEffectif, type DessinSvg, type Forme, type Groupe } from '../editionSvg.js';
import type { RegleDescente } from '../aplatir.js';

/** La phrase d'une perte, au singulier ou au pluriel (formes et groupes visibles a effets) : elle s'ajoute au message de l'export. */
export const perteEffets = (n: number): string =>
  n === 1 ? 'le flou ou l’ombre portée d’une forme (ce format ne les porte pas : ils ne sont pas exportés)'
    : 'le flou ou l’ombre portée de ' + n + ' formes ou groupes (ce format ne les porte pas : ils ne sont pas exportés)';

/** Le dessin sans effets, sur les feuilles et les groupes ; le meme dessin s'il n'en porte pas. */
export function descendreEffets(d: DessinSvg): { readonly dessin: DessinSvg; readonly pertes: readonly string[] } {
  const table = d.groupes;
  const groupesAEffets = table ? Object.values(table).filter(g => g.effets !== undefined) : [];
  if (!groupesAEffets.length && !d.formes.some(f => f.effets !== undefined)) return { dessin: d, pertes: [] };
  // Ce qui ne s'exporte pas (masque, ou sous un groupe masque) perd ses effets sans qu'on le dise.
  let vus = 0;
  const formes = d.formes.map((f): Forme => {
    if (f.effets === undefined) return f;
    if (visibleEffectif(d, f.id)) vus++;
    const { effets: _e, ...reste } = f;
    void _e;
    return reste;
  });
  let groupes = table;
  if (table && groupesAEffets.length) {
    const t: Record<string, Groupe> = {};
    for (const [k, g] of Object.entries(table)) {
      if (g.effets === undefined) { t[k] = g; continue; }
      if (visibleEffectif(d, g.id)) vus++;
      const { effets: _e, ...reste } = g;
      void _e;
      t[k] = reste;
    }
    groupes = t;
  }
  return { dessin: { ...d, formes, ...(groupes ? { groupes } : {}) }, pertes: vus ? [perteEffets(vus)] : [] };
}

export const effets: RegleDescente = {
  fonction: 'effets',
  descendre: (d, niveau) => (niveau === 'natif' ? { dessin: d, pertes: [] } : descendreEffets(d))
};
