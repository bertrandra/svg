// Ce que la lecture d'un PDF accepte (ADR-0020, sur le modele de l'ADR-0014), et les deux signaux qu'elle emploie : le refus
// nomme, et la demande d'un flux a decompresser. Chaque borne est haute : aucun PDF de dessin reel ne la touche ; basse
// assez pour qu'un fichier hostile ne coute que quelques secondes et quelques centaines de Mo au plus.

/** Les bornes de la lecture. Un depassement est un refus nomme, jamais un travail sans fin. */
export const LIMITES_PDF = {
  /** Taille du fichier. Un PDF de dessin pese rarement plus de 20 Mo ; un export d'Illustrator avec ses donnees privees, 60. */
  octets: 100 * 1024 * 1024,
  /** Octets decompresses en tout, tous flux confondus : une bombe de decompression (1 000 pour 1) s'arrete ici. */
  decompresses: 128 * 1024 * 1024,
  /** Entrees de la table des objets, et objets lus. Un atlas de mille pages en compte quelques centaines de milliers. */
  objets: 1_000_000,
  /** Tableaux et dictionnaires imbriques dans un meme objet. Les producteurs en font moins de dix. */
  imbrication: 256,
  /** Renvois enchaines (un objet qui renvoie a un objet qui renvoie…). */
  renvois: 32,
  /** Sections de la table des objets enchainees par /Prev (une par enregistrement incremental). */
  sections: 64,
  /** Pages, et profondeur de l'arbre des pages. */
  pages: 100_000,
  profondeurPages: 64,
  /** Etats graphiques empiles par q (la specification en garantissait 28 ; les producteurs restent sous 50). */
  pile: 1024,
  /** Formulaires (XObjects) imbriques, et formulaires dessines en tout : un formulaire peut en dessiner d'autres. */
  profondeurFormulaires: 16,
  formulaires: 20_000,
  /** Operateurs executes en tout, formulaires compris : cinq millions se lisent en quelques secondes. */
  operateurs: 5_000_000,
  /** Operandes en attente d'un operateur. */
  operandes: 10_000,
  /** Formes rendues et segments de trace en tout : au-dela, l'editeur ne suivrait plus (ADR-0008). */
  formes: 100_000,
  segments: 2_000_000,
  /** Une coordonnee de la page, apres transformations (la meme borne que la lecture d'un SVG). */
  coordonnee: 1e9,
  /** Filtres enchaines sur un meme flux. */
  filtres: 8
} as const;

/** Un refus de lecture : son message est la phrase a montrer, en francais. */
export class RefusPdf extends Error {}

/** Un defaut de syntaxe : il devient un refus nomme, ou la perte d'un morceau de contenu dit dans `ignores`. */
export class SyntaxePdf extends Error {}

/** Ce que rend une decompression : les octets, ou pourquoi il n'y en a pas. */
export type ResultatDecompression = Uint8Array | 'trop' | 'illisible' | 'indisponible';

/**
 * Decompresse un flux zlib (FlateDecode). Le coeur pur ne decompresse pas : il recoit cette fonction. `cle` nomme le flux dans le
 * fichier (deux appels de meme cle rendent la meme chose), `max` borne la sortie : au-dela, 'trop'.
 */
export type Decompression = (brut: Uint8Array, max: number, cle: number) => ResultatDecompression;

/** Un flux que la lecture attend : sa cle, ses octets compresses, la borne de sa sortie. */
export interface DemandeFlux { readonly cle: number; readonly brut: Uint8Array; readonly max: number }

/**
 * Le signal d'une decompression qui n'est pas encore faite. Une decompression du navigateur est asynchrone et la lecture ne l'est
 * pas : `io/pdf.ts` donne une fonction qui leve ce signal pour un flux qu'elle n'a pas encore, decompresse ce qu'il demande, et
 * relance la lecture. La lecture ne l'attrape jamais : il traverse tout.
 */
export class FluxEnAttente extends Error {
  constructor(readonly demandes: readonly DemandeFlux[]) { super('flux en attente'); }
}

/** Un nombre en francais, pour les phrases de refus. */
export const enFrancais = (n: number): string => n.toLocaleString('fr-FR');
