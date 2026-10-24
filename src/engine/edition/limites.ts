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
 * Confrontations d'une regle de feuille a un element, au total. Les regles sont rangees par classe, identifiant et type : un
 * element n'est confronte qu'a celles qui peuvent le viser. Un Illustrator compte 1 000 regles pour 5 000 elements et en fait
 * 150 000 (quelques regles par classe, par element) ; 2e6 est treize fois plus et se juge en une seconde environ (chaque regle
 * qui vise tient aussi au tri par specificite). Au-dela (100 000 regles « * » sur 1 000 formes), l'onglet gele.
 */
export const CONFRONTATIONS_MAX = 2e6;

/**
 * Caracteres de trace (attributs `d` et `points`) lus en tout, chaque clone <use> recomptant ceux de sa cible. Le temps de
 * lecture est proportionnel : un million de points (7 Mo) se lit et s'ecrit en une dizaine de secondes, et sans cette borne un
 * seul chemin d'un Mo clone 20 000 fois (la borne des clones) en demanderait des heures. Une vectorisation de 5 000 formes en
 * compte 2 Mo : la borne est six fois plus haute.
 */
export const DONNEES_TRACE_MAX = 8_000_000;

/** Vrai quand un nombre est une coordonnee que la lecture accepte. */
export const coordonneeSaine = (v: number): boolean => v >= -COORDONNEE_MAX && v <= COORDONNEE_MAX;
