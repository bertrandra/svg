// Ce que la lecture laisse tomber sans refuser le SVG, et le dit : un rendu qui change a l'ouverture
// sans que personne le sache est pire qu'un refus. Les degrades, motifs, filtres, decoupes et masques
// n'ont pas leur place ici : une forme qui s'en sert est refusee avec son nom (lecture.ts), et une
// definition que rien n'utilise ne change aucun rendu. Ici, seulement ce qui est lu, ignore, et se voit.

export type Proprietes = Record<string, string>;

const A = {
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

/** Vrai si une regle de feuille, ignoree faute d'etre portee, posait une propriete qui se voit. */
export const reglePeint = (proprietes: Iterable<string>): boolean => { for (const k of proprietes) if (PEINTURE.has(k)) return true; return false; };

/** Vrai si un texte de feuille (le corps d'un bloc @media, @keyframes…) pose, quelque part, une propriete qui se voit. */
const MOTIF_PEINTURE = new RegExp('(?:^|[;{}\\s])(?:' + [...PEINTURE].join('|') + ')\\s*:', 'i');
export const textePeint = (corps: string): boolean => MOTIF_PEINTURE.test(corps);

export const MSG_ANIMATIONS = A.animations;

// La feuille <style> (ADR-0009, troisieme lot) : ce que la lecture des selecteurs et des regles n'a pas porte.
export const MSG_FRERES = 'les règles de style dont le sélecteur vise un frère (« + » ou « ~ »)';
export const MSG_ESPACE_DE_NOMS = 'les règles de style dont le sélecteur porte un espace de noms (« | »)';
export const MSG_SELECTEUR_ILLISIBLE = 'les règles de style dont le sélecteur est illisible (un navigateur les abandonne aussi)';
export const MSG_IMBRIQUEES = 'les règles de style imbriquées dans une autre (CSS imbriqué)';
export const MSG_IMPORT = 'les feuilles de style importées par @import';
export const MSG_FONT_FACE = 'les polices déclarées par @font-face';
export const MSG_KEYFRAMES = 'les animations CSS (@keyframes)';
export const MSG_VARIABLES = 'les variables CSS var(…) (la valeur n’est pas reprise : la propriété retrouve son héritage)';
export const MSG_TRANSFORM_CSS = 'les transformations posées par le style (propriété CSS transform ; seul l’attribut transform est lu)';
export const MSG_FEUILLE_MEDIA = 'les feuilles de style réservées à un média (attribut media)';

/** Une pseudo-classe ou un pseudo-element non porte : on dit lequel. */
export const msgPseudo = (nom: string, element: boolean): string =>
  'les règles de style dont le sélecteur porte ' + (element ? 'le pseudo-élément ::' : 'la pseudo-classe :') + nom;

/** Un bloc @-regle (@media, @supports, @layer…) dont les regles ne sont pas evaluees. */
export const msgBlocArobase = (nom: string): string => 'les règles d’un bloc @' + nom + ' (leurs conditions ne sont pas évaluées)';

// Les clones <use> (ADR-0009, troisieme lot).
export const MSG_USE_ABSENT = 'les clones <use> dont la cible n’existe pas (ils ne dessinent rien, comme dans un navigateur)';
export const MSG_SYMBOLE_ROGNE = 'le rognage au cadre d’un <symbol> (ce qui dépasse du cadre reste dessiné)';

/** Les marqueurs, quand la forme en porte (ils ne se dessinent pas). */
export function ignoresDeMarqueurs(h: Proprietes): string[] {
  const pose = (k: string) => { const v = (h[k] ?? '').trim(); return v !== '' && v !== 'none'; };
  return pose('marker') || pose('marker-start') || pose('marker-mid') || pose('marker-end') ? [A.marqueurs] : [];
}

export const MSG_POINTILLES_UNITE = A.pointillesUnite;
export const MSG_DECALAGE_UNITE = A.decalageUnite;
export const MSG_JONCTIONS_SVG2 = A.jonctionsSvg2;
