// Un index de voisinage dans l'espace OKLab : trouver, parmi des centres deja poses, le premier (dans
// l'ordre de pose) qui est a moins d'une tolerance d'un point. C'est la boucle interieure du
// regroupement glouton des nuances proches (engine/edition/couleursProches.ts) : sans index, chaque
// couleur se compare a tous les centres, et des milliers de couleurs presque toutes distinctes coutent
// n au carre distances.
//
// L'index est une grille de cellules cubiques d'au moins une tolerance de cote : un point a moins d'une
// tolerance d'un autre n'en est separe que d'une cellule au plus sur chaque axe, donc les 27 cellules
// voisines contiennent tous les candidats. La grille ne fait que ELAGUER : la decision finale reste la
// meme comparaison `ecartOklab(...) <= tolerance` qu'avant, et le rang rendu est le plus petit des
// candidats, ce qui est exactement ce que rendait un parcours des centres dans l'ordre. Le resultat est
// donc celui du parcours lineaire, pas une approximation.

import type { Oklab } from './couleur.js';

/** La distance euclidienne entre deux points OKLab : l'ecart que la tolerance borne. */
export const ecartOklab = (a: Oklab, b: Oklab): number => Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);

/**
 * Une marge sur la taille des cellules : `floor(x / t)` arrondit, et deux points a une tolerance
 * exactement l'un de l'autre pourraient sinon tomber a deux cellules d'ecart.
 */
const MARGE = 1 + 1e-7;
/** Des cellules plus petites ne servent a rien (1/256 est sous l'ecart de deux codes voisins) et sortiraient des bornes de la cle. */
const CELLULE_MIN = 1 / 256;
/** Les indices de cellule sont bornes a ±DEMI : bornes aussi larges que tout l'espace des couleurs sRGB, qui tient dans ±256. */
const DEMI = 300;
const DECALAGE = DEMI + 1;
const LARGEUR = 2 * DECALAGE + 1;

export interface IndexVoisins {
  /** Pose un centre. Les rangs sont libres, mais `premier` rend le plus petit rang parmi les proches. */
  ajouter: (point: Oklab, rang: number) => void;
  /** Le plus petit rang des centres a moins de la tolerance de `point` (inclus), ou -1 s'il n'y en a aucun. */
  premier: (point: Oklab) => number;
}

interface Centre { point: Oklab; rang: number }

/**
 * Un index pour une tolerance donnee. Une tolerance qui n'est pas un nombre fini positif (NaN, negative,
 * infinie) n'a pas de grille : on parcourt les centres, ce qui garde exactement l'ancien comportement.
 */
export function creerIndexVoisins(tolerance: number): IndexVoisins {
  if (!(tolerance >= 0) || !Number.isFinite(tolerance)) return indexLineaire(tolerance);
  const cote = Math.max(tolerance * MARGE, CELLULE_MIN);
  const cellules = new Map<number, Centre[]>();
  const indice = (v: number) => Math.max(-DEMI, Math.min(DEMI, Math.floor(v / cote)));
  const cle = (i: number, j: number, k: number) => ((i + DECALAGE) * LARGEUR + (j + DECALAGE)) * LARGEUR + (k + DECALAGE);
  return {
    ajouter(point, rang) {
      const c = cle(indice(point.l), indice(point.a), indice(point.b));
      const cellule = cellules.get(c);
      if (cellule) cellule.push({ point, rang }); else cellules.set(c, [{ point, rang }]);
    },
    premier(point) {
      const i = indice(point.l), j = indice(point.a), k = indice(point.b);
      let meilleur = -1;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (let dk = -1; dk <= 1; dk++) {
        const cellule = cellules.get(cle(i + di, j + dj, k + dk));
        if (!cellule) continue;
        for (const centre of cellule) {
          if ((meilleur < 0 || centre.rang < meilleur) && ecartOklab(centre.point, point) <= tolerance) meilleur = centre.rang;
        }
      }
      return meilleur;
    }
  };
}

/** L'ancien parcours, centre apres centre dans l'ordre de pose : la reference, et le repli d'une tolerance sans grille. */
export function indexLineaire(tolerance: number): IndexVoisins {
  const centres: Centre[] = [];
  return {
    ajouter(point, rang) { centres.push({ point, rang }); },
    premier(point) {
      let meilleur = -1;
      for (const centre of centres) if ((meilleur < 0 || centre.rang < meilleur) && ecartOklab(centre.point, point) <= tolerance) meilleur = centre.rang;
      return meilleur;
    }
  };
}
