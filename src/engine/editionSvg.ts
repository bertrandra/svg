// L'edition d'un dessin SVG, en pur (ADR-0001). Un SVG se lit en une liste de formes a plat, de la
// plus basse a la plus haute : chaque forme est un chemin en coordonnees absolues du plan de travail
// (transformations des groupes appliquees, cercles, rectangles et arcs ramenes a des courbes), avec
// son remplissage, son contour et son opacite resolus (attributs, classes, style, heritage). Toute
// operation rend un nouveau dessin et ne touche pas l'ancien : l'historique les garde tels quels.
//
// Ce qui ne se ramene pas a des chemins pleins (texte, image, degrade, masque, decoupe, <use>) est
// refuse a la lecture avec son nom : on n'edite pas un dessin qu'on ne saurait pas reecrire.

import { lireXml, echapperAttribut, type Noeud } from '../util/xml.js';

export type Lettre = 'M' | 'L' | 'C' | 'Q' | 'Z';
export interface Commande { readonly c: Lettre; readonly p: readonly number[] }
export type Chemin = readonly Commande[];

export interface Forme {
  readonly id: string;
  readonly d: Chemin;
  readonly remplissage: string | null;
  readonly contour: string | null;
  readonly epaisseur: number;
  readonly opacite: number;
  readonly regle: 'nonzero' | 'evenodd';
  readonly visible: boolean;
  readonly verrouille: boolean;
}

export interface DessinSvg { readonly vb: readonly [number, number, number, number]; readonly formes: readonly Forme[] }
export interface Boite { x: number; y: number; l: number; h: number }
export type Matrice = readonly [number, number, number, number, number, number];

export const IDENTITE: Matrice = [1, 0, 0, 1, 0, 0];

// ---------------------------------------------------------------- chemins

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

const nb = (v: number, precision: number): string => {
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

// ---------------------------------------------------------------- matrices et boites

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
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let r: RegExpExecArray | null;
  while ((r = re.exec(t))) {
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
  // Ce qui n'est pas une fonction lue rend la liste illisible : on ne devine pas.
  return t.replace(/(matrix|translate|scale|rotate|skewX|skewY)\s*\([^)]*\)/g, '').replace(/[\s,]/g, '') ? null : m;
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

const facteur = (m: Matrice): number => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

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

// ---------------------------------------------------------------- lecture

const NOMMEES: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00',
  gray: '#808080', grey: '#808080', orange: '#ffa500', purple: '#800080', navy: '#000080', silver: '#c0c0c0'
};

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** Une peinture en #rrggbb, null pour « none », ou la valeur telle quelle si elle est inconnue. */
export function lirePeinture(v: string): string | null {
  const t = v.trim().toLowerCase();
  if (t === 'none' || t === 'transparent') return null;
  if (t === 'currentcolor') return '#000000';
  let m = /^#([0-9a-f]{3,4})$/.exec(t);
  if (m) return '#' + (m[1] ?? '').slice(0, 3).split('').map(c => c + c).join('');
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(t);
  if (m) return '#' + (m[1] ?? '');
  m = /^rgba?\(\s*([\d.]+)(%?)[\s,]+([\d.]+)(%?)[\s,]+([\d.]+)(%?)/.exec(t);
  if (m) {
    const canal = (n: string | undefined, pc: string | undefined) => (pc ? (Number(n) * 255) / 100 : Number(n));
    return '#' + hex2(canal(m[1], m[2])) + hex2(canal(m[3], m[4])) + hex2(canal(m[5], m[6]));
  }
  return NOMMEES[t] ?? t;
}

type Proprietes = Record<string, string>;

function lireDeclarations(t: string): Proprietes {
  const r: Proprietes = {};
  for (const decl of t.split(';')) {
    const k = decl.indexOf(':');
    if (k > 0) r[decl.slice(0, k).trim().toLowerCase()] = decl.slice(k + 1).replace(/!important/i, '').trim();
  }
  return r;
}

/** Les regles de classe d'une feuille <style> : `.a, .b { fill: … }`. Les autres selecteurs sont ignores. */
function lireFeuille(t: string): Map<string, Proprietes> {
  const classes = new Map<string, Proprietes>();
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t.replace(/\/\*[\s\S]*?\*\//g, '')))) {
    const decl = lireDeclarations(m[2] ?? '');
    for (const sel of (m[1] ?? '').split(',').map(s => s.trim())) {
      const c = /^\.([\w-]+)$/.exec(sel);
      if (c?.[1]) classes.set(c[1], { ...(classes.get(c[1]) ?? {}), ...decl });
    }
  }
  return classes;
}

const PROPRIETES = ['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'fill-rule', 'display', 'visibility', 'clip-path', 'mask', 'filter'];
const HERITEES = ['fill', 'stroke', 'stroke-width', 'fill-rule', 'visibility', 'fill-opacity'];
const IGNORES = new Set(['defs', 'title', 'desc', 'metadata', 'style', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'pattern', 'symbol', 'marker', 'filter']);
const NON_PRIS: Record<string, string> = {
  text: 'du texte (vectorisez-le dans votre logiciel)', image: 'une image', use: 'un clone <use>', foreignObject: 'un objet étranger', svg: 'un SVG imbriqué', switch: 'un aiguillage <switch>'
};

interface Contexte { m: Matrice; heritees: Proprietes; opacite: number }

/** Le dessin d'un SVG, ou ce qui empeche de l'editer. */
export function lireDessin(svg: string): { dessin: DessinSvg } | { erreur: string } {
  const doc = lireXml(svg);
  const racine = doc?.enfants.find(e => e.nom === 'svg');
  if (!racine) return { erreur: 'Ce SVG ne se lit pas.' };
  const vb = (racine.attributs.viewBox ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
  const l = Number.parseFloat(racine.attributs.width ?? ''), h = Number.parseFloat(racine.attributs.height ?? '');
  const plan: [number, number, number, number] | null = vb.length === 4 && vb.every(Number.isFinite) && (vb[2] ?? 0) > 0 && (vb[3] ?? 0) > 0
    ? [vb[0] ?? 0, vb[1] ?? 0, vb[2] ?? 0, vb[3] ?? 0] : l > 0 && h > 0 ? [0, 0, l, h] : null;
  if (!plan) return { erreur: 'Ce SVG n’a ni viewBox ni dimensions.' };
  let feuille = '';
  const ramasser = (n: Noeud) => { if (n.nom === 'style') feuille += n.texte + '\n'; n.enfants.forEach(ramasser); };
  ramasser(racine);
  const classes = lireFeuille(feuille);
  const formes: Forme[] = [];
  const refus = new Set<string>();
  const proprietes = (n: Noeud): Proprietes => {
    const r: Proprietes = {};
    for (const p of PROPRIETES) { const v = n.attributs[p]; if (v !== undefined) r[p] = v; }
    for (const c of (n.attributs.class ?? '').split(/\s+/).filter(Boolean)) Object.assign(r, classes.get(c) ?? {});
    Object.assign(r, lireDeclarations(n.attributs.style ?? ''));
    return r;
  };
  const visiter = (n: Noeud, ctx: Contexte) => {
    if (IGNORES.has(n.nom)) return;
    const pr = proprietes(n);
    if ((pr.display ?? '').trim() === 'none') return;
    const nonPris = NON_PRIS[n.nom];
    if (nonPris) { refus.add(nonPris); return; }
    if ((pr['clip-path'] && pr['clip-path'] !== 'none') || (pr.mask && pr.mask !== 'none')) { refus.add('un masque ou une découpe'); return; }
    if (pr.filter && pr.filter !== 'none') { refus.add('un filtre'); return; }
    const t = n.attributs.transform ? lireTransformation(n.attributs.transform) : IDENTITE;
    if (!t) { refus.add('une transformation illisible'); return; }
    const heritees: Proprietes = { ...ctx.heritees };
    for (const p of HERITEES) if (pr[p] !== undefined && pr[p] !== 'inherit') heritees[p] = pr[p] ?? '';
    const opacite = ctx.opacite * (pr.opacity !== undefined ? Math.max(0, Math.min(1, Number(pr.opacity) || 0)) : 1);
    const m = multiplier(ctx.m, t);
    if (n.nom === 'g' || n.nom === 'a') { n.enfants.forEach(e => visiter(e, { m, heritees, opacite })); return; }
    const d = cheminDeForme(n);
    if (d === undefined) return;
    if ((heritees.visibility ?? '').trim() === 'hidden') return;
    const peinture = (p: string | undefined, defaut: string | null) => (p === undefined ? defaut : lirePeinture(p));
    // Une ligne n'a pas d'aire : seul son contour se voit.
    const remplissage = n.nom === 'line' ? null : peinture(heritees.fill, '#000000');
    const contour = peinture(heritees.stroke, null);
    if ((remplissage && remplissage.startsWith('url(')) || (contour && contour.startsWith('url('))) { refus.add('un dégradé ou un motif'); return; }
    const fo = heritees['fill-opacity'] !== undefined ? Math.max(0, Math.min(1, Number(heritees['fill-opacity']) || 0)) : 1;
    formes.push({
      id: 'f' + (formes.length + 1),
      d: transformerChemin(d, m),
      remplissage,
      contour,
      epaisseur: contour ? (Number.parseFloat(heritees['stroke-width'] ?? '1') || 1) * facteur(m) : 0,
      opacite: Math.round(opacite * fo * 1000) / 1000,
      regle: (heritees['fill-rule'] ?? '').trim() === 'evenodd' ? 'evenodd' : 'nonzero',
      visible: true,
      verrouille: false
    });
  };
  racine.enfants.forEach(e => visiter(e, { m: IDENTITE, heritees: {}, opacite: 1 }));
  if (refus.size) return { erreur: 'Ce SVG contient ' + [...refus].join(', ') + ' : il ne s’édite pas ici. Vectorisez l’image, ou simplifiez-le dans votre logiciel.' };
  if (!formes.length) return { erreur: 'Ce SVG ne contient aucune forme à éditer.' };
  return { dessin: { vb: plan, formes: formes.filter(f => f.d.length > 0) } };
}

const nombreAttr = (n: Noeud, a: string, defaut = 0) => { const v = Number.parseFloat(n.attributs[a] ?? ''); return Number.isFinite(v) ? v : defaut; };

/** Le chemin d'un element de forme, ou undefined si ce n'en est pas un. */
function cheminDeForme(n: Noeud): Commande[] | undefined {
  switch (n.nom) {
    case 'path': return lireChemin(n.attributs.d ?? '');
    case 'rect': {
      const x = nombreAttr(n, 'x'), y = nombreAttr(n, 'y'), l = nombreAttr(n, 'width'), h = nombreAttr(n, 'height');
      if (!(l > 0 && h > 0)) return [];
      let rx = nombreAttr(n, 'rx', NaN), ry = nombreAttr(n, 'ry', NaN);
      if (Number.isNaN(rx)) rx = Number.isNaN(ry) ? 0 : ry;
      if (Number.isNaN(ry)) ry = rx;
      rx = Math.min(rx, l / 2); ry = Math.min(ry, h / 2);
      if (!(rx > 0 && ry > 0)) return lireChemin(`M${x} ${y}H${x + l}V${y + h}H${x}Z`);
      return lireChemin(`M${x + rx} ${y}H${x + l - rx}A${rx} ${ry} 0 0 1 ${x + l} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + l - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`);
    }
    case 'circle':
    case 'ellipse': {
      const cx = nombreAttr(n, 'cx'), cy = nombreAttr(n, 'cy');
      const rx = n.nom === 'circle' ? nombreAttr(n, 'r') : nombreAttr(n, 'rx'), ry = n.nom === 'circle' ? rx : nombreAttr(n, 'ry');
      if (!(rx > 0 && ry > 0)) return [];
      return lireChemin(`M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`);
    }
    case 'line': return lireChemin(`M${nombreAttr(n, 'x1')} ${nombreAttr(n, 'y1')}L${nombreAttr(n, 'x2')} ${nombreAttr(n, 'y2')}`);
    case 'polyline':
    case 'polygon': {
      const p = (n.attributs.points ?? '').trim();
      return p ? lireChemin('M' + p + (n.nom === 'polygon' ? 'Z' : '')) : [];
    }
    default: return undefined;
  }
}

// ---------------------------------------------------------------- ecriture

export function ecrireForme(f: Forme, precision = 2): string {
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

// ---------------------------------------------------------------- operations sur les formes

function surFormes(dessin: DessinSvg, ids: readonly string[], f: (forme: Forme) => Forme): DessinSvg {
  const voulus = new Set(ids);
  let change = false;
  const formes = dessin.formes.map(x => {
    if (!voulus.has(x.id)) return x;
    const y = f(x);
    if (y !== x) change = true;
    return y;
  });
  return change ? { ...dessin, formes } : dessin;
}

export function transformer(dessin: DessinSvg, ids: readonly string[], m: Matrice): DessinSvg {
  const k = facteur(m);
  return surFormes(dessin, ids, f => ({ ...f, d: transformerChemin(f.d, m), epaisseur: f.epaisseur * k }));
}

export const deplacer = (dessin: DessinSvg, ids: readonly string[], dx: number, dy: number): DessinSvg =>
  dx === 0 && dy === 0 ? dessin : transformer(dessin, ids, translation(dx, dy));

/** Retourner la selection autour du centre de sa boite. */
export function retourner(dessin: DessinSvg, ids: readonly string[], axe: 'h' | 'v'): DessinSvg {
  const b = boiteDe(dessin, ids);
  if (!b) return dessin;
  return transformer(dessin, ids, axe === 'h' ? echelle(-1, 1, b.x + b.l / 2, 0) : echelle(1, -1, 0, b.y + b.h / 2));
}

export function tourner(dessin: DessinSvg, ids: readonly string[], degres: number): DessinSvg {
  const b = boiteDe(dessin, ids);
  if (!b) return dessin;
  return transformer(dessin, ids, rotation(degres, b.x + b.l / 2, b.y + b.h / 2));
}

/** Donner a la selection une boite nouvelle, a partir de son coin haut gauche. */
export function redimensionner(dessin: DessinSvg, ids: readonly string[], cible: Boite): DessinSvg {
  const b = boiteDe(dessin, ids);
  if (!b || !(cible.l > 0) || !(cible.h > 0)) return dessin;
  const sx = b.l > 0 ? cible.l / b.l : 1, sy = b.h > 0 ? cible.h / b.h : 1;
  return transformer(dessin, ids, multiplier(translation(cible.x - b.x, cible.y - b.y), echelle(sx, sy, b.x, b.y)));
}

export type Alignement = 'gauche' | 'centreH' | 'droite' | 'haut' | 'centreV' | 'bas';

/** Aligner chaque forme sur la boite de la selection, ou sur le plan de travail pour une seule. */
export function aligner(dessin: DessinSvg, ids: readonly string[], a: Alignement): DessinSvg {
  const [vx, vy, vl, vh] = dessin.vb;
  const ref = ids.length > 1 ? boiteDe(dessin, ids) : { x: vx, y: vy, l: vl, h: vh };
  if (!ref) return dessin;
  let r = dessin;
  for (const id of ids) {
    const b = boiteDe(r, [id]);
    if (!b) continue;
    const dx = a === 'gauche' ? ref.x - b.x : a === 'droite' ? ref.x + ref.l - b.x - b.l : a === 'centreH' ? ref.x + ref.l / 2 - b.x - b.l / 2 : 0;
    const dy = a === 'haut' ? ref.y - b.y : a === 'bas' ? ref.y + ref.h - b.y - b.h : a === 'centreV' ? ref.y + ref.h / 2 - b.y - b.h / 2 : 0;
    r = deplacer(r, [id], dx, dy);
  }
  return r;
}

export type Reglage = Partial<Pick<Forme, 'remplissage' | 'contour' | 'epaisseur' | 'opacite' | 'regle' | 'visible' | 'verrouille'>>;

export function modifier(dessin: DessinSvg, ids: readonly string[], r: Reglage): DessinSvg {
  return surFormes(dessin, ids, f => {
    const champs = Object.keys(r) as (keyof Reglage)[];
    if (champs.every(k => f[k] === r[k])) return f;
    const g = { ...f, ...r } as Forme;
    return g.contour && !(g.epaisseur > 0) ? { ...g, epaisseur: 1 } : g;
  });
}

export function supprimer(dessin: DessinSvg, ids: readonly string[]): DessinSvg {
  const voulus = new Set(ids);
  const formes = dessin.formes.filter(f => !voulus.has(f.id));
  return formes.length === dessin.formes.length ? dessin : { ...dessin, formes };
}

export function prochainId(dessin: DessinSvg): number {
  return dessin.formes.reduce((m, f) => Math.max(m, Number(/^f(\d+)$/.exec(f.id)?.[1] ?? 0)), 0) + 1;
}

/** Copier la selection juste au-dessus de chaque original, decalee ; rend les nouveaux identifiants. */
export function dupliquer(dessin: DessinSvg, ids: readonly string[], dx = 0, dy = 0): { dessin: DessinSvg; ids: string[] } {
  const voulus = new Set(ids);
  let n = prochainId(dessin);
  const nouveaux: string[] = [];
  const formes: Forme[] = [];
  for (const f of dessin.formes) {
    formes.push(f);
    if (!voulus.has(f.id)) continue;
    const id = 'f' + n++;
    nouveaux.push(id);
    formes.push({ ...f, id, verrouille: false, d: dx || dy ? transformerChemin(f.d, translation(dx, dy)) : f.d });
  }
  return { dessin: nouveaux.length ? { ...dessin, formes } : dessin, ids: nouveaux };
}

export type Ordre = 'premier' | 'avant' | 'arriere' | 'dernier';

/** Changer la place des formes dans l'empilement ; `premier` est le premier plan, en haut. */
export function ordonner(dessin: DessinSvg, ids: readonly string[], o: Ordre): DessinSvg {
  const voulus = new Set(ids);
  const choisies = dessin.formes.filter(f => voulus.has(f.id)), autres = dessin.formes.filter(f => !voulus.has(f.id));
  if (!choisies.length) return dessin;
  const meme = (t: readonly Forme[]) => t.every((f, i) => f === dessin.formes[i]);
  if (o === 'premier' || o === 'dernier') {
    const t = o === 'premier' ? [...autres, ...choisies] : [...choisies, ...autres];
    return meme(t) ? dessin : { ...dessin, formes: t };
  }
  const t = [...dessin.formes];
  if (o === 'avant') {
    for (let i = t.length - 2; i >= 0; i--) {
      const a = t[i], b = t[i + 1];
      if (a && b && voulus.has(a.id) && !voulus.has(b.id)) { t[i] = b; t[i + 1] = a; }
    }
  } else {
    for (let i = 1; i < t.length; i++) {
      const a = t[i - 1], b = t[i];
      if (a && b && voulus.has(b.id) && !voulus.has(a.id)) { t[i - 1] = b; t[i] = a; }
    }
  }
  return meme(t) ? dessin : { ...dessin, formes: t };
}

// ---------------------------------------------------------------- couleurs et nettoyage

export interface CouleurDuDessin { couleur: string; formes: number }

/** Les couleurs employees (remplissages et contours des formes visibles), les plus presentes d'abord. */
export function couleursDuDessin(dessin: DessinSvg): CouleurDuDessin[] {
  const n = new Map<string, number>();
  for (const f of dessin.formes) {
    if (!f.visible) continue;
    for (const c of [f.remplissage, f.contour]) if (c) n.set(c, (n.get(c) ?? 0) + 1);
  }
  return [...n].map(([couleur, formes]) => ({ couleur, formes })).sort((a, b) => b.formes - a.formes || (a.couleur < b.couleur ? -1 : 1));
}

export function remplacerCouleur(dessin: DessinSvg, de: string, vers: string | null): DessinSvg {
  let change = false;
  const formes = dessin.formes.map(f => {
    const r = f.remplissage === de ? vers : f.remplissage, c = f.contour === de ? vers : f.contour;
    if (r === f.remplissage && c === f.contour) return f;
    change = true;
    return { ...f, remplissage: r, contour: c, epaisseur: c ? f.epaisseur || 1 : f.epaisseur };
  });
  return change ? { ...dessin, formes } : dessin;
}

export const idsDeCouleur = (dessin: DessinSvg, couleur: string): string[] =>
  dessin.formes.filter(f => f.visible && !f.verrouille && (f.remplissage === couleur || f.contour === couleur)).map(f => f.id);

/** La couleur lue sur le remplissage, sur le contour, ou sur l'un et l'autre. */
export type SurCouleur = 'tout' | 'remplissage' | 'contour';

/** Les formes d'une couleur : toutes, et celles qu'on peut choisir (visibles et non verrouillees). */
export interface GroupeCouleur { couleur: string; ids: string[]; libres: string[]; visibles: number; verrouillees: number }

/**
 * Les couleurs du dessin avec toutes leurs formes, cachees et verrouillees comprises : une couleur
 * dont on a tout masque doit rester dans la liste, sans quoi on ne pourrait plus la rendre.
 */
export function groupesDeCouleur(dessin: DessinSvg, sur: SurCouleur = 'tout'): GroupeCouleur[] {
  const groupes = new Map<string, Forme[]>();
  for (const f of dessin.formes) {
    const lues = sur === 'remplissage' ? [f.remplissage] : sur === 'contour' ? [f.contour] : f.remplissage === f.contour ? [f.remplissage] : [f.remplissage, f.contour];
    for (const c of lues) if (c) groupes.set(c, [...(groupes.get(c) ?? []), f]);
  }
  return [...groupes]
    .map(([couleur, fs]) => ({
      couleur, ids: fs.map(f => f.id), libres: fs.filter(f => f.visible && !f.verrouille).map(f => f.id),
      visibles: fs.filter(f => f.visible).length, verrouillees: fs.filter(f => f.verrouille).length
    }))
    .sort((a, b) => b.ids.length - a.ids.length || (a.couleur < b.couleur ? -1 : 1));
}

/** N'afficher que ces formes : toutes les autres se masquent. */
export function montrerSeulement(dessin: DessinSvg, ids: readonly string[]): DessinSvg {
  const voulus = new Set(ids);
  let change = false;
  const formes = dessin.formes.map(f => {
    const visible = voulus.has(f.id);
    if (f.visible === visible) return f;
    change = true;
    return { ...f, visible };
  });
  return change ? { ...dessin, formes } : dessin;
}

/** Retirer les formes pleines dont la boite couvre moins de `part` du plan de travail : les poussieres du trace. */
export function retirerPetites(dessin: DessinSvg, part: number): { dessin: DessinSvg; retirees: number } {
  const seuil = dessin.vb[2] * dessin.vb[3] * part;
  const formes = dessin.formes.filter(f => {
    if (f.verrouille || !f.remplissage || f.contour) return true;
    const b = boiteForme(f);
    return !b || b.l * b.h >= seuil;
  });
  const retirees = dessin.formes.length - formes.length;
  return { dessin: retirees ? { ...dessin, formes } : dessin, retirees };
}

const memeStyle = (a: Forme, b: Forme) => a.remplissage === b.remplissage && a.contour === b.contour && a.epaisseur === b.epaisseur
  && a.opacite === b.opacite && a.regle === b.regle && a.visible === b.visible && !a.verrouille && !b.verrouille;

/**
 * Reunir en un seul chemin les formes voisines dans l'empilement qui ont le meme style et ne se
 * chevauchent pas : le rendu est identique (rien ne s'intercale, aucun sens de trace n'interfere)
 * et le calque se lit mieux.
 */
export function regrouper(dessin: DessinSvg): { dessin: DessinSvg; reunies: number } {
  const formes: Forme[] = [];
  let boites: Boite[] = [], reunies = 0;
  for (const f of dessin.formes) {
    const precedente = formes[formes.length - 1], b = boiteForme(f);
    if (precedente && b && memeStyle(precedente, f) && boites.every(x => !seCroisent(x, b))) {
      formes[formes.length - 1] = { ...precedente, d: [...precedente.d, ...f.d] };
      boites.push(b);
      reunies++;
      continue;
    }
    formes.push(f);
    boites = b ? [b] : [];
  }
  return { dessin: reunies ? { ...dessin, formes } : dessin, reunies };
}

/** Ramener le plan de travail au dessin visible, avec une marge en part de sa plus grande dimension. */
export function ajusterPlan(dessin: DessinSvg, marge = 0.02): DessinSvg {
  const b = unir(dessin.formes.filter(f => f.visible).map(f => {
    const x = boiteForme(f), e = f.contour ? f.epaisseur / 2 : 0;
    return x && { x: x.x - e, y: x.y - e, l: x.l + 2 * e, h: x.h + 2 * e };
  }));
  if (!b || !(b.l > 0) || !(b.h > 0)) return dessin;
  const m = Math.max(b.l, b.h) * marge;
  return { ...dessin, vb: [b.x - m, b.y - m, b.l + 2 * m, b.h + 2 * m] };
}

// ---------------------------------------------------------------- points

const memePoint = (a: readonly number[] | null, b: readonly number[] | null) => !!a && !!b && Math.abs((a[0] ?? 0) - (b[0] ?? 0)) < 1e-6 && Math.abs((a[1] ?? 0) - (b[1] ?? 0)) < 1e-6;

/** Les bornes [debut, fin[ du sous-chemin qui contient la commande `i`. */
function sousChemin(d: Chemin, i: number): [number, number] {
  let a = i;
  while (a > 0 && d[a]?.c !== 'M') a--;
  let b = i + 1;
  while (b < d.length && d[b]?.c !== 'M') b++;
  return [a, b];
}

/** L'autre bout d'un sous-chemin ferme dont l'arrivee retombe sur le depart : bouger l'un bouge l'autre. */
function jumeau(d: Chemin, i: number): number | null {
  const [a, b] = sousChemin(d, i);
  let dernier = b - 1;
  while (dernier > a && d[dernier]?.c === 'Z') dernier--;
  if (dernier <= a) return null;
  const da = d[a], dd = d[dernier];
  if (!da || !dd || !memePoint(ancre(da), ancre(dd))) return null;
  return i === a ? dernier : i === dernier ? a : null;
}

function avecPoints(d: Chemin, i: number, f: (p: number[]) => void): Commande[] {
  return d.map((c, k) => {
    if (k !== i) return c;
    const p = [...c.p];
    f(p);
    return { c: c.c, p };
  });
}

function surChemin(dessin: DessinSvg, id: string, f: (d: Chemin) => Chemin | null): DessinSvg {
  return surFormes(dessin, [id], forme => {
    const d = f(forme.d);
    return d && d !== forme.d ? { ...forme, d } : forme;
  });
}

/** Deplacer l'ancre `i` ; ses poignees la suivent, et son jumeau si le sous-chemin se referme sur elle. */
export function deplacerAncre(dessin: DessinSvg, id: string, i: number, x: number, y: number): DessinSvg {
  return surChemin(dessin, id, d => {
    const c = d[i], a = c && ancre(c);
    if (!c || !a) return null;
    const dx = x - a[0], dy = y - a[1];
    const decaler = (t: Chemin, k: number): Chemin => {
      let r = avecPoints(t, k, p => { p[p.length - 2] = (p[p.length - 2] ?? 0) + dx; p[p.length - 1] = (p[p.length - 1] ?? 0) + dy; });
      const ck = r[k];
      if (ck?.c === 'C') r = avecPoints(r, k, p => { p[2] = (p[2] ?? 0) + dx; p[3] = (p[3] ?? 0) + dy; });
      const suivante = r[k + 1];
      if (suivante?.c === 'C') r = avecPoints(r, k + 1, p => { p[0] = (p[0] ?? 0) + dx; p[1] = (p[1] ?? 0) + dy; });
      return r;
    };
    let r = decaler(d, i);
    const j = jumeau(d, i);
    if (j !== null) r = decaler(r, j);
    return r;
  });
}

/** Deplacer une poignee : la premiere (k = 0) ou la seconde (k = 1) d'une cubique, celle d'une quadratique. */
export function deplacerPoignee(dessin: DessinSvg, id: string, i: number, k: 0 | 1, x: number, y: number): DessinSvg {
  return surChemin(dessin, id, d => {
    const c = d[i];
    if (!c || (c.c !== 'C' && !(c.c === 'Q' && k === 0))) return null;
    return avecPoints(d, i, p => { p[2 * k] = x; p[2 * k + 1] = y; });
  });
}

/** Retirer l'ancre `i`. Un sous-chemin garde au moins deux segments ; son depart ne se retire pas. */
export function supprimerAncre(dessin: DessinSvg, id: string, i: number): DessinSvg | { erreur: string } {
  const forme = dessin.formes.find(f => f.id === id), c = forme?.d[i];
  if (!forme || !c) return dessin;
  if (c.c === 'M' || c.c === 'Z') return { erreur: 'Le point de départ ne se retire pas : retirez son voisin.' };
  const [a, b] = sousChemin(forme.d, i);
  const segments = forme.d.slice(a + 1, b).filter(x => x.c !== 'Z').length;
  if (segments <= 2) return { erreur: 'Un tracé garde au moins trois points : supprimez plutôt la forme.' };
  const d = forme.d.filter((_, k) => k !== i);
  const suivante = forme.d[i + 1];
  // La courbe suivante partait de l'ancre retiree : sa premiere poignee reprend celle de la courbe retiree.
  const r = suivante?.c === 'C' && c.c === 'C' ? avecPoints(d, i, p => { p[0] = c.p[0] ?? 0; p[1] = c.p[1] ?? 0; }) : d;
  return surChemin(dessin, id, () => r);
}

/** Couper le segment `i` en son milieu : un point de plus, la courbe inchangee (de Casteljau). */
export function diviserSegment(dessin: DessinSvg, id: string, i: number): DessinSvg {
  return surChemin(dessin, id, d => {
    const c = d[i];
    if (!c || c.c === 'M' || c.c === 'Z') return null;
    const [x0, y0] = depart(d, i), p = c.p;
    const mi = (a: number, b: number) => (a + b) / 2;
    let deux: Commande[];
    if (c.c === 'L') deux = [{ c: 'L', p: [mi(x0, p[0] ?? 0), mi(y0, p[1] ?? 0)] }, c];
    else if (c.c === 'Q') {
      const ax = mi(x0, p[0] ?? 0), ay = mi(y0, p[1] ?? 0), bx = mi(p[0] ?? 0, p[2] ?? 0), by = mi(p[1] ?? 0, p[3] ?? 0);
      deux = [{ c: 'Q', p: [ax, ay, mi(ax, bx), mi(ay, by)] }, { c: 'Q', p: [bx, by, p[2] ?? 0, p[3] ?? 0] }];
    } else {
      const [x1, y1, x2, y2, x3, y3] = [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 0, p[4] ?? 0, p[5] ?? 0];
      const ax = mi(x0, x1), ay = mi(y0, y1), bx = mi(x1, x2), by = mi(y1, y2), cx = mi(x2, x3), cy = mi(y2, y3);
      const dx = mi(ax, bx), dy = mi(ay, by), ex = mi(bx, cx), ey = mi(by, cy), fx = mi(dx, ex), fy = mi(dy, ey);
      deux = [{ c: 'C', p: [ax, ay, dx, dy, fx, fy] }, { c: 'C', p: [ex, ey, cx, cy, x3, y3] }];
    }
    return [...d.slice(0, i), ...deux, ...d.slice(i + 1)];
  });
}

/** Un segment courbe devient droit, un droit devient une courbe a poignees au tiers. */
export function basculerSegment(dessin: DessinSvg, id: string, i: number): DessinSvg {
  return surChemin(dessin, id, d => {
    const c = d[i], a = c && ancre(c);
    if (!c || !a || c.c === 'M') return null;
    if (c.c === 'C' || c.c === 'Q') return d.map((x, k) => (k === i ? { c: 'L' as const, p: a } : x));
    const [x0, y0] = depart(d, i);
    const p = [x0 + (a[0] - x0) / 3, y0 + (a[1] - y0) / 3, x0 + (2 * (a[0] - x0)) / 3, y0 + (2 * (a[1] - y0)) / 3, a[0], a[1]];
    return d.map((x, k) => (k === i ? { c: 'C' as const, p } : x));
  });
}

export interface Statistiques { formes: number; points: number; octets: number }

export function statistiques(dessin: DessinSvg): Statistiques {
  const visibles = dessin.formes.filter(f => f.visible);
  return { formes: visibles.length, points: visibles.reduce((n, f) => n + f.d.filter(c => c.c !== 'Z').length, 0), octets: ecrireDessin(dessin).length };
}

// ---------------------------------------------------------------- dessiner et inserer

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

/**
 * Insere les formes visibles d'un autre dessin au premier plan, ramenees dans la boite cible en
 * gardant leurs proportions, centrees ; rend les identifiants nouveaux.
 */
export function inserer(dessin: DessinSvg, autre: DessinSvg, cible: Boite): { dessin: DessinSvg; ids: string[] } {
  const visibles = autre.formes.filter(f => f.visible);
  const b = unir(visibles.map(boiteForme));
  if (!b || !(cible.l > 0) || !(cible.h > 0)) return { dessin, ids: [] };
  const k = b.l > 0 && b.h > 0 ? Math.min(cible.l / b.l, cible.h / b.h) : 1;
  const m = multiplier(translation(cible.x + (cible.l - b.l * k) / 2 - b.x * k, cible.y + (cible.h - b.h * k) / 2 - b.y * k), echelle(k, k));
  let n = prochainId(dessin);
  const ids: string[] = [];
  const formes = visibles.map(f => {
    const id = 'f' + n++;
    ids.push(id);
    return { ...f, id, verrouille: false, d: transformerChemin(f.d, m), epaisseur: f.epaisseur * k };
  });
  return { dessin: { ...dessin, formes: [...dessin.formes, ...formes] }, ids };
}

// ---------------------------------------------------------------- combiner, separer, coller, grille

/**
 * Reunir les formes choisies en une seule, au style et a la place de la plus haute dans
 * l'empilement : un chemin a plusieurs sous-chemins, que la regle pair-impair sait creuser.
 */
export function combiner(dessin: DessinSvg, ids: readonly string[]): { dessin: DessinSvg; id: string | null } {
  const voulus = new Set(ids);
  const choisies = dessin.formes.filter(f => voulus.has(f.id) && !f.verrouille);
  const haute = choisies[choisies.length - 1];
  if (!haute || choisies.length < 2) return { dessin, id: null };
  const unie: Forme = { ...haute, d: choisies.flatMap(f => f.d) };
  const formes = dessin.formes.filter(f => !voulus.has(f.id) || f.verrouille || f === haute).map(f => (f === haute ? unie : f));
  return { dessin: { ...dessin, formes }, id: unie.id };
}

/** Les sous-chemins d'un chemin : chacun commence a un M. */
export function sousChemins(d: Chemin): Chemin[] {
  const r: Commande[][] = [];
  for (const c of d) {
    if (c.c === 'M' || !r.length) r.push([]);
    r[r.length - 1]?.push(c);
  }
  return r.filter(s => s.length > 1);
}

/** Separer une forme en une forme par sous-chemin, a sa place dans l'empilement ; rend les identifiants. */
export function separer(dessin: DessinSvg, id: string): { dessin: DessinSvg; ids: string[] } {
  const forme = dessin.formes.find(f => f.id === id);
  const parts = forme ? sousChemins(forme.d) : [];
  if (!forme || parts.length < 2) return { dessin, ids: forme ? [forme.id] : [] };
  let n = prochainId(dessin);
  const nouvelles: Forme[] = parts.map((d, i) => ({ ...forme, id: i === 0 ? forme.id : 'f' + n++, d }));
  const ids = nouvelles.map(f => f.id);
  return { dessin: { ...dessin, formes: dessin.formes.flatMap(f => (f.id === id ? nouvelles : [f])) }, ids };
}

/** Coller des formes copiees, au premier plan, decalees ; rend les identifiants nouveaux. */
export function coller(dessin: DessinSvg, formes: readonly Forme[], dx = 0, dy = 0): { dessin: DessinSvg; ids: string[] } {
  let n = prochainId(dessin);
  const ids: string[] = [];
  const nouvelles = formes.map(f => {
    const id = 'f' + n++;
    ids.push(id);
    return { ...f, id, verrouille: false, visible: true, d: dx || dy ? transformerChemin(f.d, translation(dx, dy)) : f.d };
  });
  return { dessin: nouvelles.length ? { ...dessin, formes: [...dessin.formes, ...nouvelles] } : dessin, ids };
}

/** Le pas d'une grille lisible sur ce plan : 1, 2 ou 5 fois une puissance de dix, vingt pas environ. */
export function pasGrille(vb: DessinSvg['vb']): number {
  const brut = Math.max(vb[2], vb[3]) / 20;
  if (!(brut > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(brut)), r = brut / p;
  return (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * p;
}

/** La valeur la plus proche sur la grille de pas `pas`, a partir de l'origine `o`. */
export const aimanter = (v: number, pas: number, o = 0): number => (pas > 0 ? o + Math.round((v - o) / pas) * pas : v);
