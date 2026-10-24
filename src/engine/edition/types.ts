// Les types du dessin a plat (ADR-0001) : une liste de formes, du plus bas au plus haut plan, chacune
// un chemin en commandes absolues. Aucun calcul ici, pour que chaque module d'edition puisse les
// importer sans s'importer entre eux.

export type Lettre = 'M' | 'L' | 'C' | 'Q' | 'Z';
export interface Commande { readonly c: Lettre; readonly p: readonly number[] }
export type Chemin = readonly Commande[];

export interface Forme {
  readonly id: string;
  readonly d: Chemin;
  readonly remplissage: string | null;
  readonly contour: string | null;
  readonly epaisseur: number;
  /** L'opacite de la forme entiere (attribut `opacity`, celui des groupes qui la portent). */
  readonly opacite: number;
  /**
   * L'opacite propre au remplissage (alpha de la couleur lue, `fill-opacity`), 1 si absente. Un champ
   * a part de `opacite` : un fond a demi transparent n'estompe pas son contour. Facultatif pour que
   * toute forme sans alpha s'ecrive exactement comme avant.
   */
  readonly opaciteRemplissage?: number;
  /** Idem pour le contour (alpha de la couleur du trait, `stroke-opacity`). */
  readonly opaciteContour?: number;
  readonly regle: 'nonzero' | 'evenodd';
  readonly visible: boolean;
  readonly verrouille: boolean;
}

export interface DessinSvg { readonly vb: readonly [number, number, number, number]; readonly formes: readonly Forme[] }
export interface Boite { x: number; y: number; l: number; h: number }
export type Matrice = readonly [number, number, number, number, number, number];

export const IDENTITE: Matrice = [1, 0, 0, 1, 0, 0];
