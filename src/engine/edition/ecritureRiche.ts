// L'ecriture d'un dessin qui n'est pas plat (ADR-0012, annexe 2 §3) : la seule a poser des <g>, des <defs> et le marqueur
// `data-ed-modele`. Elle ne partage AUCUNE ligne avec l'ecriture plate (ecriture.ts, qui ne l'appelle que si `estPlat` est faux) :
// un dessin plat ne peut pas changer d'un octet par ici. Elle emprunte a l'ecriture plate sa facon d'ecrire une feuille (meme cache,
// memes octets pour une feuille sans champ v2) et laisse les fonctionnalites (fonctionnalites.ts) ajouter ce qu'elles portent.
//
// Squelette pose a l'etape 0 : la balise <svg> et son marqueur, <defs> en premier enfant et seulement s'il y a une definition
// employee, le corps en parcours de l'arbre (un groupe visible ecrit <g …> et ses enfants, un groupe masque rien), les attributs et
// les definitions des fonctionnalites. Les etapes y branchent leurs crochets ; elles n'ont pas a editer ce fichier.
//
// Le marqueur ne se pose que si l'ecriture porte vraiment quelque chose du modele v2 (un <g>, une definition, un attribut ou un
// element d'une fonctionnalite) : un dessin riche dont rien de riche ne s'ecrit (ses groupes masques ou vides) donne les octets de
// l'ecriture plate, et sa relecture, plate, les redonne (le point fixe de l'annexe 2 §3, point 7).

import { nb } from './chemins.js';
import type { Contenu, DessinSvg, Forme } from './types.js';
import { arbreDe, visibleEffectif, type NoeudArbre } from './arbre.js';
import { recueil } from './definitions.js';
import { attributsTries, type ContexteEcriture, type Fonctionnalite } from './fonctionnalites.js';
import { metadonnees } from './provenance.js';
import { FONCTIONNALITES } from './catalogue.js';

/** Le marqueur d'un fichier qui emploie le modele v2, dernier attribut de <svg> ; jamais pose sur un dessin plat. */
export const ATTRIBUT_MODELE = 'data-ed-modele';
/** La version du modele que ce programme ecrit et sait lire ; un marqueur superieur sera refuse a la lecture (etape 1). */
export const VERSION_MODELE = 2;
const ESPACE_XLINK = 'http://www.w3.org/1999/xlink';

/**
 * Ce que l'ecriture plate prete a la riche : pour un dessin et ses feuilles ecrites, de quoi ecrire une feuille exactement comme elle
 * (le cache par forme, le lien d'un texte pose vers sa forme, l'operation de production quand l'appelant la veut).
 */
export type EcrivainFeuilles = (dessin: DessinSvg, ecrites: readonly Forme[]) => (f: Forme) => string;

/**
 * Le corps d'un contenu riche (feuilles et groupes, dans l'ordre de l'arbre), et les feuilles qui s'y ecrivent. `signaler` est appele
 * des que quelque chose de riche s'ecrit (un <g>, une feuille peinte, un attribut ou un element d'une fonctionnalite). Partage par
 * l'ecriture (ci-dessous) et par le rendu de la toile (rendu.ts), qui y ecrit le contenu d'une definition : ce qui se voit est ce qui
 * s'ecrit.
 */
export function ecrireCorps(c: DessinSvg, ctx: ContexteEcriture, ecrivain: EcrivainFeuilles, fonctions: readonly Fonctionnalite[], signaler: () => void): { texte: string; ecrites: Forme[] } {
  const ecrites = c.formes.filter(f => visibleEffectif(c, f.id));
  const ecrire = ecrivain(c, ecrites);
  // Les attributs v2 d'une feuille, apres sa peinture (les definitions se deposent dans l'ordre ou l'element les cite).
  const attributs = (f: Forme): string => attributsTries(fonctions.flatMap(k => k.ecriture?.attributsFeuille?.(f, ctx) ?? []));
  const feuille = (f: Forme): string => {
    for (const k of fonctions) {
      const e = k.ecriture?.elementFeuille?.(f, ctx);
      if (e === null || e === undefined) continue;
      signaler();
      // Un element entier (une image) recoit aussi les attributs v2 de la feuille (son filtre), avant de se fermer.
      const a = e.endsWith('/>') ? attributs(f) : '';
      return a ? e.slice(0, -2) + a + '/>' : e;
    }
    const peinte = fonctions.reduce<Forme>((v, k) => k.ecriture?.peindreFeuille?.(v, ctx) ?? v, f);
    const s = ecrire(peinte), a = attributs(f);
    if (peinte !== f || a) signaler();
    return a ? s.slice(0, -2) + a + '/>' : s;
  };
  const noeuds = (t: readonly NoeudArbre[]): string => t.map(n => {
    if (n.genre === 'feuille') return n.forme.visible ? feuille(n.forme) : '';
    if (!n.groupe.visible) return '';
    const dedans = noeuds(n.enfants);
    if (!dedans) return '';
    signaler();
    return '<g' + attributsTries(fonctions.flatMap(k => k.ecriture?.attributsGroupe?.(n.groupe, ctx) ?? [])) + '>' + dedans + '</g>';
  }).join('');
  return { texte: noeuds(arbreDe(c).racine), ecrites };
}

/** Le SVG d'un dessin riche. `fonctions` : le catalogue, ou une liste donnee (les tests des points d'extension). */
export function ecrireDessinRiche(dessin: DessinSvg, precision: number, ecrivain: EcrivainFeuilles, fonctions: readonly Fonctionnalite[] = FONCTIONNALITES): string {
  const [x, y, l, h] = dessin.vb;
  const definitions = recueil();
  let riche = false;
  const signaler = (): void => { riche = true; };
  // Le contenu en cours d'ecriture, pour `ctx.courant` : le dessin, ou le contenu imbrique qu'ecrit `ctx.contenu`, le temps de l'ecrire.
  let courant: Contenu = dessin;
  const corps = (c: DessinSvg): { texte: string; ecrites: Forme[] } => {
    const avant = courant;
    courant = c;
    try {
      return ecrireCorps(c, ctx, ecrivain, fonctions, signaler);
    } finally {
      courant = avant;
    }
  };
  const ctx: ContexteEcriture = { precision, definitions, contenu: (c: Contenu) => corps({ ...c, vb: dessin.vb }).texte, courant: () => courant };
  const { texte, ecrites } = corps(dessin);
  const defs = definitions.ecrire();
  const marqueur = riche || defs !== '' ? ' ' + ATTRIBUT_MODELE + '="' + VERSION_MODELE + '"' : '';
  const xlink = dessin.formes.some(f => f.image !== undefined) ? ' xmlns:xlink="' + ESPACE_XLINK + '"' : '';
  return '<svg xmlns="http://www.w3.org/2000/svg"' + xlink + ' viewBox="' + [x, y, l, h].map(v => nb(v, 3)).join(' ') + '" width="' + nb(l, 3) + '" height="' + nb(h, 3) + '"'
    + marqueur + '>' + defs + metadonnees(ecrites) + texte + '</svg>';
}
