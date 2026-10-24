// Des arcs de cercle en points, sans trigonometrie : on coupe l'arc en deux par la bissectrice de ses
// vecteurs unitaires (normaliser leur somme) tant que la fleche de l'arc depasse la tolerance. Le
// resultat est le meme sur tout moteur (racines carrees seulement), et les points sont equirepartis.

import { fois, norme, plus, scalaire, unitaire, type Pt } from './polylignes.js';

/** La fleche d'un arc de rayon `r` dont les vecteurs unitaires font l'angle de cosinus `c` : r (1 - cos(angle / 2)). */
const fleche = (r: number, c: number): number => r * (1 - Math.sqrt(Math.max(0, (1 + c) / 2)));

const PROFONDEUR_MAX = 14;

/**
 * Les vecteurs unitaires strictement entre `u` et `v` (le petit arc, moins d'un demi-tour), assez serres
 * pour que la corde reste a `tolerance` de l'arc de rayon `rayon`. Sans u ni v eux-memes.
 */
export function entre(u: Pt, v: Pt, rayon: number, tolerance: number, profondeur = 0): Pt[] {
  const c = scalaire(u, v);
  if (profondeur >= PROFONDEUR_MAX || fleche(rayon, c) <= tolerance) return [];
  const milieu = unitaire(plus(u, v));
  if (norme(milieu) === 0) return [];
  return [...entre(u, milieu, rayon, tolerance, profondeur + 1), milieu, ...entre(milieu, v, rayon, tolerance, profondeur + 1)];
}

/** Les points d'un arc autour de `centre`, de la direction `u` a la direction `v`, extremites exclues. */
export function pointsArc(centre: Pt, u: Pt, v: Pt, rayon: number, tolerance: number): Pt[] {
  return entre(u, v, rayon, tolerance).map(w => plus(centre, fois(w, rayon)));
}

/** Un demi-tour de `u` a `-u` en passant par `via` (perpendiculaire a `u`) : extremites exclues, `via` compris. */
export function pointsDemiTour(centre: Pt, u: Pt, via: Pt, rayon: number, tolerance: number): Pt[] {
  const moinsU = fois(u, -1);
  return [...pointsArc(centre, u, via, rayon, tolerance), plus(centre, fois(via, rayon)), ...pointsArc(centre, via, moinsU, rayon, tolerance)];
}

/** Un cercle entier, a partir de la direction (1, 0) : quatre quarts de tour. */
export function pointsCercle(centre: Pt, rayon: number, tolerance: number): Pt[] {
  const directions: Pt[] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  return directions.flatMap((u, k) => {
    const v = directions[(k + 1) % 4] ?? u;
    return [plus(centre, fois(u, rayon)), ...pointsArc(centre, u, v, rayon, tolerance)];
  });
}
