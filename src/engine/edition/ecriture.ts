// L'ecriture d'un dessin en SVG : le seul endroit ou un octet sort, donc celui qui doit rester
// identique d'une version a l'autre.

import { echapperAttribut } from '../../util/xml.js';
import type { DessinSvg, Forme } from './types.js';
import { ecrireChemin, nb } from './chemins.js';

// L'ecriture d'une forme ne depend que d'elle et de la precision, et une forme ne change jamais (chaque
// operation en rend une nouvelle) : on garde son texte, par precision. Sans cela, mesurer le poids du
// dessin a chaque modification, ou sauver le brouillon, reecrivait les cinq mille formes d'une
// vectorisation pour une seule qui avait bouge. Le texte rendu est le meme octet pour octet.
const cacheEcriture = new WeakMap<Forme, string[]>();

export function ecrireForme(f: Forme, precision = 2): string {
  if (!Number.isInteger(precision) || precision < 0 || precision > 9) return composerForme(f, precision);
  let textes = cacheEcriture.get(f);
  if (!textes) { textes = []; cacheEcriture.set(f, textes); }
  let s = textes[precision];
  if (s === undefined) { s = composerForme(f, precision); textes[precision] = s; }
  return s;
}

function composerForme(f: Forme, precision: number): string {
  let s = '<path d="' + ecrireChemin(f.d, precision) + '" fill="' + echapperAttribut(f.remplissage ?? 'none') + '"';
  if (f.regle === 'evenodd') s += ' fill-rule="evenodd"';
  if (f.contour) s += ' stroke="' + echapperAttribut(f.contour) + '" stroke-width="' + nb(f.epaisseur, 3) + '" stroke-linejoin="round"';
  if (f.opacite < 1) s += ' opacity="' + nb(f.opacite, 3) + '"';
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
