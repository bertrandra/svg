// Le registre des polices libres qu'on peut telecharger a la demande (ADR-0025) : les licences admises, les serveurs qu'on
// contacte, les sources (catalogues et fonderies) et ce qui en est exclu. Une donnee pure : le script qui construit l'index
// (scripts/catalogue-polices.mjs), la validation de l'index (model/cataloguePolices.ts), l'interface et les tests la lisent.
//
// Pourquoi une liste blanche de licences : le produit est proprietaire (ADR-0017). Une police dont la licence n'est pas dans
// cette liste n'entre pas dans l'index, meme si elle est « libre » ailleurs (MIT, Unlicense : refusees ici faute d'avoir ete
// relues pour un usage typographique). L'ITF Free Font License de Fontshare n'est pas l'OFL : elle permet l'usage commercial
// mais interdit de redistribuer le fichier ; on ne le redistribue jamais (la personne le telecharge), et on l'affiche avec un
// badge pour qu'on ne la confonde pas.

/** Les licences admises, par leur identifiant (SPDX quand il existe). */
export type IdLicencePolice = 'OFL-1.1' | 'Apache-2.0' | 'UFL-1.0' | 'CC0-1.0' | 'ITF-FFL';

export interface LicencePolice {
  readonly id: IdLicencePolice;
  /** Le nom en toutes lettres, tel qu'on le cite (boite « A propos et credits »). */
  readonly nom: string;
  readonly url: string;
  /** Un badge court quand la licence n'est pas une licence libre usuelle : « ITF ». */
  readonly badge?: string;
  /** Ce qui reste a confirmer, quand on n'a pas pu le lire soi-meme. */
  readonly aVerifier?: string;
}

export const LICENCES_POLICES: Readonly<Record<IdLicencePolice, LicencePolice>> = {
  'OFL-1.1': { id: 'OFL-1.1', nom: 'SIL Open Font License 1.1', url: 'https://openfontlicense.org' },
  'Apache-2.0': { id: 'Apache-2.0', nom: 'Apache License 2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0' },
  'UFL-1.0': { id: 'UFL-1.0', nom: 'Ubuntu Font Licence 1.0', url: 'https://ubuntu.com/legal/font-licence' },
  'CC0-1.0': { id: 'CC0-1.0', nom: 'Creative Commons Zero 1.0 (domaine public)', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  'ITF-FFL': {
    id: 'ITF-FFL', nom: 'ITF Free Font License', url: 'https://www.fontshare.com/licenses/itf-ffl', badge: 'ITF',
    aVerifier: 'le site de Fontshare est une application qui rend la meme page pour toute adresse : l’adresse de la licence n’a pas pu être lue'
  }
};

/** Vrai pour une licence de la liste blanche ; toute autre est refusee par la validation de l'index. */
export const estLicenceAdmise = (l: unknown): l is IdLicencePolice => typeof l === 'string' && Object.prototype.hasOwnProperty.call(LICENCES_POLICES, l);

/** Les serveurs que la page peut contacter, et seulement apres le consentement de la personne. */
export type IdServeur = 'jsdelivr' | 'bunny' | 'gitlab' | 'fontshare';

export interface ServeurPolices {
  readonly id: IdServeur;
  readonly nom: string;
  /** L'hote contacte, tel que le dialogue de consentement le nomme. */
  readonly hote: string;
  readonly url: string;
  /** Le debut de toute adresse de fichier servie par ce serveur : une adresse calculee qui n'en part pas est refusee. */
  readonly prefixe: string;
  /** Vrai pour un miroir, contacte seulement quand le serveur principal a echoue. */
  readonly repli?: boolean;
}

export const SERVEURS_POLICES: Readonly<Record<IdServeur, ServeurPolices>> = {
  jsdelivr: { id: 'jsdelivr', nom: 'jsDelivr', hote: 'cdn.jsdelivr.net', url: 'https://www.jsdelivr.com', prefixe: 'https://cdn.jsdelivr.net/npm/@fontsource/' },
  bunny: { id: 'bunny', nom: 'Bunny Fonts', hote: 'fonts.bunny.net', url: 'https://fonts.bunny.net', prefixe: 'https://fonts.bunny.net/', repli: true },
  gitlab: { id: 'gitlab', nom: 'GitLab', hote: 'gitlab.com', url: 'https://gitlab.com', prefixe: 'https://gitlab.com/api/v4/projects/' },
  fontshare: { id: 'fontshare', nom: 'Fontshare', hote: 'cdn.fontshare.com', url: 'https://www.fontshare.com', prefixe: 'https://cdn.fontshare.com/wf/' }
};

/** La maniere dont les fichiers d'une famille sont ranges, et donc comment leur adresse se calcule. */
export type IdDepot = 'fontsource' | 'velvetyne' | 'fontshare';

/** Les sources du registre : les catalogues (qui servent les fichiers) et les fonderies (a qui l'on doit la police). */
export type IdSourcePolices = 'google' | 'fontsource' | 'league' | 'sil' | 'collletttivo' | 'velvetyne' | 'fontshare';

export interface SourcePolices {
  readonly id: IdSourcePolices;
  readonly nom: string;
  readonly url: string;
  /** Le depot dont viennent ses fichiers ; ses serveurs, dans l'ordre ou on les essaie. */
  readonly depot: IdDepot;
  readonly serveurs: readonly IdServeur[];
  /** Ce qui fixe la version d'un fichier, pour que le meme dessin se recompose demain a l'identique. */
  readonly epinglage: string;
  /** Les licences que ses familles portent dans l'index : toutes dans la liste blanche (un test le verifie). */
  readonly licences: readonly IdLicencePolice[];
  /**
   * Pour une fonderie servie par Fontsource : les identifiants Fontsource de ses familles. Une famille de la liste qui manque
   * a Fontsource n'entre pas dans l'index (le script le dit).
   */
  readonly familles?: readonly string[];
  /** Ce qui manque de cette source dans l'index, et pourquoi. */
  readonly limites?: string;
  /** Ce qui n'a pas pu etre verifie (adresse immuable, licence) : la source reste dans le registre, marquee. */
  readonly aVerifier?: string;
}

const NPM = 'la version du paquet npm @fontsource/<famille>, écrite dans l’adresse jsDelivr (une adresse versionnée ne change jamais)';

/**
 * Les familles de la League of Moveable Type que Fontsource sert (paquets de Google Fonts ou de Fontsource) : on les
 * telecharge de la, a une adresse versionnee, plutot que de leurs depots GitHub, dont la plupart n'ont pas d'etiquette.
 */
const LEAGUE = ['league-gothic', 'league-spartan', 'league-script', 'league-mono', 'orbitron', 'linden-hill', 'sorts-mill-goudy', 'prociono', 'fanwood-text', 'goudy-bookletter-1911', 'knewave', 'sniglet', 'blackout-midnight', 'blackout-sunrise', 'blackout-two-am', 'chunk-five', 'junction', 'ostrich-sans'];
/** Les familles de SIL International que Fontsource sert (Google Fonts les publie depuis les versions de SIL). */
const SIL = ['andika', 'charis-sil', 'gentium-plus', 'gentium-book-plus', 'gentium-book-basic', 'scheherazade-new', 'lateef', 'harmattan', 'abyssinica-sil', 'padauk', 'annapurna-sil', 'alkalami', 'ruwudu', 'kanchenjunga'];
/** Les familles de Collletttivo que Fontsource sert. */
const COLLLETTTIVO = ['apfel-grotezk'];

export const SOURCES_POLICES: readonly SourcePolices[] = [
  {
    id: 'google', nom: 'Google Fonts', url: 'https://fonts.google.com', depot: 'fontsource', serveurs: ['jsdelivr', 'bunny'], epinglage: NPM,
    licences: ['OFL-1.1', 'Apache-2.0', 'UFL-1.0']
  },
  {
    id: 'fontsource', nom: 'Fontsource', url: 'https://fontsource.org', depot: 'fontsource', serveurs: ['jsdelivr', 'bunny'], epinglage: NPM,
    licences: ['OFL-1.1', 'Apache-2.0', 'CC0-1.0']
  },
  {
    id: 'league', nom: 'The League of Moveable Type', url: 'https://www.theleagueofmoveabletype.com', depot: 'fontsource', serveurs: ['jsdelivr', 'bunny'], epinglage: NPM,
    licences: ['OFL-1.1'], familles: LEAGUE,
    limites: 'seules les familles que Fontsource sert ; les dépôts GitHub de la League n’ont le plus souvent pas d’étiquette de version'
  },
  {
    id: 'sil', nom: 'SIL International', url: 'https://software.sil.org/fonts/', depot: 'fontsource', serveurs: ['jsdelivr', 'bunny'], epinglage: NPM,
    licences: ['OFL-1.1'], familles: SIL,
    limites: 'Doulos SIL et les fontes absentes de Fontsource n’y sont pas : leurs archives versionnées (software.sil.org) sont servies sans en-tête CORS, un navigateur ne peut pas les lire'
  },
  {
    id: 'collletttivo', nom: 'Collletttivo', url: 'https://www.collletttivo.it', depot: 'fontsource', serveurs: ['jsdelivr', 'bunny'], epinglage: NPM,
    licences: ['OFL-1.1'], familles: COLLLETTTIVO,
    aVerifier: 'les autres fontes (Ronzino, Coconat, Aujournuit, Mazius Display…) sont dans des dépôts GitHub sans étiquette de version, et GitHub n’est pas joignable depuis l’atelier qui construit l’index : aucune adresse immuable n’a pu être vérifiée, elles n’entrent pas dans l’index'
  },
  {
    id: 'velvetyne', nom: 'Velvetyne', url: 'https://velvetyne.fr', depot: 'velvetyne', serveurs: ['gitlab'],
    epinglage: 'le commit du dépôt GitLab de la fonte, écrit dans l’adresse de l’API (un commit ne change jamais)', licences: ['OFL-1.1'],
    limites: 'seuls les dépôts du groupe GitLab velvetyne qui livrent un fichier WOFF, TTF ou OTF et portent le texte de l’OFL'
  },
  {
    id: 'fontshare', nom: 'Fontshare (Indian Type Foundry)', url: 'https://www.fontshare.com', depot: 'fontshare', serveurs: ['fontshare'],
    epinglage: 'la version annoncée par l’API de Fontshare et l’empreinte de chaque fichier', licences: ['ITF-FFL', 'OFL-1.1'],
    aVerifier: 'les adresses de cdn.fontshare.com sont opaques et non versionnées (cache de 7 jours) : un fichier changé serait refusé par son empreinte, et le texte garderait ses contours'
  }
];

/**
 * L'ordre de preference quand une meme famille (meme nom, casse et accents ignores) existe dans plusieurs sources : la fonte
 * livree d'abord (rien a telecharger), puis Google Fonts (versions recentes, latin et latin etendu, adresses versionnees), les
 * autres catalogues servis par Fontsource, Velvetyne, et Fontshare en dernier (adresses non versionnees, ITF FFL). « Toutes les
 * polices » ne montre qu'une ligne par nom de famille, celle de la source la mieux placee (ADR-0026) ; les autres restent dans
 * l'index (un dessin qui les emploie se recompose a l'identique) et se montrent quand on filtre leur source.
 */
export const PREFERENCE_SOURCES: ReadonlyArray<IdSourcePolices | 'livree'> = ['livree', 'google', 'fontsource', 'league', 'sil', 'collletttivo', 'velvetyne', 'fontshare'];

/** Le rang d'une source dans la preference ; une source inconnue passe apres toutes. */
export function rangSource(source: string): number {
  const i = (PREFERENCE_SOURCES as readonly string[]).indexOf(source);
  return i < 0 ? PREFERENCE_SOURCES.length : i;
}

/** Les sources ecartees, et pourquoi : l'ADR-0025 les cite, l'interface ne les propose pas. */
export const SOURCES_EXCLUES: ReadonlyArray<{ readonly nom: string; readonly raison: string }> = [
  { nom: 'Font Squirrel', raison: 'des licences au cas par cas, parfois sans redistribution ni usage commercial, et ni adresse versionnée ni API' },
  { nom: 'uncut.xyz', raison: 'un répertoire aux licences mêlées, sans adresse versionnée ni empreinte publiée' }
];

/** Les categories Fontsource exclues de l'index : des glyphes d'icones, pas des lettres. */
export const CATEGORIES_EXCLUES: readonly string[] = ['icons'];

export const sourcePolices = (id: string): SourcePolices | undefined => SOURCES_POLICES.find(s => s.id === id);

/** La fonderie d'une famille Fontsource : la League, SIL ou Collletttivo quand elle est dans leur liste, sinon son catalogue. */
export function fonderieFontsource(id: string, type: 'google' | 'other'): IdSourcePolices {
  for (const s of SOURCES_POLICES) if (s.familles?.includes(id)) return s.id;
  return type === 'google' ? 'google' : 'fontsource';
}

/** Les hotes qu'une source peut faire contacter, dans l'ordre. */
export const hotesDe = (s: SourcePolices): string[] => s.serveurs.map(id => SERVEURS_POLICES[id].hote);
