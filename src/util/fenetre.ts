// Le fenetrage d'une longue liste : ne dessiner que les lignes que l'on voit, et deux marges de la
// hauteur des autres pour que la barre de defilement reste juste. Un vecteur issu d'une photo peut
// compter des milliers de formes ; une ligne du panneau des calques coute trois boutons, et React
// remet a jour chaque element rendu a chaque modification du dessin.
//
// Tout est calcule en pixels de liste, sur des lignes de meme pas (hauteur + espace). Pur, sans DOM :
// le composant mesure, ce module decide.

/** Au-dessous de ce nombre de lignes, on les dessine toutes : le fenetrage ne change rien d'un petit dessin. */
export const SEUIL_FENETRE = 150;

/** Les lignes de marge dessinees au-dela de ce qu'on voit : de quoi tabuler plusieurs fois sans perdre le focus. */
export const MARGE_FENETRE = 12;

export interface Fenetre {
  /** Premiere ligne dessinee (incluse). */
  debut: number;
  /** Derniere ligne dessinee (exclue). */
  fin: number;
  /** La hauteur des lignes non dessinees avant `debut`, en pixels. */
  haut: number;
  /** La hauteur des lignes non dessinees apres `fin`, en pixels. */
  bas: number;
  /**
   * La hauteur de la liste entiere, arrondie vers le bas. A poser en hauteur minimale : en retirant des
   * lignes, React fait calculer la mise en page entre deux suppressions (le navigateur annonce la perte
   * du focus d'une ligne retiree) ; la liste, plus courte un instant, ramenait le defilement en arriere.
   */
  hauteur: number;
}

/**
 * Les lignes a dessiner. `defile` est la partie de la liste deja passee au-dessus du bord haut de la
 * zone visible, `visible` la hauteur de cette zone, `pas` la distance d'une ligne a la suivante.
 * Une liste courte, ou un pas inconnu, se dessine en entier.
 */
export function fenetre(total: number, pas: number, defile: number, visible: number, marge = MARGE_FENETRE, seuil = SEUIL_FENETRE): Fenetre {
  if (total <= seuil || !(pas > 0)) return { debut: 0, fin: total, haut: 0, bas: 0, hauteur: 0 };
  const premiere = Math.floor(Math.max(0, defile) / pas);
  const derniere = Math.ceil((Math.max(0, defile) + Math.max(0, visible)) / pas);
  const debut = Math.min(total, Math.max(0, premiere - marge));
  const fin = Math.min(total, Math.max(debut, derniere + marge));
  return { debut, fin, haut: debut * pas, bas: (total - fin) * pas, hauteur: Math.floor(total * pas) };
}

/**
 * De combien defiler pour qu'une ligne soit entierement visible : 0 si elle l'est deja. `defile` peut
 * etre negatif quand la liste commence plus bas que le haut de la zone visible. `espace` est le jour
 * entre deux lignes, qui n'appartient pas a la ligne.
 */
export function defilementPour(index: number, pas: number, defile: number, visible: number, espace = 1): number {
  const haut = index * pas, bas = haut + pas - espace;
  // Arrondi vers l'exterieur : le defilement tombe sur des pixels entiers et ne doit pas laisser un dixieme de ligne dehors.
  if (haut < defile) return Math.floor(haut - defile);
  if (bas > defile + visible) return Math.ceil(bas - (defile + visible));
  return 0;
}
