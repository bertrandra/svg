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

/** Le modele v2 sur la racine : son marqueur, a la seule valeur que ce programme ecrit (ecritureRiche.ts, `VERSION_MODELE`). Une fois pour toutes les etapes. */
const racine: ExtensionEcriture = {
  nom: 'modele v2 : racine',
  attribut: (e, nom, valeur) => (nom === 'data-ed-modele' ? e.profondeur === 0 && valeur === '2' : undefined)
};

const ID_DEGRADE = /^ed-d-[0-9a-f]{14}(?:-\d+)?$/;
const URL_DEGRADE = /^url\(#ed-d-[0-9a-f]{14}(?:-\d+)?\)$/;
const COORDONNEES_DEGRADE: Readonly<Record<string, readonly string[]>> = { linearGradient: ['x1', 'y1', 'x2', 'y2'], radialGradient: ['cx', 'cy', 'r', 'fx', 'fy', 'fr'] };

/**
 * Etape 3 : les degrades. <defs> sous la racine, sans attribut ; un degrade dans <defs>, identifie par son empreinte, toujours en unites
 * du plan, des coordonnees numeriques, au plus une matrice et un etalement ; des arrets sous leur degrade, une position, une couleur
 * #rrggbb, une opacite. Une forme ne cite un degrade que par `url(#ed-d-…)`, rien d'autre (jamais d'adresse, jamais de secours).
 */
const degrades: ExtensionEcriture = {
  nom: 'etape 3 : degrades',
  element: e => {
    if (e.nom === 'defs') return e.profondeur === 1 && e.parent === 'svg';
    if (e.nom === 'linearGradient' || e.nom === 'radialGradient') return e.parent === 'defs' && e.profondeur === 2;
    if (e.nom === 'stop') return (e.parent === 'linearGradient' || e.parent === 'radialGradient') && e.profondeur === 3;
    return undefined;
  },
  attribut: (e, nom, valeur) => {
    if (e.nom === 'defs') return false;
    if (e.nom === 'linearGradient' || e.nom === 'radialGradient') {
      if (nom === 'id') return ID_DEGRADE.test(valeur);
      if (nom === 'gradientUnits') return valeur === 'userSpaceOnUse';
      if (nom === 'gradientTransform') return MATRICE.test(valeur);
      if (nom === 'spreadMethod') return valeur === 'reflect' || valeur === 'repeat';
      return (COORDONNEES_DEGRADE[e.nom] ?? []).includes(nom) && NOMBRE.test(valeur);
    }
    if (e.nom === 'stop') {
      if (nom === 'stop-color') return /^#[0-9a-f]{6}$/.test(valeur);
      if (nom === 'offset' || nom === 'stop-opacity') return NOMBRE.test(valeur) && Number(valeur) >= 0 && Number(valeur) <= 1;
      return false;
    }
    if (e.nom === 'path' && (nom === 'fill' || nom === 'stroke') && valeur.startsWith('url(')) return URL_DEGRADE.test(valeur);
    return undefined;
  }
};

/**
 * Etape 12 : une <image> integree, sous la racine ou un groupe (jamais dans <defs> ni <metadata>), et ses seuls attributs, chacun de
 * sa forme exacte : les donnees en ligne d'un PNG, JPEG, GIF ou WebP, un cadre numerique, une matrice, un aspect, une opacite.
 * Sur la racine, `xmlns:xlink` (l'espace de noms de `xlink:href`) ; le marqueur du modele est a l'extension `racine`.
 */
const images: ExtensionEcriture = {
  nom: 'etape 12 : images',
  element: e => (e.nom === 'image' ? e.profondeur >= 1 && e.parent !== 'defs' && e.parent !== 'metadata' : undefined),
  attribut: (e, nom, valeur) => {
    if (e.profondeur === 0) return nom === 'xmlns:xlink' ? valeur === 'http://www.w3.org/1999/xlink' : undefined;
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

const ID_FILTRE = /^ed-f-[0-9a-f]{14}(?:-\d+)?$/;
const URL_FILTRE = /^url\(#ed-f-[0-9a-f]{14}(?:-\d+)?\)$/;
const POSITIF = (v: string): boolean => NOMBRE.test(v) && Number(v) >= 0;
const ECARTS = new RegExp('^' + NOMBRE_ECRIT + '(?: ' + NOMBRE_ECRIT + ')?$');
/** Les primitives que l'ecriture pose, et pour chacune ses attributs exacts (annexe 4 B §2) : rien d'autre, jamais feImage ni feTurbulence. */
const PRIMITIVES_ECRITES: Readonly<Record<string, Readonly<Record<string, (v: string) => boolean>>>> = {
  feGaussianBlur: {
    in: v => v === 'SourceAlpha' || v === 'SourceGraphic',
    stdDeviation: v => ECARTS.test(v) && v.split(' ').every(x => Number(x) >= 0),
    result: v => v === 'a' || v === 'e'
  },
  feOffset: { in: v => v === 'a', dx: v => NOMBRE.test(v), dy: v => NOMBRE.test(v), result: v => v === 'b' },
  feFlood: { 'flood-color': v => /^#[0-9a-f]{6}$/.test(v), 'flood-opacity': v => POSITIF(v) && Number(v) <= 1, result: v => v === 'c' },
  feComposite: { in: v => v === 'c', in2: v => v === 'b', operator: v => v === 'in', result: v => v === 'd' },
  feMerge: {},
  feMergeNode: { in: v => v === 'd' || v === 'e' || v === 'SourceGraphic' }
};

/**
 * Etape 7 : les effets. Un <filter> dans <defs>, identifie par son empreinte, toujours en unites du plan, sa region numerique (jamais
 * vide) et `color-interpolation-filters="sRGB"` ; dessous, les seules primitives du flou et de l'ombre decomposee, chacune avec ses
 * seuls attributs, et les noeuds d'un feMerge. Une feuille (chemin, image) ou un groupe ne cite un filtre que par `url(#ed-f-…)`.
 * Inscrite AVANT les groupes : leur extension refuse tout autre attribut sur un <g>.
 */
const effets: ExtensionEcriture = {
  nom: 'etape 7 : effets',
  element: e => {
    if (e.nom === 'filter') return e.parent === 'defs' && e.profondeur === 2;
    if (e.nom === 'feMergeNode') return e.parent === 'feMerge' && e.profondeur === 4;
    if (Object.prototype.hasOwnProperty.call(PRIMITIVES_ECRITES, e.nom)) return e.parent === 'filter' && e.profondeur === 3;
    return undefined;
  },
  attribut: (e, nom, valeur) => {
    if (e.nom === 'filter') {
      switch (nom) {
        case 'id': return ID_FILTRE.test(valeur);
        case 'filterUnits': return valeur === 'userSpaceOnUse';
        case 'color-interpolation-filters': return valeur === 'sRGB';
        case 'x': case 'y': return NOMBRE.test(valeur);
        case 'width': case 'height': return NOMBRE.test(valeur) && Number(valeur) > 0;
        default: return false;
      }
    }
    const regles = Object.prototype.hasOwnProperty.call(PRIMITIVES_ECRITES, e.nom) ? PRIMITIVES_ECRITES[e.nom] : undefined;
    if (regles) { const r = Object.prototype.hasOwnProperty.call(regles, nom) ? regles[nom] : undefined; return r ? r(valeur) : false; }
    if (nom === 'filter' && (e.nom === 'path' || e.nom === 'image' || e.nom === 'g')) return URL_FILTRE.test(valeur);
    return undefined;
  }
};

/** Le texte encode en pourcentage (comme `data-ed-texte`) : lettres ASCII et chiffres en clair, tout le reste en %XX. */
const ENCODE = /^(?:[A-Za-z0-9]|%[0-9A-F]{2})+$/;
const OPACITE_GROUPE = /^0(?:\.\d{1,3})?$/;

/**
 * Etape 1 : les groupes. Des <g> a toute profondeur sous la racine (dans <svg> ou dans un autre <g>), avec au plus `opacity` (une
 * opacite de groupe, jamais pleine) et `data-ed-nom` (encode) ; le marqueur du modele est a l'extension `racine`.
 */
const groupes: ExtensionEcriture = {
  nom: 'etape 1 : groupes',
  element: e => (e.nom === 'g' ? e.profondeur >= 1 && (e.parent === 'svg' || e.parent === 'g') : undefined),
  attribut: (e, nom, valeur) => {
    if (e.nom !== 'g') return undefined;
    return nom === 'opacity' ? OPACITE_GROUPE.test(valeur) : nom === 'data-ed-nom' ? ENCODE.test(valeur) : false;
  }
};

const ID_DECOUPE = /^ed-c-[0-9a-f]{14}(?:-\d+)?$/;
const URL_DECOUPE = /^url\(#ed-c-[0-9a-f]{14}(?:-\d+)?\)$/;

/**
 * Etape 5 : les decoupes. Un <clipPath> dans <defs>, identifie par son empreinte et sans autre attribut (toujours en unites du plan) ;
 * dedans, des <path> seulement, avec leur trace, au plus `clip-rule="evenodd"` et un `clip-path` vers une autre decoupe (une decoupe
 * decoupee : un <clipPath> n'admet pas de <g>). Un groupe ne cite une decoupe que par `url(#ed-c-…)`. Avant `groupes`, qui refuse
 * tout autre attribut d'un <g>.
 */
const decoupes: ExtensionEcriture = {
  nom: 'etape 5 : decoupes',
  element: e => {
    if (e.nom === 'clipPath') return e.parent === 'defs' && e.profondeur === 2;
    if (e.parent === 'clipPath') return e.nom === 'path';
    return undefined;
  },
  attribut: (e, nom, valeur) => {
    if (e.nom === 'clipPath') return nom === 'id' && ID_DECOUPE.test(valeur);
    if (e.nom === 'path' && e.parent === 'clipPath') {
      if (nom === 'd') return /^[MLCQZ0-9.\s-]*$/.test(valeur);
      if (nom === 'clip-rule') return valeur === 'evenodd';
      if (nom === 'clip-path') return URL_DECOUPE.test(valeur);
      return false;
    }
    if (e.nom === 'g' && nom === 'clip-path') return URL_DECOUPE.test(valeur);
    return undefined;
  }
};

const ID_MASQUE = /^ed-m-[0-9a-f]{14}(?:-\d+)?$/;
const URL_MASQUE = /^url\(#ed-m-[0-9a-f]{14}(?:-\d+)?\)$/;

/**
 * Etape 6 : les masques. Un <mask> dans <defs>, identifie par son empreinte, toujours en unites du plan, une region numerique (largeur
 * et hauteur jamais negatives), au plus `style="mask-type:alpha"` ; dedans, un contenu comme le dessin en porte : des <path>, des <g>
 * (dont les attributs relevent des autres etapes), des <image>. Un groupe ne cite un masque que par `url(#ed-m-…)`. Avant `groupes`,
 * qui refuse tout autre attribut d'un <g> et un <g> hors de la racine ou d'un autre <g>.
 */
const masques: ExtensionEcriture = {
  nom: 'etape 6 : masques',
  element: e => {
    if (e.nom === 'mask') return e.parent === 'defs' && e.profondeur === 2;
    if (e.parent === 'mask') return e.nom === 'path' || e.nom === 'g' || e.nom === 'image';
    return undefined;
  },
  attribut: (e, nom, valeur) => {
    if (e.nom === 'mask') {
      switch (nom) {
        case 'id': return ID_MASQUE.test(valeur);
        case 'maskUnits': return valeur === 'userSpaceOnUse';
        case 'x': case 'y': return NOMBRE.test(valeur);
        case 'width': case 'height': return NOMBRE.test(valeur) && Number(valeur) >= 0;
        case 'style': return valeur === 'mask-type:alpha';
        default: return false;
      }
    }
    if (e.nom === 'g' && nom === 'mask') return URL_MASQUE.test(valeur);
    return undefined;
  }
};

const ID_MOTIF = /^ed-p-[0-9a-f]{14}(?:-\d+)?$/;
const URL_MOTIF = /^url\(#ed-p-[0-9a-f]{14}(?:-\d+)?\)$/;

/**
 * Etape 9 : les motifs. Un <pattern> dans <defs>, identifie par son empreinte, toujours en unites du plan, une tuile numerique (largeur
 * et hauteur jamais nulles), au plus une matrice ; dedans, un contenu comme le dessin en porte : des <path> et des <g> (dont les
 * attributs relevent des autres etapes). Une forme ne cite un motif que par `url(#ed-p-…)`, au fond ou au trait. Avant `groupes`, qui
 * refuse un <g> hors de la racine ou d'un autre <g>, et avant `degrades`, qui refuse toute autre peinture `url(…)`.
 */
const motifs: ExtensionEcriture = {
  nom: 'etape 9 : motifs',
  element: e => {
    if (e.nom === 'pattern') return e.parent === 'defs' && e.profondeur === 2;
    if (e.parent === 'pattern') return e.nom === 'path' || e.nom === 'g';
    return undefined;
  },
  attribut: (e, nom, valeur) => {
    if (e.nom === 'pattern') {
      switch (nom) {
        case 'id': return ID_MOTIF.test(valeur);
        case 'patternUnits': return valeur === 'userSpaceOnUse';
        case 'x': case 'y': return NOMBRE.test(valeur);
        case 'width': case 'height': return NOMBRE.test(valeur) && Number(valeur) > 0;
        case 'patternTransform': return MATRICE.test(valeur);
        default: return false;
      }
    }
    if (e.nom === 'path' && (nom === 'fill' || nom === 'stroke') && valeur.startsWith('url(#ed-p-')) return URL_MOTIF.test(valeur);
    return undefined;
  }
};

/** Une ligne par etape (groupes, degrades, decoupes, masques, effets, motifs, images). */
export const EXTENSIONS_ECRITURE: readonly ExtensionEcriture[] = [
  racine,
  // Les decoupes, les masques, les effets et les motifs avant les groupes : `clip-path`, `mask` et `filter` sur un <g>, un <g> dans un
  // <mask> ou un <pattern> (l'extension des groupes refuse ce qu'elle ne connait pas) ; les motifs avant les degrades (une peinture url).
  decoupes,
  masques,
  effets,
  motifs,
  groupes,
  degrades,
  images
];
