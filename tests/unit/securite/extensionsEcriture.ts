// Ce que le modele v2 (ADR-0012) ajoute a l'ecriture permise (`violationsEcriture`, invariants.ts) : des <g>, des <defs> et leurs
// definitions, des references `url(#ed-…)`, des donnees d'edition sur un groupe. Chaque etape l'ajoute ICI, par une extension nommee
// et une ligne de la liste, sans editer la specification de base ; elle ne relache que ce qu'elle ecrit, avec sa forme exacte.
// Une extension rend `true` (permis), `false` (refuse, meme si la base le permettait) ou `undefined` (la base decide) ; la premiere
// qui tranche l'emporte.

/** Un element d'une ecriture, tel que l'invariant le voit. */
export interface ElementEcrit {
  readonly nom: string;
  /** 0 pour <svg>, 1 pour ses enfants… */
  readonly profondeur: number;
  /** Le nom de l'element parent ('' pour la racine). */
  readonly parent: string;
}

export interface ExtensionEcriture {
  /** L'etape et la fonctionnalite : « etape 1 : groupes ». */
  readonly nom: string;
  readonly element?: (e: ElementEcrit) => boolean | undefined;
  readonly attribut?: (e: ElementEcrit, nom: string, valeur: string) => boolean | undefined;
}

/** Une ligne par etape (groupes, degrades, decoupes, masques, effets, motifs, images) ; vide a l'etape 0. */
export const EXTENSIONS_ECRITURE: readonly ExtensionEcriture[] = [
];
