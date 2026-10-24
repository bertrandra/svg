// Nettoyer un SVG avant de l'ouvrir ou de le rendre. Un dessin vient d'un fichier qu'on n'a pas
// ecrit : on en retire tout ce qui s'execute ou va chercher ailleurs (scripts, gestionnaires
// d'evenements, foreignObject, references externes), et on garde le dessin. Ce nettoyage protege
// aussi les SVG enregistres, ouverts ailleurs.
//
// Le travail est fait par `assainirSvg` (util/assainirSvg.ts), qui lit le document au lieu de chercher le
// danger dans le texte : voir docs/securite.md pour ce qu'il garantit.

import { assainirSvg, ATTRIBUT_HREF_EXTERNE } from './assainirSvg.js';

export interface SvgPropre { svg: string; ratio: number }

export { ATTRIBUT_HREF_EXTERNE };

/**
 * Le SVG nettoye et son rapport largeur / hauteur, `null` s'il n'y a pas de <svg> avec un viewBox ou des dimensions, ou
 * `{ erreur }` quand le texte est refuse en le nommant (mal forme, trop profond, trop gros…).
 */
export function nettoyerSvgNomme(texte: string): SvgPropre | { erreur: string } | null {
  return assainirSvg(texte);
}

export function nettoyerSvg(texte: string): SvgPropre | null {
  const r = assainirSvg(texte);
  return r && 'svg' in r ? r : null;
}
