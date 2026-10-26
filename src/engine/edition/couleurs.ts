// Les couleurs du dessin : lesquelles, combien de formes, remplacement partout. Une couleur dont on
// a tout masque reste dans la liste, sans quoi on ne pourrait plus la rendre.
//
// Un cote peint d'un degrade ou d'un motif (modele v2, ADR-0012 annexe 1 §6 ; etape 13d) porte des couleurs du dessin : les arrets
// du degrade, les couleurs que peint la tuile du motif (ses feuilles visibles, leurs arrets et leurs motifs compris). Sa couleur de
// repli, elle, n'en est pas une : ce n'est qu'une approximation pour qui ne connait que les couleurs unies. Les listes lisent donc
// les arrets et la tuile, jamais le repli ; un remplacement change les arrets et les feuilles de la tuile, puis recalcule le repli
// comme la lecture le calcule (jamais un repli qui changerait sans que la peinture change). Le contenu d'un masque n'est pas une
// couleur visible (de la luminance, annexe 3 §2) et celui d'une decoupe n'est que de la geometrie : ni l'un ni l'autre n'y entre.
// Sur un dessin plat, aucune forme n'a de peinture : chaque cote ne porte que `remplissage` ou `contour`, et rien ne change (loi du
// dessin plat).

import { lireCode, versHex } from '../../util/couleur.js';
import { au } from '../../util/tableaux.js';
import { visibleEffectif } from './arbre.js';
import { couleurDeRepli, estDegrade } from './degrades.js';
import { couleurDeRepliMotif } from './fonctions/motifs.js';
import type { Contenu, DessinSvg, Forme, Peinture } from './types.js';

/** Le remplissage uni d'une forme : rien sous une peinture non unie (sa couleur de repli n'est pas une couleur du dessin). */
export const fondUni = (f: Forme): string | null => (f.peintureRemplissage === undefined ? f.remplissage : null);
/** Le contour uni d'une forme : rien sous une peinture non unie. */
export const traitUni = (f: Forme): string | null => (f.peintureContour === undefined ? f.contour : null);

/** La couleur lue sur le remplissage, sur le contour, ou sur l'un et l'autre. */
export type SurCouleur = 'tout' | 'remplissage' | 'contour';

/** Un cote d'une forme. */
export type CoteCouleur = 'remplissage' | 'contour';

const AUCUNE: readonly string[] = [];
const memoPeintures = new WeakMap<object, readonly string[]>();

/**
 * Les couleurs que porte une peinture non unie, sans doublon, dans l'ordre de rencontre. Un degrade : ses arrets, tous (un arret
 * transparent ou de part nulle est dans le fichier et se remplace, comme un fond uni d'opacite nulle reste dans les listes). Un
 * motif : les couleurs des feuilles que sa tuile peint (visibles dans la tuile, comme le nuancier et la couleur de repli), fond et
 * trait, un degrade ou un motif de la tuile par leurs propres couleurs. Memorise par liste d'arrets et par tuile : deplacer une forme
 * garde l'une et l'autre.
 */
export function couleursDePeinture(p: Peinture): readonly string[] {
  const cle: object = estDegrade(p) ? p.arrets : p.contenu;
  const deja = memoPeintures.get(cle);
  if (deja) return deja;
  const vues = new Set<string>();
  if (estDegrade(p)) for (const a of p.arrets) vues.add(a.couleur);
  else {
    const c: Contenu = p.contenu;
    for (const f of c.formes) {
      if (!visibleEffectif(c, f.id)) continue;
      for (const x of couleursDuCote(f, 'remplissage')) vues.add(x);
      for (const x of couleursDuCote(f, 'contour')) vues.add(x);
    }
  }
  const r = vues.size ? [...vues] : AUCUNE;
  memoPeintures.set(cle, r);
  return r;
}

/** Les couleurs d'un cote d'une forme : sa couleur unie, ou celles de sa peinture non unie (jamais son repli) ; rien sans peinture. */
export function couleursDuCote(f: Forme, cote: CoteCouleur): readonly string[] {
  const p = cote === 'remplissage' ? f.peintureRemplissage : f.peintureContour;
  if (p !== undefined) return couleursDePeinture(p);
  const c = cote === 'remplissage' ? f.remplissage : f.contour;
  return c ? [c] : AUCUNE;
}

/**
 * Les couleurs d'une forme lues sur le remplissage, le contour, ou les deux, sans doublon (le fond d'abord). Une forme dont un arret
 * ou une feuille de tuile porte une couleur est « de cette couleur ».
 */
export function couleursDeForme(f: Forme, sur: SurCouleur): readonly string[] {
  if (sur !== 'tout') return couleursDuCote(f, sur);
  const fond = couleursDuCote(f, 'remplissage'), trait = couleursDuCote(f, 'contour');
  if (!trait.length) return fond;
  if (!fond.length) return trait;
  // Le cas d'un dessin plat, sans ensemble a construire : une couleur de chaque cote.
  if (fond.length === 1 && trait.length === 1) return au(fond, 0) === au(trait, 0) ? fond : [au(fond, 0), au(trait, 0)];
  return [...new Set([...fond, ...trait])];
}

export interface CouleurDuDessin { couleur: string; formes: number }

/**
 * Les couleurs employees (remplissages et contours des formes visibles), les plus presentes d'abord. Chaque cote compte une fois par
 * couleur : une forme au fond et au trait rouges compte deux fois, un degrade a deux arrets rouges une seule.
 */
export function couleursDuDessin(dessin: DessinSvg): CouleurDuDessin[] {
  const n = new Map<string, number>();
  for (const f of dessin.formes) {
    if (!f.visible) continue;
    for (const c of couleursDuCote(f, 'remplissage')) n.set(c, (n.get(c) ?? 0) + 1);
    for (const c of couleursDuCote(f, 'contour')) n.set(c, (n.get(c) ?? 0) + 1);
  }
  return [...n].map(([couleur, formes]) => ({ couleur, formes })).sort((a, b) => b.formes - a.formes || (a.couleur < b.couleur ? -1 : 1));
}

/** Ce qu'un remplacement fait de chaque couleur : la couleur qui la remplace (null : plus de couleur). */
export type TableCouleurs = ReadonlyMap<string, string | null>;

/** La couleur d'un arret apres remplacement : un `#rrggbb` en minuscules, ou null pour le laisser (pas dans la table, rien, ou illisible). */
function arretVers(table: TableCouleurs, couleur: string): string | null {
  const vers = table.get(couleur);
  if (vers === undefined || vers === null) return null;
  const rgb = lireCode(vers);
  return rgb ? versHex(rgb) : null;
}

/**
 * La peinture recoloree par `table`, la meme si rien ne change. Un degrade : ses arrets (un arret ne peut pas etre « sans couleur » :
 * un remplacement par rien le laisse ; retirer la peinture d'un cote se fait a l'inspecteur). Un motif : les feuilles de sa tuile,
 * masquees comprises (comme les formes masquees du dessin : elles reviendraient sinon dans l'ancienne couleur), fond et trait.
 * `memo` partage le resultat d'une peinture partagee (un meme degrade au fond et au trait, mille formes a un motif) : elle le reste.
 */
function recolorerPeinture(p: Peinture, table: TableCouleurs, memo: Map<Peinture, Peinture>): Peinture {
  const deja = memo.get(p);
  if (deja) return deja;
  let r: Peinture = p;
  if (estDegrade(p)) {
    let change = false;
    const arrets = p.arrets.map(a => {
      const v = arretVers(table, a.couleur);
      if (v === null || v === a.couleur) return a;
      change = true;
      return { ...a, couleur: v };
    });
    if (change) r = { ...p, arrets };
  } else {
    let change = false;
    const formes = p.contenu.formes.map(f => {
      const x = recolorerForme(f, table, 'tout', memo);
      if (x !== f) change = true;
      return x;
    });
    if (change) r = { ...p, contenu: { ...p.contenu, formes } };
  }
  memo.set(p, r);
  return r;
}

/** La couleur de repli d'une peinture, calculee comme a la lecture. */
const repliDe = (p: Peinture): string => (estDegrade(p) ? couleurDeRepli(p.arrets) : couleurDeRepliMotif(p.contenu));

/**
 * La forme recoloree par `table` sur le cote voulu, la meme si rien ne change : un cote uni prend la couleur de la table, un cote
 * peint change ses arrets ou sa tuile, et sa couleur de repli est recalculee (seulement si la peinture a change). `memo` garde
 * partagees les peintures partagees, d'une forme a l'autre d'un meme remplacement.
 */
export function recolorerForme(f: Forme, table: TableCouleurs, sur: SurCouleur, memo: Map<Peinture, Peinture> = new Map()): Forme {
  let r = f.remplissage, c = f.contour, pr = f.peintureRemplissage, pc = f.peintureContour;
  if (sur !== 'contour') {
    if (pr === undefined) { const v = r !== null ? table.get(r) : undefined; if (v !== undefined) r = v; }
    else { const x = recolorerPeinture(pr, table, memo); if (x !== pr) { pr = x; r = repliDe(x); } }
  }
  if (sur !== 'remplissage') {
    if (pc === undefined) { const v = c !== null ? table.get(c) : undefined; if (v !== undefined) c = v; }
    else { const x = recolorerPeinture(pc, table, memo); if (x !== pc) { pc = x; c = repliDe(x); } }
  }
  if (pr === f.peintureRemplissage && pc === f.peintureContour) return r === f.remplissage && c === f.contour ? f : { ...f, remplissage: r, contour: c };
  return { ...f, remplissage: r, contour: c, ...(pr !== undefined ? { peintureRemplissage: pr } : {}), ...(pc !== undefined ? { peintureContour: pc } : {}) };
}

/**
 * Remplace d'un coup chaque couleur de la table, sur le cote voulu, dans toutes les formes (masquees et verrouillees comprises : c'est
 * un remplacement nomme, comme celui de « Couleurs du dessin »). Une seule passe : remplacer A par B et B par A echange les deux
 * couleurs, sans jeton intermediaire. Le meme dessin si rien ne change.
 */
export function remplacerCouleurs(dessin: DessinSvg, table: TableCouleurs, sur: SurCouleur = 'tout'): DessinSvg {
  if (!table.size) return dessin;
  let change = false;
  const memo = new Map<Peinture, Peinture>();
  const formes = dessin.formes.map(f => {
    const x = recolorerForme(f, table, sur, memo);
    if (x !== f) change = true;
    return x;
  });
  return change ? { ...dessin, formes } : dessin;
}

export function remplacerCouleur(dessin: DessinSvg, de: string, vers: string | null): DessinSvg {
  return remplacerCouleurs(dessin, new Map([[de, vers]]));
}

/**
 * Comme `remplacerCouleur`, mais sur le remplissage seul, le contour seul, ou les deux. C'est ce que
 * fait la ligne d'une couleur quand on la lit « Fond » ou « Trait » : changer le fond d'un rouge ne
 * doit pas toucher le contour rouge d'une autre forme. Toutes les formes sont concernees, masquees et
 * verrouillees comprises : c'est un remplacement nomme, comme celui de « Couleurs du dessin ». Un fond
 * peint d'un motif change toutes les couleurs de sa tuile (fond et trait des feuilles) : elles sont la peinture de ce fond.
 */
export function remplacerCouleurSur(dessin: DessinSvg, de: string, vers: string | null, sur: SurCouleur): DessinSvg {
  return remplacerCouleurs(dessin, new Map([[de, vers]]), sur);
}

/** Les formes qu'on peut choisir (visibles, non verrouillees) dont une couleur, unie, d'arret ou de tuile, est `couleur`. */
export const idsDeCouleur = (dessin: DessinSvg, couleur: string): string[] =>
  dessin.formes.filter(f => f.visible && !f.verrouille && couleursDeForme(f, 'tout').includes(couleur)).map(f => f.id);

/** Les formes d'une couleur : toutes, et celles qu'on peut choisir (visibles et non verrouillees). */
export interface GroupeCouleur { couleur: string; ids: string[]; libres: string[]; visibles: number; verrouillees: number }

/**
 * Les couleurs du dessin avec toutes leurs formes, cachees et verrouillees comprises : une couleur
 * dont on a tout masque doit rester dans la liste, sans quoi on ne pourrait plus la rendre. Une forme
 * compte une fois par couleur, qu'elle la porte unie, sur un arret ou dans sa tuile.
 */
export function groupesDeCouleur(dessin: DessinSvg, sur: SurCouleur = 'tout'): GroupeCouleur[] {
  const groupes = new Map<string, Forme[]>();
  for (const f of dessin.formes) {
    // On ajoute au groupe en place : recopier le tableau a chaque forme couterait n au carre pour une couleur dominante.
    for (const c of couleursDeForme(f, sur)) { const g = groupes.get(c); if (g) g.push(f); else groupes.set(c, [f]); }
  }
  return [...groupes]
    .map(([couleur, fs]) => ({
      couleur, ids: fs.map(f => f.id), libres: fs.filter(f => f.visible && !f.verrouille).map(f => f.id),
      visibles: fs.filter(f => f.visible).length, verrouillees: fs.filter(f => f.verrouille).length
    }))
    .sort((a, b) => b.ids.length - a.ids.length || (a.couleur < b.couleur ? -1 : 1));
}

/** Deux groupes disent la meme chose : meme couleur, memes formes dans le meme ordre, memes comptes. */
function groupesEgaux(a: GroupeCouleur, b: GroupeCouleur): boolean {
  if (a === b) return true;
  if (a.couleur !== b.couleur || a.visibles !== b.visibles || a.verrouillees !== b.verrouillees) return false;
  return memesIds(a.ids, b.ids) && memesIds(a.libres, b.libres);
}

function memesIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Les groupes `apres` en reprenant les objets de `avant` pour ceux qui n'ont pas change. Une ligne de
 * l'interface qui recoit le meme objet n'a pas a se redessiner ; si rien n'a change, c'est le tableau
 * `avant` lui-meme qui revient. Les valeurs sont celles de `apres`, jamais autre chose.
 */
export function partagerGroupes(avant: GroupeCouleur[], apres: GroupeCouleur[]): GroupeCouleur[] {
  const connus = new Map<string, GroupeCouleur>();
  for (const g of avant) connus.set(g.couleur, g);
  let identique = avant.length === apres.length;
  const rendus = apres.map((g, i) => {
    const ancien = connus.get(g.couleur);
    const repris = ancien && groupesEgaux(ancien, g) ? ancien : g;
    if (identique && repris !== au(avant, i)) identique = false;
    return repris;
  });
  return identique ? avant : rendus;
}

/** Deux peintures portent les memes couleurs, dans le meme ordre (deplacer une forme garde ses arrets et sa tuile, le meme objet). */
function memesCouleursPeinture(a: Peinture | undefined, b: Peinture | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  return memesIds(couleursDePeinture(a), couleursDePeinture(b));
}

/**
 * Vrai quand ce qu'une liste de couleurs lit sur les formes (identifiant, remplissage, contour,
 * visibilite, verrou, couleurs des peintures) est le meme : les coordonnees, l'epaisseur ou le style du trait n'y comptent pas.
 * Pendant un deplacement, seules les coordonnees changent : les couleurs n'ont pas a se relire.
 */
export function memesCouleurs(avant: readonly Forme[], apres: readonly Forme[]): boolean {
  if (avant === apres) return true;
  if (avant.length !== apres.length) return false;
  for (let i = 0; i < avant.length; i++) {
    const a = au(avant, i), b = au(apres, i);
    if (a === b) continue;
    if (a.id !== b.id || a.remplissage !== b.remplissage || a.contour !== b.contour || a.visible !== b.visible || a.verrouille !== b.verrouille) return false;
    // Poser, retirer ou recolorer une peinture change ce que les listes lisent, meme a couleur de repli egale ; la deplacer, non.
    if (!memesCouleursPeinture(a.peintureRemplissage, b.peintureRemplissage) || !memesCouleursPeinture(a.peintureContour, b.peintureContour)) return false;
  }
  return true;
}

/** Les groupes de couleur d'un dessin, avec le dessin qui les a produits : de quoi savoir s'ils tiennent encore. */
export interface LectureCouleurs { dessin: DessinSvg; sur: SurCouleur; groupes: GroupeCouleur[] }

/**
 * `groupesDeCouleur`, mais en gardant la lecture d'avant quand les couleurs n'ont pas bouge, et en
 * partageant les groupes inchanges quand elles ont bougé. Le resultat vaut toujours
 * `groupesDeCouleur(dessin, sur)` ; seule l'identite des objets change. La lecture rendue garde le
 * dessin ancien quand les couleurs n'ont pas bouge : ce dessin est donc aussi stable que les couleurs,
 * et sert de cle a tout ce qui ne depend que d'elles (les nuances proches).
 */
export function lireCouleurs(dessin: DessinSvg, sur: SurCouleur, precedente: LectureCouleurs | null): LectureCouleurs {
  if (precedente && precedente.sur === sur && memesCouleurs(precedente.dessin.formes, dessin.formes)) return precedente;
  const groupes = groupesDeCouleur(dessin, sur);
  return { dessin, sur, groupes: precedente && precedente.sur === sur ? partagerGroupes(precedente.groupes, groupes) : groupes };
}

/** Deux couleurs du dessin disent la meme chose : meme code, meme nombre de formes. */
const memeCouleurDuDessin = (a: CouleurDuDessin, b: CouleurDuDessin) => a.couleur === b.couleur && a.formes === b.formes;

/**
 * Les couleurs `apres` en reprenant les objets de `avant` pour celles qui n'ont pas change, et le tableau
 * `avant` lui-meme si rien n'a bouge : une ligne de l'interface qui recoit le meme objet ne se redessine pas.
 * Les valeurs sont celles de `apres`, jamais autre chose.
 */
export function partagerCouleursDuDessin(avant: CouleurDuDessin[], apres: CouleurDuDessin[]): CouleurDuDessin[] {
  const connues = new Map<string, CouleurDuDessin>();
  for (const c of avant) connues.set(c.couleur, c);
  let identique = avant.length === apres.length;
  const rendues = apres.map((c, i) => {
    const ancienne = connues.get(c.couleur);
    const reprise = ancienne && memeCouleurDuDessin(ancienne, c) ? ancienne : c;
    if (identique && reprise !== au(avant, i)) identique = false;
    return reprise;
  });
  return identique ? avant : rendues;
}

/** Les couleurs du panneau « Couleurs du dessin », avec le dessin qui les a produites. */
export interface LectureCouleursDuDessin { dessin: DessinSvg; couleurs: CouleurDuDessin[] }

/**
 * `couleursDuDessin`, mais en gardant la lecture d'avant quand les couleurs n'ont pas bouge (un deplacement
 * ne change que des coordonnees) et en partageant les couleurs inchangees quand elles ont bouge. Le resultat
 * vaut toujours `couleursDuDessin(dessin)` : meme comptes (une forme au remplissage et au contour de meme
 * couleur compte deux fois), formes masquees ignorees. C'est le pendant de `lireCouleurs` pour ce panneau,
 * qui ne lit pas comme `groupesDeCouleur`.
 */
export function lireCouleursDuDessin(dessin: DessinSvg, precedente: LectureCouleursDuDessin | null): LectureCouleursDuDessin {
  if (precedente && memesCouleurs(precedente.dessin.formes, dessin.formes)) return precedente;
  const couleurs = couleursDuDessin(dessin);
  return { dessin, couleurs: precedente ? partagerCouleursDuDessin(precedente.couleurs, couleurs) : couleurs };
}

/**
 * Les formes qu'on peut choisir et qui ont la couleur de la forme `idModele` : celles de son remplissage, ou de son contour quand
 * le remplissage n'en a aucune. Une forme en est quand le meme cote porte TOUTES ces couleurs : pour un modele uni, sa couleur (unie,
 * ou sur un arret, ou dans une tuile : la regle de `idsDeCouleur`) ; pour un modele peint, chacune des couleurs de sa peinture (une
 * forme unie n'est donc pas « de la couleur » d'un degrade a deux teintes). Vide si la forme est inconnue ou sans aucune couleur.
 */
export function idsMemeCouleur(dessin: DessinSvg, idModele: string): string[] {
  const modele = dessin.formes.find(f => f.id === idModele);
  if (!modele) return [];
  const fond = couleursDuCote(modele, 'remplissage');
  const sur: CoteCouleur = fond.length ? 'remplissage' : 'contour';
  const voulues = fond.length ? fond : couleursDuCote(modele, 'contour');
  if (!voulues.length) return [];
  return dessin.formes.filter(f => {
    if (!f.visible || f.verrouille) return false;
    const siennes = couleursDuCote(f, sur);
    return voulues.every(c => siennes.includes(c));
  }).map(f => f.id);
}
