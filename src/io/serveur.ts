// Le serveur du site PHP (ADR-0030) : les projets, les donnees en JSON et les polices, tous demandes a `api.php`, sur la meme origine
// et avec la session de la personne. Le reseau vit ici, dans `io` ; l'editeur n'en sait rien (il recoit un dessin, rend un dessin),
// et le site (src/site) ne voit que des resultats : jamais une exception, toujours une phrase en francais quand ca ne va pas.
//
// Chaque ecriture porte le jeton CSRF de la session (en-tete `X-CSRF`) ; un enregistrement par-dessus un projet existant porte la
// revision qu'on a ouverte (`If-Match`) : si un autre onglet l'a enregistre entre-temps, le serveur refuse (409) plutot que d'ecraser.

import { BORNES_PROJET, lireProjet, type Projet } from '../model/projet.js';
import type { PoliceEmbarquee } from './polices.js';
import { t } from '../util/i18n.js';
import { DELAI_MS, lireFluxBorne, OCTETS_MAX, PHRASES_TELECHARGEMENT, type CodeTelechargement, type Telechargement } from './adresse.js';

/** Ce que le serveur dit d'un projet enregistre, sans l'ouvrir : de quoi le lister. */
export interface MetaProjet {
  readonly id: string;
  readonly nom: string;
  readonly creeLe: string;
  readonly modifieLe: string;
  readonly revision: number;
  /** La taille du JSON enregistre, en octets. */
  readonly taille: number;
  /** Vrai quand le serveur garde une vignette (un SVG, servi comme image) de ce projet. */
  readonly vignette: boolean;
  /** Le nom de la personne qui a envoye cette copie (ADR-0043), absent pour un projet fait ici. */
  readonly recuDe?: string;
  /** Avec combien de personnes ce projet est partage en lecture ; absent s'il ne l'est avec personne. */
  readonly partages?: number;
}

/** Un projet d'un autre compte, partage en lecture avec la personne connectee (ADR-0043) : sa fiche et son titulaire. */
export interface ProjetRecu extends MetaProjet {
  readonly proprietaire: { readonly id: string; readonly nom: string };
}

/** Une personne avec qui un projet est partage en lecture, telle que son titulaire la voit. */
export interface Partage { readonly id: string; readonly nom: string; readonly email: string; readonly le: string }

// Les comptes du site (ADR-0041) : la personne connectee, son profil, et l'administration (comptes, reglages, courrier). Les
// formes viennent du contrat de l'API ; comme une fiche de projet, un compte lu n'est cru que s'il a exactement la bonne forme.

export type Langue = 'fr' | 'en';
export type RoleCompte = 'admin' | 'utilisateur';
/** Les etats d'un compte (ADR-0041 §2) : seul `actif` se connecte. */
export type EtatCompte = 'a-confirmer' | 'en-attente' | 'actif' | 'refuse' | 'suspendu';

/** La personne connectee, telle que la page la donne (`data-compte`) et que `r=compte` la rend. */
export interface Compte {
  readonly id: string;
  readonly nom: string;
  readonly email: string;
  readonly langue: Langue;
  readonly role: RoleCompte;
}

/** Un compte vu par un administrateur (`r=comptes`) : son etat, ses dates, le nombre de ses projets. */
export interface FicheCompte extends Compte {
  readonly etat: EtatCompte;
  readonly creeLe: string;
  readonly confirmeLe?: string;
  readonly approuveLe?: string;
  readonly derniereConnexion?: string;
  readonly projets: number;
}

/** Ce que la page dit du site (`data-site`) : son nom, sa langue, si les inscriptions sont ouvertes. */
export interface InfosSite { readonly nom: string; readonly langue: Langue; readonly inscriptions: boolean }

/** Ce que `r=compte` rend : la personne, le site, et pour un administrateur le nombre de demandes en attente. */
export interface SessionCompte { readonly compte: Compte; readonly site: InfosSite; readonly enAttente: number | null }

export type ModeCourrier = 'mail' | 'smtp' | 'fichier';
export type SecuriteSmtp = 'starttls' | 'ssl' | 'aucune';

/** Les reglages du site (ADR-0041 §7), sans le mot de passe SMTP, que l'API ne rend jamais : `smtpMotDePassePose` dit s'il existe. */
export interface Reglages {
  readonly site: { readonly nom: string; readonly langue: Langue; readonly adresse: string };
  readonly inscriptions: { readonly ouvertes: boolean };
  readonly courrier: {
    readonly expediteur: string; readonly nom: string; readonly mode: ModeCourrier;
    readonly smtp: { readonly hote: string; readonly port: number; readonly securite: SecuriteSmtp; readonly utilisateur: string };
  };
  readonly sessions: { readonly inactivite: number };
  readonly smtpMotDePassePose: boolean;
}

/** Les gestes d'un administrateur sur un compte : la route est `compte-<action>`. */
export type ActionCompte = 'approuver' | 'refuser' | 'suspendre' | 'reactiver' | 'supprimer' | 'promouvoir' | 'retrograder' | 'renvoyer' | 'email' | 'creer';

/** Un resultat du serveur : la valeur, ou un code et la phrase a dire. `code` vaut `session` quand il faut se reconnecter. */
export type Reponse<T> = { readonly ok: true; readonly valeur: T } | { readonly ok: false; readonly code: string; readonly message: string; readonly meta?: MetaProjet };

/** Un projet ouvert : le projet valide, sa revision, et s'il a fallu le migrer d'un format plus ancien. */
export interface ProjetOuvert { readonly projet: Projet; readonly revision: number; readonly migre: boolean }

export interface OptionsServeur {
  /** L'adresse de l'API, relative a la page : `api.php`. */
  readonly api: string;
  /** Le jeton CSRF de la session, donne par la page (`data-csrf`). */
  readonly csrf: string;
  /** Le `fetch` du navigateur ; un faux en test. */
  readonly chercher?: (url: string, init: RequestInit) => Promise<Response>;
}

export interface Serveur {
  readonly lister: () => Promise<Reponse<readonly MetaProjet[]>>;
  /** Ouvre un projet : de la personne connectee, ou partage par le compte `de` (ADR-0043). */
  readonly ouvrir: (id: string, de?: string) => Promise<Reponse<ProjetOuvert>>;
  /** Enregistre : un nouveau projet sans `id`, sinon par-dessus la revision `revision` (refuse si le serveur en a une autre). */
  readonly enregistrer: (projet: Projet, cible: { readonly id: string; readonly revision: number } | null, vignette: string | null) => Promise<Reponse<MetaProjet>>;
  readonly renommer: (id: string, nom: string) => Promise<Reponse<MetaProjet>>;
  /** Une copie dans ses projets : d'un des siens, ou d'un projet que le compte `de` partage avec soi. */
  readonly dupliquer: (id: string, de?: string) => Promise<Reponse<MetaProjet>>;
  readonly supprimer: (id: string) => Promise<Reponse<null>>;
  /** Une annexe de donnees en JSON (`bibliotheque`, `polices-catalogue`…), undefined si elle manque ; `polices` amene aussi les fichiers. */
  readonly donnees: (nom: string) => Promise<unknown>;
  /** L'adresse d'une police du catalogue chez le serveur, par l'empreinte sha256 de son fichier. */
  readonly adressePolice: (empreinte: string) => string;
  /** L'adresse de la vignette d'un projet (une image SVG), a sa revision pour que le cache suive ; d'un projet recu, chez son titulaire. */
  readonly adresseVignette: (m: MetaProjet | ProjetRecu) => string;

  // Le partage (ADR-0043) : on ne partage et on n'envoie que ses propres projets ; un projet recu se lit, ne s'ecrit jamais.
  /** Les projets que d'autres comptes partagent en lecture avec la personne connectee. */
  readonly recus: () => Promise<Reponse<readonly ProjetRecu[]>>;
  /** Les personnes avec qui un de ses projets est partage. */
  readonly partages: (id: string) => Promise<Reponse<readonly Partage[]>>;
  /** Partage un de ses projets en lecture avec le compte de cette adresse ; `courrier` faux si le mail n'est pas parti. */
  readonly partager: (id: string, email: string) => Promise<Reponse<{ readonly partages: readonly Partage[]; readonly courrier: boolean }>>;
  readonly retirerPartage: (id: string, compte: string) => Promise<Reponse<readonly Partage[]>>;
  /** Envoie une copie d'un de ses projets au compte de cette adresse, qui en devient le titulaire. */
  readonly envoyerCopie: (id: string, email: string) => Promise<Reponse<{ readonly nom: string; readonly courrier: boolean }>>;
  /** Ne plus voir un projet partage avec soi. */
  readonly quitterPartage: (id: string, de: string) => Promise<Reponse<null>>;
  /**
   * Un fichier a une adresse, que le serveur va chercher a la place du navigateur (ADR-0036) : ses octets bruts, ou la phrase du
   * refus (adresse privee, schema ou port interdit, trop gros, delai…). Une ecriture : POST, jeton CSRF.
   */
  readonly telechargerAdresse: (url: string, signal: AbortSignal) => Promise<Telechargement>;

  // Les comptes (ADR-0041). Toute ecriture : POST, JSON, jeton CSRF, comme les projets.
  /** La personne connectee, le site, et le nombre de demandes en attente pour un administrateur. */
  readonly compte: () => Promise<Reponse<SessionCompte>>;
  /** Change le nom ou la langue de la personne connectee ; rend le compte tel que le serveur le garde. */
  readonly profil: (p: { readonly nom?: string; readonly langue?: Langue }) => Promise<Reponse<Compte>>;
  /** Change le mot de passe : l'ancien est verifie par le serveur, qui ferme les autres sessions. */
  readonly motDePasse: (ancien: string, nouveau: string) => Promise<Reponse<null>>;
  readonly deconnexion: () => Promise<Reponse<null>>;
  /** Tous les comptes (administrateur seulement) ; une fiche mal formee est ecartee, les autres servent. */
  readonly comptes: () => Promise<Reponse<readonly FicheCompte[]>>;
  /**
   * Un geste sur un compte (administrateur) : `compte-<action>&id=…`, le corps selon le geste (`{ raison? }` pour refuser, `{ email }`
   * pour l'adresse, `{ email, nom, langue, motDePasse }` pour creer, sans id). Rend la fiche quand le serveur la donne, null sinon.
   */
  readonly actionCompte: (action: ActionCompte, id: string | null, corps?: Record<string, unknown>) => Promise<Reponse<FicheCompte | null>>;
  readonly reglages: () => Promise<Reponse<Reglages>>;
  /** Ecrit les reglages ; un mot de passe SMTP vide laisse celui du serveur. */
  readonly poserReglages: (r: Reglages, smtpMotDePasse: string) => Promise<Reponse<Reglages>>;
  /** Un mail d'essai, a l'adresse donnee ou a celle de la personne connectee. */
  readonly courrierEssai: (destinataire?: string) => Promise<Reponse<null>>;
}

// Les phrases de chaque code, lues au moment de l'echec, jamais au chargement du module (le dictionnaire d'une autre langue n'est
// pas encore la, ADR-0042). Les comptes (ADR-0041) : le serveur dit sa phrase ; celles-ci servent s'il n'en donne pas.
const MESSAGES: Readonly<Record<string, () => string>> = {
  session: () => t('Votre session a expiré : reconnectez-vous dans un autre onglet, puis enregistrez de nouveau ici (le travail ouvert reste dans cet onglet).'),
  reseau: () => t('Le serveur ne répond pas : vérifiez la connexion, puis réessayez.'),
  conflit: () => t('Ce projet a été enregistré ailleurs (un autre onglet ?) depuis que vous l’avez ouvert : « Enregistrer sous… » le garde sous un autre nom, sans rien écraser.'),
  introuvable: () => t('Ce projet n’existe plus sur le serveur.'),
  trop_gros: () => t('Ce projet dépasse la taille que le serveur accepte.'),
  invalide: () => t('Le serveur a refusé ce projet : il ne le reconnaît pas comme un projet de l’éditeur.'),
  csrf: () => t('La page est trop ancienne pour écrire sur le serveur : rechargez-la, puis réessayez.'),
  serveur: () => t('Le serveur a rencontré une erreur. Réessayez ; si elle persiste, l’administrateur la trouvera dans son journal.'),
  role: () => t('Cette action est réservée à un administrateur.'),
  existe: () => t('Un compte porte déjà cette adresse.'),
  'dernier-admin': () => t('Ce compte est le dernier administrateur actif : il ne peut être ni rétrogradé, ni suspendu, ni supprimé.'),
  'soi-meme': () => t('Vous ne pouvez pas faire cela sur votre propre compte.'),
  courrier: () => t('Le mail n’a pas pu partir : vérifiez les réglages du courrier.'),
  limite: () => t('Trop de tentatives : patientez quelques minutes, puis réessayez.'),
  etat: () => t('Cette action ne vaut pas dans l’état actuel.')
};

const echec = <T>(code: string, message?: string, meta?: MetaProjet): Reponse<T> => ({ ok: false, code, message: message || (MESSAGES[code] ?? MESSAGES['serveur'])?.() || '', ...(meta ? { meta } : {}) });

const estObjet = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Une meta lue du serveur, ou null : on ne croit que des champs de la bonne forme (un identifiant sur, un nom borne). */
export function lireMeta(x: unknown): MetaProjet | null {
  if (!estObjet(x)) return null;
  const { id, nom, creeLe, modifieLe, revision, taille, vignette } = x;
  if (typeof id !== 'string' || !/^[a-f0-9]{16}$/.test(id) || typeof nom !== 'string' || nom.length > BORNES_PROJET.nom * 2) return null;
  if (typeof creeLe !== 'string' || typeof modifieLe !== 'string' || creeLe.length > 40 || modifieLe.length > 40) return null;
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1 || typeof taille !== 'number' || !(taille >= 0)) return null;
  // Deux champs facultatifs (ADR-0043) : une valeur d'une autre forme est ignoree, la fiche sert quand meme.
  const recuDe = texte(x['recuDe'], 120), partages = x['partages'];
  return {
    id, nom, creeLe, modifieLe, revision, taille, vignette: vignette === true,
    ...(recuDe ? { recuDe } : {}), ...(typeof partages === 'number' && Number.isInteger(partages) && partages > 0 ? { partages } : {})
  };
}

const ID = /^[a-f0-9]{16}$/;

/** Un projet recu, ou null : une fiche juste et un titulaire (identifiant sur, nom borne). */
export function lireRecu(x: unknown): ProjetRecu | null {
  const m = lireMeta(x);
  if (!m || !estObjet(x) || !estObjet(x['proprietaire'])) return null;
  const id = texte(x['proprietaire']['id'], 16), nom = texte(x['proprietaire']['nom'], 120);
  if (id === null || !ID.test(id) || nom === null) return null;
  // Ni la provenance ni les partages du titulaire ne regardent le lecteur : seuls les champs de la fiche passent.
  return { id: m.id, nom: m.nom, creeLe: m.creeLe, modifieLe: m.modifieLe, revision: m.revision, taille: m.taille, vignette: m.vignette, proprietaire: { id, nom } };
}

/** Une personne d'un partage, ou null. */
export function lirePartage(x: unknown): Partage | null {
  if (!estObjet(x)) return null;
  const id = texte(x['id'], 16), nom = texte(x['nom'], 120), email = texte(x['email'], 254), le = texte(x['le'], 40);
  return id !== null && ID.test(id) && nom !== null && email !== null && le !== null ? { id, nom, email, le } : null;
}

/** Une liste lue element par element : un element mal forme est ecarte, les autres servent ; null si ce n'est pas une liste. */
const liste = <T>(x: unknown, lire: (e: unknown) => T | null): T[] | null => (Array.isArray(x) ? x.map(lire).filter((e): e is T => e !== null) : null);

const LANGUES: readonly Langue[] = ['fr', 'en'];
const ROLES: readonly RoleCompte[] = ['admin', 'utilisateur'];
const ETATS: readonly EtatCompte[] = ['a-confirmer', 'en-attente', 'actif', 'refuse', 'suspendu'];
const MODES: readonly ModeCourrier[] = ['mail', 'smtp', 'fichier'];
const SECURITES: readonly SecuriteSmtp[] = ['starttls', 'ssl', 'aucune'];
const parmi = <T extends string>(liste: readonly T[], x: unknown): x is T => typeof x === 'string' && (liste as readonly string[]).includes(x);
const texte = (x: unknown, max: number): string | null => (typeof x === 'string' && x.length <= max ? x : null);
/** Une date ISO facultative : absente ou vide, undefined ; d'une autre forme, null (la fiche est refusee). */
const dateFacultative = (x: unknown): string | null | undefined => (x === undefined || x === null || x === '' ? undefined : texte(x, 40));

/** La personne connectee lue de la page ou du serveur, ou null : on ne croit que des champs de la bonne forme (ADR-0041 §2). */
export function lireCompte(x: unknown): Compte | null {
  if (!estObjet(x)) return null;
  const id = texte(x['id'], 16), nom = texte(x['nom'], 120), email = texte(x['email'], 254);
  if (id === null || !/^[a-f0-9]{16}$/.test(id) || nom === null || email === null) return null;
  if (!parmi(LANGUES, x['langue']) || !parmi(ROLES, x['role'])) return null;
  return { id, nom, email, langue: x['langue'], role: x['role'] };
}

/** Une fiche de la liste des comptes, ou null. */
export function lireFiche(x: unknown): FicheCompte | null {
  const c = lireCompte(x);
  if (!c || !estObjet(x)) return null;
  const creeLe = texte(x['creeLe'], 40), projets = x['projets'];
  const confirmeLe = dateFacultative(x['confirmeLe']), approuveLe = dateFacultative(x['approuveLe']), derniereConnexion = dateFacultative(x['derniereConnexion']);
  if (!parmi(ETATS, x['etat']) || creeLe === null || confirmeLe === null || approuveLe === null || derniereConnexion === null) return null;
  if (typeof projets !== 'number' || !Number.isInteger(projets) || projets < 0) return null;
  return {
    ...c, etat: x['etat'], creeLe, projets,
    ...(confirmeLe !== undefined ? { confirmeLe } : {}), ...(approuveLe !== undefined ? { approuveLe } : {}), ...(derniereConnexion !== undefined ? { derniereConnexion } : {})
  };
}

/** Ce que la page dit du site, ou null. */
export function lireSite(x: unknown): InfosSite | null {
  if (!estObjet(x)) return null;
  const nom = texte(x['nom'], 120);
  if (nom === null || !parmi(LANGUES, x['langue']) || typeof x['inscriptions'] !== 'boolean') return null;
  return { nom, langue: x['langue'], inscriptions: x['inscriptions'] };
}

/**
 * Les reglages par defaut (ADR-0041 §7) : ce que vaut un fichier absent, et ce que prend un champ qui manque ou n'a pas la bonne forme.
 * Les deux noms sont des textes d'interface, lus par un accesseur au moment ou l'on en a besoin (ADR-0042).
 */
export const REGLAGES_PAR_DEFAUT: Reglages = {
  site: { get nom() { return t('Éditeur SVG'); }, langue: 'fr', adresse: '' },
  inscriptions: { ouvertes: true },
  courrier: { expediteur: '', get nom() { return t('Éditeur SVG'); }, mode: 'mail', smtp: { hote: '', port: 587, securite: 'starttls', utilisateur: '' } },
  sessions: { inactivite: 30 * 86400 },
  smtpMotDePassePose: false
};

/**
 * Les reglages lus du serveur : chaque champ pris s'il a la bonne forme, son defaut sinon, comme `config_valide` cote PHP. Null
 * seulement si la reponse n'est pas un objet : un reglage absent n'empeche pas d'ouvrir l'ecran, qui montre alors le defaut.
 */
export function lireReglages(x: unknown): Reglages | null {
  if (!estObjet(x)) return null;
  const D = REGLAGES_PAR_DEFAUT;
  const site = estObjet(x['site']) ? x['site'] : {}, inscriptions = estObjet(x['inscriptions']) ? x['inscriptions'] : {};
  const courrier = estObjet(x['courrier']) ? x['courrier'] : {}, smtp = estObjet(courrier['smtp']) ? courrier['smtp'] : {}, sessions = estObjet(x['sessions']) ? x['sessions'] : {};
  const port = smtp['port'], inactivite = sessions['inactivite'];
  return {
    site: { nom: texte(site['nom'], 120) ?? D.site.nom, langue: parmi(LANGUES, site['langue']) ? site['langue'] : D.site.langue, adresse: texte(site['adresse'], 2048) ?? D.site.adresse },
    inscriptions: { ouvertes: typeof inscriptions['ouvertes'] === 'boolean' ? inscriptions['ouvertes'] : D.inscriptions.ouvertes },
    courrier: {
      expediteur: texte(courrier['expediteur'], 254) ?? D.courrier.expediteur, nom: texte(courrier['nom'], 120) ?? D.courrier.nom,
      mode: parmi(MODES, courrier['mode']) ? courrier['mode'] : D.courrier.mode,
      smtp: {
        hote: texte(smtp['hote'], 253) ?? D.courrier.smtp.hote,
        port: typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535 ? port : D.courrier.smtp.port,
        securite: parmi(SECURITES, smtp['securite']) ? smtp['securite'] : D.courrier.smtp.securite,
        utilisateur: texte(smtp['utilisateur'], 254) ?? D.courrier.smtp.utilisateur
      }
    },
    sessions: { inactivite: typeof inactivite === 'number' && Number.isInteger(inactivite) && inactivite > 0 ? inactivite : D.sessions.inactivite },
    smtpMotDePassePose: x['smtpMotDePassePose'] === true
  };
}

/**
 * La reponse de `r=reglages` (lecture ou ecriture) : les reglages sous `reglages`, `smtpMotDePassePose` a cote (le mot de passe SMTP
 * n'en sort jamais, ADR-0041 §7). Null si la reponse n'a pas cette forme (`{ ok: true }` seul, par exemple).
 */
function reglagesRecus(corps: unknown): Reglages | null {
  if (!estObjet(corps) || !estObjet(corps['reglages'])) return null;
  const lu = lireReglages(corps['reglages']);
  return lu ? { ...lu, smtpMotDePassePose: corps['smtpMotDePassePose'] === true } : null;
}

/** Le texte d'une reponse, borne : un serveur qui enverrait davantage n'est pas lu. */
async function texteBorne(r: Response, max: number): Promise<string | null> {
  if (Number(r.headers.get('content-length') ?? 0) > max) return null;
  const t = await r.text();
  return t.length > max ? null : t;
}

function jsonOuNull(t: string): unknown {
  try { return JSON.parse(t) as unknown; } catch { return null; }
}

/** Le code et la phrase d'une reponse en erreur : ce que le serveur dit (`erreur`, `message`), sinon ce que dit son statut. */
async function erreurDe<T>(r: Response): Promise<Reponse<T>> {
  const corps = jsonOuNull((await texteBorne(r, 65536).catch(() => null)) ?? '');
  const code = estObjet(corps) && typeof corps['erreur'] === 'string' ? corps['erreur'] : r.status === 401 ? 'session' : r.status === 409 || r.status === 412 ? 'conflit' : r.status === 404 ? 'introuvable' : r.status === 413 ? 'trop_gros' : 'serveur';
  const message = estObjet(corps) && typeof corps['message'] === 'string' ? corps['message'].slice(0, 400) : undefined;
  const meta = estObjet(corps) ? lireMeta(corps['meta']) : null;
  return echec<T>(code, code === 'session' || code === 'conflit' ? undefined : message, meta ?? undefined);
}

const base64 = (o: Uint8Array): string => {
  let t = '';
  for (let i = 0; i < o.length; i += 0x8000) t += String.fromCharCode(...o.subarray(i, i + 0x8000));
  return btoa(t);
};

type Requete = Promise<Reponse<{ corps: unknown; reponse: Response }>>;
/** Ce dont les routes ont besoin : une lecture, une ecriture (qui reprend le jeton), et l'init d'une ecriture JSON. */
interface Outils {
  readonly demander: (parametres: Record<string, string>) => Requete;
  readonly ecrire: (parametres: Record<string, string>, init: () => RequestInit) => Requete;
  readonly ecriture: (corps: unknown) => () => RequestInit;
}

/** Une reponse `{ ok: true }` : rien a lire. */
const rien = (r: Awaited<Requete>): Reponse<null> => (r.ok ? { ok: true, valeur: null } : r);
/** Un champ d'une reponse objet, lu par `lire` ; une reponse sans lui ou mal formee est une erreur du serveur. */
function champ<T>(r: Awaited<Requete>, nom: string, lire: (x: unknown) => T | null): Reponse<T> {
  if (!r.ok) return r;
  const v = estObjet(r.valeur.corps) ? lire(r.valeur.corps[nom]) : null;
  return v === null ? echec('serveur') : { ok: true, valeur: v };
}

/** Les routes des comptes (ADR-0041), a part de `creerServeur` pour que chaque fonction reste lisible. */
function routesComptes({ demander, ecrire, ecriture }: Outils): Pick<Serveur, 'compte' | 'profil' | 'motDePasse' | 'deconnexion' | 'comptes' | 'actionCompte' | 'reglages' | 'poserReglages' | 'courrierEssai'> {
  return {
    compte: async () => {
      const r = await demander({ r: 'compte' });
      if (!r.ok) return r;
      const corps = estObjet(r.valeur.corps) ? r.valeur.corps : {};
      const compte = lireCompte(corps['compte']), site = lireSite(corps['site']);
      if (!compte || !site) return echec('serveur');
      const admin = estObjet(corps['admin']) ? corps['admin']['enAttente'] : undefined;
      return { ok: true, valeur: { compte, site, enAttente: typeof admin === 'number' && admin >= 0 ? Math.floor(admin) : null } };
    },
    profil: async p => champ(await ecrire({ r: 'profil' }, ecriture(p)), 'compte', lireCompte),
    motDePasse: async (ancien, nouveau) => rien(await ecrire({ r: 'mot-de-passe' }, ecriture({ ancien, nouveau }))),
    deconnexion: async () => rien(await ecrire({ r: 'deconnexion' }, ecriture({}))),
    comptes: async () => {
      const r = await demander({ r: 'comptes' });
      if (!r.ok) return r;
      const liste = estObjet(r.valeur.corps) && Array.isArray(r.valeur.corps['comptes']) ? r.valeur.corps['comptes'] as unknown[] : null;
      return liste ? { ok: true, valeur: liste.map(lireFiche).filter((c): c is FicheCompte => c !== null) } : echec('serveur');
    },
    actionCompte: async (action, id, corps = {}) => {
      const r = await ecrire(id ? { r: 'compte-' + action, id } : { r: 'compte-' + action }, ecriture(corps));
      if (!r.ok) return r;
      // `{ compte }` quand le serveur rend la fiche, `{ ok: true }` quand il n'y a plus rien a montrer (supprime).
      return { ok: true, valeur: estObjet(r.valeur.corps) ? lireFiche(r.valeur.corps['compte']) : null };
    },
    reglages: async () => {
      const r = await demander({ r: 'reglages' });
      if (!r.ok) return r;
      const lu = reglagesRecus(r.valeur.corps);
      return lu ? { ok: true, valeur: lu } : echec('serveur');
    },
    poserReglages: async (reglages, smtpMotDePasse) => {
      // Le mot de passe SMTP ne part que tape : vide, le serveur garde le sien (ADR-0041 §7). `smtpMotDePassePose` est au serveur.
      const corps = {
        reglages: {
          site: reglages.site, inscriptions: reglages.inscriptions, sessions: reglages.sessions,
          courrier: { ...reglages.courrier, smtp: { ...reglages.courrier.smtp, ...(smtpMotDePasse ? { motDePasse: smtpMotDePasse } : {}) } }
        }
      };
      const r = await ecrire({ r: 'reglages' }, ecriture(corps));
      if (!r.ok) return r;
      // Le serveur rend les reglages relus ; s'il ne rend que `{ ok: true }`, ceux qu'on a envoyes, le mot de passe pose s'il vient de l'etre.
      const lu = reglagesRecus(r.valeur.corps);
      return { ok: true, valeur: lu ?? { ...reglages, smtpMotDePassePose: reglages.smtpMotDePassePose || smtpMotDePasse !== '' } };
    },
    courrierEssai: async destinataire => rien(await ecrire({ r: 'courrier-essai' }, ecriture(destinataire ? { destinataire } : {})))
  };
}

/** Les routes du partage (ADR-0043). */
function routesPartage({ demander, ecrire, ecriture }: Outils): Pick<Serveur, 'recus' | 'partages' | 'partager' | 'retirerPartage' | 'envoyerCopie' | 'quitterPartage'> {
  const personnes = (x: unknown) => liste(x, lirePartage);
  return {
    recus: async () => champ(await demander({ r: 'recus' }), 'projets', x => liste(x, lireRecu)),
    partages: async id => champ(await demander({ r: 'partages', id }), 'partages', personnes),
    partager: async (id, email) => {
      const r = await ecrire({ r: 'partager', id }, ecriture({ email }));
      const p = champ(r, 'partages', personnes);
      return p.ok && r.ok ? { ok: true, valeur: { partages: p.valeur, courrier: estObjet(r.valeur.corps) && r.valeur.corps['courrier'] === true } } : p.ok ? echec('serveur') : p;
    },
    retirerPartage: async (id, compte) => champ(await ecrire({ r: 'retirer-partage', id }, ecriture({ compte })), 'partages', personnes),
    envoyerCopie: async (id, email) => {
      const r = await ecrire({ r: 'envoyer', id }, ecriture({ email }));
      if (!r.ok) return r;
      const corps = estObjet(r.valeur.corps) ? r.valeur.corps : {}, d = estObjet(corps['destinataire']) ? texte(corps['destinataire']['nom'], 120) : null;
      return d === null ? echec('serveur') : { ok: true, valeur: { nom: d, courrier: corps['courrier'] === true } };
    },
    quitterPartage: async (id, de) => rien(await ecrire({ r: 'quitter-partage', id, de }, ecriture({})))
  };
}

export function creerServeur(options: OptionsServeur): Serveur {
  const chercher = options.chercher ?? ((url: string, init: RequestInit) => fetch(url, init));
  // Le jeton change a chaque connexion : apres une reconnexion dans un autre onglet, celui de la page est perime. Une ecriture
  // refusee pour son jeton en redemande un a la session (une lecture de la meme origine) et reessaie une fois.
  let csrf = options.csrf;
  const url = (parametres: Record<string, string>) => options.api + '?' + new URLSearchParams(parametres).toString();
  const lecture: RequestInit = { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } };

  /** Une requete qui rend du JSON ; jamais d'exception : le reseau coupe, un JSON illisible deviennent des echecs nommes. */
  async function demander(parametres: Record<string, string>, init: RequestInit = lecture, max = 1048576): Promise<Reponse<{ corps: unknown; reponse: Response }>> {
    let r: Response;
    try { r = await chercher(url(parametres), init); } catch { return echec('reseau'); }
    if (!r.ok) return erreurDe(r);
    const t = await texteBorne(r, max).catch(() => null);
    if (t === null) return echec('trop_gros');
    const corps = jsonOuNull(t);
    return corps === null ? echec('serveur') : { ok: true, valeur: { corps, reponse: r } };
  }

  const ecriture = (corps: unknown, entetes: Record<string, string> = {}): () => RequestInit => {
    const texte = JSON.stringify(corps);
    return () => ({
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF': csrf, ...entetes },
      body: texte
    });
  };

  /** Une ecriture ; refusee pour un jeton perime, elle reprend le jeton de la session et reessaie une fois. */
  async function ecrire(parametres: Record<string, string>, init: () => RequestInit): Promise<Reponse<{ corps: unknown; reponse: Response }>> {
    const r = await demander(parametres, init());
    if (r.ok || r.code !== 'csrf') return r;
    const j = await demander({ r: 'jeton' });
    const neuf = j.ok && estObjet(j.valeur.corps) && typeof j.valeur.corps['csrf'] === 'string' ? j.valeur.corps['csrf'] : null;
    if (!neuf) return j.ok ? r : j;
    csrf = neuf;
    return demander(parametres, init());
  }

  async function meta(parametres: Record<string, string>, init: () => RequestInit): Promise<Reponse<MetaProjet>> {
    const r = await ecrire(parametres, init);
    if (!r.ok) return r;
    const m = estObjet(r.valeur.corps) ? lireMeta(r.valeur.corps['meta']) : null;
    return m ? { ok: true, valeur: m } : echec('serveur');
  }

  async function polices(): Promise<PoliceEmbarquee[] | undefined> {
    const r = await demander({ r: 'json', f: 'polices' }, { ...lecture, cache: 'default' }, 8 * 1048576);
    if (!r.ok || !Array.isArray(r.valeur.corps)) return undefined;
    const sortie: PoliceEmbarquee[] = [];
    for (const p of r.valeur.corps as unknown[]) {
      if (!estObjet(p) || typeof p['id'] !== 'string' || typeof p['nom'] !== 'string') continue;
      if (typeof p['fichier'] !== 'string') { sortie.push(p as unknown as PoliceEmbarquee); continue; }
      // Une fonte livree vit dans data/font : ses octets se demandent a part, puis rejoignent la forme de polices.js (base64).
      try {
        const f = await chercher(url({ r: 'fonte', f: p['fichier'] }), { credentials: 'same-origin', cache: 'default' });
        if (f.ok) sortie.push({ id: p['id'], nom: p['nom'], base64: base64(new Uint8Array(await f.arrayBuffer())) });
      } catch { /* une fonte absente manque a la liste, les autres servent */ }
    }
    return sortie;
  }

  /** Le code d'un refus du serveur, ramene a ceux du telechargement ; sa phrase est celle du serveur, deja en francais. */
  const CODES_ADRESSE: Readonly<Record<string, CodeTelechargement>> = { injoignable: 'reseau', delai: 'delai', trop_gros: 'trop_gros', statut: 'statut', session: 'session', indisponible: 'indisponible', vide: 'vide' };

  async function telechargerAdresse(adresse: string, signal: AbortSignal): Promise<Telechargement> {
    const ctl = new AbortController();
    let annule = false, delai = false;
    const relayer = () => { annule = true; ctl.abort(); };
    if (signal.aborted) return { erreur: PHRASES_TELECHARGEMENT.annule, code: 'annule' };
    signal.addEventListener('abort', relayer);
    // Le serveur borne son propre delai (ADRESSE_DELAI) ; celui-ci ne sert que si la reponse n'arrive jamais.
    const minuteur = setTimeout(() => { delai = true; ctl.abort(); }, DELAI_MS + 30_000);
    const coupe = (): Telechargement => (annule ? { erreur: PHRASES_TELECHARGEMENT.annule, code: 'annule' } : { erreur: PHRASES_TELECHARGEMENT[delai ? 'delai' : 'reseau'], code: delai ? 'delai' : 'reseau' });
    const init = (): RequestInit => ({
      method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/octet-stream, application/json', 'X-CSRF': csrf },
      body: JSON.stringify({ adresse })
    });
    try {
      for (let essai = 0; essai < 2; essai++) {
        let r: Response;
        try { r = await chercher(url({ r: 'adresse' }), init()); } catch { return coupe(); }
        if (r.ok) {
          let octets: Uint8Array | null;
          try { octets = await lireFluxBorne(r, OCTETS_MAX); } catch { return coupe(); }
          if (!octets) return { erreur: PHRASES_TELECHARGEMENT.trop_gros, code: 'trop_gros' };
          return octets.length ? { octets } : { erreur: PHRASES_TELECHARGEMENT.vide, code: 'vide' };
        }
        const corps = jsonOuNull((await texteBorne(r, 65536).catch(() => null)) ?? '');
        const code = estObjet(corps) && typeof corps['erreur'] === 'string' ? corps['erreur'] : r.status === 401 ? 'session' : 'serveur';
        // Un jeton perime (reconnexion dans un autre onglet) : on le reprend de la session, et on reessaie une fois.
        if (code === 'csrf' && essai === 0) {
          const j = await demander({ r: 'jeton' });
          const neuf = j.ok && estObjet(j.valeur.corps) && typeof j.valeur.corps['csrf'] === 'string' ? j.valeur.corps['csrf'] : null;
          if (neuf) { csrf = neuf; continue; }
        }
        if (code === 'session') return { erreur: PHRASES_TELECHARGEMENT.session, code: 'session' };
        const message = estObjet(corps) && typeof corps['message'] === 'string' ? corps['message'].slice(0, 400) : MESSAGES['serveur']?.() ?? '';
        return { erreur: message, code: CODES_ADRESSE[code] ?? 'refuse' };
      }
      return { erreur: MESSAGES['csrf']?.() ?? '', code: 'refuse' };
    } finally {
      clearTimeout(minuteur);
      signal.removeEventListener('abort', relayer);
    }
  }

  return {
    telechargerAdresse,
    ...routesComptes({ demander: p => demander(p), ecrire, ecriture: corps => ecriture(corps) }),
    lister: async () => {
      const r = await demander({ r: 'projets' });
      if (!r.ok) return r;
      const liste = estObjet(r.valeur.corps) && Array.isArray(r.valeur.corps['projets']) ? r.valeur.corps['projets'] as unknown[] : null;
      if (!liste) return echec('serveur');
      return { ok: true, valeur: liste.map(lireMeta).filter((m): m is MetaProjet => m !== null) };
    },
    ouvrir: async (id, de) => {
      const r = await demander(de ? { r: 'projet', id, de } : { r: 'projet', id }, lecture, BORNES_PROJET.octets);
      if (!r.ok) return r;
      // Un serveur qui compresse la reponse (nginx en gzip ou brotli) affaiblit l'ETag : `W/"3"`. La revision y est la meme.
      const revision = Number(/^(?:W\/)?"?(\d+)"?$/.exec(r.valeur.reponse.headers.get('etag') ?? '')?.[1] ?? NaN);
      const lu = lireProjet(r.valeur.corps);
      if ('erreur' in lu) return echec('invalide', lu.erreur);
      return Number.isInteger(revision) && revision > 0 ? { ok: true, valeur: { projet: lu.projet, revision, migre: lu.migre } } : echec('serveur');
    },
    enregistrer: (projet, cible, vignette) => meta(
      cible ? { r: 'enregistrer', id: cible.id } : { r: 'enregistrer' },
      ecriture({ projet, ...(vignette ? { vignette } : {}) }, cible ? { 'If-Match': '"' + cible.revision + '"' } : {})
    ),
    renommer: (id, nom) => meta({ r: 'renommer', id }, ecriture({ nom })),
    dupliquer: (id, de) => meta(de ? { r: 'dupliquer', id, de } : { r: 'dupliquer', id }, ecriture({})),
    supprimer: async id => {
      const r = await ecrire({ r: 'supprimer', id }, ecriture({}));
      return r.ok ? { ok: true, valeur: null } : r;
    },
    donnees: async nom => {
      if (nom === 'polices') return polices();
      const r = await demander({ r: 'json', f: nom }, { ...lecture, cache: 'default' }, 32 * 1048576);
      return r.ok ? r.valeur.corps : undefined;
    },
    adressePolice: empreinte => url({ r: 'police', sha: empreinte }),
    adresseVignette: m => url({ r: 'vignette', id: m.id, ...('proprietaire' in m ? { de: m.proprietaire.id } : {}), v: String(m.revision) }),
    ...routesPartage({ demander: p => demander(p), ecrire, ecriture: corps => ecriture(corps) })
  };
}
