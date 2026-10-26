// Le cadre de reperage d'un export Cricut sans recalage automatique (ADR-0039). Design Space rogne un SVG importe a ses formes et
// pose un ensemble attache dans le coin haut gauche de la zone de coupe (a verifier, temoin 10) : la place des formes dans le plan ne
// survit pas a l'import. Un cadre de la taille de la zone utile, attache aux formes, la fait survivre : l'ensemble occupe alors toute
// la zone, et chaque forme y garde sa distance aux bords. Attacher fond les couleurs en une seule (manuel de Design Space) : il faut
// donc un cadre par couleur, de cette couleur, pour que chaque tapis garde la sienne. Le cadre se passe ensuite en « Guide », qui ne
// se coupe pas. Pur et deterministe : memes entrees, memes octets ; avec le recalage automatique, rien de tout cela n'existe.

import type { Commande, DessinSvg, Forme } from '../engine/editionSvg.js';
import { cadreFixe, zoneDuCadre, type CadreTapis, type ProfilProduction } from '../engine/preparation.js';

/** La largeur de l'anneau d'un cadre plein, en unites du plan (environ 0,5 mm) : visible sur le canevas, sans rien couvrir. */
export const LARGEUR_CADRE = 2;

const M = (x: number, y: number): Commande => ({ c: 'M', p: [x, y] });
const L = (x: number, y: number): Commande => ({ c: 'L', p: [x, y] });
const Z: Commande = { c: 'Z', p: [] };

/** Un rectangle ferme, dans le sens horaire a l'ecran (ou l'autre, pour creuser un anneau). */
const rectangle = (b: CadreTapis, inverse = false): Commande[] => (inverse
  ? [M(b.x, b.y), L(b.x, b.y + b.h), L(b.x + b.l, b.y + b.h), L(b.x + b.l, b.y), Z]
  : [M(b.x, b.y), L(b.x + b.l, b.y), L(b.x + b.l, b.y + b.h), L(b.x, b.y + b.h), Z]);

const forme = (id: string, d: Commande[], remplissage: string | null, contour: string | null, epaisseur: number): Forme =>
  ({ id, d, remplissage, contour, epaisseur, opacite: 1, regle: 'nonzero', visible: true, verrouille: false });

/**
 * Les cadres de reperage d'une zone, un par couleur, dans l'ordre des couleurs. `plein` : un anneau rempli dont le bord exterieur est
 * celui de la zone (le fichier de la lame n'a que des fonds) ; `trait` : le rectangle de la zone en trait, sans fond, a la largeur
 * donnee (le fichier du stylo n'a que des traits).
 */
export function cadresReperage(zone: CadreTapis, couleurs: readonly string[], genre: { readonly plein: true } | { readonly trait: number }): Forme[] {
  return couleurs.map((couleur, i) => {
    const id = 'reperage-' + (i + 1);
    if ('trait' in genre) return forme(id, rectangle(zone), null, couleur, genre.trait);
    const e = LARGEUR_CADRE, dedans = { x: zone.x + e, y: zone.y + e, l: zone.l - 2 * e, h: zone.h - 2 * e };
    return forme(id, [...rectangle(zone), ...rectangle(dedans, true)], couleur, null, 1);
  });
}

/** Les couleurs distinctes d'une liste, dans l'ordre de leur premiere apparition, la casse ignoree. */
export function couleursDistinctes(couleurs: ReadonlyArray<string | null>): string[] {
  const vues = new Set<string>(), r: string[] = [];
  for (const c of couleurs) {
    if (c === null || vues.has(c.toLowerCase())) continue;
    vues.add(c.toLowerCase());
    r.push(c);
  }
  return r;
}

/**
 * Le dessin d'un export pour ce profil : tel quel avec le recalage automatique (le meme objet : les octets d'avant) ; sans, le plan
 * devient le tapis fixe et les cadres de reperage passent sous les formes. `cadres` les fabrique pour la zone utile du tapis.
 */
export function avecReperage<D extends DessinSvg>(dessin: D, p: ProfilProduction, cadres: (zone: CadreTapis) => readonly Forme[]): D {
  if (p.recalage) return dessin;
  const tapis = cadreFixe(p, dessin.vb);
  return { ...dessin, vb: [tapis.x, tapis.y, tapis.l, tapis.h], formes: [...cadres(zoneDuCadre(p, tapis)), ...dessin.formes] };
}
