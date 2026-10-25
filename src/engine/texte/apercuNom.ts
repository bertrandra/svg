// Le nom d'une famille dessine dans sa propre fonte (ADR-0026) : ce que montre une ligne de « Toutes les polices ». Compose par
// `composerEtMesurer` (engine/texte.ts), sans rien y changer, au corps du cadre commun, puis ramene a des coordonnees entieres.
// Le meme calcul sert a la page (une police deja chargee : livree, deposee, telechargee) et au script qui prepare l'annexe
// (scripts/apercus-polices.mjs) : un apercu prepare et un apercu calcule sur place ont le meme trace. Pur et deterministe.

import { boiteChemin, type Commande } from '../editionSvg.js';
import { composerEtMesurer, type Glyphes } from '../texte.js';
import { CADRE_APERCU, type CommandeApercu, type TraceApercu } from '../../model/apercusPolices.js';

/**
 * L'ecart tolere entre un apercu et la composition, en unites du cadre : a 22 px pour 40 unites, un demi-pixel au plus
 * (0,3 unite d'arrondi, 0,5 de simplification). C'est ce qui garde l'annexe legere sans que l'oeil le voie.
 */
const TOLERANCE = 0.5;

/** La distance d'un point au segment [a, b] (au point a quand le segment est nul). */
function distance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const lx = bx - ax, ly = by - ay, l2 = lx * lx + ly * ly;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * lx + (py - ay) * ly) / l2));
  return Math.hypot(px - ax - t * lx, py - ay - t * ly);
}

/**
 * Les commandes arrondies a l'unite et simplifiees : une courbe dont les poignees restent a moins de la tolerance de sa corde
 * devient un segment, des segments qui se suivent presque alignes n'en font qu'un (chaque point retire reste a moins de la
 * tolerance du segment qui le remplace), un segment nul disparait, un contour reduit a son depart s'efface.
 */
function arrondir(chemin: readonly Commande[], dx: number): CommandeApercu[] {
  const r: CommandeApercu[] = [];
  let x = 0, y = 0, debut = 0;
  // La suite de segments en cours : son depart et les points qu'elle a absorbes.
  let sx = 0, sy = 0, absorbes: number[] = [];
  for (const c of chemin) {
    const p = c.p.map((v, i) => Math.round(i % 2 === 0 ? v - dx : v));
    if (c.c === 'M') {
      // Un depart qui n'a mene nulle part est remplace par le suivant.
      if (r[r.length - 1]?.c === 'M') r.pop();
      debut = r.length; r.push({ c: 'M', p }); x = p[0] ?? 0; y = p[1] ?? 0;
      continue;
    }
    if (c.c === 'Z') {
      // Un contour qui n'a plus aucun segment n'est plus rien : on retire son M.
      if (r.length - debut <= 1) r.splice(debut);
      else r.push({ c: 'Z', p: [] });
      continue;
    }
    const fx = p[p.length - 2] ?? x, fy = p[p.length - 1] ?? y;
    let plat = true;
    for (let i = 0; i + 3 < p.length; i += 2) if (distance(p[i] ?? 0, p[i + 1] ?? 0, x, y, fx, fy) > TOLERANCE) plat = false;
    if (!plat) { r.push({ c: c.c, p }); x = fx; y = fy; continue; }
    if (fx === x && fy === y) continue;
    const avant = r[r.length - 1];
    // Prolonger le segment precedent, si son arrivee et tous les points qu'il a absorbes restent pres du nouveau segment.
    if (avant?.c === 'L') {
      const points = [...absorbes, x, y];
      let aligne = true;
      for (let i = 0; i < points.length; i += 2) if (distance(points[i] ?? 0, points[i + 1] ?? 0, sx, sy, fx, fy) > TOLERANCE) aligne = false;
      if (aligne) { r[r.length - 1] = { c: 'L', p: [fx, fy] }; absorbes = points; x = fx; y = fy; continue; }
    }
    sx = x; sy = y; absorbes = [];
    r.push({ c: 'L', p: [fx, fy] });
    x = fx; y = fy;
  }
  // Un dernier contour ouvert (une police a trait unique) reste ; un M seul a la fin, non.
  if (r.length && r[r.length - 1]?.c === 'M') r.pop();
  return r;
}

/**
 * Le nom dessine dans la fonte, ou null quand il ne se dessine pas : nom vide, ou une lettre que la fonte n'a pas (elle
 * dessinerait sa glyphe « manquante »). Les lettres qui commencent au-dela de la largeur du cadre ne sont pas dessinees ; le
 * trace commence en x = 0 (le bord gauche de sa premiere lettre), la ligne de base en y = 0.
 */
export function tracerNom(nom: string, glyphes: Glyphes): TraceApercu | null {
  const texte = nom.replace(/\s+/g, ' ').trim();
  if (!texte || [...texte].some(c => c !== ' ' && glyphes.possede?.(c) === false)) return null;
  const { lettres } = composerEtMesurer(texte, glyphes, { taille: CADRE_APERCU.corps, x: 0, y: 0 });
  const boites = lettres.map(l => ({ l, b: boiteChemin(l.d) })).filter((e): e is { l: typeof e.l; b: NonNullable<typeof e.b> } => e.b !== null);
  const premiere = boites[0];
  if (!premiere) return null;
  const gauche = Math.min(...boites.map(e => e.b.x));
  const gardees = boites.filter(e => e.b.x - gauche < CADRE_APERCU.largeurMax);
  const commandes = arrondir(gardees.flatMap(e => e.l.d), gauche);
  if (!commandes.length) return null;
  const largeur = Math.ceil(Math.max(...gardees.map(e => e.b.x + e.b.l)) - gauche);
  return { largeur: Math.max(1, largeur), commandes };
}
