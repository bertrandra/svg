// Ce que la page exige du navigateur pour marcher, dit en clair avant d'echouer (docs/navigateurs.md).
// Une capacite manquante ne doit jamais donner une page blanche ni une erreur de console : la page
// l'ecrit en francais et dit quoi faire. Ici, le calcul pur (quoi manque, comment le dire) ; la sonde
// qui interroge le vrai navigateur vit dans io/capacites.ts, pour que le coeur reste sans DOM.
//
// Seules sont listees les capacites sans lesquelles un geste de base casse. Le reste (ResizeObserver,
// le presse-papiers, localStorage, `inert`, color-mix...) se contourne et n'a pas a bloquer : voir le
// tableau de docs/navigateurs.md, qui dit pour chacune ce que la page fait sans elle.

/** Le moment ou une capacite devient indispensable : au demarrage, des qu'on lit une image, ou des qu'on la vectorise. */
export type Besoin = 'demarrage' | 'image' | 'vectorisation';

export type IdCapacite = 'objectHasOwn' | 'pointeurs' | 'blob' | 'canvas' | 'webassembly';

export interface Capacite {
  readonly id: IdCapacite;
  readonly besoin: Besoin;
  /** Ce qui manque, en une expression qui suit « il lui manque » (texte d'interface, avec accents). */
  readonly manque: string;
}

/** Les capacites exigees, dans l'ordre ou on les dit. */
export const CAPACITES: readonly Capacite[] = [
  { id: 'objectHasOwn', besoin: 'demarrage', manque: 'la lecture des noms de couleur (Object.hasOwn)' },
  { id: 'pointeurs', besoin: 'demarrage', manque: 'les évènements de pointeur (souris, stylet et doigt)' },
  { id: 'blob', besoin: 'demarrage', manque: 'les fichiers en mémoire (Blob et URL.createObjectURL)' },
  { id: 'canvas', besoin: 'image', manque: 'le dessin 2D du navigateur (canvas), qui lit les pixels d’une image' },
  { id: 'webassembly', besoin: 'vectorisation', manque: 'WebAssembly, qui fait tourner le traceur' }
];

/** Ce que la sonde a vu : vrai quand la capacite est la. */
export type Sonde = Readonly<Record<IdCapacite, boolean>>;

const RANG: Readonly<Record<Besoin, number>> = { demarrage: 0, image: 1, vectorisation: 2 };

/**
 * Les capacites qui manquent pour faire ce que `besoin` demande. Qui vectorise a besoin aussi de lire
 * l'image, et de demarrer : un besoin plus grand inclut les precedents.
 */
export function manquantes(sonde: Sonde, besoin: Besoin): readonly Capacite[] {
  return CAPACITES.filter(c => RANG[c.besoin] <= RANG[besoin] && !sonde[c.id]);
}

/** Le texte a montrer pour une liste non vide de capacites manquantes. */
export function phraseManquantes(liste: readonly Capacite[]): string {
  const noms = liste.map(c => c.manque);
  const dit = noms.length > 1 ? noms.slice(0, -1).join(', ') + ' et ' + noms.slice(-1).join('') : noms.join('');
  return 'Ce navigateur ne sait pas faire ce que l’éditeur lui demande : il lui manque ' + dit + '. '
    + 'Mettez-le à jour, ou ouvrez cette page dans une version récente de Chrome, Edge, Firefox ou Safari (iOS 16.4 et plus).';
}
