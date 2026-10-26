// Le profil d'une production, resolu : les choix de la personne (machine, tapis, materiau, procede, unite)
// ramenes a des nombres dans les unites du plan, prets pour le jugement (constats.ts) et les corrections.
// Un choix incoherent (un tapis d'une autre machine, un materiau annonce mais pas decrit, Print Then Cut sur
// une Joy) est ramene au plus proche choix valide, jamais devine en silence : `normaliserChoix` le dit.

import {
  CHOIX_CRICUT_DEFAUT, COTE_MIN_FEUILLE, CRICUT, MM_PAR_POUCE, NOMS_UNITE, UNITES_PLAN_PAR_POUCE,
  type ChoixMachine, type Feuille, type ChoixProduction, type FamilleProduction, type Machine, type Materiau, type Procede, type SeuilsMateriau, type Tapis, type UniteLongueur
} from '../../model/contextes.js';
import type { MarqueProduction } from '../edition/production.js';
import { nombreFr } from '../description.js';
import { t } from '../../util/i18n.js';

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
  /**
   * Le recalage automatique (ADR-0039) : vrai, le tapis suit le coin haut gauche du dessin (le comportement d'avant l'ADR-0039) ;
   * faux, le defaut depuis sa revision du 26 octobre 2026, le plan est le tapis, fixe, et l'export garde la place des formes sur lui.
   */
  readonly recalage: boolean;
  /** La feuille sur le tapis, depuis son coin haut gauche, en unites du plan : le tapis entier quand on n'en a pas choisi. */
  readonly feuille: Feuille;
}

/** Des pouces en unites du plan. */
export const unitesDePouces = (pouces: number): number => pouces * UNITES_PLAN_PAR_POUCE;
/** Des unites du plan dans l'unite voulue (pouces ou millimetres). */
export const versUnite = (unites: number, unite: UniteLongueur): number => (unite === 'in' ? unites / UNITES_PLAN_PAR_POUCE : (unites / UNITES_PLAN_PAR_POUCE) * MM_PAR_POUCE);
/** Une longueur dans l'unite voulue, en unites du plan. */
export const depuisUnite = (valeur: number, unite: UniteLongueur): number => (unite === 'in' ? valeur * UNITES_PLAN_PAR_POUCE : (valeur / MM_PAR_POUCE) * UNITES_PLAN_PAR_POUCE);

/** Une longueur du plan dite en pouces ou en millimetres : « 2,5 po », « 63,5 mm ». */
// Le nom de l'unite se traduit a l'affichage (ADR-0042) : la donnee reste celle de model/contextes.ts.
export const texteMesure = (unites: number, unite: UniteLongueur): string => nombreFr(versUnite(unites, unite)) + ' ' + t(NOMS_UNITE[unite]);
/** Deux longueurs : « 11,5 × 11,5 po ». */
export const texteTaille = (l: number, h: number, unite: UniteLongueur): string => nombreFr(versUnite(l, unite)) + ' × ' + nombreFr(versUnite(h, unite)) + ' ' + t(NOMS_UNITE[unite]);

const centieme = (v: number): number => Math.round(v * 100) / 100 + 0;
const memesFeuilles = (a: Feuille, b: Feuille): boolean => a.x === b.x && a.y === b.y && a.l === b.l && a.h === b.h;

/**
 * Une feuille ramenee sur un tapis de `l` x `h` (ADR-0039) : au centieme d'unite, ses cotes entre le minimum et le tapis, posee dessus
 * sans deborder. Null quand elle couvre le tapis entier (le defaut, qui ne s'ecrit pas) ou quand elle ne se lit pas.
 */
export function feuilleSur(f: Feuille, l: number, h: number): Feuille | null {
  if (![f.x, f.y, f.l, f.h].every(Number.isFinite)) return null;
  const min = unitesDePouces(COTE_MIN_FEUILLE);
  const fl = centieme(Math.min(l, Math.max(min, f.l))), fh = centieme(Math.min(h, Math.max(min, f.h)));
  const fx = centieme(Math.min(l - fl, Math.max(0, f.x))), fy = centieme(Math.min(h - fh, Math.max(0, f.y)));
  return fx === 0 && fy === 0 && fl === centieme(l) && fh === centieme(h) ? null : { x: fx, y: fy, l: fl, h: fh };
}

/** La feuille ecrite dans une marque : « x-y-l-h » en centiemes d'unite du plan, des entiers seulement (un identifiant valide). */
export const texteFeuille = (f: Feuille): string => [f.x, f.y, f.l, f.h].map(v => String(Math.round(v * 100))).join('-');

/** La feuille d'une marque, ou null si elle ne se lit pas : quatre entiers, des cotes non nuls. */
export function lireFeuille(t: string | undefined): Feuille | null {
  const m = /^(\d{1,7})-(\d{1,7})-(\d{1,7})-(\d{1,7})$/.exec(t ?? '');
  if (!m) return null;
  const [x, y, l, h] = m.slice(1).map(v => Number(v) / 100);
  return x !== undefined && y !== undefined && l !== undefined && h !== undefined && l > 0 && h > 0 ? { x, y, l, h } : null;
}

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
  // Seul `true` dit quelque chose (ADR-0039, revision du 26 octobre 2026) : toute autre valeur, l'ancien `false` compris, est le
  // tapis fixe du defaut, et ne se garde pas.
  const recale = choix.recalage === true;
  // La feuille tient sur le tapis choisi, au centieme ; le tapis entier ne s'ecrit pas.
  const support = CRICUT.tapis.find(t => t.id === tapis);
  const feuille = support && choix.feuille ? feuilleSur(choix.feuille, unitesDePouces(support.largeur.valeur), unitesDePouces(support.hauteur.valeur)) : null;
  const memeFeuille = feuille === null ? !('feuille' in choix) : choix.feuille !== undefined && memesFeuilles(feuille, choix.feuille);
  if (machine.id === choix.machine && tapis === choix.tapis && materiau === choix.materiau && procede === choix.procede && unite === choix.unite && ('recalage' in choix) === recale && memeFeuille) return choix;
  return { contexte: 'cricut', machine: machine.id, tapis, materiau, procede, unite, ...(recale ? { recalage: true as const } : {}), ...(feuille ? { feuille } : {}) };
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
    largeurStylo: unitesDePouces(CRICUT.stylo?.largeur.valeur ?? 0.4 / 25.4),
    recalage: choix.recalage === true,
    feuille: choix.feuille ?? { x: 0, y: 0, l: unitesDePouces(tapis.largeur.valeur), h: unitesDePouces(tapis.hauteur.valeur) }
  };
}

/** La marque a ecrire dans le SVG pour ce choix ; null en « Generique » : aucun octet de plus. */
export function marqueDeChoix(brut: ChoixProduction): MarqueProduction | null {
  const choix = normaliserChoix(brut);
  if (choix.contexte !== 'cricut') return null;
  // Le recalage actif (ADR-0039, revision du 26 octobre 2026) s'ecrit dans le document, seulement hors du defaut (le tapis fixe).
  return { contexte: 'cricut', machine: choix.machine, tapis: choix.tapis, materiau: choix.materiau, procede: choix.procede, unite: choix.unite, ...(choix.recalage === true ? { recalage: 'oui' } : {}), ...(choix.feuille ? { feuille: texteFeuille(choix.feuille) } : {}) };
}

/** La marque d'un profil resolu (celle que porte un fichier exporte pour la machine) : jamais le recalage, propre au document. */
export const marqueDeProfil = (p: ProfilProduction): MarqueProduction => ({
  contexte: p.famille.id, machine: p.machine.id, tapis: p.tapis.id, materiau: p.materiau.id, procede: p.procede, unite: p.unite
});

/** Ce qu'une marque lue redonne : le choix, et le contexte inconnu quand le fichier en nomme un que ce programme ne connait pas. */
export function choixDeMarque(marque: MarqueProduction | null | undefined): { choix: ChoixProduction; inconnu?: string } {
  if (!marque || marque.contexte === 'generique') return { choix: { contexte: 'generique' } };
  if (marque.contexte !== 'cricut') return { choix: { contexte: 'generique' }, inconnu: marque.contexte };
  const brut: ChoixMachine = {
    machine: marque.machine ?? CHOIX_CRICUT_DEFAUT.machine, tapis: marque.tapis ?? CHOIX_CRICUT_DEFAUT.tapis, materiau: marque.materiau ?? CHOIX_CRICUT_DEFAUT.materiau,
    procede: marque.procede === 'imprimer-decouper' || marque.procede === 'dessin-stylo' ? marque.procede : 'decoupe', unite: marque.unite === 'mm' ? 'mm' : 'in',
    // Seule la valeur exacte « oui » active le recalage (ADR-0039, revision du 26 octobre 2026) ; toute autre, l'ancienne « non »
    // comprise, se lit comme absente : le tapis fixe du defaut, qui ne se reecrit pas.
    ...(marque.recalage === 'oui' ? { recalage: true as const } : {})
  };
  const feuille = lireFeuille(marque.feuille);
  if (feuille) return { choix: normaliserChoix({ contexte: 'cricut', ...brut, feuille }) };
  return { choix: normaliserChoix({ contexte: 'cricut', ...brut }) };
}

/**
 * Le contexte avec lequel un editeur s'ouvre : celui que le SVG porte (sa marque, meme Generique ou inconnue : le fichier a parle),
 * sinon le depart que la page ou l'hote propose (le public « machine » de l'accueil, ADR-0024), ramene a un choix valide, sinon
 * Generique. Un depart n'ecrit rien : tant que la personne ne modifie pas le dessin, rien n'est reecrit.
 */
export function choixDeDepart(marque: MarqueProduction | null | undefined, depart: ChoixProduction | null | undefined): ChoixProduction {
  if (marque || !depart) return choixDeMarque(marque).choix;
  return normaliserChoix(depart);
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

/** Le tapis du profil en unites du plan : sa largeur et sa hauteur. */
const tailleTapis = (p: ProfilProduction): { readonly l: number; readonly h: number } => ({ l: unitesDePouces(p.tapis.largeur.valeur), h: unitesDePouces(p.tapis.hauteur.valeur) });

/**
 * Le tapis fixe d'un profil sans recalage automatique (ADR-0039) : son coin haut gauche est celui du plan de travail, sa taille celle
 * du tapis, quelle que soit la taille du plan (un plan d'une autre taille, un fichier retouche a la main, ne deplace rien).
 */
export function cadreFixe(p: ProfilProduction, vb: readonly [number, number, number, number]): CadreTapis {
  const t = tailleTapis(p);
  return { x: vb[0], y: vb[1], l: t.l, h: t.h };
}

/** La zone utile d'un tapis pose : centree sur lui, comme `cadreTapis` centre le tapis autour d'elle. */
export function zoneDuCadre(p: ProfilProduction, tapis: CadreTapis): CadreTapis {
  const z = p.zoneUtile;
  return { x: tapis.x + (tapis.l - z.l) / 2, y: tapis.y + (tapis.h - z.h) / 2, l: z.l, h: z.h };
}

/** Le dessin tel que le gabarit le lit : son plan et ses formes. Une boite suffit pour l'etendue. */
interface DessinPose { readonly vb: readonly [number, number, number, number] }

/**
 * Le tapis et sa zone utile tels que la toile les dessine et que « Ajuster » les cadre. Avec le recalage automatique, la zone utile
 * calee sur `etendue` (le coin du dessin visible, ou celui du plan s'il est vide) : le calcul d'avant, au nombre pres. Sans, le tapis
 * fixe au coin du plan.
 */
export function gabaritDuTapis(p: ProfilProduction, dessin: DessinPose, etendue: { readonly x: number; readonly y: number } | null): { readonly tapis: CadreTapis; readonly zone: CadreTapis } {
  if (!p.recalage) { const tapis = cadreFixe(p, dessin.vb); return { tapis, zone: zoneDuCadre(p, tapis) }; }
  const origine = etendue ?? { x: dessin.vb[0], y: dessin.vb[1] };
  return { tapis: cadreTapis(p, origine), zone: { x: origine.x, y: origine.y, l: p.zoneUtile.l, h: p.zoneUtile.h } };
}

/** Une longueur au millieme : un plan pose sur le tapis s'ecrit sans traine de virgule flottante. */
const millieme = (v: number): number => Math.round(v * 1000) / 1000 + 0;

/**
 * Le plan de travail pose sur un tapis (ADR-0039) : le viewBox devient le cadre, au millieme. Le meme objet quand il l'est deja :
 * rien a defaire. Pur ; les formes ne bougent pas.
 */
export function planDuTapis<D extends DessinPose>(dessin: D, cadre: CadreTapis): D {
  const vb: [number, number, number, number] = [millieme(cadre.x), millieme(cadre.y), millieme(cadre.l), millieme(cadre.h)];
  return vb.every((v, i) => v === dessin.vb[i]) ? dessin : { ...dessin, vb };
}

/** La feuille posee sur un tapis, en coordonnees du plan. */
export const feuilleSurTapis = (p: ProfilProduction, tapis: CadreTapis): CadreTapis => ({ x: tapis.x + p.feuille.x, y: tapis.y + p.feuille.y, l: p.feuille.l, h: p.feuille.h });

/** L'intersection de deux boites, ou null si elles ne se touchent pas. */
export function interBoites(a: CadreTapis, b: CadreTapis): CadreTapis | null {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y), x1 = Math.min(a.x + a.l, b.x + b.l), y1 = Math.min(a.y + a.h, b.y + b.h);
  return x1 > x && y1 > y ? { x, y, l: x1 - x, h: y1 - y } : null;
}

/**
 * La ou la machine coupe sur la feuille : la feuille posee sur le tapis du gabarit, rognee a la zone utile (la lame n'atteint pas le
 * reste). Null si la feuille sort de la zone utile.
 */
export function regionDeCoupe(p: ProfilProduction, gabarit: { readonly tapis: CadreTapis; readonly zone: CadreTapis }): CadreTapis | null {
  return interBoites(feuilleSurTapis(p, gabarit.tapis), gabarit.zone);
}

/** Vrai quand le profil a une feuille partielle (pas le tapis entier). */
export const feuillePartielle = (p: ProfilProduction): boolean => p.feuille.x !== 0 || p.feuille.y !== 0 || p.feuille.l !== unitesDePouces(p.tapis.largeur.valeur) || p.feuille.h !== unitesDePouces(p.tapis.hauteur.valeur);

/** La place d'une boite sur un tapis : sa distance aux bords gauche et haut du tapis, en unites du plan. */
export const placeSurTapis = (boite: { readonly x: number; readonly y: number }, tapis: CadreTapis): { readonly x: number; readonly y: number } => ({ x: boite.x - tapis.x, y: boite.y - tapis.y });

/** La plus petite boite qui contient les deux : le tapis et un dessin qui en deborde se voient ensemble. */
export function unionCadres(a: CadreTapis, b: CadreTapis | null): CadreTapis {
  if (!b) return a;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, l: Math.max(a.x + a.l, b.x + b.l) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
