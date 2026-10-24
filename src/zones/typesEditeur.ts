// Les types que l'editeur et ses panneaux se partagent. Un module de types seuls : tout le monde
// l'importe (ou le relit par EditeurSvg.tsx) sans jamais creer de cycle a l'execution.

import type { Boite, DessinSvg, Forme, Style } from '../engine/editionSvg.js';
import type { Booleen } from '../engine/booleens.js';
import type { Aimant } from '../engine/transformations.js';
import type { Bibliotheque } from '../io/bibliotheque.js';
import type { Historique } from '../util/historique.js';
import type { Version } from './session.js';

/** Une couleur du nuancier propose dans l'inspecteur : un nom et un code #rrggbb en minuscules. */
export interface Teinte { nom: string; hex: string }

export type OutilForme = 'rectangle' | 'ellipse' | 'etoile' | 'ligne';
export type Outil = 'selection' | 'points' | 'main' | 'plume' | 'texte' | OutilForme;
export type Coin = 'nw' | 'ne' | 'sw' | 'se';
export type Point = readonly [number, number];
export interface Vue { zoom: number; x: number; y: number }

/** Ce que les panneaux partagent : le dessin, la selection, et les gestes d'edition. */
export interface Edition {
  h: Historique<DessinSvg>;
  dessin: DessinSvg;
  sel: string[];
  /** Les memes identifiants en ensemble : savoir si une forme est choisie sans parcourir toute la selection. */
  choisies: ReadonlySet<string>;
  boite: Boite | null;
  formeSeule: Forme | null;
  outil: Outil;
  point: number | null;
  nuancier: readonly Teinte[];
  bibliotheque: Bibliotheque | 'a-charger' | null;
  style: Style;
  trace: readonly Point[];
  presse: readonly Forme[];
  grille: boolean;
  aimants: boolean;
  guides: readonly Aimant[];
  versions: readonly Version[];
  tiroir: 'calques' | 'inspecteur' | null;
  pas: number;
  /** La valeur aimantee a la grille quand elle est active, telle quelle sinon. */
  aimant: (v: number) => number;
  poserGrille: (g: boolean) => void;
  poserAimants: (a: boolean) => void;
  poserGuides: (g: readonly Aimant[]) => void;
  poserTiroir: (t: 'calques' | 'inspecteur' | null) => void;
  garderVersion: (nom: string, svg: string) => void;
  supprimerVersion: (id: string) => void;
  choisir: (ids: string[]) => void;
  poserPoint: (i: number | null) => void;
  poserOutil: (o: Outil) => void;
  poserStyle: (s: Style) => void;
  poserTrace: (t: readonly Point[]) => void;
  finirTrace: (fermer: boolean) => void;
  appliquer: (f: (d: DessinSvg) => DessinSvg, cle?: string | null) => void;
  faire: (f: (d: DessinSvg) => DessinSvg, texte?: string) => void;
  finir: () => void;
  annulerGeste: (cle: string) => void;
  dire: (t: string) => void;
  nouvelleCle: () => string;
  supprimerSelection: () => void;
  dupliquerSelection: () => void;
  copierSelection: () => void;
  couperSelection: () => void;
  collerPresse: () => void;
  combinerSelection: () => void;
  separerSelection: () => void;
  masquerSelection: () => void;
  verrouillerSelection: () => void;
  zoomerSelection: () => void;
  enregistrerTout: () => void;
  insererForme: (svgForme: string) => void;
  insererPlusieurs: (svgs: readonly { svg: string; x: number; y: number; taille: number }[]) => void;
  booleen: (op: Booleen) => void;
  transformerNumerique: (t: { rotation?: number; inclinaisonX?: number; inclinaisonY?: number; echelle?: number }) => void;
}

export interface Vues { vue: Vue; poserVue: (v: Vue | ((v: Vue) => Vue)) => void; ajuster: () => void; zoomer: (f: number, cx?: number, cy?: number) => void; centrer100: () => void }
