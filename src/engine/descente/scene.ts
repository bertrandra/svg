// La scene native (ADR-0012, etape 13a) : ce qu'un exporteur qui sait ecrire lui-meme des degrades, des images, des decoupes ou des
// masques (le PDF : `shading`, XObject image, chemin de decoupe `W n`, masque doux) recoit de la descente, au lieu de les voir
// approches. Un exporteur ne lit jamais `groupes` ni un champ v2 (annexe 5 §4) : `aplatirPour` lui donne, en plus du `DessinPlat`,
// cet arbre deja resolu — des feuilles plates (leur degrade a part, son domaine calcule), des images posees, et des « portees », la
// ou un groupe decoupe ou masque enferme ses enfants. Le reste suit la descente d'aujourd'hui : l'opacite des groupes multipliee sur
// les feuilles, les groupes masques et leurs feuilles absents, les effets deja abandonnes par leur regle.
//
// La scene se construit juste avant la regle des groupes (qui fond la table) ; ce qu'elle porte quitte alors le dessin, sans phrase :
// l'exporteur l'ecrit. Un dessin sans rien de natif n'a pas de scene : son export ne change pas d'un octet. Pure.

import { ancetres, boiteAvecTrait, boiteChemin, seCroisent, visibleEffectif, type Boite, type Chemin, type Decoupe, type Degrade, type DessinSvg, type Forme, type Groupe, type ImageIntegree, type Masque } from '../editionSvg.js';
import { estDegrade } from '../edition/degrades.js';
import { cheminDeRegion, cheminLisseDeRegion, toleranceBooleen } from '../booleens.js';
import { decoupeCourbe, regionDecoupe } from './decoupes.js';
import type { MultiPolygon } from 'polygon-clipping';
import type { Capacites } from '../aplatir.js';

/** Un degrade a peindre nativement, et le domaine de son parametre a couvrir : [0, 1] etale aux bords, [k0, k1] entiers s'il se repete. */
export interface PeintureScene {
  readonly degrade: Degrade;
  readonly domaine: readonly [number, number];
}

/** Une feuille plate (aucun champ v2), son opacite composee avec celle de ses groupes ; son degrade de fond ou de trait a part. */
export interface FeuilleScene {
  readonly genre: 'forme';
  readonly forme: Forme;
  readonly fond?: PeintureScene;
  readonly trait?: PeintureScene;
}

/** Une image integree, son opacite composee avec celle de ses groupes. */
export interface ImageScene {
  readonly genre: 'image';
  readonly source: ImageIntegree;
  readonly opacite: number;
}

/** Un chemin de decoupe, dans le repere du plan ; vide : rien n'est dessine. */
export interface DecoupeScene {
  readonly d: Chemin;
  readonly regle: 'nonzero' | 'evenodd';
}

/** Un masque d'opacite : son contenu, deja une scene, et sa region (boite du plan). */
export interface MasqueScene {
  readonly type: 'luminance' | 'alpha';
  readonly region: Boite;
  readonly contenu: Scene;
}

/**
 * Un groupe decoupe, masque, ou translucide (une opacite qui ne se compose pas exactement sur ses feuilles, parce qu'elles se
 * recouvrent : un groupe de transparence) : ses enfants, peints sous la decoupe, le masque et l'opacite ; `boite`, l'etendue de ses
 * feuilles (traits compris) dans le plan, pour le groupe de transparence.
 */
export interface PorteeScene {
  readonly genre: 'portee';
  readonly decoupe?: DecoupeScene;
  readonly masque?: MasqueScene;
  readonly opacite?: number;
  readonly boite?: Boite;
  readonly enfants: readonly NoeudScene[];
}

// Un motif de pavage (`/Pattern` de type 1 dans le PDF) entrera ici avec l'etape 9, comme une peinture de plus (`PeintureScene`).
export type NoeudScene = FeuilleScene | ImageScene | PorteeScene;

export interface Scene { readonly noeuds: readonly NoeudScene[] }

/** Ce que la scene approche encore, a dire a l'export. */
export const MSG_SCENE = {
  decoupe: 'une découpe faite de formes qui se recouvrent (son bord est recalculé, les courbes rebâties)',
  periodes: 'un dégradé répété trop de fois pour ce format (prolongé par ses couleurs de bord)'
} as const;

/** Au-dela, un degrade repete ou reflechi est prolonge par ses bords (une fonction de plus par periode). */
export const PERIODES_MAX = 256;

/** Ce qu'il faut pour descendre le contenu d'un masque : la descente elle-meme (passee par `aplatir.ts`, sans cycle d'import). */
export type SousDescente = (d: DessinSvg) => { readonly dessin: DessinSvg; readonly scene?: Scene; readonly pertes: readonly string[]; readonly perdus: readonly string[] };

export interface SceneConstruite {
  /** null quand rien de natif ne se voit : l'exporteur ecrit alors le dessin plat, comme avant. */
  readonly scene: Scene | null;
  /** Le dessin sans ce que la scene porte : la suite de la descente le rend plat. */
  readonly reste: DessinSvg;
  readonly pertes: readonly string[];
  readonly perdus: readonly string[];
}

const aPropre = (o: object, cle: string): boolean => Object.prototype.hasOwnProperty.call(o, cle);
const appliquer = (m: readonly number[], x: number, y: number): [number, number] => [(m[0] ?? 1) * x + (m[2] ?? 0) * y + (m[4] ?? 0), (m[1] ?? 0) * x + (m[3] ?? 1) * y + (m[5] ?? 0)];

function inverse(m: readonly number[]): number[] | null {
  const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = m, det = a * d - b * c;
  if (!(Math.abs(det) > 0) || !Number.isFinite(det)) return null;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

/**
 * Le domaine du parametre d'un degrade sur une boite du plan : [0, 1] s'il s'etale a ses bords ; les periodes entieres qui couvrent la
 * boite s'il se repete ou se reflechit (un radial ne recule pas sous son foyer) ; null au-dela de `PERIODES_MAX`.
 */
export function domaineDegrade(deg: Degrade, b: Boite | null): readonly [number, number] | null {
  if (!deg.etalement || !b) return [0, 1];
  const inv = deg.matrice ? inverse(deg.matrice) : null;
  if (deg.matrice && !inv) return [0, 1];
  const coins = [[b.x, b.y], [b.x + b.l, b.y], [b.x, b.y + b.h], [b.x + b.l, b.y + b.h]].map(([x = 0, y = 0]) => (inv ? appliquer(inv, x, y) : [x, y] as [number, number]));
  let k0 = 0, k1 = 1;
  if (deg.genre === 'lineaire') {
    const vx = deg.x2 - deg.x1, vy = deg.y2 - deg.y1, v2 = vx * vx + vy * vy;
    if (!(v2 > 0)) return [0, 1];
    const t = coins.map(([x, y]) => ((x - deg.x1) * vx + (y - deg.y1) * vy) / v2);
    k0 = Math.floor(Math.min(...t)); k1 = Math.max(k0 + 1, Math.ceil(Math.max(...t)));
  } else {
    const fx = deg.fx ?? deg.cx, fy = deg.fy ?? deg.cy, fr = deg.fr ?? 0;
    const dx = deg.cx - fx, dy = deg.cy - fy, dr = deg.r - fr, a = dx * dx + dy * dy - dr * dr;
    let tmax = 1;
    for (const [x, y] of coins) {
      // |q - t d| = fr + t dr : la plus grande racine ou le cercle de parametre t passe par le coin.
      const qx = x - fx, qy = y - fy, bb = -2 * (qx * dx + qy * dy + fr * dr), c = qx * qx + qy * qy - fr * fr;
      const racines = Math.abs(a) < 1e-12 ? (Math.abs(bb) > 1e-12 ? [-c / bb] : []) : (() => { const disc = bb * bb - 4 * a * c; return disc < 0 ? [] : [(-bb + Math.sqrt(disc)) / (2 * a), (-bb - Math.sqrt(disc)) / (2 * a)]; })();
      for (const t of racines) if (Number.isFinite(t) && fr + t * dr >= 0) tmax = Math.max(tmax, t);
    }
    k1 = Math.ceil(tmax);
  }
  return k1 - k0 > PERIODES_MAX ? null : [k0, k1];
}

/** Le chemin de decoupe d'un groupe : exact pour une forme, ou des formes qui ne se touchent pas ; recalcule par les booleens sinon. */
function cheminDecoupe(dec: Decoupe, tolerance: number, memo: Map<Decoupe, MultiPolygon>): DecoupeScene & { readonly approche: boolean } {
  const c = dec.contenu;
  const feuilles = c.formes.filter(f => f.d.length && visibleEffectif(c, f.id));
  const premiere = feuilles[0];
  if (!premiere) return { d: [], regle: 'nonzero', approche: false };
  const table = c.groupes;
  const imbriquee = !!table && feuilles.some(f => ancetres(c, f.id).some(a => aPropre(table, a) && table[a]?.decoupe));
  if (!imbriquee) {
    if (feuilles.length === 1) return { d: premiere.d, regle: premiere.regle, approche: false };
    // Des formes de meme regle qui ne se touchent pas : leurs sous-chemins mis bout a bout dessinent leur union, a l'identique.
    const boites = feuilles.map(f => boiteChemin(f.d));
    const separees = boites.every((b, i) => b && boites.every((x, j) => j <= i || (x && !seCroisent(b, x))));
    if (separees && feuilles.every(f => f.regle === premiere.regle)) return { d: feuilles.flatMap(f => f.d), regle: premiere.regle, approche: false };
  }
  const region = regionDecoupe(dec, tolerance, memo), courbe = decoupeCourbe(dec);
  return { d: courbe ? cheminLisseDeRegion(region, tolerance) : cheminDeRegion(region), regle: 'nonzero', approche: courbe };
}

/** L'etendue de feuilles, traits compris (une image par son rectangle). */
function boiteDes(fs: readonly Forme[]): Boite {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of fs) {
    const b = boiteAvecTrait(f);
    if (!b) continue;
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.l); y1 = Math.max(y1, b.y + b.h);
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, l: x1 - x0, h: y1 - y0 } : { x: 0, y: 0, l: 0, h: 0 };
}

type Natifs = { readonly degrades: boolean; readonly images: boolean; readonly decoupes: boolean; readonly masques: boolean; readonly groupes: boolean };

/**
 * Le dessin sans ce que l'exporteur ecrit lui-meme : ni les degrades ou les images (s'ils sont natifs), ni les decoupes ou les masques
 * des groupes, ni leur opacite quand la scene la porte (`opacites`). Un motif reste : le filet le dit.
 */
function sans(d: DessinSvg, n: Natifs, opacites: boolean): DessinSvg {
  const formes = d.formes.flatMap((f): Forme[] => {
    if (n.images && f.image) return [];
    if (!n.degrades || (!estDegrade(f.peintureRemplissage) && !estDegrade(f.peintureContour))) return [f];
    const x: Record<string, unknown> = { ...f };
    if (estDegrade(f.peintureRemplissage)) delete x.peintureRemplissage;
    if (estDegrade(f.peintureContour)) delete x.peintureContour;
    return [x as unknown as Forme];
  });
  const table = d.groupes, sansOpacite = opacites && n.groupes;
  if (!table || !(n.decoupes || n.masques || sansOpacite)) return { ...d, formes };
  const groupes: Record<string, Groupe> = {};
  for (const [k, g] of Object.entries(table)) {
    const { decoupe, masque: m, opacite: o, ...nu } = g;
    groupes[k] = { ...nu, ...(decoupe && !n.decoupes ? { decoupe } : {}), ...(m && !n.masques ? { masque: m } : {}), ...(o !== undefined && !sansOpacite ? { opacite: o } : {}) };
  }
  return { ...d, formes, groupes };
}

/** Les feuilles visibles d'un dessin plat, en scene (le contenu plat d'un masque). */
const scenePlate = (d: DessinSvg): Scene => ({ noeuds: d.formes.filter(f => f.visible).map(forme => ({ genre: 'forme', forme })) });

/**
 * La scene native d'un dessin descendu jusqu'aux groupes, pour un exporteur de ces capacites ; null s'il n'y declare rien de natif
 * (degrades, images, decoupes, masques) ou si le dessin n'en porte pas de visible : la descente continue alors comme avant.
 */
export function sceneNative(d: DessinSvg, capacites: Capacites, sousDescente: SousDescente): SceneConstruite | null {
  const n: Natifs = {
    degrades: capacites.degrades === 'natif', images: capacites.images === 'natif', decoupes: capacites.decoupes === 'natif', masques: capacites.masques === 'natif',
    groupes: capacites.groupes === 'natif'
  };
  if (!n.degrades && !n.images && !n.decoupes && !n.masques && !n.groupes) return null;
  const table = d.groupes;
  const groupe = (id: string): Groupe | undefined => (table && aPropre(table, id) ? table[id] : undefined);
  const visibles = d.formes.filter(f => f.visible && visibleEffectif(d, f.id));
  // Les feuilles visibles de chaque groupe, pour savoir si son opacite se compose exactement sur elles (une seule, qui ne se recouvre
  // pas elle-meme : fond ou trait) ou demande un groupe de transparence.
  const sous = new Map<string, Forme[]>();
  for (const f of visibles) for (const a of f.parent === undefined ? [] : ancetres(d, f.id)) { const t = sous.get(a); if (t) t.push(f); else sous.set(a, [f]); }
  const transparence = (g: Groupe): boolean => {
    if (!n.groupes || g.opacite === undefined || !(g.opacite < 1)) return false;
    const fs = sous.get(g.id) ?? [], [seule] = fs;
    return fs.length > 1 || (!!seule && seule.remplissage !== null && seule.contour !== null && seule.epaisseur > 0);
  };
  const enPortee = (g: Groupe | undefined): boolean => !!g && ((n.decoupes && !!g.decoupe) || (n.masques && !!g.masque) || transparence(g));
  const utile = visibles.some(f => (n.degrades && (estDegrade(f.peintureRemplissage) || estDegrade(f.peintureContour))) || (n.images && f.image)
    || (f.parent !== undefined && ancetres(d, f.id).some(a => enPortee(groupe(a)))));
  // Rien de natif ne se voit : pas de scene ; ce qui est natif mais cache part sans phrase (le filet le dirait perdu), l'opacite des
  // groupes reste a la regle des groupes (le PDF d'avant).
  if (!utile) return { scene: null, reste: sans(d, n, false), pertes: [], perdus: [] };

  const pertes: string[] = [], perdus: string[] = [];
  const dire = (p: string, perdu = false) => { if (!pertes.includes(p)) pertes.push(p); if (perdu && !perdus.includes(p)) perdus.push(p); };
  const tolerance = toleranceBooleen(d), memo = new Map<Decoupe, MultiPolygon>();

  const peinture = (deg: Degrade, f: Forme): PeintureScene => {
    const domaine = domaineDegrade(deg, boiteAvecTrait(f));
    if (domaine) return { degrade: deg, domaine };
    dire(MSG_SCENE.periodes);
    const { etalement: _e, ...sans } = deg;
    void _e;
    return { degrade: sans as Degrade, domaine: [0, 1] };
  };

  const masque = (m: Masque): MasqueScene => {
    const c = m.contenu;
    const sous = sousDescente({ vb: d.vb, formes: c.formes, ...(c.groupes ? { groupes: c.groupes } : {}) });
    for (const p of sous.pertes) dire(p, sous.perdus.includes(p));
    return { type: m.type, region: m.region, contenu: sous.scene ?? scenePlate(sous.dessin) };
  };

  const portee = (g: Groupe): PorteeScene & { enfants: NoeudScene[] } => {
    let decoupe: DecoupeScene | undefined;
    if (n.decoupes && g.decoupe) {
      const c = cheminDecoupe(g.decoupe, tolerance, memo);
      if (c.approche) dire(MSG_SCENE.decoupe);
      decoupe = { d: c.d, regle: c.regle };
    }
    const opaque = transparence(g) ? { opacite: g.opacite ?? 1, boite: boiteDes(sous.get(g.id) ?? []) } : {};
    return { genre: 'portee', ...(decoupe ? { decoupe } : {}), ...(n.masques && g.masque ? { masque: masque(g.masque) } : {}), ...opaque, enfants: [] };
  };

  const racine: NoeudScene[] = [];
  const pile: { readonly id: string; readonly enfants: NoeudScene[] }[] = [];
  for (const f of visibles) {
    const chaine = f.parent === undefined ? [] : ancetres(d, f.id);
    // Les portees qui enferment la feuille, de la plus exterieure a la plus interieure ; les groupes sont contigus (`normaliser`).
    const portees = chaine.filter(a => enPortee(groupe(a))).reverse();
    let k = 0;
    while (k < pile.length && k < portees.length && pile[k]?.id === portees[k]) k++;
    pile.length = k;
    for (; k < portees.length; k++) {
      const id = portees[k] ?? '', g = groupe(id);
      if (!g) break;
      const p = portee(g);
      (pile[pile.length - 1]?.enfants ?? racine).push(p);
      pile.push({ id, enfants: p.enfants });
    }
    // L'opacite d'un groupe de transparence est a lui ; celle des autres groupes se compose sur la feuille (exact : elle y est seule).
    let opacite = f.opacite;
    for (const a of chaine) { const g = groupe(a), o = g?.opacite; if (g && o !== undefined && o < 1 && !transparence(g)) opacite *= o; }
    opacite = Math.round(opacite * 1000) / 1000;
    const cible = pile[pile.length - 1]?.enfants ?? racine;
    if (f.image) { if (n.images) cible.push({ genre: 'image', source: f.image, opacite }); continue; }
    const { parent: _p, peintureRemplissage, peintureContour, effets: _e, image: _i, ...plate } = f;
    void _p; void _e; void _i;
    const fond = n.degrades && estDegrade(peintureRemplissage) && f.remplissage !== null ? peinture(peintureRemplissage, f) : undefined;
    const trait = n.degrades && estDegrade(peintureContour) && f.contour !== null && f.epaisseur > 0 ? peinture(peintureContour, f) : undefined;
    cible.push({ genre: 'forme', forme: opacite !== f.opacite ? { ...plate, opacite } : plate, ...(fond ? { fond } : {}), ...(trait ? { trait } : {}) });
  }

  return { scene: { noeuds: racine }, reste: sans(d, n, true), pertes, perdus };
}
