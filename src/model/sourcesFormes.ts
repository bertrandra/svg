// Les sources de formes de la bibliotheque, en donnees (ADR-0003, prolonge par l'ADR des bibliotheques libres) : d'ou
// vient chaque jeu, sous quelle licence, ce qu'on en garde et ce qu'on en ecarte. Pur : aucune logique ici, sinon des
// lectures du registre. Le build (scripts/bibliotheque.mjs), la provenance (credits.ts), les mentions
// (scripts/mentions.mjs) et l'interface le lisent tous ; un test le confronte aux paquets installes (licence, titulaire).
//
// Pourquoi un registre plutot qu'une source en dur : une source de plus est une ligne de plus, et ce qu'on promet d'elle
// (licence, mention exigee ou non, variantes retenues) est ecrit une fois, la ou un test peut le relire.

/** Ce qu'une forme est faite pour devenir : une surface que la lame decoupe, ou une ligne que le stylo dessine. */
import type { Procede } from './contextes.js';
export type NatureForme = 'plein' | 'ligne';

/**
 * Comment une forme en ligne est dessinee dans sa source : `trait`, un trace (fill none, stroke) que la pointe du stylo
 * suit en un passage ; `contour`, une ligne fine dessinee comme une surface etroite, dont le stylo suit les deux bords.
 */
export type TraceLigne = 'trait' | 'contour';

export interface VarianteSource {
  /** Le dernier morceau de l'identifiant qui designe la variante (`fill` pour `heart-fill`) ; vide pour l'identifiant nu. */
  readonly suffixe: string;
  readonly nature: NatureForme;
  /** Pour une variante en ligne seulement. */
  readonly trace?: TraceLigne;
  /** Le mot ajoute au nom francais quand deux variantes retenues d'une meme source porteraient le meme nom. */
  readonly qualificatif?: string;
}

/** Ce qu'on ecarte d'une source, par regle : jamais une forme choisie a la main. */
export interface ExclusionsSource {
  /** Un mot de l'identifiant qui l'ecarte (`logo` : un logo de marque). */
  readonly mots?: readonly string[];
  /** Un debut d'identifiant qui l'ecarte (`brand-`). */
  readonly prefixes?: readonly string[];
  /** Des identifiants entiers (des logos que rien d'autre ne signale). */
  readonly identifiants?: readonly string[];
  /** Des categories du fichier metadata.json du paquet (`Brand / Logo`). */
  readonly categories?: readonly string[];
}

/** L'ordre des mots d'un identifiant anglais : `anglais` (« broken-heart », la tete a la fin) ou `tete-en-premier` (« bell-off »). */
export type OrdreDesMots = 'anglais' | 'tete-en-premier';

export interface SourceFormes {
  /** L'identifiant de la source, qui est aussi le prefixe d'une origine : `mdi` pour `mdi:heart`. */
  readonly id: string;
  /** Le nom complet, tel qu'on le credite. */
  readonly nom: string;
  /** Le nom court d'une pastille et d'une infobulle. */
  readonly nomCourt: string;
  /** Le paquet npm, epingle exactement dans package.json. */
  readonly paquet: string;
  readonly url: string;
  /** Le titulaire du droit, tel que le texte de licence le nomme (un test le verifie dans la copie de la licence). */
  readonly titulaire: string;
  /** L'identifiant SPDX, tel que le paquet le declare (package.json et info.json : un test le verifie). */
  readonly spdx: 'CC-BY-3.0' | 'Apache-2.0' | 'MIT' | 'ISC';
  /** Le nom court de la licence, tel qu'on le cite : « CC BY 3.0 ». */
  readonly licence: string;
  readonly urlLicence: string;
  /**
   * Vrai quand la licence veut la mention jusque dans le fichier produit (CC BY) : l'ecriture ajoute alors un <metadata>.
   * Faux pour MIT, ISC et Apache 2.0, dont la notice accompagne le logiciel (THIRD-PARTY-NOTICES.md, MENTIONS.txt, « A propos »).
   */
  readonly mentionDansLeFichier: boolean;
  readonly ordreDesMots: OrdreDesMots;
  /** Le cote du plan carre ou les formes sont posees (un multiple entier du plan de la source, pour des coordonnees exactes). */
  readonly plan: number;
  /** Les variantes gardees ; toute autre variante connue (`suffixesEcartes`) est ecartee. */
  readonly variantes: readonly VarianteSource[];
  readonly suffixesEcartes: readonly string[];
  readonly exclusions: ExclusionsSource;
  /**
   * Les mots qui, dans cette source, ne rangent pas une forme dans un evenement : dans un jeu d'interface, « arrow » est une
   * direction et non une arme, « slash » une barre qui dit « coupe » et non un coup d'epee. Une regle par source et par
   * evenement, qui s'ajoute aux exclusions de l'evenement (bibliotheque.ts) ; jamais une forme rangee a la main.
   */
  readonly saufParEvenement?: Readonly<Record<string, readonly string[]>>;
  /** L'annexe chargee a la demande (dist/), et la globale que son script pose. */
  readonly fichier: string;
  readonly globale: string;
  /** Le poids annonce avant chargement, en Mo arrondis (mesure au build, rapporte dans l'ADR). */
  readonly poidsMo: number;
}

/**
 * Les mots qui designent une marque, un logo ou un personnage protege : une forme qui en porte un est ecartee de toute source
 * libre, quelle que soit sa licence (le droit des marques ne se cede pas par une licence de droit d'auteur). Une regle sur les
 * identifiants, relue par un test sur les jeux installes ; elle s'etend quand une mise a jour du jeu ajoute un logo.
 */
export const MOTS_DE_MARQUE: readonly string[] = [
  'airplay', 'airpods', 'airtag', 'amazon', 'ancv', 'android', 'apple', 'bluetooth', 'clippy', 'creative', 'dhis2', 'discord', 'dogecoin', 'downasaur',
  'droid', 'ethereum', 'excel', 'facebook', 'fhir', 'finn', 'firewire', 'github', 'gitlab', 'google', 'gopro', 'hallows', 'hl7v2', 'hololens', 'hubspot',
  'husd', 'imac', 'instagram', 'invaders', 'ipad', 'ipod', 'lastpass', 'lego', 'linkedin', 'linux', 'litecoin', 'logo', 'mastercard', 'michelin',
  'mickey', 'microsoft', 'monero', 'netflix', 'nfc', 'nintendo', 'olympics', 'openmrs', 'pacman', 'paypal', 'playstation', 'pokeball', 'powerpoint',
  'powershell', 'quora', 'reddit', 'sayana', 'shareplay', 'solana', 'spotify', 'stackpath', 'telegram', 'tesla', 'tether', 'twitter', 'ubuntu', 'vespa', 'visa',
  'whatsapp', 'windows', 'xbox', 'xrp', 'youtube', 'zcash'
];

/** Dans un jeu d'interface, une fleche montre une direction et une barre oblique dit qu'une chose est coupee. */
const SAUF_INTERFACE: Readonly<Record<string, readonly string[]>> = { arme: ['arrow', 'arrows', 'slash'] };

/** L'identifiant de la source par defaut, celle qui existait seule avant ce registre. */
export const SOURCE_PAR_DEFAUT = 'game-icons';

export const SOURCES_FORMES: readonly SourceFormes[] = [
  {
    id: 'game-icons', nom: 'game-icons.net et ses contributeurs', nomCourt: 'game-icons', paquet: '@iconify-json/game-icons',
    url: 'https://game-icons.net', titulaire: 'game-icons.net et ses contributeurs',
    spdx: 'CC-BY-3.0', licence: 'CC BY 3.0', urlLicence: 'https://creativecommons.org/licenses/by/3.0/', mentionDansLeFichier: true,
    ordreDesMots: 'anglais', plan: 512, variantes: [{ suffixe: '', nature: 'plein' }], suffixesEcartes: [], exclusions: {},
    fichier: 'bibliotheque.js', globale: '__bibliothequeSvg', poidsMo: 7
  },
  {
    id: 'mdi', nom: 'Material Design Icons (Pictogrammers)', nomCourt: 'Material', paquet: '@iconify-json/mdi',
    url: 'https://pictogrammers.com/library/mdi/', titulaire: 'Pictogrammers',
    spdx: 'Apache-2.0', licence: 'Apache 2.0', urlLicence: 'https://www.apache.org/licenses/LICENSE-2.0', mentionDansLeFichier: false,
    // « outline » est chez Material une surface evidee, pas un trait : plein aussi, distinguee par son nom.
    ordreDesMots: 'tete-en-premier', plan: 480,
    variantes: [{ suffixe: '', nature: 'plein' }, { suffixe: 'outline', nature: 'plein', qualificatif: 'en contour' }], suffixesEcartes: [],
    exclusions: { categories: ['Brand / Logo', 'Social Media'], mots: MOTS_DE_MARQUE, identifiants: ['article-ny-times', 'pac-man', 'z-wave'] },
    saufParEvenement: SAUF_INTERFACE,
    fichier: 'bibliotheque-mdi.js', globale: '__bibliothequeSvgMdi', poidsMo: 4
  },
  {
    id: 'ph', nom: 'Phosphor Icons', nomCourt: 'Phosphor', paquet: '@iconify-json/ph',
    url: 'https://phosphoricons.com', titulaire: 'Phosphor Icons',
    spdx: 'MIT', licence: 'MIT', urlLicence: 'https://opensource.org/licenses/MIT', mentionDansLeFichier: false,
    // La variante pleine pour la lame ; la plus fine pour le stylo (dessinee comme une surface etroite : deux bords tres proches).
    ordreDesMots: 'tete-en-premier', plan: 480,
    variantes: [{ suffixe: 'fill', nature: 'plein' }, { suffixe: 'thin', nature: 'ligne', trace: 'contour' }],
    suffixesEcartes: ['', 'light', 'bold', 'duotone'],
    exclusions: { mots: MOTS_DE_MARQUE, identifiants: ['article-medium', 'article-ny-times'] },
    saufParEvenement: SAUF_INTERFACE,
    fichier: 'bibliotheque-ph.js', globale: '__bibliothequeSvgPh', poidsMo: 2
  },
  {
    id: 'tabler', nom: 'Tabler Icons', nomCourt: 'Tabler', paquet: '@iconify-json/tabler',
    url: 'https://tabler.io/icons', titulaire: 'Paweł Kuna',
    spdx: 'MIT', licence: 'MIT', urlLicence: 'https://opensource.org/licenses/MIT', mentionDansLeFichier: false,
    ordreDesMots: 'tete-en-premier', plan: 480,
    variantes: [{ suffixe: 'filled', nature: 'plein' }, { suffixe: '', nature: 'ligne', trace: 'trait' }], suffixesEcartes: [],
    exclusions: { prefixes: ['brand-'], mots: MOTS_DE_MARQUE, identifiants: ['pac-man'] },
    saufParEvenement: SAUF_INTERFACE,
    fichier: 'bibliotheque-tabler.js', globale: '__bibliothequeSvgTabler', poidsMo: 3
  },
  {
    id: 'healthicons', nom: 'Healthicons (Resolve to Save Lives)', nomCourt: 'Healthicons', paquet: '@iconify-json/healthicons',
    url: 'https://healthicons.org', titulaire: 'Resolve to Save Lives',
    spdx: 'MIT', licence: 'MIT', urlLicence: 'https://opensource.org/licenses/MIT', mentionDansLeFichier: false,
    // Le dessin a 48 seulement : la copie a 24 est la meme forme simplifiee, la variante « negative » une forme en reserve dans un carre.
    // Des noms anglais ordinaires (« blood-bag », « medical-records ») : la tete est a la fin, comme chez game-icons.
    ordreDesMots: 'anglais', plan: 480,
    variantes: [{ suffixe: '', nature: 'plein' }, { suffixe: 'outline', nature: 'ligne', trace: 'contour' }],
    suffixesEcartes: ['24px', 'outline-24px', 'negative'],
    exclusions: { mots: MOTS_DE_MARQUE },
    // Le sang, les os et la mort d'un jeu de sante sont des soins, pas Halloween.
    saufParEvenement: { ...SAUF_INTERFACE, halloween: ['blood', 'bone', 'bones', 'dead', 'death', 'mask', 'poison', 'skeleton', 'skeletal'] },
    fichier: 'bibliotheque-healthicons.js', globale: '__bibliothequeSvgHealthicons', poidsMo: 2
  },
  {
    id: 'lucide', nom: 'Lucide', nomCourt: 'Lucide', paquet: '@iconify-json/lucide',
    url: 'https://lucide.dev', titulaire: 'Lucide Icons and Contributors',
    spdx: 'ISC', licence: 'ISC', urlLicence: 'https://opensource.org/licenses/ISC', mentionDansLeFichier: false,
    ordreDesMots: 'tete-en-premier', plan: 480,
    variantes: [{ suffixe: '', nature: 'ligne', trace: 'trait' }], suffixesEcartes: [],
    // Les logos de marque que Lucide garde encore, sous leur nom nu.
    exclusions: { mots: MOTS_DE_MARQUE, identifiants: ['chrome', 'chromium', 'codepen', 'codesandbox', 'dribbble', 'facebook', 'figma', 'framer', 'github', 'gitlab', 'instagram', 'linkedin', 'pocket', 'slack', 'trello', 'twitch', 'twitter', 'youtube'] },
    saufParEvenement: SAUF_INTERFACE,
    fichier: 'bibliotheque-lucide.js', globale: '__bibliothequeSvgLucide', poidsMo: 1
  }
];

/** La source d'identifiant donne, ou undefined. */
export const sourceFormes = (id: string): SourceFormes | undefined => SOURCES_FORMES.find(s => s.id === id);

/** Les natures qu'une source propose, dans l'ordre de ses variantes, sans doublon. */
export const naturesDe = (s: SourceFormes): NatureForme[] => [...new Set(s.variantes.map(v => v.nature))];

/** Le nom d'une nature, pour l'ecran. */
export const NOMS_NATURE: Readonly<Record<NatureForme, string>> = { plein: 'Pleines (découpe)', ligne: 'En ligne (stylo)' };

/** La nature a proposer d'abord selon le procede d'un contexte de production : le stylo dessine des lignes, il ne remplit pas. */
export const NATURE_PROPOSEE_PAR_PROCEDE: Readonly<Partial<Record<Procede, NatureForme>>> = { 'dessin-stylo': 'ligne' };
