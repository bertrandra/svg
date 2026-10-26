// La descente des motifs vers un dessin plat (ADR-0012, etape 9, annexe 5 §4) : pour un exporteur qui ne sait pas paver une tuile (PDF
// d'aujourd'hui, SVG de decoupe, DXF, EPS, fichiers de production, SVG « a plat »), la peinture part et la couleur de repli reste ; elle
// est deja dans `remplissage` ou `contour` (annexe 1 §6 : la moyenne des couleurs de la tuile), rien n'est a calculer ; une forme qui
// ne s'exporte pas (masquee, elle ou un groupe) perd son motif sans phrase. Un exporteur qui le sait (« natif » : le motif de pavage
// du PDF, etape 13) garde le motif. `raster` et `refus` descendent comme `approche`. Le SVG et le PNG ne descendent pas (le navigateur
// dessine le motif). Pure.

import { visibleEffectif, type DessinSvg, type Forme } from '../editionSvg.js';
import { estMotif } from '../edition/fonctions/motifs.js';
import type { RegleDescente } from '../aplatir.js';
import { t } from '../../util/i18n.js';

/** Ce que l'export dit avoir approche : la cle (evaluee au chargement, avant la langue : le francais) ; `t(PERTE_MOTIFS)` la traduit quand on la dit. */
export const PERTE_MOTIFS = t('les motifs (remplacés par leur couleur moyenne)');

/** La forme sans ses motifs : la couleur de repli prend leur place, telle quelle. La meme forme si elle n'en porte pas. */
function sansMotifs(f: Forme): Forme {
  const r = estMotif(f.peintureRemplissage), c = estMotif(f.peintureContour);
  if (!r && !c) return f;
  const x: Record<string, unknown> = { ...f };
  if (r) delete x.peintureRemplissage;
  if (c) delete x.peintureContour;
  return x as unknown as Forme;
}

export const motifs: RegleDescente = {
  fonction: 'motifs',
  descendre(d: DessinSvg, niveau) {
    if (niveau === 'natif') return { dessin: d, pertes: [] };
    let change = false, vu = false;
    const formes = d.formes.map(f => {
      const x = sansMotifs(f);
      if (x !== f) { change = true; if (visibleEffectif(d, f.id)) vu = true; }
      return x;
    });
    return change ? { dessin: { ...d, formes }, pertes: vu ? [t(PERTE_MOTIFS)] : [] } : { dessin: d, pertes: [] };
  }
};
