// Un motif, du modele au projet et retour (ADR-0012, etape 9 ; ADR-0030) : sa tuile, sa matrice et son contenu, des formes et des groupes
// entiers convertis comme ceux du dessin, par les conversions que le projet prete (`ConversionContenu`, comme le masque de l'etape 6).
// Pur ; l'aller-retour est exact pour tout motif que la lecture ou les operations produisent (le contenu revient par `normaliser`, qui
// rend le meme contenu quand il est bien forme, et range un contenu abime au lieu de le croire).

import type { MotifProjet } from '../../model/projetV2/motif.js';
import type { Contenu, Motif } from '../editionSvg.js';
import { normaliser } from '../editionSvg.js';
import type { ConversionContenu } from './masque.js';

/** Une table copiee dans l'ordre de ses cles. */
function table<A, B>(t: Readonly<Record<string, A>>, f: (a: A) => B): Record<string, B> {
  const out: Record<string, B> = {};
  for (const [k, v] of Object.entries(t)) out[k] = f(v);
  return out;
}

/** Un motif du modele en motif de projet. */
export function motifProjet(m: Motif, c: ConversionContenu): MotifProjet {
  return {
    genre: 'motif', x: m.x, y: m.y, l: m.l, h: m.h,
    ...(m.matrice ? { matrice: [m.matrice[0], m.matrice[1], m.matrice[2], m.matrice[3], m.matrice[4], m.matrice[5]] } : {}),
    formes: m.contenu.formes.map(c.formeVersProjet),
    ...(m.contenu.groupes ? { groupes: table(m.contenu.groupes, c.groupeVersProjet) } : {})
  };
}

/** Un motif de projet (deja valide) en motif du modele. */
export function motifDuProjet(m: MotifProjet, c: ConversionContenu): Motif {
  const formes = m.formes.map(c.formeVersModele);
  const contenu = normaliser<Contenu>(m.groupes ? { formes, groupes: table(m.groupes, c.groupeVersModele) } : { formes });
  return {
    genre: 'motif', x: m.x, y: m.y, l: m.l, h: m.h,
    ...(m.matrice ? { matrice: [m.matrice[0], m.matrice[1], m.matrice[2], m.matrice[3], m.matrice[4], m.matrice[5]] } : {}),
    contenu
  };
}
