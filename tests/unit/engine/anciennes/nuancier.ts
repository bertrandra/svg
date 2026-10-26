// Le corps d'avant l'etape 3 (ADR-0012, annexe 7 §3, « loi du dessin plat ») de `apportsDe` (engine/nuancier.ts) : sous un degrade,
// une forme apporte desormais les couleurs de ses arrets et non sa couleur de repli. Recopie tel quel, sans sa memoire ; il ne sert
// qu'a la loi du dessin plat et disparait a la bascule (etape 14).

import { lireCode, versHex } from '../../../../src/util/couleur.js';
import { opaciteDuContour, opaciteDuRemplissage } from '../../../../src/engine/edition/opacites.js';
import type { Forme } from '../../../../src/engine/editionSvg.js';
import { aireDeChemin, longueurDeChemin } from '../../../../src/engine/nuancier/surfaces.js';

interface Apport { readonly hex: string; readonly opacite: number; readonly surface: number }

const arrondi = (v: number, pas: number) => Math.round(v / pas) * pas;

/** Un code de peinture lu en `#rrggbb` minuscule, ou null (aucune peinture, ou un mot qu'on ne lit pas : jamais devine). */
function hexDe(peinture: string | null): string | null {
  if (!peinture) return null;
  const rgb = lireCode(peinture);
  return rgb ? versHex(rgb) : null;
}

/**
 * Ce qu'une forme apporte au nuancier : son remplissage (l'aire peinte) et son contour (la longueur du trace par son
 * epaisseur), chacun a son opacite effective (celle de la forme par celle de la peinture), au centieme. Une peinture invisible
 * (opacite nulle, trait d'epaisseur nulle, aire nulle) n'apporte rien : elle n'est pas employee.
 */
export function apportsDeAncien(f: Forme): readonly Apport[] {
  const r: Apport[] = [];
  const fond = hexDe(f.remplissage), trait = hexDe(f.contour);
  if (fond) {
    const opacite = arrondi(f.opacite * opaciteDuRemplissage(f), 0.01), surface = opacite > 0 ? aireDeChemin(f.d, f.regle) : 0;
    if (surface > 0) r.push({ hex: fond, opacite, surface });
  }
  if (trait && f.epaisseur > 0) {
    const opacite = arrondi(f.opacite * opaciteDuContour(f), 0.01), surface = opacite > 0 ? longueurDeChemin(f.d) * f.epaisseur : 0;
    if (surface > 0) r.push({ hex: trait, opacite, surface });
  }
  return r;
}
