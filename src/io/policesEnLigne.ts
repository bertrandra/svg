// Telecharger une police du catalogue (ADR-0025) : seulement apres le consentement de la personne, seulement aupres des
// serveurs qu'elle a acceptes, et chaque fichier verifie par son empreinte sha256 avant d'etre lu. Le reseau et
// crypto.subtle vivent ici, dans `io` ; le coeur pur ne voit qu'une interface `Glyphes`.
//
// Ce qui part : une requete GET du fichier demande, sans cookie (`credentials: 'omit'`) ni page d'origine
// (`referrerPolicy: 'no-referrer'`). Rien du dessin, rien de la personne. Le serveur voit l'adresse IP, comme pour toute page.
//
// Le cache (Cache Storage) n'est qu'un confort : absent, refuse ou plein, la police se telecharge de nouveau ; un fichier lu du
// cache est verifie par son empreinte comme un fichier telecharge.

import type { Glyphes } from '../engine/texte.js';
import { estIdCatalogue, trouverVariante, type CataloguePolices, type VariantePolice } from '../model/cataloguePolices.js';
import { SERVEURS_POLICES, type IdServeur } from '../model/sourcesPolices.js';
import { glyphesDe, retenirDeposee, type Police } from './polices.js';
import type { Stockage } from './stockage.js';
import { enSfnt } from './woff.js';
import { parse } from 'opentype.js';

/** La cle du consentement dans le stockage injecte : la liste des serveurs acceptes. */
export const CLE_CONSENTEMENT = 'svg.polices.consentement';
/** Un fichier de fonte de texte pese quelques dizaines de Ko ; au-dela de cette borne, on ne le lit pas. */
export const OCTETS_MAX = 8 * 1024 * 1024;
const NOM_CACHE = 'svg-polices-v1';
const IDS_SERVEURS = Object.keys(SERVEURS_POLICES) as IdServeur[];

/** Les serveurs acceptes, lus dans le stockage ; rien (ou une valeur etrangere) se lit comme aucun consentement. */
export function lireConsentement(s: Stockage | null): ReadonlySet<IdServeur> {
  const v = s?.lire<unknown>(CLE_CONSENTEMENT);
  const liste = typeof v === 'object' && v !== null && Array.isArray((v as { serveurs?: unknown }).serveurs) ? (v as { serveurs: unknown[] }).serveurs : [];
  return new Set(liste.filter((x): x is IdServeur => typeof x === 'string' && (IDS_SERVEURS as string[]).includes(x)));
}

/** Retient les serveurs acceptes (ajoutes a ceux deja acceptes) ; rend l'ensemble. Sans stockage, rien ne se retient au-dela de la session. */
export function accorderConsentement(s: Stockage | null, deja: ReadonlySet<IdServeur>, serveurs: readonly IdServeur[]): ReadonlySet<IdServeur> {
  const tous = new Set([...deja, ...serveurs]);
  s?.ecrire(CLE_CONSENTEMENT, { serveurs: IDS_SERVEURS.filter(id => tous.has(id)) });
  return tous;
}

/** Oublie le consentement : plus aucune requete tant que la personne n'a pas accepte de nouveau. */
export function retirerConsentement(s: Stockage | null): void { s?.retirer(CLE_CONSENTEMENT); }

/** Les serveurs que demande une variante et que la personne n'a pas encore acceptes (le dialogue les nomme). */
export function serveursAAccepter(v: VariantePolice, acceptes: ReadonlySet<IdServeur>): IdServeur[] {
  // Un repli (Bunny) n'est demande que si le serveur principal echoue ; il fait partie de ce qu'on accepte d'un coup.
  return [...new Set(v.fichiers.flatMap(f => f.adresses.map(a => a.serveur)))].filter(id => !acceptes.has(id));
}

/** Ce que le telechargement emploie du navigateur, remplacable en test. */
export interface OutilsTelechargement {
  readonly chercher: (url: string, init: RequestInit) => Promise<Response>;
  /** L'empreinte sha256 en base64, ou null si le navigateur ne sait pas la calculer. */
  readonly empreinte: (o: Uint8Array) => Promise<string | null>;
  readonly cache: CachePolices | null;
}

export interface CachePolices {
  lire: (url: string) => Promise<Uint8Array | null>;
  ecrire: (url: string, o: Uint8Array) => Promise<void>;
}

const base64 = (o: Uint8Array): string => { let t = ''; for (const x of o) t += String.fromCharCode(x); return btoa(t); };

/** L'empreinte sha256 par crypto.subtle (contexte securise : https, localhost, file:// selon le navigateur). */
export async function empreinteSha256(o: Uint8Array): Promise<string | null> {
  const subtil = typeof crypto === 'object' ? crypto.subtle : undefined;
  if (!subtil) return null;
  try { return base64(new Uint8Array(await subtil.digest('SHA-256', o as Uint8Array<ArrayBuffer>))); } catch { return null; }
}

/** Le cache du navigateur (Cache Storage), ou null : un confort, jamais un besoin. */
export function cacheNavigateur(): CachePolices | null {
  if (typeof caches === 'undefined') return null;
  return {
    lire: async url => { try { const r = await (await caches.open(NOM_CACHE)).match(url); return r ? new Uint8Array(await r.arrayBuffer()) : null; } catch { return null; } },
    ecrire: async (url, o) => { try { await (await caches.open(NOM_CACHE)).put(url, new Response(o as Uint8Array<ArrayBuffer>)); } catch { /* plein ou refuse : la prochaine fois se retelecharge */ } }
  };
}

const OUTILS: OutilsTelechargement = { chercher: (url, init) => fetch(url, init), empreinte: empreinteSha256, cache: null };

/** Les octets d'une reponse, bornes : un serveur qui enverrait davantage est coupe. */
async function lireBorne(r: Response): Promise<Uint8Array | null> {
  const annonce = Number(r.headers.get('content-length') ?? 0);
  if (annonce > OCTETS_MAX) return null;
  const o = new Uint8Array(await r.arrayBuffer());
  return o.length > OCTETS_MAX ? null : o;
}

/**
 * Un fichier, verifie : le cache d'abord, puis chaque adresse d'un serveur accepte, dans l'ordre. Une empreinte fausse est
 * refusee en le nommant, et l'adresse suivante essayee (un miroir peut servir une autre version que l'index).
 */
async function fichierVerifie(f: VariantePolice['fichiers'][number], acceptes: ReadonlySet<IdServeur>, o: OutilsTelechargement): Promise<Uint8Array | { erreur: string }> {
  const raisons: string[] = [];
  for (const a of f.adresses) {
    if (!acceptes.has(a.serveur)) continue;
    const hote = SERVEURS_POLICES[a.serveur].hote;
    const enCache = await o.cache?.lire(a.url).catch(() => null);
    if (enCache && (await o.empreinte(enCache)) === f.empreinte) return enCache;
    let octets: Uint8Array | null;
    try {
      const r = await o.chercher(a.url, { credentials: 'omit', referrerPolicy: 'no-referrer', mode: 'cors', cache: 'default' });
      if (!r.ok) { raisons.push(hote + ' a répondu ' + r.status); continue; }
      octets = await lireBorne(r);
    } catch {
      raisons.push(hote + ' ne répond pas');
      continue;
    }
    if (!octets) { raisons.push('le fichier de ' + hote + ' dépasse ' + OCTETS_MAX / 1048576 + ' Mo'); continue; }
    const e = await o.empreinte(octets);
    if (e === null) return { erreur: 'ce navigateur ne sait pas vérifier l’empreinte d’un fichier (crypto.subtle manque) : rien n’est lu' };
    if (e !== f.empreinte) { raisons.push('le fichier servi par ' + hote + ' n’a pas l’empreinte attendue : refusé'); continue; }
    await o.cache?.ecrire(a.url, octets).catch(() => undefined);
    return octets;
  }
  return { erreur: raisons.length ? raisons.join(' ; ') : 'aucun serveur accepté ne sert ce fichier' };
}

/**
 * Deux fontes d'une meme famille, le latin puis le latin etendu : chaque caractere vient de la premiere qui le possede ; le
 * crenage ne joue qu'entre deux caracteres d'une meme fonte ; les ligatures sont celles de la premiere. Les avances se ramenent
 * a l'em de la premiere quand les deux different.
 */
export function glyphesComposes(premier: Glyphes, second: Glyphes | null): Glyphes {
  if (!second) return premier;
  const echelle = premier.unitesParEm / second.unitesParEm;
  const de = (c: string): Glyphes => (premier.possede?.(c) !== false || second.possede?.(c) === false ? premier : second);
  return {
    unitesParEm: premier.unitesParEm,
    contour: (c, x, y, taille) => de(c).contour(c, x, y, taille),
    avance: c => (de(c) === premier ? premier.avance(c) : second.avance(c) * echelle),
    crenage: (a, b) => { const g = de(a); return g !== de(b) ? 0 : g === premier ? premier.crenage(a, b) : second.crenage(a, b) * echelle; },
    possede: c => premier.possede?.(c) !== false || second.possede?.(c) !== false,
    ...(premier.ligature ? { ligature: premier.ligature.bind(premier) } : {})
  };
}

/** Les glyphes d'un fichier de fonte (WOFF, TTF ou OTF), ou la raison de le refuser. */
async function glyphesDuFichier(o: Uint8Array): Promise<Glyphes | { erreur: string }> {
  const sfnt = await enSfnt(o);
  if ('erreur' in sfnt) return sfnt;
  try { return glyphesDe(parse(sfnt), sfnt); } catch { return { erreur: 'la fonte ne se lit pas' }; }
}

/**
 * Telecharge, verifie et lit une variante du catalogue ; la retient pour la session. Sans serveur accepte, aucune requete :
 * le consentement est verifie ici aussi, pas seulement dans l'interface.
 */
export async function telechargerVariante(v: VariantePolice, acceptes: ReadonlySet<IdServeur>, outils: Partial<OutilsTelechargement> = {}): Promise<Police | { erreur: string }> {
  const o = { ...OUTILS, ...outils };
  if (!estIdCatalogue(v.id)) return { erreur: 'identifiant de police inconnu' };
  // Chaque fichier doit avoir au moins une adresse chez un serveur accepte ; sinon, pas une seule requete.
  if (!v.fichiers.length || !v.fichiers.every(f => f.adresses.some(a => acceptes.has(a.serveur)))) return { erreur: 'le téléchargement de cette police n’est pas autorisé' };
  const glyphes: Glyphes[] = [];
  for (const f of v.fichiers) {
    const octets = await fichierVerifie(f, acceptes, o);
    if ('erreur' in octets) return { erreur: v.nom + ' : ' + octets.erreur + '.' };
    const g = await glyphesDuFichier(octets);
    if ('erreur' in g) return { erreur: v.nom + ' : ' + g.erreur + '.' };
    glyphes.push(g);
  }
  const [premier, second] = glyphes;
  if (!premier) return { erreur: v.nom + ' : aucun fichier.' };
  const p: Police = { id: v.id, nom: v.nom, glyphes: glyphesComposes(premier, second ?? null), nature: 'contour', version: v.version };
  retenirDeposee(p);
  return p;
}

/** Les variantes du catalogue employees par une liste de polices (par identifiant et version), sans doublon : pour les credits. */
export function variantesEmployees(c: CataloguePolices | null, polices: Iterable<{ readonly id: string; readonly version?: string | undefined }>): VariantePolice[] {
  if (!c) return [];
  const vues = new Map<string, VariantePolice>();
  for (const p of polices) { const v = trouverVariante(c, p.id, p.version) ?? trouverVariante(c, p.id); if (v) vues.set(v.id, v); }
  return [...vues.values()];
}
