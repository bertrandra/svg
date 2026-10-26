// Un masque d'opacite, du modele au projet et retour (ADR-0012, etape 6 ; ADR-0030) : son type, sa region et son contenu, des formes et
// des groupes entiers convertis comme ceux du dessin, par les conversions que le projet prete (`ConversionFormes` : une forme du modele
// en forme de projet et retour, un groupe de meme ; elles vivent dans engine/projet.ts et engine/projetV2/champs.ts, qui importent ce
// fichier). Pur ; l'aller-retour est exact pour tout masque que la lecture ou les operations produisent.

import type { FormeProjet, GroupeProjet } from '../../model/projet.js';
import type { MasqueProjet } from '../../model/projetV2/masque.js';
import type { Contenu, Forme, Groupe, Masque } from '../editionSvg.js';

/** Les conversions d'une forme et d'un groupe entiers, dans les deux sens : celles du dessin, pretees au contenu d'un masque. */
export interface ConversionContenu {
  readonly formeVersProjet: (f: Forme) => FormeProjet;
  readonly formeVersModele: (f: FormeProjet) => Forme;
  readonly groupeVersProjet: (g: Groupe) => GroupeProjet;
  readonly groupeVersModele: (g: GroupeProjet) => Groupe;
}

/** Une table copiee dans l'ordre de ses cles. */
function table<A, B>(t: Readonly<Record<string, A>>, f: (a: A) => B): Record<string, B> {
  const out: Record<string, B> = {};
  for (const [k, v] of Object.entries(t)) out[k] = f(v);
  return out;
}

/** Un masque du modele en masque de projet. */
export function masqueProjet(m: Masque, c: ConversionContenu): MasqueProjet {
  const r = m.region, contenu = m.contenu;
  return {
    type: m.type, region: { x: r.x, y: r.y, l: r.l, h: r.h }, formes: contenu.formes.map(c.formeVersProjet),
    ...(contenu.groupes ? { groupes: table(contenu.groupes, c.groupeVersProjet) } : {})
  };
}

/** Un masque de projet (deja valide) en masque du modele. */
export function masqueDuProjet(m: MasqueProjet, c: ConversionContenu): Masque {
  const formes = m.formes.map(c.formeVersModele);
  const contenu: Contenu = m.groupes ? { formes, groupes: table(m.groupes, c.groupeVersModele) } : { formes };
  return { contenu, type: m.type, region: { x: m.region.x, y: m.region.y, l: m.region.l, h: m.region.h } };
}

/** Les formes des masques d'une table de groupes, contenus imbriques compris (les octets d'une image s'y verifient aussi). */
export function formesDesMasques(groupes: Readonly<Record<string, GroupeProjet>> | undefined): FormeProjet[] {
  const out: FormeProjet[] = [];
  for (const g of Object.values(groupes ?? {})) {
    if (!g.masque) continue;
    out.push(...g.masque.formes, ...formesDesMasques(g.masque.groupes));
  }
  return out;
}
