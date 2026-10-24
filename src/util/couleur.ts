// Primitives de couleur : lecture hexadecimale, sRGB lineaire, OKLab / OKLCH, simulation des
// daltonismes. Des mathematiques sans domaine, donc dans util/ (niveau 0, pur).
//
// OKLab (Ottosson, 2020) sert a deux choses : mesurer une difference de couleur percue (une distance
// euclidienne y a du sens) et ajuster la clarte d'une couleur sans toucher a sa teinte, ce que HSL
// fait mal (un jaune et un bleu de meme « L » HSL n'ont pas du tout la meme clarte percue).

export interface Rgb { r: number; g: number; b: number }
export interface Oklab { l: number; a: number; b: number }
export interface Oklch { l: number; c: number; h: number }

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#abc` ou `#aabbcc` (diese facultatif) ; null pour tout le reste, jamais une couleur devinee. */
export function lireHex(texte: string): Rgb | null {
  const m = HEX.exec(texte.trim());
  if (m === null || m[1] === undefined) return null;
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function versHex(c: Rgb): string {
  const deux = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return '#' + deux(c.r) + deux(c.g) + deux(c.b);
}

/** Composante sRGB 0-255 vers lumiere lineaire 0-1 (courbe sRGB officielle). */
export function lineaire(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Lumiere lineaire 0-1 vers composante sRGB 0-255, non arrondie. */
export function gamma(v: number): number {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return c * 255;
}

/** Luminance relative WCAG 2.x d'une couleur sRGB : 0 pour le noir, 1 pour le blanc. */
export function luminance(c: Rgb): number {
  return 0.2126 * lineaire(c.r) + 0.7152 * lineaire(c.g) + 0.0722 * lineaire(c.b);
}

/** Le rapport de contraste WCAG 2.x entre deux couleurs : de 1 (identiques) a 21 (noir sur blanc). */
export function contraste(x: Rgb, y: Rgb): number {
  const a = luminance(x), b = luminance(y);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function versOklab(c: Rgb): Oklab {
  const r = lineaire(c.r), g = lineaire(c.g), b = lineaire(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  };
}

/** OKLab vers sRGB lineaire, sans bornage : une composante hors de [0, 1] dit « hors gamut ». */
function oklabVersLineaire(c: Oklab): [number, number, number] {
  const l = (c.l + 0.3963377774 * c.a + 0.2158037573 * c.b) ** 3;
  const m = (c.l - 0.1055613458 * c.a - 0.0638541728 * c.b) ** 3;
  const s = (c.l - 0.0894841775 * c.a - 1.291485548 * c.b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ];
}

export function versOklch(c: Rgb): Oklch {
  const lab = versOklab(c);
  const h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  return { l: lab.l, c: Math.hypot(lab.a, lab.b), h: h < 0 ? h + 360 : h };
}

function dansGamut(lin: [number, number, number]): boolean {
  return lin.every(v => v >= -1e-4 && v <= 1 + 1e-4);
}

/**
 * OKLCH vers sRGB. Hors gamut, la chroma est reduite (par dichotomie) jusqu'a y rentrer : la clarte
 * et la teinte sont gardees, c'est la saturation qui cede. C'est ce qu'on veut en ajustant un
 * contraste : la clarte est justement ce qu'on regle.
 */
export function depuisOklch(c: Oklch): Rgb {
  const l = Math.min(1, Math.max(0, c.l));
  const lab = (chroma: number): Oklab => {
    const rad = (c.h * Math.PI) / 180;
    return { l, a: chroma * Math.cos(rad), b: chroma * Math.sin(rad) };
  };
  let chroma = Math.max(0, c.c);
  if (!dansGamut(oklabVersLineaire(lab(chroma)))) {
    let bas = 0, haut = chroma;
    for (let i = 0; i < 24; i++) {
      const milieu = (bas + haut) / 2;
      if (dansGamut(oklabVersLineaire(lab(milieu)))) bas = milieu; else haut = milieu;
    }
    chroma = bas;
  }
  const [r, g, b] = oklabVersLineaire(lab(chroma));
  const borne = (v: number) => gamma(Math.min(1, Math.max(0, v)));
  return { r: Math.round(borne(r)), g: Math.round(borne(g)), b: Math.round(borne(b)) };
}

/** Difference percue entre deux couleurs (distance OKLab). 0,02 se devine ; 0,1 saute aux yeux. */
export function ecartPercu(x: Rgb, y: Rgb): number {
  const a = versOklab(x), b = versOklab(y);
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}

/** Melange `opacite` de `dessus` sur `dessous`, en sRGB comme le font les navigateurs et la PAO. */
export function superposer(dessus: Rgb, dessous: Rgb, opacite: number): Rgb {
  const a = Math.min(1, Math.max(0, opacite));
  return {
    r: dessus.r * a + dessous.r * (1 - a),
    g: dessus.g * a + dessous.g * (1 - a),
    b: dessus.b * a + dessous.b * (1 - a)
  };
}

export type Vision = 'protanopie' | 'deuteranopie' | 'tritanopie';

// Machado, Oliveira et Fernandes (2009), severite 1,0, appliquees en sRGB lineaire.
const MATRICES: Record<Vision, readonly (readonly [number, number, number])[]> = {
  protanopie: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopie: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopie: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]]
};

/**
 * La matrice 3 x 3 d'une vision, en sRGB lineaire, pour qui l'applique lui-meme (un filtre SVG
 * `feColorMatrix` en `linearRGB` montre une epreuve entiere comme la voit cette personne).
 */
export function matriceVision(vision: Vision): number[][] {
  return MATRICES[vision].map(ligne => [...ligne]);
}

/** Ce que voit une personne atteinte de `vision`, d'apres le modele de Machado. */
export function simulerVision(c: Rgb, vision: Vision): Rgb {
  const v = [lineaire(c.r), lineaire(c.g), lineaire(c.b)];
  const [l0, l1, l2] = MATRICES[vision];
  const ligne = (m: readonly [number, number, number] | undefined) =>
    m === undefined ? 0 : gamma(Math.min(1, Math.max(0, m[0] * (v[0] ?? 0) + m[1] * (v[1] ?? 0) + m[2] * (v[2] ?? 0))));
  return { r: ligne(l0), g: ligne(l1), b: ligne(l2) };
}

// ---- Codes de couleur : lire et ecrire tous les formats qu'un directeur artistique manie ----

export interface Tsl { t: number; s: number; l: number }
export interface Cmjn { c: number; m: number; j: number; n: number }

/** sRGB vers teinte, saturation, luminosite (TSL / HSL), en degres et en pourcentages. */
export function versTsl(c: Rgb): Tsl {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return { t: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  const t = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { t: (t * 60 + 360) % 360, s: s * 100, l: l * 100 };
}

export function depuisTsl(c: Tsl): Rgb {
  const s = c.s / 100, l = c.l / 100, k = (n: number) => (n + c.t / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

/**
 * CMJN naif, sans profil ICC. C'est une indication de saturation, pas une separation : seul le
 * profil de l'imprimeur (Fogra 39, Fogra 51…) donne les vraies valeurs.
 */
export function versCmjnNaif(c: Rgb): Cmjn {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255, n = 1 - Math.max(r, g, b);
  if (n >= 1) return { c: 0, m: 0, j: 0, n: 100 };
  return { c: ((1 - r - n) / (1 - n)) * 100, m: ((1 - g - n) / (1 - n)) * 100, j: ((1 - b - n) / (1 - n)) * 100, n: n * 100 };
}

export function depuisCmjnNaif(c: Cmjn): Rgb {
  const k = 1 - c.n / 100;
  return { r: Math.round(255 * (1 - c.c / 100) * k), g: Math.round(255 * (1 - c.m / 100) * k), b: Math.round(255 * (1 - c.j / 100) * k) };
}

/** Vrai si la couleur OKLCH existe en sRGB sans reduire sa saturation. */
export function dansGamutOklch(c: Oklch): boolean {
  const rad = (c.h * Math.PI) / 180;
  return dansGamut(oklabVersLineaire({ l: c.l, a: c.c * Math.cos(rad), b: c.c * Math.sin(rad) }));
}

const nombres = (t: string) => (t.match(/-?\d+(?:[.,]\d+)?/g) ?? []).map(x => parseFloat(x.replace(',', '.')));

/**
 * Lit un code de couleur dans le format ou il est ecrit : `#e8471c`, `rgb(232 71 28)`,
 * `rvb(232, 71, 28)`, `hsl(14 82% 51%)`, `tsl(…)`, `oklch(0.62 0.2 35)` (clarte en 0-1 ou en %),
 * `cmjn(0 69 88 9)` ou `cmyk(…)`. Null si le code n'est pas reconnu, jamais une couleur devinee.
 */
export function lireCode(texte: string): Rgb | null {
  const t = texte.trim().toLowerCase();
  const hex = lireHex(t);
  if (hex) return hex;
  const v = nombres(t);
  const borne = (x: number | undefined, max: number) => x !== undefined && x >= 0 && x <= max;
  if (/^(rgb|rvb)a?\s*\(/.test(t) && v.length >= 3 && v.slice(0, 3).every(x => borne(x, 255))) {
    return { r: Math.round(v[0] ?? 0), g: Math.round(v[1] ?? 0), b: Math.round(v[2] ?? 0) };
  }
  if (/^(hsl|tsl)a?\s*\(/.test(t) && v.length >= 3 && borne(v[1], 100) && borne(v[2], 100)) {
    return depuisTsl({ t: (((v[0] ?? 0) % 360) + 360) % 360, s: v[1] ?? 0, l: v[2] ?? 0 });
  }
  if (/^oklch\s*\(/.test(t) && v.length >= 3) {
    const l = t.includes('%') && (v[0] ?? 0) > 1 ? (v[0] ?? 0) / 100 : v[0] ?? 0;
    if (borne(l, 1) && borne(v[1], 0.5)) return depuisOklch({ l, c: v[1] ?? 0, h: (((v[2] ?? 0) % 360) + 360) % 360 });
  }
  if (/^(cmjn|cmyk)\s*\(/.test(t) && v.length >= 4 && v.slice(0, 4).every(x => borne(x, 100))) {
    return depuisCmjnNaif({ c: v[0] ?? 0, m: v[1] ?? 0, j: v[2] ?? 0, n: v[3] ?? 0 });
  }
  return null;
}

/** Tous les codes d'une couleur, prets a copier. */
export function codes(c: Rgb): { hex: string; rvb: string; tsl: string; oklch: string; cmjn: string } {
  const t = versTsl(c), o = versOklch(c), k = versCmjnNaif(c), r = (x: number) => Math.round(x);
  return {
    hex: versHex(c),
    rvb: 'rgb(' + r(c.r) + ' ' + r(c.g) + ' ' + r(c.b) + ')',
    tsl: 'hsl(' + r(t.t) + ' ' + r(t.s) + '% ' + r(t.l) + '%)',
    oklch: 'oklch(' + (Math.round(o.l * 1000) / 1000) + ' ' + (Math.round(o.c * 1000) / 1000) + ' ' + r(o.h) + ')',
    cmjn: 'cmjn(' + r(k.c) + ' ' + r(k.m) + ' ' + r(k.j) + ' ' + r(k.n) + ')'
  };
}
