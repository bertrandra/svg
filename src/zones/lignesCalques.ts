// Les lignes de l'arbre des calques (ADR-0012, annexe 6 §1) : les noeuds dont tous les ancetres sont deplies, du premier plan au
// fond, chacun avec son niveau, son rang parmi ses freres et son parent. C'est ce que la grille fenetre (ADR-0008) : une ligne par
// noeud visible, de meme hauteur. Pur, memorise par dessin et par ensemble de groupes deplies (deux objets immuables).
//
// Les destinations de « Déplacer vers… » (la racine et chaque groupe, avec son chemin) se calculent ici aussi.

import { ancetres, arbreDe, unites, type DessinSvg, type Groupe, type NoeudArbre } from '../engine/editionSvg.js';
import { nomDeGroupe } from './phrasesGroupes.js';

export interface LigneArbre {
  readonly id: string;
  readonly noeud: NoeudArbre;
  /** 1 a la racine. */
  readonly niveau: number;
  /** Le rang parmi ses freres, 1 au premier plan (le haut de la liste). */
  readonly position: number;
  readonly freres: number;
  /** Le groupe parent, ou null a la racine. */
  readonly parent: string | null;
}

export interface LignesArbre {
  readonly lignes: readonly LigneArbre[];
  /** Le rang de chaque ligne visible, par identifiant. */
  readonly index: ReadonlyMap<string, number>;
}

/** L'identifiant d'un noeud : celui de sa feuille ou de son groupe. */
export const idNoeud = (n: NoeudArbre): string => (n.genre === 'feuille' ? n.forme.id : n.groupe.id);

const memo = new WeakMap<DessinSvg, WeakMap<ReadonlySet<string>, LignesArbre>>();

/**
 * Les lignes visibles de l'arbre : un groupe deplie montre ses enfants sous lui. L'arbre est dans l'ordre de peinture (le fond
 * d'abord) ; la liste va du premier plan au fond, comme celle des formes d'un dessin plat.
 */
export function lignesVisibles(d: DessinSvg, deplies: ReadonlySet<string>): LignesArbre {
  let parDeplies = memo.get(d);
  if (!parDeplies) { parDeplies = new WeakMap(); memo.set(d, parDeplies); }
  const deja = parDeplies.get(deplies);
  if (deja) return deja;
  const lignes: LigneArbre[] = [], index = new Map<string, number>();
  const parcourir = (freres: readonly NoeudArbre[], niveau: number, parent: string | null) => {
    for (let k = freres.length - 1; k >= 0; k--) {
      const noeud = freres[k];
      if (!noeud) continue;
      const id = idNoeud(noeud);
      // Un dessin abime (un groupe coupe en deux) donne deux noeuds du meme identifiant : seul le premier a sa ligne.
      if (index.has(id)) continue;
      index.set(id, lignes.length);
      lignes.push({ id, noeud, niveau, position: freres.length - k, freres: freres.length, parent });
      if (noeud.genre === 'groupe' && deplies.has(id)) parcourir(noeud.enfants, niveau + 1, id);
    }
  };
  parcourir(arbreDe(d).racine, 1, null);
  const r: LignesArbre = { lignes, index };
  parDeplies.set(deplies, r);
  return r;
}

/** Les enfants d'un groupe (ou de la racine, null), dans l'ordre de peinture. */
export function enfantsDe(d: DessinSvg, parent: string | null): readonly NoeudArbre[] {
  const a = arbreDe(d);
  if (parent === null) return a.racine;
  const n = a.parId.get(parent);
  return n?.genre === 'groupe' ? n.enfants : [];
}

/** Le parent d'un noeud (null a la racine). */
export const parentDe = (d: DessinSvg, id: string): string | null => ancetres(d, id)[0] ?? null;

/**
 * Le plus proche groupe qui contient tous ces noeuds (leur parent commun, ou un ancetre commun), null s'il n'y en a pas : le contexte
 * d'edition qu'un choix fait dans l'arbre amene, pour que la toile et la selection parlent du meme niveau.
 */
export function groupeCommun(d: DessinSvg, ids: readonly string[]): string | null {
  const [premier, ...autres] = ids;
  if (premier === undefined) return null;
  const chaines = autres.map(id => new Set(ancetres(d, id)));
  return ancetres(d, premier).find(g => chaines.every(c => c.has(g))) ?? null;
}

/** Une destination de « Déplacer vers… » : la racine (`id` null) ou un groupe, avec son chemin lisible. */
export interface Destination {
  readonly id: string | null;
  readonly libelle: string;
  /** Pas une destination pour ces noeuds : l'un d'eux, ou un de leurs descendants, ou leur parent commun deja. */
  readonly refusee: boolean;
}

/**
 * Les destinations des noeuds `ids` : la racine, puis chaque groupe dans l'ordre de l'arbre (du premier plan au fond, parents avant
 * enfants), nomme par son chemin (« Ciel › Nuage »). Un groupe choisi ou un de ses descendants ne peut pas recevoir ; le parent que
 * tous partagent deja non plus (le deplacement ne changerait rien de ce qu'on voit dans l'arbre, sinon l'ordre).
 */
export function destinations(d: DessinSvg, ids: readonly string[]): Destination[] {
  const us = unites(d, ids);
  const choisis = new Set(us);
  const parents = new Set(us.map(id => parentDe(d, id)));
  const commun = parents.size === 1 ? [...parents][0] ?? null : undefined;
  const out: Destination[] = [{ id: null, libelle: 'Racine', refusee: commun === null }];
  const parcourir = (freres: readonly NoeudArbre[], chemin: string, interdit: boolean) => {
    for (let k = freres.length - 1; k >= 0; k--) {
      const n = freres[k];
      if (n?.genre !== 'groupe') continue;
      const g: Groupe = n.groupe, libelle = (chemin ? chemin + ' › ' : '') + nomDeGroupe(g);
      const sous = interdit || choisis.has(g.id);
      out.push({ id: g.id, libelle, refusee: sous || commun === g.id });
      parcourir(n.enfants, libelle, sous);
    }
  };
  parcourir(arbreDe(d).racine, '', false);
  return out;
}

/** Les lignes de `a` a `b` compris (dans un ordre ou dans l'autre) : l'etendue d'un Maj+clic ou d'un Maj+fleche. */
export function etendue(lignes: readonly LigneArbre[], a: number, b: number): string[] {
  const [debut, fin] = a <= b ? [a, b] : [b, a];
  return lignes.slice(Math.max(0, debut), fin + 1).map(l => l.id);
}
