// Une peinture non unie, du modele au projet et retour (ADR-0012, etape 3 ; ADR-0030) : champ pour champ, dans l'ordre du format, a
// pleine precision, chaque champ facultatif absent quand il l'etait. La meme copie sert dans les deux sens, ce qui garde l'ordre et
// l'absence a l'identique : projet -> modele -> projet rend le meme texte JSON.

import type { ArretProjet, DegradeProjet } from '../../model/projetV2/peinture.js';
import type { ArretDegrade, Degrade } from '../editionSvg.js';

const arret = <A extends ArretDegrade | ArretProjet>(a: A): A => ({ position: a.position, couleur: a.couleur, ...(a.opacite !== undefined ? { opacite: a.opacite } : {}) }) as A;

/** Un degrade (du modele ou du projet), recopie dans l'ordre du format. */
export function copieDegrade<D extends Degrade | DegradeProjet>(d: D): D {
  const commun = {
    arrets: d.arrets.map(arret),
    ...(d.matrice !== undefined ? { matrice: [d.matrice[0], d.matrice[1], d.matrice[2], d.matrice[3], d.matrice[4], d.matrice[5]] } : {}),
    ...(d.etalement !== undefined ? { etalement: d.etalement } : {})
  };
  return (d.genre === 'lineaire'
    ? { genre: 'lineaire', x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2, ...commun }
    : {
      genre: 'radial', cx: d.cx, cy: d.cy, r: d.r,
      ...(d.fx !== undefined ? { fx: d.fx } : {}), ...(d.fy !== undefined ? { fy: d.fy } : {}), ...(d.fr !== undefined ? { fr: d.fr } : {}),
      ...commun
    }) as unknown as D;
}

export const peintureProjet = (d: Degrade): DegradeProjet => copieDegrade(d) as unknown as DegradeProjet;
export const peintureDuProjet = (p: DegradeProjet): Degrade => copieDegrade(p) as unknown as Degrade;
