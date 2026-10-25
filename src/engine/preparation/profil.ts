// Le profil d'une production, resolu : les choix de la personne (machine, tapis, materiau, procede, unite)
// ramenes a des nombres dans les unites du plan, prets pour le jugement (constats.ts) et les corrections.
// Un choix incoherent (un tapis d'une autre machine, un materiau annonce mais pas decrit, Print Then Cut sur
// une Joy) est ramene au plus proche choix valide, jamais devine en silence : `normaliserChoix` le dit.

import {
  CHOIX_CRICUT_DEFAUT, CRICUT, MM_PAR_POUCE, NOMS_UNITE, UNITES_PLAN_PAR_POUCE,
  type ChoixMachine, type ChoixProduction, type FamilleProduction, type Machine, type Materiau, type Procede, type SeuilsMateriau, type Tapis, type UniteLongueur
} from '../../model/contextes.js';
import type { MarqueProduction } from '../edition/production.js';
import { nombreFr } from '../description.js';

/** Le profil d'un contexte de production, en unites du plan (1/96 po) sauf mention. */
export interface ProfilProduction {
  readonly famille: FamilleProduction;
  readonly machine: Machine;
  readonly tapis: Tapis;
  readonly materiau: Materiau;
  readonly seuils: SeuilsMateriau;
  readonly procede: Procede;
  readonly unite: UniteLongueur;
  /** La zone utile du tapis, en unites du plan. */
  readonly zoneUtile: { readonly l: number; readonly h: number };
  /** La plus petite largeur d'une partie, en unites du plan. */
  readonly detailMin: number;
  readonly rayonLame: number;
  readonly toleranceNettoyage: number;
  /** Distance OKLab, sans unite. */
  readonly fusionNuances: number;
  readonly noeudsParForme: number;
  /** Les bornes de Print Then Cut en unites du plan ; null si la machine ne le fait pas. */
  readonly printThenCut: { readonly l: number; readonly h: number; readonly fondPerdu: number; readonly resolution: number } | null;
  /** La largeur du trait du stylo, en unites du plan (ADR-0022) : l'ecart des hachures, l'epaisseur d'un pourtour. */
  readonly largeurStylo: number;
}

/** Des pouces en unites du plan. */
export const unitesDePouces = (pouces: number): number => pouces * UNITES_PLAN_PAR_POUCE;
/** Des unites du plan dans l'unite voulue (pouces ou millimetres). */
export const versUnite = (unites: number, unite: UniteLongueur): number => (unite === 'in' ? unites / UNITES_PLAN_PAR_POUCE : (unites / UNITES_PLAN_PAR_POUCE) * MM_PAR_POUCE);
/** Une longueur dans l'unite voulue, en unites du plan. */
export const depuisUnite = (valeur: number, unite: UniteLongueur): number => (unite === 'in' ? valeur * UNITES_PLAN_PAR_POUCE : (valeur / MM_PAR_POUCE) * UNITES_PLAN_PAR_POUCE);

/** Une longueur du plan dite en pouces ou en millimetres : « 2,5 po », « 63,5 mm ». */
export const texteMesure = (unites: number, unite: UniteLongueur): string => nombreFr(versUnite(unites, unite)) + ' ' + NOMS_UNITE[unite];
/** Deux longueurs : « 11,5 × 11,5 po ». */
export const texteTaille = (l: number, h: number, unite: UniteLongueur): string => nombreFr(versUnite(l, unite)) + ' × ' + nombreFr(versUnite(h, unite)) + ' ' + NOMS_UNITE[unite];

const premierDisponible = (f: FamilleProduction): Materiau | undefined => f.materiaux.find(m => m.disponible && m.seuils);

/**
 * Le choix ramene a un choix valide : machine connue (sinon celle par defaut), tapis de cette machine (sinon son
 * premier), materiau disponible, procede que la machine sait faire. Rend le meme objet quand rien ne change.
 */
export function normaliserChoix(choix: ChoixProduction): ChoixProduction {
  if (choix.contexte !== 'cricut') return choix;
  const machine = CRICUT.machines.find(m => m.id === choix.machine) ?? CRICUT.machines.find(m => m.id === CHOIX_CRICUT_DEFAUT.machine);
  if (!machine) return choix;
  const tapis = machine.tapis.includes(choix.tapis) ? choix.tapis : machine.tapis[0] ?? choix.tapis;
  const materiauChoisi = CRICUT.materiaux.find(m => m.id === choix.materiau);
  const materiau = materiauChoisi?.disponible ? materiauChoisi.id : premierDisponible(CRICUT)?.id ?? choix.materiau;
  const procede = machine.procedes.includes(choix.procede) ? choix.procede : 'decoupe';
  const unite: UniteLongueur = choix.unite === 'mm' ? 'mm' : 'in';
  if (machine.id === choix.machine && tapis === choix.tapis && materiau === choix.materiau && procede === choix.procede && unite === choix.unite) return choix;
  return { contexte: 'cricut', machine: machine.id, tapis, materiau, procede, unite };
}

/** Le profil resolu d'un choix, ou null pour « Generique » (qui ne juge rien). */
export function resoudreProfil(brut: ChoixProduction): ProfilProduction | null {
  const choix = normaliserChoix(brut);
  if (choix.contexte !== 'cricut') return null;
  const machine = CRICUT.machines.find(m => m.id === choix.machine);
  const tapis = CRICUT.tapis.find(t => t.id === choix.tapis);
  const materiau = CRICUT.materiaux.find(m => m.id === choix.materiau);
  const seuils = materiau?.seuils;
  if (!machine || !tapis || !materiau || !seuils) return null;
  const ptc = CRICUT.printThenCut && machine.procedes.includes('imprimer-decouper') ? CRICUT.printThenCut : null;
  return {
    famille: CRICUT, machine, tapis, materiau, seuils, procede: choix.procede, unite: choix.unite,
    zoneUtile: { l: unitesDePouces(tapis.zoneUtile.largeur.valeur), h: unitesDePouces(tapis.zoneUtile.hauteur.valeur) },
    detailMin: unitesDePouces(seuils.detailMin.valeur),
    rayonLame: unitesDePouces(seuils.rayonLame.valeur),
    toleranceNettoyage: unitesDePouces(seuils.toleranceNettoyage.valeur),
    fusionNuances: seuils.fusionNuances.valeur,
    noeudsParForme: seuils.noeudsParForme.valeur,
    printThenCut: ptc ? { l: unitesDePouces(ptc.largeurMax.valeur), h: unitesDePouces(ptc.hauteurMax.valeur), fondPerdu: unitesDePouces(ptc.fondPerdu.valeur), resolution: ptc.resolution.valeur } : null,
    largeurStylo: unitesDePouces(CRICUT.stylo?.largeur.valeur ?? 0.4 / 25.4)
  };
}

/** La marque a ecrire dans le SVG pour ce choix ; null en « Generique » : aucun octet de plus. */
export function marqueDeChoix(brut: ChoixProduction): MarqueProduction | null {
  const choix = normaliserChoix(brut);
  if (choix.contexte !== 'cricut') return null;
  return { contexte: 'cricut', machine: choix.machine, tapis: choix.tapis, materiau: choix.materiau, procede: choix.procede, unite: choix.unite };
}

/** La marque d'un profil resolu (celle que porte un fichier exporte pour la machine). */
export const marqueDeProfil = (p: ProfilProduction): MarqueProduction => ({
  contexte: p.famille.id, machine: p.machine.id, tapis: p.tapis.id, materiau: p.materiau.id, procede: p.procede, unite: p.unite
});

/** Ce qu'une marque lue redonne : le choix, et le contexte inconnu quand le fichier en nomme un que ce programme ne connait pas. */
export function choixDeMarque(marque: MarqueProduction | null | undefined): { choix: ChoixProduction; inconnu?: string } {
  if (!marque || marque.contexte === 'generique') return { choix: { contexte: 'generique' } };
  if (marque.contexte !== 'cricut') return { choix: { contexte: 'generique' }, inconnu: marque.contexte };
  const brut: ChoixMachine = {
    machine: marque.machine ?? CHOIX_CRICUT_DEFAUT.machine, tapis: marque.tapis ?? CHOIX_CRICUT_DEFAUT.tapis, materiau: marque.materiau ?? CHOIX_CRICUT_DEFAUT.materiau,
    procede: marque.procede === 'imprimer-decouper' || marque.procede === 'dessin-stylo' ? marque.procede : 'decoupe', unite: marque.unite === 'mm' ? 'mm' : 'in'
  };
  return { choix: normaliserChoix({ contexte: 'cricut', ...brut }) };
}

/** Une boite du plan : coin haut gauche, largeur et hauteur, en unites du plan. */
export interface CadreTapis { readonly x: number; readonly y: number; readonly l: number; readonly h: number }

/**
 * Le tapis du profil tel que la toile le dessine : sa zone utile calee sur le coin haut gauche de `origine` (la ou Design Space pose
 * les pieces), le tapis centre autour d'elle. `origine` est le coin de l'etendue visible du dessin, ou celui du plan s'il est vide.
 * Une seule fonction pour le gabarit et pour « Ajuster » : la vue cadre exactement ce qu'on voit.
 */
export function cadreTapis(profil: ProfilProduction, origine: { readonly x: number; readonly y: number }): CadreTapis {
  const l = unitesDePouces(profil.tapis.largeur.valeur), h = unitesDePouces(profil.tapis.hauteur.valeur), z = profil.zoneUtile;
  return { x: origine.x - (l - z.l) / 2, y: origine.y - (h - z.h) / 2, l, h };
}

/** La plus petite boite qui contient les deux : le tapis et un dessin qui en deborde se voient ensemble. */
export function unionCadres(a: CadreTapis, b: CadreTapis | null): CadreTapis {
  if (!b) return a;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, l: Math.max(a.x + a.l, b.x + b.l) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
