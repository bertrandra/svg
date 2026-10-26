// Les degrades du modele v2 en calcul pur (ADR-0012, annexe 1 §3 et §6, annexe 2 §5) : le poids de chaque arret, la couleur de
// repli, la transformation d'un degrade avec sa forme, et son texte de definition, canonique, pret pour le recueil. La lecture et
// l'ecriture sont dans `fonctions/degrades.ts` ; ce qui sert aussi au nuancier, a la descente et au projet vit ici.
//
// Le modele garde un degrade tel qu'il a ete lu : ses coordonnees dans son propre repere, et la matrice qui le pose dans le plan
// (gradientTransform compose avec tout ce qui l'entoure, unites de boite comprises). Les transformations composent cette matrice
// (exact, sans arrondi). C'est l'ECRITURE qui choisit la forme canonique : un degrade lineaire se ramene toujours a un degrade sans
// matrice dans le plan (une fonction affine du point, que l'on sait exprimer par deux extremites), un radial garde une matrice de
// determinant 1 quand elle n'est pas une similitude, et la relecture de ce qui est ecrit le reecrit a l'identique (point fixe).

import { lireHex, versOklab, depuisOklch, versHex, type Oklab } from '../../util/couleur.js';
import { nb } from './chemins.js';
import { multiplier } from './geometrie.js';
import type { Definition } from './definitions.js';
import type { ArretDegrade, Degrade, DegradeLineaire, DegradeRadial, Matrice, Peinture } from './types.js';

/** Les arrets d'un degrade, au plus (annexe 5 §2) : la lecture garde les premiers et dit les autres. */
export const ARRETS_MAX = 64;

/** Vrai pour une peinture qui est un degrade (et pas un motif, que l'etape 9 apporte). */
export const estDegrade = (p: Peinture | undefined): p is Degrade => p !== undefined && (p.genre === 'lineaire' || p.genre === 'radial');

/**
 * La part de chaque arret dans le degrade : chaque intervalle entre deux arrets se partage par moitie entre eux, ce qui est avant le
 * premier lui revient, ce qui est apres le dernier aussi (l'etalement « pad »). La somme vaut 1 ; deux arrets a la meme position se
 * partagent l'intervalle qui les touche. Sert a la couleur de repli et au nuancier.
 */
export function poidsArrets(arrets: readonly ArretDegrade[]): number[] {
  const n = arrets.length;
  if (n === 0) return [];
  if (n === 1) return [1];
  const p = arrets.map(a => Math.min(1, Math.max(0, a.position)));
  return p.map((x, i) => {
    const avant = i === 0 ? x : (x - (p[i - 1] ?? x)) / 2;
    const apres = i === n - 1 ? 1 - x : ((p[i + 1] ?? x) - x) / 2;
    return Math.max(0, avant) + Math.max(0, apres);
  });
}

/**
 * La couleur de repli (annexe 1 §6) : la moyenne OKLab des arrets, ponderee par leur part et leur opacite (un arret transparent ne
 * colore presque rien) ; tous transparents, par leur part seule. Un #rrggbb toujours, jamais null : tout ce qui ne connait que les
 * couleurs unies (description, PDF, palettes) voit une couleur plausible.
 */
export function couleurDeRepli(arrets: readonly ArretDegrade[]): string {
  const poids = poidsArrets(arrets);
  const points = arrets.map(a => versOklab(lireHex(a.couleur) ?? { r: 0, g: 0, b: 0 }));
  const moyenne = (w: readonly number[]): Oklab | null => {
    const total = w.reduce((s, x) => s + x, 0);
    if (!(total > 0)) return null;
    let l = 0, a = 0, b = 0;
    points.forEach((p, i) => { const k = (w[i] ?? 0) / total; l += p.l * k; a += p.a * k; b += p.b * k; });
    return { l, a, b };
  };
  const m = moyenne(poids.map((w, i) => w * (arrets[i]?.opacite ?? 1))) ?? moyenne(poids) ?? { l: 0, a: 0, b: 0 };
  const h = (Math.atan2(m.b, m.a) * 180) / Math.PI;
  return versHex(depuisOklch({ l: m.l, c: Math.hypot(m.a, m.b), h: h < 0 ? h + 360 : h }));
}

// ---------------------------------------------------------------- transformation

const estTranslation = (m: Matrice): boolean => m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1;

/**
 * Le degrade pose par `m` en plus de ce qui le posait deja : une translation sur un degrade sans matrice deplace ses coordonnees
 * (le modele reste simple pour le cas le plus courant, deplacer) ; tout le reste compose la matrice, exactement.
 */
export function transformerDegrade(d: Degrade, m: Matrice): Degrade {
  if (estTranslation(m) && d.matrice === undefined) {
    const [, , , , e, f] = m;
    if (e === 0 && f === 0) return d;
    if (d.genre === 'lineaire') return { ...d, x1: d.x1 + e, y1: d.y1 + f, x2: d.x2 + e, y2: d.y2 + f };
    return {
      ...d, cx: d.cx + e, cy: d.cy + f,
      ...(d.fx !== undefined ? { fx: d.fx + e } : {}), ...(d.fy !== undefined ? { fy: d.fy + f } : {})
    };
  }
  return { ...d, matrice: multiplier(m, d.matrice ?? [1, 0, 0, 1, 0, 0]) };
}

// ---------------------------------------------------------------- ecriture canonique

const appliquer = (m: Matrice, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** Une similitude (rotation, symetrie, echelle uniforme), au bit pres : elle garde les cercles et les perpendiculaires. */
const similitude = (m: Matrice): boolean => (m[0] === m[3] && m[1] === -m[2]) || (m[0] === -m[3] && m[1] === m[2]);

/**
 * Le lineaire dans le plan, sans matrice : la couleur d'un point est une fonction affine t(q) = g·q + c, que deux extremites dans le
 * plan expriment exactement (l'etalement agit sur t : il est garde). P1 est l'image de la premiere extremite ; P2 = P1 + g/|g|².
 * Sans matrice, ou sous une similitude, les extremites sont simplement transportees (aucun calcul de plus, aucun bruit d'arrondi).
 */
export function lineaireDansLePlan(d: DegradeLineaire): readonly [number, number, number, number] {
  const m = d.matrice;
  if (!m) return [d.x1, d.y1, d.x2, d.y2];
  const [x1, y1] = appliquer(m, d.x1, d.y1);
  if (similitude(m)) { const [x2, y2] = appliquer(m, d.x2, d.y2); return [x1, y1, x2, y2]; }
  const vx = d.x2 - d.x1, vy = d.y2 - d.y1, det = m[0] * m[3] - m[1] * m[2], v2 = vx * vx + vy * vy;
  // Un degrade de longueur nulle (la couleur du dernier arret partout) ou une matrice degeneree (une forme ecrasee) : rien a orienter.
  if (!(v2 > 0) || !(Math.abs(det) > 0)) return [x1, y1, x1, y1];
  // g = M^-T v / |v|^2 ; M^-T = (1/det) [d -c ; -b a] pour M = [a c ; b d] (colonnes a,b et c,d).
  const gx = (m[3] * vx - m[1] * vy) / det / v2, gy = (-m[2] * vx + m[0] * vy) / det / v2, g2 = gx * gx + gy * gy;
  return [x1, y1, x1 + gx / g2, y1 + gy / g2];
}

/**
 * Le radial pret a ecrire : ses grandeurs et la matrice a ecrire (absente si c'est une similitude, alors portee dans les grandeurs).
 * Une matrice qui n'est pas une similitude est ramenee a un determinant de 1 (l'echelle passe dans les grandeurs, qui gardent ainsi la
 * precision du plan) ; une echelle deja a 1 pres d'un dix-millieme est laissee, sans quoi la relecture d'une matrice arrondie la
 * renormaliserait d'un cheveu et ne serait plus un point fixe.
 */
function radialAEcrire(d: DegradeRadial, precision: number): { g: readonly [number, number, number, number, number, number]; m: Matrice | null } {
  const fx = d.fx ?? d.cx, fy = d.fy ?? d.cy, fr = d.fr ?? 0;
  const m = d.matrice;
  if (!m) return { g: [d.cx, d.cy, d.r, fx, fy, fr], m: null };
  const det = m[0] * m[3] - m[1] * m[2], brute = Math.sqrt(Math.abs(det));
  const s = Number.isFinite(brute) && brute > 0 && Math.abs(brute - 1) > 1e-4 ? brute : 1;
  const k = Math.max(precision, 5), r = (v: number) => Number(nb(v, k));
  const n: Matrice = [r(m[0] / s), r(m[1] / s), r(m[2] / s), r(m[3] / s), m[4], m[5]];
  if (similitude(n) && Math.abs(det) > 0) {
    const [cx, cy] = appliquer(m, d.cx, d.cy), [px, py] = appliquer(m, fx, fy);
    return { g: [cx, cy, d.r * brute, px, py, fr * brute], m: null };
  }
  return { g: [d.cx * s, d.cy * s, d.r * s, fx * s, fy * s, fr * s], m: n };
}

/** `matrix(a b c d e f)` : les composantes lineaires a cinq decimales au moins, les translations a la precision (annexe 2 §5). */
const ecrireMatrice = (m: Matrice, precision: number): string => {
  const k = Math.max(precision, 5);
  return 'matrix(' + [nb(m[0], k), nb(m[1], k), nb(m[2], k), nb(m[3], k), nb(m[4], precision), nb(m[5], precision)].join(' ') + ')';
};

const ecrireArrets = (arrets: readonly ArretDegrade[]): string => arrets.map(a =>
  '<stop offset="' + nb(a.position, 3) + '" stop-color="' + a.couleur + '"' + (a.opacite !== undefined && a.opacite < 1 ? ' stop-opacity="' + nb(a.opacite, 3) + '"' : '') + '/>').join('');

/**
 * La definition d'un degrade, canonique (annexe 2 §5) : toujours `userSpaceOnUse`, les coordonnees a la precision, la matrice
 * seulement quand elle est utile, l'etalement seulement s'il n'est pas « pad », puis les arrets. Le meme degrade donne toujours le
 * meme texte, donc la meme empreinte, donc une seule definition pour mille formes.
 */
export function definitionDegrade(d: Degrade, precision: number): Definition {
  const etalement = d.etalement ? ' spreadMethod="' + d.etalement + '"' : '';
  const c = (v: number) => nb(v, precision);
  if (d.genre === 'lineaire') {
    const [x1, y1, x2, y2] = lineaireDansLePlan(d);
    return {
      genre: 'd', balise: 'linearGradient', enfants: ecrireArrets(d.arrets),
      attributs: ' gradientUnits="userSpaceOnUse" x1="' + c(x1) + '" y1="' + c(y1) + '" x2="' + c(x2) + '" y2="' + c(y2) + '"' + etalement
    };
  }
  const { g: [cx, cy, r, fx, fy, fr], m } = radialAEcrire(d, precision);
  // Le foyer ne s'ecrit que s'il quitte le centre, et son rayon que s'il n'est pas nul (ce que lit un navigateur sans eux).
  const foyer = (c(fx) !== c(cx) ? ' fx="' + c(fx) + '"' : '') + (c(fy) !== c(cy) ? ' fy="' + c(fy) + '"' : '') + (c(fr) !== '0' ? ' fr="' + c(fr) + '"' : '');
  return {
    genre: 'd', balise: 'radialGradient', enfants: ecrireArrets(d.arrets),
    attributs: ' gradientUnits="userSpaceOnUse" cx="' + c(cx) + '" cy="' + c(cy) + '" r="' + c(r) + '"' + foyer + (m ? ' gradientTransform="' + ecrireMatrice(m, precision) + '"' : '') + etalement
  };
}
