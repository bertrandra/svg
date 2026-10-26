// L'heritage CSS d'un element vers ses enfants et la peinture d'une forme : ce qui se transmet, ce qui se
// refuse (masque, decoupe, filtre), les opacites et l'epaisseur d'un trait. Pur.

import type { Forme } from './types.js';
import { lirePeintureAlpha, type PeintureLue } from './peinture.js';
import { t } from '../../util/i18n.js';
import { arrondirOpacite, lireOpacite } from './opacites.js';
import type { Proprietes } from './ignores.js';
import type { PriseEnCharge } from './fonctionnalites.js';

// Les proprietes que CSS transmet d'un element a ses enfants (`opacity`, `display`, le masque ne le sont pas).
const HERITEES = [
  'color', 'fill', 'stroke', 'stroke-width', 'fill-rule', 'visibility', 'fill-opacity', 'stroke-opacity',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'marker-start', 'marker-mid', 'marker-end', 'marker',
  'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'word-spacing', 'text-anchor', 'writing-mode'
];

/**
 * Une epaisseur de trait. Zero est une epaisseur (un trait invisible, a garder tel quel), pas une
 * valeur absente ; une valeur absente, illisible ou negative est ignoree par un navigateur : 1.
 */
export function lireEpaisseur(v: string | undefined): number {
  const x = Number.parseFloat(v ?? '');
  return Number.isFinite(x) && x >= 0 ? x : 1;
}

export const peinture = (p: string | undefined, defaut: string | null, courante: PeintureLue): PeintureLue => (p === undefined ? { couleur: defaut, alpha: 1 } : lirePeintureAlpha(p, courante));

/**
 * Les proprietes que les enfants d'un element recoivent : celles de ses parents, recouvertes par les siennes.
 * `inherit` ne recouvre rien (c'est le parent). `color: currentColor` non plus (la couleur du parent) ;
 * `color: none` n'est pas une couleur, un navigateur l'ecarte.
 */
export function heriter(parent: Proprietes, pr: Proprietes): Proprietes {
  const heritees: Proprietes = { ...parent };
  for (const p of HERITEES) {
    const v = pr[p];
    // Une valeur vide est invalide en CSS : elle ne recouvre rien, comme `inherit`.
    if (v === undefined || v.trim() === '' || v.trim().toLowerCase() === 'inherit') continue;
    if (p === 'color' && ['currentcolor', 'none'].includes(v.trim().toLowerCase())) continue;
    // Une taille de police relative (em, %, smaller…) se calcule sur celle du parent : les enfants recoivent des pixels.
    heritees[p] = p === 'font-size' ? String(lireTaillePolice(v, lireTaillePolice(parent['font-size'], TAILLE_POLICE_DEFAUT))) : v;
  }
  return heritees;
}

/** La taille de police d'un navigateur sans rien de pose (« medium »). */
export const TAILLE_POLICE_DEFAUT = 16;

const MOTS_TAILLE: Readonly<Record<string, number>> = { 'xx-small': 9, 'x-small': 10, small: 13, medium: 16, large: 18, 'x-large': 24, 'xx-large': 32, 'xxx-large': 48 };
const UNITES_PX: Readonly<Record<string, number>> = { '': 1, px: 1, pt: 4 / 3, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6 };

/** Une taille de police CSS en pixels ; relative (em, %, smaller, larger) a celle du parent ; illisible ou negative : celle du parent. */
export function lireTaillePolice(v: string | undefined, parent: number): number {
  const t = (v ?? '').trim().toLowerCase();
  if (t === '') return parent;
  const mot = MOTS_TAILLE[t];
  if (mot !== undefined) return mot;
  if (t === 'smaller') return parent / 1.2;
  if (t === 'larger') return parent * 1.2;
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(px|pt|pc|in|cm|mm|q|em|rem|ex|%)?$/.exec(t);
  const x = Number(m?.[1]);
  if (!m || !Number.isFinite(x) || x < 0) return parent;
  const u = m[2] ?? '';
  const px = u === 'em' ? x * parent : u === 'rem' ? x * TAILLE_POLICE_DEFAUT : u === 'ex' ? x * parent * 0.5 : u === '%' ? (x / 100) * parent : x * (UNITES_PX[u] ?? 1);
  return Math.min(px, 1e6);
}

const AUCUNE_PRISE: ReadonlySet<PriseEnCharge> = new Set();

/**
 * Ce qui change le rendu au point de ne pas s'editer (masque, decoupe, filtre) sur un element, ou null. `prises` dit ce qu'une
 * fonctionnalite du mode riche sait lire (fonctionnalites.ts) ; vide en mode plat, qui refuse donc exactement comme avant.
 */
export function refusDe(pr: Proprietes, prises: ReadonlySet<PriseEnCharge> = AUCUNE_PRISE): string | null {
  if ((pr['clip-path'] && pr['clip-path'] !== 'none' && !prises.has('decoupe')) || (pr.mask && pr.mask !== 'none' && !prises.has('masque'))) return t('un masque ou une découpe');
  if (pr.filter && pr.filter !== 'none' && !prises.has('filtre')) return t('un filtre');
  return null;
}

/**
 * Une prise (filtre, decoupe, masque) posee sur un element qu'aucune fonctionnalite ne complete en feuille ni en groupe (un clone
 * <use>, un texte lu en lettres, un symbole, la racine) : refusee comme en mode plat, en disant ou elle est posee. null si l'element
 * n'en porte pas. En mode plat, `refusDe` l'a deja refusee avec la phrase d'aujourd'hui : rien ne change par ici (ADR-0012, etape 7).
 */
export function refusHorsFeuille(pr: Proprietes, ou: string): string | null {
  const r = refusDe(pr);
  return r ? r + ' (' + ou + ')' : null;
}

/**
 * Les opacites d'une forme. `opacite` est celle des groupes et de la forme (`opacity`) ; l'alpha de la
 * couleur et `fill-opacity` / `stroke-opacity` vont au remplissage et au contour. Sans contour, forme
 * entiere et remplissage ne font qu'un (rien ne se voit a travers un trait absent) : tout se range
 * dans `opacite`, ce qui garde le SVG ecrit d'avant et le rend stable a la relecture. Avec un contour,
 * fond et trait gardent chacun la leur : un fond a demi transparent n'estompe pas son trait.
 */
export function lireOpacites(opacite: number, h: Proprietes, fond: PeintureLue, trait: PeintureLue): Pick<Forme, 'opacite' | 'opaciteRemplissage' | 'opaciteContour'> {
  const fo = lireOpacite(h['fill-opacity']);
  if (trait.couleur === null) return { opacite: arrondirOpacite(opacite * fo * fond.alpha) };
  const remplissage = arrondirOpacite(fond.alpha * fo);
  const contour = arrondirOpacite(trait.alpha * lireOpacite(h['stroke-opacity']));
  return {
    opacite: arrondirOpacite(opacite),
    ...(fond.couleur !== null && remplissage < 1 ? { opaciteRemplissage: remplissage } : {}),
    ...(contour < 1 ? { opaciteContour: contour } : {})
  };
}

