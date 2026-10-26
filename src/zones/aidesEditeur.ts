// Les petites aides que plusieurs fichiers de l'editeur partagent.

import type { Booleen } from '../engine/booleens.js';
import { genreDeForme } from '../engine/description.js';
import { FICHES_FORMES, FORMES_DE_BASE, type Forme, type Style } from '../engine/editionSvg.js';
import { pluriel } from '../util/texte.js';
import { t } from '../util/i18n.js';
import type { Outil, OutilForme, Point } from './typesEditeur.js';

/** Les outils qui tracent une forme d'un glisser : les formes de base de la palette (ADR-0033). */
export const FORMES: ReadonlySet<Outil> = new Set<Outil>(FORMES_DE_BASE);

export const arrondi = (v: number) => Math.round(v * 100) / 100;
export const estHex = (v: string | null): v is string => !!v && /^#[0-9a-f]{6}$/.test(v);

/** Le style d'une ligne : son contour est la couleur courante, sans remplissage, sinon elle serait invisible. */
export const styleLigne = (s: Style): Style => ({ remplissage: null, contour: s.contour ?? s.remplissage ?? '#000000', epaisseur: s.epaisseur || 1 });

/** Le style d'une forme tracee : celui d'une ligne pour un trait (ligne, arc, spirale, vague), le style courant sinon. */
export const styleDeForme = (outil: OutilForme, s: Style): Style => (FICHES_FORMES[outil].trait ? styleLigne(s) : s);

/** Le nom d'une forme de la palette avec sa majuscule, tel que le montrent la barre, la palette et le panneau. */
export const nomOutilForme = (outil: OutilForme): string => { const n = t(FICHES_FORMES[outil].nom); return n.charAt(0).toUpperCase() + n.slice(1); };

/** Deux points voisins au millieme du plan sont le meme point : un double-clic n'en pose qu'un. */
export const sansDoublons = (points: readonly Point[], eps: number): Point[] =>
  points.filter((p, i) => { const q = points[i - 1]; return !q || Math.hypot(p[0] - q[0], p[1] - q[1]) > eps; });

/** La phrase qui dit, a l'ouverture d'un dessin, ce que la lecture n'a pas repris ; vide quand rien ne s'est perdu. */
export const phraseIgnores = (ignores: readonly string[]): string =>
  ignores.length ? t('Non repris à l’ouverture : {liste}. Le rendu peut différer de l’original.', { liste: ignores.join(' ; ') }) : '';

/** Le nom d'une operation booleenne pour la phrase d'etat ; tous feminins, d'ou « faite ». Dits a l'appel : la langue n'est posee qu'apres le chargement. */
const NOMS_BOOLEENS: Readonly<Record<Booleen, () => string>> = { union: () => t('Union'), soustraction: () => t('Soustraction'), intersection: () => t('Intersection'), exclusion: () => t('Exclusion') };

/**
 * Ce que le booleen a vraiment fait, pour la barre d'etat : le nombre de formes reunies, les points du
 * resultat, et si le contour est en courbes ou en segments droits. `courbes` se lit sur le resultat et non
 * sur le reglage : avec le reglage actif, des formes toutes droites restent droites, et la phrase le dit.
 */
export function phraseBooleen(op: Booleen, formes: number, points: number, courbes: boolean): string {
  const v = { operation: NOMS_BOOLEENS[op](), formes: pluriel(formes, 'forme'), points: pluriel(points, 'point') };
  return courbes ? t('{operation} faite : {formes}, {points} (courbes rebâties).', v) : t('{operation} faite : {formes}, {points} en segments droits.', v);
}

/**
 * La question de la confirmation d'abandon, accordee : « la modification » au singulier (« les 1 modification » etait une faute),
 * « les 3 modifications » au-dela. Sans modification du dessin, c'est le contexte de production change qui demande confirmation.
 */
export function phraseAbandon(n: number): string {
  if (n <= 0) return t('Abandonner le changement de contexte non enregistré ?');
  return n === 1 ? t('Abandonner la modification non enregistrée ?') : t('Abandonner les {n} modifications non enregistrées ?', { n });
}

// Le genre d'une forme se lit sur sa geometrie : une forme est immuable, son genre se calcule une fois (ADR-0008).
const genres = new WeakMap<Forme, string>();

/**
 * « Cercle », « Triangle », « Tracé courbe » : le nom qu'une forme montre dans les calques et l'inspecteur, majuscule en tete, tant
 * que le modele ne porte pas de nom propre a la forme. Il se calcule a l'affichage : rien ne s'ecrit dans le SVG.
 */
export function genreAffiche(f: Forme): string {
  let g = genres.get(f);
  if (g === undefined) { const brut = t(genreDeForme(f)); g = brut.charAt(0).toUpperCase() + brut.slice(1); genres.set(f, g); }
  return g;
}
