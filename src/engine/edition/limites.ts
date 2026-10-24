// Ce que la lecture accepte, avec un refus nomme au-dela (docs/securite.md). Les bornes de l'analyse du texte
// (taille, elements, profondeur d'imbrication, attributs) sont dans `util/xml.ts` ; celles-ci portent sur le dessin.
// Chacune est haute : aucun SVG reel ne la touche (voir le commentaire de chacune).

/**
 * Une coordonnee, apres transformations. 1e9 unites sont 264 km au pixel de 96 ppp : les cartes en metres projetes (Web
 * Mercator va a 2e7) tiennent largement. Au-dela, les calculs flottants perdent le millieme que l'ecriture garde, et un
 * exposant demesure (1e308) deborde en Infinity puis en NaN, que l'ecriture ne saurait pas ecrire.
 */
export const COORDONNEE_MAX = 1e9;

/**
 * Elements ouverts en meme temps sur le chemin de la marche, groupes et <use> compris : un <use> emboite sur 16 niveaux dont
 * la cible est elle-meme profonde additionnerait sinon les profondeurs, et la pile des fonctions recursives deborderait.
 */
export const PROFONDEUR_MARCHE_MAX = 1500;

/**
 * Regles de feuille x elements du dessin : chaque element est confronte a chaque regle. Un Illustrator charge compte 1 000
 * regles pour 5 000 elements (5e6) ; 2e7 se juge en une seconde environ, au-dela l'onglet gele.
 */
export const REGLES_FOIS_ELEMENTS_MAX = 2e7;

/** Vrai quand un nombre est une coordonnee que la lecture accepte. */
export const coordonneeSaine = (v: number): boolean => v >= -COORDONNEE_MAX && v <= COORDONNEE_MAX;
