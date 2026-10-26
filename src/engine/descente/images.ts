// La descente des images (ADR-0012, annexe 5 §4, etape 12) : un exporteur de traces (SVG de decoupe, DXF, EPS, fichiers de
// production, PDF ecrit a la main d'aujourd'hui) ne sait rien faire d'une image matricielle. Elle est abandonnee, et c'est dit a
// l'export, comme les courbes rebaties des booleens. Le PDF l'ecrira en image native (XObject) a l'etape 13 : il declarera alors
// `images: 'natif'`, et cette regle la lui laissera. Le SVG et le PNG (le navigateur dessine le SVG) ne descendent pas.

import type { DessinSvg } from '../editionSvg.js';
import type { RegleDescente } from '../aplatir.js';

/** La phrase d'une perte, au singulier ou au pluriel : elle s'ajoute au message de l'export. */
export const perteImages = (n: number): string =>
  n === 1 ? 'une image (ce format ne porte que des tracés : elle n’est pas exportée)' : n + ' images (ce format ne porte que des tracés : elles ne sont pas exportées)';

export const images: RegleDescente = {
  fonction: 'images',
  descendre(d: DessinSvg, niveau) {
    if (niveau === 'natif' || !d.formes.some(f => f.image)) return { dessin: d, pertes: [] };
    // Une image masquee ne s'exporte pas plus qu'elle ne s'enregistre : elle part sans perte dite.
    const vues = d.formes.filter(f => f.image && f.visible).length;
    return { dessin: { ...d, formes: d.formes.filter(f => !f.image) }, pertes: vues ? [perteImages(vues)] : [] };
  }
};
