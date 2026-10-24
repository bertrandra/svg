// Le type commun des etapes de pretraitement : une image RGBA a plat, sans canevas. Chaque etape lit
// une image et en rend une neuve ; aucune ne modifie son entree (le meme tampon peut servir deux fois,
// et un essai rejoue depuis la source intacte).

export interface ImageRgba {
  /** Quatre octets par pixel (R, V, B, alpha), ligne apres ligne. */
  data: Uint8ClampedArray;
  largeur: number;
  hauteur: number;
}
