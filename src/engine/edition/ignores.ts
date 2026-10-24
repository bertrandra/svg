// Ce que la lecture laisse tomber sans refuser le SVG, et le dit : un rendu qui change a l'ouverture
// sans que personne le sache est pire qu'un refus. Les degrades, motifs, filtres, decoupes et masques
// n'ont pas leur place ici : une forme qui s'en sert est refusee avec son nom (lecture.ts), et une
// definition que rien n'utilise ne change aucun rendu. Ici, seulement ce qui est lu, ignore, et se voit.

export type Proprietes = Record<string, string>;

const A = {
  selecteurs: 'les règles de style qui ne visent pas une classe (balise, identifiant…)',
  marqueurs: 'les marqueurs des traits (pointes de flèche…)',
  pointillesUnite: 'les pointillés dont une longueur est en pourcentage ou en unité autre que le pixel (le trait s’écrit plein)',
  decalageUnite: 'le décalage des pointillés en pourcentage ou en unité autre que le pixel (il s’écrit nul)',
  jonctionsSvg2: 'les jonctions de trait « arcs » et « miter-clip » (elles s’écrivent arrondies)',
  animations: 'les animations'
} as const;

export const ANIMATIONS = new Set(['animate', 'animateTransform', 'animateMotion', 'animateColor', 'set']);

/** Les proprietes de peinture qu'une regle de feuille peut poser : si elle n'en pose aucune, l'ignorer ne change rien. */
const PEINTURE = new Set([
  'fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'fill-rule', 'display', 'visibility',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'color',
  'marker', 'marker-start', 'marker-mid', 'marker-end'
]);

/** Vrai si une regle de feuille, ignoree faute de viser une classe, posait une propriete qui se voit. */
export const reglePeint = (decl: Proprietes): boolean => Object.keys(decl).some(k => PEINTURE.has(k));

export const MSG_SELECTEURS = A.selecteurs;
export const MSG_ANIMATIONS = A.animations;

/** Les marqueurs, quand la forme en porte (ils ne se dessinent pas). */
export function ignoresDeMarqueurs(h: Proprietes): string[] {
  const pose = (k: string) => { const v = (h[k] ?? '').trim(); return v !== '' && v !== 'none'; };
  return pose('marker') || pose('marker-start') || pose('marker-mid') || pose('marker-end') ? [A.marqueurs] : [];
}

export const MSG_POINTILLES_UNITE = A.pointillesUnite;
export const MSG_DECALAGE_UNITE = A.decalageUnite;
export const MSG_JONCTIONS_SVG2 = A.jonctionsSvg2;
