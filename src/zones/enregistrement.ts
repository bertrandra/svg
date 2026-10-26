// Ce que l'editeur tire de l'etat d'enregistrement que l'hote lui annonce (le site, ADR-0030) : y a-t-il quelque chose a rendre,
// et sinon pourquoi. Sans annonce de l'hote (la page, l'embarquement), la regle d'avant : une modification depuis l'ouverture.

import { t } from '../util/i18n.js';
import type { EtatEnregistrement } from './typesEditeur.js';

/** Vrai quand le geste de fin a quelque chose a rendre. Un enregistrement en cours n'en a pas : on ne le relance pas. */
export function aEnregistrer(modifie: boolean, productionModifiee: boolean, enregistrement: EtatEnregistrement | null | undefined): boolean {
  if (!enregistrement) return modifie || productionModifiee;
  return enregistrement.etat === 'modifie' || enregistrement.etat === 'echec';
}

/** Pourquoi le geste de fin n'a rien a rendre : la phrase du bouton grise et de la barre d'etat. */
export const raisonRienAEnregistrer = (enregistrement: EtatEnregistrement | null | undefined): string =>
  enregistrement?.etat === 'en-cours' ? t('Enregistrement en cours…') : t('Aucune modification à enregistrer');

/** Vrai quand fermer perdrait quelque chose : l'hote le dit s'il garde des projets, sinon une modification depuis l'ouverture. */
export const perdrait = (modifie: boolean, enregistrement: EtatEnregistrement | null | undefined): boolean =>
  enregistrement ? enregistrement.etat !== 'enregistre' : modifie;

/**
 * Le libelle court de l'etat, dans la barre : « Enregistré », « Modifications non enregistrées »… Des accesseurs : le dictionnaire
 * de la langue est pose apres le chargement des modules (ADR-0042), le texte se traduit donc a la lecture, pas a l'import.
 */
export const LIBELLES_ENREGISTREMENT: Readonly<Record<EtatEnregistrement['etat'], string>> = {
  get enregistre() { return t('Enregistré'); },
  get modifie() { return t('Modifications non enregistrées'); },
  get 'en-cours'() { return t('Enregistrement…'); },
  get echec() { return t('Non enregistré'); }
};
