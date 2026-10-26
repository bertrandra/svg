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

/** Un nombre tel que `nb` l'ecrit (chemins.ts) : jamais d'exposant, les coordonnees etant bornees. */
const NOMBRE_ECRIT = '-?\\d+(?:\\.\\d+)?';
const NOMBRE = new RegExp('^' + NOMBRE_ECRIT + '$');
const MATRICE = new RegExp('^matrix\\(' + NOMBRE_ECRIT + '(?: ' + NOMBRE_ECRIT + '){5}\\)$');

/**
 * Etape 12 : une <image> integree, sous la racine ou un groupe (jamais dans <defs> ni <metadata>), et ses seuls attributs, chacun de
 * sa forme exacte : les donnees en ligne d'un PNG, JPEG, GIF ou WebP, un cadre numerique, une matrice, un aspect, une opacite.
 * Sur la racine, `xmlns:xlink` (l'espace de noms de `xlink:href`) et le marqueur du modele.
 */
const images: ExtensionEcriture = {
  nom: 'etape 12 : images',
  element: e => (e.nom === 'image' ? e.profondeur >= 1 && e.parent !== 'defs' && e.parent !== 'metadata' : undefined),
  attribut: (e, nom, valeur) => {
    if (e.profondeur === 0) return nom === 'xmlns:xlink' ? valeur === 'http://www.w3.org/1999/xlink' : nom === 'data-ed-modele' ? valeur === '2' : undefined;
    if (e.nom !== 'image') return undefined;
    switch (nom) {
      case 'xlink:href': return /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(valeur);
      case 'x': case 'y': return NOMBRE.test(valeur);
      case 'width': case 'height': return NOMBRE.test(valeur) && Number(valeur) > 0;
      case 'transform': return MATRICE.test(valeur);
      case 'preserveAspectRatio': return /^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max))(?: slice)?$/.test(valeur);
      case 'opacity': return NOMBRE.test(valeur) && Number(valeur) < 1;
      default: return false;
    }
  }
};

/** Une ligne par etape (groupes, degrades, decoupes, masques, effets, motifs, images) ; vide a l'etape 0. */
export const EXTENSIONS_ECRITURE: readonly ExtensionEcriture[] = [
  images
];
