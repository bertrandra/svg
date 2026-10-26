// L'arbre du modele v2 (ADR-0012, annexe 1 §5, §8, §9) : des feuilles a plat dans `formes`, des groupes en index par `parent`,
// et l'arbre comme VUE derivee, memorisee par dessin. Tout est pur ; sur un dessin plat, chaque aide prend un chemin court qui
// rend ce que le modele d'avant rendait (une feuille par forme, aucun ancetre, le meme objet).
//
// Les invariants (I1 a I9) sont verifies par `verifierDessin` et retablis, autant qu'ils peuvent l'etre sans rien inventer, par
// `normaliser`. Les operations lisent `formes` ; l'interface (calques, toile, navigation) lit l'arbre.

import type { Contenu, Forme, Groupe, Peinture } from './types.js';
import { t } from '../../util/i18n.js';

/** La profondeur d'imbrication des groupes au-dela de laquelle la lecture refuse (annexe 5 §2). */
export const PROFONDEUR_GROUPES_MAX = 64;

export type NoeudArbre =
  | { readonly genre: 'groupe'; readonly groupe: Groupe; readonly enfants: readonly NoeudArbre[]; readonly debut: number; readonly fin: number }
  | { readonly genre: 'feuille'; readonly forme: Forme; readonly index: number };

export interface Arbre {
  readonly racine: readonly NoeudArbre[];
  /** Les noeuds par identifiant, feuilles et groupes. */
  readonly parId: ReadonlyMap<string, NoeudArbre>;
}

/** Vrai si la feuille ne porte aucun champ du modele v2. Le texte vivant, l'operation et l'origine sont du modele plat. */
export const feuillePlate = (f: Forme): boolean =>
  f.parent === undefined && f.peintureRemplissage === undefined && f.peintureContour === undefined && f.effets === undefined && f.image === undefined;

const memoPlat = new WeakMap<Contenu, boolean>();

/**
 * Vrai si le contenu est plat (I6) : sans table de groupes et sans feuille qui porte un champ v2. Un dessin plat s'ecrit, se
 * transforme et s'exporte exactement comme le dessin d'avant le modele v2. Memorise par contenu (un dessin ne change jamais).
 */
export function estPlat(d: Contenu): boolean {
  let r = memoPlat.get(d);
  if (r === undefined) { r = d.groupes === undefined && d.formes.every(feuillePlate); memoPlat.set(d, r); }
  return r;
}

const groupeDe = (d: Contenu, id: string | undefined): Groupe | undefined =>
  id !== undefined && d.groupes && Object.prototype.hasOwnProperty.call(d.groupes, id) ? d.groupes[id] : undefined;

const memoFeuilles = new WeakMap<Contenu, ReadonlyMap<string, Forme>>();
/** Les feuilles par identifiant (la premiere l'emporte, comme partout ailleurs). */
function feuillesParId(d: Contenu): ReadonlyMap<string, Forme> {
  let m = memoFeuilles.get(d);
  if (!m) {
    const t = new Map<string, Forme>();
    for (const f of d.formes) if (!t.has(f.id)) t.set(f.id, f);
    m = t;
    memoFeuilles.set(d, m);
  }
  return m;
}

/**
 * Les groupes ancetres d'un noeud (feuille ou groupe), du plus proche au plus lointain. S'arrete sur un parent absent, un cycle ou
 * au-dela de la profondeur permise : la vue reste finie sur un dessin qui viole les invariants.
 */
export function ancetres(d: Contenu, id: string): string[] {
  if (!d.groupes) return [];
  const depart = feuillesParId(d).get(id)?.parent ?? groupeDe(d, id)?.parent;
  const out: string[] = [], vus = new Set<string>([id]);
  let g = groupeDe(d, depart);
  while (g && !vus.has(g.id) && out.length <= PROFONDEUR_GROUPES_MAX) {
    out.push(g.id);
    vus.add(g.id);
    g = groupeDe(d, g.parent);
  }
  return out;
}

export const profondeur = (d: Contenu, id: string): number => ancetres(d, id).length;

/** Visible, et tous ses ancetres visibles : un groupe masque masque ses enfants sans rien ecrire en eux. */
export function visibleEffectif(d: Contenu, id: string): boolean {
  const n = feuillesParId(d).get(id) ?? groupeDe(d, id);
  return n !== undefined && n.visible && ancetres(d, id).every(a => groupeDe(d, a)?.visible !== false);
}

/** Verrouille, ou un ancetre verrouille : le verrou s'herite sans rien ecrire dans les enfants. */
export function verrouilleEffectif(d: Contenu, id: string): boolean {
  const n = feuillesParId(d).get(id) ?? groupeDe(d, id);
  return n !== undefined && (n.verrouille || ancetres(d, id).some(a => groupeDe(d, a)?.verrouille === true));
}

const memoArbre = new WeakMap<Contenu, Arbre>();

/**
 * L'arbre du contenu, memorise. Plat : une feuille par forme a la racine, sans parcourir de groupes. Sinon, une passe sur `formes`
 * avec la pile des groupes ouverts : chaque groupe est l'intervalle [debut ; fin[ de ses feuilles (I3). Sur un contenu qui viole la
 * contiguite, un groupe coupe en deux donne deux noeuds (`parId` garde le premier) : `normaliser` d'abord pour une vue exacte.
 */
export function arbreDe(d: Contenu): Arbre {
  const deja = memoArbre.get(d);
  if (deja) return deja;
  type GroupeOuvert = { genre: 'groupe'; groupe: Groupe; enfants: NoeudArbre[]; debut: number; fin: number };
  const racine: NoeudArbre[] = [], parId = new Map<string, NoeudArbre>();
  const pile: GroupeOuvert[] = [];
  const poser = (n: NoeudArbre, id: string) => {
    (pile[pile.length - 1]?.enfants ?? racine).push(n);
    if (!parId.has(id)) parId.set(id, n);
  };
  // La chaine des groupes d'une feuille (de la racine a son parent), calculee une fois par groupe : les feuilles d'un meme groupe la
  // partagent (5 000 feuilles dans 500 groupes : 500 chaines, pas 5 000 remontees).
  const chaines = new Map<string, readonly string[]>();
  const chaineDe = (parent: string | undefined): readonly string[] => {
    if (parent === undefined || !groupeDe(d, parent)) return [];
    let c = chaines.get(parent);
    if (!c) {
      // La remontee d'`ancetres`, sans sa table des feuilles : du parent vers la racine, finie meme sur un cycle.
      const t: string[] = [], vus = new Set<string>();
      for (let g = groupeDe(d, parent); g && !vus.has(g.id) && t.length <= PROFONDEUR_GROUPES_MAX + 1; g = groupeDe(d, g.parent)) { vus.add(g.id); t.push(g.id); }
      c = t.reverse();
      chaines.set(parent, c);
    }
    return c;
  };
  d.formes.forEach((f, index) => {
    const chaine = d.groupes ? chaineDe(f.parent) : [];
    let k = 0;
    while (k < pile.length && k < chaine.length && pile[k]?.groupe.id === chaine[k]) k++;
    while (pile.length > k) { const g = pile.pop(); if (g) g.fin = index; }
    for (let i = k; i < chaine.length; i++) {
      const id = chaine[i] ?? '';
      const groupe = groupeDe(d, id);
      if (!groupe) break;
      const g: GroupeOuvert = { genre: 'groupe', groupe, enfants: [], debut: index, fin: index };
      poser(g, id);
      pile.push(g);
    }
    poser({ genre: 'feuille', forme: f, index }, f.id);
  });
  for (const g of pile) g.fin = d.formes.length;
  const a: Arbre = { racine, parId };
  memoArbre.set(d, a);
  return a;
}

/** Les identifiants des feuilles que couvrent ces noeuds (feuilles ou groupes), dans l'ordre du dessin, sans doublon. */
export function feuillesDe(d: Contenu, ids: readonly string[]): string[] {
  const voulus = new Set(ids);
  if (!d.groupes) return d.formes.filter(f => voulus.has(f.id)).map(f => f.id);
  return d.formes.filter(f => voulus.has(f.id) || ancetres(d, f.id).some(a => voulus.has(a))).map(f => f.id);
}

/** Les noeuds choisis moins ceux dont un ancetre est aussi choisi (les « racines » de la selection), dans l'ordre donne, sans doublon. */
export function unites(d: Contenu, ids: readonly string[]): string[] {
  const voulus = new Set(ids);
  return [...voulus].filter(id => !ancetres(d, id).some(a => voulus.has(a)));
}

/**
 * La regle de la fermeture (annexe 1 §9) : les noeuds choisis, plus tout groupe dont TOUTES les feuilles sont couvertes. Une
 * operation qui transforme emmene alors la decoupe, le masque, les effets et la peinture d'un groupe dont on a tout choisi.
 */
export function promouvoir(d: Contenu, ids: readonly string[]): string[] {
  if (!d.groupes) return [...new Set(ids)];
  const couvertes = new Set(feuillesDe(d, ids)), out = new Set(ids);
  for (const n of arbreDe(d).parId.values()) {
    if (n.genre !== 'groupe' || out.has(n.groupe.id)) continue;
    if (d.formes.slice(n.debut, n.fin).every(f => couvertes.has(f.id))) out.add(n.groupe.id);
  }
  return [...out];
}

/** Le prochain numero libre d'un prefixe (`f` : feuilles, `g` : groupes), contenus de decoupes, de masques et de motifs compris. */
export function prochainNumero(d: Contenu, prefixe: 'f' | 'g'): number {
  const motif = new RegExp('^' + prefixe + '(\\d+)$');
  let max = 0;
  const voir = (id: string) => { const n = Number(motif.exec(id)?.[1] ?? 0); if (n > max) max = n; };
  parcourirContenus(d, c => {
    for (const f of c.formes) voir(f.id);
    for (const id of Object.keys(c.groupes ?? {})) voir(id);
  });
  return max + 1;
}

/** Les contenus imbriques d'une peinture (la tuile d'un motif). */
const contenusDePeinture = (p: Peinture | undefined): Contenu[] => (p?.genre === 'motif' ? [p.contenu] : []);

/**
 * Appelle `f` sur le contenu et sur chaque contenu imbrique (decoupes, masques, tuiles de motifs), en profondeur. Un contenu partage
 * (le meme objet : un motif repete sur mille formes, comme un degrade) n'est vu qu'une fois.
 */
export function parcourirContenus(d: Contenu, f: (c: Contenu, imbrique: boolean) => void, profondeurMax = 8): void {
  const vus = new Set<Contenu>();
  const visiter = (c: Contenu, niveau: number) => {
    if (vus.has(c)) return;
    vus.add(c);
    f(c, niveau > 0);
    if (niveau >= profondeurMax) return;
    for (const x of c.formes) for (const s of [...contenusDePeinture(x.peintureRemplissage), ...contenusDePeinture(x.peintureContour)]) visiter(s, niveau + 1);
    for (const g of Object.values(c.groupes ?? {})) for (const s of [g.decoupe?.contenu, g.masque?.contenu]) if (s) visiter(s, niveau + 1);
  };
  visiter(d, 0);
}

/**
 * Le groupe dont les contenus imbriques (decoupe, masque, et ceux de leurs groupes) prennent des identifiants neufs, tires de
 * `neuf` : une copie de groupe (dupliquer, coller, inserer) ne doit pas reprendre les identifiants de l'original (I1, annexe 3 §2).
 * Les parents suivent. Le meme groupe s'il ne porte aucun contenu.
 */
export function renumeroterContenus(g: Groupe, neuf: (prefixe: 'f' | 'g') => string): Groupe {
  if (!g.decoupe && !g.masque) return g;
  const contenu = (c: Contenu): Contenu => {
    const vers = new Map<string, string>();
    for (const id of Object.keys(c.groupes ?? {})) vers.set(id, neuf('g'));
    const parent = (p: string | undefined): { parent?: string } => {
      const q = p === undefined ? undefined : vers.get(p);
      return q !== undefined ? { parent: q } : {};
    };
    const formes = c.formes.map((f): Forme => { const { parent: _p, ...reste } = f; void _p; return { ...reste, id: neuf('f'), ...parent(f.parent) }; });
    if (!c.groupes) return { formes };
    const groupes: Record<string, Groupe> = {};
    for (const [id, x] of Object.entries(c.groupes)) {
      const { parent: _p, ...reste } = renumeroterContenus(x, neuf);
      void _p;
      const nouveau = vers.get(id) ?? id;
      groupes[nouveau] = { ...reste, id: nouveau, ...parent(x.parent) };
    }
    return { formes, groupes };
  };
  return {
    ...g,
    ...(g.decoupe ? { decoupe: { ...g.decoupe, contenu: contenu(g.decoupe.contenu) } } : {}),
    ...(g.masque ? { masque: { ...g.masque, contenu: contenu(g.masque.contenu) } } : {})
  };
}

/**
 * Le poids du dessin pour l'historique (annexe 3 §5) : ce que pese un etat en memoire. Plat : le nombre de formes, donc la limite
 * d'historique d'avant le modele v2 (ADR-0008). Sinon chaque groupe compte 4, chaque feuille d'un contenu imbrique 20, chaque image
 * 50 et ses octets / 10 000.
 */
export function poidsDessin(d: Contenu): number {
  if (estPlat(d)) return d.formes.length;
  let poids = 0;
  parcourirContenus(d, (c, imbrique) => {
    poids += c.formes.length * (imbrique ? 20 : 1) + 4 * Object.keys(c.groupes ?? {}).length;
    for (const f of c.formes) if (f.image) poids += 50 + Math.round((f.image.donnees.length * 0.75) / 10000);
  });
  return poids;
}

/**
 * Les invariants du contenu viole (annexe 1 §5), en phrases ; vide : le contenu est bien forme. Ne leve jamais. Les identifiants sont
 * uniques dans le dessin, contenus de decoupes et de masques compris (I1) ; la tuile d'un motif est un espace a part (etape 9 : une
 * peinture se partage, comme un degrade), ou ils sont uniques aussi, ses decoupes et ses masques compris.
 */
export function verifierDessin(d: Contenu): string[] {
  const out: string[] = [], tuiles = new Set<Contenu>();
  const visiter = (c: Contenu, vus: Set<string>, niveau: number) => {
    for (const id of [...c.formes.map(f => f.id), ...Object.keys(c.groupes ?? {})]) {
      if (vus.has(id)) out.push(t('I1 : identifiant en double « {id} »', { id }));
      vus.add(id);
    }
    out.push(...verifierContenu(c));
    if (niveau >= 8) return;
    // Une tuile partagee (le meme objet) ne se juge qu'une fois.
    for (const x of c.formes) {
      for (const s of [...contenusDePeinture(x.peintureRemplissage), ...contenusDePeinture(x.peintureContour)]) {
        if (tuiles.has(s)) continue;
        tuiles.add(s);
        visiter(s, new Set(), niveau + 1);
      }
    }
    for (const g of Object.values(c.groupes ?? {})) for (const s of [g.decoupe?.contenu, g.masque?.contenu]) if (s) visiter(s, vus, niveau + 1);
  };
  visiter(d, new Set(), 0);
  return out;
}

/** Vrai si, en remontant les parents depuis ce groupe, on retombe sur un groupe deja vu. */
function dansUnCycle(c: Contenu, id: string): boolean {
  const vus = new Set<string>();
  for (let g = groupeDe(c, id); g; g = groupeDe(c, g.parent)) {
    if (vus.has(g.id)) return true;
    vus.add(g.id);
  }
  return false;
}

function verifierContenu(c: Contenu): string[] {
  const out: string[] = [];
  if (c.groupes && Object.keys(c.groupes).length === 0) out.push(t('I9 : table de groupes vide (elle doit etre absente)'));
  for (const [cle, g] of Object.entries(c.groupes ?? {})) {
    if (g.id !== cle) out.push(t('I9 : le groupe rangé sous « {cle} » s’appelle « {id} »', { cle, id: g.id }));
    if (g.parent !== undefined && !groupeDe(c, g.parent)) out.push(t('I2 : le groupe « {id} » a un parent absent « {parent} »', { id: g.id, parent: g.parent }));
    if (dansUnCycle(c, g.id)) out.push(t('I2 : cycle de groupes autour de « {id} »', { id: g.id }));
    else if (ancetres(c, g.id).length >= PROFONDEUR_GROUPES_MAX) out.push(t('I2 : le groupe « {id} » est emboîté sur plus de {n} niveaux', { id: g.id, n: PROFONDEUR_GROUPES_MAX }));
  }
  for (const f of c.formes) {
    if (f.parent !== undefined && !groupeDe(c, f.parent)) out.push(t('I2 : la forme « {id} » a un parent absent « {parent} »', { id: f.id, parent: f.parent }));
    if (f.peintureRemplissage && f.remplissage === null) out.push(t('I5 : la forme « {id} » a un dégradé ou un motif sans couleur de repli au fond', { id: f.id }));
    if (f.peintureContour && f.contour === null) out.push(t('I5 : la forme « {id} » a un dégradé ou un motif sans couleur de repli au contour', { id: f.id }));
  }
  if (!c.groupes) return out;
  // I3 et I4 : chaque groupe couvre un intervalle contigu de feuilles, et au moins une.
  const intervalles = new Map<string, { debut: number; fin: number; nombre: number }>();
  c.formes.forEach((f, i) => {
    for (const a of ancetres(c, f.id)) {
      const iv = intervalles.get(a);
      if (iv) { iv.fin = i + 1; iv.nombre++; } else intervalles.set(a, { debut: i, fin: i + 1, nombre: 1 });
    }
  });
  for (const id of Object.keys(c.groupes)) {
    const iv = intervalles.get(id);
    if (!iv) out.push(t('I4 : le groupe « {id} » est vide', { id }));
    else if (iv.fin - iv.debut !== iv.nombre) out.push(t('I3 : les formes du groupe « {id} » ne se suivent pas', { id }));
  }
  return out;
}

/**
 * Le contenu ramene a ses invariants, sans rien renumeroter ni dissoudre un groupe voulu (annexe 1 §5, I8) : un parent absent est
 * retire (le noeud remonte a la racine), un cycle est coupe au premier groupe qui le ferme, les groupes vides partent en cascade,
 * une table vide disparait, et les feuilles reprennent l'ordre du parcours en profondeur (les freres ranges par leur premiere
 * feuille). Le meme objet si rien ne change, donc idempotent ; un dessin plat est rendu tel quel des la premiere ligne.
 * Les contenus imbriques (decoupes, masques, motifs) sont laisses aux etapes qui les livrent.
 */
export function normaliser<C extends Contenu>(d: C): C {
  if (estPlat(d)) return d;
  const source = d.groupes ?? {};
  // 1. Les parents des groupes : absents retires, cycles coupes (dans l'ordre de la table : deterministe).
  const parents = new Map<string, string | undefined>();
  for (const [id, g] of Object.entries(source)) parents.set(id, g.parent !== undefined && Object.prototype.hasOwnProperty.call(source, g.parent) ? g.parent : undefined);
  for (const id of parents.keys()) {
    const vus = new Set<string>([id]);
    let p = parents.get(id), courant = id;
    while (p !== undefined) {
      if (vus.has(p)) { parents.set(courant, undefined); break; }
      vus.add(p);
      courant = p;
      p = parents.get(p);
    }
  }
  // 2. Les feuilles : un parent absent est retire.
  let feuillesChangees = false;
  const formes = d.formes.map((f): Forme => {
    if (f.parent === undefined || parents.has(f.parent)) return f;
    feuillesChangees = true;
    const { parent: _p, ...reste } = f;
    void _p;
    return reste;
  });
  // 3. Les groupes qui ont au moins une feuille, en remontant de chaque feuille.
  const peuples = new Set<string>();
  for (const f of formes) for (let p = f.parent; p !== undefined && !peuples.has(p); p = parents.get(p)) peuples.add(p);
  // 4. L'ordre du parcours en profondeur : chaque noeud range sous son parent par sa premiere feuille.
  const enfants = new Map<string, Array<{ cle: number; feuille?: Forme; groupe?: string }>>();
  const premiere = new Map<string, number>();
  formes.forEach((f, i) => { for (let p = f.parent; p !== undefined; p = parents.get(p)) { if (premiere.has(p)) break; premiere.set(p, i); } });
  const ranger = (parent: string | undefined, n: { cle: number; feuille?: Forme; groupe?: string }) => {
    const k = parent ?? '';
    const t = enfants.get(k);
    if (t) t.push(n); else enfants.set(k, [n]);
  };
  formes.forEach((f, i) => ranger(f.parent, { cle: i, feuille: f }));
  for (const id of peuples) ranger(parents.get(id), { cle: premiere.get(id) ?? 0, groupe: id });
  const ordre: Forme[] = [];
  const descendre = (k: string) => {
    for (const n of (enfants.get(k) ?? []).sort((a, b) => a.cle - b.cle)) {
      if (n.feuille) ordre.push(n.feuille);
      else if (n.groupe !== undefined) descendre(n.groupe);
    }
  };
  descendre('');
  const groupesChanges = [...parents.keys()].some(id => !peuples.has(id) || parents.get(id) !== source[id]?.parent);
  const ordreChange = feuillesChangees || ordre.some((f, i) => f !== d.formes[i]);
  if (!groupesChanges && !ordreChange && (d.groupes === undefined || Object.keys(source).length > 0)) return d;
  const groupes: Record<string, Groupe> = {};
  for (const [id, g] of Object.entries(source)) {
    if (!peuples.has(id)) continue;
    const p = parents.get(id);
    if (p === g.parent) { groupes[id] = g; continue; }
    const { parent: _p, ...reste } = g;
    void _p;
    groupes[id] = p === undefined ? reste : { ...reste, parent: p };
  }
  const { groupes: _g, ...sansGroupes } = d;
  void _g;
  return (Object.keys(groupes).length ? { ...sansGroupes, formes: ordre, groupes } : { ...sansGroupes, formes: ordre }) as unknown as C;
}
