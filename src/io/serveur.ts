// Le serveur du site PHP (ADR-0030) : les projets, les donnees en JSON et les polices, tous demandes a `api.php`, sur la meme origine
// et avec la session de la personne. Le reseau vit ici, dans `io` ; l'editeur n'en sait rien (il recoit un dessin, rend un dessin),
// et le site (src/site) ne voit que des resultats : jamais une exception, toujours une phrase en francais quand ca ne va pas.
//
// Chaque ecriture porte le jeton CSRF de la session (en-tete `X-CSRF`) ; un enregistrement par-dessus un projet existant porte la
// revision qu'on a ouverte (`If-Match`) : si un autre onglet l'a enregistre entre-temps, le serveur refuse (409) plutot que d'ecraser.

import { BORNES_PROJET, lireProjet, type Projet } from '../model/projet.js';
import type { PoliceEmbarquee } from './polices.js';
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
}

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
  readonly ouvrir: (id: string) => Promise<Reponse<ProjetOuvert>>;
  /** Enregistre : un nouveau projet sans `id`, sinon par-dessus la revision `revision` (refuse si le serveur en a une autre). */
  readonly enregistrer: (projet: Projet, cible: { readonly id: string; readonly revision: number } | null, vignette: string | null) => Promise<Reponse<MetaProjet>>;
  readonly renommer: (id: string, nom: string) => Promise<Reponse<MetaProjet>>;
  readonly dupliquer: (id: string) => Promise<Reponse<MetaProjet>>;
  readonly supprimer: (id: string) => Promise<Reponse<null>>;
  /** Une annexe de donnees en JSON (`bibliotheque`, `polices-catalogue`…), undefined si elle manque ; `polices` amene aussi les fichiers. */
  readonly donnees: (nom: string) => Promise<unknown>;
  /** L'adresse d'une police du catalogue chez le serveur, par l'empreinte sha256 de son fichier. */
  readonly adressePolice: (empreinte: string) => string;
  /** L'adresse de la vignette d'un projet (une image SVG), a sa revision pour que le cache suive. */
  readonly adresseVignette: (m: MetaProjet) => string;
  /**
   * Un fichier a une adresse, que le serveur va chercher a la place du navigateur (ADR-0036) : ses octets bruts, ou la phrase du
   * refus (adresse privee, schema ou port interdit, trop gros, delai…). Une ecriture : POST, jeton CSRF.
   */
  readonly telechargerAdresse: (url: string, signal: AbortSignal) => Promise<Telechargement>;
}

const MESSAGES: Readonly<Record<string, string>> = {
  session: 'Votre session a expiré : reconnectez-vous dans un autre onglet, puis enregistrez de nouveau ici (le travail ouvert reste dans cet onglet).',
  reseau: 'Le serveur ne répond pas : vérifiez la connexion, puis réessayez.',
  conflit: 'Ce projet a été enregistré ailleurs (un autre onglet ?) depuis que vous l’avez ouvert : « Enregistrer sous… » le garde sous un autre nom, sans rien écraser.',
  introuvable: 'Ce projet n’existe plus sur le serveur.',
  trop_gros: 'Ce projet dépasse la taille que le serveur accepte.',
  invalide: 'Le serveur a refusé ce projet : il ne le reconnaît pas comme un projet de l’éditeur.',
  csrf: 'La page est trop ancienne pour écrire sur le serveur : rechargez-la, puis réessayez.',
  serveur: 'Le serveur a rencontré une erreur. Réessayez ; si elle persiste, l’administrateur la trouvera dans son journal.'
};

const echec = <T>(code: string, message?: string, meta?: MetaProjet): Reponse<T> => ({ ok: false, code, message: message || MESSAGES[code] || MESSAGES['serveur'] || '', ...(meta ? { meta } : {}) });

const estObjet = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Une meta lue du serveur, ou null : on ne croit que des champs de la bonne forme (un identifiant sur, un nom borne). */
export function lireMeta(x: unknown): MetaProjet | null {
  if (!estObjet(x)) return null;
  const { id, nom, creeLe, modifieLe, revision, taille, vignette } = x;
  if (typeof id !== 'string' || !/^[a-f0-9]{16}$/.test(id) || typeof nom !== 'string' || nom.length > BORNES_PROJET.nom * 2) return null;
  if (typeof creeLe !== 'string' || typeof modifieLe !== 'string' || creeLe.length > 40 || modifieLe.length > 40) return null;
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1 || typeof taille !== 'number' || !(taille >= 0)) return null;
  return { id, nom, creeLe, modifieLe, revision, taille, vignette: vignette === true };
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
        const message = estObjet(corps) && typeof corps['message'] === 'string' ? corps['message'].slice(0, 400) : MESSAGES['serveur'] ?? '';
        return { erreur: message, code: CODES_ADRESSE[code] ?? 'refuse' };
      }
      return { erreur: MESSAGES['csrf'] ?? '', code: 'refuse' };
    } finally {
      clearTimeout(minuteur);
      signal.removeEventListener('abort', relayer);
    }
  }

  return {
    telechargerAdresse,
    lister: async () => {
      const r = await demander({ r: 'projets' });
      if (!r.ok) return r;
      const liste = estObjet(r.valeur.corps) && Array.isArray(r.valeur.corps['projets']) ? r.valeur.corps['projets'] as unknown[] : null;
      if (!liste) return echec('serveur');
      return { ok: true, valeur: liste.map(lireMeta).filter((m): m is MetaProjet => m !== null) };
    },
    ouvrir: async id => {
      const r = await demander({ r: 'projet', id }, lecture, BORNES_PROJET.octets);
      if (!r.ok) return r;
      const revision = Number(/^"?(\d+)"?$/.exec(r.valeur.reponse.headers.get('etag') ?? '')?.[1] ?? NaN);
      const lu = lireProjet(r.valeur.corps);
      if ('erreur' in lu) return echec('invalide', lu.erreur);
      return Number.isInteger(revision) && revision > 0 ? { ok: true, valeur: { projet: lu.projet, revision, migre: lu.migre } } : echec('serveur');
    },
    enregistrer: (projet, cible, vignette) => meta(
      cible ? { r: 'enregistrer', id: cible.id } : { r: 'enregistrer' },
      ecriture({ projet, ...(vignette ? { vignette } : {}) }, cible ? { 'If-Match': '"' + cible.revision + '"' } : {})
    ),
    renommer: (id, nom) => meta({ r: 'renommer', id }, ecriture({ nom })),
    dupliquer: id => meta({ r: 'dupliquer', id }, ecriture({})),
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
    adresseVignette: m => url({ r: 'vignette', id: m.id, v: String(m.revision) })
  };
}
