// Des dessins au trait synthetiques pour la ligne mediane : des segments epais, un anneau, une ecriture rendue
// par une fonte du projet (Caveat, manuscrite) et remplie a la main par balayage, sans canevas. Et de quoi relire
// la sortie : chaque trace echantillonne en points, pour mesurer longueurs et ecarts.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'opentype.js';
import { lireDessin } from '../../../src/engine/editionSvg.js';
import type { Commande } from '../../../src/engine/edition/types.js';
import type { ImageRgba } from '../../../src/engine/pixels/types.js';
import { peindre, type Couleur4 } from './images-synthetiques.js';

export type P = readonly [number, number];
export const NOIR: Couleur4 = [0, 0, 0, 255];
export const BLANC: Couleur4 = [255, 255, 255, 255];

/** La distance d'un point au segment [a, b]. */
export function distanceSegment(p: P, a: P, b: P): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Des segments d'epaisseur `e` (bouts ronds), d'encre `encre` sur `fond`. */
export function segments(l: number, h: number, segs: ReadonlyArray<readonly [number, number, number, number]>, e: number, encre: Couleur4 = NOIR, fond: Couleur4 = BLANC): ImageRgba {
  return peindre(l, h, (x, y) => (segs.some(([ax, ay, bx, by]) => distanceSegment([x + 0.5, y + 0.5], [ax, ay], [bx, by]) <= e / 2) ? encre : fond));
}

/** Un anneau de centre (cx, cy), de rayons interieur et exterieur donnes. */
export function anneau(l: number, h: number, cx: number, cy: number, r1: number, r2: number): ImageRgba {
  return peindre(l, h, (x, y) => { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); return d >= r1 && d <= r2 ? NOIR : BLANC; });
}

type Polygone = P[];

/** Les contours d'un texte en polygones (courbes aplaties en 16 pas), avec la fonte donnee. */
function contoursTexte(fichier: string, texte: string, x: number, y: number, taille: number): Polygone[] {
  const o = readFileSync(resolve(__dirname, '../../../node_modules/@expo-google-fonts', fichier));
  const fonte = parse(o.buffer.slice(o.byteOffset, o.byteOffset + o.byteLength) as ArrayBuffer);
  const polys: Polygone[] = [];
  let cour: Polygone = [], dernier: P = [0, 0], avance = x;
  for (const lettre of texte) {
    const g = fonte.charToGlyph(lettre);
    for (const c of g.getPath(avance, y, taille).commands) {
      const fin: P = [c.x ?? 0, c.y ?? 0], c1: P = [c.x1 ?? 0, c.y1 ?? 0], c2: P = [c.x2 ?? 0, c.y2 ?? 0];
      if (c.type === 'M') { if (cour.length) polys.push(cour); cour = [fin]; dernier = fin; }
      else if (c.type === 'L') { cour.push(fin); dernier = fin; }
      else if (c.type === 'Q' || c.type === 'C') {
        for (let k = 1; k <= 16; k++) {
          const t = k / 16, u = 1 - t;
          const px = c.type === 'Q' ? u * u * dernier[0] + 2 * u * t * c1[0] + t * t * fin[0] : u * u * u * dernier[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * fin[0];
          const py = c.type === 'Q' ? u * u * dernier[1] + 2 * u * t * c1[1] + t * t * fin[1] : u * u * u * dernier[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * fin[1];
          cour.push([px, py]);
        }
        dernier = fin;
      } else if (c.type === 'Z') { if (cour.length) polys.push(cour); cour = []; }
    }
    if (cour.length) polys.push(cour);
    cour = [];
    avance += ((g.advanceWidth ?? 0) * taille) / fonte.unitsPerEm;
  }
  return polys;
}

/** Remplit des polygones (regle non nulle) par balayage des centres de pixels : noir sur blanc. */
export function remplir(l: number, h: number, polys: readonly Polygone[]): ImageRgba {
  const img = peindre(l, h, () => BLANC);
  for (let y = 0; y < h; y++) {
    const yc = y + 0.5, croisements: Array<{ x: number; s: number }> = [];
    for (const poly of polys) for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if (!a || !b || (a[1] <= yc) === (b[1] <= yc)) continue;
      croisements.push({ x: a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), s: b[1] > a[1] ? 1 : -1 });
    }
    croisements.sort((p, q) => p.x - q.x);
    let enroulement = 0;
    for (let k = 0; k < croisements.length - 1; k++) {
      const c = croisements[k], d = croisements[k + 1];
      if (!c || !d) continue;
      enroulement += c.s;
      if (!enroulement) continue;
      for (let x = Math.max(0, Math.ceil(c.x - 0.5)); x < Math.min(l, Math.ceil(d.x - 0.5)); x++) img.data.set(NOIR, (y * l + x) * 4);
    }
  }
  return img;
}

/** Une ecriture manuscrite (Caveat Bold), rendue en pixels. */
export function ecriture(texte: string, taille: number, l: number, h: number): ImageRgba {
  return remplir(l, h, contoursTexte('caveat/700Bold/Caveat_700Bold.ttf', texte, 6, taille * 0.85, taille));
}

/** Les traces d'un SVG rendu, chacun echantillonne (8 pas par courbe), avec son attribut fill et s'il est ferme. */
export function echantillons(svg: string): Array<{ pts: P[]; ferme: boolean }> {
  const lu = lireDessin(svg);
  if ("erreur" in lu) return [];
  return lu.dessin.formes.map(f => {
    const pts: P[] = [];
    let ferme = false;
    for (const c of f.d as readonly Commande[]) {
      const p = c.p, dernier = pts[pts.length - 1] ?? [0, 0];
      if (c.c === 'M' || c.c === 'L') pts.push([p[0] ?? 0, p[1] ?? 0]);
      else if (c.c === 'C') {
        for (let k = 1; k <= 8; k++) {
          const t = k / 8, u = 1 - t;
          pts.push([u * u * u * dernier[0] + 3 * u * u * t * (p[0] ?? 0) + 3 * u * t * t * (p[2] ?? 0) + t * t * t * (p[4] ?? 0), u * u * u * dernier[1] + 3 * u * u * t * (p[1] ?? 0) + 3 * u * t * t * (p[3] ?? 0) + t * t * t * (p[5] ?? 0)]);
        }
      } else if (c.c === 'Z') ferme = true;
    }
    return { pts, ferme };
  });
}

export const longueurPts = (pts: readonly P[]): number => pts.slice(1).reduce((s, p, i) => { const q = pts[i] ?? p; return s + Math.hypot(p[0] - q[0], p[1] - q[1]); }, 0);
