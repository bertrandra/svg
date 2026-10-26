// Aller chercher un fichier a une adresse (ADR-0036). Le reseau vit ici, dans `io` ; ce qui l'appelle ne voit que des octets, ou
// une phrase. Rien ne part sans le geste de la personne (ADR-0025) : « Ouvrir » apres avoir tape l'adresse, un lien depose, une
// adresse collee seule dans la zone de code. Les octets recus sont ensuite lus comme un fichier d'inconnu (ADR-0014), par les memes
// fonctions et sous les memes bornes qu'un fichier depose.
//
// Deux chemins, que l'hote choisit (`definirOuvertureAdresse`) :
//   - la page autonome : le navigateur demande l'adresse lui-meme, sans cookie (`credentials: 'omit'`), sans page d'origine
//     (`referrerPolicy: 'no-referrer'`), en suivant les redirections (le navigateur les borne a 20, la norme Fetch), le flux lu
//     sous une borne de taille et un delai. Beaucoup de sites refusent la lecture entre origines (CORS) : on le dit, jamais de
//     mandataire tiers ;
//   - le site PHP : le serveur du site va chercher l'adresse (io/serveur.ts, api.php?r=adresse), avec ses protections contre la
//     falsification de requete cote serveur (docs/securite.md, § 10) ; le navigateur ne contacte que le site.
//   - ailleurs (l'embarquement chez un hote) : rien n'est pose, le champ n'existe pas.

import { LIMITES_PDF } from '../engine/pdf/limites.js';
import { t } from '../util/i18n.js';

/** La borne d'un telechargement : la plus haute qu'un fichier ouvert accepte (un PDF, 100 Mo ; un SVG est ensuite borne a 64 Mo). */
export const OCTETS_MAX = LIMITES_PDF.octets;
/** Au-dela, le telechargement s'arrete et le dit : un fichier qui met plus d'une minute a venir se telecharge mieux a la main. */
export const DELAI_MS = 60_000;

export type CodeTelechargement = 'annule' | 'reseau' | 'cors' | 'statut' | 'trop_gros' | 'delai' | 'vide' | 'refuse' | 'session' | 'indisponible';

export type Telechargement =
  | { readonly octets: Uint8Array }
  | { readonly erreur: string; readonly code: CodeTelechargement };

/**
 * Les phrases de chaque echec : dites telles quelles, au vouvoiement. Des accesseurs, lus au moment de l'echec et jamais au
 * chargement du module : le dictionnaire d'une autre langue n'est pas encore la quand le module s'evalue (ADR-0042).
 */
export const PHRASES_TELECHARGEMENT: Readonly<Record<Exclude<CodeTelechargement, 'statut' | 'refuse'>, string>> = {
  get annule() { return t('Téléchargement annulé.'); },
  get reseau() { return t('Le serveur de cette adresse ne répond pas : vérifiez l’adresse et votre connexion, puis réessayez.'); },
  get cors() { return t('Ce site ne permet pas à la page de lire le fichier. Téléchargez-le, puis ouvrez-le ou déposez-le ici.'); },
  get trop_gros() { return t('Ce fichier dépasse {mo} Mo : il est trop gros pour être ouvert ici.', { mo: OCTETS_MAX / 1048576 }); },
  get delai() { return t('Le fichier n’est pas arrivé en {secondes} secondes : le téléchargement est arrêté. Réessayez, ou téléchargez-le puis ouvrez-le.', { secondes: DELAI_MS / 1000 }); },
  get vide() { return t('Le serveur a renvoyé un fichier vide.'); },
  get session() { return t('Votre session a expiré : reconnectez-vous dans un autre onglet, puis réessayez.'); },
  get indisponible() { return t('Ouvrir depuis une adresse n’est pas disponible ici.'); }
};

export const phraseStatut = (statut: number): string => (
  statut === 404 || statut === 410 ? t('Le serveur a répondu par une erreur (statut {statut}) : aucun fichier à cette adresse.', { statut })
    : statut === 401 || statut === 403 ? t('Le serveur a répondu par une erreur (statut {statut}) : ce fichier n’est pas public.', { statut })
      : t('Le serveur a répondu par une erreur (statut {statut}) : vérifiez l’adresse, puis réessayez.', { statut }));

const echec = (code: Exclude<CodeTelechargement, 'statut' | 'refuse'>): Telechargement => ({ erreur: PHRASES_TELECHARGEMENT[code], code });

/** Ce qu'emploie le telechargement par le navigateur, remplacable en test. */
export interface OutilsAdresse {
  readonly chercher: (url: string, init: RequestInit) => Promise<Response>;
  readonly max: number;
  readonly delai: number;
}

const OUTILS: OutilsAdresse = { chercher: (url, init) => fetch(url, init), max: OCTETS_MAX, delai: DELAI_MS };

/**
 * Le corps d'une reponse, lu morceau par morceau sous la borne : une taille annoncee trop grande est refusee avant la lecture, un
 * flux qui la depasse est coupe (jamais tout en memoire avant de compter). `null` : trop gros.
 */
export async function lireFluxBorne(r: Response, max: number): Promise<Uint8Array | null> {
  const annonce = Number(r.headers.get('content-length') ?? '');
  if (Number.isFinite(annonce) && annonce > max) { await r.body?.cancel().catch(() => undefined); return null; }
  if (!r.body) {
    const o = new Uint8Array(await r.arrayBuffer());
    return o.length > max ? null : o;
  }
  const lecteur = r.body.getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    total += value.length;
    if (total > max) { await lecteur.cancel().catch(() => undefined); return null; }
    morceaux.push(value);
  }
  const sortie = new Uint8Array(total);
  let i = 0;
  for (const m of morceaux) { sortie.set(m, i); i += m.length; }
  return sortie;
}

/** Ce qui a coupe une requete : la personne (« Annuler »), ou le delai. */
type Coupure = 'annule' | 'delai' | null;

/**
 * Le navigateur va chercher l'adresse. Un refus du reseau (`TypeError`) ne dit pas pourquoi : une seconde demande, opaque
 * (`mode: 'no-cors'`, sans cookie ni referent, sans rien lire), separe un serveur joignable qui refuse la lecture entre origines
 * (CORS) d'un serveur injoignable. Elle vise la meme adresse, au titre du meme geste.
 */
export async function telechargerParNavigateur(url: string, signal: AbortSignal, outils: Partial<OutilsAdresse> = {}): Promise<Telechargement> {
  const o = { ...OUTILS, ...outils };
  const ctl = new AbortController();
  let coupure: Coupure = null;
  const couper = (c: Exclude<Coupure, null>) => { if (!coupure) { coupure = c; ctl.abort(); } };
  const relayer = () => couper('annule');
  if (signal.aborted) return echec('annule');
  signal.addEventListener('abort', relayer);
  const minuteur = setTimeout(() => couper('delai'), o.delai);
  const sans = { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: ctl.signal } satisfies RequestInit;
  try {
    let r: Response;
    try {
      r = await o.chercher(url, { ...sans, method: 'GET', mode: 'cors', redirect: 'follow' });
    } catch {
      if (coupure) return echec(coupure);
      try {
        await o.chercher(url, { ...sans, method: 'HEAD', mode: 'no-cors', redirect: 'follow' });
        return coupure ? echec(coupure) : echec('cors');
      } catch {
        return echec(coupure ?? 'reseau');
      }
    }
    if (!r.ok) { await r.body?.cancel().catch(() => undefined); return { erreur: phraseStatut(r.status), code: 'statut' }; }
    let octets: Uint8Array | null;
    try { octets = await lireFluxBorne(r, o.max); } catch { return echec(coupure ?? 'reseau'); }
    if (coupure) return echec(coupure);
    if (!octets) return echec('trop_gros');
    return octets.length ? { octets } : echec('vide');
  } finally {
    clearTimeout(minuteur);
    signal.removeEventListener('abort', relayer);
  }
}

/** Un hote qui va chercher l'adresse a la place du navigateur (le site PHP) : memes resultats, memes phrases. */
export type ChercheurHote = (url: string, signal: AbortSignal) => Promise<Telechargement>;

export interface OuvertureAdresse {
  /** Le serveur de l'hote ; absent : le navigateur va chercher l'adresse lui-meme (la page autonome). */
  readonly serveur?: ChercheurHote;
  /** Vrai quand l'hote accepte `http://` (son administrateur l'a permis) ; faux par defaut. */
  readonly http?: boolean;
  /** Ce qui est dit sous le champ : qui va chercher le fichier. */
  readonly qui: string;
}

let ouverture: OuvertureAdresse | null = null;

/** Pose (ou retire, null) l'ouverture par adresse : la page autonome et le site en posent une, l'embarquement jamais. */
export function definirOuvertureAdresse(o: OuvertureAdresse | null): void { ouverture = o; }

/** L'ouverture posee par l'hote, ou null : sans elle, aucun champ d'adresse, aucune requete. */
export const ouvertureAdresse = (): OuvertureAdresse | null => ouverture;

/** Telecharge une adresse deja validee, par le chemin que l'hote a pose ; sans hote qui l'a posee, rien ne part. */
export function telechargerAdresse(url: string, signal: AbortSignal): Promise<Telechargement> {
  if (!ouverture) return Promise.resolve(echec('indisponible'));
  return ouverture.serveur ? ouverture.serveur(url, signal) : telechargerParNavigateur(url, signal);
}
