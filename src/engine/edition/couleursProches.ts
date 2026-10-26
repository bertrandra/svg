// Les nuances proches : des couleurs que l'oeil confond (un rouge #c81e28 et un #c91f27 nes d'une
// vectorisation) et que l'on veut choisir ensemble ou ramener a une seule. La distance est celle d'OKLab
// (util/couleur.ts), la meme que `ecartPercu` : 0,02 se devine, 0,1 saute aux yeux. La `tolerance` s'y
// exprime donc en unites OKLab, pas en pourcentage.
//
// Tout est deterministe : les couleurs se rangent par nombre de formes decroissant puis par code, le
// regroupement est glouton dans cet ordre, et la cible d'un groupe est sa couleur la plus employee.

import { lireHex, versOklab, type Oklab } from '../../util/couleur.js';
import { au } from '../../util/tableaux.js';
import { creerIndexVoisins, ecartOklab } from '../../util/voisinsOklab.js';
import { couleursDeForme, recolorerForme, type SurCouleur } from './couleurs.js';
import type { DessinSvg, Peinture } from './types.js';

/** Un groupe de nuances ramenees a `cible` : la couleur la plus employee, et celles qui s'y fondent. */
export interface GrappeCouleurs { cible: string; membres: string[]; formes: number }

export interface FusionCouleurs {
  dessin: DessinSvg;
  /** Les couleurs qui ont disparu du dessin. */
  fusionnees: number;
  /** Les formes recolorees. */
  formes: number;
  /** Les couleurs qui devaient fusionner mais restent, parce que des formes verrouillees les portent encore. */
  conservees: number;
}

/**
 * Le nombre de formes de chaque couleur, formes masquees et verrouillees comprises : elles portent leur couleur. Les couleurs d'une
 * forme sont celles des listes (couleurs.ts, `couleursDeForme`) : unies, ou les arrets d'un degrade et les couleurs d'une tuile de
 * motif (etape 13d), jamais une couleur de repli ; chacune une fois par forme.
 */
function usages(dessin: DessinSvg, sur: SurCouleur): Map<string, number> {
  const n = new Map<string, number>();
  for (const f of dessin.formes) for (const c of couleursDeForme(f, sur)) n.set(c, (n.get(c) ?? 0) + 1);
  return n;
}

/** Le point OKLab d'une couleur, ou null si ce n'est pas un code hexadecimal (jamais une couleur devinee). */
function pointDe(couleur: string): Oklab | null {
  const rgb = lireHex(couleur);
  return rgb ? versOklab(rgb) : null;
}

/** Les couleurs les plus employees d'abord, a egalite par code croissant : l'ordre de tout le reste. */
function ordonnees(n: ReadonlyMap<string, number>): string[] {
  return [...n.keys()].sort((a, b) => (n.get(b) ?? 0) - (n.get(a) ?? 0) || (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * La cible de chaque couleur qui se fond dans une autre. Glouton : on parcourt les couleurs de la plus
 * employee a la moins employee ; chacune rejoint la premiere cible deja posee qui est a moins de
 * `tolerance`, sinon elle devient cible. Mesurer contre la cible et non contre le dernier membre evite
 * qu'un degrade entier s'enchaine en une seule couleur.
 */
function affectations(dessin: DessinSvg, tolerance: number, sur: SurCouleur): { cibles: Map<string, string>; n: Map<string, number> } {
  const n = usages(dessin, sur);
  // L'index ne fait qu'elaguer la recherche de la premiere cible a moins de `tolerance` (util/voisinsOklab.ts) :
  // sur des milliers de couleurs presque toutes distinctes, le parcours de toutes les cibles etait quadratique.
  const index = creerIndexVoisins(tolerance);
  const centres: string[] = [];
  const cibles = new Map<string, string>();
  for (const c of ordonnees(n)) {
    const point = pointDe(c);
    if (!point) continue;
    const rang = index.premier(point);
    if (rang >= 0) cibles.set(c, au(centres, rang));
    else { index.ajouter(point, centres.length); centres.push(c); }
  }
  return { cibles, n };
}

/** Les groupes de nuances qu'une tolerance reunirait ; les couleurs sans voisine n'y figurent pas. */
export function couleursProches(dessin: DessinSvg, tolerance: number, sur: SurCouleur = 'tout'): GrappeCouleurs[] {
  const { cibles, n } = affectations(dessin, tolerance, sur);
  const parCible = new Map<string, string[]>();
  // On ajoute en place : recopier la liste a chaque membre serait quadratique pour une cible tres suivie.
  for (const [de, vers] of cibles) { const l = parCible.get(vers); if (l) l.push(de); else parCible.set(vers, [de]); }
  return ordonnees(n).flatMap(cible => {
    const membres = parCible.get(cible);
    return membres ? [{ cible, membres, formes: membres.reduce((s, m) => s + (n.get(m) ?? 0), 0) }] : [];
  });
}

/**
 * Ramene chaque groupe de nuances proches a sa couleur la plus employee. Les formes verrouillees ne
 * changent jamais de couleur ; les formes masquees, si : elles reviendraient sinon dans l'ancienne
 * nuance a l'affichage. `sur` dit ce qu'on lit : en « Fond », seuls les remplissages se regroupent et
 * les contours ne bougent pas. Un arret de degrade ou une feuille de tuile se fond comme une couleur
 * unie, et la couleur de repli de sa peinture se recalcule (couleurs.ts, `recolorerForme`).
 */
export function fusionnerCouleursProches(dessin: DessinSvg, tolerance: number, sur: SurCouleur = 'tout'): FusionCouleurs {
  const { cibles } = affectations(dessin, tolerance, sur);
  if (!cibles.size) return { dessin, fusionnees: 0, formes: 0, conservees: 0 };
  let recolorees = 0;
  const memo = new Map<Peinture, Peinture>();
  const formes = dessin.formes.map(f => {
    if (f.verrouille) return f;
    const x = recolorerForme(f, cibles, sur, memo);
    if (x !== f) recolorees++;
    return x;
  });
  if (!recolorees) return { dessin, fusionnees: 0, formes: 0, conservees: cibles.size };
  const apres = { ...dessin, formes };
  const restantes = usages(apres, sur);
  const fusionnees = [...cibles.keys()].filter(c => !restantes.has(c)).length;
  return { dessin: apres, fusionnees, formes: recolorees, conservees: cibles.size - fusionnees };
}

/**
 * Les formes qu'on peut choisir dont une couleur est a moins de `tolerance` de `couleur` (la couleur
 * elle-meme comprise). Une couleur qui n'est pas un code hexadecimal ne se compare qu'a elle-meme.
 */
export function idsDeNuancesProches(dessin: DessinSvg, couleur: string, tolerance: number, sur: SurCouleur = 'tout'): string[] {
  const ref = pointDe(couleur), memo = new Map<string, boolean>();
  const proche = (c: string): boolean => {
    if (c === couleur) return true;
    const connu = memo.get(c);
    if (connu !== undefined) return connu;
    const p = ref ? pointDe(c) : null;
    const r = !!ref && !!p && ecartOklab(ref, p) <= tolerance;
    memo.set(c, r);
    return r;
  };
  return dessin.formes.filter(f => f.visible && !f.verrouille && couleursDeForme(f, sur).some(proche)).map(f => f.id);
}
