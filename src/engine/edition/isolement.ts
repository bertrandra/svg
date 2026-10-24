// Isoler une couleur, c'est masquer toutes les autres formes ; en sortir, c'est rendre a chaque forme
// la visibilite qu'elle avait avant, pas tout afficher (certaines etaient masquees a dessein). On garde
// donc un instantane de la visibilite par identifiant de forme. Les formes nees ou mortes entre-temps
// n'y figurent pas : on ne les touche pas, on ne les invente pas.

import type { DessinSvg } from './types.js';

/** La visibilite de chaque forme, par identifiant. */
export type Visibilites = ReadonlyMap<string, boolean>;

export const visibilitesDe = (dessin: DessinSvg): Visibilites => new Map(dessin.formes.map(f => [f.id, f.visible]));

/** Rend a chaque forme de l'instantane sa visibilite d'alors ; les autres formes restent comme elles sont. */
export function restaurerVisibilites(dessin: DessinSvg, avant: Visibilites): DessinSvg {
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
  return dessin.formes.every(f => { const v = ref.get(f.id); return v === undefined || v === f.visible; });
}
