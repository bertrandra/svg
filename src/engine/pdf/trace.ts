// D'un trace peint a une forme du dessin a plat : couleurs, opacites, style du trait, et ce que la decoupe aurait cache. Le
// trace arrive deja dans le repere du dessin (contenu.ts applique la matrice courante et celle de la page a chaque point).

import { boiteChemin, normaliserPointilles, type Chemin, type Commande, type Forme } from '../editionSvg.js';
import { hexDe, versRvb, type Espace } from './couleurs.js';
import type { Decoupe, Etat, Peinture, Pertes, Rect } from './etat.js';

/** L'epaisseur donnee a un trait « 0 w » : le PDF y trace le filet le plus fin de l'appareil, un SVG n'y tracerait rien. */
export const EPAISSEUR_FILET = 0.25;

const EPS = 0.01;

/** Vrai si le trace dessine quelque chose : au moins un segment, pas seulement des deplacements. */
export const dessine = (d: Chemin): boolean => d.some(c => c.c === 'L' || c.c === 'C' || c.c === 'Q');

/** Le facteur d'echelle d'une matrice pour une longueur (epaisseur, tirets) : la racine de son determinant, comme la lecture d'un SVG. */
export const facteur = (m: readonly number[]): number => Math.sqrt(Math.abs((m[0] ?? 1) * (m[3] ?? 1) - (m[1] ?? 0) * (m[2] ?? 0)));

/** Le rectangle droit que decrit un trace (un `re`, ou m l l l h), ou null pour toute autre forme. */
export function rectangleDe(d: Chemin): Rect | null {
  const points: Array<readonly [number, number]> = [];
  for (const [i, c] of d.entries()) {
    if (c.c === 'M') { if (i !== 0) return null; points.push([c.p[0] ?? 0, c.p[1] ?? 0]); }
    else if (c.c === 'L') points.push([c.p[0] ?? 0, c.p[1] ?? 0]);
    else if (c.c === 'Z') { if (i !== d.length - 1) return null; }
    else return null;
  }
  const premier = points[0], dernier = points[points.length - 1];
  if (points.length === 5 && premier && dernier && Math.abs(premier[0] - dernier[0]) < EPS && Math.abs(premier[1] - dernier[1]) < EPS) points.pop();
  if (points.length !== 4) return null;
  for (let k = 0; k < 4; k++) {
    const a = points[k], b = points[(k + 1) % 4];
    if (!a || !b || (Math.abs(a[0] - b[0]) > EPS && Math.abs(a[1] - b[1]) > EPS)) return null;
  }
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** La decoupe apres un nouveau trace de decoupe : l'intersection de deux rectangles en est un, tout le reste est quelconque. */
export function intersecter(avant: Decoupe, d: Chemin): Decoupe {
  const r = rectangleDe(d);
  if (avant === 'complexe' || !r) return 'complexe';
  if (!avant) return r;
  return [Math.max(avant[0], r[0]), Math.max(avant[1], r[1]), Math.min(avant[2], r[2]), Math.min(avant[3], r[3])];
}

/** Vrai si la decoupe cache une partie de la forme (sa boite, trait compris, deborde du rectangle). */
function coupe(decoupe: Decoupe, d: Chemin, demiTrait: number): boolean {
  if (!decoupe) return false;
  if (decoupe === 'complexe') return true;
  const b = boiteChemin(d);
  if (!b) return false;
  return b.x - demiTrait < decoupe[0] - EPS || b.y - demiTrait < decoupe[1] - EPS || b.x + b.l + demiTrait > decoupe[2] + EPS || b.y + b.h + demiTrait > decoupe[3] + EPS;
}

/** Ce que le genre d'un espace fait dire a la lecture : une conversion CMJN, ou une autre approximation. */
function noterEspace(e: Espace, p: Pertes): void {
  const base = e.k === 'indexe' ? e.base : e;
  if (base.k === 'cmjn') p.cmjn = true;
  else if (base.k === 'lab' || base.k === 'separation') { p.approchees = true; if (base.k === 'separation' && base.alt.k === 'cmjn') p.cmjn = true; }
}

/** La couleur d'une peinture ; `motif` donne celle, approchee, d'un motif ou d'un degrade. null : rien a peindre. */
export function couleurDe(peinture: Peinture, pertes: Pertes, motif: (p: Peinture) => [number, number, number] | null): string | null {
  if (peinture.espace.k === 'motif') {
    const c = motif(peinture);
    if (c) pertes.motifs++;
    return c ? hexDe(c) : null;
  }
  const c = versRvb(peinture.espace, peinture.valeurs);
  if (!c) return null;
  noterEspace(peinture.espace, pertes);
  return hexDe(c);
}

/** Les opacites d'une forme : un seul champ quand remplissage et trait partagent la meme, sinon chacune a part. */
function opacites(remplissage: string | null, contour: string | null, fond: number, trait: number): Pick<Forme, 'opacite' | 'opaciteRemplissage' | 'opaciteContour'> {
  const r = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
  if (remplissage && contour && r(fond) !== r(trait)) {
    return { opacite: 1, ...(r(fond) < 1 ? { opaciteRemplissage: r(fond) } : {}), ...(r(trait) < 1 ? { opaciteContour: r(trait) } : {}) };
  }
  return { opacite: r(remplissage ? fond : trait) };
}

/** Le style du trait, champs absents quand ils valent ceux du modele (bout plat, jonction ronde, limite 4, trait plein). */
function styleTrait(e: Etat, k: number): Partial<Forme> {
  const s: { -readonly [C in keyof Forme]?: Forme[C] } = {};
  if (e.bout === 1) s.bout = 'round'; else if (e.bout === 2) s.bout = 'square';
  if (e.jonction === 0) {
    s.jonction = 'miter';
    // Une limite de pointe sous 1 n'a pas de sens (le PDF la refuse) ; 4 est celle du modele, absente.
    const limite = Math.max(1, e.limite);
    if (limite !== 4) s.limiteMitre = limite;
  } else if (e.jonction === 2) s.jonction = 'bevel';
  const motif = normaliserPointilles(e.tirets.map(v => v * k));
  if (motif && motif.length) {
    s.pointilles = motif;
    if (e.phase !== 0 && Number.isFinite(e.phase)) s.decalagePointilles = e.phase * k;
  }
  return s;
}

/** La forme d'un trace peint, ou null s'il n'y a rien a peindre. `pertes` recoit ce qui n'est qu'approche ou cache. */
export function formeDe(id: string, d: Commande[], e: Etat, remplissage: string | null, contour: string | null, regle: 'nonzero' | 'evenodd', pertes: Pertes): Forme | null {
  if (!remplissage && !contour) return null;
  const k = facteur(e.ctm);
  let epaisseur = contour ? e.epaisseur * k : 0;
  if (contour && !(epaisseur > 0)) { epaisseur = EPAISSEUR_FILET; pertes.filets++; }
  if (coupe(e.decoupe, d, contour ? epaisseur / 2 : 0)) pertes.decoupes++;
  if (e.masqueDoux) pertes.masquesDoux++;
  if (e.fusion) pertes.fusions++;
  return {
    id, d, remplissage, contour, epaisseur,
    ...opacites(remplissage, contour, e.ca * e.groupe, e.CA * e.groupe),
    ...(contour ? styleTrait(e, k) : {}),
    regle, visible: true, verrouille: false
  };
}
