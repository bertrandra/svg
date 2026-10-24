// Les phrases de la rangee de la selection (BarreSelection.tsx), dites a voix haute apres chaque geste :
// un bouton sans texte ne dit rien a qui ne voit pas l'ecran, et le dessin change quand meme. Pures : le
// geste et le nombre de formes en entree, une phrase en sortie. Courtes, puisqu'on les entend a la suite.
// « forme » est feminin : les participes s'accordent, au pluriel des que plusieurs formes sont choisies.

import type { Alignement, DessinSvg, Ordre } from '../engine/editionSvg.js';
import { pluriel } from '../util/texte.js';

const accord = (n: number, mot: string): string => mot + (n > 1 ? 's' : '');

/** « 3 formes alignées à gauche. » ; une forme seule s'aligne sur le plan, et la phrase le dit. */
const ALIGNEMENTS: Readonly<Record<Alignement, readonly [string, string]>> = {
  gauche: ['alignée', 'à gauche'], droite: ['alignée', 'à droite'], haut: ['alignée', 'en haut'], bas: ['alignée', 'en bas'],
  centreH: ['centrée', 'horizontalement'], centreV: ['centrée', 'verticalement']
};

export function phraseAlignement(a: Alignement, n: number): string {
  const [mot, lieu] = ALIGNEMENTS[a];
  if (n < 2) return mot.charAt(0).toUpperCase() + mot.slice(1) + ' ' + lieu + ' sur le plan.';
  return pluriel(n, 'forme') + ' ' + accord(n, mot) + ' ' + lieu + '.';
}

/** « Miroir horizontal. » : le sens du retournement, que l'icone seule ne dit pas. */
export const phraseMiroir = (axe: 'h' | 'v'): string => (axe === 'h' ? 'Miroir horizontal.' : 'Miroir vertical.');

/** Vrai quand l'empilement n'est plus le meme : un geste vers un bord deja atteint ne bouge rien, et la phrase doit le dire. */
export const empilementChange = (avant: DessinSvg, apres: DessinSvg): boolean =>
  avant.formes.length !== apres.formes.length || avant.formes.some((f, i) => f.id !== apres.formes[i]?.id);

const ORDRES: Readonly<Record<Ordre, { fait: string; lieu: string; deja: string }>> = {
  avant: { fait: 'avancée', lieu: 'd’un plan', deja: 'Déjà au premier plan.' },
  arriere: { fait: 'reculée', lieu: 'd’un plan', deja: 'Déjà à l’arrière-plan.' },
  premier: { fait: 'placée', lieu: 'au premier plan', deja: 'Déjà au premier plan.' },
  dernier: { fait: 'placée', lieu: 'à l’arrière-plan', deja: 'Déjà à l’arrière-plan.' }
};

/** « Avancée d’un plan. », « 3 formes placées au premier plan. », ou « Déjà au premier plan. » quand rien n'a bougé. */
export function phraseOrdre(o: Ordre, n: number, change: boolean): string {
  const { fait, lieu, deja } = ORDRES[o];
  if (!change) return deja;
  if (n < 2) return fait.charAt(0).toUpperCase() + fait.slice(1) + ' ' + lieu + '.';
  return pluriel(n, 'forme') + ' ' + accord(n, fait) + ' ' + lieu + '.';
}

/** « Forme 5 dupliquée. » ou « 3 formes dupliquées. » : le numero de la copie, que la selection porte desormais. */
export function phraseDuplication(ids: readonly string[]): string {
  const [seule] = ids;
  return ids.length === 1 && seule ? 'Forme ' + seule.slice(1) + ' dupliquée.' : pluriel(ids.length, 'forme') + ' ' + accord(ids.length, 'dupliquée') + '.';
}

/** « Masquée : affichez-la dans les calques. » : une forme masquee n'est plus atteignable que par la liste. */
export function phraseMasquage(n: number): string {
  return n < 2 ? 'Masquée : affichez-la dans les calques.' : pluriel(n, 'forme') + ' masquées : affichez-les dans les calques.';
}

/** « Verrouillée : déverrouillez-la dans les calques. » */
export function phraseVerrouillage(n: number): string {
  return n < 2 ? 'Verrouillée : déverrouillez-la dans les calques.' : pluriel(n, 'forme') + ' verrouillées : déverrouillez-les dans les calques.';
}

/** « 3 formes combinées en une. » ; l'astuce des trous suit, parce que c'est ce qui surprend apres une combinaison. */
export const phraseCombinaison = (n: number): string =>
  pluriel(n, 'forme') + ' combinées en une. « Trous : pair-impair » creuse les recouvrements.';
