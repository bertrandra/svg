// Les types que l'editeur et ses panneaux se partagent. Un module de types seuls : tout le monde
// l'importe (ou le relit par EditeurSvg.tsx) sans jamais creer de cycle a l'execution.

import type { Boite, DessinSvg, Forme, Style, TypeNoeud } from '../engine/editionSvg.js';
import type { Booleen } from '../engine/booleens.js';
import type { Jonction } from '../engine/contours.js';
import type { Focale } from '../engine/navigation.js';
import type { Aimant } from '../engine/transformations.js';
import type { Bibliotheque } from '../io/bibliotheque.js';
import type { Historique } from '../util/historique.js';
import type { Annonce } from './annonces.js';
import type { Version } from './session.js';

/** Une couleur du nuancier propose dans l'inspecteur : un nom et un code #rrggbb en minuscules. */
export interface Teinte { nom: string; hex: string }

export type OutilForme = 'rectangle' | 'ellipse' | 'etoile' | 'ligne';
export type Outil = 'selection' | 'points' | 'main' | 'plume' | 'texte' | OutilForme;
export type Coin = 'nw' | 'ne' | 'sw' | 'se';
export type Point = readonly [number, number];
export interface Vue { zoom: number; x: number; y: number }
export type Fond = 'damier' | 'blanc' | 'sombre';
export type Tiroir = 'calques' | 'inspecteur' | null;

// L'editeur se partage en trois contextes (contexteEditeur.tsx), pour qu'un panneau ne se redessine que
// pour ce qu'il lit : le dessin (ce qu'on voit), l'interface (l'outil et la vue), les actions (les verbes).

/** Le dessin et ce qu'on en tire : l'historique, la selection, le nuancier, les versions, le presse-papiers. */
export interface ModeleDessin {
  h: Historique<DessinSvg>;
  dessin: DessinSvg;
  sel: string[];
  /** Les memes identifiants en ensemble : savoir si une forme est choisie sans parcourir toute la selection. */
  choisies: ReadonlySet<string>;
  boite: Boite | null;
  formeSeule: Forme | null;
  nuancier: readonly Teinte[];
  /** Ce que la lecture du SVG ouvert n'a pas repris (voir `lireDessin`) ; vide pour un dessin sans perte. */
  ignores: readonly string[];
  bibliotheque: Bibliotheque | 'a-charger' | null;
  versions: readonly Version[];
  presse: readonly Forme[];
}

/** L'outil, la vue et ce qui n'est que d'affichage : rien de ce qui s'ecrit dans le SVG. */
export interface EtatInterface {
  outil: Outil;
  point: number | null;
  style: Style;
  trace: readonly Point[];
  grille: boolean;
  aimants: boolean;
  /** Les booleens rebatissent en courbes les contours qui l'etaient (defaut : oui) ; sinon ils rendent des segments droits. */
  lisserBooleens: boolean;
  guides: readonly Aimant[];
  tiroir: Tiroir;
  contours: boolean;
  fond: Fond;
  pas: number;
  /** La valeur aimantee a la grille quand elle est active, telle quelle sinon. */
  aimant: (v: number) => number;
  vues: Vues;
  /** Le dernier message de la barre d'etat (vide : l'etat par defaut de l'outil). */
  message: string;
  /** La confirmation « Abandonner les modifications » est affichee. */
  quitter: boolean;
  /** Le reticule du clavier d'un outil de trace (null : pas encore deplace aux fleches). */
  curseur: Point | null;
  /** Le curseur de la selection au clavier (Maj+Page suivante, Espace), valable tant que la selection n'a pas change. */
  focale: Focale | null;
  /** La derniere phrase a dire aux lecteurs d'ecran (region unique, voir RegionVocale.tsx). */
  annonce: Annonce;
}

/**
 * Les verbes de l'editeur. Ce contexte ne change jamais d'identite : chaque verbe lit l'etat du moment
 * au moment de l'appel (une reference mise a jour a chaque rendu), jamais celui du rendu qui l'a cree.
 */
export interface ActionsEditeur {
  appliquer: (f: (d: DessinSvg) => DessinSvg, cle?: string | null) => void;
  faire: (f: (d: DessinSvg) => DessinSvg, texte?: string) => void;
  finir: () => void;
  annulerGeste: (cle: string) => void;
  defaire: () => void;
  refaire: () => void;
  nouvelleCle: () => string;
  dire: (t: string) => void;
  choisir: (ids: string[]) => void;
  poserPoint: (i: number | null) => void;
  poserOutil: (o: Outil) => void;
  poserStyle: (s: Style) => void;
  poserTrace: (t: readonly Point[]) => void;
  poserGrille: (g: boolean) => void;
  poserAimants: (a: boolean) => void;
  poserLisserBooleens: (l: boolean) => void;
  poserGuides: (g: readonly Aimant[]) => void;
  poserTiroir: (t: Tiroir) => void;
  poserCurseur: (p: Point | null) => void;
  poserFocale: (f: Focale | null) => void;
  /** Dit une phrase aux lecteurs d'ecran sans l'afficher dans la barre d'etat. */
  annoncer: (t: string) => void;
  poserContours: (f: boolean | ((c: boolean) => boolean)) => void;
  poserFond: (f: Fond) => void;
  /** Ferme l'editeur, apres confirmation s'il y a des modifications. */
  demanderFermeture: () => void;
  /** Ferme l'editeur sans rien demander (la confirmation « Abandonner »). */
  fermer: () => void;
  /** Referme la confirmation et reprend l'edition. */
  continuerEdition: () => void;
  garderVersion: (nom: string, svg: string) => void;
  supprimerVersion: (id: string) => void;
  finirTrace: (fermer: boolean) => void;
  supprimerSelection: () => void;
  dupliquerSelection: () => void;
  copierSelection: () => void;
  couperSelection: () => void;
  collerPresse: () => void;
  combinerSelection: () => void;
  separerSelection: () => void;
  masquerSelection: () => void;
  verrouillerSelection: () => void;
  /** Choisit toutes les formes de la couleur de la premiere forme choisie (son remplissage, ou son contour sans remplissage). */
  choisirMemeCouleur: () => void;
  zoomerSelection: () => void;
  enregistrerTout: () => void;
  insererForme: (svgForme: string) => void;
  insererPlusieurs: (svgs: readonly { svg: string; x: number; y: number; taille: number }[]) => void;
  booleen: (op: Booleen) => void;
  transformerNumerique: (t: { rotation?: number; inclinaisonX?: number; inclinaisonY?: number; echelle?: number }) => void;
  /** Le contour des formes choisies devient une forme pleine (couleur du trait en fond). */
  contourEnForme: () => void;
  /** Decale le contour des formes choisies : positif vers l'exterieur, negatif vers l'interieur. */
  decalerContour: (distance: number, jonction: Jonction) => void;
  /** Arrondit les angles des formes choisies au rayon donne, ramene la ou les segments sont trop courts. */
  arrondirAngles: (rayon: number) => void;
  /** Change le type du point actif (outil points) : angle, lisse ou symetrique. */
  convertirNoeud: (type: TypeNoeud) => void;
  /** Casse le tracé au point actif. */
  casserNoeud: () => void;
  /** Joint deux tracés ouverts par leurs bouts, ou ferme un tracé ouvert. */
  joindreSelection: () => void;
  /** Retire le point actif sans changer la courbe, ou dit pourquoi c'est impossible. */
  supprimerNoeudFidele: () => void;
  /** Inverse le sens du tracé des formes choisies. */
  inverserSens: () => void;
}

export interface Vues { vue: Vue; poserVue: (v: Vue | ((v: Vue) => Vue)) => void; ajuster: () => void; zoomer: (f: number, cx?: number, cy?: number) => void; centrer100: () => void }
