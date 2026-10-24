// La mesure des parties trop fines pour la lame (ADR-0013) : une ouverture morphologique, honnete et sans
// heuristique de forme. On retrecit la region peinte d'une forme de la moitie du seuil (decalage interieur) :
//
//   - une partie qui disparait entierement n'a nulle part la largeur du seuil : elle est trop fine en entier
//     (un filet, un point, un anneau etroit) ;
//   - on regrossit ce qui reste de la meme moitie (decalage exterieur, angles ronds) : c'est l'ouverture, la
//     region que balaie un disque du diametre du seuil. Ce qui manque a la region d'origine est trop etroit
//     pour ce disque : un bras, un isthme, une pointe. Les eclats d'un angle droit (un disque ne remplit pas
//     un coin) pesent moins de 0,06 seuil² ; on ne garde que les morceaux de plus de `AIRE_MIN` seuil², ce qui
//     laisse passer les angles jusqu'a environ 45 degres et attrape tout bras d'au moins un seuil de long.
//
// La mesure ne depend que de la forme, du seuil et de la tolerance : elle se memorise par forme (ADR-0008), et
// une forme deplacee (un nouvel objet) se remesure seule.

import clipping, { type MultiPolygon } from 'polygon-clipping';
import { cheminDeRegion, regionDeChemin, regionDeForme } from '../booleens.js';
import { decaler } from '../contour/decaler.js';
import { aireDeRegion } from '../contour/region.js';
import type { Chemin, Forme } from '../editionSvg.js';

/** Un morceau manquant a l'ouverture ne compte qu'au-dela de cette aire, en carres du seuil (voir l'en-tete). */
export const AIRE_MIN = 0.25;
/** Au-dela de ce nombre de points, une forme n'est pas mesuree : la mesure couterait trop pour un panneau qui juge en continu. */
export const POINTS_MAX_MESURE = 3000;

export interface Finesse {
  /** Les parties qui disparaissent entierement au retrecissement. */
  readonly entieres: number;
  /** Les morceaux trop etroits d'une partie qui, elle, tient (bras, isthmes, pointes). */
  readonly etroites: number;
  /** L'aire trop fine, en unites du plan au carre. */
  readonly aire: number;
  /** Les zones trop fines, en chemin, pour les montrer sur la toile. */
  readonly zones: Chemin;
}

const memo = new WeakMap<Forme, Map<string, Finesse | null>>();

/** La region de la forme apres un decalage de `distance`, ou vide si elle disparait. */
function decalee(d: Chemin, distance: number, regle: Forme['regle'], tolerance: number): MultiPolygon | null {
  const r = decaler(d, distance, 'round', { regle, fermerOuverts: true, tolerance });
  if ('erreur' in r) return r.vide ? [] : null;
  return regionDeChemin(r.chemin, 'nonzero', tolerance);
}

function mesurer(f: Forme, seuil: number, tolerance: number): Finesse | null {
  const region = regionDeForme(f, tolerance);
  if (!region.length) return null;
  const erodee = decalee(f.d, -seuil / 2, f.regle, tolerance);
  // Le moteur de decoupe a renonce (trace trop enchevetre) : on ne pretend rien.
  if (erodee === null) return null;
  const entieres: MultiPolygon = [], tiennent: MultiPolygon = [];
  for (const poly of region) (erodee.length && clipping.intersection([poly], erodee).length ? tiennent : entieres).push(poly);
  let etroites: MultiPolygon = [];
  if (tiennent.length && erodee.length) {
    const ouverte = decalee(cheminDeRegion(erodee, 6), seuil / 2, 'nonzero', tolerance);
    if (ouverte === null) return null;
    const manque = clipping.difference(tiennent, ouverte);
    etroites = manque.filter(p => aireDeRegion([p]) > AIRE_MIN * seuil * seuil);
  }
  if (!entieres.length && !etroites.length) return { entieres: 0, etroites: 0, aire: 0, zones: [] };
  const zones = [...entieres, ...etroites];
  return { entieres: entieres.length, etroites: etroites.length, aire: aireDeRegion(zones), zones: cheminDeRegion(zones) };
}

/**
 * Les parties de la forme plus etroites que `seuil` (unites du plan), ou null si la forme ne se mesure pas
 * (sans fond, trop chargee, trace refuse par le moteur de decoupe). Memorise par forme et par reglage.
 */
export function finesseDe(f: Forme, seuil: number, tolerance: number): Finesse | null {
  if (f.remplissage === null || !(seuil > 0) || f.d.length > POINTS_MAX_MESURE) return null;
  const cle = seuil + '/' + tolerance;
  let parReglage = memo.get(f);
  if (!parReglage) { parReglage = new Map(); memo.set(f, parReglage); }
  if (parReglage.has(cle)) return parReglage.get(cle) ?? null;
  const r = mesurer(f, seuil, tolerance);
  parReglage.set(cle, r);
  return r;
}
