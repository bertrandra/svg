// Le chemin d'une forme : lecture de l'attribut `d` en commandes absolues M, L, C, Q, Z, ecriture,
// ancres et point de depart d'une commande. Pur, sans autre dependance que les types.

import type { Chemin, Commande } from './types.js';

const NOMBRE = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;

/**
 * Un attribut `d` en commandes absolues M, L, C, Q, Z. H et V deviennent L, S et T leur forme
 * explicite, un arc des cubiques. Comme un navigateur, on garde ce qui precede une erreur.
 */
export function lireChemin(d: string): Commande[] {
  const out: Commande[] = [];
  let i = 0, x = 0, y = 0, sx = 0, sy = 0, cmd = '';
  let ctrlC: [number, number] | null = null, ctrlQ: [number, number] | null = null;
  const blanc = () => { while (i < d.length && /[\s,]/.test(d.charAt(i))) i++; };
  const nombre = (): number | null => {
    blanc();
    NOMBRE.lastIndex = i;
    const m = NOMBRE.exec(d);
    if (!m) return null;
    i = NOMBRE.lastIndex;
    return Number(m[0]);
  };
  const drapeau = (): number | null => {
    blanc();
    const c = d.charAt(i);
    if (c !== '0' && c !== '1') return null;
    i++;
    return Number(c);
  };
  const nombres = (n: number): number[] | null => {
    const r: number[] = [];
    for (let k = 0; k < n; k++) { const v = nombre(); if (v === null) return null; r.push(v); }
    return r;
  };
  for (;;) {
    blanc();
    if (i >= d.length) break;
    const c = d.charAt(i);
    if (/[a-zA-Z]/.test(c)) { cmd = c; i++; } else if (!cmd || cmd === 'z' || cmd === 'Z') break;
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    const L = cmd.toUpperCase();
    if (L === 'Z') {
      out.push({ c: 'Z', p: [] });
      x = sx; y = sy; ctrlC = ctrlQ = null;
      continue;
    }
    if (L === 'M') {
      const v = nombres(2); if (!v) break;
      x = sx = ox + (v[0] ?? 0); y = sy = oy + (v[1] ?? 0);
      out.push({ c: 'M', p: [x, y] });
      cmd = rel ? 'l' : 'L'; ctrlC = ctrlQ = null;
    } else if (L === 'L' || L === 'H' || L === 'V') {
      const v = nombres(L === 'L' ? 2 : 1); if (!v) break;
      if (L === 'L') { x = ox + (v[0] ?? 0); y = oy + (v[1] ?? 0); } else if (L === 'H') x = ox + (v[0] ?? 0); else y = oy + (v[0] ?? 0);
      out.push({ c: 'L', p: [x, y] });
      ctrlC = ctrlQ = null;
    } else if (L === 'C' || L === 'S') {
      const v = nombres(L === 'C' ? 6 : 4); if (!v) break;
      let x1: number, y1: number, k = 0;
      if (L === 'C') { x1 = ox + (v[0] ?? 0); y1 = oy + (v[1] ?? 0); k = 2; } else { x1 = ctrlC ? 2 * x - ctrlC[0] : x; y1 = ctrlC ? 2 * y - ctrlC[1] : y; }
      const x2 = ox + (v[k] ?? 0), y2 = oy + (v[k + 1] ?? 0), ex = ox + (v[k + 2] ?? 0), ey = oy + (v[k + 3] ?? 0);
      out.push({ c: 'C', p: [x1, y1, x2, y2, ex, ey] });
      ctrlC = [x2, y2]; ctrlQ = null; x = ex; y = ey;
    } else if (L === 'Q' || L === 'T') {
      const v = nombres(L === 'Q' ? 4 : 2); if (!v) break;
      let x1: number, y1: number, k = 0;
      if (L === 'Q') { x1 = ox + (v[0] ?? 0); y1 = oy + (v[1] ?? 0); k = 2; } else { x1 = ctrlQ ? 2 * x - ctrlQ[0] : x; y1 = ctrlQ ? 2 * y - ctrlQ[1] : y; }
      const ex = ox + (v[k] ?? 0), ey = oy + (v[k + 1] ?? 0);
      out.push({ c: 'Q', p: [x1, y1, ex, ey] });
      ctrlQ = [x1, y1]; ctrlC = null; x = ex; y = ey;
    } else if (L === 'A') {
      const rx = nombre(), ry = nombre(), phi = nombre(), fa = drapeau(), fs = drapeau(), ax = nombre(), ay = nombre();
      if (rx === null || ry === null || phi === null || fa === null || fs === null || ax === null || ay === null) break;
      const ex = ox + ax, ey = oy + ay;
      if (!rx || !ry) out.push({ c: 'L', p: [ex, ey] });
      else for (const p of arcEnCubiques(x, y, rx, ry, phi, fa, fs, ex, ey)) out.push({ c: 'C', p });
      x = ex; y = ey; ctrlC = ctrlQ = null;
    } else break;
  }
  return out;
}

/** Un arc elliptique en cubiques d'au plus un quart de tour (SVG 1.1, annexe F.6.5). */
function arcEnCubiques(x1: number, y1: number, rx: number, ry: number, phiDeg: number, fa: number, fs: number, x2: number, y2: number): number[][] {
  if (x1 === x2 && y1 === y2) return [];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const phi = (phiDeg * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const xp = cos * dx + sin * dy, yp = -sin * dx + cos * dy;
  const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }
  const num = Math.max(0, rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp), den = rx * rx * yp * yp + ry * ry * xp * xp;
  const coef = (fa === fs ? -1 : 1) * (den ? Math.sqrt(num / den) : 0);
  const cxp = (coef * rx * yp) / ry, cyp = (-coef * ry * xp) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const ux = (xp - cxp) / rx, uy = (yp - cyp) / ry;
  const t1 = angle(1, 0, ux, uy);
  let dt = angle(ux, uy, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9)), pas = dt / n, k = (4 / 3) * Math.tan(pas / 4);
  const point = (a: number, b: number): [number, number] => [cx + rx * a * cos - ry * b * sin, cy + rx * a * sin + ry * b * cos];
  const r: number[][] = [];
  for (let s = 0, a = t1; s < n; s++, a += pas) {
    const c1 = Math.cos(a), s1 = Math.sin(a), c2 = Math.cos(a + pas), s2 = Math.sin(a + pas);
    const [ax, ay] = point(c1 - k * s1, s1 + k * c1), [bx, by] = point(c2 + k * s2, s2 - k * c2);
    const [ex, ey] = s === n - 1 ? [x2, y2] : point(c2, s2);
    r.push([ax, ay, bx, by, ex, ey]);
  }
  return r;
}

export const nb = (v: number, precision: number): string => {
  const r = Number(v.toFixed(precision));
  return Object.is(r, -0) ? '0' : String(r);
};

export function ecrireChemin(d: Chemin, precision = 2): string {
  return d.map(c => c.c + c.p.map(v => nb(v, precision)).join(' ')).join('');
}

/** Le point d'arrivee d'une commande, ou null pour Z. */
export function ancre(c: Commande): [number, number] | null {
  return c.c === 'Z' ? null : [c.p[c.p.length - 2] ?? 0, c.p[c.p.length - 1] ?? 0];
}

/** Le point d'ou part la commande `i` : l'ancre precedente, ou le debut du sous-chemin apres un Z. */
export function depart(d: Chemin, i: number): [number, number] {
  let debut: [number, number] = [0, 0];
  for (let k = 0; k < i; k++) {
    const c = d[k];
    if (!c) break;
    if (c.c === 'M') debut = [c.p[0] ?? 0, c.p[1] ?? 0];
  }
  for (let k = i - 1; k >= 0; k--) {
    const c = d[k];
    if (!c) break;
    if (c.c === 'Z') return debut;
    const a = ancre(c);
    if (a) return a;
  }
  return debut;
}
