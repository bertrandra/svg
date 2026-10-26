// Les points d'extension du modele v2 (ADR-0012, annexe 8, etape 0) : une fonctionnalite (groupes, degrades, decoupes, masques,
// effets, motifs, images) est UN fichier de `edition/fonctions/` qui exporte une `Fonctionnalite`, et UNE ligne de `catalogue.ts`.
// La lecture, l'ecriture et les transformations consultent ces crochets au lieu qu'on edite leurs corps de fonction : treize etapes
// ne se disputent plus `parcours.ts`, `heritage.ts`, `ecriture.ts` ni `operations.ts`.
//
// Le contrat de chaque crochet, que `tests/unit/engine/fonctionnalites.test.ts` verifie sur toute fonctionnalite inscrite : sur une
// feuille plate (sans champ v2), il rend la meme feuille, aucun attribut, aucune definition. La lecture en mode `plat` ne consulte
// aucune fonctionnalite (sa liste est vide) : le contrat de l'ADR-0001 ne peut pas bouger par ici.
//
// Un fichier de fonctionnalite n'importe jamais `parcours.ts`, `lecture.ts`, `ecriture.ts`, `ecritureRiche.ts`, `operations.ts`,
// `transformation.ts` ni `catalogue.ts` (le test des cycles d'import le refuserait) : ce dont il a besoin lui est passe en argument.
// Ses phrases de refus et d'`ignores` vivent dans son fichier, pas dans `ignores.ts`. Sa regle de descente vers un dessin plat vit a
// part, dans `engine/descente/` (elle peut employer les booleens, que `edition/` ne peut pas importer).

import type { Noeud } from '../../util/xml.js';
import type { Boite, Contenu, Forme, Groupe, Matrice, Peinture } from './types.js';
import type { Contexte, Parcours, Pret } from './parcours.js';
import type { Recueil } from './definitions.js';

// ---------------------------------------------------------------- lecture

/** Ce que `refusDe` (heritage.ts) refuse aujourd'hui et qu'une fonctionnalite peut prendre en charge en mode riche. */
export type PriseEnCharge = 'decoupe' | 'masque' | 'filtre';

/** Ce que la marche offre a un lecteur : de quoi descendre, poser une forme comme d'habitude, refuser ou dire une perte. */
export interface Marche {
  readonly parcours: Parcours;
  /** Lit les enfants d'un element comme ceux d'un groupe, dans ce contexte. */
  enfants(n: Noeud, ctx: Contexte): void;
  /** Lit un element comme la marche le ferait (preparation, lecteurs, refus compris). */
  visiter(n: Noeud, ctx: Contexte): void;
  /** Pose un element de forme (path, rect, circle…) avec la peinture que ses ancetres lui laissent : le chemin de toujours. */
  poserForme(n: Noeud, pret: Pret): void;
  /** La boite, dans le repere du plan, d'un element de forme (de quoi resoudre `objectBoundingBox`) ; null s'il n'a pas de trace. */
  boiteForme(n: Noeud, pret: Pret): Boite | null;
  /** Refuse le SVG en nommant ce qui l'empeche (« un filtre (feTurbulence) »). */
  refuser(phrase: string): void;
  /** Dit ce que la lecture laisse tomber (`ignores`). */
  ignorer(phrase: string): void;
}

/** Un lecteur d'element, pour un nom de balise : il remplace le traitement par defaut de la marche (apres preparation). */
export type LecteurElement = (n: Noeud, pret: Pret, marche: Marche) => void;

/** Une peinture `url(#…)` resolue : la peinture du modele et sa couleur de repli (#rrggbb). */
export interface PeintureResolue { readonly peinture: Peinture; readonly repli: string }

export interface CrochetsLecture {
  /** Les lecteurs par nom de balise (`g`, `image`…). Les definitions (`defs`, `clipPath`, degrades…) ne se visitent pas : elles se resolvent par reference. */
  readonly elements?: Readonly<Record<string, LecteurElement>>;
  /** Ce que `refusDe` ne refuse plus en mode riche : la fonctionnalite le lit (un groupe par `groupe`, une feuille par `feuille`). */
  readonly prises?: readonly PriseEnCharge[];
  /** Resout une peinture `url(#…)` d'une forme, ou rend null (une autre essaiera ; sinon le refus d'aujourd'hui). */
  readonly peinture?: (url: string, cote: 'remplissage' | 'contour', n: Noeud, pret: Pret, marche: Marche) => PeintureResolue | null;
  /** Complete une feuille qui vient d'etre lue (son filtre, ses donnees) ; la meme feuille si rien. */
  readonly feuille?: (f: Forme, n: Noeud, pret: Pret, marche: Marche) => Forme;
  /** Complete un groupe que le lecteur des groupes vient de creer (decoupe, masque, effets) ; le meme groupe si rien. */
  readonly groupe?: (g: Groupe, n: Noeud, pret: Pret, marche: Marche) => Groupe;
}

// ---------------------------------------------------------------- ecriture

/**
 * Un attribut ecrit et son rang : l'ecriture les trie par rang (puis par ordre du catalogue), apres tous les attributs de l'ecriture
 * plate. Le texte commence par une espace : ` filter="url(#ed-f-…)"`.
 */
export type AttributEcrit = readonly [rang: number, texte: string];

/** Les rangs fixes par l'annexe 2 §3 : sur un groupe opacity, clip-path, mask, filter, data-ed-nom ; sur une feuille filter, puis les donnees. */
export const RANG_GROUPE = { opacite: 10, decoupe: 20, masque: 30, filtre: 40, nom: 90 } as const;
export const RANG_FEUILLE = { filtre: 10, donnees: 90 } as const;

/** Ce que l'ecriture riche passe a un ecrivain : la precision, le recueil des definitions, et de quoi ecrire un contenu imbrique. */
export interface ContexteEcriture {
  readonly precision: number;
  readonly definitions: Recueil;
  /** Le corps d'un contenu (feuilles et groupes), ecrit comme le dessin : pour une decoupe, un masque, une tuile de motif. */
  contenu(c: Contenu): string;
}

export interface CrochetsEcriture {
  /** La feuille telle qu'elle s'ecrit : une peinture non unie y devient `url(#…)` a la place de la couleur, au meme rang. */
  readonly peindreFeuille?: (f: Forme, e: ContexteEcriture) => Forme;
  /** Les attributs v2 d'une feuille (son filtre…). */
  readonly attributsFeuille?: (f: Forme, e: ContexteEcriture) => readonly AttributEcrit[];
  /** L'element entier d'une feuille qui n'est pas un <path> (une image), ou null. */
  readonly elementFeuille?: (f: Forme, e: ContexteEcriture) => string | null;
  /** Les attributs d'un groupe (opacite, decoupe, masque, filtre, nom). */
  readonly attributsGroupe?: (g: Groupe, e: ContexteEcriture) => readonly AttributEcrit[];
}

// ---------------------------------------------------------------- transformations

export interface CrochetsTransformation {
  /**
   * Une feuille qui vient d'etre transformee par `m` (son trace, son trait, son texte le sont deja ; ses champs v2 sont ceux d'avant) :
   * la fonctionnalite transforme les siens (la matrice d'un degrade, l'ecart d'un flou). La meme feuille si elle n'en porte pas.
   */
  readonly feuille?: (f: Forme, m: Matrice) => Forme;
  /** Un groupe dans la fermeture d'une transformation (annexe 1 §9) : sa decoupe, son masque, ses effets. Le meme groupe sinon. */
  readonly groupe?: (g: Groupe, m: Matrice) => Groupe;
}

// ---------------------------------------------------------------- etendue visuelle

/**
 * La boite visuelle (ce qui se voit, pour `ajusterPlan`, la region d'un filtre, l'export) : la decoupe la rogne, les effets
 * l'elargissent (annexe 3 §2, annexe 4 B §2). Consultes par `boiteVisuelle` (etape 1, dans `etendue.ts`) : les etapes 5 et 7
 * n'ont alors plus a se disputer ce fichier.
 */
export interface CrochetsEtendue {
  /** La boite d'une feuille (trait compris), rognee ou elargie par ce que la fonctionnalite y ajoute ; la meme boite sinon. */
  readonly feuille?: (f: Forme, b: Boite) => Boite;
  /** La boite d'un groupe (l'union de ses enfants), rognee par sa decoupe, elargie par ses effets ; la meme boite sinon. */
  readonly groupe?: (g: Groupe, b: Boite) => Boite;
}

// ---------------------------------------------------------------- la fonctionnalite

export interface Fonctionnalite {
  /** Un nom court, unique : 'groupes', 'degrades', 'decoupes', 'masques', 'effets', 'motifs', 'images'. */
  readonly nom: string;
  readonly lecture?: CrochetsLecture;
  readonly ecriture?: CrochetsEcriture;
  readonly transformation?: CrochetsTransformation;
  readonly etendue?: CrochetsEtendue;
}

// ---------------------------------------------------------------- consultation (pour parcours, ecriture, transformation)

const AUCUNE_PRISE: ReadonlySet<PriseEnCharge> = new Set();
const memoPrises = new WeakMap<readonly Fonctionnalite[], ReadonlySet<PriseEnCharge>>();

/** Ce que ces fonctionnalites prennent en charge ; l'ensemble vide pour une liste vide (le mode plat). */
export function prisesDe(fonctions: readonly Fonctionnalite[]): ReadonlySet<PriseEnCharge> {
  if (!fonctions.length) return AUCUNE_PRISE;
  let s = memoPrises.get(fonctions);
  if (!s) { s = new Set(fonctions.flatMap(f => f.lecture?.prises ?? [])); memoPrises.set(fonctions, s); }
  return s;
}

/** Le lecteur d'une balise : celui de la premiere fonctionnalite qui en declare un. */
export function lecteurDe(fonctions: readonly Fonctionnalite[], nom: string): LecteurElement | undefined {
  for (const f of fonctions) {
    const e = f.lecture?.elements;
    if (e && Object.prototype.hasOwnProperty.call(e, nom)) return e[nom];
  }
  return undefined;
}

/** La premiere resolution d'une peinture `url(#…)`, ou null. */
export function resoudrePeinture(fonctions: readonly Fonctionnalite[], url: string, cote: 'remplissage' | 'contour', n: Noeud, pret: Pret, marche: Marche): PeintureResolue | null {
  for (const f of fonctions) {
    const r = f.lecture?.peinture?.(url, cote, n, pret, marche);
    if (r) return r;
  }
  return null;
}

/** Une feuille lue, completee par chaque fonctionnalite dans l'ordre du catalogue. */
export const completerFeuille = (fonctions: readonly Fonctionnalite[], f: Forme, n: Noeud, pret: Pret, marche: Marche): Forme =>
  fonctions.reduce<Forme>((x, k) => k.lecture?.feuille?.(x, n, pret, marche) ?? x, f);

/** Un groupe lu, complete par chaque fonctionnalite dans l'ordre du catalogue (a appeler par le lecteur des groupes). */
export const completerGroupe = (fonctions: readonly Fonctionnalite[], g: Groupe, n: Noeud, pret: Pret, marche: Marche): Groupe =>
  fonctions.reduce<Groupe>((x, k) => k.lecture?.groupe?.(x, n, pret, marche) ?? x, g);

/** La boite visuelle d'une feuille, passee par chaque fonctionnalite dans l'ordre du catalogue. */
export const etendreFeuille = (fonctions: readonly Fonctionnalite[], f: Forme, b: Boite): Boite =>
  fonctions.reduce<Boite>((x, k) => k.etendue?.feuille?.(f, x) ?? x, b);

/** La boite visuelle d'un groupe, passee par chaque fonctionnalite dans l'ordre du catalogue. */
export const etendreGroupe = (fonctions: readonly Fonctionnalite[], g: Groupe, b: Boite): Boite =>
  fonctions.reduce<Boite>((x, k) => k.etendue?.groupe?.(g, x) ?? x, b);

/** Les attributs ecrits, tries par rang (stable : a rang egal, l'ordre du catalogue), en un seul texte. */
export const attributsTries = (attributs: readonly AttributEcrit[]): string =>
  [...attributs].sort((a, b) => a[0] - b[0]).map(a => a[1]).join('');
