// Ou une image integree se pose dans un PDF (ADR-0012, etape 13a) : son cadre (x, y, l, h), `preserveAspectRatio` (alignement, meet,
// slice, none), l'orientation EXIF que le navigateur applique a un JPEG, sa matrice, puis le plan retourne du PDF. L'image du PDF est
// le carre unite, sa premiere ligne en haut : la matrice rendue l'y pose (`cm`). Pur.

import type { Chemin, Commande, DessinSvg, ImageIntegree } from '../engine/editionSvg.js';
import type { ImagePdf } from './pdfImages.js';

type Mat = readonly [number, number, number, number, number, number];

/** Un pixel enregistre (x, y) d'une image l x h, la ou il s'affiche selon l'orientation EXIF (1 a 8). */
function affiche(o: number, l: number, h: number, x: number, y: number): [number, number] {
  switch (o) {
    case 2: return [l - x, y];
    case 3: return [l - x, h - y];
    case 4: return [x, h - y];
    case 5: return [y, x];
    case 6: return [h - y, x];
    case 7: return [h - y, l - x];
    case 8: return [y, l - x];
    default: return [x, y];
  }
}

/**
 * La matrice qui pose l'image dans le repere du PDF, et le cadre ou la rogner (dans le plan) quand elle le deborde (`slice`) ; null
 * sinon (meet tient dans le cadre, none le remplit).
 */
export function placementImage(src: ImageIntegree, img: ImagePdf, vb: DessinSvg['vb']): { readonly m: Mat; readonly cadre: Chemin | null } {
  const [vx, vy, , vh] = vb;
  const o = img.orientation, tourne = o >= 5, W = tourne ? img.h : img.l, H = tourne ? img.l : img.h;
  const [alignement = 'xMidYMid', mode] = (src.aspect ?? 'xMidYMid').split(' ');
  let sx: number, sy: number, px = src.x, py = src.y;
  if (alignement === 'none') { sx = src.l / W; sy = src.h / H; }
  else {
    sx = sy = (mode === 'slice' ? Math.max : Math.min)(src.l / W, src.h / H);
    const fx = alignement.startsWith('xMin') ? 0 : alignement.startsWith('xMid') ? 0.5 : 1, fy = alignement.endsWith('YMin') ? 0 : alignement.endsWith('YMid') ? 0.5 : 1;
    px += fx * (src.l - W * sx); py += fy * (src.h - H * sy);
  }
  const m = src.matrice ?? [1, 0, 0, 1, 0, 0];
  const plan = (ex: number, ey: number): [number, number] => [m[0] * ex + m[2] * ey + m[4], m[1] * ex + m[3] * ey + m[5]];
  const point = (u: number, v: number): [number, number] => {
    const [X, Y] = affiche(o, img.l, img.h, u * img.l, (1 - v) * img.h), [x, y] = plan(px + X * sx, py + Y * sy);
    return [x - vx, vh - (y - vy)];
  };
  const [p0, pu, pv] = [point(0, 0), point(1, 0), point(0, 1)];
  const coins: readonly (readonly [number, number])[] = [[src.x, src.y], [src.x + src.l, src.y], [src.x + src.l, src.y + src.h], [src.x, src.y + src.h]];
  const cadre: Chemin | null = alignement !== 'none' && mode === 'slice'
    ? [...coins.map(([ex, ey], i): Commande => ({ c: i ? 'L' : 'M', p: plan(ex, ey) })), { c: 'Z', p: [] }]
    : null;
  return { m: [pu[0] - p0[0], pu[1] - p0[1], pv[0] - p0[0], pv[1] - p0[1], p0[0], p0[1]], cadre };
}
