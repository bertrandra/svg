// Charger la bibliotheque de formes, a la demande : un script (dist/bibliotheque.js, construit par
// scripts/bibliotheque.mjs) pose a cote de la page, qui pese plusieurs mega-octets et ne se charge
// que quand on l'ouvre. Une balise <script> plutot qu'un fetch : cela marche aussi depuis le disque.

import type { EntreeBibliotheque, Evenement } from '../model/bibliotheque.js';

export interface Bibliotheque {
  source: string;
  licence: string;
  url: string;
  evenements: readonly Evenement[];
  entrees: readonly EntreeBibliotheque[];
}

export const FICHIER_BIBLIOTHEQUE = 'bibliotheque.js';

/** Vrai quand le script est deja arrive : un panneau qui se rouvre n'a pas a redemander le chargement. */
export const bibliothequeChargee = (): boolean => (window as unknown as { __bibliothequeSvg?: Bibliotheque }).__bibliothequeSvg !== undefined;

let promesse: Promise<Bibliotheque> | null = null;

export function chargerBibliotheque(): Promise<Bibliotheque> {
  promesse ??= new Promise<Bibliotheque>((ok, ko) => {
    const w = window as unknown as { __bibliothequeSvg?: Bibliotheque };
    if (w.__bibliothequeSvg) { ok(w.__bibliothequeSvg); return; }
    const s = document.createElement('script');
    s.src = FICHIER_BIBLIOTHEQUE;
    s.onload = () => { s.remove(); if (w.__bibliothequeSvg) ok(w.__bibliothequeSvg); else ko(new Error('Le fichier ' + FICHIER_BIBLIOTHEQUE + ' ne contient pas la bibliothèque.')); };
    s.onerror = () => { s.remove(); ko(new Error('Le fichier ' + FICHIER_BIBLIOTHEQUE + ' est introuvable à côté de la page : lancez « npm run bibliotheque ».')); };
    document.head.appendChild(s);
  }).catch((e: unknown) => {
    promesse = null;
    throw e instanceof Error ? e : new Error(String(e));
  });
  return promesse;
}
