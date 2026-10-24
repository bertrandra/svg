// Matrices et boites : composer des transformations, les appliquer a un chemin, mesurer la boite
// exacte d'une forme (extrema des courbes compris). Pur.

import type { Boite, Chemin, Commande, DessinSvg, Forme, Matrice } from './types.js';
import { IDENTITE } from './types.js';
import { ancre, depart } from './chemins.js';

export function multiplier(m: Matrice, n: Matrice): Matrice {
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
}

export const translation = (x: number, y: number): Matrice => [1, 0, 0, 1, x, y];
export const echelle = (sx: number, sy: number, ox = 0, oy = 0): Matrice => [sx, 0, 0, sy, ox - sx * ox, oy - sy * oy];
export function rotation(deg: number, ox = 0, oy = 0): Matrice {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return multiplier(translation(ox, oy), multiplier([c, s, -s, c, 0, 0], translation(-ox, -oy)));
}

/** L'attribut `transform`, compose de gauche a droite ; null s'il ne se lit pas. */
export function lireTransformation(t: string): Matrice | null {
  let m: Matrice = IDENTITE;
  // Un balayage colle (sticky) : chaque fonction se lit a la suite de la precedente, et la premiere qui ne se lit pas rend la liste
  // illisible. Une recherche globale suivie d'un retrait refaisait, sur une longue suite de « scale( » jamais fermes, un balayage
  // jusqu'a la fin du texte a chaque ouverture : quadratique, donc un gel de l'onglet sur un attribut de quelques centaines de Ko.
  const fonction = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/y;
  let i = 0;
  for (;;) {
    while (i < t.length && /[\s,]/.test(t.charAt(i))) i++;
    if (i >= t.length) return m;
    fonction.lastIndex = i;
    const r = fonction.exec(t);
    if (!r) return null;
    i = fonction.lastIndex;
    const v = (r[2] ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
    if (v.some(n => !Number.isFinite(n))) return null;
    const [a = 0, b, c, d, e, f] = v;
    let n: Matrice;
    switch (r[1]) {
      case 'matrix': if (v.length !== 6) return null; n = [a, b ?? 0, c ?? 0, d ?? 0, e ?? 0, f ?? 0]; break;
      case 'translate': n = translation(a, b ?? 0); break;
      case 'scale': n = echelle(a, b ?? a); break;
      case 'rotate': n = rotation(a, b ?? 0, c ?? 0); break;
      case 'skewX': n = [1, 0, Math.tan((a * Math.PI) / 180), 1, 0, 0]; break;
      default: n = [1, Math.tan((a * Math.PI) / 180), 0, 1, 0, 0];
    }
    m = multiplier(m, n);
  }
}

export function transformerChemin(d: Chemin, m: Matrice): Commande[] {
  return d.map(c => {
    const p: number[] = [];
    for (let k = 0; k + 1 < c.p.length; k += 2) {
      const x = c.p[k] ?? 0, y = c.p[k + 1] ?? 0;
      p.push(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]);
    }
    return { c: c.c, p };
  });
}

export const facteur = (m: Matrice): number => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

// Les valeurs de t ou une coordonnee de Bezier atteint un extremum, dans ]0, 1[.
function extremaCubique(a: number, b: number, c: number, d: number): number[] {
  const A = -a + 3 * b - 3 * c + d, B = 2 * (a - 2 * b + c), C = b - a;
  if (Math.abs(A) < 1e-12) return Math.abs(B) < 1e-12 ? [] : [-C / B];
  const disc = B * B - 4 * A * C;
  if (disc < 0) return [];
  const r = Math.sqrt(disc);
  return [(-B + r) / (2 * A), (-B - r) / (2 * A)];
}
const cubique = (a: number, b: number, c: number, d: number, t: number) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d;
const quadratique = (a: number, b: number, c: number, t: number) => (1 - t) ** 2 * a + 2 * (1 - t) * t * b + t * t * c;

/** La boite exacte d'un chemin (extrema des courbes compris), ou null s'il est vide. */
export function boiteChemin(d: Chemin): Boite | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const voir = (x: number, y: number) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  d.forEach((c, i) => {
    const a = ancre(c);
    if (!a) return;
    voir(a[0], a[1]);
    if (c.c === 'C' || c.c === 'Q') {
      const [px, py] = depart(d, i);
      voir(px, py);
      const p = c.p;
      for (const axe of [0, 1]) {
        const v0 = axe ? py : px;
        if (c.c === 'C') {
          for (const t of extremaCubique(v0, p[axe] ?? 0, p[2 + axe] ?? 0, p[4 + axe] ?? 0)) {
            if (t > 0 && t < 1) voir(cubique(px, p[0] ?? 0, p[2] ?? 0, p[4] ?? 0, t), cubique(py, p[1] ?? 0, p[3] ?? 0, p[5] ?? 0, t));
          }
        } else {
          const den = v0 - 2 * (p[axe] ?? 0) + (p[2 + axe] ?? 0);
          if (Math.abs(den) > 1e-12) {
            const t = (v0 - (p[axe] ?? 0)) / den;
            if (t > 0 && t < 1) voir(quadratique(px, p[0] ?? 0, p[2] ?? 0, t), quadratique(py, p[1] ?? 0, p[3] ?? 0, t));
          }
        }
      }
    }
  });
  return x0 === Infinity ? null : { x: x0, y: y0, l: x1 - x0, h: y1 - y0 };
}

export function unir(boites: readonly (Boite | null)[]): Boite | null {
  let r: Boite | null = null;
  for (const b of boites) {
    if (!b) continue;
    if (!r) { r = { ...b }; continue; }
    const x = Math.min(r.x, b.x), y = Math.min(r.y, b.y);
    r = { x, y, l: Math.max(r.x + r.l, b.x + b.l) - x, h: Math.max(r.y + r.h, b.y + b.h) - y };
  }
  return r;
}

export const seCroisent = (a: Boite, b: Boite): boolean => a.x <= b.x + b.l && b.x <= a.x + a.l && a.y <= b.y + b.h && b.y <= a.y + a.h;

const cacheBoites = new WeakMap<Forme, Boite | null>();
export function boiteForme(f: Forme): Boite | null {
  if (!cacheBoites.has(f)) cacheBoites.set(f, boiteChemin(f.d));
  return cacheBoites.get(f) ?? null;
}

export function boiteDe(dessin: DessinSvg, ids: readonly string[]): Boite | null {
  const voulus = new Set(ids);
  return unir(dessin.formes.filter(f => voulus.has(f.id)).map(boiteForme));
}
