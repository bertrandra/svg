// Le nom approche d'une couleur, en francais (ADR-0037) : de quoi nommer une pastille du nuancier pour un lecteur d'ecran quand
// la couleur n'a pas de nom donne (« Rouge foncé », « Gris clair », « Bleu »). Un nom de famille, pas un nom de catalogue : il
// aide a reconnaitre la couleur, et le code qui le suit la designe exactement.
//
// La famille se lit sur OKLCH (util/couleur.ts) : la clarte et la chroma disent noir, blanc et gris ; la teinte dit la famille,
// par des bornes posees sur les teintes OKLCH des couleurs de reference (rouge sRGB a 29 degres, orange vers 55, jaune vers 110,
// vert vers 142, cyan vers 195, bleu vers 264, violet vers 305, magenta vers 328). Pur et deterministe.

import { lireHex, versOklch } from '../util/couleur.js';

/** Les familles par teinte OKLCH : la borne haute (exclue) et le nom. Le rouge ferme le cercle. */
const FAMILLES: ReadonlyArray<readonly [number, string]> = [
  [42, 'rouge'],[75, 'orange'], [118, 'jaune'], [170, 'vert'], [220, 'turquoise'], [286, 'bleu'], [318, 'violet'], [348, 'magenta'], [361, 'rouge']
];

/** La famille d'une teinte chromatique, nuancee la ou le mot change avec la clarte (un orange sombre est un brun). */
function famille(l: number, c: number, h: number): string {
  const nom = FAMILLES.find(([borne]) => h < borne)?.[1] ?? 'rouge';
  if (nom === 'orange' && l < 0.6) return 'brun';
  if (nom === 'jaune' && l < 0.68) return 'olive';
  if ((nom === 'rouge' || nom === 'magenta') && l > 0.78 && c < 0.14) return 'rose';
  // Un magenta sombre se dit violet (le « purple » du web a la teinte du fuchsia, plus sombre).
  if (nom === 'magenta' && l < 0.5) return 'violet';
  if ((nom === 'orange' || nom === 'jaune') && l > 0.85 && c < 0.07) return 'beige';
  return nom;
}

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Le nom approche d'un code `#rrggbb` (ou `#rgb`) : « Noir », « Blanc », « Gris clair », « Bleu foncé »… ; le code lui-meme pour
 * ce qui n'est pas un code hexadecimal (jamais une couleur devinee).
 */
export function nomDeCouleur(hex: string): string {
  const rgb = lireHex(hex);
  if (!rgb) return hex;
  const { l, c, h } = versOklch(rgb);
  if (c < 0.02) {
    if (l < 0.25) return 'Noir';
    if (l > 0.97) return 'Blanc';
    return l < 0.45 ? 'Gris foncé' : l > 0.8 ? 'Gris clair' : 'Gris';
  }
  const nom = famille(l, c, h);
  // Les mots qui disent deja la clarte (brun, olive, rose, beige) ne prennent pas de nuance de plus.
  // Un jaune vif est clair par nature : il ne se dit « clair » que pale.
  const clair = l > 0.8 && !(nom === 'jaune' && c >= 0.15);
  const nuance = nom === 'brun' || nom === 'olive' || nom === 'rose' || nom === 'beige' ? '' : l < 0.45 ? ' foncé' : clair ? ' clair' : '';
  return majuscule(nom + nuance);
}

/** Une opacite en pourcentage entier, telle qu'on la dit (« opacité 50 % ») ; vide pour une couleur pleine. */
export const phraseOpacite = (opacite: number | undefined): string =>
  opacite === undefined || opacite >= 1 ? '' : 'opacité ' + Math.round(opacite * 100) + ' %';
