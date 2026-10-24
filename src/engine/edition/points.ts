// Les points et les poignees d'un chemin : deplacer une ancre ou une poignee, retirer un point,
// couper ou courber un segment. Un sous-chemin ferme sur lui-meme bouge ses deux bouts ensemble.

import type { Chemin, Commande, DessinSvg } from './types.js';
import { ancre, depart } from './chemins.js';
import { surFormes } from './operations.js';

const memePoint = (a: readonly number[] | null, b: readonly number[] | null) => !!a && !!b && Math.abs((a[0] ?? 0) - (b[0] ?? 0)) < 1e-6 && Math.abs((a[1] ?? 0) - (b[1] ?? 0)) < 1e-6;

/** Les bornes [debut, fin[ du sous-chemin qui contient la commande `i`. */
export function sousChemin(d: Chemin, i: number): [number, number] {
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

export function surChemin(dessin: DessinSvg, id: string, f: (d: Chemin) => Chemin | null): DessinSvg {
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
