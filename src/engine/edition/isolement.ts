// Isoler une couleur, c'est masquer toutes les autres formes ; en sortir, c'est rendre a chaque forme
// la visibilite qu'elle avait avant, pas tout afficher (certaines etaient masquees a dessein). On garde
// donc un instantane de la visibilite par identifiant de forme. Les formes nees ou mortes entre-temps
// n'y figurent pas : on ne les touche pas, on ne les invente pas.
//
// Dans un dessin a groupes (ADR-0012, etape 1), les identifiants sont globaux : l'instantane garde aussi la visibilite de chaque
// groupe, et la rend de meme. Un dessin plat prend le chemin d'avant.

import type { DessinSvg, Groupe } from './types.js';
import { estPlat } from './arbre.js';
import { avecGroupes } from './groupes.js';

/** La visibilite de chaque forme, par identifiant (et de chaque groupe, dans un dessin a groupes). */
export type Visibilites = ReadonlyMap<string, boolean>;

export const visibilitesDe = (dessin: DessinSvg): Visibilites => (estPlat(dessin)
  ? new Map(dessin.formes.map(f => [f.id, f.visible]))
  : new Map([...dessin.formes.map((f): [string, boolean] => [f.id, f.visible]), ...Object.values(dessin.groupes ?? {}).map((g): [string, boolean] => [g.id, g.visible])]));

/** Rend a chaque forme de l'instantane sa visibilite d'alors ; les autres formes restent comme elles sont. */
export function restaurerVisibilites(dessin: DessinSvg, avant: Visibilites): DessinSvg {
  if (!estPlat(dessin)) return restaurerRiche(dessin, avant);
  let change = false;
  const formes = dessin.formes.map(f => {
    const v = avant.get(f.id);
    if (v === undefined || v === f.visible) return f;
    change = true;
    return { ...f, visible: v };
  });
  return change ? { ...dessin, formes } : dessin;
}

/**
 * Vrai si les formes de l'instantane ont toutes la visibilite qu'il dit. On s'en sert pour savoir si
 * l'isolement tient encore : qu'on masque ou affiche une forme a la main, ou qu'on annule, il ne tient
 * plus. Les formes absentes de l'instantane (ajoutees depuis) ne comptent pas.
 */
export function visibilitesConformes(dessin: DessinSvg, ref: Visibilites): boolean {
  const conforme = (x: { readonly id: string; readonly visible: boolean }) => { const v = ref.get(x.id); return v === undefined || v === x.visible; };
  if (estPlat(dessin)) return dessin.formes.every(conforme);
  return dessin.formes.every(conforme) && Object.values(dessin.groupes ?? {}).every(conforme);
}

/** Le chemin riche de `restaurerVisibilites` : les formes, puis les groupes. */
function restaurerRiche(dessin: DessinSvg, avant: Visibilites): DessinSvg {
  let change = false;
  const rendre = <T extends { readonly id: string; readonly visible: boolean }>(x: T): T => {
    const v = avant.get(x.id);
    if (v === undefined || v === x.visible) return x;
    change = true;
    return { ...x, visible: v };
  };
  const formes = dessin.formes.map(rendre);
  const groupes: Record<string, Groupe> = {};
  for (const [k, g] of Object.entries(dessin.groupes ?? {})) groupes[k] = rendre(g);
  return change ? avecGroupes(dessin, formes, groupes) : dessin;
}
