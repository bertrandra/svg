// Les regions que les outils de contour manipulent : l'union d'un grand nombre d'anneaux, et le chemin
// qui s'en tire. polygon-clipping prend ses polygones en arguments : quelques milliers d'arguments
// ferment la pile d'appels, donc l'union se fait par lots puis par fusion des lots.

import clipping, { type MultiPolygon, type Ring } from 'polygon-clipping';
import type { Chemin } from '../edition/types.js';
import { cheminDeRegion, cheminLisseDeRegion } from '../booleens.js';

/**
 * L'union d'anneaux, chacun pris comme un polygone plein : vide si la liste l'est. Les anneaux se fusionnent
 * par paires voisines, niveau par niveau : un trace donne ses morceaux dans l'ordre, deux voisins partagent des
 * aretes, et fusionner d'abord ce qui se touche garde chaque balayage petit et net (une seule union de
 * milliers de morceaux fait echouer polygon-clipping sur des aretes presque confondues).
 */
export function unirAnneaux(anneaux: readonly Ring[]): MultiPolygon {
  let regions: MultiPolygon[] = anneaux.map(r => [[r]]);
  while (regions.length > 1) {
    const suite: MultiPolygon[] = [];
    for (let i = 0; i < regions.length; i += 2) {
      const a = regions[i], b = regions[i + 1];
      if (a && b) suite.push(clipping.union(a, b));
      else if (a) suite.push(a);
    }
    regions = suite;
  }
  return regions[0] ?? [];
}

/** L'aire d'un multipolygone : les anneaux exterieurs moins les trous (l'orientation ne compte pas). */
export function aireDeRegion(region: MultiPolygon): number {
  const aire = (r: Ring) => {
    let a = 0;
    for (let i = 0; i < r.length; i++) {
      const p = r[i], q = r[(i + 1) % r.length];
      if (p && q) a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(a) / 2;
  };
  return region.reduce((s, poly) => s + poly.reduce((t, r, k) => t + (k === 0 ? aire(r) : -aire(r)), 0), 0);
}

/** Le chemin d'une region : en segments droits, ou avec les courbes rebaties (`lisser`) a `tolerance` pres. */
export function cheminDeRegionChoisie(region: MultiPolygon, lisser: boolean, tolerance: number): Chemin {
  return lisser ? cheminLisseDeRegion(region, tolerance) : cheminDeRegion(region);
}
