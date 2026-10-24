// La simplification d'un trace : moins de points, la meme forme a `tolerance` pres. Ramer-Douglas-Peucker
// sur chaque suite de segments droits ; les courbes (C et Q) restent telles quelles.
//
// Pourquoi laisser les courbes : les re-ajuster change leur forme (d'un cheveu, mais a chaque passage),
// donc ni l'operation ne serait idempotente ni l'ecart borne par la tolerance, et leurs points sont
// des intentions de dessin autant que des mesures. Les segments droits, eux, n'ont que des sommets : un
// sommet a moins de la tolerance de la corde de ses voisins ne dit rien. Le resultat est donc a moins
// de la tolerance du trace d'origine (Hausdorff), et refaire l'operation a la meme tolerance ne retire
// plus rien.

import type { Chemin, Commande, DessinSvg } from './types.js';
import { simplifierPolyligne, type Pt } from './ajustement.js';

/** Le nombre de points d'un chemin : ses commandes, Z non compte (il ne pose aucun point). */
export const compterPoints = (chemin: Chemin): number => chemin.filter(c => c.c !== 'Z').length;

const point = (c: Commande | undefined): Pt => [c?.p[(c?.p.length ?? 2) - 2] ?? 0, c?.p[(c?.p.length ?? 1) - 1] ?? 0];

/** Les sous-chemins d'un chemin, chacun de son M jusqu'avant le M suivant (un Z le termine). */
function decouper(chemin: Chemin): Commande[][] {
  const sous: Commande[][] = [];
  for (const c of chemin) {
    if (c.c === 'M' || !sous.length) sous.push([c]);
    else sous[sous.length - 1]?.push(c);
  }
  return sous;
}

/**
 * Simplifie un sous-chemin : chaque suite de L est reduite a ses sommets utiles, les extremites de la
 * suite (le depart, le point ou une courbe reprend) restant fixes. Un sous-chemin ferme garde son M et
 * son Z ; la suite finale s'etend jusqu'au point de depart, que le Z rejoint.
 */
function simplifierSousChemin(sous: readonly Commande[], tolerance: number): Commande[] {
  const debut = sous[0];
  if (!debut || debut.c !== 'M') return [...sous];
  const ferme = sous[sous.length - 1]?.c === 'Z', corps = sous.slice(1, ferme ? -1 : undefined);
  // Un Z au milieu, ou une commande sans point : on n'y touche pas, plutot que de deviner.
  if (corps.some(c => c.c === 'Z' || c.c === 'M')) return [...sous];
  const depart = point(debut), sortie: Commande[] = [debut];
  let courant = depart;
  for (let i = 0; i < corps.length;) {
    const c = corps[i];
    if (!c) break;
    if (c.c !== 'L') { sortie.push(c); courant = point(c); i++; continue; }
    let j = i;
    while (corps[j]?.c === 'L') j++;
    const rejoint = ferme && j === corps.length;
    const points: Pt[] = [courant, ...corps.slice(i, j).map(point), ...(rejoint ? [depart] : [])];
    const gardes = simplifierPolyligne(points, tolerance);
    // Le point de fermeture n'est pas un L : le Z le trace.
    for (const k of gardes) if (k > 0 && !(rejoint && k === points.length - 1)) { const p = points[k] ?? depart; sortie.push({ c: 'L', p: [p[0], p[1]] }); }
    courant = point(corps[j - 1]);
    i = j;
  }
  if (ferme) sortie.push({ c: 'Z', p: [] });
  // Une forme fermee garde au moins trois sommets : en dessous, elle n'a plus d'aire.
  const sommets = (x: readonly Commande[]) => x.filter(c => c.c !== 'Z').length;
  return ferme && sommets(sortie) < Math.min(3, sommets(sous)) ? [...sous] : sortie;
}

/**
 * Le chemin simplifie a `tolerance` pres (dans les unites du plan) : moins de sommets sur les segments
 * droits, courbes inchangees, sous-chemins, ouverts ou fermes, conserves. Pur et deterministe.
 */
export function simplifierChemin(chemin: Chemin, tolerance: number): Chemin {
  if (!(tolerance > 0)) return chemin;
  const sortie = decouper(chemin).flatMap(s => simplifierSousChemin(s, tolerance));
  return compterPoints(sortie) < compterPoints(chemin) ? sortie : chemin;
}

/**
 * Simplifie les formes `ids` du dessin a `tolerance` pres. Une forme verrouillee n'est jamais touchee.
 * Rend le dessin, le nombre de points retires et le nombre de formes qui ont change ; le dessin est
 * rendu tel quel quand rien ne bouge.
 */
export function simplifier(dessin: DessinSvg, ids: readonly string[], tolerance: number): { dessin: DessinSvg; retires: number; formes: number } {
  const voulus = new Set(ids);
  let retires = 0, formes = 0;
  const liste = dessin.formes.map(f => {
    if (!voulus.has(f.id) || f.verrouille) return f;
    const d = simplifierChemin(f.d, tolerance);
    if (d === f.d) return f;
    retires += compterPoints(f.d) - compterPoints(d);
    formes++;
    return { ...f, d };
  });
  return { dessin: formes ? { ...dessin, formes: liste } : dessin, retires, formes };
}
