// Le reglage de la langue (ADR-0042) : `fr` par defaut partout. La page autonome le garde dans le stockage injecte (cle
// `svg.langue`, comme `svg.modele`), valide comme tout ce qui en vient (ADR-0014) ; le site prend la langue du compte ; un hote qui
// embarque l'editeur passe l'option `langue`. Changer de langue recharge l'interface : la page ecrit le reglage puis
// `location.reload()`, le site enregistre le profil. Ce geste est pose par l'hote (`definirChangementLangue`, la page et le site :
// jamais l'embarquement, ou un rechargement perdrait la page de l'hote) ; sans lui, l'accueil et le menu Aide ne proposent rien.

import type { Stockage } from '../io/stockage.js';
import { estLangue, type Langue } from '../util/i18n.js';

export const CLE_LANGUE = 'svg.langue';

/** La langue gardee, ou null si la valeur n'a pas la forme que cette page ecrit (`{ langue: 'en' }`). */
export function lireLangue(v: unknown): Langue | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const l = (v as Record<string, unknown>)['langue'];
  return estLangue(l) ? l : null;
}

/** La langue retenue dans ce stockage ; `fr` sans stockage, ou sans reglage lisible. */
export const langueRetenue = (s: Stockage | null): Langue => lireLangue(s?.lire<unknown>(CLE_LANGUE)) ?? 'fr';

/** Garde le reglage ; faux si le stockage le refuse (ou manque). Un objet : un champ de plus demain ne cassera pas la lecture. */
export const garderLangue = (s: Stockage | null, l: Langue): boolean => s?.ecrire(CLE_LANGUE, { langue: l }) ?? false;

/** Le nom de chaque langue, dans cette langue : c'est ainsi qu'on la reconnait quand on ne lit pas l'autre. */
export const NOMS_LANGUES: Readonly<Record<Langue, string>> = { fr: 'Français', en: 'English' };

/** L'autre langue que celle-ci : il n'y en a que deux. */
export const autreLangue = (l: Langue): Langue => (l === 'fr' ? 'en' : 'fr');

/**
 * Le libelle du menu Aide qui mene a l'autre langue, ecrit dans cette autre langue (une personne qui ne lit pas le francais doit
 * trouver « English ») : « Language: English » en francais, « Langue : français » en anglais. Jamais traduit par `t` : il est deja
 * dans sa langue.
 */
export const libelleChangementLangue = (courante: Langue): string => (courante === 'fr' ? 'Language: English' : 'Langue : français');

/** Le geste de l'hote qui change la langue (ecrire le reglage, puis recharger) ; null tant qu'aucun hote n'en pose. */
export type ChangementLangue = (l: Langue) => void;

let changement: ChangementLangue | null = null;

/** Pose le geste qui change la langue (la page autonome et le site) ; null le retire. */
export function definirChangementLangue(c: ChangementLangue | null): void { changement = c; }

/** Le geste pose par l'hote, ou null : l'accueil et le menu Aide ne proposent la langue que s'il y en a un. */
export const changementLangue = (): ChangementLangue | null => changement;
