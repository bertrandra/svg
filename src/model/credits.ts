// Les credits : ce que le produit redistribue (les formes de game-icons.net, les fontes, les
// bibliotheques) et la provenance d'une forme. Une seule source, lue par la boite « A propos et
// credits », par l'ecriture du SVG (l'element <metadata> d'attribution) et par scripts/mentions.mjs,
// qui en tire THIRD-PARTY-NOTICES.md et dist/MENTIONS.txt. Pur : de la donnee et des fonctions de texte.
//
// Pourquoi ici et pas dans l'interface : la licence CC BY 3.0 des formes veut une mention a chaque
// redistribution, jusque dans le fichier ecrit ; l'ecriture (engine) doit donc la connaitre, et elle
// ne peut pas importer une zone React. Les textes de licence, eux, ne sont jamais recopies a la main :
// le script les lit dans les paquets (un test confronte cette liste au package-lock.json).

/** Une source de formes dont la provenance voyage avec la forme (`Forme.origine`). */
export interface SourceOrigine {
  /** Le prefixe d'une origine : `game-icons` pour `game-icons:3d-glasses`. */
  readonly prefixe: string;
  readonly nom: string;
  readonly url: string;
  /** Le nom court de la licence, tel qu'on la cite : « CC BY 3.0 ». */
  readonly licence: string;
  readonly urlLicence: string;
}

export const SOURCES_ORIGINE: readonly SourceOrigine[] = [
  {
    prefixe: 'game-icons',
    nom: 'game-icons.net et ses contributeurs',
    url: 'https://game-icons.net',
    licence: 'CC BY 3.0',
    urlLicence: 'https://creativecommons.org/licenses/by/3.0/'
  }
];

/** Le prefixe des formes de la bibliotheque, pour que le code n'ecrive pas la chaine a la main. */
export const PREFIXE_BIBLIOTHEQUE = 'game-icons';

/** L'origine d'une forme de la bibliotheque, d'apres son identifiant game-icons.net. */
export const origineDeBibliotheque = (id: string): string => PREFIXE_BIBLIOTHEQUE + ':' + id;

// Une origine s'ecrit dans un attribut et dans un element XML, et dans un commentaire : seuls des caracteres
// qui n'ont rien a echapper, et jamais deux tirets de suite (interdits dans un commentaire).
const FORME_ORIGINE = /^([a-z][a-z0-9]*(?:-[a-z0-9]+)*):([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/** Vrai pour une origine connue et bien formee : on n'ecrit que ce que le produit sait creditier. */
export function origineValide(o: string): boolean {
  const m = FORME_ORIGINE.exec(o);
  return m !== null && SOURCES_ORIGINE.some(s => s.prefixe === m[1]);
}

/** Les origines valides, sans doublon, en ordre alphabetique : la forme canonique, donc des octets stables. */
export function normaliserOrigines(liste: Iterable<string>): string[] {
  return [...new Set([...liste].filter(origineValide))].sort();
}

/** La mention a faire figurer avec des formes d'origine donnee : une phrase par source presente, sans accent (elle part dans des PDF et des commentaires). */
export function mentionOrigines(origines: readonly string[]): string {
  const presents = new Set(origines.map(o => o.slice(0, o.indexOf(':'))));
  return SOURCES_ORIGINE.filter(s => presents.has(s.prefixe))
    .map(s => 'Contient des formes dont la source est ' + s.nom + ' (' + s.url + '), sous licence ' + s.licence + ' (' + s.urlLicence + ').')
    .join(' ');
}

/**
 * Le texte de l'element <metadata> d'un SVG qui porte des formes creditees : la mention lisible, puis la
 * liste des origines pour les machines. `origines` doit etre normalisee ; vide, il n'y a rien a dire.
 */
export function texteMetadonnees(origines: readonly string[]): string {
  return origines.length ? mentionOrigines(origines) + ' Origines : ' + origines.join(', ') + '.' : '';
}

export type GenreComposant = 'forme' | 'fonte' | 'logiciel';

/** Ce qui est redistribue dans dist/ : un paquet, sa licence, son titulaire. */
export interface Composant {
  /** Le nom du paquet npm : la cle qui relie cette liste au package-lock.json. */
  readonly paquet: string;
  readonly nom: string;
  readonly genre: GenreComposant;
  /** Ce que le composant fait ici, en une phrase (boite « A propos et credits »). */
  readonly usage: string;
  /** L'identifiant SPDX de la licence, tel que le package-lock.json le porte (au moins sa part redistribuee). */
  readonly spdx: string;
  /** La licence en toutes lettres, pour l'ecran. */
  readonly licence: string;
  /** Le titulaire, tel qu'il figure dans la licence du paquet (un test le verifie). */
  readonly titulaire: string;
  readonly url: string;
  /**
   * Le paquet embarque qui contient ce composant dans son propre fichier livre (un build UMD qui l'a recopie) : il
   * n'est alors pas un paquet embarque a part, mais sa licence voyage quand meme. Un test verifie la presence dans le fichier.
   */
  readonly dans?: string;
  /** Faux quand aucun paquet installe ne le porte (il n'est que recopie dans `dans`) : pas de ligne dans package-lock.json. */
  readonly installe?: false;
}

const OFL = { spdx: 'OFL-1.1', licence: 'SIL Open Font License 1.1' } as const;
const MIT = { spdx: 'MIT', licence: 'licence MIT' } as const;

export const COMPOSANTS: readonly Composant[] = [
  { paquet: '@iconify-json/game-icons', nom: 'Game Icons', genre: 'forme', usage: 'Les formes de la bibliothèque', spdx: 'CC-BY-3.0', licence: 'Creative Commons Attribution 3.0 (CC BY 3.0)', titulaire: 'game-icons.net et ses contributeurs', url: 'https://game-icons.net' },

  { paquet: '@expo-google-fonts/inter', nom: 'Inter', genre: 'fonte', usage: 'Police du texte en formes', ...OFL, titulaire: 'The Inter Project Authors', url: 'https://github.com/rsms/inter' },
  { paquet: '@expo-google-fonts/oswald', nom: 'Oswald', genre: 'fonte', usage: 'Police du texte en formes', ...OFL, titulaire: 'The Oswald Project Authors', url: 'https://github.com/googlefonts/OswaldFont' },
  { paquet: '@expo-google-fonts/bebas-neue', nom: 'Bebas Neue', genre: 'fonte', usage: 'Police du texte en formes', ...OFL, titulaire: 'Dharma Type', url: 'https://fonts.google.com/specimen/Bebas+Neue' },
  { paquet: '@expo-google-fonts/playfair-display', nom: 'Playfair Display', genre: 'fonte', usage: 'Police du texte en formes', ...OFL, titulaire: 'The Playfair Display Project Authors', url: 'https://github.com/clauseggers/Playfair-Display' },
  { paquet: '@expo-google-fonts/lobster', nom: 'Lobster', genre: 'fonte', usage: 'Police du texte en formes', ...OFL, titulaire: 'The Lobster Project Authors', url: 'https://github.com/impallari/The-Lobster-Font' },
  { paquet: '@expo-google-fonts/pacifico', nom: 'Pacifico', genre: 'fonte', usage: 'Police du texte en formes', ...OFL, titulaire: 'The Pacifico Project Authors', url: 'https://github.com/googlefonts/Pacifico' },
  { paquet: '@expo-google-fonts/caveat', nom: 'Caveat', genre: 'fonte', usage: 'Police du texte en formes', ...OFL, titulaire: 'The Caveat Project Authors', url: 'https://github.com/googlefonts/caveat' },
  { paquet: '@expo-google-fonts/fredoka', nom: 'Fredoka', genre: 'fonte', usage: 'Police du texte en formes', ...OFL, titulaire: 'The Fredoka Project Authors', url: 'https://github.com/hafontia/Fredoka-One' },
  // Les fontes de l'interface de la page autonome, incorporees en data: URI (scripts/fontes-interface.mjs) : la page ne les demande a personne.
  { paquet: '@fontsource/instrument-sans', nom: 'Instrument Sans', genre: 'fonte', usage: 'Police de l’interface de la page autonome (l’éditeur embarqué ne l’emporte pas)', ...OFL, titulaire: 'The Instrument Sans Project Authors', url: 'https://github.com/Instrument/instrument-sans' },
  { paquet: '@fontsource/ibm-plex-mono', nom: 'IBM Plex Mono', genre: 'fonte', usage: 'Police à chasse fixe de la page autonome (l’éditeur embarqué ne l’emporte pas)', ...OFL, titulaire: 'IBM Corp.', url: 'https://github.com/IBM/plex' },

  { paquet: 'react', nom: 'React', genre: 'logiciel', usage: 'L’interface', ...MIT, titulaire: 'Meta Platforms, Inc. and affiliates', url: 'https://react.dev' },
  { paquet: 'react-dom', nom: 'React DOM', genre: 'logiciel', usage: 'L’interface dans la page', ...MIT, titulaire: 'Meta Platforms, Inc. and affiliates', url: 'https://react.dev' },
  { paquet: 'scheduler', nom: 'Scheduler', genre: 'logiciel', usage: 'L’ordonnanceur de React', ...MIT, titulaire: 'Meta Platforms, Inc. and affiliates', url: 'https://react.dev' },
  { paquet: 'opentype.js', nom: 'opentype.js', genre: 'logiciel', usage: 'La lecture des polices du texte', ...MIT, titulaire: 'Frederik De Bleser', url: 'https://opentype.js.org' },
  { paquet: 'polygon-clipping', nom: 'polygon-clipping', genre: 'logiciel', usage: 'Les opérations booléennes entre formes', ...MIT, titulaire: 'Mike Fogel', url: 'https://github.com/mfogel/polygon-clipping' },
  // Recopies dans le fichier livre de polygon-clipping (dist/polygon-clipping.umd.js) puis d'opentype.js (dist/opentype.js).
  { paquet: 'splaytree', nom: 'splaytree', genre: 'logiciel', usage: 'Un arbre de recherche, intégré à polygon-clipping', ...MIT, titulaire: 'Alexander Milevski', url: 'https://github.com/w8r/splay-tree', dans: 'polygon-clipping' },
  { paquet: 'robust-predicates', nom: 'robust-predicates', genre: 'logiciel', usage: 'Des prédicats géométriques exacts, intégrés à polygon-clipping', spdx: 'Unlicense', licence: 'Unlicense (domaine public)', titulaire: 'Vladimir Agafonkin', url: 'https://github.com/mourner/robust-predicates', dans: 'polygon-clipping' },
  { paquet: 'tslib', nom: 'tslib', genre: 'logiciel', usage: 'Des fonctions d’aide du compilateur, intégrées à polygon-clipping', spdx: 'Apache-2.0', licence: 'Apache License 2.0', titulaire: 'Microsoft Corporation', url: 'http://www.apache.org/licenses/LICENSE-2.0', dans: 'polygon-clipping', installe: false },
  { paquet: 'tiny-inflate', nom: 'tiny-inflate', genre: 'logiciel', usage: 'La décompression des polices WOFF, intégrée à opentype.js', ...MIT, titulaire: 'Devon Govett', url: 'https://github.com/devongovett/tiny-inflate', dans: 'opentype.js', installe: false },
  { paquet: '@visioncortex/vtracer', nom: 'vtracer', genre: 'logiciel', usage: 'La conversion d’une image en SVG (WebAssembly)', spdx: 'MIT OR Apache-2.0', licence: 'licence MIT ou Apache 2.0, au choix', titulaire: 'Vision Cortex', url: 'https://github.com/visioncortex/vtracer' }
];

/** Les composants d'un genre, dans l'ordre de la liste. */
export const composantsDe = (genre: GenreComposant): readonly Composant[] => COMPOSANTS.filter(c => c.genre === genre);
