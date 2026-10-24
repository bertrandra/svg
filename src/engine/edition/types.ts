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
  readonly opacite: number;
  readonly regle: 'nonzero' | 'evenodd';
  readonly visible: boolean;
  readonly verrouille: boolean;
}

export interface DessinSvg { readonly vb: readonly [number, number, number, number]; readonly formes: readonly Forme[] }
export interface Boite { x: number; y: number; l: number; h: number }
export type Matrice = readonly [number, number, number, number, number, number];

export const IDENTITE: Matrice = [1, 0, 0, 1, 0, 0];
