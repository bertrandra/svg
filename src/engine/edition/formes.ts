// Les formes qu'on dessine : rectangle, ellipse, etoile, ligne brisee, et leur ajout au premier plan
// avec la peinture courante de l'editeur.

import type { Chemin, Commande, DessinSvg, Forme } from './types.js';
import { prochainId } from './operations.js';

/** Ce qu'une forme nouvelle recoit : la peinture courante de l'editeur. */
export interface Style { remplissage: string | null; contour: string | null; epaisseur: number }

export const STYLE_DEFAUT: Style = { remplissage: '#000000', contour: null, epaisseur: 1 };

const K = 0.5522847498;

/** Un rectangle, en chemin ferme ; vide si une dimension est nulle. */
export function rectangle(x: number, y: number, l: number, h: number): Commande[] {
  if (!(l > 0 && h > 0)) return [];
  return [{ c: 'M', p: [x, y] }, { c: 'L', p: [x + l, y] }, { c: 'L', p: [x + l, y + h] }, { c: 'L', p: [x, y + h] }, { c: 'Z', p: [] }];
}

/** Une ellipse inscrite dans la boite, en quatre cubiques ; vide si une dimension est nulle. */
export function ellipse(x: number, y: number, l: number, h: number): Commande[] {
  if (!(l > 0 && h > 0)) return [];
  const rx = l / 2, ry = h / 2, cx = x + rx, cy = y + ry, kx = rx * K, ky = ry * K;
  return [
    { c: 'M', p: [cx + rx, cy] },
    { c: 'C', p: [cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry] },
    { c: 'C', p: [cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy] },
    { c: 'C', p: [cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry] },
    { c: 'C', p: [cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy] },
    { c: 'Z', p: [] }
  ];
}

/** Une etoile a `branches` pointes, inscrite dans la boite, le creux a `creux` du rayon. */
export function etoile(x: number, y: number, l: number, h: number, branches = 5, creux = 0.4): Commande[] {
  if (!(l > 0 && h > 0) || branches < 3) return [];
  const rx = l / 2, ry = h / 2, cx = x + rx, cy = y + ry, out: Commande[] = [];
  for (let i = 0; i < branches * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / branches, r = i % 2 ? creux : 1;
    out.push({ c: i ? 'L' : 'M', p: [cx + rx * r * Math.cos(a), cy + ry * r * Math.sin(a)] });
  }
  out.push({ c: 'Z', p: [] });
  return out;
}

/** Une ligne brisee par ses points ; fermee en polygone si `fermer`. Vide sous deux points. */
export function polygone(points: readonly (readonly [number, number])[], fermer: boolean): Commande[] {
  if (points.length < 2) return [];
  const out: Commande[] = points.map((p, i) => ({ c: i ? 'L' : 'M', p: [p[0], p[1]] }));
  if (fermer && points.length > 2) out.push({ c: 'Z', p: [] });
  return out;
}

/** Ajoute une forme au premier plan avec le style donne ; rend le dessin et son identifiant. */
export function ajouterForme(dessin: DessinSvg, d: Chemin, style: Style): { dessin: DessinSvg; id: string | null } {
  if (!d.length) return { dessin, id: null };
  const id = 'f' + prochainId(dessin);
  const contour = style.contour, remplissage = style.remplissage ?? (contour ? null : '#000000');
  const forme: Forme = { id, d, remplissage, contour, epaisseur: contour ? style.epaisseur || 1 : 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false };
  return { dessin: { ...dessin, formes: [...dessin.formes, forme] }, id };
}
