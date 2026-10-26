// Les contextes de production (ADR-0013) : ce qu'une machine de decoupe attend d'un SVG, en donnees. Un
// contexte ne fait rien par lui-meme : il configure les outils existants et le moteur le lit pour juger le
// dessin (engine/preparation.ts). Aucune logique ici, seulement des profils, pour que les ajouter (Silhouette,
// laser, vinyle, feutre) ne demande qu'une entree de plus.
//
// Une valeur qu'on n'a pas mesuree sur une vraie machine porte `aVerifier: true` et une note qui dit d'ou elle
// vient : le protocole de docs/cricut/protocole.md sert a les figer. Les longueurs sont en pouces (l'unite de
// Cricut et de Design Space) ; l'interface les montre en pouces ou en millimetres.

/** Une valeur de profil : un nombre, et, s'il n'est pas mesure, la raison de le croire. */
export interface Valeur {
  readonly valeur: number;
  /** Vrai quand la valeur vient de la memoire ou d'une documentation, pas d'un essai sur la machine. */
  readonly aVerifier?: true;
  /** D'ou vient la valeur, et ce qu'il faut verifier. Obligatoire avec `aVerifier`. */
  readonly note?: string;
}

/**
 * Les unites du plan dans un pouce. Le plan de travail n'a pas d'unite propre : l'ecriture du SVG pose
 * `width` egal au viewBox, sans unite, donc en px CSS, et un px CSS vaut 1/96 de pouce. Un contexte de production
 * garde cette echelle : ce qu'on voit « en taille reelle » est ce qui sera decoupe.
 */
export const UNITES_PLAN_PAR_POUCE = 96;
export const MM_PAR_POUCE = 25.4;

/** Ce que Design Space fait d'une longueur sans unite : il la lit a 72 points par pouce. */
export const DESIGN_SPACE_PX_NU_PAR_POUCE: Valeur = {
  valeur: 72, aVerifier: true,
  note: 'De mémoire : Design Space lit un SVG sans unité à 72 ppp, si bien qu’un SVG écrit à 96 ppp arrive à 75 % de sa taille. Témoin 1.'
};

export type IdContexte = 'generique' | 'cricut';
/** Les familles de machines. Seule Cricut est decrite ; les autres ont leur place sans refonte. */
export type Famille = 'cricut' | 'silhouette' | 'laser';
/**
 * Ce qu'on fait du dessin : le decouper en couches de matiere, l'imprimer puis le decouper autour, ou le dessiner au stylo
 * (ADR-0022 : le stylo trace des lignes, il ne remplit pas). La gravure et la dorure (foil) suivent la meme logique d'outil
 * (OUTILS_A_VENIR) et ne s'ouvriront qu'une fois verifiees sur une machine.
 */
export type Procede = 'decoupe' | 'imprimer-decouper' | 'dessin-stylo';
export type UniteLongueur = 'in' | 'mm';

export interface Tapis {
  readonly id: string;
  readonly nom: string;
  /** La taille du support, en pouces. */
  readonly largeur: Valeur;
  readonly hauteur: Valeur;
  /** La zone que la machine sait couper sur ce support, en pouces, depuis le coin haut gauche. */
  readonly zoneUtile: { readonly largeur: Valeur; readonly hauteur: Valeur };
  /** Un materiau « Smart » qui passe sans tapis. */
  readonly sansTapis: boolean;
  readonly note?: string;
}

export interface Machine {
  readonly id: string;
  readonly famille: Famille;
  /** Le nom court de la famille de modeles, tel que la barre le montre. */
  readonly nom: string;
  /** Les modeles reunis sous ce nom : ils partagent tapis et procedes. */
  readonly modeles: readonly string[];
  readonly tapis: readonly string[];
  readonly procedes: readonly Procede[];
  readonly note?: string;
}

/** Les seuils d'un materiau, en pouces sauf mention. */
export interface SeuilsMateriau {
  /** La plus petite largeur qu'une partie peut avoir pour etre decoupee proprement. */
  readonly detailMin: Valeur;
  /** Le decalage de la pointe de la lame : le plus petit rayon qu'un angle rentrant prend a la coupe. */
  readonly rayonLame: Valeur;
  /** L'ecart qu'un nettoyage de trace peut se permettre : sous la precision de la machine. */
  readonly toleranceNettoyage: Valeur;
  /** La distance OKLab sous laquelle deux couleurs sont le meme papier (deux tapis pour rien). Sans unite. */
  readonly fusionNuances: Valeur;
  /** Le nombre de points d'une forme au-dela duquel Design Space peine. Sans unite. */
  readonly noeudsParForme: Valeur;
}

export interface Materiau {
  readonly id: string;
  readonly nom: string;
  /** Faux : le materiau est annonce, pas encore decrit ; il ne se choisit pas. */
  readonly disponible: boolean;
  readonly seuils: SeuilsMateriau | null;
  readonly note?: string;
}

/** Print Then Cut : l'imprimante imprime, la machine lit des reperes et decoupe autour. */
export interface PrintThenCut {
  /** La plus grande image que Design Space accepte, en pouces (sur une feuille Lettre). */
  readonly largeurMax: Valeur;
  readonly hauteurMax: Valeur;
  /** Le fond perdu : la couleur de bord prolongee au-dela de la ligne de coupe, en pouces. */
  readonly fondPerdu: Valeur;
  /** La resolution du PNG a imprimer, en points par pouce. */
  readonly resolution: Valeur;
}

/**
 * Un outil qui suit les lignes du dessin sans le decouper (stylo, et plus tard pointe de gravure, outil de dorure) : la largeur du
 * trait qu'il laisse, en pouces. C'est elle qui espace les hachures (des lignes bord a bord) et epaissit le pourtour d'une forme.
 */
export interface Outil {
  readonly largeur: Valeur;
}

export interface FamilleProduction {
  readonly id: Famille;
  readonly nom: string;
  readonly machines: readonly Machine[];
  readonly tapis: readonly Tapis[];
  readonly materiaux: readonly Materiau[];
  readonly printThenCut: PrintThenCut | null;
  /** Le stylo du procede « Dessin au stylo » ; null pour une famille qui ne dessine pas. */
  readonly stylo: Outil | null;
  /** Ce que le SVG ne porte pas et que le logiciel de la machine regle apres l'import (aide du panneau). */
  readonly typesDeLigne: readonly string[];
}

// ---------------------------------------------------------------- Cricut

const ZONE_12 = 'De mémoire : Design Space limite la coupe à 11,5 po sur un tapis de 12 po (un quart de pouce de marge de chaque côté). À vérifier sur la machine.';

const TAPIS_CRICUT: readonly Tapis[] = [
  {
    id: '12x12', nom: 'Tapis 12 × 12 po', largeur: { valeur: 12 }, hauteur: { valeur: 12 }, sansTapis: false,
    zoneUtile: { largeur: { valeur: 11.5, aVerifier: true, note: ZONE_12 }, hauteur: { valeur: 11.5, aVerifier: true, note: ZONE_12 } }
  },
  {
    id: '12x24', nom: 'Tapis 12 × 24 po', largeur: { valeur: 12 }, hauteur: { valeur: 24 }, sansTapis: false,
    zoneUtile: { largeur: { valeur: 11.5, aVerifier: true, note: ZONE_12 }, hauteur: { valeur: 23.5, aVerifier: true, note: ZONE_12 } }
  },
  {
    id: 'smart', nom: 'Sans tapis (Smart Material)', largeur: { valeur: 13 }, hauteur: { valeur: 13 }, sansTapis: true,
    zoneUtile: {
      largeur: { valeur: 11.7, aVerifier: true, note: 'De mémoire : environ 11,7 po de large sur un Smart Material de 13 po. Explore 3 et Maker 3 seulement.' },
      hauteur: { valeur: 11.7, aVerifier: true, note: 'Une feuille de papier cartonné Smart fait 13 × 13 po ; la longueur utile n’est pas connue. Un rouleau de vinyle irait beaucoup plus loin.' }
    },
    note: 'Explore 3 et Maker 3 seulement : l’Explore Air 2 et la Maker d’origine demandent un tapis.'
  },
  {
    id: 'joy-4x6', nom: 'Tapis Joy 4,5 × 6,5 po', largeur: { valeur: 4.5 }, hauteur: { valeur: 6.5 }, sansTapis: false,
    zoneUtile: {
      largeur: { valeur: 4.5, aVerifier: true, note: 'De mémoire : la Joy coupe sur 4,5 po de large ; la marge du tapis n’est pas connue.' },
      hauteur: { valeur: 6.5, aVerifier: true, note: 'De mémoire : la longueur du tapis Joy court ; la marge n’est pas connue.' }
    }
  },
  {
    id: 'joy-4x12', nom: 'Tapis Joy 4,5 × 12 po', largeur: { valeur: 4.5 }, hauteur: { valeur: 12 }, sansTapis: false,
    zoneUtile: {
      largeur: { valeur: 4.5, aVerifier: true, note: 'De mémoire : la Joy coupe sur 4,5 po de large ; la marge du tapis n’est pas connue.' },
      hauteur: { valeur: 12, aVerifier: true, note: 'De mémoire : la longueur du tapis Joy long ; la marge n’est pas connue.' }
    }
  }
];

const MACHINES_CRICUT: readonly Machine[] = [
  { id: 'joy', famille: 'cricut', nom: 'Joy', modeles: ['Cricut Joy'], tapis: ['joy-4x6', 'joy-4x12'], procedes: ['decoupe', 'dessin-stylo'], note: 'La Joy ne fait pas Print Then Cut (la Joy Xtra, si : elle n’est pas décrite ici).' },
  { id: 'explore', famille: 'cricut', nom: 'Explore (Air 2 / 3)', modeles: ['Cricut Explore Air 2', 'Cricut Explore 3'], tapis: ['12x12', '12x24', 'smart'], procedes: ['decoupe', 'imprimer-decouper', 'dessin-stylo'] },
  { id: 'maker', famille: 'cricut', nom: 'Maker (Maker / Maker 3)', modeles: ['Cricut Maker', 'Cricut Maker 3'], tapis: ['12x12', '12x24', 'smart'], procedes: ['decoupe', 'imprimer-decouper', 'dessin-stylo'] }
];

const SEUILS_PAPIER_CARTONNE: SeuilsMateriau = {
  detailMin: { valeur: 1 / 16, aVerifier: true, note: 'De l’ordre de 1/16 à 1/8 po selon le grammage et la lame : à régler sur une coupe d’essai (témoin 4 du protocole).' },
  rayonLame: { valeur: 0.01, aVerifier: true, note: 'Décalage de la pointe d’une lame fine, de mémoire environ 0,25 mm : sert de rayon par défaut pour arrondir les angles.' },
  toleranceNettoyage: { valeur: 0.005, aVerifier: true, note: 'Environ 0,13 mm, sous la précision annoncée d’une machine de découpe : un point retiré à cet écart ne se voit pas à la coupe.' },
  fusionNuances: { valeur: 0.04, aVerifier: true, note: 'Distance OKLab sous laquelle deux papiers se confondent à l’œil (celle des calques par couleur) : un jugement, pas une mesure de la machine. Témoin 3.' },
  noeudsParForme: { valeur: 5000, aVerifier: true, note: 'Aucune limite documentée : Design Space ralentit sur les tracés très chargés ; seuil prudent, à ajuster.' }
};

const MATERIAUX_CRICUT: readonly Materiau[] = [
  { id: 'papier-cartonne', nom: 'Papier cartonné', disponible: true, seuils: SEUILS_PAPIER_CARTONNE },
  { id: 'vinyle', nom: 'Vinyle', disponible: false, seuils: null, note: 'Plus tard : désherbage, détails plus fins.' },
  { id: 'thermocollant', nom: 'Thermocollant', disponible: false, seuils: null, note: 'Plus tard : se découpe en miroir.' },
  { id: 'feutre', nom: 'Feutre', disponible: false, seuils: null, note: 'Plus tard : détails bien plus gros.' }
];

export const CRICUT: FamilleProduction = {
  id: 'cricut',
  nom: 'Cricut',
  machines: MACHINES_CRICUT,
  tapis: TAPIS_CRICUT,
  materiaux: MATERIAUX_CRICUT,
  printThenCut: {
    largeurMax: { valeur: 6.75, aVerifier: true, note: 'De mémoire : 6,75 × 9,25 po sur une feuille Lettre, les repères de la machine prenant le reste. Témoin 6.' },
    hauteurMax: { valeur: 9.25, aVerifier: true, note: 'De mémoire : 6,75 × 9,25 po sur une feuille Lettre. Une image couchée (9,25 de large) est-elle acceptée ? Témoin 6.' },
    fondPerdu: { valeur: 1 / 16, aVerifier: true, note: 'Environ 1,6 mm de couleur prolongée au-delà de la coupe ; Design Space sait aussi ajouter le sien (réglage « Fond perdu »). Témoin 6.' },
    resolution: { valeur: 300 }
  },
  stylo: {
    largeur: { valeur: 0.4 / 25.4, aVerifier: true, note: 'De mémoire : la pointe fine des stylos Cricut laisse un trait d’environ 0,4 mm ; elle espace les hachures. À mesurer sur une feuille tracée (témoin 8).' }
  },
  typesDeLigne: [
    'Le SVG ne dit pas si une ligne se coupe, se dessine ou se raine : Design Space le règle après l’import, couche par couche.',
    'Une convention qui aide (facultative) : noir pour couper, bleu pour dessiner au stylo, vert pour rainer. Elle ne s’écrit pas dans le fichier.'
  ]
};

export const FAMILLES: readonly FamilleProduction[] = [CRICUT];

/** Un comportement du logiciel de la machine sur lequel l'editeur s'appuie sans l'avoir vu : une phrase, et pourquoi on le croit. */
export interface Comportement {
  /** Le nom du comportement dans docs/cricut/protocole.md, qui doit le citer. */
  readonly id: string;
  readonly texte: string;
  readonly aVerifier: true;
  readonly note: string;
}

/**
 * Ce que Design Space fait d'un dessin qui mele couper et ecrire (ADR-0028). Le SVG ne porte pas le type de ligne : l'export separe
 * les operations avant l'import (un fichier a couper, un fichier a ecrire, et un fichier combine en deux groupes) et le mode
 * d'emploi dit la marche. Rien de cela n'a ete essaye sur une machine : chaque point est a verifier (temoin 9).
 */
export const DESIGN_SPACE_OPERATIONS: readonly Comportement[] = [
  {
    id: 'designSpace.operations.superposition', aVerifier: true,
    texte: 'Deux fichiers importés l’un après l’autre, au même cadre et à la même taille physique, se superposent exactement.',
    note: 'De mémoire : Design Space garde la taille d’un SVG à unités physiques ; il pose chaque import au même coin. Témoin 9.'
  },
  {
    id: 'designSpace.operations.dessiner', aVerifier: true,
    texte: 'Le type de ligne « Dessiner » se règle sur les calques d’un fichier importé, et un trait sans remplissage y reste une ligne.',
    note: 'De mémoire : le type de ligne se choisit calque par calque dans le panneau « Opération ». Témoins 7 et 9.'
  },
  {
    id: 'designSpace.operations.attacher', aVerifier: true,
    texte: '« Attacher » garde le trait du stylo à sa place sur la pièce découpée, sur le même tapis.',
    note: 'De mémoire : sans « Attacher », Design Space répartit chaque calque sur le tapis à sa guise. Témoin 9.'
  },
  {
    id: 'designSpace.operations.groupes', aVerifier: true,
    texte: 'Les deux groupes du fichier combiné (« a-couper », « a-ecrire ») restent des groupes dans le panneau des calques, nommés par leur identifiant.',
    note: 'Inconnu : Design Space pourrait dissocier les groupes à l’import, ou les nommer autrement. Le fichier combiné n’est qu’un raccourci ; les deux fichiers séparés suffisent. Témoin 9.'
  }
];

/**
 * Ce que Design Space fait de la position d'un dessin sur le tapis (ADR-0039), sur quoi repose l'export « sans recalage automatique » :
 * un cadre de reperage de la taille de la zone utile, une couleur par couche, que l'on attache aux formes de sa couleur puis que l'on
 * passe en « Guide ». La documentation de Cricut et les tutoriels le laissent attendre ; rien n'a ete essaye sur une machine (temoin 10).
 */
export const DESIGN_SPACE_POSITION: readonly Comportement[] = [
  {
    id: 'designSpace.position.rognage', aVerifier: true,
    texte: 'À l’import, Design Space rogne le SVG à ses formes : le blanc autour du dessin, et donc sa place dans le plan, ne compte pas.',
    note: 'Rapporté par des utilisateurs (forums Inkscape et Adobe) ; aucune documentation de Cricut ne le dit. C’est pourquoi l’export ajoute un cadre de repérage : le cadre a la taille de la zone utile, et le dessin garde sa place dans le cadre. Témoin 10.'
  },
  {
    id: 'designSpace.position.coin', aVerifier: true,
    texte: 'Un ensemble attaché se pose dans le coin haut gauche de la zone de coupe du tapis, à la place qu’il a sur le canevas, les uns par rapport aux autres.',
    note: 'Le manuel de Design Space (« Attach to hold cut placement ») : « Attaching holds your cuts in the same position on the cutting mat as they appear on the design screen ». Le coin haut gauche par défaut est rapporté par des tutoriels (Underground Crafter, 2019). Témoin 10.'
  },
  {
    id: 'designSpace.position.guide', aVerifier: true,
    texte: 'Un cadre passé en « Guide » (Opération), attaché aux formes de sa couleur, garde leur place sur le tapis sans être découpé.',
    note: 'Le blog de Cricut dit qu’un Guide « will not cut, or do any other function » une fois « Make It » choisi ; il ne dit pas si un Guide attaché compte encore dans la place de l’ensemble. Si ce n’est pas le cas, déplacer le dessin sur l’aperçu du tapis reste possible. Témoin 10.'
  },
  {
    id: 'designSpace.position.glisser', aVerifier: true,
    texte: 'Sur l’aperçu du tapis, faire glisser un dessin à un endroit le fait couper à cet endroit.',
    note: 'L’aide de Cricut (écran « Prepare ») permet de déplacer et tourner les images sur l’aperçu du tapis ; un tutoriel dit que la position y est alors retenue. La distance aux bords que donne l’éditeur se lit sur la grille de l’aperçu. Témoin 10.'
  }
];

export interface DescriptionContexte {
  readonly id: IdContexte;
  readonly nom: string;
  /** La famille de machines du contexte ; null pour « Générique », qui ne juge rien. */
  readonly famille: Famille | null;
}

export const CONTEXTES: readonly DescriptionContexte[] = [
  { id: 'generique', nom: 'Générique', famille: null },
  { id: 'cricut', nom: 'Cricut', famille: 'cricut' }
];

/** Les choix d'un contexte Cricut ; « Générique » n'en a aucun. */
export interface ChoixMachine {
  readonly machine: string;
  readonly tapis: string;
  readonly materiau: string;
  readonly procede: Procede;
  readonly unite: UniteLongueur;
  /**
   * Faux : le recalage automatique est desactive (ADR-0039). Le plan de travail est alors le tapis, fixe ; les formes restent ou on
   * les a posees et l'export garde leur place (une feuille partielle posee ailleurs qu'en haut a gauche). Absent : le recalage
   * d'avant, le tapis cale sur le coin haut gauche du dessin, la ou Design Space pose les pieces. Seul `false` s'ecrit.
   */
  readonly recalage?: false;
  /**
   * La feuille posee sur le tapis (ADR-0039) : une boite en unites du plan, depuis le coin haut gauche du tapis. Absente : le tapis
   * entier. C'est la feuille partielle de la decoupe sans recalage, et la place ou « Dupliquer sur la feuille » range les copies.
   */
  readonly feuille?: Feuille;
}

/** Une feuille sur le tapis : coin haut gauche (depuis celui du tapis), largeur et hauteur, en unites du plan (1/96 po). */
export interface Feuille { readonly x: number; readonly y: number; readonly l: number; readonly h: number }

/** Le plus petit cote d'une feuille, en pouces : en deca, aucune piece ne se decoupe proprement. */
export const COTE_MIN_FEUILLE = 0.5;

export type ChoixProduction = { readonly contexte: 'generique' } | ({ readonly contexte: 'cricut' } & ChoixMachine);

export const CHOIX_GENERIQUE: ChoixProduction = { contexte: 'generique' };
/**
 * Le premier choix Cricut. L'unite est le millimetre : l'interface est francaise, et une personne qui mesure en millimetres lisait
 * « 0,06 po » sans le comprendre. Le pouce reste au choix (l'unite de Design Space) et se retient (zones/parcoursCricut.ts). Un fichier
 * marque sans unite se relit toujours en pouces (choixDeMarque) : ses octets reecrits ne changent pas.
 */
export const CHOIX_CRICUT_DEFAUT: ChoixMachine = { machine: 'maker', tapis: '12x12', materiau: 'papier-cartonne', procede: 'decoupe', unite: 'mm' };

export const NOMS_PROCEDE: Readonly<Record<Procede, string>> = { decoupe: 'Découpe', 'imprimer-decouper': 'Print Then Cut (imprimer puis découper)', 'dessin-stylo': 'Dessin au stylo' };

/**
 * Les procedes d'outil a venir (ADR-0022) : la meme logique que le stylo (l'outil suit les lignes, il ne remplit pas), une largeur
 * d'outil a mesurer et des comportements de Design Space a verifier. Ils ne se choisissent pas tant que le protocole ne les a pas
 * vus sur une machine : le selecteur les dit sur une ligne inactive, comme les materiaux annonces.
 */
export const OUTILS_A_VENIR: ReadonlyArray<{ readonly id: string; readonly nom: string; readonly note: string }> = [
  { id: 'gravure', nom: 'gravure', note: 'Pointe de gravure (Maker) : des lignes comme le stylo ; profondeur et matières à vérifier.' },
  { id: 'dorure', nom: 'dorure (foil)', note: 'Outil de dorure (Explore 3, Maker 3) : des lignes et des hachures ; largeur des pointes à vérifier.' }
];
export const NOMS_UNITE: Readonly<Record<UniteLongueur, string>> = { in: 'po', mm: 'mm' };
