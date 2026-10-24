// L'edition d'un dessin SVG, en pur (ADR-0001). Un SVG se lit en une liste de formes a plat, de la
// plus basse a la plus haute : chaque forme est un chemin en coordonnees absolues du plan de travail
// (transformations des groupes appliquees, cercles, rectangles et arcs ramenes a des courbes), avec
// son remplissage, son contour et son opacite resolus (attributs, classes, style, heritage). Toute
// operation rend un nouveau dessin et ne touche pas l'ancien : l'historique les garde tels quels.
//
// Ce qui ne se ramene pas a des chemins pleins (texte, image, degrade, masque, decoupe, filtre, SVG imbrique) est
// refuse a la lecture avec son nom : on n'edite pas un dessin qu'on ne saurait pas reecrire. Un <use> se deplie
// en formes independantes (cycle, fichier externe : refuses) et la feuille <style> se lit avec ses selecteurs ;
// ce que la lecture laisse tomber sans refuser est dit par `ignores`.
//
// Ce fichier n'est plus que la facade : le travail vit dans `edition/`, un module par sujet. Les
// autres couches n'importent que d'ici, pour que le decoupage interne puisse bouger sans eux.

export type { Lettre, Commande, Chemin, Forme, DessinSvg, Boite, Matrice, BoutNonPlat, JonctionNonRonde } from './edition/types.js';
export { IDENTITE } from './edition/types.js';

export { lireChemin, ecrireChemin, ancre, depart } from './edition/chemins.js';

export {
  multiplier, translation, echelle, rotation, lireTransformation, transformerChemin,
  boiteChemin, unir, seCroisent, boiteForme, boiteDe
} from './edition/geometrie.js';

export { lirePeinture, lirePeintureAlpha, type PeintureLue } from './edition/peinture.js';
export { lireDessin, type DessinLu, type LectureDessin } from './edition/lecture.js';
export { opaciteDuRemplissage, opaciteDuContour } from './edition/opacites.js';
export {
  LIMITE_MITRE_DEFAUT, attributsTrait, pointillesEcrits, normaliserPointilles, genrePointilles, motifDeGenre,
  type ReglageTrait, type GenrePointilles
} from './edition/trait.js';

export { ecrireForme, ecrireDessin, statistiques, type Statistiques } from './edition/ecriture.js';

export {
  transformer, deplacer, retourner, tourner, redimensionner, aligner, modifier, supprimer,
  modifierTrait, prochainId, dupliquer, ordonner, montrerSeulement,
  type Alignement, type Reglage, type Ordre
} from './edition/operations.js';

export {
  couleursDuDessin, remplacerCouleur, remplacerCouleurSur, idsDeCouleur, idsMemeCouleur, groupesDeCouleur,
  lireCouleurs, partagerGroupes, memesCouleurs,
  type CouleurDuDessin, type SurCouleur, type GroupeCouleur, type LectureCouleurs
} from './edition/couleurs.js';

export {
  couleursProches, fusionnerCouleursProches, idsDeNuancesProches,
  type GrappeCouleurs, type FusionCouleurs
} from './edition/couleursProches.js';

export { visibilitesDe, restaurerVisibilites, visibilitesConformes, type Visibilites } from './edition/isolement.js';

export { retirerPetites, regrouper, ajusterPlan } from './edition/nettoyage.js';
export { boiteAvecTrait } from './edition/etendue.js';

export { simplifierChemin, simplifier, compterPoints } from './edition/simplification.js';

export { deplacerAncre, deplacerPoignee, supprimerAncre, diviserSegment, basculerSegment } from './edition/points.js';

export {
  STYLE_DEFAUT, rectangle, ellipse, etoile, polygone, ajouterForme,
  type Style
} from './edition/formes.js';

export { inserer, combiner, sousChemins, separer, coller } from './edition/assemblage.js';

export { pasGrille, aimanter } from './edition/grille.js';
