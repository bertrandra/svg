// Un degrade du modele en `shading` PDF (ADR-0012, etape 13a ; ISO 32000-1, 8.7.4.5) : axial (type 2) pour un lineaire, radial
// (type 3) pour un radial, foyer et rayon du foyer compris. Les couleurs des arrets en fonction exponentielle de type 2 par intervalle,
// cousues en fonction de type 3 (un arret au meme endroit qu'un autre fait une marche nette) ; l'etalement « pad » par `/Extend`, la
// repetition et le reflet par un domaine elargi a des periodes entieres, chacune la fonction de base, a l'endroit ou a l'envers.
// Le shading vit dans le repere du degrade : la matrice qui le pose dans la page s'ecrit a part (`cm`, ou celle d'un motif).
// L'opacite des arrets : constante, elle rejoint l'etat graphique ; variable, elle devient un shading gris, pour un masque doux de
// luminance. Pur et deterministe.

import type { PeintureScene } from '../engine/aplatir.js';
import type { ArretDegrade, Degrade } from '../engine/editionSvg.js';
import { versCmjnNaif } from '../util/couleur.js';
import { composantes, luminance, nbk, type ModeCouleur } from './pdfTrace.js';

const c4 = (v: number) => nbk(v, 4);

/** L'espace de couleur d'un mode. */
export const espaceCouleur = (mode: ModeCouleur): string => (mode === 'cmjn' ? '/DeviceCMYK' : mode === 'gris' ? '/DeviceGray' : '/DeviceRGB');

/** Les composantes d'une couleur dans un mode (le CMJN naif de l'export, la luminance en gris). */
export function composantesMode(hex: string, mode: ModeCouleur): number[] {
  if (mode === 'gris') return [luminance(hex)];
  const [r, g, b] = composantes(hex);
  if (mode === 'rvb') return [r, g, b];
  const m = versCmjnNaif({ r: r * 255, g: g * 255, b: b * 255 });
  return [m.c / 100, m.m / 100, m.j / 100, m.n / 100];
}

/**
 * Le degrade ne peint qu'une couleur (SVG : un lineaire de longueur nulle, un radial de rayon nul peignent le dernier arret ; un seul
 * arret peint sa couleur) : cet arret, ou null pour un vrai degrade.
 */
export function arretUnique(d: Degrade): ArretDegrade | null {
  const dernier = d.arrets[d.arrets.length - 1];
  if (!dernier) return null;
  if (d.arrets.length === 1) return dernier;
  if (d.genre === 'lineaire') return d.x1 === d.x2 && d.y1 === d.y2 ? dernier : null;
  return d.r === 0 ? dernier : null;
}

/** L'opacite commune des arrets, ou null si elle varie (un masque doux est alors necessaire). */
export function opaciteConstante(d: Degrade): number | null {
  const o = d.arrets.map(a => a.opacite ?? 1);
  const premiere = o[0] ?? 1;
  return o.every(x => c4(x) === c4(premiere)) ? premiere : null;
}

/**
 * La fonction de base d'un degrade sur [0 ; 1] : les intervalles entre arrets (les positions bornees a [0 ; 1] et croissantes, ecrites
 * a quatre decimales ; un intervalle nul disparait, la couleur y saute), prolonges par la premiere et la derniere couleur.
 */
export function fonctionArrets(arrets: readonly ArretDegrade[], valeur: (a: ArretDegrade) => readonly number[]): string {
  const pos: number[] = [];
  for (const a of arrets) pos.push(Math.max(pos[pos.length - 1] ?? 0, Math.min(1, Math.max(0, a.position))));
  const t = pos.map(p => Number(c4(p)));
  const segments: { t0: number; t1: number; c0: readonly number[]; c1: readonly number[] }[] = [];
  const premier = arrets[0], dernier = arrets[arrets.length - 1];
  if (!premier || !dernier) return '<< /FunctionType 2 /Domain [0 1] /C0 [0] /C1 [0] /N 1 >>';
  if ((t[0] ?? 0) > 0) segments.push({ t0: 0, t1: t[0] ?? 0, c0: valeur(premier), c1: valeur(premier) });
  for (let i = 0; i + 1 < arrets.length; i++) {
    const a = arrets[i], b = arrets[i + 1];
    if (a && b && (t[i + 1] ?? 0) > (t[i] ?? 0)) segments.push({ t0: t[i] ?? 0, t1: t[i + 1] ?? 0, c0: valeur(a), c1: valeur(b) });
  }
  if ((t[t.length - 1] ?? 1) < 1) segments.push({ t0: t[t.length - 1] ?? 1, t1: 1, c0: valeur(dernier), c1: valeur(dernier) });
  // Tout au meme endroit : avant, la premiere couleur ; apres, la derniere (deux paliers, ou un seul aux bords).
  if (!segments.length) segments.push({ t0: 0, t1: 1, c0: valeur(dernier), c1: valeur(dernier) });
  const expo = (c0: readonly number[], c1: readonly number[]) => '<< /FunctionType 2 /Domain [0 1] /C0 [' + c0.map(c4).join(' ') + '] /C1 [' + c1.map(c4).join(' ') + '] /N 1 >>';
  const [seul] = segments;
  if (segments.length === 1 && seul) return expo(seul.c0, seul.c1);
  return '<< /FunctionType 3 /Domain [0 1] /Functions [' + segments.map(s => expo(s.c0, s.c1)).join(' ') + '] /Bounds ['
    + segments.slice(1).map(s => c4(s.t0)).join(' ') + '] /Encode [' + segments.map(() => '0 1').join(' ') + '] >>';
}

/**
 * La fonction sur le domaine de la peinture : la fonction de base sur [0 ; 1] ; sur [k0 ; k1], une periode par entier, la base a
 * l'endroit (repetition) ou une fois sur deux a l'envers (reflet). `objet` range la fonction de base a part, pour la citer par periode.
 */
function fonctionDomaine(p: PeintureScene, base: string, objet: (texte: string) => number): string {
  const [k0, k1] = p.domaine;
  if (k0 === 0 && k1 === 1) return base;
  const ref = objet(base) + ' 0 R', periodes: number[] = [];
  for (let k = k0; k < k1; k++) periodes.push(k);
  return '<< /FunctionType 3 /Domain [' + k0 + ' ' + k1 + '] /Functions [' + periodes.map(() => ref).join(' ') + '] /Bounds ['
    + periodes.slice(1).join(' ') + '] /Encode [' + periodes.map(k => (p.degrade.etalement === 'reflect' && Math.abs(k) % 2 === 1 ? '1 0' : '0 1')).join(' ') + '] >>';
}

/** Les coordonnees du shading sur le domaine : l'axe prolonge d'autant de periodes, ou le cercle d'arrivee agrandi. */
function coordonnees(d: Degrade, [k0, k1]: readonly [number, number]): string {
  if (d.genre === 'lineaire') {
    const vx = d.x2 - d.x1, vy = d.y2 - d.y1;
    return [d.x1 + k0 * vx, d.y1 + k0 * vy, d.x1 + k1 * vx, d.y1 + k1 * vy].map(c4).join(' ');
  }
  const fx = d.fx ?? d.cx, fy = d.fy ?? d.cy, fr = d.fr ?? 0;
  return [fx, fy, fr, fx + k1 * (d.cx - fx), fy + k1 * (d.cy - fy), fr + k1 * (d.r - fr)].map(c4).join(' ');
}

/**
 * Le dictionnaire du shading d'une peinture, en couleurs (`alpha` faux) dans le mode donne, ou en gris de ses opacites (`alpha` vrai,
 * pour un masque doux). Dans le repere du degrade.
 */
export function shading(p: PeintureScene, mode: ModeCouleur, alpha: boolean, objet: (texte: string) => number): string {
  const d = p.degrade;
  const base = fonctionArrets(d.arrets, alpha ? a => [a.opacite ?? 1] : a => composantesMode(a.couleur, mode));
  const [k0, k1] = p.domaine;
  return '<< /ShadingType ' + (d.genre === 'lineaire' ? 2 : 3) + ' /ColorSpace ' + (alpha ? '/DeviceGray' : espaceCouleur(mode))
    + ' /Coords [' + coordonnees(d, p.domaine) + ']' + (k0 === 0 && k1 === 1 ? '' : ' /Domain [' + k0 + ' ' + k1 + ']')
    + ' /Function ' + fonctionDomaine(p, base, objet) + ' /Extend [true true] >>';
}
