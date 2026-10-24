// Les petites aides que plusieurs fichiers de l'editeur partagent.

import type { Style } from '../engine/editionSvg.js';
import type { Point } from './typesEditeur.js';

export const arrondi = (v: number) => Math.round(v * 100) / 100;
export const estHex = (v: string | null): v is string => !!v && /^#[0-9a-f]{6}$/.test(v);

/** Le style d'une ligne : son contour est la couleur courante, sans remplissage, sinon elle serait invisible. */
export const styleLigne = (s: Style): Style => ({ remplissage: null, contour: s.contour ?? s.remplissage ?? '#000000', epaisseur: s.epaisseur || 1 });

/** Deux points voisins au millieme du plan sont le meme point : un double-clic n'en pose qu'un. */
export const sansDoublons = (points: readonly Point[], eps: number): Point[] =>
  points.filter((p, i) => { const q = points[i - 1]; return !q || Math.hypot(p[0] - q[0], p[1] - q[1]) > eps; });

/** La phrase qui dit, a l'ouverture d'un dessin, ce que la lecture n'a pas repris ; vide quand rien ne s'est perdu. */
export const phraseIgnores = (ignores: readonly string[]): string =>
  ignores.length ? 'Non repris à l’ouverture : ' + ignores.join(' ; ') + '. Le rendu peut différer de l’original.' : '';
