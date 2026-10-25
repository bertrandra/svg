// Les objets d'un PDF (ISO 32000-1, 7.3) tels que la lecture les garde. Un nom est une chaine JavaScript (sans sa barre) : c'est
// l'objet de loin le plus compare. Une chaine de texte garde ses octets en latin-1, un flux ses bornes dans le fichier : ses
// octets ne sont lus (et decompresses) qu'a la demande. Aucun calcul ici, que des types et des gardes.

export interface Ref { readonly t: 'ref'; readonly n: number; readonly g: number }
/** Une chaine de texte : ses octets, un caractere par octet. */
export interface Chaine { readonly t: 'chaine'; readonly v: string }
/** Un flux : son dictionnaire, et ou ses octets bruts commencent et finissent dans le fichier. */
export interface Flux { readonly t: 'flux'; readonly dict: Dict; readonly debut: number; readonly fin: number }
export type Dict = ReadonlyMap<string, ObjetPdf>;
export type ObjetPdf = null | boolean | number | string | Chaine | Ref | Flux | Dict | readonly ObjetPdf[];

/** Un mot-cle (obj, R, stream, un operateur de contenu) ou un delimiteur ([, ], <<, >>, {, }). */
export class Mot {
  constructor(readonly v: string) {}
}

export const estDict = (o: ObjetPdf | Mot | undefined): o is Dict => o instanceof Map;
export const estTableau = (o: ObjetPdf | Mot | undefined): o is readonly ObjetPdf[] => Array.isArray(o);
export const estRef = (o: ObjetPdf | Mot | undefined): o is Ref =>
  typeof o === 'object' && o !== null && !(o instanceof Map) && !(o instanceof Mot) && !Array.isArray(o) && (o as { t?: string }).t === 'ref';
export const estFlux = (o: ObjetPdf | Mot | undefined): o is Flux =>
  typeof o === 'object' && o !== null && !(o instanceof Map) && !(o instanceof Mot) && !Array.isArray(o) && (o as { t?: string }).t === 'flux';
export const estChaine = (o: ObjetPdf | Mot | undefined): o is Chaine =>
  typeof o === 'object' && o !== null && !(o instanceof Map) && !(o instanceof Mot) && !Array.isArray(o) && (o as { t?: string }).t === 'chaine';
export const estNombre = (o: ObjetPdf | Mot | undefined): o is number => typeof o === 'number' && Number.isFinite(o);
export const estNom = (o: ObjetPdf | Mot | undefined): o is string => typeof o === 'string';

/** Le dictionnaire d'un objet : celui d'un flux, ou l'objet lui-meme ; null sinon. */
export const dictDe = (o: ObjetPdf | undefined): Dict | null => (estDict(o) ? o : estFlux(o) ? o.dict : null);

/** Deux renvois au meme objet. */
export const memeRef = (a: Ref, b: Ref): boolean => a.n === b.n && a.g === b.g;
