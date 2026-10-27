// Les graduations des regles (ADR-0038) et l'unite dans laquelle elles parlent : les unites du plan, ou, en contexte de
// production, les millimetres ou les pouces du profil (ADR-0013). Pur : la vue et la taille de la regle en entree, des traits
// en sortie ; la regle (Regles.tsx) ne fait que les dessiner.

import { depuisUnite, versUnite } from '../engine/preparation.js';
import { nombreFr } from '../engine/description.js';
import { NOMS_UNITE, type UniteLongueur } from '../model/contextes.js';
import { t } from '../util/i18n.js';

/** L'unite des regles, des reperes et de leurs champs : ce qu'on lit, et les conversions avec les unites du plan. */
export interface UniteRegle {
  /** Le nom court ecrit apres un nombre (« mm », « po ») ; vide pour les unites du plan. */
  readonly nom: string;
  /** Le nom en toutes lettres, pour les lecteurs d'ecran (« millimètres ») ; « unités » pour le plan. */
  readonly long: string;
  readonly vers: (plan: number) => number;
  readonly depuis: (valeur: number) => number;
}

/** L'unite du moment : celle du profil de production, sinon celle du plan. Les noms se traduisent a l'appel (ADR-0042). */
export function uniteRegle(unite: UniteLongueur | null): UniteRegle {
  if (!unite) return { nom: '', long: t('unités'), vers: v => v, depuis: v => v };
  return { nom: t(NOMS_UNITE[unite]), long: unite === 'in' ? t('pouces') : t('millimètres'), vers: v => versUnite(v, unite), depuis: v => depuisUnite(v, unite) };
}

/** Une valeur du plan dite dans l'unite : « 25,4 mm », « 120 ». */
export const texteValeur = (plan: number, u: UniteRegle): string => nombreFr(u.vers(plan)) + (u.nom ? ' ' + u.nom : '');

/** Une valeur lue dans un champ (virgule ou point), dans l'unite, rendue en unites du plan ; null si elle ne se lit pas. */
export function lireValeur(texte: string, u: UniteRegle): number | null {
  const propre = texte.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(propre)) return null;
  const v = u.depuis(Number(propre));
  return Number.isFinite(v) ? v : null;
}

/** Un trait de regle : sa position a l'ecran (px depuis le debut de la regle), s'il est majeur, et son libelle (majeurs seulement). */
export interface Trait { readonly px: number; readonly majeur: boolean; readonly texte: string }

/** L'ecart minimal, a l'ecran, entre deux libelles : assez pour « -1 250 » en chasse fixe. */
export const ECART_LIBELLES = 64;
/** Le nombre de traits au plus d'une regle : au-dela, une fenetre immense ou un zoom extreme ne fait pas exploser le rendu. */
const TRAITS_MAX = 2000;

/** Le pas majeur, dans l'unite : 1, 2 ou 5 fois une puissance de dix, le plus petit qui laisse `ECART_LIBELLES` px entre deux libelles. */
export function pasMajeur(pxParUnite: number): number {
  if (!(pxParUnite > 0) || !Number.isFinite(pxParUnite)) return 1;
  const brut = ECART_LIBELLES / pxParUnite, p = 10 ** Math.floor(Math.log10(brut));
  for (const k of [1, 2, 5, 10]) if (k * p >= brut) return k * p;
  return 10 * p;
}

/**
 * Les traits d'une regle de `longueur` px. `origine` est la position a l'ecran (px) du zero du plan, `zoom` les px par unite du
 * plan. Chaque pas majeur se coupe en cinq (pas en 1 ou 5) ou en deux et en quatre (pas en 2) : les memes divisions qu'un
 * double decimetre. Les libelles sont dans l'unite, a la francaise.
 */
export function graduations(longueur: number, origine: number, zoom: number, u: UniteRegle): Trait[] {
  if (!(longueur > 0) || !(zoom > 0)) return [];
  // Les px par unite affichee : une unite affichee vaut `depuis(1)` unites du plan.
  const pxParUnite = zoom * u.depuis(1);
  const majeur = pasMajeur(pxParUnite), chiffre = Math.round(majeur / 10 ** Math.floor(Math.log10(majeur)));
  const divisions = chiffre === 2 ? 4 : 5, mineur = majeur / divisions;
  const debut = u.vers(-origine / zoom), fin = u.vers((longueur - origine) / zoom);
  const premier = Math.floor(debut / mineur), dernier = Math.ceil(fin / mineur);
  if (dernier - premier > TRAITS_MAX) return [];
  const r: Trait[] = [];
  for (let k = premier; k <= dernier; k++) {
    const valeur = k * mineur, px = origine + u.depuis(valeur) * zoom;
    if (px < 0 || px > longueur) continue;
    const estMajeur = k % divisions === 0;
    r.push({ px, majeur: estMajeur, texte: estMajeur ? nombreFr(Math.round(valeur * 1e6) / 1e6) : '' });
  }
  return r;
}
