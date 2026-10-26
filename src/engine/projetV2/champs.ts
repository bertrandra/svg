// Les champs du modele v2 entre le dessin et le projet JSON, dans les deux sens (ADR-0012, ADR-0030) : un aller-retour par champ,
// pour que chaque etape qui livre un champ l'ajoute par UNE ligne ici (et une ligne de `model/projetV2/champs.ts`) sans editer le
// corps de `formeProjet` ni de `formeDuProjet` (engine/projet.ts). L'ordre est celui de la liste du modele : un champ s'ecrit apres
// `verrouille`, seulement s'il est present ; un dessin plat n'en porte aucun et son projet garde ses octets. Pur.

import type { Forme, Groupe } from '../editionSvg.js';
import type { FormeProjet, GroupeProjet } from '../../model/projet.js';

/** L'aller-retour d'un champ v2 : sa cle (la meme dans le modele et le projet), et sa copie dans chaque sens. */
export interface AllerRetour<M, P> {
  readonly cle: string;
  versProjet(valeur: unknown, x: M): unknown;
  versModele(valeur: unknown, x: P): unknown;
}

const identite = (v: unknown): unknown => v;

/** Les champs v2 d'une forme, dans l'ordre de `CHAMPS_FORME_V2` (model/projetV2/champs.ts). */
export const ALLERS_RETOURS_FORME: readonly AllerRetour<Forme, FormeProjet>[] = [
  { cle: 'parent', versProjet: identite, versModele: identite }
];

/** Les champs v2 d'un groupe au-dela de sa base (decoupe, masque, effets), dans l'ordre de `CHAMPS_GROUPE_V2` ; vide a l'etape 1. */
export const ALLERS_RETOURS_GROUPE: readonly AllerRetour<Groupe, GroupeProjet>[] = [];

/** Les champs v2 presents, copies dans un sens, a etaler apres les champs d'avant. */
function copier<X extends object>(x: X, liste: readonly AllerRetour<never, never>[], sens: 'versProjet' | 'versModele'): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of liste) {
    const v = (x as Record<string, unknown>)[c.cle];
    if (v !== undefined) out[c.cle] = (c[sens] as (v: unknown, x: X) => unknown)(v, x);
  }
  return out;
}

export const champsFormeVersProjet = (f: Forme): Record<string, unknown> => copier(f, ALLERS_RETOURS_FORME as readonly AllerRetour<never, never>[], 'versProjet');
export const champsFormeVersModele = (f: FormeProjet): Record<string, unknown> => copier(f, ALLERS_RETOURS_FORME as readonly AllerRetour<never, never>[], 'versModele');

/** Un groupe du modele en groupe de projet : sa base dans l'ordre du format, puis ses champs v2. */
export function groupeProjet(g: Groupe): GroupeProjet {
  return {
    id: g.id,
    ...(g.parent !== undefined ? { parent: g.parent } : {}),
    ...(g.nom !== undefined ? { nom: g.nom } : {}),
    visible: g.visible,
    verrouille: g.verrouille,
    ...(g.opacite !== undefined ? { opacite: g.opacite } : {}),
    ...(g.origine !== undefined ? { origine: [...g.origine] } : {}),
    ...copier(g, ALLERS_RETOURS_GROUPE as readonly AllerRetour<never, never>[], 'versProjet')
  } as GroupeProjet;
}

/** Un groupe de projet (deja valide) en groupe du modele. */
export function groupeDuProjet(g: GroupeProjet): Groupe {
  return {
    id: g.id,
    ...(g.parent !== undefined ? { parent: g.parent } : {}),
    ...(g.nom !== undefined ? { nom: g.nom } : {}),
    visible: g.visible,
    verrouille: g.verrouille,
    ...(g.opacite !== undefined ? { opacite: g.opacite } : {}),
    ...(g.origine !== undefined ? { origine: [...g.origine] } : {}),
    ...copier(g, ALLERS_RETOURS_GROUPE as readonly AllerRetour<never, never>[], 'versModele')
  } as Groupe;
}

/** Une table de groupes copiee dans un sens, dans l'ordre de ses cles ; absente si le dessin n'en a pas. */
export function tableVers<A, B>(t: Readonly<Record<string, A>> | undefined, f: (a: A) => B): { groupes?: Record<string, B> } {
  if (t === undefined) return {};
  const out: Record<string, B> = {};
  for (const [k, v] of Object.entries(t)) out[k] = f(v);
  return { groupes: out };
}
