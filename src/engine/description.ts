// Dire une forme avec des mots, pour qui ne la voit pas : son genre (rectangle, ellipse…), le nom de sa
// couleur, ses mesures. Pur : le dessin a plat en entree, du texte en sortie. Les phrases entieres
// (« Forme 3 sélectionnée : … ») sont composees dans zones/annonces.ts avec ces briques.

import { lireHex, type Rgb } from '../util/couleur.js';
import { nombre, t } from '../util/i18n.js';
import { pluriel } from '../util/texte.js';
import { ancre, boiteDe, boiteForme, estDegrade, estEllipseChemin, feuillesDe, reconnaitreFormeDeBase, type Chemin, type Degrade, type DessinSvg, type Forme, type Groupe } from './editionSvg.js';

/**
 * Un nombre dit dans la langue de l'interface, lisible a l'oreille et assez fin pour qu'un pas du clavier s'entende : deux
 * decimales sous dix, une sous mille, entier au-dela ; le separateur decimal de la locale (la virgule en francais, ADR-0042),
 * pas de zero de fin, et jamais de separateur de milliers.
 */
export function nombreFr(v: number): string {
  const a = Math.abs(v), d = a < 10 ? 100 : a < 1000 ? 10 : 1;
  const r = Math.round(v * d) / d;
  return String(Object.is(r, -0) ? 0 : r).replace('.', separateurDecimal());
}

/** Le separateur decimal de la locale courante, lu sur un nombre formate : « , » en francais, « . » en anglais. */
const separateurDecimal = (): string => nombre(0.5).replace(/\d/g, '') || '.';

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
const estEllipse = (f: Forme, tol: number): boolean => estEllipseChemin(f.d, tol);

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

/** Les natures d'une image integree, telles qu'on les dit. */
const NATURES_IMAGE: Readonly<Record<string, string>> = { png: 'PNG', jpeg: 'JPEG', gif: 'GIF', webp: 'WebP' };

/**
 * Le genre d'une forme en un mot ou deux : rectangle, ellipse, cercle, etoile, triangle, ligne, polygone, courbe, trace, et les
 * formes de base de la palette (ADR-0033 : cœur, hexagone, flèche, anneau…), reconnues sur leur geometrie comme les autres : une
 * forme ne porte pas de nom, elle garde le sien tant qu'on ne fait que la deplacer, l'etirer ou la recolorer.
 */
export function genreDeForme(f: Forme): string {
  // Un texte vivant se nomme par ce qu'il dit (ADR-0022) : « texte « Joyeux Noël » », coupe a trente caracteres.
  if (f.texte) { const texte = f.texte.texte.replace(/\s+/g, ' ').trim(); return t('texte « {texte} »', { texte: texte.length > 30 ? texte.slice(0, 29) + '…' : texte }); }
  // Une image integree (ADR-0012, etape 12) se dit par sa nature, pas par le cadre de son chemin (« rectangle ») : paquet 2-D.
  if (f.image) {
    const nature = NATURES_IMAGE[/^data:image\/(png|jpeg|gif|webp)/.exec(f.image.donnees)?.[1] ?? ''] ?? '';
    return nature ? t('image {nature}', { nature }) : t('image');
  }
  const b = boiteForme(f);
  if (!b) return t('tracé vide');
  const tol = Math.max(b.l, b.h) * 0.002 + 1e-9;
  const d = f.d, ferme = d.some(c => c.c === 'Z');
  const courbe = d.some(c => c.c === 'C' || c.c === 'Q');
  if (!courbe) {
    const n = points(d).length;
    if (!ferme) return n === 2 ? t('ligne') : t('ligne brisée');
    if (estRectangle(d, tol)) return proche(b.l, b.h, tol) ? t('carré') : t('rectangle');
    if (estEtoile(d)) return t('étoile');
    if (n === 3) return t('triangle');
    return reconnaitreFormeDeBase(d) ?? t('polygone à {n} sommets', { n });
  }
  if (ferme && estEllipse(f, tol)) return proche(b.l, b.h, tol) ? t('cercle') : t('ellipse');
  return reconnaitreFormeDeBase(d) ?? (ferme ? t('tracé courbe') : t('courbe'));
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
  if (l < 0.1) return t('noir');
  if (l > 0.93) return t('blanc');
  // Une couleur a peine teintee (ecart des canaux sous 8 %) est un gris, quelle que soit sa « saturation » HSL.
  if (c < 0.08) return l > 0.88 ? t('blanc') : l < 0.3 ? t('{nom} foncé', { nom: t('gris') }) : l > 0.7 ? t('{nom} clair', { nom: t('gris') }) : t('gris');
  const marron = h >= 15 && h < 40 && l < 0.4;
  const base = h < 15 || h >= 345 ? t('rouge') : marron ? t('marron') : h < 40 ? t('orange') : h < 70 ? t('jaune') : h < 165 ? t('vert') : h < 200 ? t('turquoise') : h < 255 ? t('bleu') : h < 290 ? t('violet') : t('rose');
  // La nuance est un gabarit : l'anglais met l'adjectif devant (« dark blue »), le francais derriere. Les noms de couleur et ces
  // gabarits sont ceux du modele (model.json) : nomsCouleurs.ts les emploie aussi.
  if (marron) return base;
  return l < 0.25 ? t('{nom} foncé', { nom: base }) : l > 0.75 ? t('{nom} clair', { nom: base }) : base;
}

/** « rouge #c81e28 » : le nom puis le code, ou le code seul si le nom manque. */
export const couleurDite = (code: string): string => {
  const nom = nomDeCouleur(code);
  return nom ? nom + ' ' + code.toLowerCase() : code.toLowerCase();
};

/**
 * « dégradé linéaire du rouge #c81e28 au bleu #1f5fb0 » (ADR-0012, annexe 6 §7) : le genre, puis la couleur du premier et du dernier
 * arret, nom avant code ; « , 3 arrêts » au-dela de deux.
 */
export function degradeDit(g: Degrade): string {
  const premier = g.arrets[0], dernier = g.arrets[g.arrets.length - 1];
  const genre = g.genre === 'lineaire' ? t('linéaire') : t('radial');
  const tete = premier && dernier ? t('dégradé {genre} du {de} au {a}', { genre, de: couleurDite(premier.couleur), a: couleurDite(dernier.couleur) }) : t('dégradé {genre}', { genre });
  return tete + (g.arrets.length > 2 ? ', ' + pluriel(g.arrets.length, 'arrêt') : '');
}

/**
 * « fond rouge #c81e28, contour noir #000000 », ou « sans fond ni contour ». Un cote peint d'un degrade (modele v2) le dit, plutot que
 * sa couleur de repli : « fond dégradé linéaire du rouge #c81e28 au bleu #1f5fb0 ». Une forme plate n'en porte jamais.
 */
export function peintureDite(f: Forme): string {
  const morceaux: string[] = [];
  const fond = estDegrade(f.peintureRemplissage) ? f.peintureRemplissage : null, trait = estDegrade(f.peintureContour) ? f.peintureContour : null;
  morceaux.push(fond ? t('fond {peinture}', { peinture: degradeDit(fond) }) : f.remplissage ? t('fond {peinture}', { peinture: couleurDite(f.remplissage) }) : t('sans fond'));
  if (trait) morceaux.push(t('contour {peinture}', { peinture: degradeDit(trait) }));
  else if (f.contour) morceaux.push(t('contour {peinture}', { peinture: couleurDite(f.contour) }));
  return morceaux.join(', ');
}

/** « 120 × 80 à 40, 60 » : la taille puis le coin haut gauche de la boite ; vide pour un tracé sans etendue. */
export function mesuresDites(f: Forme): string {
  const b = boiteForme(f);
  return b ? boiteDite(b) : '';
}

/** La taille puis le coin haut gauche d'une boite, dans la langue de l'interface. */
const boiteDite = (b: { readonly x: number; readonly y: number; readonly l: number; readonly h: number }): string =>
  t('{l} × {h} à {x}, {y}', { l: nombreFr(b.l), h: nombreFr(b.h), x: nombreFr(b.x), y: nombreFr(b.y) });

/** Le numero d'une forme, tel que l'inspecteur et les calques le disent : f12 devient 12. */
export const numeroDeForme = (f: Forme): string => f.id.slice(1);

/**
 * Le nom accessible d'une forme dans la liste des calques : « Rectangle 3, fond rouge #c81e28 ». Il commence par ce que la ligne
 * montre (le genre et le numero, WCAG 2.5.3 : le libelle visible est dans le nom), puis dit la peinture et l'etat.
 */
export function nomDeForme(f: Forme): string {
  const genre = genreDeForme(f);
  return genre.charAt(0).toUpperCase() + genre.slice(1) + ' ' + numeroDeForme(f) + ', ' + peintureDite(f) + (f.verrouille ? ', ' + t('verrouillée') : '') + (f.visible ? '' : ', ' + t('masquée'));
}

// ---------------------------------------------------------------- les groupes (ADR-0012, annexe 6 §7)

/** Le nom d'un groupe tel qu'on le dit : le sien, sinon « Groupe 3 » (le numero de son identifiant `g3`). */
export const nomDeGroupe = (g: Groupe): string => g.nom ?? t('Groupe {n}', { n: /^g(\d+)$/.exec(g.id)?.[1] ?? g.id });

/** « groupe « Nuage » », ou « groupe 3 » : un groupe nomme dans une phrase. */
export const groupeDit = (g: Groupe): string => (g.nom ? t('groupe « {nom} »', { nom: g.nom }) : nomDeGroupe(g).toLowerCase());

/** Ce que le groupe porte, dans l'ordre de l'annexe 6 §7 : « découpé, masque d’opacité, flou, ombre portée, opacité 50 % ». */
export function porteParGroupe(g: Groupe): string[] {
  const porte: string[] = [];
  if (g.decoupe) porte.push(t('découpé'));
  if (g.masque) porte.push(t('masque d’opacité'));
  if (g.effets?.flou) porte.push(t('flou'));
  if (g.effets?.ombre) porte.push(t('ombre portée'));
  if (g.opacite !== undefined && g.opacite < 1) porte.push(t('opacité {p} %', { p: Math.round(g.opacite * 100) }));
  return porte;
}

/**
 * Le detail d'un groupe : le nombre de ses formes (ses feuilles, a toute profondeur), ce qu'il porte, puis la taille et le coin de sa
 * boite : « 3 formes, ombre portée, 80 × 40 à 10, 20 ».
 */
export function detailsGroupe(d: DessinSvg, g: Groupe): string {
  const b = boiteDe(d, [g.id]);
  return [pluriel(feuillesDe(d, [g.id]).length, 'forme'), ...porteParGroupe(g), ...(b ? [boiteDite(b)] : [])].join(', ');
}

/** « groupe « Nuage », 3 formes, 80 × 40 à 10, 20 » (annexe 6 §7). */
export const groupeDecrit = (d: DessinSvg, g: Groupe): string => groupeDit(g) + ', ' + detailsGroupe(d, g);
