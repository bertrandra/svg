// Charger la bibliotheque de formes, a la demande : un script (dist/bibliotheque.js, construit par
// scripts/bibliotheque.mjs) pose a cote de la page, qui pese plusieurs mega-octets et ne se charge
// que quand on l'ouvre. Une balise <script> plutot qu'un fetch : cela marche aussi depuis le disque.

import type { EntreeBibliotheque, Evenement } from '../model/bibliotheque.js';
import { annexePosee, fabriquerChargeurAnnexe, navigateur, type Annexe } from './annexes.js';

export interface Bibliotheque {
  source: string;
  licence: string;
  url: string;
  evenements: readonly Evenement[];
  entrees: readonly EntreeBibliotheque[];
}

export const FICHIER_BIBLIOTHEQUE = 'bibliotheque.js';

/** Une bibliotheque posee a la forme attendue : des entrees en liste, le reste suit du build. */
const annexe: Annexe<Bibliotheque> = {
  fichier: FICHIER_BIBLIOTHEQUE,
  globale: '__bibliothequeSvg',
  contenu: 'la bibliothèque',
  consigne: 'lancez « npm run bibliotheque »',
  valider: v => (typeof v === 'object' && v !== null && 'entrees' in v && Array.isArray(v.entrees) ? v as Bibliotheque : undefined)
};

/** Vrai quand le script est deja arrive : un panneau qui se rouvre n'a pas a redemander le chargement. */
export const bibliothequeChargee = (): boolean => annexePosee(annexe);

export const chargerBibliotheque: () => Promise<Bibliotheque> = fabriquerChargeurAnnexe(annexe, navigateur).charger;
