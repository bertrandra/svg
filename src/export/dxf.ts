// Un DXF ASCII au format R12 (AC1009), le plus largement lu : AutoCAD, LibreCAD, LightBurn, les logiciels de
// decoupe vinyle et de fraisage. Chaque courbe est aplatie en segments (un DXF R12 n'a ni LWPOLYLINE ni
// SPLINE : un arc exact serait un autre format, et une approximation de plus a verifier), chaque couleur
// devient un calque `COULEUR_RRGGBB`, un trace ferme devient une POLYLINE fermee. L'axe Y est retourne (le
// CAD a l'origine en bas, le SVG en haut) autour du bas du plan, de sorte que le dessin tient dans
// [0, largeur] x [0, hauteur]. Pur et deterministe : memes entrees, memes octets.

import type { DessinSvg, Forme } from '../engine/editionSvg.js';
import { lireHex } from '../util/couleur.js';
import { polylignes } from './aplatissement.js';
import { MM_PAR_POUCE, poucesParUnite, type Taille, type Unite } from './dimensions.js';

export interface OptionsDxf {
  /** L'unite du fichier. Un DXF n'a pas de pixel : `px` s'ecrit en millimetres, a 96 au pouce. Defaut : mm. */
  readonly unite?: Unite;
  /** La largeur voulue du dessin ; absente, un px du plan vaut 1/96 de pouce. */
  readonly taille?: Taille | null;
  /** L'ecart maximal d'une courbe a ses segments, dans l'unite du fichier. Defaut : 0,01 mm ou 0,0005 pouce. */
  readonly tolerance?: number;
}

const CRLF = '\r\n';
const groupe = (code: number, valeur: string | number) => String(code).padStart(3, ' ') + CRLF + valeur + CRLF;

/** Un reel DXF : cinq decimales au plus, jamais d'exposant ni de -0. */
const reel = (v: number): string => { const r = Number(v.toFixed(5)); return Object.is(r, -0) || r === 0 ? '0' : String(r); };

// ---------------------------------------------------------------- la palette AutoCAD (ACI)

/** La palette ACI : 1 a 9 fixes, 10 a 249 (24 teintes de 15 degres x 5 clartes x 2 saturations), 250 a 255 gris. */
function paletteAci(): Map<number, [number, number, number]> {
  const p = new Map<number, [number, number, number]>([
    [1, [255, 0, 0]], [2, [255, 255, 0]], [3, [0, 255, 0]], [4, [0, 255, 255]], [5, [0, 0, 255]], [6, [255, 0, 255]],
    [7, [255, 255, 255]], [8, [128, 128, 128]], [9, [192, 192, 192]]
  ]);
  const clartes = [1, 0.65, 0.5, 0.3, 0.15];
  for (let n = 10; n <= 249; n++) {
    const teinte = (Math.floor((n - 10) / 10) * 15) / 60, j = (n - 10) % 10, v = clartes[j >> 1] ?? 1, s = j & 1 ? 0.5 : 1;
    const i = Math.floor(teinte), f = teinte - i, q = v * (1 - s), r = v * (1 - s * f), t = v * (1 - s * (1 - f));
    const [R, G, B] = [[v, t, q], [r, v, q], [q, v, t], [q, r, v], [t, q, v], [v, q, r]][i % 6] ?? [v, q, q];
    // La table officielle tronque (127,5 -> 127) plutot qu'elle n'arrondit.
    const octet = (x: number | undefined) => Math.floor((x ?? 0) * 255 + 1e-9);
    p.set(n, [octet(R), octet(G), octet(B)]);
  }
  [51, 91, 132, 173, 214, 255].forEach((g, i) => p.set(250 + i, [g, g, g]));
  return p;
}
const ACI = paletteAci();

/**
 * L'index ACI le plus proche d'une couleur : c'est le seul moyen, en R12, de donner une couleur a un calque.
 * Le noir et le blanc sont le 7, qui s'affiche noir sur fond clair et blanc sur fond sombre.
 */
export function indexAci(hex: string): number {
  const c = lireHex(hex) ?? { r: 0, g: 0, b: 0 };
  if ((c.r === 0 && c.g === 0 && c.b === 0) || (c.r === 255 && c.g === 255 && c.b === 255)) return 7;
  let meilleur = 7, ecart = Infinity;
  for (const [i, [r, g, b]] of ACI) {
    if (i === 7) continue;
    const e = (c.r - r) ** 2 + (c.g - g) ** 2 + (c.b - b) ** 2;
    if (e < ecart) { ecart = e; meilleur = i; }
  }
  return meilleur;
}

/** Le nom du calque d'une couleur : `COULEUR_RRGGBB`, en majuscules (un nom de calque DXF n'a ni #, ni espace). */
export function nomCalque(hex: string): string {
  const c = lireHex(hex) ?? { r: 0, g: 0, b: 0 };
  return 'COULEUR_' + [c.r, c.g, c.b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// ---------------------------------------------------------------- l'ecriture

/** La couleur d'un trace de decoupe : celle du contour, sinon celle du remplissage. Une forme sans peinture ne se trace pas. */
const couleurDeCoupe = (f: Forme): string | null => f.contour ?? f.remplissage;

interface Entite { readonly calque: string; readonly ferme: boolean; readonly points: readonly (readonly [number, number])[] }

function entites(dessin: DessinSvg, k: number, tolerance: number): Entite[] {
  const [vx, vy, , vh] = dessin.vb, out: Entite[] = [];
  for (const f of dessin.formes) {
    const couleur = couleurDeCoupe(f);
    if (!f.visible || couleur === null) continue;
    for (const pl of polylignes(f.d, tolerance / k)) {
      out.push({ calque: nomCalque(couleur), ferme: pl.ferme, points: pl.points.map(([x, y]) => [(x - vx) * k, (vy + vh - y) * k] as const) });
    }
  }
  return out;
}

function ecrireEntite(e: Entite): string {
  let s = groupe(0, 'POLYLINE') + groupe(8, e.calque) + groupe(66, 1) + groupe(10, 0) + groupe(20, 0) + groupe(30, 0) + groupe(70, e.ferme ? 1 : 0);
  for (const [x, y] of e.points) s += groupe(0, 'VERTEX') + groupe(8, e.calque) + groupe(10, reel(x)) + groupe(20, reel(y)) + groupe(30, 0);
  return s + groupe(0, 'SEQEND') + groupe(8, e.calque);
}

/** Le DXF du dessin. Les formes masquees ne s'ecrivent pas ; le calque `0` existe toujours, vide. */
export function ecrireDxf(dessin: DessinSvg, options: OptionsDxf = {}): string {
  const pouces = poucesParUnite(dessin.vb, options.taille);
  const enPouce = options.unite === 'in';
  const k = enPouce ? pouces : pouces * MM_PAR_POUCE;
  const tolerance = options.tolerance !== undefined && options.tolerance > 0 ? options.tolerance : enPouce ? 0.0005 : 0.01;
  const liste = entites(dessin, k, tolerance);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const e of liste) for (const [x, y] of e.points) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x0 === Infinity) { x0 = y0 = x1 = y1 = 0; }
  const calques = [...new Set(liste.map(e => e.calque))].sort();
  const couleurs = new Map(calques.map(n => [n, indexAci('#' + n.slice(8))]));

  let s = groupe(0, 'SECTION') + groupe(2, 'HEADER');
  s += groupe(9, '$ACADVER') + groupe(1, 'AC1009');
  s += groupe(9, '$INSBASE') + groupe(10, 0) + groupe(20, 0) + groupe(30, 0);
  s += groupe(9, '$EXTMIN') + groupe(10, reel(x0)) + groupe(20, reel(y0)) + groupe(30, 0);
  s += groupe(9, '$EXTMAX') + groupe(10, reel(x1)) + groupe(20, reel(y1)) + groupe(30, 0);
  s += groupe(9, '$LIMMIN') + groupe(10, 0) + groupe(20, 0);
  s += groupe(9, '$LIMMAX') + groupe(10, reel(Math.max(x1, 0))) + groupe(20, reel(Math.max(y1, 0)));
  s += groupe(9, '$MEASUREMENT') + groupe(70, enPouce ? 0 : 1);
  s += groupe(9, '$INSUNITS') + groupe(70, enPouce ? 1 : 4);
  s += groupe(0, 'ENDSEC');

  s += groupe(0, 'SECTION') + groupe(2, 'TABLES');
  s += groupe(0, 'TABLE') + groupe(2, 'LTYPE') + groupe(70, 1);
  s += groupe(0, 'LTYPE') + groupe(2, 'CONTINUOUS') + groupe(70, 0) + groupe(3, 'Solid line') + groupe(72, 65) + groupe(73, 0) + groupe(40, 0);
  s += groupe(0, 'ENDTAB');
  s += groupe(0, 'TABLE') + groupe(2, 'LAYER') + groupe(70, calques.length + 1);
  s += groupe(0, 'LAYER') + groupe(2, '0') + groupe(70, 0) + groupe(62, 7) + groupe(6, 'CONTINUOUS');
  for (const n of calques) s += groupe(0, 'LAYER') + groupe(2, n) + groupe(70, 0) + groupe(62, couleurs.get(n) ?? 7) + groupe(6, 'CONTINUOUS');
  s += groupe(0, 'ENDTAB') + groupe(0, 'ENDSEC');

  s += groupe(0, 'SECTION') + groupe(2, 'ENTITIES');
  for (const e of liste) s += ecrireEntite(e);
  s += groupe(0, 'ENDSEC') + groupe(0, 'EOF');
  return s;
}
