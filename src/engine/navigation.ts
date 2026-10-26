// Le clavier sur le dessin, en pur : quelle forme ou quel point vient apres, de combien on pousse,
// ou se pose le reticule d'un outil de trace. Aucun evenement ici (voir zones/Clavier.ts), seulement
// des choix et des nombres, pour qu'ils se testent sans navigateur.

import { ancre, estPlat, noeudsDuNiveau, verrouilleEffectif, visibleEffectif, type Boite, type Chemin, type DessinSvg, type Forme, type NoeudArbre } from './editionSvg.js';

export type Sens = 1 | -1;
export type Direction = 'gauche' | 'droite' | 'haut' | 'bas';
export type PointPlan = readonly [number, number];

/** Les formes qu'on peut choisir : visibles et deverrouillees, du fond au premier plan (l'ordre du dessin). */
export const choisissables = (d: DessinSvg): Forme[] => d.formes.filter(f => f.visible && !f.verrouille);

const idDuNoeud = (n: NoeudArbre): string => (n.genre === 'feuille' ? n.forme.id : n.groupe.id);

/**
 * Les noeuds qu'on peut choisir au niveau du contexte d'edition (ADR-0012, annexe 6 §2), du fond au premier plan : sur un dessin
 * plat, les formes choisissables d'avant (la meme liste) ; sur un dessin riche, les freres du contexte (feuilles et groupes), visibles
 * et deverrouilles eux et leurs ancetres. Tab, Page suivante, Ctrl+A et « Inverser » ne voient que ceux-la.
 */
export function noeudsChoisissables(d: DessinSvg, contexte: string | null = null): string[] {
  if (estPlat(d)) return choisissables(d).map(f => f.id);
  return noeudsDuNiveau(d, contexte).map(idDuNoeud).filter(id => visibleEffectif(d, id) && !verrouilleEffectif(d, id));
}

/**
 * La forme (le noeud du niveau du contexte, sur un dessin riche) qui suit (`sens` 1, vers le premier plan) ou precede (`sens` -1)
 * la selection. Sans selection,
 * la premiere (ou la derniere). Au bout de la liste : la premiere si `boucler`, sinon null, pour que
 * Tab puisse sortir de la toile au lieu d'y tourner pour toujours.
 */
export function formeVoisine(d: DessinSvg, sel: readonly string[], sens: Sens, boucler: boolean, contexte: string | null = null): string | null {
  const ids = noeudsChoisissables(d, contexte), n = ids.length;
  if (!n) return null;
  const choisis = new Set(sel);
  let premier = -1, dernier = -1;
  ids.forEach((id, i) => { if (choisis.has(id)) { if (premier < 0) premier = i; dernier = i; } });
  if (premier < 0) return ids[sens === 1 ? 0 : n - 1] ?? null;
  const i = sens === 1 ? dernier + 1 : premier - 1;
  if (i >= 0 && i < n) return ids[i] ?? null;
  return boucler ? ids[sens === 1 ? 0 : n - 1] ?? null : null;
}

/** Les indices des commandes qui portent un point (toutes sauf la fermeture Z). */
export const indicesDePoints = (chemin: Chemin): number[] => chemin.flatMap((c, i) => (ancre(c) ? [i] : []));

/**
 * Le point suivant ou precedent du chemin, ou null au-dela du dernier (ou du premier). Sans point actif,
 * le premier (ou le dernier) : on entre dans la forme par un bout.
 */
export function pointVoisin(chemin: Chemin, courant: number | null, sens: Sens): number | null {
  const pts = indicesDePoints(chemin);
  if (!pts.length) return null;
  if (courant === null) return pts[sens === 1 ? 0 : pts.length - 1] ?? null;
  const pos = pts.indexOf(courant);
  // Un point actif qui n'existe plus (la forme a change) : on repart du bout par lequel on entre.
  if (pos < 0) return pts[sens === 1 ? 0 : pts.length - 1] ?? null;
  return pts[pos + sens] ?? null;
}

/** Le pas d'une fleche sur la selection : un millieme du plan, dix avec Maj. */
export const pasDeplacement = (vb: DessinSvg['vb'], fort: boolean): number => ((fort ? 10 : 1) * Math.max(vb[2], vb[3])) / 1000;

/** Le plus petit cote qu'un redimensionnement laisse, comme au glisser d'un coin. */
export const coteMinimal = (vb: DessinSvg['vb']): number => Math.max(vb[2], vb[3]) / 1000;

/**
 * La boite apres un pas de redimensionnement au clavier : droite et bas agrandissent, gauche et haut
 * reduisent, le coin haut gauche reste en place. Rend la meme boite quand rien ne peut changer
 * (un cote deja au minimum), pour que l'appelant ne fabrique pas une etape d'historique vide.
 */
export function boiteRedimensionnee(b: Boite, direction: Direction, pas: number, min: number): Boite {
  const horizontal = direction === 'gauche' || direction === 'droite';
  const signe = direction === 'droite' || direction === 'bas' ? 1 : -1;
  const actuel = horizontal ? b.l : b.h;
  const suivant = Math.max(min, actuel + signe * pas);
  if (suivant === actuel) return b;
  return horizontal ? { ...b, l: suivant } : { ...b, h: suivant };
}

/** La direction d'une touche fleche, ou null pour toute autre touche. */
export function directionDe(touche: string): Direction | null {
  return touche === 'ArrowLeft' ? 'gauche' : touche === 'ArrowRight' ? 'droite' : touche === 'ArrowUp' ? 'haut' : touche === 'ArrowDown' ? 'bas' : null;
}

/** Le pas du reticule : une case de grille quand l'aimantation est la, un centieme du plan sinon ; dix fois plus avec Maj. */
export function pasReticule(vb: DessinSvg['vb'], grille: number | null, fort: boolean): number {
  return (grille ?? Math.max(vb[2], vb[3]) / 100) * (fort ? 10 : 1);
}

/** Ramene un point dans le plan de travail : le reticule ne sort jamais de ce qu'on peut dessiner. */
export function dansLePlan(p: PointPlan, vb: DessinSvg['vb']): PointPlan {
  const [x, y, l, h] = vb;
  return [Math.min(x + l, Math.max(x, p[0])), Math.min(y + h, Math.max(y, p[1]))];
}

/** Le reticule d'un pas dans une direction, retenu dans le plan. */
export function deplacerReticule(p: PointPlan, direction: Direction, pas: number, vb: DessinSvg['vb']): PointPlan {
  const dx = direction === 'gauche' ? -pas : direction === 'droite' ? pas : 0;
  const dy = direction === 'haut' ? -pas : direction === 'bas' ? pas : 0;
  return dansLePlan([p[0] + dx, p[1] + dy], vb);
}

/** Le centre de la partie du plan que la toile montre, en coordonnees du plan : la ou le reticule apparait. */
export function centreVisible(vue: { zoom: number; x: number; y: number }, largeur: number, hauteur: number): PointPlan {
  return [(largeur / 2 - vue.x) / vue.zoom, (hauteur / 2 - vue.y) / vue.zoom];
}

/** Le cote des formes posees au reticule : le quart du plus petit cote du plan. */
export const coteParDefaut = (vb: DessinSvg['vb']): number => Math.min(vb[2], vb[3]) / 4;

/**
 * Les deux coins d'une forme posee au clavier sont-ils assez ecartes pour donner une forme ? Une ligne n'a
 * besoin que de longueur (une horizontale est une ligne) ; une surface veut de la largeur ET de la hauteur,
 * sans quoi on poserait un rectangle plat que l'historique garderait pour rien.
 */
export function coinsPosables(ligne: boolean, a: PointPlan, b: PointPlan, min: number): boolean {
  const dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]);
  return ligne ? Math.hypot(dx, dy) >= min : dx >= min && dy >= min;
}

/** La boite que deux coins opposes dessinent, quel que soit celui qu'on a pose en premier. */
export function boiteDeDeuxCoins(a: PointPlan, b: PointPlan): Boite {
  return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), l: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) };
}

/**
 * Le curseur de la selection au clavier : la forme sur laquelle Espace agit. Elle est retenue avec la selection
 * qui existait quand on l'a posee (`sel`), et n'est plus crue des que la selection est un autre tableau (un clic,
 * Tab, Echap l'ont change) : un curseur qui survivrait a un clic ferait agir Espace sur une forme oubliee.
 * Sans curseur valide, c'est la derniere forme choisie.
 */
export interface Focale { id: string; sel: readonly string[] }

export function formeAuCurseur(d: DessinSvg, sel: readonly string[], focale: Focale | null, contexte: string | null = null): string | null {
  if (focale && focale.sel === sel && noeudsChoisissables(d, contexte).includes(focale.id)) return focale.id;
  return sel[sel.length - 1] ?? null;
}

/** La selection apres un Espace sur la forme `id` : elle y entre si elle n'y etait pas, elle en sort sinon. */
export function basculerDansSelection(sel: readonly string[], id: string): { sel: string[]; ajoutee: boolean } {
  return sel.includes(id) ? { sel: sel.filter(x => x !== id), ajoutee: false } : { sel: [...sel, id], ajoutee: true };
}
