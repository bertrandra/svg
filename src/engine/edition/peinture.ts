// La lecture d'une peinture CSS (fill, stroke) : une couleur ramenee a #rrggbb, et son alpha a part.
// L'alpha est une opacite, pas une couleur : #rrggbb reste la seule forme d'une couleur dans le
// dessin (on les compare, on les regroupe, on les remplace), l'alpha voyage dans la forme.

import { depuisTsl } from '../../util/couleur.js';
import { couleurNommee } from '../../util/couleursNommees.js';
import { arrondirOpacite } from './opacites.js';

export interface PeintureLue {
  /** #rrggbb, null pour « none » et « transparent », ou la valeur telle quelle (en minuscules) si elle est inconnue (`url(#g)`). */
  readonly couleur: string | null;
  /** L'opacite de la couleur elle-meme, dans [0, 1] ; 1 pour une couleur sans canal alpha. */
  readonly alpha: number;
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** Un nombre CSS avec son pourcentage eventuel : `50%` vaut `plein * 0.5`, `0.5` vaut `0.5`. NaN si illisible. */
function nombreOuPourcent(t: string, plein: number): number {
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%?)$/i.exec(t);
  if (!m) return Number.NaN;
  return m[2] ? (Number(m[1]) * plein) / 100 : Number(m[1]);
}

/** Les jetons d'une fonction de couleur `nom(a b c / d)` ou `nom(a, b, c, d)` : trois canaux et un alpha eventuel. */
function jetons(t: string): { canaux: string[]; alpha: string | undefined } | null {
  const ouvrante = t.indexOf('(');
  if (ouvrante < 0) return null;
  const fermante = t.lastIndexOf(')');
  const interieur = t.slice(ouvrante + 1, fermante > ouvrante ? fermante : undefined);
  const [couleur = '', alpha] = interieur.split('/');
  const canaux = couleur.split(/[\s,]+/).filter(Boolean);
  // Ecriture a virgules : le quatrieme jeton est l'alpha ; avec une barre, c'est ce qui la suit.
  if (alpha === undefined && canaux.length === 4) return { canaux: canaux.slice(0, 3), alpha: canaux[3] };
  if (canaux.length !== 3) return null;
  return { canaux, alpha: alpha?.trim() || undefined };
}

const alphaDe = (t: string | undefined): number => (t === undefined ? 1 : arrondirOpacite(Number.isNaN(nombreOuPourcent(t, 1)) ? 1 : nombreOuPourcent(t, 1)));

function lireRgb(t: string): PeintureLue | null {
  const j = jetons(t);
  if (!j) return null;
  const [r, g, b] = j.canaux.map(c => nombreOuPourcent(c, 255));
  if (r === undefined || g === undefined || b === undefined || [r, g, b].some(Number.isNaN)) return null;
  return { couleur: '#' + hex2(r) + hex2(g) + hex2(b), alpha: alphaDe(j.alpha) };
}

function lireHsl(t: string): PeintureLue | null {
  const j = jetons(t);
  if (!j) return null;
  const [h, s, l] = j.canaux;
  const teinte = /^([+-]?(?:\d+\.?\d*|\.\d+))(deg|turn)?$/.exec(h ?? '');
  const sat = nombreOuPourcent(s ?? '', 100), lum = nombreOuPourcent(l ?? '', 100);
  if (!teinte || Number.isNaN(sat) || Number.isNaN(lum)) return null;
  const degres = teinte[2] === 'turn' ? Number(teinte[1]) * 360 : Number(teinte[1]);
  const rgb = depuisTsl({ t: ((degres % 360) + 360) % 360, s: Math.max(0, Math.min(100, sat)), l: Math.max(0, Math.min(100, lum)) });
  return { couleur: '#' + hex2(rgb.r) + hex2(rgb.g) + hex2(rgb.b), alpha: alphaDe(j.alpha) };
}

/** La valeur de `color` quand rien ne la pose : le noir d'un SVG ouvert seul. */
export const COULEUR_COURANTE: PeintureLue = { couleur: '#000000', alpha: 1 };

/**
 * Une peinture en #rrggbb et son alpha. `currentColor` prend la couleur courante (`color`, heritee) que
 * l'appelant donne, le noir faute d'elle : seule la lecture d'un SVG sait la chercher dans ses ancetres.
 */
export function lirePeintureAlpha(v: string, courante: PeintureLue = COULEUR_COURANTE): PeintureLue {
  const t = v.trim().toLowerCase();
  if (t === 'none' || t === 'transparent') return { couleur: null, alpha: 1 };
  if (t === 'currentcolor') return courante;
  let m = /^#([0-9a-f]{3,4})$/.exec(t);
  if (m) {
    const c = (m[1] ?? '').split('').map(x => x + x);
    return { couleur: '#' + c.slice(0, 3).join(''), alpha: c[3] === undefined ? 1 : arrondirOpacite(parseInt(c[3], 16) / 255) };
  }
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(t);
  if (m) return { couleur: '#' + (m[1] ?? ''), alpha: m[2] === undefined ? 1 : arrondirOpacite(parseInt(m[2], 16) / 255) };
  const fonction = /^(rgba?|hsla?)\s*\(/.exec(t)?.[1];
  const lue = fonction?.startsWith('rgb') ? lireRgb(t) : fonction ? lireHsl(t) : null;
  if (lue) return lue;
  return { couleur: couleurNommee(t) ?? t, alpha: 1 };
}

/** Une peinture en #rrggbb, null pour « none », ou la valeur telle quelle si elle est inconnue. L'alpha est perdu : voir `lirePeintureAlpha`. */
export const lirePeinture = (v: string): string | null => lirePeintureAlpha(v).couleur;
