// Le rendu generique de la toile pour un dessin riche (ADR-0012, annexe 8, etape 2, paquet A) : ce qui se voit est ce qui s'ecrit.
// La toile ne connait aucune fonctionnalite : elle demande ici, pour chaque feuille et chaque groupe, ce que les crochets d'ecriture
// du catalogue (fonctionnalites.ts) en ecriraient (la feuille peinte, ses attributs, l'element d'une image, les attributs d'un
// groupe) et le contenu de <defs> que ces ecrivains deposent dans le recueil. Une etape qui ajoute une fonctionnalite (decoupes,
// masques, effets, motifs) l'ajoute au catalogue et la voit sur la toile sans retoucher celle-ci.
//
// Un dessin plat ne passe jamais par ici : la toile garde pour lui son rendu d'avant, au noeud et au pixel pres (estPlat).
//
// Memoire (ADR-0008) : ce qu'une feuille ou un groupe rend ne depend que de lui (un objet immuable) ; on le garde par objet, avec
// les definitions qu'il a deposees. Un recueil par dessin les reunit dans l'ordre de l'arbre ; leurs identifiants viennent de
// l'empreinte de leur texte (definitions.ts), donc ceux d'une feuille rendue seule sont ceux du dessin entier, sauf collision
// d'empreinte (de l'ordre de 10^-7) : le dessin est alors rendu d'un seul tenant, sans memoire, avec le recueil de l'ecriture.

import { decoderEntites } from '../../util/xml.js';
import type { Contenu, DessinSvg, Forme, Groupe } from './types.js';
import { arbreDe, type NoeudArbre } from './arbre.js';
import { idDefinition, recueil, type Definition, type Recueil } from './definitions.js';
import { attributsTries, type ContexteEcriture, type Fonctionnalite } from './fonctionnalites.js';
import { ecrireCorps, type EcrivainFeuilles } from './ecritureRiche.js';
import { ecrireForme } from './ecriture.js';
import { FONCTIONNALITES } from './catalogue.js';

/** Un attribut tel que l'ecriture le poserait, nom et valeur decodee : la toile le traduit en propriete de React. */
export type AttributRendu = readonly [nom: string, valeur: string];

/**
 * Ce qu'une feuille rend : un chemin (la feuille telle qu'elle s'ecrit, peinture `url(#…)` comprise, et ses attributs v2), ou
 * l'element entier d'une feuille qui n'est pas un chemin (une image), en balisage SVG.
 */
export type RenduFeuille =
  | { readonly genre: 'chemin'; readonly forme: Forme; readonly attributs: readonly AttributRendu[] }
  | { readonly genre: 'element'; readonly balisage: string };

/** Ce qu'un groupe rend : les attributs de son <g> (opacite, decoupe, masque, filtre, nom). */
export interface RenduGroupe { readonly attributs: readonly AttributRendu[] }

export interface RenduDessin {
  /** Le rendu d'une feuille du dessin (memorise par feuille). */
  feuille(f: Forme): RenduFeuille;
  /** Le rendu d'un groupe du dessin (memorise par groupe). */
  groupe(g: Groupe): RenduGroupe;
  /** Le contenu de <defs>, sans la balise, dans l'ordre de l'arbre ; '' sans definition. */
  readonly definitions: string;
}

/** La precision des nombres que la toile ecrit (celle des chemins de la toile, `cheminDe`). */
export const PRECISION_RENDU = 3;

const ATTRIBUT = /\s([A-Za-z_:][-\w:.]*)="([^"]*)"/g;

/** Les attributs d'un texte ecrit (` opacity="0.5" data-ed-nom="…"`), valeurs decodees. */
export function lireAttributs(texte: string): AttributRendu[] {
  const out: AttributRendu[] = [];
  for (const m of texte.matchAll(ATTRIBUT)) out.push([m[1] ?? '', decoderEntites(m[2] ?? '')]);
  return out;
}

/** Un contenu imbrique (decoupe, masque, tuile) s'ecrit pour la toile sans les liens des textes poses : ils n'y dessinent rien. */
const ecrivain: EcrivainFeuilles = () => f => ecrireForme(f, PRECISION_RENDU);

interface Rendu<T> { readonly rendu: T; readonly definitions: readonly Definition[] }

/** Un recueil qui note ce qu'on y depose et rend l'identifiant d'empreinte, sans suffixe : celui d'une feuille rendue seule. */
function recueilNote(notees: Definition[]): Recueil {
  return {
    poser(d) {
      notees.push(d);
      return idDefinition(d.genre, d.balise + d.attributs + (d.enfants ? '>' + d.enfants + '</' + d.balise + '>' : '/>'));
    },
    ecrire: () => ''
  };
}

/** Le contexte d'ecriture d'un rendu : la precision de la toile, un recueil, et le corps d'un contenu ecrit comme le ferait l'ecriture. */
function contexte(vb: DessinSvg['vb'], definitions: Recueil, fonctions: readonly Fonctionnalite[]): ContexteEcriture {
  const ctx: ContexteEcriture = {
    precision: PRECISION_RENDU, definitions,
    contenu: (c: Contenu) => ecrireCorps({ ...c, vb }, ctx, ecrivain, fonctions, () => undefined).texte
  };
  return ctx;
}

/** Le rendu d'une feuille, comme `ecrireCorps` l'ecrirait : un element d'une fonctionnalite, sinon la feuille peinte et ses attributs. */
function rendreFeuille(f: Forme, ctx: ContexteEcriture, fonctions: readonly Fonctionnalite[]): RenduFeuille {
  for (const k of fonctions) {
    const e = k.ecriture?.elementFeuille?.(f, ctx);
    if (e !== null && e !== undefined) return { genre: 'element', balisage: e };
  }
  const forme = fonctions.reduce<Forme>((v, k) => k.ecriture?.peindreFeuille?.(v, ctx) ?? v, f);
  return { genre: 'chemin', forme, attributs: lireAttributs(attributsTries(fonctions.flatMap(k => k.ecriture?.attributsFeuille?.(f, ctx) ?? []))) };
}

const rendreGroupe = (g: Groupe, ctx: ContexteEcriture, fonctions: readonly Fonctionnalite[]): RenduGroupe =>
  ({ attributs: lireAttributs(attributsTries(fonctions.flatMap(k => k.ecriture?.attributsGroupe?.(g, ctx) ?? []))) });

// Les rendus memorises par objet, seulement pour le catalogue. Le corps d'un contenu imbrique ne lit pas le plan : il ne fait pas
// partie de la cle.
const memoFeuilles = new WeakMap<Forme, Rendu<RenduFeuille>>();
const memoGroupes = new WeakMap<Groupe, Rendu<RenduGroupe>>();
const memoDessins = new WeakMap<DessinSvg, RenduDessin>();

function memorise<K extends object, T>(memo: WeakMap<K, Rendu<T>>, cle: K, vb: DessinSvg['vb'], faire: (ctx: ContexteEcriture) => T): Rendu<T> {
  const deja = memo.get(cle);
  if (deja) return deja;
  const definitions: Definition[] = [];
  const r = { rendu: faire(contexte(vb, recueilNote(definitions), FONCTIONNALITES)), definitions };
  memo.set(cle, r);
  return r;
}

/** Les noeuds de l'arbre dans l'ordre ou l'ecriture les visite : un groupe avant ses enfants. */
function* parcourir(t: readonly NoeudArbre[]): Generator<NoeudArbre> {
  for (const n of t) {
    yield n;
    if (n.genre === 'groupe') yield* parcourir(n.enfants);
  }
}

/** Le rendu d'un dessin d'un seul tenant, sans memoire : une liste de fonctionnalites donnee, ou une collision d'empreinte. */
function renduSansMemoire(d: DessinSvg, fonctions: readonly Fonctionnalite[]): RenduDessin {
  const r = recueil(), ctx = contexte(d.vb, r, fonctions);
  const feuilles = new Map<Forme, RenduFeuille>(), groupes = new Map<Groupe, RenduGroupe>();
  for (const n of parcourir(arbreDe(d).racine)) {
    if (n.genre === 'feuille') feuilles.set(n.forme, rendreFeuille(n.forme, ctx, fonctions));
    else groupes.set(n.groupe, rendreGroupe(n.groupe, ctx, fonctions));
  }
  const defs = r.ecrire();
  return {
    feuille: f => feuilles.get(f) ?? rendreFeuille(f, ctx, fonctions),
    groupe: g => groupes.get(g) ?? rendreGroupe(g, ctx, fonctions),
    definitions: defs.slice('<defs>'.length, -'</defs>'.length)
  };
}

/**
 * Le rendu d'un dessin riche pour la toile. `fonctions` : le catalogue (par defaut, memorise), ou une liste donnee (les tests des
 * points d'extension). Les definitions de toutes les feuilles et de tous les groupes y sont, masques compris : la toile n'en montre
 * pas moins (un groupe masque n'y dessine rien), et un dessin qui change de visibilite ne recalcule rien.
 */
export function renduDe(d: DessinSvg, fonctions: readonly Fonctionnalite[] = FONCTIONNALITES): RenduDessin {
  if (fonctions !== FONCTIONNALITES) return renduSansMemoire(d, fonctions);
  const deja = memoDessins.get(d);
  if (deja) return deja;
  const r = recueil();
  let collision = false;
  const poser = (defs: readonly Definition[]) => {
    const notees = recueilNote([]);
    for (const def of defs) if (r.poser(def) !== notees.poser(def)) collision = true;
  };
  for (const n of parcourir(arbreDe(d).racine)) {
    if (n.genre === 'feuille') poser(memorise(memoFeuilles, n.forme, d.vb, ctx => rendreFeuille(n.forme, ctx, FONCTIONNALITES)).definitions);
    else poser(memorise(memoGroupes, n.groupe, d.vb, ctx => rendreGroupe(n.groupe, ctx, FONCTIONNALITES)).definitions);
  }
  if (collision) {
    const s = renduSansMemoire(d, fonctions);
    memoDessins.set(d, s);
    return s;
  }
  const defs = r.ecrire();
  const rendu: RenduDessin = {
    feuille: f => memorise(memoFeuilles, f, d.vb, ctx => rendreFeuille(f, ctx, FONCTIONNALITES)).rendu,
    groupe: g => memorise(memoGroupes, g, d.vb, ctx => rendreGroupe(g, ctx, FONCTIONNALITES)).rendu,
    definitions: defs ? defs.slice('<defs>'.length, -'</defs>'.length) : ''
  };
  memoDessins.set(d, rendu);
  return rendu;
}
