// Les phrases de la rangee de la selection (BarreSelection.tsx), dites a voix haute apres chaque geste :
// un bouton sans texte ne dit rien a qui ne voit pas l'ecran, et le dessin change quand meme. Pures : le
// geste et le nombre de formes en entree, une phrase en sortie. Courtes, puisqu'on les entend a la suite.
// « forme » est feminin : les participes s'accordent, au pluriel des que plusieurs formes sont choisies ; chaque
// accord est une cle entiere de `t` (ADR-0042), une autre langue n'accordant pas au meme endroit.

import type { Alignement, DessinSvg, Ordre } from '../engine/editionSvg.js';
import { t } from '../util/i18n.js';
import { pluriel } from '../util/texte.js';

/** Une phrase pour une forme seule, une pour plusieurs (« 3 formes » en entree). */
interface Accord { readonly seule: () => string; readonly plusieurs: (formes: string) => string }

/** « 3 formes alignées à gauche. » ; une forme seule s'aligne sur le plan, et la phrase le dit. */
const ALIGNEMENTS: Readonly<Record<Alignement, Accord>> = {
  gauche: { seule: () => t('Alignée à gauche sur le plan.'), plusieurs: formes => t('{formes} alignées à gauche.', { formes }) },
  droite: { seule: () => t('Alignée à droite sur le plan.'), plusieurs: formes => t('{formes} alignées à droite.', { formes }) },
  haut: { seule: () => t('Alignée en haut sur le plan.'), plusieurs: formes => t('{formes} alignées en haut.', { formes }) },
  bas: { seule: () => t('Alignée en bas sur le plan.'), plusieurs: formes => t('{formes} alignées en bas.', { formes }) },
  centreH: { seule: () => t('Centrée horizontalement sur le plan.'), plusieurs: formes => t('{formes} centrées horizontalement.', { formes }) },
  centreV: { seule: () => t('Centrée verticalement sur le plan.'), plusieurs: formes => t('{formes} centrées verticalement.', { formes }) }
};

export function phraseAlignement(a: Alignement, n: number): string {
  const { seule, plusieurs } = ALIGNEMENTS[a];
  return n < 2 ? seule() : plusieurs(pluriel(n, 'forme'));
}

/** « Miroir horizontal. » : le sens du retournement, que l'icone seule ne dit pas. */
export const phraseMiroir = (axe: 'h' | 'v'): string => (axe === 'h' ? t('Miroir horizontal.') : t('Miroir vertical.'));

/** Vrai quand l'empilement n'est plus le meme : un geste vers un bord deja atteint ne bouge rien, et la phrase doit le dire. */
export const empilementChange = (avant: DessinSvg, apres: DessinSvg): boolean =>
  avant.formes.length !== apres.formes.length || avant.formes.some((f, i) => f.id !== apres.formes[i]?.id);

const ORDRES: Readonly<Record<Ordre, Accord & { readonly deja: () => string }>> = {
  avant: { seule: () => t('Avancée d’un plan.'), plusieurs: formes => t('{formes} avancées d’un plan.', { formes }), deja: () => t('Déjà au premier plan.') },
  arriere: { seule: () => t('Reculée d’un plan.'), plusieurs: formes => t('{formes} reculées d’un plan.', { formes }), deja: () => t('Déjà à l’arrière-plan.') },
  premier: { seule: () => t('Placée au premier plan.'), plusieurs: formes => t('{formes} placées au premier plan.', { formes }), deja: () => t('Déjà au premier plan.') },
  dernier: { seule: () => t('Placée à l’arrière-plan.'), plusieurs: formes => t('{formes} placées à l’arrière-plan.', { formes }), deja: () => t('Déjà à l’arrière-plan.') }
};

/** « Avancée d’un plan. », « 3 formes placées au premier plan. », ou « Déjà au premier plan. » quand rien n'a bougé. */
export function phraseOrdre(o: Ordre, n: number, change: boolean): string {
  const { seule, plusieurs, deja } = ORDRES[o];
  if (!change) return deja();
  return n < 2 ? seule() : plusieurs(pluriel(n, 'forme'));
}

/** « Forme 5 dupliquée. » ou « 3 formes dupliquées. » : le numero de la copie, que la selection porte desormais. */
export function phraseDuplication(ids: readonly string[]): string {
  const [seule] = ids;
  return ids.length === 1 && seule ? t('Forme {numero} dupliquée.', { numero: seule.slice(1) }) : t('{formes} dupliquées.', { formes: pluriel(ids.length, 'forme') });
}

/** « Masquée : affichez-la dans les calques. » : une forme masquee n'est plus atteignable que par la liste. */
export function phraseMasquage(n: number): string {
  return n < 2 ? t('Masquée : affichez-la dans les calques.') : t('{formes} masquées : affichez-les dans les calques.', { formes: pluriel(n, 'forme') });
}

/** « Verrouillée : déverrouillez-la dans les calques. » */
export function phraseVerrouillage(n: number): string {
  return n < 2 ? t('Verrouillée : déverrouillez-la dans les calques.') : t('{formes} verrouillées : déverrouillez-les dans les calques.', { formes: pluriel(n, 'forme') });
}

/** « 3 formes combinées en une. » ; l'astuce des trous suit, parce que c'est ce qui surprend apres une combinaison. */
export const phraseCombinaison = (n: number): string =>
  t('{formes} combinées en une. « Trous : pair-impair » creuse les recouvrements.', { formes: pluriel(n, 'forme') });
