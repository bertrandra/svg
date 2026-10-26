// Les groupes du modele v2, cote operations (ADR-0012, etape 1, annexe 3 §2 et §3) : grouper, degrouper, deplacer dans un groupe,
// renommer, et les chemins riches des operations existantes qui doivent connaitre l'arbre (dupliquer un sous-arbre, ordonner parmi
// ses freres, isoler avec ses ancetres, inserer et coller un contenu). Tout est pur ; chaque operation rend le MEME dessin quand rien
// ne change, et un dessin qui respecte les invariants (arbre.ts, `verifierDessin`) : les feuilles d'un groupe se suivent, aucun
// groupe n'est vide, la table absente plutot que vide.
//
// Rien ici n'est appele pour un dessin plat : les operations existantes gardent leur corps d'avant derriere `estPlat` (annexe 3 §1).
// Ce module n'importe ni `operations.ts` ni `assemblage.ts` (ce sont eux qui l'appellent) : pas de cycle d'import.

import type { Boite, Contenu, DessinSvg, Forme, Groupe, Matrice } from './types.js';
import { ancetres, arbreDe, normaliser, prochainNumero, unites, visibleEffectif, type NoeudArbre } from './arbre.js';
import { boiteForme, echelle, multiplier, translation, unir } from './geometrie.js';
import { transformerFeuille, transformerGroupe } from './transformation.js';
import { relierCopie } from './texteVivant.js';

/** Ce que dit `combiner` ou un booleen sur des feuilles de groupes differents (annexe 3 §2). */
export const MSG_MEME_PARENT = 'Les formes à réunir doivent être dans le même groupe.';

const aPropre = (o: object, cle: string): boolean => Object.prototype.hasOwnProperty.call(o, cle);

/** Le groupe de cet identifiant, ou undefined (une feuille, un identifiant inconnu, un dessin plat). */
export const groupeDe = (d: Contenu, id: string | undefined): Groupe | undefined =>
  id !== undefined && d.groupes && aPropre(d.groupes, id) ? d.groupes[id] : undefined;

/** Vrai si l'identifiant est celui d'une feuille ou d'un groupe du dessin. */
const existe = (d: Contenu, id: string): boolean => groupeDe(d, id) !== undefined || d.formes.some(f => f.id === id);

/** La forme avec ce parent, ou sans parent du tout (jamais `parent: undefined`, que le typage exact refuse). */
export function avecParent<T extends { readonly parent?: string }>(x: T, parent: string | undefined): T {
  if (x.parent === parent) return x;
  if (parent !== undefined) return { ...x, parent };
  const { parent: _p, ...reste } = x;
  void _p;
  return reste as T;
}

/** Le dessin avec cette table de groupes, la cle retiree quand la table est vide (I9). */
export function avecGroupes<C extends Contenu>(d: C, formes: readonly Forme[], groupes: Readonly<Record<string, Groupe>>): C {
  const { groupes: _g, ...reste } = d;
  void _g;
  return (Object.keys(groupes).length ? { ...reste, formes, groupes } : { ...reste, formes }) as unknown as C;
}

/** Les feuilles d'un noeud, dans l'ordre du dessin : la feuille elle-meme, ou la tranche du groupe (I3). */
function feuillesDuNoeud(d: Contenu, n: NoeudArbre): readonly Forme[] {
  return n.genre === 'feuille' ? [n.forme] : d.formes.slice(n.debut, n.fin);
}

/** Le dernier index de `formes` couvert par ce noeud. */
const finDuNoeud = (n: NoeudArbre): number => (n.genre === 'feuille' ? n.index : n.fin - 1);
/** Le premier index de `formes` couvert par ce noeud. */
const debutDuNoeud = (n: NoeudArbre): number => (n.genre === 'feuille' ? n.index : n.debut);

/** Les unites de la selection qui existent, rangees dans l'ordre du dessin (par leur premiere feuille). */
function unitesRangees(d: Contenu, ids: readonly string[]): NoeudArbre[] {
  const a = arbreDe(d);
  return unites(d, ids).flatMap(id => { const n = a.parId.get(id); return n ? [n] : []; }).sort((x, y) => debutDuNoeud(x) - debutDuNoeud(y));
}

/** Les groupes d'un sous-arbre (lui compris s'il en est un), du haut vers le bas. */
function groupesDuSousArbre(n: NoeudArbre): Groupe[] {
  if (n.genre === 'feuille') return [];
  return [n.groupe, ...n.enfants.flatMap(groupesDuSousArbre)];
}

// ---------------------------------------------------------------- les operations nouvelles

/**
 * Grouper ces noeuds (feuilles ou groupes) sous un groupe nouveau, a la place du plus haut d'entre eux dans l'ordre de peinture et
 * dans son parent. Un noeud d'un autre parent y est ramene (annexe 3 §3) : ses feuilles rejoignent le bloc, dans leur ordre. Rend le
 * dessin et l'identifiant du groupe, ou le meme dessin et null sans noeud a grouper.
 */
export function grouper(d: DessinSvg, ids: readonly string[], nom?: string): { dessin: DessinSvg; id: string | null } {
  const us = unitesRangees(d, ids);
  const haut = us.reduce<NoeudArbre | undefined>((h, n) => (h === undefined || finDuNoeud(n) > finDuNoeud(h) ? n : h), undefined);
  if (!haut) return { dessin: d, id: null };
  const id = 'g' + prochainNumero(d, 'g');
  const parentCible = haut.genre === 'feuille' ? haut.forme.parent : haut.groupe.parent;
  const unitesIds = new Set(us.map(n => (n.genre === 'feuille' ? n.forme.id : n.groupe.id)));
  const bloc = new Set(us.flatMap(n => feuillesDuNoeud(d, n)));
  const fin = finDuNoeud(haut);
  const formes: Forme[] = [];
  d.formes.forEach((f, i) => {
    if (!bloc.has(f)) formes.push(f);
    if (i === fin) for (const x of d.formes) if (bloc.has(x)) formes.push(unitesIds.has(x.id) ? avecParent(x, id) : x);
  });
  const groupes: Record<string, Groupe> = {};
  for (const [k, g] of Object.entries(d.groupes ?? {})) groupes[k] = unitesIds.has(k) ? avecParent(g, id) : g;
  const nomPropre = nom?.trim();
  groupes[id] = { id, ...(parentCible !== undefined ? { parent: parentCible } : {}), ...(nomPropre ? { nom: nomPropre } : {}), visible: true, verrouille: false };
  return { dessin: normaliser(avecGroupes(d, formes, groupes)), id };
}

/**
 * Degrouper ces groupes : leurs enfants remontent dans leur parent, dans leur ordre, aux memes coordonnees (la matrice est cuite).
 * Ce que le groupe portait (opacite, decoupe, masque, effets) part avec lui : `porteurs` nomme les groupes qui portaient quelque
 * chose, pour que l'interface le dise (« dégrouper retire… »). Les identifiants rendus sont ceux des enfants remontes.
 */
export function degrouper(d: DessinSvg, ids: readonly string[]): { dessin: DessinSvg; ids: string[]; porteurs: string[] } {
  const voulus = new Set(ids.filter(id => groupeDe(d, id) !== undefined));
  if (!voulus.size) return { dessin: d, ids: [], porteurs: [] };
  // Le parent ou remonte un enfant : le premier ancetre qui n'est pas degroupe.
  const remonter = (p: string | undefined): string | undefined => {
    let q = p;
    while (q !== undefined && voulus.has(q)) q = groupeDe(d, q)?.parent;
    return q;
  };
  const enfants: string[] = [];
  const formes = d.formes.map(f => {
    if (f.parent === undefined || !voulus.has(f.parent)) return f;
    enfants.push(f.id);
    return avecParent(f, remonter(f.parent));
  });
  const groupes: Record<string, Groupe> = {};
  for (const [k, g] of Object.entries(d.groupes ?? {})) {
    if (voulus.has(k)) continue;
    if (g.parent !== undefined && voulus.has(g.parent)) { enfants.push(k); groupes[k] = avecParent(g, remonter(g.parent)); } else groupes[k] = g;
  }
  const porteurs = [...voulus].filter(id => { const g = groupeDe(d, id); return !!g && ((g.opacite !== undefined && g.opacite < 1) || !!g.decoupe || !!g.masque || !!g.effets); });
  const dessin = normaliser(avecGroupes(d, formes, groupes));
  // Dans l'ordre du dessin.
  const rang = new Map<string, number>();
  for (const n of arbreDe(dessin).parId.values()) rang.set(n.genre === 'feuille' ? n.forme.id : n.groupe.id, debutDuNoeud(n));
  return { dessin, ids: enfants.sort((a, b) => (rang.get(a) ?? 0) - (rang.get(b) ?? 0)), porteurs };
}

/**
 * Deplacer ces noeuds dans un groupe (`parent`), ou a la racine (undefined), juste sous le noeud `avant` (un enfant de ce parent)
 * ou au premier plan de ce parent : l'alternative clavier au glisser des calques. Un groupe ne se deplace pas en lui-meme ni dans un
 * de ses descendants : le meme dessin.
 */
export function deplacerDans(d: DessinSvg, ids: readonly string[], parent: string | undefined, avant?: string): DessinSvg {
  if (parent !== undefined && !groupeDe(d, parent)) return d;
  const us = unitesRangees(d, ids);
  const unitesIds = new Set(us.map(n => (n.genre === 'feuille' ? n.forme.id : n.groupe.id)));
  if (!us.length || (parent !== undefined && (unitesIds.has(parent) || ancetres(d, parent).some(a => unitesIds.has(a))))) return d;
  const bloc = new Set(us.flatMap(n => feuillesDuNoeud(d, n)));
  const reste = d.formes.filter(f => !bloc.has(f));
  const dans = (f: Forme): boolean => parent === undefined || f.parent === parent || ancetres(d, f.id).includes(parent);
  const sousAvant = avant !== undefined && !unitesIds.has(avant) ? reste.findIndex(f => f.id === avant || ancetres(d, f.id).includes(avant)) : -1;
  let position: number;
  if (sousAvant >= 0) position = sousAvant;
  else if (parent === undefined) position = reste.length;
  else {
    let dernier = -1;
    reste.forEach((f, i) => { if (dans(f)) dernier = i; });
    // Un groupe que le deplacement viderait garde sa place : celle de sa premiere feuille, parmi celles qui restent.
    const premiere = d.formes.findIndex(dans);
    position = dernier >= 0 ? dernier + 1 : d.formes.slice(0, Math.max(0, premiere)).filter(f => !bloc.has(f)).length;
  }
  const deplaces = d.formes.filter(f => bloc.has(f)).map(f => (unitesIds.has(f.id) ? avecParent(f, parent) : f));
  const formes = [...reste.slice(0, position), ...deplaces, ...reste.slice(position)];
  const groupes: Record<string, Groupe> = {};
  for (const [k, g] of Object.entries(d.groupes ?? {})) groupes[k] = unitesIds.has(k) ? avecParent(g, parent) : g;
  const r = normaliser(avecGroupes(d, formes, groupes));
  const cles = Object.keys(d.groupes ?? {}), apres = Object.entries(r.groupes ?? {});
  const pareil = r.formes.length === d.formes.length && r.formes.every((f, i) => f === d.formes[i]) && apres.length === cles.length && apres.every(([k, g]) => groupeDe(d, k) === g);
  return pareil ? d : r;
}

/** Renommer un groupe ; un nom vide le retire. Le meme dessin si rien ne change ou si ce n'est pas un groupe. */
export function renommer(d: DessinSvg, id: string, nom: string): DessinSvg {
  const g = groupeDe(d, id);
  if (!g) return d;
  const propre = nom.trim();
  if ((g.nom ?? '') === propre) return d;
  const { nom: _n, ...reste } = g;
  void _n;
  return { ...d, groupes: { ...d.groupes, [id]: propre ? { ...reste, nom: propre } : reste } };
}

// ---------------------------------------------------------------- les chemins riches des operations existantes

/**
 * Regler les champs d'un groupe (visibilite, verrou, opacite : annexe 3 §2, ce qui s'applique au noeud). L'opacite pleine n'est pas
 * un champ. Le meme dessin si rien ne change.
 */
export function reglerGroupes(d: DessinSvg, ids: readonly string[], r: { readonly visible?: boolean; readonly verrouille?: boolean; readonly opacite?: number }): DessinSvg {
  let groupes: Record<string, Groupe> | null = null;
  for (const id of ids) {
    const g = groupeDe(d, id);
    if (!g) continue;
    let h: Groupe = g;
    if (r.visible !== undefined && h.visible !== r.visible) h = { ...h, visible: r.visible };
    if (r.verrouille !== undefined && h.verrouille !== r.verrouille) h = { ...h, verrouille: r.verrouille };
    if (r.opacite !== undefined && (h.opacite ?? 1) !== r.opacite) {
      const { opacite: _o, ...reste } = h;
      void _o;
      h = r.opacite < 1 ? { ...reste, opacite: Math.max(0, r.opacite) } : reste;
    }
    if (h !== g) { groupes ??= { ...d.groupes }; groupes[id] = h; }
  }
  return groupes ? { ...d, groupes } : d;
}

/**
 * Transformer les groupes de la fermeture (annexe 1 §9) par `m` : leur decoupe, leur masque, leurs effets suivent (les crochets des
 * fonctionnalites). Les feuilles sont transformees par l'appelant. Le meme dessin si aucun groupe ne change.
 */
export function transformerGroupesDe(d: DessinSvg, fermes: readonly string[], m: Matrice): DessinSvg {
  let groupes: Record<string, Groupe> | null = null;
  for (const id of fermes) {
    const g = groupeDe(d, id);
    if (!g) continue;
    const h = transformerGroupe(g, m);
    if (h !== g) { groupes ??= { ...d.groupes }; groupes[id] = h; }
  }
  return groupes ? { ...d, groupes } : d;
}

/**
 * Dupliquer ces noeuds : chaque unite (un noeud dont aucun ancetre n'est choisi) est copiee juste au-dessus d'elle, dans le meme
 * parent ; un groupe l'est avec tout son sous-arbre (nouveaux identifiants de feuilles et de groupes, parents recopies vers les
 * copies). Les textes poses copies avec leur forme se posent sur la copie (ADR-0031). Rend les identifiants des unites copiees.
 */
export function dupliquerNoeuds(d: DessinSvg, ids: readonly string[], dx = 0, dy = 0): { dessin: DessinSvg; ids: string[] } {
  const us = unitesRangees(d, ids);
  if (!us.length) return { dessin: d, ids: [] };
  let nf = prochainNumero(d, 'f'), ng = prochainNumero(d, 'g');
  const m = dx || dy ? translation(dx, dy) : null;
  const copies = new Map<string, string>(), apres = new Map<number, Forme[]>(), nouveaux: string[] = [];
  const groupes: Record<string, Groupe> = { ...d.groupes };
  for (const u of us) {
    const vers = new Map<string, string>();
    for (const g of groupesDuSousArbre(u)) {
      const id = 'g' + ng++;
      vers.set(g.id, id);
      const parent = u.genre === 'groupe' && g === u.groupe ? g.parent : g.parent === undefined ? undefined : vers.get(g.parent);
      groupes[id] = avecParent({ ...(m ? transformerGroupe(g, m) : g), id, verrouille: false }, parent);
    }
    const lot = feuillesDuNoeud(d, u).map(f => {
      const id = 'f' + nf++;
      copies.set(f.id, id);
      const base: Forme = { ...(m ? transformerFeuille(f, m, 1) : f), id, verrouille: false };
      return u.genre === 'feuille' ? base : avecParent(base, f.parent === undefined ? undefined : vers.get(f.parent));
    });
    nouveaux.push(u.genre === 'groupe' ? vers.get(u.groupe.id) ?? '' : lot[0]?.id ?? '');
    apres.set(finDuNoeud(u), lot);
  }
  const neuves = new Set(copies.values());
  const formes = d.formes.flatMap((f, i) => [f, ...(apres.get(i) ?? [])]).map(f => (neuves.has(f.id) ? relierCopie(f, copies) : f));
  return { dessin: avecGroupes(d, formes, groupes), ids: nouveaux };
}

export type OrdreNoeuds = 'premier' | 'avant' | 'arriere' | 'dernier';

/** La liste reordonnee comme `ordonner` le fait d'une liste de formes : les choisis passent devant, derriere, ou d'un cran. */
function reordonner<T>(t: readonly T[], choisi: (x: T) => boolean, o: OrdreNoeuds): T[] {
  if (o === 'premier') return [...t.filter(x => !choisi(x)), ...t.filter(choisi)];
  if (o === 'dernier') return [...t.filter(choisi), ...t.filter(x => !choisi(x))];
  const r = [...t];
  if (o === 'avant') {
    for (let i = r.length - 2; i >= 0; i--) {
      const a = r[i], b = r[i + 1];
      if (a !== undefined && b !== undefined && choisi(a) && !choisi(b)) { r[i] = b; r[i + 1] = a; }
    }
  } else {
    for (let i = 1; i < r.length; i++) {
      const a = r[i - 1], b = r[i];
      if (a !== undefined && b !== undefined && choisi(b) && !choisi(a)) { r[i - 1] = b; r[i] = a; }
    }
  }
  return r;
}

/**
 * Ordonner ces noeuds, chacun parmi ses freres seulement (jamais hors de son parent) : un groupe se deplace en bloc. Une selection
 * de noeuds de parents differents se traite parent par parent. Le meme dessin si l'ordre ne change pas.
 */
export function ordonnerNoeuds(d: DessinSvg, ids: readonly string[], o: OrdreNoeuds): DessinSvg {
  const choisis = new Set(unites(d, ids));
  if (![...choisis].some(id => existe(d, id))) return d;
  const cle = (n: NoeudArbre): string => (n.genre === 'feuille' ? n.forme.id : n.groupe.id);
  const aplatir = (t: readonly NoeudArbre[]): Forme[] =>
    reordonner(t, n => choisis.has(cle(n)), o).flatMap(n => (n.genre === 'feuille' ? [n.forme] : aplatir(n.enfants)));
  const formes = aplatir(arbreDe(d).racine);
  return formes.every((f, i) => f === d.formes[i]) ? d : { ...d, formes };
}

/**
 * N'afficher que ces noeuds (annexe 3 §2, isolement) : eux et leurs ancetres se montrent, leurs descendants gardent leur etat, tout
 * le reste se masque. Le meme dessin si rien ne change.
 */
export function montrerSeulementNoeuds(d: DessinSvg, ids: readonly string[]): DessinSvg {
  const voulus = new Set(ids.filter(id => existe(d, id)));
  const montres = new Set(voulus);
  for (const id of voulus) for (const a of ancetres(d, id)) montres.add(a);
  const etat = (id: string, visible: boolean): boolean => (montres.has(id) ? true : ancetres(d, id).some(a => voulus.has(a)) ? visible : false);
  let change = false;
  const formes = d.formes.map(f => { const v = etat(f.id, f.visible); if (v === f.visible) return f; change = true; return { ...f, visible: v }; });
  const groupes: Record<string, Groupe> = {};
  for (const [k, g] of Object.entries(d.groupes ?? {})) { const v = etat(k, g.visible); if (v !== g.visible) change = true; groupes[k] = v === g.visible ? g : { ...g, visible: v }; }
  return change ? avecGroupes(d, formes, groupes) : d;
}

/**
 * Copier des feuilles (et, si on les donne, leurs groupes) au premier plan du dessin, sous des identifiants neufs : la copie garde
 * la structure des groupes qu'elle emmene. `place(f)` transforme chaque feuille (la boite d'insertion, le decalage du collage),
 * `placeGroupe(g)` chaque groupe emmene. Rend le dessin et les identifiants des unites copiees (les noeuds au sommet de la copie).
 */
function copierAuPremierPlan(
  d: DessinSvg, feuilles: readonly Forme[], source: Readonly<Record<string, Groupe>> | undefined,
  place: (f: Forme) => Forme, placeGroupe: (g: Groupe) => Groupe, visible: boolean
): { dessin: DessinSvg; ids: string[] } {
  let nf = prochainNumero(d, 'f'), ng = prochainNumero(d, 'g');
  const vers = new Map<string, string>(), copies = new Map<string, string>(), nouveaux: string[] = [];
  const groupes: Record<string, Groupe> = { ...d.groupes };
  const groupeSource = (id: string | undefined): Groupe | undefined => (id !== undefined && source && aPropre(source, id) ? source[id] : undefined);
  // Le groupe copie d'un groupe source, et ses ancetres d'abord ; une chaine abimee (cycle, parent absent) s'arrete.
  const copierGroupe = (id: string | undefined, vus: Set<string> = new Set()): string | undefined => {
    const g = groupeSource(id);
    if (!g || vus.has(g.id)) return undefined;
    const deja = vers.get(g.id);
    if (deja !== undefined) return deja;
    vus.add(g.id);
    const parent = copierGroupe(g.parent, vus);
    const nouveau = 'g' + ng++;
    vers.set(g.id, nouveau);
    groupes[nouveau] = avecParent({ ...placeGroupe(g), id: nouveau, verrouille: false, ...(visible ? { visible: true } : {}) }, parent);
    if (parent === undefined) nouveaux.push(nouveau);
    return nouveau;
  };
  const formes = feuilles.map(f => {
    const id = 'f' + nf++;
    copies.set(f.id, id);
    const parent = copierGroupe(f.parent);
    if (parent === undefined) nouveaux.push(id);
    return avecParent({ ...place(f), id, verrouille: false, ...(visible ? { visible: true } : {}) }, parent);
  });
  if (!formes.length) return { dessin: d, ids: [] };
  const neuves = formes.map(f => relierCopie(f, copies));
  return { dessin: normaliser(avecGroupes(d, [...d.formes, ...neuves], groupes)), ids: nouveaux };
}

/**
 * Inserer le contenu visible d'un autre dessin (feuilles et groupes) au premier plan, ramene dans la boite cible en gardant ses
 * proportions, centre : le chemin d'`inserer` quand l'un des deux dessins n'est pas plat.
 */
export function insererContenu(d: DessinSvg, autre: DessinSvg, cible: Boite): { dessin: DessinSvg; ids: string[] } {
  const visibles = autre.formes.filter(f => visibleEffectif(autre, f.id));
  const b = unir(visibles.map(boiteForme));
  if (!b || !(cible.l > 0) || !(cible.h > 0)) return { dessin: d, ids: [] };
  const k = b.l > 0 && b.h > 0 ? Math.min(cible.l / b.l, cible.h / b.h) : 1;
  const m = multiplier(translation(cible.x + (cible.l - b.l * k) / 2 - b.x * k, cible.y + (cible.h - b.h * k) / 2 - b.y * k), echelle(k, k));
  return copierAuPremierPlan(d, visibles, autre.groupes, f => transformerFeuille(f, m, k), g => transformerGroupe(g, m), false);
}

/**
 * Coller des feuilles copiees (et les groupes du presse-papiers qui les contiennent, quand on les donne) au premier plan, decalees :
 * le chemin de `coller` quand le dessin ou ce qu'on colle n'est pas plat. Sans `groupes`, les feuilles arrivent a la racine.
 */
export function collerContenu(d: DessinSvg, formes: readonly Forme[], dx = 0, dy = 0, groupes?: Readonly<Record<string, Groupe>>): { dessin: DessinSvg; ids: string[] } {
  const m = dx || dy ? translation(dx, dy) : null;
  return copierAuPremierPlan(d, formes, groupes, f => (m ? transformerFeuille(f, m, 1) : f), g => (m ? transformerGroupe(g, m) : g), true);
}

/** Vrai si les deux valeurs sont egales en profondeur (peintures, effets : des donnees sans cycle). */
export function egales(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => aPropre(b, k) && egales((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
