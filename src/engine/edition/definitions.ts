// Les definitions d'un SVG riche (ADR-0012, annexe 2 §4) : degrades, motifs, decoupes, masques et filtres s'ecrivent une fois
// dans <defs>, sous un identifiant tire de l'EMPREINTE de leur texte (`ed-<genre>-<14 chiffres hexadecimaux>`). Le modele n'en garde
// aucun : une peinture est une valeur en ligne, le partage n'existe qu'a l'ecriture. D'ou, sans rien de plus : aucune collision avec
// un autre identifiant (l'ecriture n'en pose pas d'autre), deux definitions de meme identifiant ont le meme contenu (deux SVG dans une
// meme page ne se genent pas), mille formes au meme degrade n'ecrivent qu'une definition, et les octets sont deterministes. Pur.

import { empreinteTexte } from '../../util/empreinte.js';

/** Le genre d'une definition, dans son identifiant : decoupe, masque, degrade, motif (pattern), filtre. */
export type GenreDefinition = 'c' | 'm' | 'd' | 'p' | 'f';

/** L'identifiant d'une definition : son genre et l'empreinte de son texte (balise, attributs et enfants, sans l'identifiant). */
export const idDefinition = (genre: GenreDefinition, texte: string): string => 'ed-' + genre + '-' + empreinteTexte(texte);

/** Ce qu'un ecrivain de definition depose : la balise, ses attributs (chacun precede d'une espace) et ses enfants ('' : auto-fermante). */
export interface Definition {
  readonly genre: GenreDefinition;
  readonly balise: string;
  readonly attributs: string;
  readonly enfants: string;
}

/** Le recueil des definitions d'une ecriture : chaque `poser` rend l'identifiant a citer dans `url(#…)`. */
export interface Recueil {
  poser(d: Definition): string;
  /** Le contenu de <defs>, dans l'ordre de premiere apparition ; '' sans definition. */
  ecrire(): string;
}

/**
 * Un recueil vide. Dedoublonne par texte ; une collision d'empreinte (de l'ordre de 10^-7 pour 10^4 definitions) entre deux textes
 * differents suffixe `-2`, `-3`… dans l'ordre d'apparition, donc de facon deterministe. Une definition qui en emploie une autre la
 * pose d'abord (un motif dont la tuile emploie un degrade) : les dependances s'ecrivent avant ce qui les cite.
 */
export function recueil(): Recueil {
  const parTexte = new Map<string, string>(), parId = new Map<string, string>(), ecrites: string[] = [];
  return {
    poser(d) {
      const texte = d.balise + d.attributs + (d.enfants ? '>' + d.enfants + '</' + d.balise + '>' : '/>');
      const deja = parTexte.get(texte);
      if (deja !== undefined) return deja;
      const base = idDefinition(d.genre, texte);
      let id = base;
      for (let n = 2; parId.has(id); n++) id = base + '-' + n;
      parTexte.set(texte, id);
      parId.set(id, texte);
      ecrites.push('<' + d.balise + ' id="' + id + '"' + d.attributs + (d.enfants ? '>' + d.enfants + '</' + d.balise + '>' : '/>'));
      return id;
    },
    ecrire: () => (ecrites.length ? '<defs>' + ecrites.join('') + '</defs>' : '')
  };
}
