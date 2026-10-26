// Conserver les proportions d'une selection qu'on redimensionne : au coin, aux champs L et H, au clavier. Du calcul pur sur des
// boites ; le verrou lui-meme est un reglage de la session (zones), il ne s'ecrit nulle part.
//
// La proportion de reference est une largeur et une hauteur, pas un rapport : au coin, verrou coupe, Maj garde le calcul d'avant
// a l'identique (`max(l / ref.l, h / ref.h)` sur la boite du debut du geste). Verrou pose, la reference est celle de la boite au
// moment ou le verrou a ete pose, ou ou la selection a change ; elle reste tant que la boite courante garde la meme proportion,
// aux erreurs de calcul pres : une suite de frappes ou de pas de clavier ne derive pas, chaque taille etant tiree de la meme
// reference et non de la boite que la precedente a laissee. Une rotation, un redimensionnement libre (Maj) ou des points
// modifies changent vraiment la proportion : la boite courante devient alors la reference.

import type { Boite } from './edition/types.js';
import type { Direction } from './navigation.js';

/** La proportion a garder : les cotes d'une boite, et la selection qui l'a donnee. */
export interface ReferenceProportions { readonly cle: string; readonly l: number; readonly h: number }

/** Les cotes d'une proportion, sans la selection : ce qu'un calcul de taille lit. */
export interface Cotes { readonly l: number; readonly h: number }

/**
 * L'ecart relatif de proportion que la reference absorbe : les erreurs d'arrondi des flottants (1e-15 a 1e-12) passent, toute
 * vraie modification (une rotation, un etirement libre, meme d'un millieme) refait la reference.
 */
export const TOLERANCE_PROPORTIONS = 1e-9;

/** Une boite a une proportion quand ses deux cotes sont finis et strictement positifs : une ligne droite (un cote nul) n'en a pas. */
export const aDesProportions = (c: Cotes | null | undefined): c is Cotes => !!c && Number.isFinite(c.l) && Number.isFinite(c.h) && c.l > 0 && c.h > 0;

/** La cle d'une selection : la reference ne vaut que pour la selection qui l'a donnee, dans le meme ordre. */
export const cleSelection = (ids: readonly string[]): string => ids.join('\u0000');

/**
 * La reference du moment : la meme si la selection n'a pas change et que la boite garde sa proportion, sinon celle de la boite
 * courante ; null quand la boite n'a pas de proportion (une ligne, rien de choisi) : le verrou ne s'applique pas.
 */
export function referenceProportions(ref: ReferenceProportions | null, cle: string, b: Boite | null): ReferenceProportions | null {
  if (!aDesProportions(b)) return null;
  if (ref && ref.cle === cle && Math.abs(ref.l * b.h - ref.h * b.l) <= TOLERANCE_PROPORTIONS * ref.l * b.h) return ref;
  return { cle, l: b.l, h: b.h };
}

/**
 * La proportion qu'un coin garde, selon le verrou et Maj. Verrou coupe : Maj garde celle de la boite du debut du geste, comme il
 * l'a toujours fait. Verrou pose : la reference du verrou est gardee, et Maj libere le temps du geste, comme dans les editeurs
 * usuels. Null : le coin etire librement.
 */
export function proportionsAuCoin(verrouille: boolean, ref: Cotes | null, debut: Cotes, maj: boolean): Cotes | null {
  if (verrouille) return maj ? null : ref;
  return maj ? debut : null;
}

/**
 * Au coin : la taille que le pointeur demande, ramenee a la proportion. Le plus grand des deux rapports l'emporte, comme Maj
 * l'a toujours fait ; sans proportion (une ligne, ou rien a garder), la taille demandee telle quelle.
 */
export function cotesProportionnels(l: number, h: number, ref: Cotes | null): Cotes {
  if (!aDesProportions(ref)) return { l, h };
  const k = Math.max(l / ref.l, h / ref.h);
  return { l: ref.l * k, h: ref.h * k };
}

/**
 * Aux champs : la boite apres une largeur (`cote` 'l') ou une hauteur ('h') tapee ; l'autre cote suit la reference. Le coin haut
 * gauche reste. Sans reference (verrou coupe, ou une ligne), seul le cote tape change, comme avant.
 */
export function boiteAvecCote(b: Boite, cote: 'l' | 'h', v: number, ref: Cotes | null): Boite {
  if (!aDesProportions(ref)) return cote === 'l' ? { ...b, l: v } : { ...b, h: v };
  return cote === 'l' ? { ...b, l: v, h: (v * ref.h) / ref.l } : { ...b, l: (v * ref.l) / ref.h, h: v };
}

/**
 * Au clavier, verrou pose : droite et bas agrandissent, gauche et haut reduisent ; le cote de la fleche avance d'un pas, l'autre
 * suit la reference ; le coin haut gauche reste. Aucun cote ne descend sous `min` : le cote de la fleche s'arrete la ou l'autre
 * l'atteindrait. Rend la meme boite quand rien ne peut changer, comme `boiteRedimensionnee`.
 */
export function boiteRedimensionneeProportionnelle(b: Boite, direction: Direction, pas: number, min: number, ref: Cotes): Boite {
  const horizontal = direction === 'gauche' || direction === 'droite';
  const signe = direction === 'droite' || direction === 'bas' ? 1 : -1;
  // Le cote mene et l'autre, dans le rapport de la reference : autre = mene * rapport.
  const rapport = horizontal ? ref.h / ref.l : ref.l / ref.h;
  const actuel = horizontal ? b.l : b.h;
  const plancher = Math.max(min, min / rapport);
  const suivant = Math.max(plancher, actuel + signe * pas);
  if (suivant === actuel || (signe < 0 && suivant > actuel)) return b;
  const autre = suivant * rapport;
  return horizontal ? { ...b, l: suivant, h: autre } : { ...b, l: autre, h: suivant };
}
