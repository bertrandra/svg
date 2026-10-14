// Les couleurs d'une image : lues dans un SVG (les remplissages et les traits qu'il nomme) ou
// comptees dans une image (quantification par coupe mediane). Pur et deterministe : ni hasard, ni
// horloge ; la meme image rend toujours les memes couleurs dans le meme ordre. Elles nourrissent
// la palette imposee au traceur en mode « aplats ».

import { ecartPercu, lireCode, versHex, type Rgb } from '../util/couleur.js';

export interface CouleurExtraite {
  hex: string;
  /** La part de la couleur dans l'image, de 0 a 1, arrondie au millieme. */
  part: number;
}

/** En deca de cet ecart percu (OKLab), deux couleurs sont la meme teinte. */
const ECART_MEME_COULEUR = 0.06;
/** Une couleur presente a moins d'un pour cent est un anticrenelage, pas une couleur du dessin. */
const PART_MIN = 0.01;

const arrondi3 = (v: number) => Math.round(v * 1000) / 1000;

/** Regroupe les couleurs trop proches pour etre distinguees, en gardant la plus presente. */
export function fusionnerProches(couleurs: readonly CouleurExtraite[], ecart = ECART_MEME_COULEUR): CouleurExtraite[] {
  const triees = [...couleurs].sort((a, b) => b.part - a.part || a.hex.localeCompare(b.hex));
  const sortie: Array<{ rgb: Rgb; hex: string; part: number }> = [];
  for (const c of triees) {
    const rgb = lireCode(c.hex);
    if (!rgb) continue;
    const proche = sortie.find(s => ecartPercu(s.rgb, rgb) < ecart);
    if (proche) proche.part += c.part;
    else sortie.push({ rgb, hex: versHex(rgb), part: c.part });
  }
  return sortie.sort((a, b) => b.part - a.part || a.hex.localeCompare(b.hex)).map(s => ({ hex: s.hex, part: arrondi3(s.part) }));
}

const MOTS_IGNORES = new Set(['none', 'transparent', 'currentcolor', 'inherit']);

/**
 * Les couleurs nommees par un SVG : chaque `fill` et `stroke`, en attribut ou dans un `style`,
 * comptees par occurrence. Un SVG ne dit pas ses surfaces sans etre dessine ; le compte des formes
 * est l'approximation qui reste pure. Un trait compte pour moitie.
 */
export function couleursSvg(svg: string): CouleurExtraite[] {
  const poids = new Map<string, number>();
  const ajouter = (valeur: string, p: number) => {
    const v = valeur.trim().toLowerCase();
    if (!v || MOTS_IGNORES.has(v) || v.startsWith('url(')) return;
    const rgb = lireCode(v);
    if (!rgb) return;
    const hex = versHex(rgb);
    poids.set(hex, (poids.get(hex) ?? 0) + p);
  };
  for (const m of svg.matchAll(/\s(fill|stroke)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) ajouter(m[2] ?? m[3] ?? '', m[1]?.toLowerCase() === 'stroke' ? 0.5 : 1);
  for (const m of svg.matchAll(/(?:^|[;\s{"'])(fill|stroke)\s*:\s*([^;"'}]+)/gi)) ajouter(m[2] ?? '', m[1]?.toLowerCase() === 'stroke' ? 0.5 : 1);
  const total = [...poids.values()].reduce((s, v) => s + v, 0);
  if (!total) return [];
  return fusionnerProches([...poids].map(([hex, p]) => ({ hex, part: p / total }))).filter(c => c.part >= PART_MIN);
}

interface Boite { pixels: number[]; }

function etendue(pixels: readonly number[], canal: number): [number, number] {
  let min = 255, max = 0;
  for (let i = canal; i < pixels.length; i += 3) { const v = pixels[i] ?? 0; if (v < min) min = v; if (v > max) max = v; }
  return [min, max];
}

/**
 * Coupe la boite sur son canal le plus etendu, pres de la mediane mais toujours entre deux valeurs
 * distinctes : un aplat ne se partage jamais entre deux boites, dont les moyennes seraient fausses.
 * Null si la boite est uniforme.
 */
function couper(b: Boite): [Boite, Boite] | null {
  const plages = [0, 1, 2].map(c => etendue(b.pixels, c));
  const canal = plages.reduce((meilleur, p, i) => (p[1] - p[0] > (plages[meilleur]?.[1] ?? 0) - (plages[meilleur]?.[0] ?? 0) ? i : meilleur), 0);
  const plage = plages[canal];
  if (!plage || plage[1] - plage[0] === 0) return null;
  const n = b.pixels.length / 3, idx = Array.from({ length: n }, (_, i) => i);
  const v = (i: number, c: number) => b.pixels[i * 3 + c] ?? 0;
  // Tri par le canal puis par les deux autres : l'ordre ne depend jamais de l'ordre d'arrivee.
  idx.sort((x, y) => v(x, canal) - v(y, canal) || v(x, 0) - v(y, 0) || v(x, 1) - v(y, 1) || v(x, 2) - v(y, 2));
  const change = (k: number) => v(idx[k - 1] ?? 0, canal) !== v(idx[k] ?? 0, canal);
  const moitie = Math.floor(n / 2);
  let coupe = -1;
  for (let d = 0; d < n && coupe < 0; d++) {
    if (moitie - d >= 1 && change(moitie - d)) coupe = moitie - d;
    else if (moitie + d < n && change(moitie + d)) coupe = moitie + d;
  }
  if (coupe < 0) return null;
  const gauche: number[] = [], droite: number[] = [];
  idx.forEach((i, rang) => (rang < coupe ? gauche : droite).push(v(i, 0), v(i, 1), v(i, 2)));
  return [{ pixels: gauche }, { pixels: droite }];
}

function moyenne(b: Boite): Rgb {
  const n = b.pixels.length / 3;
  let r = 0, g = 0, bl = 0;
  for (let i = 0; i < b.pixels.length; i += 3) { r += b.pixels[i] ?? 0; g += b.pixels[i + 1] ?? 0; bl += b.pixels[i + 2] ?? 0; }
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(bl / n) };
}

/**
 * Les couleurs dominantes d'une image RGBA (4 octets par pixel), par coupe mediane. Les pixels
 * transparents (alpha sous `alphaMin`) ne comptent pas : une image detouree ne rend pas son ancien
 * fond. `max` boites au plus, puis fusion des teintes voisines et retrait des parts infimes.
 */
export function couleursPixels(pixels: Uint8ClampedArray, options: { max?: number; alphaMin?: number } = {}): CouleurExtraite[] {
  const max = options.max ?? 8, alphaMin = options.alphaMin ?? 128;
  const opaques: number[] = [];
  for (let i = 0; i < pixels.length; i += 4) {
    if ((pixels[i + 3] ?? 0) < alphaMin) continue;
    opaques.push(pixels[i] ?? 0, pixels[i + 1] ?? 0, pixels[i + 2] ?? 0);
  }
  if (!opaques.length) return [];
  let boites: Boite[] = [{ pixels: opaques }];
  const finies = new Set<Boite>();
  while (boites.length < max) {
    // La boite la plus peuplee qui se coupe encore ; une boite uniforme ne se coupe plus.
    const candidates = boites.filter(b => !finies.has(b));
    const b = candidates.reduce<Boite | null>((m, x) => (x.pixels.length > (m?.pixels.length ?? 0) ? x : m), null);
    if (!b) break;
    const coupe = couper(b);
    if (!coupe) { finies.add(b); continue; }
    boites = [...boites.filter(x => x !== b), ...coupe];
  }
  const total = opaques.length / 3;
  return fusionnerProches(boites.map(b => ({ hex: versHex(moyenne(b)), part: b.pixels.length / 3 / total }))).filter(c => c.part >= PART_MIN);
}
