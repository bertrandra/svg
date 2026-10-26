// Les cas d'ecriture des groupes (ADR-0012, etape 1) : les dix entrees v1 qui contiennent un <g>, relues en mode riche (leur
// reference `plat` ne bouge pas, elles recoivent une reference `riche` a part, annexe 2 §3), les entrees propres aux groupes, et les
// operations nouvelles ou changees sur un dessin a groupes. `ecriture-stable-v2.test.ts` les trouve tout seul.

import { degrouper, deplacerDans, dupliquer, grouper, modifier, ordonner, redimensionner, renommer, supprimer, transformer, rotation, type DessinSvg } from '../../../../src/engine/editionSvg.js';
import type { CasV2 } from './cas.js';

/** Les dix entrees v1 a <g> (annexe 2 §3). */
export const ENTREES_V1_A_GROUPES = [
  'evenodd-opacite', 'fidelite-lecture', 'lecture-css-selecteurs', 'lecture-use-imbriques', 'lecture-use-sprite', 'masquees-verrouillees', 'peintures',
  'racine-heritage', 'trait-pointilles', 'transformations'
] as const;

/** L'operation, et le dessin d'avant si elle n'a rien fait : une operation qui ne change rien ferait un cas sans objet. */
const changeant = (f: (d: DessinSvg) => DessinSvg) => (d: DessinSvg): DessinSvg => {
  const r = f(d);
  if (r === d) throw new Error('l operation du cas ne change rien');
  return r;
};

export const CAS: readonly CasV2[] = [
  ...ENTREES_V1_A_GROUPES.map((c): CasV2 => ({ nom: 'riche-' + c, entree: '../' + c })),
  // Une entree v1 venue apres le plan (ADR-0022) : un texte vivant dans un groupe transforme, dont la matrice suit.
  { nom: 'riche-texte-vivant-lecture', entree: '../texte-vivant-lecture' },
  { nom: 'groupes-imbriques', entree: 'groupes-imbriques' },
  { nom: 'groupes-opacite', entree: 'groupes-opacite' },
  { nom: 'groupes-nom-piegeux', entree: 'groupes-nom-piegeux' },
  { nom: 'groupes-use', entree: 'groupes-use' },
  // Un degrade et une image sous des groupes transformes (etapes 3 et 12) : relus, puis le groupe deplace, tourne, duplique.
  { nom: 'groupes-degrade-image', entree: 'groupes-degrade-image' },
  { nom: 'groupes-degrade-image-transformer', entree: 'groupes-degrade-image', operation: changeant(d => transformer(redimensionner(d, ['g1'], { x: 5, y: 5, l: 50, h: 50 }), ['g3'], rotation(25, 110, 40))) },
  { nom: 'groupes-degrade-image-dupliquer', entree: 'groupes-degrade-image', operation: changeant(d => dupliquer(d, ['g1', 'g3'], 0, 40).dessin) },
  // Un groupe masque n'ecrit rien (« masquer, a l'enregistrement, c'est retirer ») ; un groupe verrouille s'ecrit comme un autre.
  { nom: 'groupes-masque', entree: 'groupes-imbriques', operation: changeant(d => modifier(d, ['g2'], { visible: false })) },
  { nom: 'groupes-verrouille', entree: 'groupes-imbriques', operation: changeant(d => modifier(d, ['g1'], { verrouille: true })) },
  // Une opacite posee sur un groupe reste au groupe ; une couleur posee sur un groupe va a toutes ses formes.
  { nom: 'groupes-modifier', entree: 'groupes-imbriques', operation: changeant(d => modifier(modifier(d, ['g2'], { opacite: 0.4 }), ['g1'], { contour: '#15181d' })) },
  // Grouper un dessin plat le rend riche ; le groupe prend la place de la plus haute forme, avec son nom.
  { nom: 'groupes-grouper', entree: '../masquees-verrouillees', operation: changeant(d => grouper(d, ['f1', 'f3'], 'Paire « rouge et vert »').dessin) },
  { nom: 'groupes-degrouper', entree: 'groupes-imbriques', operation: changeant(d => degrouper(d, ['g2']).dessin) },
  { nom: 'groupes-deplacer-dans', entree: 'groupes-imbriques', operation: changeant(d => deplacerDans(d, ['g4'], 'g2', 'g3')) },
  { nom: 'groupes-renommer', entree: 'groupes-imbriques', operation: changeant(d => renommer(renommer(d, 'g1', 'Fond'), 'g7', 'Coin')) },
  { nom: 'groupes-dupliquer', entree: 'groupes-imbriques', operation: changeant(d => dupliquer(d, ['g2', 'f6'], 3, 40).dessin) },
  { nom: 'groupes-ordonner', entree: 'groupes-imbriques', operation: changeant(d => ordonner(ordonner(d, ['g2'], 'dernier'), ['g7'], 'arriere')) },
  { nom: 'groupes-transformer', entree: 'groupes-opacite', operation: changeant(d => transformer(redimensionner(d, ['g1'], { x: 5, y: 5, l: 60, h: 30 }), ['g2'], rotation(-20, 80, 15))) },
  { nom: 'groupes-supprimer', entree: 'groupes-imbriques', operation: changeant(d => supprimer(d, ['g3', 'f6'])) }
];
