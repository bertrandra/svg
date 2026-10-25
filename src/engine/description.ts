// Dire une forme avec des mots, pour qui ne la voit pas : son genre (rectangle, ellipse…), le nom de sa
// couleur, ses mesures. Pur : le dessin a plat en entree, du texte en sortie. Les phrases entieres
// (« Forme 3 sélectionnée : … ») sont composees dans zones/annonces.ts avec ces briques.

import { lireHex, type Rgb } from '../util/couleur.js';
import { ancre, boiteForme, type Chemin, type Forme } from './editionSvg.js';

/**
 * Un nombre en francais, lisible a l'oreille et assez fin pour qu'un pas du clavier s'entende : deux decimales
 * sous dix, une sous mille, entier au-dela ; la virgule, et pas de zero de fin.
 */
export function nombreFr(v: number): string {
  const a = Math.abs(v), d = a < 10 ? 100 : a < 1000 ? 10 : 1;
  const r = Math.round(v * d) / d;
  return String(Object.is(r, -0) ? 0 : r).replace('.', ',');
}

const proche = (a: number, b: number, tolerance: number): boolean => Math.abs(a - b) <= tolerance;

/** Les points (ancres) d'un chemin, sans la fermeture. */
const points = (d: Chemin): [number, number][] => d.flatMap(c => { const a = ancre(c); return a ? [a] : []; });

function estRectangle(d: Chemin, tol: number): boolean {
  if (d.some(c => c.c !== 'M' && c.c !== 'L' && c.c !== 'Z')) return false;
  let p = points(d);
  // Un rectangle ecrit en revenant a son point de depart garde un cinquieme point, le meme que le premier.
  const [p0, dernier] = [p[0], p[p.length - 1]];
  if (p.length === 5 && p0 && dernier && proche(p0[0], dernier[0], tol) && proche(p0[1], dernier[1], tol)) p = p.slice(0, 4);
  if (p.length !== 4) return false;
  return p.every((a, i) => {
    const b = p[(i + 1) % 4];
    return !!b && (proche(a[0], b[0], tol) || proche(a[1], b[1], tol));
  });
}

/** Quatre cubiques dont les extremites sont les milieux des quatre bords de la boite : ce que trace l'outil ellipse. */
function estEllipse(f: Forme, tol: number): boolean {
  const d = f.d, b = boiteForme(f);
  if (!b || d.filter(c => c.c === 'C').length !== 4 || d.some(c => c.c !== 'M' && c.c !== 'C' && c.c !== 'Z')) return false;
  const cx = b.x + b.l / 2, cy = b.y + b.h / 2;
  const p = points(d).slice(0, 4);
  const surAxe = p.filter(a => proche(a[0], cx, tol) || proche(a[1], cy, tol)).length;
  const aMilieuX = p.filter(a => proche(a[0], cx, tol)).length, aMilieuY = p.filter(a => proche(a[1], cy, tol)).length;
  return surAxe === 4 && aMilieuX === 2 && aMilieuY === 2;
}

/** Dix sommets dont les rayons alternent : ce que trace l'outil etoile. */
function estEtoile(d: Chemin): boolean {
  const p = points(d);
  if (p.length !== 10 || d.some(c => c.c !== 'M' && c.c !== 'L' && c.c !== 'Z')) return false;
  // Le centre est la moyenne des sommets : la boite d'une etoile a cinq branches n'est pas centree sur elle.
  const centre = [p.reduce((s, a) => s + a[0], 0) / p.length, p.reduce((s, a) => s + a[1], 0) / p.length] as const;
  const r = p.map(a => Math.hypot(a[0] - centre[0], a[1] - centre[1]));
  const pairs = r.filter((_, i) => i % 2 === 0), impairs = r.filter((_, i) => i % 2 === 1);
  const moy = (t: number[]) => t.reduce((s, v) => s + v, 0) / t.length;
  const [mp, mi] = [moy(pairs), moy(impairs)];
  return mp > 0 && mi > 0 && Math.abs(mp - mi) > 0.2 * Math.max(mp, mi)
    && pairs.every(v => proche(v, mp, 0.1 * mp)) && impairs.every(v => proche(v, mi, 0.1 * mi));
}

/** Le genre d'une forme en un mot ou deux : rectangle, ellipse, cercle, etoile, triangle, ligne, polygone, courbe, trace. */
export function genreDeForme(f: Forme): string {
  // Un texte vivant se nomme par ce qu'il dit (ADR-0021) : « texte « Joyeux Noël » », coupe a trente caracteres.
  if (f.texte) { const t = f.texte.texte.replace(/\s+/g, ' ').trim(); return 'texte « ' + (t.length > 30 ? t.slice(0, 29) + '…' : t) + ' »'; }
  const b = boiteForme(f);
  if (!b) return 'tracé vide';
  const tol = Math.max(b.l, b.h) * 0.002 + 1e-9;
  const d = f.d, ferme = d.some(c => c.c === 'Z');
  const courbe = d.some(c => c.c === 'C' || c.c === 'Q');
  if (!courbe) {
    const n = points(d).length;
    if (!ferme) return n === 2 ? 'ligne' : 'ligne brisée';
    if (estRectangle(d, tol)) return proche(b.l, b.h, tol) ? 'carré' : 'rectangle';
    if (estEtoile(d)) return 'étoile';
    return n === 3 ? 'triangle' : 'polygone à ' + n + ' sommets';
  }
  if (ferme && estEllipse(f, tol)) return proche(b.l, b.h, tol) ? 'cercle' : 'ellipse';
  return ferme ? 'tracé courbe' : 'courbe';
}

// Les noms de couleur : assez pour que « rouge #c81e28 » dise quelque chose a qui n'a que l'oreille.
function teinteDe({ r, g, b }: Rgb): { h: number; c: number; l: number } {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2, e = max - min;
  if (e === 0) return { h: 0, c: 0, l };
  const h = max === R ? ((G - B) / e + (G < B ? 6 : 0)) : max === G ? (B - R) / e + 2 : (R - G) / e + 4;
  return { h: h * 60, c: e, l };
}

/** Le nom d'une couleur « #rrggbb » en francais (rouge, bleu clair, gris foncé…) ; null si ce n'est pas un code lisible. */
export function nomDeCouleur(code: string): string | null {
  const rgb = lireHex(code);
  if (!rgb) return null;
  const { h, c, l } = teinteDe(rgb);
  if (l < 0.1) return 'noir';
  if (l > 0.93) return 'blanc';
  // Une couleur a peine teintee (ecart des canaux sous 8 %) est un gris, quelle que soit sa « saturation » HSL.
  if (c < 0.08) return l > 0.88 ? 'blanc' : l < 0.3 ? 'gris foncé' : l > 0.7 ? 'gris clair' : 'gris';
  const base = h < 15 || h >= 345 ? 'rouge' : h < 40 ? (l < 0.4 ? 'marron' : 'orange') : h < 70 ? 'jaune' : h < 165 ? 'vert' : h < 200 ? 'turquoise' : h < 255 ? 'bleu' : h < 290 ? 'violet' : 'rose';
  const nuance = l < 0.25 ? ' foncé' : l > 0.75 ? ' clair' : '';
  return base + (base === 'marron' ? '' : nuance);
}

/** « rouge #c81e28 » : le nom puis le code, ou le code seul si le nom manque. */
export const couleurDite = (code: string): string => {
  const nom = nomDeCouleur(code);
  return nom ? nom + ' ' + code.toLowerCase() : code.toLowerCase();
};

/** « fond rouge #c81e28, contour noir #000000 », ou « sans fond ni contour ». */
export function peintureDite(f: Forme): string {
  const morceaux: string[] = [];
  morceaux.push(f.remplissage ? 'fond ' + couleurDite(f.remplissage) : 'sans fond');
  if (f.contour) morceaux.push('contour ' + couleurDite(f.contour));
  return morceaux.join(', ');
}

/** « 120 × 80 à 40, 60 » : la taille puis le coin haut gauche de la boite ; vide pour un tracé sans etendue. */
export function mesuresDites(f: Forme): string {
  const b = boiteForme(f);
  return b ? nombreFr(b.l) + ' × ' + nombreFr(b.h) + ' à ' + nombreFr(b.x) + ', ' + nombreFr(b.y) : '';
}

/** Le numero d'une forme, tel que l'inspecteur et les calques le disent : f12 devient 12. */
export const numeroDeForme = (f: Forme): string => f.id.slice(1);

/**
 * Le nom accessible d'une forme dans la liste des calques : « Rectangle 3, fond rouge #c81e28 ». Il commence par ce que la ligne
 * montre (le genre et le numero, WCAG 2.5.3 : le libelle visible est dans le nom), puis dit la peinture et l'etat.
 */
export function nomDeForme(f: Forme): string {
  const genre = genreDeForme(f);
  return genre.charAt(0).toUpperCase() + genre.slice(1) + ' ' + numeroDeForme(f) + ', ' + peintureDite(f) + (f.verrouille ? ', verrouillée' : '') + (f.visible ? '' : ', masquée');
}
