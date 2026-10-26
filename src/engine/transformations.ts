// Les transformations numeriques d'une selection (ADR-0004) : tourner d'un angle, incliner,
// mettre a l'echelle en pourcentage, autour du centre de la boite. Et les aimants intelligents :
// pendant un deplacement, les bords et les centres des autres formes et du plan attirent ceux de la
// selection, a un seuil pres, et disent la ligne a montrer.

import { boiteDe, boiteForme, boitesReperes, echelle, multiplier, rotation, transformer, translation, type Boite, type DessinSvg, type Matrice } from './editionSvg.js';

/** Le centre d'une boite. */
export const centre = (b: Boite): [number, number] => [b.x + b.l / 2, b.y + b.h / 2];

/** Tourner la selection de `degres` autour du centre de sa boite (ou d'un point donne). */
export function tournerAutour(dessin: DessinSvg, ids: readonly string[], degres: number, pivot?: readonly [number, number]): DessinSvg {
  const b = boiteDe(dessin, ids);
  if (!b || !degres) return dessin;
  const [cx, cy] = pivot ?? centre(b);
  return transformer(dessin, ids, rotation(degres, cx, cy));
}

/** Incliner la selection de `ax` degres sur l'horizontale et `ay` sur la verticale, autour de son centre. */
export function incliner(dessin: DessinSvg, ids: readonly string[], ax: number, ay: number): DessinSvg {
  const b = boiteDe(dessin, ids);
  if (!b || (!ax && !ay)) return dessin;
  const [cx, cy] = centre(b);
  const tx = Math.tan((ax * Math.PI) / 180), ty = Math.tan((ay * Math.PI) / 180);
  const m: Matrice = multiplier(translation(cx, cy), multiplier([1, ty, tx, 1, 0, 0], translation(-cx, -cy)));
  return transformer(dessin, ids, m);
}

/** Mettre la selection a l'echelle, en facteurs (1 = inchange), autour de son centre. */
export function mettreALEchelle(dessin: DessinSvg, ids: readonly string[], kx: number, ky = kx): DessinSvg {
  const b = boiteDe(dessin, ids);
  if (!b || !(kx > 0) || !(ky > 0) || (kx === 1 && ky === 1)) return dessin;
  const [cx, cy] = centre(b);
  return transformer(dessin, ids, echelle(kx, ky, cx, cy));
}

/** L'angle, en degres, du centre `c` vers le point `p`, 0 vers la droite, croissant dans le sens horaire a l'ecran. */
export const angleVers = (c: readonly [number, number], p: readonly [number, number]): number => (Math.atan2(p[1] - c[1], p[0] - c[0]) * 180) / Math.PI;

export interface Aimant { axe: 'x' | 'y'; valeur: number; de: number; a: number }
export interface Aimantation { dx: number; dy: number; lignes: Aimant[] }

const reperes = (b: Boite) => ({ x: [b.x, b.x + b.l / 2, b.x + b.l], y: [b.y, b.y + b.h / 2, b.y + b.h] });

/**
 * Les reperes des autres formes et du plan, et ce qu'ils imposent a une boite qui bouge : le plus
 * petit decalage par axe sous le seuil, et les lignes a tracer. Les lignes vont du repere a la boite.
 */
export function aimanter(boite: Boite, cibles: readonly Boite[], seuil: number): Aimantation {
  const r = reperes(boite);
  let meilleur: Record<'x' | 'y', { d: number; valeur: number; cible: Boite } | null> = { x: null, y: null };
  for (const c of cibles) {
    const rc = reperes(c);
    for (const axe of ['x', 'y'] as const) {
      for (const mien of r[axe]) for (const sien of rc[axe]) {
        const d = sien - mien;
        if (Math.abs(d) <= seuil && (!meilleur[axe] || Math.abs(d) < Math.abs(meilleur[axe].d))) meilleur = { ...meilleur, [axe]: { d, valeur: sien, cible: c } };
      }
    }
  }
  const lignes: Aimant[] = [];
  const mx = meilleur.x, my = meilleur.y;
  if (mx) lignes.push({ axe: 'x', valeur: mx.valeur, de: Math.min(boite.y + mx.d * 0, mx.cible.y), a: Math.max(boite.y + boite.h, mx.cible.y + mx.cible.h) });
  if (my) lignes.push({ axe: 'y', valeur: my.valeur, de: Math.min(boite.x, my.cible.x), a: Math.max(boite.x + boite.l, my.cible.x + my.cible.l) });
  return { dx: mx?.d ?? 0, dy: my?.d ?? 0, lignes };
}

/**
 * Les boites qui servent d'aimants : le plan, chaque forme visible hors de la selection, et les reperes du document (ADR-0038),
 * en boites sans epaisseur (`boitesReperes`) : un bord ou le centre de la selection s'y accroche dans leur axe.
 */
export function ciblesAimants(dessin: DessinSvg, exclus: readonly string[]): Boite[] {
  const e = new Set(exclus);
  const [x, y, l, h] = dessin.vb;
  const r: Boite[] = [{ x, y, l, h }];
  for (const f of dessin.formes) {
    if (!f.visible || e.has(f.id)) continue;
    const b = boiteForme(f);
    if (b) r.push(b);
  }
  r.push(...boitesReperes(dessin));
  return r;
}
