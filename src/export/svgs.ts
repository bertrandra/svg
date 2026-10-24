// Les variantes du SVG ecrit : le dessin tel quel (editionSvg.ecrireDessin) et la version
// « decoupe », contours seuls d'une couleur et d'une epaisseur donnees, pour un traceur de decoupe,
// une gravure laser ou un gabarit. Pur.

import { ecrireChemin, originesDe, type DessinSvg } from '../engine/editionSvg.js';
import { mentionOrigines } from '../model/credits.js';

const nb = (v: number) => { const r = Number(v.toFixed(3)); return Object.is(r, -0) ? '0' : String(r); };

/**
 * Le SVG en contours seuls : chaque forme visible, sans remplissage, au trait donne. Le fichier ne garde que des
 * contours, pas la marque des formes : si l'une d'elles vient d'une source creditee, la mention passe en commentaire.
 */
export function svgDecoupe(dessin: DessinSvg, couleur = '#ff0000', epaisseur = 0.25, precision = 3): string {
  const [x, y, l, h] = dessin.vb;
  const corps = dessin.formes.filter(f => f.visible)
    .map(f => '<path d="' + ecrireChemin(f.d, precision) + '" fill="none" stroke="' + couleur + '" stroke-width="' + nb(epaisseur) + '" stroke-linejoin="round"/>')
    .join('');
  const mention = mentionOrigines(originesDe(dessin.formes.filter(f => f.visible)));
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + [x, y, l, h].map(nb).join(' ') + '" width="' + nb(l) + 'mm" height="' + nb(h) + 'mm">' + (mention ? '<!-- ' + mention + ' -->' : '') + corps + '</svg>';
}
