// Les documentations du menu Aide : le guide complet et le mode Cricut, deux pages HTML livrees a cote de la page autonome et du
// site PHP (`aide/`, ecrites par scripts/aide.mjs). Seuls ces deux hotes les posent (`definirDocumentation`) : un hote qui embarque
// l'editeur n'a pas ces fichiers, son menu Aide garde la visite et les raccourcis. Une documentation s'ouvre dans un nouvel onglet,
// au seul geste de la personne ; elle ne contacte aucun serveur (polices et images sont dans le fichier).

import { t } from '../util/i18n.js';

/** Une documentation : son libelle dans le menu, et son adresse, relative a la page qui monte l'editeur. */
export interface Documentation {
  id: string;
  libelle: string;
  adresse: string;
}

/**
 * Les deux documentations livrees, dans l'ordre du menu. Le libelle se traduit a la lecture (un accesseur), pas au chargement du
 * module : la langue n'est posee qu'ensuite. Les pages, elles, restent en francais (ADR-0042 §6) : le libelle anglais le dit.
 */
export const DOCUMENTATIONS_LIVREES: readonly Documentation[] = [
  { id: 'guide', get libelle() { return t('Guide de l’éditeur'); }, adresse: 'aide/guide.html' },
  { id: 'cricut', get libelle() { return t('La Cricut, c’est simple'); }, adresse: 'aide/cricut.html' }
];

let documentations: readonly Documentation[] = [];

/** Pose les documentations du menu Aide (la page autonome et le site) ; une liste vide les retire. */
export function definirDocumentation(liste: readonly Documentation[]): void { documentations = liste; }

/** Les documentations posees par l'hote : aucune tant qu'il n'en pose pas. */
export function documentationsPosees(): readonly Documentation[] { return documentations; }
