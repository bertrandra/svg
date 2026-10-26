// Les cas d'ecriture des idiomes de filtres des editeurs (ADR-0012, etape 13b ; annexe 7 §7) : chaque fichier du corpus d'acceptation
// reconstitue l'idiome d'un editeur sur des formes originales, se lit en mode riche en un flou, une ombre portee ou rien (un filtre
// neutre), s'ecrit comme sa reference (les formes exactes de l'annexe 4 B §2) et se relit en point fixe (ecriture-stable-v2.test.ts).
// Ce que la lecture en dit et les refus voisins sont dans `idiomes.test.ts`.

import type { CasV2 } from './cas.js';

export const CAS: readonly CasV2[] = [
  // Figma : ombre portee (aplat transparent, alpha durci x127, decalage, flou, decoupe sous la forme, teinte, deux fusions normales),
  // sur une forme et sur un groupe de deux formes opaques.
  { nom: 'corpus-figma-ombre', entree: '../corpus/figma-ombre' },
  // Figma : flou de calque (le graphique fusionne sur l'aplat transparent, puis flou).
  { nom: 'corpus-figma-flou-calque', entree: '../corpus/figma-flou-calque' },
  // Sketch : alpha decale, flou, teint par une matrice (en RVB lineaire), fusionne sous le graphique ; unites de boite en pourcentages.
  { nom: 'corpus-sketch-ombre', entree: '../corpus/sketch-ombre' },
  // Illustrator : AI_Shadow_1 (alpha flou et decale, noir plein, fusionne sous le graphique).
  { nom: 'corpus-illustrator-ombre', entree: '../corpus/illustrator-ombre' },
  // Illustrator : Adobe_OpacityMaskFilter, une matrice identite sur le contenu d'un masque, neutre.
  { nom: 'corpus-illustrator-masque-opacite', entree: '../corpus/illustrator-masque-opacite' }
];
