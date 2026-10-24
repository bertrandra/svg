// La provenance des formes (CC BY 3.0 des formes de game-icons.net) : qui la porte, comment elle se
// fusionne quand des formes s'assemblent, comment elle s'ecrit. Pur.
//
// Le principe : `Forme.origine` n'existe que pour une forme issue d'une source creditee. Tant qu'aucune
// forme n'en porte, rien de ce fichier n'ecrit un octet (les references d'ecriture tiennent). Des qu'une
// forme visible en porte, l'ecriture ajoute `data-origine` sur son <path> (pour que la relecture la retrouve)
// et un <metadata> en tete du SVG (pour que la mention voyage avec le fichier).

import { normaliserOrigines, texteMetadonnees } from '../../model/credits.js';
import { echapperAttribut } from '../../util/xml.js';
import type { DessinSvg, Forme } from './types.js';

/** L'attribut du <path> qui porte les origines d'une forme, separees par une espace. */
export const ATTRIBUT_ORIGINE = 'data-origine';

/** Les origines d'un attribut lu : celles qu'on sait crediter, normalisees ; undefined s'il n'en reste aucune. */
export function lireOrigines(attribut: string | undefined): readonly string[] | undefined {
  const liste = normaliserOrigines((attribut ?? '').split(/\s+/).filter(Boolean));
  return liste.length ? liste : undefined;
}

/** Les origines de toutes ces formes, reunies : triees, sans doublon, vides si aucune n'en porte. */
export function originesDe(formes: readonly Forme[]): readonly string[] {
  return normaliserOrigines(formes.flatMap(f => f.origine ?? []));
}

const memes = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * La forme avec ces origines en plus des siennes. Rend la forme elle-meme quand rien ne change, et SANS champ
 * `origine` quand il n'y a rien a ajouter : une forme sans provenance reste byte pour byte ce qu'elle etait.
 */
export function avecOrigines(f: Forme, origines: readonly string[]): Forme {
  const toutes = normaliserOrigines([...(f.origine ?? []), ...origines]);
  if (!toutes.length || memes(toutes, f.origine ?? [])) return f;
  return { ...f, origine: toutes };
}

/** Le dessin dont toutes les formes portent cette origine en plus des leurs (une forme de la bibliotheque qu'on ouvre ou qu'on insere). */
export function marquerOrigine(dessin: DessinSvg, origine: string): DessinSvg {
  if (!normaliserOrigines([origine]).length) return dessin;
  return { ...dessin, formes: dessin.formes.map(f => avecOrigines(f, [origine])) };
}

/** Ce que l'ecriture ajoute au <path> d'une forme : ` data-origine="…"`, ou rien. */
export const attributOrigine = (f: Forme): string => (f.origine?.length ? ' ' + ATTRIBUT_ORIGINE + '="' + echapperAttribut(f.origine.join(' ')) + '"' : '');

/** L'element <metadata> d'attribution des formes ecrites, ou rien quand aucune ne porte d'origine. */
export function metadonnees(ecrites: readonly Forme[]): string {
  const texte = texteMetadonnees(originesDe(ecrites));
  // Le texte ne porte ni &, ni <, ni > (origines validees, mention fixe) ; on les echappe quand meme, par prudence.
  return texte ? '<metadata>' + texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</metadata>' : '';
}
