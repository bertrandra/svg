// Repeter une selection (ADR-0038) : la dupliquer en grille, la repeter autour d'un centre, la retourner en miroir autour
// d'un axe en gardant ou non l'original. Pur et deterministe : les memes reglages sur le meme dessin donnent les memes formes,
// aux memes identifiants, dans le meme ordre.
//
// Les copies sont des formes ordinaires, pas un groupe ni un clone lie : le modele a plat (ADR-0001) n'a pas encore de groupe
// (il arrive avec le modele v2, ADR-0012). Chaque jeu de copies reprend la selection entiere, dans son ordre d'empilement, et
// se pose juste au-dessus de la plus haute forme choisie : une copie de « visage et yeux » garde ses yeux au-dessus du visage.
// Un texte pose sur une forme copiee avec lui se pose sur la copie de la forme (ADR-0031) ; copie seul, il redevient libre.

import type { DessinSvg, Forme, Matrice } from './types.js';
import { boiteDe, echelle, rotation, translation } from './geometrie.js';
import { prochainId, transformer } from './operations.js';
import { relierCopie } from './texteVivant.js';
import { nombre } from '../../util/i18n.js';

/** Ce qu'une repetition rend : le dessin, les formes a choisir ensuite (la selection et ses copies), le nombre de copies. */
export interface ResultatRepetition {
  readonly dessin: DessinSvg;
  /** Les formes d'origine puis les copies, dans l'ordre de leur creation. */
  readonly ids: readonly string[];
  /** Le nombre de formes creees. */
  readonly copies: number;
  /** Le refus dit, quand rien n'a ete fait (aucune forme a repeter, trop de copies). */
  readonly erreur?: string;
}

/** Les bornes d'une repetition : au-dela, un geste maladroit (1 000 x 1 000) ne doit pas figer l'onglet. */
export const REPETITION_MAX = {
  /** Lignes ou colonnes d'une grille. */
  cote: 100,
  /** Exemplaires d'une repetition radiale, l'original compris. */
  radiale: 360,
  /** Formes creees en un geste. */
  formes: 10_000
} as const;

const refus = (dessin: DessinSvg, ids: readonly string[], erreur: string): ResultatRepetition => ({ dessin, ids, copies: 0, erreur });

/** Les formes a repeter : celles de la selection qui existent, visibles et deverrouillees, dans l'ordre d'empilement. */
const aRepeter = (dessin: DessinSvg, ids: readonly string[]): Forme[] => {
  const voulus = new Set(ids);
  return dessin.formes.filter(f => voulus.has(f.id) && f.visible && !f.verrouille);
};

/**
 * Pose un jeu de copies de la selection par matrice, au-dessus de la plus haute forme choisie. Les identifiants suivent : jeu par
 * jeu, forme par forme, a partir du prochain identifiant libre.
 */
export function copierPar(dessin: DessinSvg, ids: readonly string[], matrices: readonly Matrice[]): ResultatRepetition {
  const choisies = aRepeter(dessin, ids);
  if (!choisies.length) return refus(dessin, ids, 'Choisissez d’abord une forme visible et déverrouillée à répéter.');
  if (!matrices.length) return { dessin, ids: choisies.map(f => f.id), copies: 0 };
  if (choisies.length * matrices.length > REPETITION_MAX.formes) {
    return refus(dessin, ids, 'Trop de copies : ' + nombre(choisies.length * matrices.length) + ' formes, au-delà des ' + nombre(REPETITION_MAX.formes) + ' qu’un geste peut créer.');
  }
  let n = prochainId(dessin);
  const poses: Forme[] = [], nouveaux: string[] = [];
  for (const m of matrices) {
    const correspondance = new Map<string, string>();
    const jeu = choisies.map(f => { const id = 'f' + n++; correspondance.set(f.id, id); return { ...f, id }; });
    const relies = jeu.map(f => relierCopie(f, correspondance));
    // La transformation se fait sur le jeu seul : un texte pose y trouve sa forme copiee, qui prend la meme transformation.
    const transforme = transformer({ vb: dessin.vb, formes: relies }, relies.map(f => f.id), m);
    poses.push(...transforme.formes);
    nouveaux.push(...relies.map(f => f.id));
  }
  const derniere = choisies[choisies.length - 1];
  const rang = derniere ? dessin.formes.indexOf(derniere) : dessin.formes.length - 1;
  const formes = [...dessin.formes.slice(0, rang + 1), ...poses, ...dessin.formes.slice(rang + 1)];
  return { dessin: { ...dessin, formes }, ids: [...choisies.map(f => f.id), ...nouveaux], copies: nouveaux.length };
}

// --------------------------------------------------------------------------------------------------------------- la grille

export interface ReglageGrille {
  /** Le nombre de lignes et de colonnes, l'original compris (1 x 1 : rien a faire). */
  readonly lignes: number;
  readonly colonnes: number;
  /** Le pas, d'une copie a la suivante, en unites du plan : vers la droite et vers le bas (negatif : vers la gauche, le haut). */
  readonly pasX: number;
  readonly pasY: number;
}

const entier = (v: number): boolean => Number.isInteger(v) && v >= 1;

/** Les translations d'une grille, ligne par ligne, l'original (0, 0) excepte. */
export function matricesGrille(r: ReglageGrille): Matrice[] {
  const m: Matrice[] = [];
  for (let l = 0; l < r.lignes; l++) for (let c = 0; c < r.colonnes; c++) if (l || c) m.push(translation(c * r.pasX, l * r.pasY));
  return m;
}

/** Le pas propose : la taille de la selection et un ecart d'un dixieme de son plus grand cote. */
export function pasGrilleParDefaut(dessin: DessinSvg, ids: readonly string[]): { pasX: number; pasY: number } {
  const b = boiteDe(dessin, ids);
  if (!b) return { pasX: 0, pasY: 0 };
  const ecart = Math.max(b.l, b.h) / 10;
  return { pasX: b.l + ecart, pasY: b.h + ecart };
}

/** Duplique la selection en grille de `lignes` x `colonnes`, l'original en haut a gauche (au pas positif). */
export function dupliquerEnGrille(dessin: DessinSvg, ids: readonly string[], r: ReglageGrille): ResultatRepetition {
  if (!entier(r.lignes) || !entier(r.colonnes) || r.lignes > REPETITION_MAX.cote || r.colonnes > REPETITION_MAX.cote) {
    return refus(dessin, ids, 'Une grille compte de 1 à ' + REPETITION_MAX.cote + ' lignes et colonnes.');
  }
  if (!Number.isFinite(r.pasX) || !Number.isFinite(r.pasY)) return refus(dessin, ids, 'Donnez un pas lisible.');
  return copierPar(dessin, ids, matricesGrille(r));
}

// --------------------------------------------------------------------------------------------------------------- la radiale

export interface ReglageRadial {
  /** Les exemplaires, l'original compris (2 au moins). */
  readonly exemplaires: number;
  /** L'angle total couvert, en degres, dans (0 ; 360] ; positif dans le sens horaire a l'ecran (Y vers le bas). */
  readonly angle: number;
  /** Le centre de la rotation, en unites du plan. */
  readonly centre: readonly [number, number];
  /** Vrai : chaque copie tourne avec sa place (des petales) ; faux : elle ne fait que s'y deplacer, sans tourner. */
  readonly orienter: boolean;
}

/**
 * Le pas d'angle entre deux exemplaires : un tour complet se partage en `exemplaires` (le dernier ne retombe pas sur l'original) ;
 * un arc place le premier et le dernier a ses deux bouts.
 */
export const pasRadial = (exemplaires: number, angle: number): number => (Math.abs(angle) >= 360 ? 360 / exemplaires : angle / (exemplaires - 1));

/** Les transformations d'une repetition radiale, l'original excepte ; `depuis` est le centre de la selection (pour `orienter: false`). */
export function matricesRadiales(r: ReglageRadial, depuis: readonly [number, number]): Matrice[] {
  const pas = pasRadial(r.exemplaires, r.angle), [cx, cy] = r.centre, m: Matrice[] = [];
  for (let k = 1; k < r.exemplaires; k++) {
    const rot = rotation(k * pas, cx, cy);
    if (r.orienter) { m.push(rot); continue; }
    // Sans tourner : la copie se deplace la ou la rotation porterait le centre de la selection.
    const x = rot[0] * depuis[0] + rot[2] * depuis[1] + rot[4], y = rot[1] * depuis[0] + rot[3] * depuis[1] + rot[5];
    m.push(translation(x - depuis[0], y - depuis[1]));
  }
  return m;
}

/** Repete la selection autour de `centre` : `exemplaires` en tout sur `angle` degres. */
export function repetitionRadiale(dessin: DessinSvg, ids: readonly string[], r: ReglageRadial): ResultatRepetition {
  if (!entier(r.exemplaires) || r.exemplaires < 2 || r.exemplaires > REPETITION_MAX.radiale) {
    return refus(dessin, ids, 'Une répétition radiale compte de 2 à ' + REPETITION_MAX.radiale + ' exemplaires.');
  }
  if (!Number.isFinite(r.angle) || r.angle === 0 || Math.abs(r.angle) > 360) return refus(dessin, ids, 'Donnez un angle entre 1 et 360 degrés.');
  if (!r.centre.every(Number.isFinite)) return refus(dessin, ids, 'Donnez un centre lisible.');
  const b = boiteDe(dessin, ids);
  if (!b) return refus(dessin, ids, 'Choisissez d’abord une forme visible et déverrouillée à répéter.');
  return copierPar(dessin, ids, matricesRadiales(r, [b.x + b.l / 2, b.y + b.h / 2]));
}

// --------------------------------------------------------------------------------------------------------------- la symetrie

export interface ReglageSymetrie {
  /** `h` : miroir horizontal (gauche et droite s'echangent, autour d'un axe vertical) ; `v` : miroir vertical (haut et bas). */
  readonly sens: 'h' | 'v';
  /** L'axe : l'abscisse de l'axe vertical (`h`) ou l'ordonnee de l'axe horizontal (`v`), en unites du plan. */
  readonly axe: number;
  /** Garder l'original et poser son reflet a cote ; faux : la selection elle-meme se retourne. */
  readonly garder: boolean;
}

/** La reflexion autour de l'axe. */
export const matriceSymetrie = (sens: 'h' | 'v', axe: number): Matrice => (sens === 'h' ? echelle(-1, 1, axe, 0) : echelle(1, -1, 0, axe));

/** L'axe propose : celui qui passe par le centre de la selection. */
export function axeParDefaut(dessin: DessinSvg, ids: readonly string[], sens: 'h' | 'v'): number {
  const b = boiteDe(dessin, ids);
  return b ? (sens === 'h' ? b.x + b.l / 2 : b.y + b.h / 2) : 0;
}

/** Le miroir de la selection autour de l'axe : une copie retournee (l'original reste), ou la selection retournee en place. */
export function symetrie(dessin: DessinSvg, ids: readonly string[], r: ReglageSymetrie): ResultatRepetition {
  if (!Number.isFinite(r.axe)) return refus(dessin, ids, 'Donnez un axe lisible.');
  const m = matriceSymetrie(r.sens, r.axe);
  if (r.garder) return copierPar(dessin, ids, [m]);
  const choisies = aRepeter(dessin, ids);
  if (!choisies.length) return refus(dessin, ids, 'Choisissez d’abord une forme visible et déverrouillée à retourner.');
  const voulus = choisies.map(f => f.id);
  return { dessin: transformer(dessin, voulus, m), ids: voulus, copies: 0 };
}

