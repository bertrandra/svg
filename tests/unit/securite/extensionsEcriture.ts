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

/** Le texte encode en pourcentage (comme `data-ed-texte`) : lettres ASCII et chiffres en clair, tout le reste en %XX. */
const ENCODE = /^(?:[A-Za-z0-9]|%[0-9A-F]{2})+$/;
const OPACITE = /^(?:0(?:\.\d{1,3})?|1)$/;

/**
 * Etape 1, groupes : des <g> a toute profondeur sous la racine (dans <svg> ou dans un autre <g>), avec au plus `opacity` (une opacite
 * de groupe, jamais pleine) et `data-ed-nom` (encode) ; le marqueur `data-ed-modele="2"` sur la racine.
 */
const groupes: ExtensionEcriture = {
  nom: 'etape 1 : groupes',
  element: e => (e.nom === 'g' ? e.profondeur >= 1 && (e.parent === 'svg' || e.parent === 'g') : undefined),
  attribut: (e, nom, valeur) => {
    if (e.nom === 'g') return nom === 'opacity' ? OPACITE.test(valeur) && valeur !== '1' : nom === 'data-ed-nom' ? ENCODE.test(valeur) : false;
    if (e.profondeur === 0 && nom === 'data-ed-modele') return valeur === '2';
    return undefined;
  }
};

/** Une ligne par etape (groupes, degrades, decoupes, masques, effets, motifs, images). */
export const EXTENSIONS_ECRITURE: readonly ExtensionEcriture[] = [
  groupes
];
