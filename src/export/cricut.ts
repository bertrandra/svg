// Le SVG pour Cricut Design Space (ADR-0013) : des remplissages pleins, une couleur par couche, aucun trait,
// aucune opacite, chaque forme (trous compris) en un seul <path>, et une taille PHYSIQUE (`width` et `height`
// en pouces ou en millimetres) : Design Space lit une longueur sans unite a 72 ppp, un SVG ecrit a 96 ppp y
// arriverait a 75 %. Bati sur `svgExporte` (donc sur `ecrireDessin`) : memes nombres, meme ordre, memes octets
// demain. Un dessin qui ne s'ecrirait qu'en changeant ce qu'on voit (un trait, une transparence, une piece plus
// grande que le tapis) est refuse en le nommant : la correction se fait dans le panneau, sous les yeux. Pur.

import { marquerProduction, type DessinSvg, type Forme } from '../engine/editionSvg.js';
import { constatsBloquants, marqueDeProfil, versUnite, type Constat, type ProfilProduction } from '../engine/preparation.js';
import { svgExporte } from './svgs.js';

export type ExportCricut =
  | { readonly svg: string; readonly couches: number; readonly laissees: number }
  | { readonly erreur: string; readonly constats: readonly Constat[] };

/** Les champs du trait et des opacites propres, qu'une forme pleine pour la decoupe n'a plus. */
const CHAMPS_RETIRES: ReadonlySet<string> = new Set(['pointilles', 'decalagePointilles', 'bout', 'jonction', 'limiteMitre', 'opaciteContour', 'opaciteRemplissage']);

/** La forme telle qu'on la decoupe : son fond seul, plein. Un trait d'epaisseur nulle (invisible) part sans rien changer. */
function pleine(f: Forme): Forme {
  // Retirer un champ facultatif, c'est le laisser de cote (exactOptionalPropertyTypes), pas le mettre a undefined.
  const reste: Record<string, unknown> = Object.fromEntries(Object.entries(f).filter(([c]) => !CHAMPS_RETIRES.has(c)));
  return { ...reste, contour: null, opacite: 1 } as Forme;
}

/** La phrase d'un refus : ce qui bloque, dans l'ordre du panneau. */
export const phraseRefus = (constats: readonly Constat[]): string => 'Corrigez d’abord, dans le panneau « Prêt pour Cricut » : ' + constats.map(c => c.message).join(' ');

/**
 * Le SVG de decoupe pour ce profil, ou le refus et ses raisons. Les formes visibles sans fond (rien a decouper :
 * elles sont invisibles, puisqu'un trait bloque) sont laissees de cote et comptees. Le fichier porte la marque du
 * contexte (`data-ed-*`) : rouvert dans l'editeur, il retrouve son panneau.
 */
export function svgCricut(dessin: DessinSvg, p: ProfilProduction): ExportCricut {
  const profil: ProfilProduction = p.procede === 'decoupe' ? p : { ...p, procede: 'decoupe' };
  const bloquants = constatsBloquants(dessin, profil);
  if (bloquants.length) return { erreur: phraseRefus(bloquants), constats: bloquants };
  const visibles = dessin.formes.filter(f => f.visible);
  const pleines = visibles.filter(f => f.remplissage !== null).map(pleine);
  const couches = new Set(pleines.map(f => (f.remplissage ?? '').toLowerCase())).size;
  const svg = svgExporte({ vb: dessin.vb, formes: pleines }, { precision: 3, taille: { largeur: versUnite(dessin.vb[2], p.unite), unite: p.unite } });
  return { svg: marquerProduction(svg, marqueDeProfil(profil)), couches, laissees: visibles.length - pleines.length };
}
