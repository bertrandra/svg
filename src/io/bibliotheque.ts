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

const estTexte = (v: unknown): v is string => typeof v === 'string';
const estListeDeTextes = (v: unknown): v is string[] => Array.isArray(v) && v.every(estTexte);
const FAMILLES: ReadonlySet<string> = new Set(['calendrier', 'vie', 'categorie']);

/**
 * Une bibliotheque donnee par un hote (ou posee par un script) remise a la forme attendue : les entrees et les evenements qui n'ont
 * pas les bons champs sont ecartes, rien d'autre n'est garde. Null quand ce n'est pas une bibliotheque (`entrees` n'est pas une liste).
 */
export function normaliserBibliotheque(v: unknown): Bibliotheque | null {
  if (typeof v !== 'object' || v === null) return null;
  const b = v as Record<string, unknown>;
  if (!Array.isArray(b.entrees)) return null;
  const entrees: EntreeBibliotheque[] = [];
  for (const e of b.entrees as unknown[]) {
    if (typeof e !== 'object' || e === null) continue;
    const { id, nom, svg, evenements } = e as Record<string, unknown>;
    if (estTexte(id) && estTexte(nom) && estTexte(svg) && estListeDeTextes(evenements)) entrees.push({ id, nom, svg, evenements: [...evenements] });
  }
  const evenements: Evenement[] = [];
  if (Array.isArray(b.evenements)) {
    for (const ev of b.evenements as unknown[]) {
      if (typeof ev !== 'object' || ev === null) continue;
      const { id, nom, famille, mots, mois } = ev as Record<string, unknown>;
      if (estTexte(id) && estTexte(nom) && estTexte(famille) && FAMILLES.has(famille) && estListeDeTextes(mots)) {
        evenements.push({ id, nom, famille: famille as Evenement['famille'], mots: [...mots], ...(typeof mois === 'number' && Number.isInteger(mois) && mois >= 1 && mois <= 12 ? { mois } : {}) });
      }
    }
  }
  return { source: estTexte(b.source) ? b.source : '', licence: estTexte(b.licence) ? b.licence : '', url: estTexte(b.url) ? b.url : '', evenements, entrees };
}

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
