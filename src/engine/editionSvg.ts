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

export type { Lettre, Commande, Chemin, Forme, DessinSvg, Boite, Matrice, BoutNonPlat, JonctionNonRonde, TexteVivant, PoliceTexte, AlignementTexte, Operation, DispositionTexte, DispositionSurForme, DispositionDansForme, DispositionEnveloppe, CoteTexte } from './edition/types.js';
export type {
  Contenu, Groupe, Peinture, Degrade, DegradeLineaire, DegradeRadial, ArretDegrade, Motif, Effets, Flou, OmbrePortee, ImageIntegree, Decoupe, Masque
} from './edition/types.js';
export { IDENTITE } from './edition/types.js';

export { lireChemin, ecrireChemin, ancre, depart } from './edition/chemins.js';

export {
  multiplier, translation, echelle, rotation, lireTransformation, transformerChemin,
  boiteChemin, unir, seCroisent, boiteForme, boiteDe
} from './edition/geometrie.js';

export { lirePeinture, lirePeintureAlpha, peintureSure, type PeintureLue } from './edition/peinture.js';
export { lireDessin, type DessinLu, type LectureDessin, type OptionsLecture } from './edition/lecture.js';
export { CARACTERES_MAX, type PolicesTexte } from './edition/texteSvg.js';
export { opaciteDuRemplissage, opaciteDuContour } from './edition/opacites.js';
export {
  LIMITE_MITRE_DEFAUT, attributsTrait, pointillesEcrits, normaliserPointilles, genrePointilles, motifDeGenre,
  type ReglageTrait, type GenrePointilles
} from './edition/trait.js';

export { ecrireForme, ecrireDessin, statistiques, type Statistiques } from './edition/ecriture.js';
export { marquerProduction, lireProduction, identifiantValide, CHAMPS_PRODUCTION, PREFIXE_PRODUCTION, type MarqueProduction } from './edition/production.js';
export { ATTRIBUT_OPERATION, OPERATIONS, lireOperation, attributOperation } from './edition/operation.js';
export { ATTRIBUT_ORIGINE, avecOrigines, marquerOrigine, originesDe, lireOrigines } from './edition/provenance.js';
export {
  encoderTexte, decoderTexte, attributsTexte, lireTexteVivant, transformerTexte, sansTexte, dessinSansTextes, garderTextes,
  ATTRIBUTS_TEXTE, TEXTE_MAX, INTERLIGNE_DEFAUT, MSG_TEXTE_ILLISIBLE, type TexteLu,
  ATTRIBUTS_LIEN, MARGE_DEFAUT, MARGE_ENVELOPPE_DEFAUT, attributsLien, sansDisposition, avecFormesPorteuses, suitUneFormeChoisie, relierCopie, relierCopies, resoudreLiens, type LienLu
} from './edition/texteVivant.js';

export {
  transformer, deplacer, retourner, tourner, redimensionner, aligner, modifier, supprimer,
  modifierTrait, prochainId, dupliquer, ordonner, montrerSeulement,
  type Alignement, type Reglage, type Ordre
} from './edition/operations.js';

export {
  couleursDuDessin, remplacerCouleur, remplacerCouleurSur, idsDeCouleur, idsMemeCouleur, groupesDeCouleur,
  lireCouleurs, partagerGroupes, memesCouleurs, lireCouleursDuDessin, partagerCouleursDuDessin,
  type CouleurDuDessin, type SurCouleur, type GroupeCouleur, type LectureCouleurs, type LectureCouleursDuDessin
} from './edition/couleurs.js';
// Etape 13d : les couleurs des degrades et des motifs dans les outils de couleur.
export {
  remplacerCouleurs, couleursDePeinture, couleursDuCote, couleursDeForme, recolorerForme, type TableCouleurs, type CoteCouleur
} from './edition/couleurs.js';
export { couleursDArrets } from './edition/degradesOperations.js';

export {
  couleursProches, fusionnerCouleursProches, idsDeNuancesProches,
  type GrappeCouleurs, type FusionCouleurs
} from './edition/couleursProches.js';

export { visibilitesDe, restaurerVisibilites, visibilitesConformes, type Visibilites } from './edition/isolement.js';

export { retirerPetites, regrouper, ajusterPlan } from './edition/nettoyage.js';
export { boiteAvecTrait } from './edition/etendue.js';

export { simplifierChemin, simplifier, compterPoints } from './edition/simplification.js';

export { deplacerAncre, deplacerPoignee, supprimerAncre, diviserSegment, basculerSegment } from './edition/points.js';

export { arrondirAngles, arrondirFormes, type ResultatArrondi, type ResultatArrondiFormes } from './edition/arrondi.js';
export {
  typeDeNoeud, lireNoeud, aDesPoignees, convertirNoeud, convertirNoeudForme, deplacerPoigneeLiee,
  type TypeNoeud, type Noeud, type Cote
} from './edition/noeuds.js';
export {
  inverserChemin, inverserSens, casserEnNoeud, casserForme, joindreExtremites, supprimerNoeudEnGardantLaCourbe,
  type ResultatJonction
} from './edition/jonctions.js';

export {
  STYLE_DEFAUT, rectangle, ellipse, etoile, polygone, ajouterForme,
  type Style
} from './edition/formes.js';
export {
  FORMES_DE_BASE, FICHES_FORMES, BORNES_FORMES, PARAMETRES_FORMES_DEFAUT, bornerParametres, regleDeForme, formeDeBase, rectangleArrondi, polygoneRegulier, anneau,
  reconnaitreFormeDeBase, branchesEtoile, estEllipseChemin,
  type FormeDeBase, type FicheForme, type ParametresFormes, type AngleTriangle, type PointeFleche, type SensFleche, type PortionCercle
} from './edition/formesDeBase.js';

export { inserer, combiner, sousChemins, separer, coller } from './edition/assemblage.js';

export { pasGrille, aimanter } from './edition/grille.js';

export {
  cheminDeGlyphe, sourceDeGlyphes, formesDeGlyphes, PENCHE,
  type CommandeGlyphe, type Glyphes, type SourceContours, type GlypheAPoser, type StyleGlyphes
} from './edition/glyphes.js';

// ================================================================ le modele v2 (ADR-0012, annexe 8)
// Un bloc par fonctionnalite : chaque etape n'ajoute ses exports que dans le sien, pour que deux etapes paralleles ne se rencontrent
// pas dans ce fichier. Les points d'extension et l'arbre (etape 0) sont communs a toutes.

// ---- etape 0 : l'arbre, les points d'extension, les definitions, la transformation d'une feuille
export {
  estPlat, feuillePlate, arbreDe, ancetres, profondeur, visibleEffectif, verrouilleEffectif, feuillesDe, unites, promouvoir,
  prochainNumero, parcourirContenus, poidsDessin, verifierDessin, normaliser, PROFONDEUR_GROUPES_MAX,
  type Arbre, type NoeudArbre
} from './edition/arbre.js';
export {
  RANG_GROUPE, RANG_FEUILLE, attributsTries, prisesDe, lecteurDe, resoudrePeinture, completerFeuille, completerGroupe, etendreFeuille, etendreGroupe,
  type Fonctionnalite, type CrochetsLecture, type CrochetsEcriture, type CrochetsTransformation, type CrochetsEtendue, type PriseEnCharge, type Marche,
  type LecteurElement, type PeintureResolue, type AttributEcrit, type ContexteEcriture
} from './edition/fonctionnalites.js';
export { FONCTIONNALITES } from './edition/catalogue.js';
export { idDefinition, recueil, type GenreDefinition, type Definition, type Recueil } from './edition/definitions.js';
export { ATTRIBUT_MODELE, VERSION_MODELE } from './edition/ecritureRiche.js';
export { transformerFeuille, transformerGroupe } from './edition/transformation.js';

// ---- etape 1 : groupes (moteur)
export {
  grouper, degrouper, deplacerDans, renommer, groupeDe, reglerGroupes, dupliquerNoeuds, ordonnerNoeuds, montrerSeulementNoeuds, insererContenu,
  collerContenu, egales, MSG_MEME_PARENT, type OrdreNoeuds
} from './edition/groupes.js';
export { groupes, nomDuGroupe, GROUPES_MAX, NOM_GROUPE_MAX, ATTRIBUT_NOM, MSG_GROUPES_PROFONDS, MSG_GROUPES_NOMBREUX } from './edition/fonctions/groupes.js';
export { boiteVisuelle } from './edition/etendueVisuelle.js';
export { ignoresDeFusion, MSG_FUSION, MSG_ORDRE_PEINTURE, MSG_VECTOR_EFFECT } from './edition/fusion.js';

// ---- etape 2 : groupes (interface) : le contexte d'edition et le rendu generique de la toile
export { contexteValide, uniteDans, noeudsDuNiveau, unitesPrenables, cheminDuContexte } from './edition/contexteEdition.js';
export { renduDe, lireAttributs, PRECISION_RENDU, type RenduDessin, type RenduFeuille, type RenduGroupe, type AttributRendu } from './edition/rendu.js';

// ---- etape 3 : definitions et degrades
export {
  ARRETS_MAX, estDegrade, poidsArrets, couleurDeRepli, transformerDegrade, definitionDegrade
} from './edition/degrades.js';
export {
  CHAINE_HREF_MAX, PROFONDEUR_DEFS_MAX, NOEUDS_DEFS_MAX, lireReference, chaineHref, attributHerite, hrefDe, lireLongueur, lireFraction,
  type Reference, type Chaine, type Longueur
} from './edition/resolution.js';
export { degrades, MSG_DEGRADES, REFUS_DEGRADES } from './edition/fonctions/degrades.js';

// ---- etape 4 : degrades (interface) : les operations sur les degrades et leurs arrets
export { lineaireDansLePlan } from './edition/degrades.js';
export {
  ARRETS_MIN, degradeDe, poserDegrade, retirerDegrade, rangAjoute, ajouterArret, retirerArret, modifierArret, echangerArrets, inverserArrets,
  reglerEtalement, axeDegrade, pointSurAxe, positionSurAxe, angleDegrade, reglerAngle, centreRayon, reglerCentre, reglerRayon, deplacerExtremite,
  formesADegrade, degradesDistincts,
  type CoteDegrade, type GenreDegrade, type EtalementDegrade, type ReglageArret, type PointDegrade, type ExtremiteDegrade
} from './edition/degradesOperations.js';

// ---- etape 5 : decoupes
export {
  decoupes, REFUS_DECOUPES, MSG_DECOUPES, feuilleDeDecoupe, transformerDecoupe, boiteDecoupe
} from './edition/fonctions/decoupes.js';
export { creerDecoupe, liberer, MSG_DECOUPE } from './edition/decoupes.js';
export { renumeroterContenus } from './edition/arbre.js';

// ---- etape 6 : masques d'opacite
export { masques, REFUS_MASQUES, MSG_MASQUES, transformerMasque } from './edition/fonctions/masques.js';
export { creerMasque, libererMasque, inverserMasque, MSG_MASQUE } from './edition/masques.js';
export type { OutilsTransformation } from './edition/fonctionnalites.js';

// ---- etape 7 : effets
export {
  NOEUDS_A_EFFET_MAX, ecartMax, decalageMax, aDesEffets, ecartsSous, flouDe, transformerEffets, margeEffets, elargir, effetsEcrits, regionEcrite,
  definitionFiltre
} from './edition/effets.js';
export {
  effets, MSG_EFFETS, REFUS_EFFETS, PRIMITIVES_MAX, msgEcartBorne, msgDecalageBorne, refusPrimitive, refusEntree, boiteEcrite
} from './edition/fonctions/effets.js';

// ---- etape 9 : motifs
export { motifs, REFUS_MOTIFS, MSG_MOTIFS, TUILE_MIN, estMotif, couleurDeRepliMotif, transformerMotif } from './edition/fonctions/motifs.js';
export { creerMotif, MSG_MOTIF } from './edition/motifs.js';

// ---- etape 12 : images
// Les reperes du document et la repetition d'une selection (ADR-0038).
export type { Reperes } from './edition/types.js';
export {
  ATTRIBUT_REPERES, REPERES_MAX, normaliserReperes, avecReperes, ajouterRepere, deplacerRepere, supprimerRepere, effacerReperes,
  repereLePlusProche, nombreReperes, ecrireReperes, lireReperes, marquerReperes, boitesReperes, type AxeRepere
} from './edition/reperes.js';
export {
  REPETITION_MAX, copierPar, matricesGrille, pasGrilleParDefaut, dupliquerEnGrille, pasRadial, matricesRadiales, repetitionRadiale,
  matriceSymetrie, axeParDefaut, symetrie, type ResultatRepetition, type ReglageGrille, type ReglageRadial, type ReglageSymetrie
} from './edition/repetition.js';
export {
  IMAGE_OCTETS_MAX, IMAGES_OCTETS_MAX, IMAGE_PIXELS_MAX, MSG_POINTS_IMAGE, DONNEES_IMAGE, ASPECT_IMAGE, verifierDonneesImage, rectangleImage,
  lireAspectImage, dessinableEnPoints, ecrireImage, transformerImage, type DonneesVerifiees
} from './edition/fonctions/images.js';
export { dimensionsImage, decoderBase64, type DimensionsImage, type NatureImageIntegree } from './edition/dimensionsImage.js';

// ---- etape 13c : <svg> imbrique, <text> lu en groupe de lettres
export { imbrications, REFUS_IMBRICATIONS, MSG_IMBRICATIONS } from './edition/fonctions/imbrications.js';
export { nomGroupeTexte } from './edition/texteSvg.js';
