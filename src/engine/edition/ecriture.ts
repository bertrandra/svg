// L'ecriture d'un dessin en SVG : le seul endroit ou un octet sort, donc celui qui doit rester
// identique d'une version a l'autre.

import { echapperAttribut } from '../../util/xml.js';
import type { DessinSvg, Forme } from './types.js';
import { ecrireChemin, nb } from './chemins.js';
import { opaciteDuContour, opaciteDuRemplissage } from './opacites.js';

export function ecrireForme(f: Forme, precision = 2): string {
  let s = '<path d="' + ecrireChemin(f.d, precision) + '" fill="' + echapperAttribut(f.remplissage ?? 'none') + '"';
  if (f.regle === 'evenodd') s += ' fill-rule="evenodd"';
  // Les opacites propres ne s'ecrivent que lorsqu'elles changent quelque chose : une forme sans alpha reste
  // ecrite comme avant. Sans contour, le fond et la forme ne font qu'un : tout va dans `opacity`, qui est
  // aussi ce que la lecture en fait, donc une relecture reecrit les memes octets.
  let opacite = f.opacite;
  if (f.contour) {
    if (f.remplissage && opaciteDuRemplissage(f) < 1) s += ' fill-opacity="' + nb(opaciteDuRemplissage(f), 3) + '"';
    s += ' stroke="' + echapperAttribut(f.contour) + '" stroke-width="' + nb(f.epaisseur, 3) + '" stroke-linejoin="round"';
    if (opaciteDuContour(f) < 1) s += ' stroke-opacity="' + nb(opaciteDuContour(f), 3) + '"';
  } else if (f.remplissage) opacite = Math.round(opacite * opaciteDuRemplissage(f) * 1000) / 1000;
  if (opacite < 1) s += ' opacity="' + nb(opacite, 3) + '"';
  return s + '/>';
}

/** Le SVG du dessin. Les formes masquees ne s'ecrivent pas : masquer, a l'enregistrement, c'est retirer. */
export function ecrireDessin(dessin: DessinSvg, precision = 2): string {
  const [x, y, l, h] = dessin.vb;
  const corps = dessin.formes.filter(f => f.visible).map(f => ecrireForme(f, precision)).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + [x, y, l, h].map(v => nb(v, 3)).join(' ') + '" width="' + nb(l, 3) + '" height="' + nb(h, 3) + '">' + corps + '</svg>';
}

export interface Statistiques { formes: number; points: number; octets: number }

export function statistiques(dessin: DessinSvg): Statistiques {
  const visibles = dessin.formes.filter(f => f.visible);
  return { formes: visibles.length, points: visibles.reduce((n, f) => n + f.d.filter(c => c.c !== 'Z').length, 0), octets: ecrireDessin(dessin).length };
}
