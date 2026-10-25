// L'etat graphique d'une page en cours de lecture (ISO 32000-1, 8.4) et le contexte de la lecture : ce que q empile et Q
// depile, ce que la page entiere partage (les formes rendues, les compteurs des bornes, les pertes a dire). Aucun calcul ici.

import type { Chemin, Forme, Matrice } from '../editionSvg.js';
import { GRIS, type Espace } from './couleurs.js';
import type { DocumentPdf } from './structure.js';

/** Une peinture : son espace, ses composantes, et le nom du motif quand l'espace en est un. */
export interface Peinture { readonly espace: Espace; readonly valeurs: readonly number[]; readonly motif: string | null }

/** Une boite [x0, y0, x1, y1] dans le repere du dessin. */
export type Rect = readonly [number, number, number, number];

/** La decoupe courante : aucune, un rectangle droit (dont on sait dire s'il coupe une forme), ou une forme quelconque. */
export type Decoupe = null | Rect | 'complexe';

export interface Etat {
  ctm: Matrice;
  remplissage: Peinture;
  contour: Peinture;
  epaisseur: number;
  /** 0 bout plat, 1 rond, 2 carre (J). */
  bout: number;
  /** 0 pointe, 1 ronde, 2 biseau (j). Le defaut du PDF est la pointe, celui de notre modele la ronde. */
  jonction: number;
  limite: number;
  tirets: readonly number[];
  phase: number;
  /** Opacite du remplissage (ca) et du trait (CA). */
  ca: number;
  CA: number;
  /** L'opacite des groupes de transparence englobants, qui multiplie celle de leurs formes. */
  groupe: number;
  decoupe: Decoupe;
  /** Le dernier trace de decoupe, dans le repere du dessin : la forme d'un degrade peint par `sh`. */
  cheminDecoupe: Chemin | null;
  masqueDoux: boolean;
  fusion: boolean;
}

export const PEINTURE_NOIRE: Peinture = { espace: GRIS, valeurs: [0], motif: null };

/** L'etat initial d'une page (8.4.1, tableau 52). */
export const etatInitial = (ctm: Matrice): Etat => ({
  ctm, remplissage: PEINTURE_NOIRE, contour: PEINTURE_NOIRE, epaisseur: 1, bout: 0, jonction: 0, limite: 10, tirets: [], phase: 0,
  ca: 1, CA: 1, groupe: 1, decoupe: null, cheminDecoupe: null, masqueDoux: false, fusion: false
});

export const copier = (e: Etat): Etat => ({ ...e });

/** Ce que la lecture n'a pas repris, ou seulement approche : de quoi le dire (ignores.ts). */
export interface Pertes {
  textes: number;
  images: number;
  decoupes: number;
  motifs: number;
  degrades: number;
  masquees: number;
  annotations: number;
  masquesDoux: number;
  fusions: number;
  filets: number;
  cmjn: boolean;
  approchees: boolean;
  illisible: boolean;
}

export const pertesVides = (): Pertes => ({
  textes: 0, images: 0, decoupes: 0, motifs: 0, degrades: 0, masquees: 0, annotations: 0, masquesDoux: 0, fusions: 0, filets: 0,
  cmjn: false, approchees: false, illisible: false
});

/** Ce que toute la page partage pendant sa lecture. */
export interface Contexte {
  readonly doc: DocumentPdf;
  /** Du repere de la page (origine en bas a gauche) a celui du dessin (origine en haut a gauche, rotation appliquee). */
  readonly page: Matrice;
  readonly formes: Forme[];
  readonly pertes: Pertes;
  /** Les calques eteints a l'ouverture (numeros d'objet des OCG). */
  readonly calquesEteints: (n: number) => boolean;
  readonly formulairesActifs: Set<number>;
  operateurs: number;
  segments: number;
  formulaires: number;
}
