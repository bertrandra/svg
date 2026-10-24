// Les couleurs du dessin : lesquelles, combien de formes, remplacement partout. Une couleur dont on
// a tout masque reste dans la liste, sans quoi on ne pourrait plus la rendre.

import type { DessinSvg, Forme } from './types.js';

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
