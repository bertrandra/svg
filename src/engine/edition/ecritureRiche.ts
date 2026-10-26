// L'ecriture d'un dessin qui n'est pas plat (ADR-0012, annexe 2 §3) : la seule a poser des <g>, des <defs> et le marqueur
// `data-ed-modele`. Elle ne partage AUCUNE ligne avec l'ecriture plate (ecriture.ts, qui ne l'appelle que si `estPlat` est faux) :
// un dessin plat ne peut pas changer d'un octet par ici. Elle emprunte a l'ecriture plate sa facon d'ecrire une feuille (meme cache,
// memes octets pour une feuille sans champ v2) et laisse les fonctionnalites (fonctionnalites.ts) ajouter ce qu'elles portent.
//
// Squelette pose a l'etape 0 : la balise <svg> et son marqueur, <defs> en premier enfant et seulement s'il y a une definition
// employee, le corps en parcours de l'arbre (un groupe visible ecrit <g …> et ses enfants, un groupe masque rien), les attributs et
// les definitions des fonctionnalites. Les etapes y branchent leurs crochets ; elles n'ont pas a editer ce fichier.

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

/** Le SVG d'un dessin riche. `fonctions` : le catalogue, ou une liste donnee (les tests des points d'extension). */
export function ecrireDessinRiche(dessin: DessinSvg, precision: number, ecrivain: EcrivainFeuilles, fonctions: readonly Fonctionnalite[] = FONCTIONNALITES): string {
  const [x, y, l, h] = dessin.vb;
  const definitions = recueil();
  const corps = (c: DessinSvg): { texte: string; ecrites: Forme[] } => {
    const ecrites = c.formes.filter(f => visibleEffectif(c, f.id));
    const ecrire = ecrivain(c, ecrites);
    const feuille = (f: Forme): string => {
      for (const k of fonctions) {
        const e = k.ecriture?.elementFeuille?.(f, ctx);
        if (e !== null && e !== undefined) return e;
      }
      const peinte = fonctions.reduce<Forme>((v, k) => k.ecriture?.peindreFeuille?.(v, ctx) ?? v, f);
      const s = ecrire(peinte), a = attributsTries(fonctions.flatMap(k => k.ecriture?.attributsFeuille?.(f, ctx) ?? []));
      return a ? s.slice(0, -2) + a + '/>' : s;
    };
    const noeuds = (t: readonly NoeudArbre[]): string => t.map(n => {
      if (n.genre === 'feuille') return n.forme.visible ? feuille(n.forme) : '';
      if (!n.groupe.visible) return '';
      const dedans = noeuds(n.enfants);
      return dedans ? '<g' + attributsTries(fonctions.flatMap(k => k.ecriture?.attributsGroupe?.(n.groupe, ctx) ?? [])) + '>' + dedans + '</g>' : '';
    }).join('');
    return { texte: noeuds(arbreDe(c).racine), ecrites };
  };
  const ctx: ContexteEcriture = { precision, definitions, contenu: (c: Contenu) => corps({ ...c, vb: dessin.vb }).texte };
  const { texte, ecrites } = corps(dessin);
  const xlink = dessin.formes.some(f => f.image !== undefined) ? ' xmlns:xlink="' + ESPACE_XLINK + '"' : '';
  return '<svg xmlns="http://www.w3.org/2000/svg"' + xlink + ' viewBox="' + [x, y, l, h].map(v => nb(v, 3)).join(' ') + '" width="' + nb(l, 3) + '" height="' + nb(h, 3) + '" '
    + ATTRIBUT_MODELE + '="' + VERSION_MODELE + '">' + definitions.ecrire() + metadonnees(ecrites) + texte + '</svg>';
}
