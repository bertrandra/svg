// L'etendue d'un trait : la boite que le contour d'une forme peint vraiment, pointes et bouts carres compris.
// La demi-epaisseur ne suffit que pour une jonction ronde ou biseautee et un bout plat ou rond : une
// jonction en pointe (`miter`) depasse du sommet de epaisseur / (2 sin(angle / 2)) tant que ce rapport
// reste sous la limite de pointe, et un bout carre prolonge le trait d'une demi-epaisseur le long de sa
// tangente (ses coins sortent donc de la boite des points d'un demi-cote). Pur.

import type { Boite, Chemin, Contenu, Forme } from './types.js';
import { boiteForme, unir } from './geometrie.js';
import { LIMITE_MITRE_DEFAUT } from './trait.js';
import { arbreDe, type NoeudArbre } from './arbre.js';
import { etendreFeuille, etendreGroupe, type Fonctionnalite } from './fonctionnalites.js';
import { FONCTIONNALITES } from './catalogue.js';

type Vec = readonly [number, number];

/** Un segment non nul d'un sous-chemin : ses extremites et les tangentes unitaires au depart et a l'arrivee. */
interface Segment { readonly a: Vec; readonly b: Vec; readonly tDebut: Vec; readonly tFin: Vec }

/** Un sous-chemin ramene a ses segments, et s'il est ferme (une fermeture a une jonction de plus, et aucun bout). */
interface SousTrace { readonly segments: readonly Segment[]; readonly ferme: boolean }

const EPS = 1e-12;

/** Le premier vecteur non nul, normalise : la tangente d'une courbe dont des points de controle se confondent. */
function premierUnitaire(candidats: readonly Vec[]): Vec | null {
  for (const [x, y] of candidats) {
    const n = Math.hypot(x, y);
    if (n > EPS) return [x / n, y / n];
  }
  return null;
}

const moins = (p: Vec, q: Vec): Vec => [p[0] - q[0], p[1] - q[1]];

/** Le segment d'une commande, ou null s'il ne trace rien (longueur nulle : aucune tangente, aucune jonction). */
function segmentDe(depart: Vec, c: { c: string; p: readonly number[] }): Segment | null {
  const pt = (k: number): Vec => [c.p[k] ?? 0, c.p[k + 1] ?? 0];
  if (c.c === 'C') {
    const [p1, p2, p3] = [pt(0), pt(2), pt(4)];
    const tDebut = premierUnitaire([moins(p1, depart), moins(p2, depart), moins(p3, depart)]);
    const tFin = premierUnitaire([moins(p3, p2), moins(p3, p1), moins(p3, depart)]);
    return tDebut && tFin ? { a: depart, b: p3, tDebut, tFin } : null;
  }
  if (c.c === 'Q') {
    const [p1, p2] = [pt(0), pt(2)];
    const tDebut = premierUnitaire([moins(p1, depart), moins(p2, depart)]);
    const tFin = premierUnitaire([moins(p2, p1), moins(p2, depart)]);
    return tDebut && tFin ? { a: depart, b: p2, tDebut, tFin } : null;
  }
  const b = pt(0), t = premierUnitaire([moins(b, depart)]);
  return t ? { a: depart, b, tDebut: t, tFin: t } : null;
}

/** Les sous-chemins d'un chemin, en segments non nuls. Un tracé apres Z repart du debut du sous-chemin fermé, comme `depart`. */
export function sousTraces(d: Chemin): SousTrace[] {
  const out: SousTrace[] = [];
  let segments: Segment[] = [], debut: Vec = [0, 0], courant: Vec = [0, 0];
  const clore = (ferme: boolean) => { if (segments.length) out.push({ segments, ferme }); segments = []; };
  for (const c of d) {
    if (c.c === 'M') {
      clore(false);
      debut = courant = [c.p[0] ?? 0, c.p[1] ?? 0];
    } else if (c.c === 'Z') {
      const s = segmentDe(courant, { c: 'L', p: debut });
      if (s) segments.push(s);
      clore(true);
      courant = debut;
    } else {
      const s = segmentDe(courant, c);
      if (s) segments.push(s);
      courant = [c.p[c.p.length - 2] ?? 0, c.p[c.p.length - 1] ?? 0];
    }
  }
  clore(false);
  return out;
}

/**
 * Le sommet de la pointe d'une jonction `miter` entre une arrivee `u` et un depart `v` (tangentes unitaires)
 * en `s`, ou null si la jonction est biseautee (rapport au-dessus de la limite) ou n'a pas de pointe (trait droit).
 * Avec theta l'angle entre les deux segments, la pointe est a e / sin(theta / 2) du sommet, du cote oppose a la
 * bissectrice interieure ; sin(theta / 2) = racine((1 + u.v) / 2), et la pointe est dans la direction de u - v.
 */
export function pointeDeJonction(s: Vec, u: Vec, v: Vec, e: number, limite: number): Vec | null {
  const sinDemi = Math.sqrt(Math.max(0, (1 + u[0] * v[0] + u[1] * v[1]) / 2));
  const dx = u[0] - v[0], dy = u[1] - v[1], n = Math.hypot(dx, dy);
  if (n < 1e-9 || sinDemi < EPS) return null;
  const rapport = 1 / sinDemi;
  // Un epsilon relatif cote prudent : a la limite exacte, mieux vaut compter une pointe de trop que d'en couper une.
  if (rapport > limite * (1 + 1e-9)) return null;
  return [s[0] + (dx / n) * e * rapport, s[1] + (dy / n) * e * rapport];
}

/** Les deux coins d'un bout carre en `p`, la tangente `t` pointant vers l'exterieur : le trait prolonge de e, large de 2e. */
function coinsBoutCarre(p: Vec, t: Vec, e: number): Vec[] {
  const nx = -t[1], ny = t[0];
  const bx = p[0] + e * t[0], by = p[1] + e * t[1];
  return [[bx + e * nx, by + e * ny], [bx - e * nx, by - e * ny]];
}

/** Les points que la pointe des jonctions et les bouts carres ajoutent a la boite des points du chemin. */
function pointsSupplementaires(f: Forme, e: number): Vec[] {
  const pointes = f.jonction === 'miter', carre = f.bout === 'square';
  if (!pointes && !carre) return [];
  const limite = f.limiteMitre ?? LIMITE_MITRE_DEFAUT;
  const pts: Vec[] = [];
  for (const { segments, ferme } of sousTraces(f.d)) {
    const n = segments.length;
    if (pointes) {
      for (let i = 0; i < (ferme ? n : n - 1); i++) {
        const s = segments[i], suivant = segments[(i + 1) % n];
        const p = s && suivant ? pointeDeJonction(s.b, s.tFin, suivant.tDebut, e, limite) : null;
        if (p) pts.push(p);
      }
    }
    const premier = segments[0], dernier = segments[n - 1];
    if (carre && !ferme && premier && dernier) {
      pts.push(...coinsBoutCarre(premier.a, [-premier.tDebut[0], -premier.tDebut[1]], e), ...coinsBoutCarre(dernier.b, dernier.tFin, e));
    }
  }
  return pts;
}

/**
 * La boite d'une forme avec son contour : la boite exacte du chemin elargie d'une demi-epaisseur, puis de
 * ce que les pointes de jonction et les bouts carres sortent en plus. Une borne prudente, jamais trop courte :
 * avec des pointilles, chaque tiret a ses propres bouts, donc un bout carre elargit de e racine de 2 partout.
 * Sans pointe ni bout carre, c'est exactement la boite d'avant (demi-epaisseur seule), au bit pres.
 */
export function boiteAvecTrait(f: Forme): Boite | null {
  const x = boiteForme(f);
  if (!x || !f.contour) return x;
  const e = f.epaisseur / 2;
  if (f.bout === 'square' && f.pointilles?.length) {
    const g = e * Math.SQRT2;
    return { x: x.x - g, y: x.y - g, l: x.l + 2 * g, h: x.h + 2 * g };
  }
  const base: Boite = { x: x.x - e, y: x.y - e, l: x.l + 2 * e, h: x.h + 2 * e };
  const pts = pointsSupplementaires(f, e);
  if (!pts.length) return base;
  let [x0, y0, x1, y1] = [base.x, base.y, base.x + base.l, base.y + base.h];
  for (const [px, py] of pts) { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); }
  // Rien ne sort : on rend la boite d'avant telle quelle, sans que la somme et la difference ne bougent un bit.
  if (x0 === base.x && y0 === base.y && x1 === base.x + base.l && y1 === base.y + base.h) return base;
  return { x: x0, y: y0, l: x1 - x0, h: y1 - y0 };
}

/**
 * La boite visuelle d'un noeud (ADR-0012, annexe 3 §2) : ce qui se voit, pour `ajusterPlan` et la region d'un filtre. Une feuille :
 * sa boite avec son trait, que chaque fonctionnalite peut elargir (ses effets) ; un groupe : l'union de ses enfants visibles, que
 * chaque fonctionnalite peut rogner (sa decoupe) ou elargir (ses effets). Les etapes 5 et 7 remplissent ces crochets
 * (`etendue.feuille`, `etendue.groupe`) sans toucher a ce fichier. null : un noeud inconnu ou sans rien de visible.
 */
export function boiteVisuelle(d: Contenu, id: string, fonctions: readonly Fonctionnalite[] = FONCTIONNALITES): Boite | null {
  const noeud = arbreDe(d).parId.get(id);
  return noeud ? boiteDuNoeud(noeud, fonctions) : null;
}

function boiteDuNoeud(n: NoeudArbre, fonctions: readonly Fonctionnalite[]): Boite | null {
  if (n.genre === 'feuille') {
    const b = boiteAvecTrait(n.forme);
    return b ? etendreFeuille(fonctions, n.forme, b) : null;
  }
  const b = unir(n.enfants.filter(e => (e.genre === 'feuille' ? e.forme.visible : e.groupe.visible)).map(e => boiteDuNoeud(e, fonctions)));
  return b ? etendreGroupe(fonctions, n.groupe, b) : null;
}
