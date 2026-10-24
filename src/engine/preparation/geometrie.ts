// Les petites mesures que le jugement et les corrections partagent : la boite d'une region, et les formes
// blanches posees sur une autre pour faire un trou (ce que Design Space decoupera en papier blanc). Pur.

import type { MultiPolygon } from 'polygon-clipping';
import { boiteForme, type Boite, type DessinSvg, type Forme } from '../editionSvg.js';

/** La boite d'une region (ses anneaux exterieurs suffisent), ou null si elle est vide. */
export function boiteDeRegion(region: MultiPolygon): Boite | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of region) for (const [x, y] of poly[0] ?? []) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return x0 === Infinity ? null : { x: x0, y: y0, l: x1 - x0, h: y1 - y0 };
}

const BLANCS: ReadonlySet<string> = new Set(['#ffffff', '#fff']);
/** Une forme blanche, pleine, sans trait, opaque : celle qu'on pose pour faire un trou a l'ecran. */
const estBlanche = (f: Forme): boolean => f.visible && !f.verrouille && f.remplissage !== null && BLANCS.has(f.remplissage.toLowerCase()) && f.contour === null && f.opacite === 1 && (f.opaciteRemplissage ?? 1) === 1;
const contient = (a: Boite, b: Boite): boolean => b.x >= a.x && b.y >= a.y && b.x + b.l <= a.x + a.l && b.y + b.h <= a.y + a.h;

/**
 * Les paires [forme du dessous, forme blanche] : une forme blanche dont la boite tient dans celle d'une forme
 * pleine, non blanche, posee plus bas (la plus haute d'entre elles). Dans l'ordre du dessin.
 */
export function pairesTrous(dessin: DessinSvg): Array<[string, string]> {
  const r: Array<[string, string]> = [];
  dessin.formes.forEach((w, i) => {
    if (!estBlanche(w)) return;
    const bw = boiteForme(w);
    if (!bw) return;
    for (let k = i - 1; k >= 0; k--) {
      const b = dessin.formes[k];
      if (!b || !b.visible || b.verrouille || b.remplissage === null || BLANCS.has(b.remplissage.toLowerCase())) continue;
      const bb = boiteForme(b);
      if (bb && contient(bb, bw)) { r.push([b.id, w.id]); return; }
    }
  });
  return r;
}
