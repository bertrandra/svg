// La silhouette d'un dessin : l'union de tout ce qui se peint (fonds et traits), sans ses trous. C'est la ligne
// de coupe de Print Then Cut, ou Design Space aplatit le dessin en une image et la decoupe autour. Pur ; la
// region peinte de chaque forme se memorise par forme, la silhouette par dessin.

import clipping, { type MultiPolygon } from 'polygon-clipping';
import { regionDeForme } from '../booleens.js';
import { regionDuTrait } from '../contour/etendre.js';
import type { DessinSvg, Forme } from '../editionSvg.js';

const regions = new WeakMap<Forme, Map<number, MultiPolygon>>();
const silhouettes = new WeakMap<DessinSvg, Map<number, MultiPolygon>>();

/** L'union de regions, par paires voisines (les grandes unions d'un coup font echouer le balayage). */
export function unirRegions(liste: readonly MultiPolygon[]): MultiPolygon {
  let r: MultiPolygon[] = liste.filter(m => m.length > 0);
  while (r.length > 1) {
    const suite: MultiPolygon[] = [];
    for (let i = 0; i < r.length; i += 2) {
      const a = r[i], b = r[i + 1];
      if (a && b) suite.push(clipping.union(a, b));
      else if (a) suite.push(a);
    }
    r = suite;
  }
  return r[0] ?? [];
}

/** Ce que peint une forme : son fond, et son trait s'il a une epaisseur. */
export function regionPeinte(f: Forme, tolerance: number): MultiPolygon {
  let parTolerance = regions.get(f);
  if (!parTolerance) { parTolerance = new Map(); regions.set(f, parTolerance); }
  const connue = parTolerance.get(tolerance);
  if (connue) return connue;
  const fond = f.remplissage !== null ? regionDeForme(f, tolerance) : [];
  const trait = f.contour !== null && f.epaisseur > 0 ? regionDuTrait(f, tolerance) : [];
  const r = unirRegions([fond, 'erreur' in trait ? [] : trait]);
  parTolerance.set(tolerance, r);
  return r;
}

/** La silhouette du dessin visible : l'union de ce qui se peint, chaque polygone reduit a son bord exterieur. */
export function silhouetteDe(dessin: DessinSvg, tolerance: number): MultiPolygon {
  let parTolerance = silhouettes.get(dessin);
  if (!parTolerance) { parTolerance = new Map(); silhouettes.set(dessin, parTolerance); }
  const connue = parTolerance.get(tolerance);
  if (connue) return connue;
  const exterieurs = (m: MultiPolygon): MultiPolygon => m.flatMap(poly => (poly[0] ? [[poly[0]]] : []));
  const union = unirRegions(dessin.formes.filter(f => f.visible).map(f => regionPeinte(f, tolerance)));
  // Deux bords exterieurs peuvent s'emboiter (une forme posee dans le trou d'une autre) : l'union les ramene au plus grand.
  const plein = exterieurs(unirRegions(exterieurs(union).map(p => [p])));
  parTolerance.set(tolerance, plein);
  return plein;
}
