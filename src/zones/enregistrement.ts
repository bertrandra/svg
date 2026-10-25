// Ce que l'editeur tire de l'etat d'enregistrement que l'hote lui annonce (le site, ADR-0030) : y a-t-il quelque chose a rendre,
// et sinon pourquoi. Sans annonce de l'hote (la page, l'embarquement), la regle d'avant : une modification depuis l'ouverture.

import type { EtatEnregistrement } from './typesEditeur.js';

/** Vrai quand le geste de fin a quelque chose a rendre. Un enregistrement en cours n'en a pas : on ne le relance pas. */
export function aEnregistrer(modifie: boolean, productionModifiee: boolean, enregistrement: EtatEnregistrement | null | undefined): boolean {
  if (!enregistrement) return modifie || productionModifiee;
  return enregistrement.etat === 'modifie' || enregistrement.etat === 'echec';
}

/** Pourquoi le geste de fin n'a rien a rendre : la phrase du bouton grise et de la barre d'etat. */
export const raisonRienAEnregistrer = (enregistrement: EtatEnregistrement | null | undefined): string =>
  enregistrement?.etat === 'en-cours' ? 'Enregistrement en cours…' : 'Aucune modification à enregistrer';

/** Vrai quand fermer perdrait quelque chose : l'hote le dit s'il garde des projets, sinon une modification depuis l'ouverture. */
export const perdrait = (modifie: boolean, enregistrement: EtatEnregistrement | null | undefined): boolean =>
  enregistrement ? enregistrement.etat !== 'enregistre' : modifie;

/** Le libelle court de l'etat, dans la barre : « Enregistré », « Modifications non enregistrées »… */
export const LIBELLES_ENREGISTREMENT: Readonly<Record<EtatEnregistrement['etat'], string>> = {
  enregistre: 'Enregistré',
  modifie: 'Modifications non enregistrées',
  'en-cours': 'Enregistrement…',
  echec: 'Non enregistré'
};
