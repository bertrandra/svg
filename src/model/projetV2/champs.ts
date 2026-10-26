// Les champs du modele v2 dans le projet JSON (ADR-0012, ADR-0030) : un point d'entree par champ, pour que chaque etape qui livre
// un champ (degrades a l'etape 3, decoupes a la 5, masques a la 6, effets a la 7, motifs a la 9, images a la 12) l'ajoute par UNE
// ligne ici, et une ligne de `engine/projetV2/champs.ts`, sans editer le corps de `lireForme` (model/projet.ts) ni celui de
// `formeProjet` (engine/projet.ts).
//
// Un champ v2 d'une forme s'ecrit APRES les champs d'avant (apres `verrouille`), dans l'ordre de ces listes, et seulement quand il
// est present : un projet plat garde exactement ses octets. Sa presence fait du projet un projet au format 2 (model/projet.ts,
// `VERSION_PROJET_PLAT`). Pur : la validation ne leve que par `refuser`, que `validerProjet` rattrape.

/** Ce que la validation du projet prete a un champ : ses lectures bornees, et le refus nomme. */
export interface OutilsProjet {
  texte(v: unknown, quoi: string, max: number): string;
  nombre(v: unknown, quoi: string, min?: number, max?: number): number;
  booleen(v: unknown, quoi: string): boolean;
  tableau(v: unknown, quoi: string, max: number): readonly unknown[];
  objet(v: unknown, quoi: string): Record<string, unknown>;
  choix<T extends string>(v: unknown, quoi: string, permis: readonly T[]): T;
  refuser(raison: string): never;
  /** La forme d'un identifiant de forme ou de groupe. */
  readonly identifiant: RegExp;
}

/** Un champ facultatif du modele v2 : sa cle dans l'objet, et sa lecture (la valeur reconstruite, ou le refus). */
export interface ChampProjet {
  readonly cle: string;
  lire(v: unknown, o: OutilsProjet): unknown;
}

/** Les champs v2 d'une forme de projet (une ligne par etape) : `parent`, le groupe de la forme (etape 1). */
export interface ChampsFormeV2 {
  readonly parent?: string;
}

/** Les champs v2 d'un groupe de projet au-dela de sa base (decoupe, masque, effets : une ligne par etape). */
export type ChampsGroupeV2 = Record<never, never>;

/** Un identifiant de groupe : celui de l'arbre, par la meme regle que celui d'une forme. */
function lireIdentifiantGroupe(v: unknown, o: OutilsProjet, quoi: string): string {
  const s = o.texte(v, quoi, 64);
  return o.identifiant.test(s) ? s : o.refuser(quoi + ' est mal désigné');
}

/** Les champs v2 d'une forme, dans l'ordre ou ils s'ecrivent. */
export const CHAMPS_FORME_V2: readonly ChampProjet[] = [
  { cle: 'parent', lire: (v, o) => lireIdentifiantGroupe(v, o, 'le groupe d’une forme') }
];

/** Les champs v2 d'un groupe au-dela de sa base, dans l'ordre ou ils s'ecrivent ; vide a l'etape 1. */
export const CHAMPS_GROUPE_V2: readonly ChampProjet[] = [];

/** Les cles de tous les champs v2 d'une forme : leur presence demande le format 2. */
export const CLES_FORME_V2: readonly string[] = CHAMPS_FORME_V2.map(c => c.cle);
