// Le trace « Median » d'un texte (ADR-0027) : chaque lettre d'une police a contour devient une seule ligne au milieu de son
// trait, ce que suit la pointe d'un stylo (ADR-0022 : au stylo, rien ne se remplit). La ligne se calcule par la chaine de la
// ligne mediane (ADR-0021), sans rien y changer : le contour de la glyphe est rasterise ici, en pur, a une resolution fixe
// (PIXELS_PAR_EM), puis amincissement de Guo-Hall, graphe elague, jonctions fondues, cubiques ajustees. Le resultat est
// ramene aux unites de la glyphe et memorise par glyphe et par police : une lettre ne se calcule qu'une fois.
//
// Deterministe : rien que des + - * / et des tris stables sur des entrees fixes ; memes contours, memes octets. Une police a
// trait unique a deja sa ligne : elle ne passe jamais ici (glyphesDuTexte, texte/bloc.ts).

import type { Commande } from '../editionSvg.js';
import type { CommandeGlyphe, Glyphes } from '../texte.js';
import { tracesDuGraphe } from '../lignemediane.js';
import { versChemin } from '../lignemediane/courbes.js';
import { elaguer, fondreJonctionsProches, suivreSquelette } from '../lignemediane/graphe.js';
import { creerMasque, indice, type Masque } from '../lignemediane/masque.js';
import { traverserJonctions } from '../lignemediane/raccord.js';
import { amincir, distances2, retirerMarches } from '../lignemediane/squelette.js';

/** La resolution du calcul : un cadratin fait deux cents pixels (assez pour un trait fin d'une lettre lineale, et rapide). */
export const PIXELS_PAR_EM = 200;
/** Une glyphe plus grande que cela (en cadratins) n'est pas une lettre : on ne la rasterise pas. */
const CADRATINS_MAX = 4;
const MARGE = 2;
/** L'ecart permis aux cubiques, en pixels du calcul, et le lissage : ceux du grain « normal » de la ligne mediane. */
const TOLERANCE = 1;
const PASSES = 2;

type Pt = readonly [number, number];

/** Les contours d'une glyphe en polygones : les courbes en segments d'environ deux pixels (de 2 a 48 par courbe). */
function aplatir(cmds: readonly CommandeGlyphe[]): Pt[][] {
  const polys: Pt[][] = [];
  let cour: Pt[] = [], x = 0, y = 0;
  const fermer = () => { if (cour.length > 2) polys.push(cour); cour = []; };
  const courbe = (ctrl: readonly Pt[], fin: Pt) => {
    const pts: Pt[] = [[x, y], ...ctrl, fin];
    let l = 0;
    for (let i = 1; i < pts.length; i++) l += Math.hypot((pts[i]?.[0] ?? 0) - (pts[i - 1]?.[0] ?? 0), (pts[i]?.[1] ?? 0) - (pts[i - 1]?.[1] ?? 0));
    const n = Math.max(2, Math.min(48, Math.ceil(l / 2)));
    for (let k = 1; k <= n; k++) cour.push(bezier(pts, k / n));
  };
  for (const c of cmds) {
    const fin: Pt = [c.x ?? 0, c.y ?? 0];
    if (c.type === 'M') { fermer(); cour.push(fin); }
    else if (c.type === 'L') cour.push(fin);
    else if (c.type === 'Q') courbe([[c.x1 ?? 0, c.y1 ?? 0]], fin);
    else if (c.type === 'C') courbe([[c.x1 ?? 0, c.y1 ?? 0], [c.x2 ?? 0, c.y2 ?? 0]], fin);
    else { fermer(); continue; }
    [x, y] = fin;
  }
  fermer();
  return polys;
}

/** Un point d'une courbe de Bezier (quadratique ou cubique) par l'algorithme de De Casteljau. */
function bezier(pts: readonly Pt[], t: number): Pt {
  let q = [...pts];
  while (q.length > 1) q = q.slice(1).map((p, i) => [(q[i]?.[0] ?? 0) * (1 - t) + p[0] * t, (q[i]?.[1] ?? 0) * (1 - t) + p[1] * t] as Pt);
  return q[0] ?? [0, 0];
}

/** Les pixels dont le centre est dans les polygones, par la regle non nulle d'une fonte (une ligne de balayage par rangee). */
function rasteriser(polys: readonly Pt[][], x0: number, y0: number, l: number, h: number): Masque {
  const m = creerMasque(l, h), aretes: Array<readonly [number, number, number, number]> = [];
  for (const p of polys) p.forEach((a, i) => { const b = p[(i + 1) % p.length] ?? a; if (a[1] !== b[1]) aretes.push([a[0], a[1], b[0], b[1]]); });
  for (let py = 0; py < h; py++) {
    const yc = y0 + py + 0.5, coupes: Array<readonly [number, number]> = [];
    for (const [ax, ay, bx, by] of aretes) {
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) coupes.push([ax + ((yc - ay) / (by - ay)) * (bx - ax), by > ay ? 1 : -1]);
    }
    coupes.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let w = 0, debut = 0;
    for (const [cx, s] of coupes) {
      const avant = w;
      w += s;
      if (avant === 0 && w !== 0) debut = cx;
      else if (avant !== 0 && w === 0) {
        for (let px = Math.max(0, Math.ceil(debut - x0 - 0.5)); px < l && x0 + px + 0.5 < cx; px++) m.bits[indice(m, px, py)] = 1;
      }
    }
  }
  return m;
}

/** L'epaisseur mediane du trait le long du squelette, en pixels (deux fois la distance au fond). */
function epaisseur(m: Masque, d2: Float64Array): number {
  const v: number[] = [];
  for (let i = 0; i < m.bits.length; i++) if (m.bits[i]) v.push(2 * Math.sqrt(d2[i] ?? 0));
  v.sort((a, b) => a - b);
  return Math.max(1, v[(v.length - 1) >> 1] ?? 1);
}

/**
 * La ligne mediane d'un contour de glyphe, donne en pixels du calcul (origine sur la ligne de base, Y vers le bas) : des traces
 * ouverts (et fermes pour un anneau, le « O »), en pixels du calcul. Vide pour une glyphe sans surface (un blanc).
 */
export function medianeDeContour(cmds: readonly CommandeGlyphe[]): Commande[] {
  const polys = aplatir(cmds), xs = polys.flat().map(p => p[0]), ys = polys.flat().map(p => p[1]);
  if (!xs.length) return [];
  const x0 = Math.floor(Math.min(...xs)) - MARGE, y0 = Math.floor(Math.min(...ys)) - MARGE;
  const l = Math.ceil(Math.max(...xs)) - x0 + MARGE, h = Math.ceil(Math.max(...ys)) - y0 + MARGE;
  if (l > CADRATINS_MAX * PIXELS_PAR_EM || h > CADRATINS_MAX * PIXELS_PAR_EM) return [];
  const m = rasteriser(polys, x0, y0, l, h);
  if (!m.bits.some(b => b)) return [];
  const d2 = distances2(m);
  amincir(m);
  retirerMarches(m);
  const e = epaisseur(m, d2), g = suivreSquelette(m);
  // Comme la ligne mediane d'une image : les barbules de moins d'une epaisseur et quart, les jonctions a moins de trois epaisseurs.
  elaguer(g, Math.max(2, Math.round(e * 1.25)));
  const portee = Math.max(2, 1.5 * e);
  fondreJonctionsProches(g, 3 * e, portee);
  const d: Commande[] = [];
  for (const t of traverserJonctions(tracesDuGraphe(g), portee)) {
    // Les points du squelette sont au centre des pixels de l'image, dans son repere : on les ramene a celui de la glyphe.
    for (const c of versChemin(t.pts, t.ferme, TOLERANCE, PASSES)) d.push({ c: c.c, p: c.p.map((v, i) => Number((v + (i % 2 ? y0 : x0)).toFixed(3))) });
  }
  return d;
}

const MEMOIRES = new WeakMap<Glyphes, Map<string, Commande[]>>();

/** La ligne mediane d'une glyphe de cette police, en pixels du calcul : calculee une fois par glyphe et par police. */
export function medianeDuCaractere(glyphes: Glyphes, caractere: string): Commande[] {
  let memoire = MEMOIRES.get(glyphes);
  if (!memoire) { memoire = new Map(); MEMOIRES.set(glyphes, memoire); }
  let d = memoire.get(caractere);
  if (!d) { d = medianeDeContour(glyphes.contour(caractere, 0, 0, PIXELS_PAR_EM)); memoire.set(caractere, d); }
  return d;
}

const ENVELOPPES = new WeakMap<Glyphes, Glyphes>();

/**
 * La meme police, ses lettres en ligne mediane : memes avances, meme crenage, memes ligatures (le curseur et la composition ne
 * changent pas), et chaque contour remplace par sa ligne, posee a la position et a la taille demandees.
 */
export function glyphesMedians(glyphes: Glyphes): Glyphes {
  const deja = ENVELOPPES.get(glyphes);
  if (deja) return deja;
  const lier = glyphes.ligature, possede = glyphes.possede;
  const enveloppe: Glyphes = {
    unitesParEm: glyphes.unitesParEm,
    avance: c => glyphes.avance(c),
    crenage: (a, b) => glyphes.crenage(a, b),
    ...(lier ? { ligature: (cars: readonly string[], i: number) => lier.call(glyphes, cars, i) } : {}),
    ...(possede ? { possede: (c: string) => possede.call(glyphes, c) } : {}),
    contour: (c, x, y, taille) => {
      const k = taille / PIXELS_PAR_EM;
      return medianeDuCaractere(glyphes, c).map((m): CommandeGlyphe => {
        const p = m.p.map((v, i) => (i % 2 ? y : x) + v * k), v = (i: number): number => p[i] ?? 0;
        if (m.c === 'Z') return { type: 'Z' };
        if (m.c === 'C') return { type: 'C', x1: v(0), y1: v(1), x2: v(2), y2: v(3), x: v(4), y: v(5) };
        if (m.c === 'Q') return { type: 'Q', x1: v(0), y1: v(1), x: v(2), y: v(3) };
        return { type: m.c, x: v(0), y: v(1) };
      });
    }
  };
  ENVELOPPES.set(glyphes, enveloppe);
  return enveloppe;
}
