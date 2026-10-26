// Le contexte d'edition d'une decoupe ou d'un masque (ADR-0012, annexe 8, paquet 8-D ; annexe 6 §2 et §3), vu de l'interface. Dans une
// lentille, le dessin qu'on voit et qu'on edite (`ModeleDessin.dessin`) est le dessin de travail que le moteur tire du contenu
// (engine/edition/lentilles.ts) : la prise, le cadre, les aimants, Tab et Ctrl+A y travaillent a leur niveau, qui est la racine du
// contenu, ou un groupe du contenu (`sous`). Ces aides disent ce niveau, le posent, et ramenent un contexte a ce que le dessin du
// moment permet. Pures.

import { contenuEnDessin, contexteValide, type DessinSvg } from '../engine/editionSvg.js';
import type { ContexteEdition, ModeleDessin } from './typesEditeur.js';

/** Ce que montre une lentille : la decoupe ou le masque d'un groupe. */
export type GenreLentille = 'decoupe' | 'masque';
export interface Lentille { readonly groupe: string; readonly genre: GenreLentille }

/** La lentille du contexte, ou null (la racine, un groupe, ou la tuile d'un motif, qui n'a pas encore la sienne). */
export function lentilleDe(c: ContexteEdition | null | undefined): Lentille | null {
  return c && (c.dans === 'decoupe' || c.dans === 'masque') ? { groupe: c.groupe, genre: c.dans } : null;
}

/**
 * Le niveau ou l'on edite, dans le dessin qu'on voit : le groupe du contexte ; dans une lentille, le groupe du contenu ou l'on est
 * entre, ou la racine du contenu (null). C'est ce que la prise, le cadre, les aimants, Tab et Ctrl+A recoivent.
 */
export function niveauEdition(c: ContexteEdition | null | undefined): string | null {
  if (!c) return null;
  return lentilleDe(c) ? c.sous ?? null : c.groupe;
}

/** Le contexte qui garde la lentille et change de niveau (null : la racine du contenu, ou celle du dessin hors d'une lentille). */
export function avecNiveau(c: ContexteEdition | null | undefined, niveau: string | null): ContexteEdition | null {
  const l = lentilleDe(c);
  if (l) return niveau === null ? { groupe: l.groupe, dans: l.genre } : { groupe: l.groupe, dans: l.genre, sous: niveau };
  return niveau === null ? null : { groupe: niveau };
}

/**
 * Le contexte ramene au dessin complet du moment : un groupe disparu fait revenir a la racine ; une decoupe ou un masque disparus
 * (liberes, annules) laissent dans leur groupe ; un groupe du contenu disparu ramene a la racine du contenu ; la tuile d'un motif,
 * sans lentille encore, laisse dans le groupe. Le meme objet quand il reste valable.
 */
export function contexteDuDessin(d: DessinSvg, c: ContexteEdition | null): ContexteEdition | null {
  if (!c || !contexteValide(d, c.groupe)) return null;
  const l = lentilleDe(c);
  if (!l) return c.dans === undefined && c.sous === undefined ? c : { groupe: c.groupe };
  const vue = contenuEnDessin(d, l.groupe, l.genre);
  if (!vue) return { groupe: c.groupe };
  if (c.sous !== undefined && contexteValide(vue, c.sous) === null) return { groupe: l.groupe, dans: l.genre };
  return c;
}

/** Le dessin de l'historique : le dessin complet, meme quand on edite une decoupe ou un masque. */
export const dessinComplet = (m: Pick<ModeleDessin, 'dessin' | 'complet'>): DessinSvg => m.complet ?? m.dessin;
