// Les reperes du document (ADR-0038) : des lignes horizontales et verticales qu'on tire depuis les regles, auxquelles les
// aimants s'accrochent. Un reglage du document, comme le contexte de production (ADR-0013) : il se garde dans le fichier
// enregistre, en un seul attribut `data-ed-reperes` sur la racine, et dans le projet ; jamais dans un export. Sans repere,
// rien n'est ecrit : un dessin d'hier garde ses octets.
//
// Pur : chaque operation rend un nouveau dessin (le meme objet quand rien ne change, ce dont l'historique se sert). Les
// valeurs se tiennent au millieme, triees et sans doublon : un repere se relit exactement comme il s'est ecrit, et deux
// reperes au meme millieme n'en font qu'un.

import type { Boite, DessinSvg, Reperes } from './types.js';
import { nb } from './chemins.js';
import { COORDONNEE_MAX } from './limites.js';

/** L'attribut de la racine qui porte les reperes. */
export const ATTRIBUT_REPERES = 'data-ed-reperes';
/** Les reperes d'un document, au plus, par axe : bien au-dela d'un usage reel, assez pour borner la lecture d'un fichier hostile. */
export const REPERES_MAX = 200;
/** Le texte de l'attribut, au plus : 200 reperes par axe a 18 caracteres. Au-dela, on ne l'analyse pas. */
const TEXTE_MAX = 2 * REPERES_MAX * 18 + 8;

/** Un repere horizontal (`h`, une ordonnee) ou vertical (`v`, une abscisse). */
export type AxeRepere = 'h' | 'v';

/** Une valeur au millieme, sans zero negatif : ce que l'ecriture garde, donc ce que la relecture redonne. */
const auMillieme = (v: number): number => {
  const r = Number(v.toFixed(3));
  return Object.is(r, -0) ? 0 : r;
};

const valeurSaine = (v: number): boolean => Number.isFinite(v) && Math.abs(v) <= COORDONNEE_MAX;

/** Un axe tenu : valeurs saines, au millieme, triees, sans doublon, bornees. */
function axeNormal(valeurs: readonly number[]): number[] {
  const r = [...new Set(valeurs.filter(valeurSaine).map(auMillieme))].sort((a, b) => a - b);
  return r.length > REPERES_MAX ? r.slice(0, REPERES_MAX) : r;
}

/** Des reperes tenus, ou null quand il n'en reste aucun (un dessin sans repere n'a pas le champ). */
export function normaliserReperes(r: { readonly h: readonly number[]; readonly v: readonly number[] }): Reperes | null {
  const h = axeNormal(r.h), v = axeNormal(r.v);
  return h.length || v.length ? { h, v } : null;
}

const memes = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** Le dessin avec ces reperes (ou sans, `null`) ; le meme objet quand ils ne changent pas. */
export function avecReperes(dessin: DessinSvg, r: Reperes | null): DessinSvg {
  const avant = dessin.reperes;
  if (!r) {
    if (!avant) return dessin;
    // Le champ se retire, il ne se met pas a `undefined` (exactOptionalPropertyTypes) ; tout autre champ du dessin reste.
    return Object.fromEntries(Object.entries(dessin).filter(([c]) => c !== 'reperes')) as unknown as DessinSvg;
  }
  if (avant && memes(avant.h, r.h) && memes(avant.v, r.v)) return dessin;
  return { ...dessin, reperes: r };
}

const vides: Reperes = { h: [], v: [] };
const axeDe = (r: Reperes, axe: AxeRepere): readonly number[] => (axe === 'h' ? r.h : r.v);
const avecAxe = (r: Reperes, axe: AxeRepere, valeurs: readonly number[]): Reperes => (axe === 'h' ? { h: valeurs, v: r.v } : { h: r.h, v: valeurs });

/** Ajoute un repere ; rien ne change si la valeur n'est pas saine, s'il existe deja au millieme, ou si l'axe est plein. */
export function ajouterRepere(dessin: DessinSvg, axe: AxeRepere, valeur: number): DessinSvg {
  const r = dessin.reperes ?? vides, liste = axeDe(r, axe);
  if (!valeurSaine(valeur) || liste.length >= REPERES_MAX) return dessin;
  return avecReperes(dessin, normaliserReperes(avecAxe(r, axe, [...liste, valeur])));
}

/** Le repere le plus proche de `valeur` sur cet axe (au millieme pres, le repere lui-meme), ou null. */
export function repereLePlusProche(dessin: DessinSvg, axe: AxeRepere, valeur: number): number | null {
  const liste = axeDe(dessin.reperes ?? vides, axe);
  let meilleur: number | null = null;
  for (const v of liste) if (meilleur === null || Math.abs(v - valeur) < Math.abs(meilleur - valeur)) meilleur = v;
  return meilleur;
}

/** Retire le repere `valeur` (au millieme) de cet axe ; le dessin n'a plus de champ quand c'etait le dernier. */
export function supprimerRepere(dessin: DessinSvg, axe: AxeRepere, valeur: number): DessinSvg {
  const r = dessin.reperes;
  if (!r) return dessin;
  const cible = auMillieme(valeur), liste = axeDe(r, axe);
  if (!liste.includes(cible)) return dessin;
  return avecReperes(dessin, normaliserReperes(avecAxe(r, axe, liste.filter(v => v !== cible))));
}

/**
 * Deplace le repere `de` a `a` sur le meme axe. Rien ne change si `de` n'existe pas ou si `a` n'est pas sain ; s'il tombe sur un
 * autre repere, les deux n'en font plus qu'un.
 */
export function deplacerRepere(dessin: DessinSvg, axe: AxeRepere, de: number, a: number): DessinSvg {
  const r = dessin.reperes;
  if (!r || !valeurSaine(a)) return dessin;
  const cible = auMillieme(de), liste = axeDe(r, axe);
  if (!liste.includes(cible)) return dessin;
  return avecReperes(dessin, normaliserReperes(avecAxe(r, axe, [...liste.filter(v => v !== cible), a])));
}

/** Retire tous les reperes. */
export const effacerReperes = (dessin: DessinSvg): DessinSvg => avecReperes(dessin, null);

/** Le nombre de reperes du dessin. */
export const nombreReperes = (dessin: DessinSvg): number => (dessin.reperes ? dessin.reperes.h.length + dessin.reperes.v.length : 0);

/**
 * Le texte de l'attribut : « h:10,20.5;v:30 », un axe seulement s'il porte un repere, l'horizontal d'abord, chaque valeur au
 * millieme. Des chiffres, un point, un signe, deux-points, virgules et points-virgules : rien a echapper.
 */
export function ecrireReperes(r: Reperes): string {
  const parties: string[] = [];
  if (r.h.length) parties.push('h:' + r.h.map(v => nb(v, 3)).join(','));
  if (r.v.length) parties.push('v:' + r.v.map(v => nb(v, 3)).join(','));
  return parties.join(';');
}

const NOMBRE = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/;

/**
 * Les reperes lus dans le texte de l'attribut, tenus ; null s'il n'y en a aucun ou si le texte ne se lit pas. Ne leve jamais :
 * un texte trop long, un axe inconnu, un nombre illisible font renoncer au tout (ADR-0014 : on ne devine pas).
 */
export function lireReperes(texte: string): Reperes | null {
  if (typeof texte !== 'string' || texte.length > TEXTE_MAX) return null;
  const propre = texte.trim();
  if (!propre) return null;
  const h: number[] = [], v: number[] = [], vus = new Set<string>();
  for (const partie of propre.split(';')) {
    const deux = partie.indexOf(':');
    if (deux < 0) return null;
    const axe = partie.slice(0, deux).trim();
    if ((axe !== 'h' && axe !== 'v') || vus.has(axe)) return null;
    vus.add(axe);
    const valeurs = partie.slice(deux + 1).split(',').map(s => s.trim());
    if (valeurs.length > REPERES_MAX) return null;
    for (const s of valeurs) {
      if (!NOMBRE.test(s)) return null;
      const n = Number(s);
      if (!valeurSaine(n)) return null;
      (axe === 'h' ? h : v).push(n);
    }
  }
  return normaliserReperes({ h, v });
}

/**
 * Le SVG avec les reperes poses a la fin des attributs de sa racine (apres la marque du contexte, si elle y est). Sans repere,
 * le SVG est rendu tel quel : c'est ce qui garde les octets d'un dessin sans repere.
 */
export function marquerReperes(svg: string, r: Reperes | null | undefined): string {
  if (!r || (!r.h.length && !r.v.length)) return svg;
  const debut = svg.indexOf('<svg');
  const fin = debut < 0 ? -1 : svg.indexOf('>', debut);
  if (fin < 0) return svg;
  const coupe = svg.charAt(fin - 1) === '/' ? fin - 1 : fin;
  return svg.slice(0, coupe) + ' ' + ATTRIBUT_REPERES + '="' + ecrireReperes(r) + '"' + svg.slice(coupe);
}

/**
 * Les reperes en boites sans epaisseur, pour les aimants (transformations.ts) : une ligne horizontale est une boite de hauteur
 * nulle sur toute la largeur du plan, une verticale une boite de largeur nulle sur toute sa hauteur. Leurs bords et leur centre
 * tombent ainsi sur le repere dans son axe, et sur ceux du plan dans l'autre, qui attirent deja.
 */
export function boitesReperes(dessin: DessinSvg): Boite[] {
  const r = dessin.reperes;
  if (!r) return [];
  const [x, y, l, h] = dessin.vb;
  return [...r.h.map(v => ({ x, y: v, l, h: 0 })), ...r.v.map(v => ({ x: v, y, l: 0, h }))];
}
