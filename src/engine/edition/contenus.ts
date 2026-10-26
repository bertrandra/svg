// La lecture d'un contenu de definition du modele v2 (ADR-0012, etapes 5 et 6 ; annexe 1 §2 et §4, annexe 5 §2) : ce que partagent
// une decoupe (<clipPath>) et un masque (<mask>), sortis de `fonctions/decoupes.ts` a leur deuxieme emploi. Une definition se lit
// par la marche, dans le contexte que son genre choisit ; pendant qu'elle se lit, elle est « active » (y revenir est un cycle, et la
// pile des actives borne l'imbrication), et les groupes de son contenu se rangent dans une table a elle. Pur.
//
// Les identifiants : un seul espace de numeros par dessin, contenus compris (I1). Les feuilles d'un contenu sont lues par la marche,
// donc numerotees a la suite des autres ; elles quittent ensuite la liste des formes et y laissent une place vide (un trace sans
// commande, que la lecture retire a la fin, comme toute forme vide). Un groupe qu'un genre pose dans un contenu (le <clipPath>
// decoupe lui-meme, une feuille enveloppee) reserve son numero dans la table de la lecture par une place sans feuille, que
// `normaliser` retire ; un <g> du contenu (un masque en admet) est range par le lecteur des groupes dans la table de la lecture, puis
// rejoint la table du contenu en y laissant, lui aussi, une place. Le budget `NOEUDS_DEFS_MAX` vaut pour toutes les definitions lues.

import type { Noeud } from '../../util/xml.js';
import type { Marche } from './fonctionnalites.js';
import type { Pret } from './parcours.js';
import type { Boite, Forme, Groupe, Matrice } from './types.js';
import { IDENTITE } from './types.js';
import { proprietesDe, type Analyse } from './cascade.js';
import { boiteChemin, lireTransformation, multiplier, transformerChemin, translation, unir } from './geometrie.js';
import { cheminDeForme } from './elements.js';
import { cibleDe } from './clones.js';
import { NOEUDS_DEFS_MAX } from './resolution.js';

/** Les elements de forme : ce qui se dessine en un trace. */
export const FORMES: ReadonlySet<string> = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);

/** Ce qui se retient par lecture, pour toutes les definitions (decoupes, masques). */
export interface EtatContenus {
  /** Les definitions en cours de lecture (<clipPath>, <mask>), de la plus exterieure a la plus interieure : y revenir est un cycle. */
  readonly actives: Noeud[];
  /** Les tables des groupes des contenus en cours de lecture ; vide hors d'un contenu. */
  readonly tables: Map<string, Groupe>[];
  /** Le numero du groupe que le lecteur des groupes est en train de poser (le crochet `groupe` est appele avant qu'il le range). */
  enAttente: string | undefined;
  /** Les feuilles et groupes lus dans toutes les definitions (borne `NOEUDS_DEFS_MAX`). */
  noeuds: number;
  trop: boolean;
  /** Les numeros que la table de la lecture ne garde que comme places (le vrai groupe vit dans la table d'un contenu). */
  readonly places: Set<string>;
}
const etats = new WeakMap<object, EtatContenus>();

/** L'etat des contenus d'une lecture, cree a la premiere demande. */
export function etatContenus(marche: Marche): EtatContenus {
  let e = etats.get(marche.parcours);
  if (!e) { e = { actives: [], tables: [], enAttente: undefined, noeuds: 0, trop: false, places: new Set() }; etats.set(marche.parcours, e); }
  return e;
}

/** Une place vide laissee dans la liste des formes : elle garde son numero, et la lecture la retire a la fin (trace sans commande). */
export const placeVide = (id: string): Forme => ({ id, d: [], remplissage: null, contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false });

/** Une place sans feuille dans la table de la lecture : elle garde un numero de groupe, `normaliser` la retire. */
const placeGroupe = (id: string): Groupe => ({ id, visible: true, verrouille: false });

/**
 * Reserve un numero de groupe dans la table de la lecture, par une place sans feuille (que `normaliser` retire si rien ne la
 * reprend) : la table reste numerotee sans trou, et le lecteur des groupes, qui prend « taille + 1 », ne retombe jamais sur un numero
 * pris. Le groupe en attente (celui dont on lit la definition) a deja le sien.
 */
export function reserverGroupe(table: Map<string, Groupe>, etat: EtatContenus): string {
  let k = table.size + 1;
  while (table.has('g' + k) || 'g' + k === etat.enAttente) k++;
  const id = 'g' + k;
  table.set(id, placeGroupe(id));
  etat.places.add(id);
  return id;
}

// ---------------------------------------------------------------- boites (unites de boite)

/** Les boites que la lecture connait d'avance pour un element, dans son repere, par analyse (une lecture). */
const boitesConnues = new WeakMap<Analyse, Map<Noeud, Boite | null>>();

/**
 * Pose la boite d'un element dont les descendants ne disent pas ce qu'il dessine (un <text>, dont les lettres viennent d'une fonte ;
 * un <svg> imbrique, dont le contenu vit dans son viewBox) : `boiteDescendants` la rend pour lui, dans le repere demande. null : il ne
 * dessine rien (une boite plate). Etape 13c.
 */
export function poserBoiteConnue(a: Analyse, n: Noeud, b: Boite | null): void {
  let t = boitesConnues.get(a);
  if (!t) { t = new Map(); boitesConnues.set(a, t); }
  t.set(n, b);
}

/** La boite qui enferme une boite transformee (ses quatre coins). */
function boiteSousMatrice(b: Boite, m: Matrice): Boite {
  if (m[1] === 0 && m[2] === 0 && m[0] === 1 && m[3] === 1 && m[4] === 0 && m[5] === 0) return b;
  const xs: number[] = [], ys: number[] = [];
  for (const [x, y] of [[b.x, b.y], [b.x + b.l, b.y], [b.x, b.y + b.h], [b.x + b.l, b.y + b.h]] as const) {
    xs.push(m[0] * x + m[2] * y + m[4]);
    ys.push(m[1] * x + m[3] * y + m[5]);
  }
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  return { x: x0, y: y0, l: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
}

/**
 * La boite des descendants d'un element (un groupe), dans son repere : ce que `objectBoundingBox` mesure. Les formes, les images (par
 * leur cadre), les groupes et les clones <use> d'une forme ou d'un groupe comptent ; le texte et les symboles n'y entrent pas (une
 * approximation, rare : une definition en unites de boite sur un groupe qui n'en contient pas d'autre). Bornee : un groupe immense ne
 * coute pas plus.
 */
export function boiteDescendants(a: Analyse, n: Noeud, m: Matrice): Boite | null {
  // Une boite connue d'avance (un texte lu en lettres, un <svg> imbrique, etape 13c) : elle seule sait ce que l'element dessine.
  const connue = boitesConnues.get(a);
  if (connue?.has(n)) { const b = connue.get(n); return b ? boiteSousMatrice(b, m) : null; }
  let budget = 50_000;
  const vus = new Set<Noeud>();
  const boiteDe = (e: Noeud, me: Matrice, niveau: number): Boite | null => {
    if (--budget < 0 || niveau > 32) return null;
    if ((proprietesDe(a, e).display ?? '').trim() === 'none') return null;
    const t = e.attributs.transform ? lireTransformation(e.attributs.transform) : IDENTITE;
    if (!t) return null;
    const mt = multiplier(me, t);
    if (e.nom === 'g' || e.nom === 'a') return unir(e.enfants.map(x => boiteDe(x, mt, niveau + 1)));
    if (e.nom === 'use') {
      const c = cibleDe(e, a.ids);
      if (!('noeud' in c) || vus.has(c.noeud) || c.noeud.nom === 'symbol') return null;
      vus.add(c.noeud);
      const x = Number.parseFloat(e.attributs.x ?? '0'), y = Number.parseFloat(e.attributs.y ?? '0');
      const b = boiteDe(c.noeud, multiplier(mt, translation(Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0)), niveau + 1);
      vus.delete(c.noeud);
      return b;
    }
    if (e.nom === 'image') {
      // Une image compte par son cadre, quand il est donne en nombres (une largeur ou une hauteur `auto` n'y entre pas).
      const [x, y, l, h] = ['x', 'y', 'width', 'height'].map(k => Number.parseFloat(e.attributs[k] ?? (k === 'x' || k === 'y' ? '0' : '')));
      if (x === undefined || y === undefined || l === undefined || h === undefined || ![x, y].every(Number.isFinite) || !(l > 0) || !(h > 0)) return null;
      return boiteChemin(transformerChemin([{ c: 'M', p: [x, y] }, { c: 'L', p: [x + l, y] }, { c: 'L', p: [x + l, y + h] }, { c: 'L', p: [x, y + h] }, { c: 'Z', p: [] }], mt));
    }
    if (!FORMES.has(e.nom)) return null;
    const d = cheminDeForme(e);
    return d && d.length ? boiteChemin(transformerChemin(d, mt)) : null;
  };
  return unir(n.enfants.map(e => boiteDe(e, m, 0)));
}

/** La boite d'une feuille dans son repere (avant sa propre matrice, que `pret.m` porte deja) : une image par son cadre. */
export function boiteFeuille(f: Forme, n: Noeud, pret: Pret, marche: Marche): Boite | null {
  if (f.image) return { x: f.image.x, y: f.image.y, l: f.image.l, h: f.image.h };
  return marche.boiteForme(n, { ...pret, m: IDENTITE });
}

/** L'intersection de deux boites (ce qu'une decoupe ou un masque laissent voir) ; vide, une boite sans largeur ni hauteur au bord de la premiere. */
export function intersectionBoites(a: Boite, b: Boite | null): Boite {
  if (!b) return { x: a.x, y: a.y, l: 0, h: 0 };
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.l, b.x + b.l), y1 = Math.min(a.y + a.h, b.y + b.h);
  return x1 >= x0 && y1 >= y0 ? { x: x0, y: y0, l: x1 - x0, h: y1 - y0 } : { x: Math.min(Math.max(a.x, b.x), a.x + a.l), y: Math.min(Math.max(a.y, b.y), a.y + a.h), l: 0, h: 0 };
}

/** L'element et ses ancetres, du plus proche au plus lointain (borne). */
export function ancetresDe(a: Analyse, n: Noeud): Noeud[] {
  const out: Noeud[] = [];
  for (let x: Noeud | undefined = n; x && out.length < 256; x = a.parents.get(x)) out.push(x);
  return out;
}

// ---------------------------------------------------------------- lecture d'un contenu

/** Ce qu'une definition lue rend : ses feuilles (telles que la marche les a posees) et les groupes qui les portent. */
export interface ContenuLu {
  readonly feuilles: readonly Forme[];
  /** Les groupes du contenu peuples d'au moins une feuille, dans l'ordre de leur table ; vide pour un contenu plat. */
  readonly groupes: ReadonlyArray<readonly [string, Groupe]>;
}

/**
 * Lit le contenu de la definition `cible` : `lire` visite ses enfants (le genre choisit lesquels, dans quel contexte) pendant qu'elle
 * est active et que sa table `locale` recoit les groupes que le genre y pose. Ensuite les feuilles lues quittent la liste des formes
 * (leurs places restent, vides), les <g> que la marche a ranges dans la table de la lecture rejoignent la table locale (une place
 * reste), et les groupes qu'aucune feuille ne peuple partent. Au-dela du budget commun, `trop` est dit une fois et null rendu.
 * `table` : la table de la lecture (le mode riche), que l'appelant a deja vue presente.
 */
export function lireContenu(marche: Marche, etat: EtatContenus, table: Map<string, Groupe>, cible: Noeud, lire: (locale: Map<string, Groupe>) => void, trop: string): ContenuLu | null {
  const p = marche.parcours;
  etat.actives.push(cible);
  const locale = new Map<string, Groupe>();
  etat.tables.push(locale);
  const avant = p.formes.length;
  try {
    lire(locale);
  } finally {
    etat.tables.pop();
    etat.actives.pop();
  }
  const feuilles: Forme[] = [];
  for (let i = avant; i < p.formes.length; i++) {
    const f = p.formes[i];
    if (!f) continue;
    if (f.d.length) feuilles.push(f);
    p.formes[i] = placeVide(f.id);
  }
  // Les groupes qui portent une feuille, en remontant ses parents : dans la table locale d'abord, puis dans celle de la lecture (un <g>
  // du contenu, que le lecteur des groupes y a range) ; ce dernier rejoint la table locale, et sa place reste dans celle de la lecture.
  const peuples = new Set<string>();
  for (const f of feuilles) {
    for (let g = f.parent; g !== undefined && !peuples.has(g);) {
      let x = locale.get(g);
      if (!x && !etat.places.has(g)) {
        x = table.get(g);
        if (x) { locale.set(g, x); table.set(g, placeGroupe(g)); etat.places.add(g); }
      }
      if (!x) break;
      peuples.add(g);
      g = x.parent;
    }
  }
  const groupes = [...locale].filter(([id]) => peuples.has(id));
  etat.noeuds += feuilles.length + groupes.length;
  if (etat.noeuds > NOEUDS_DEFS_MAX) {
    if (!etat.trop) marche.refuser(trop);
    etat.trop = true;
    return null;
  }
  return { feuilles, groupes };
}
