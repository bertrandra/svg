// Les couleurs du dessin : lesquelles, combien de formes, remplacement partout. Une couleur dont on
// a tout masque reste dans la liste, sans quoi on ne pourrait plus la rendre.
//
// Un cote peint d'un degrade ou d'un motif (modele v2, ADR-0012 annexe 1 §6) n'est pas une couleur du dessin : sa couleur de repli
// n'est qu'une approximation pour qui ne connait que les couleurs unies. Les listes l'ignorent et les remplacements n'y touchent pas
// (jamais un repli qui changerait sans que le degrade change) ; les arrets deviendront des couleurs a l'etape 13. Sur un dessin plat,
// `fondUni` et `traitUni` rendent exactement `remplissage` et `contour` : rien n'y change (loi du dessin plat).

import { au } from '../../util/tableaux.js';
import type { DessinSvg, Forme } from './types.js';

/** Le remplissage tel que les listes de couleurs le lisent : rien sous une peinture non unie. */
export const fondUni = (f: Forme): string | null => (f.peintureRemplissage === undefined ? f.remplissage : null);
/** Le contour tel que les listes de couleurs le lisent : rien sous une peinture non unie. */
export const traitUni = (f: Forme): string | null => (f.peintureContour === undefined ? f.contour : null);

export interface CouleurDuDessin { couleur: string; formes: number }

/** Les couleurs employees (remplissages et contours des formes visibles), les plus presentes d'abord. */
export function couleursDuDessin(dessin: DessinSvg): CouleurDuDessin[] {
  const n = new Map<string, number>();
  for (const f of dessin.formes) {
    if (!f.visible) continue;
    for (const c of [fondUni(f), traitUni(f)]) if (c) n.set(c, (n.get(c) ?? 0) + 1);
  }
  return [...n].map(([couleur, formes]) => ({ couleur, formes })).sort((a, b) => b.formes - a.formes || (a.couleur < b.couleur ? -1 : 1));
}

export function remplacerCouleur(dessin: DessinSvg, de: string, vers: string | null): DessinSvg {
  let change = false;
  const formes = dessin.formes.map(f => {
    const r = fondUni(f) === de ? vers : f.remplissage, c = traitUni(f) === de ? vers : f.contour;
    if (r === f.remplissage && c === f.contour) return f;
    change = true;
    return { ...f, remplissage: r, contour: c };
  });
  return change ? { ...dessin, formes } : dessin;
}

/**
 * Comme `remplacerCouleur`, mais sur le remplissage seul, le contour seul, ou les deux. C'est ce que
 * fait la ligne d'une couleur quand on la lit « Fond » ou « Trait » : changer le fond d'un rouge ne
 * doit pas toucher le contour rouge d'une autre forme. Toutes les formes sont concernees, masquees et
 * verrouillees comprises : c'est un remplacement nomme, comme celui de « Couleurs du dessin ».
 */
export function remplacerCouleurSur(dessin: DessinSvg, de: string, vers: string | null, sur: SurCouleur): DessinSvg {
  if (sur === 'tout') return remplacerCouleur(dessin, de, vers);
  let change = false;
  const formes = dessin.formes.map(f => {
    if (sur === 'remplissage') {
      if (fondUni(f) !== de || vers === de) return f;
      change = true;
      return { ...f, remplissage: vers };
    }
    if (traitUni(f) !== de || vers === de) return f;
    change = true;
    return { ...f, contour: vers };
  });
  return change ? { ...dessin, formes } : dessin;
}

export const idsDeCouleur = (dessin: DessinSvg, couleur: string): string[] =>
  dessin.formes.filter(f => f.visible && !f.verrouille && (fondUni(f) === couleur || traitUni(f) === couleur)).map(f => f.id);

/** La couleur lue sur le remplissage, sur le contour, ou sur l'un et l'autre. */
export type SurCouleur = 'tout' | 'remplissage' | 'contour';

/** Les formes d'une couleur : toutes, et celles qu'on peut choisir (visibles et non verrouillees). */
export interface GroupeCouleur { couleur: string; ids: string[]; libres: string[]; visibles: number; verrouillees: number }

/**
 * Les couleurs du dessin avec toutes leurs formes, cachees et verrouillees comprises : une couleur
 * dont on a tout masque doit rester dans la liste, sans quoi on ne pourrait plus la rendre.
 */
export function groupesDeCouleur(dessin: DessinSvg, sur: SurCouleur = 'tout'): GroupeCouleur[] {
  const groupes = new Map<string, Forme[]>();
  for (const f of dessin.formes) {
    const fond = fondUni(f), trait = traitUni(f);
    const lues = sur === 'remplissage' ? [fond] : sur === 'contour' ? [trait] : fond === trait ? [fond] : [fond, trait];
    // On ajoute au groupe en place : recopier le tableau a chaque forme couterait n au carre pour une couleur dominante.
    for (const c of lues) if (c) { const g = groupes.get(c); if (g) g.push(f); else groupes.set(c, [f]); }
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

/**
 * Vrai quand ce qu'une liste de couleurs lit sur les formes (identifiant, remplissage, contour,
 * visibilite, verrou) est le meme : les coordonnees, l'epaisseur ou le style du trait n'y comptent pas.
 * Pendant un deplacement, seules les coordonnees changent : les couleurs n'ont pas a se relire.
 */
export function memesCouleurs(avant: readonly Forme[], apres: readonly Forme[]): boolean {
  if (avant === apres) return true;
  if (avant.length !== apres.length) return false;
  for (let i = 0; i < avant.length; i++) {
    const a = au(avant, i), b = au(apres, i);
    if (a === b) continue;
    if (a.id !== b.id || a.remplissage !== b.remplissage || a.contour !== b.contour || a.visible !== b.visible || a.verrouille !== b.verrouille) return false;
    // Poser ou retirer un degrade change ce que les listes lisent, meme a couleur de repli egale ; le deplacer, non.
    if ((a.peintureRemplissage === undefined) !== (b.peintureRemplissage === undefined) || (a.peintureContour === undefined) !== (b.peintureContour === undefined)) return false;
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
 * Les formes qu'on peut choisir et qui ont la couleur de la forme `idModele` : son remplissage, ou son
 * contour quand elle n'a pas de remplissage. Vide si la forme est inconnue ou sans aucune couleur.
 */
export function idsMemeCouleur(dessin: DessinSvg, idModele: string): string[] {
  const modele = dessin.formes.find(f => f.id === idModele);
  if (!modele) return [];
  const sur: SurCouleur = fondUni(modele) ? 'remplissage' : 'contour';
  const couleur = fondUni(modele) ?? traitUni(modele);
  if (!couleur) return [];
  return dessin.formes.filter(f => f.visible && !f.verrouille && (sur === 'remplissage' ? fondUni(f) : traitUni(f)) === couleur).map(f => f.id);
}
