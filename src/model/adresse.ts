// Ouvrir depuis une adresse (ADR-0036) : ce qu'on accepte d'une adresse tapee, collee ou deposee, et le nom du dessin qu'on en
// tire. Pur : aucune requete ici ; le reseau vit dans io/adresse.ts (page autonome) et io/serveur.ts (site PHP), et la decision du
// type de fichier se prend sur les octets recus (engine/natureOctets.ts), jamais sur l'adresse.

import { t } from '../util/i18n.js';
import { nomDeFichier } from '../util/texte.js';

/** Une adresse plus longue n'est pas une adresse de fichier qu'on tape : on la refuse avant toute requete. */
export const LONGUEUR_ADRESSE_MAX = 2048;

export interface AdresseValide {
  /** L'adresse a demander, normalisee, sans fragment (`#…` ne part jamais vers un serveur). */
  readonly url: string;
  /** Le nom d'hote, pour le dire (« Téléchargement depuis exemple.fr… ») sans repeter un chemin qui peut porter un secret. */
  readonly hote: string;
}

export interface OptionsAdresse {
  /**
   * Vrai quand l'hote accepte `http://` (le site PHP, si son administrateur l'a permis). Faux par defaut : la page autonome refuse
   * une adresse en clair, que le reseau pourrait reecrire en chemin et qu'une page servie en https ne lirait de toute facon pas.
   */
  readonly http?: boolean;
}

/** Des schemas qui ne sont pas un nom de serveur suivi d'un port : on les nomme dans le refus plutot que d'y coller `https://`. */
const SCHEMAS_REFUSES = new Set(['javascript', 'vbscript', 'data', 'blob', 'file', 'ftp', 'about', 'mailto', 'gopher', 'ws', 'wss', 'chrome', 'view-source']);

/** Vrai pour un texte qui n'est qu'une adresse web (un lien colle ou depose), sans rien autour. */
export const estAdresseSeule = (texte: string): boolean => /^https?:\/\/[^\s<>"]+$/i.test(texte.trim()) && texte.trim().length <= LONGUEUR_ADRESSE_MAX;

/**
 * Valide une adresse tapee : `https://` (ou `http://` quand l'hote le permet), un hote, ni identifiant ni mot de passe. Une adresse
 * sans schema (« exemple.fr/logo.svg ») recoit `https://`. Ne leve jamais : un refus est une phrase.
 */
export function validerAdresse(texte: string, options: OptionsAdresse = {}): AdresseValide | { readonly erreur: string } {
  const brut = texte.trim();
  if (!brut) return { erreur: t('Saisissez l’adresse d’un fichier, par exemple « https://exemple.fr/dessin.svg ».') };
  if (brut.length > LONGUEUR_ADRESSE_MAX) return { erreur: t('Cette adresse dépasse {max} caractères : ce n’est pas une adresse de fichier qui s’ouvre ici.', { max: LONGUEUR_ADRESSE_MAX }) };
  // Un schema autre que http(s) (« file: », « data: », « javascript: »…) est refuse en le nommant ; sans schema, https.
  const schema = /^([a-z][a-z0-9+.-]*):/i.exec(brut)?.[1]?.toLowerCase();
  const explicite = schema !== undefined && (schema === 'http' || schema === 'https' || SCHEMAS_REFUSES.has(schema) || brut.slice(schema.length + 1).startsWith('//'));
  if (explicite && schema !== 'http' && schema !== 'https') return { erreur: t('Seules les adresses web « https:// » s’ouvrent ici (« {schema}: » est refusé).', { schema }) };
  const avecSchema = explicite ? brut : 'https://' + brut;
  let u: URL;
  try { u = new URL(avecSchema); } catch { return { erreur: t('Cette adresse n’est pas valide : elle doit ressembler à « https://exemple.fr/dessin.svg ».') }; }
  if (u.protocol === 'http:' && !options.http) return { erreur: t('Cette adresse commence par « http:// » : seules les adresses « https:// » s’ouvrent ici, parce qu’un fichier envoyé en clair peut être modifié en chemin. Essayez la même adresse en « https:// ».') };
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { erreur: t('Seules les adresses web « https:// » s’ouvrent ici (« {schema} » est refusé).', { schema: u.protocol }) };
  if (!u.hostname) return { erreur: t('Cette adresse n’a pas de nom de serveur : elle doit ressembler à « https://exemple.fr/dessin.svg ».') };
  if (u.username || u.password) return { erreur: t('Cette adresse porte un identifiant ou un mot de passe : elle ne s’ouvre pas ici, pour ne pas les envoyer. Téléchargez le fichier, puis ouvrez-le.') };
  u.hash = '';
  return { url: u.href, hote: u.hostname };
}

/** Les extensions qu'on retire du nom : celles des fichiers qu'on sait ouvrir. */
const EXTENSIONS = /\.(svgz?|pdf|png|jpe?g|gif|webp|bmp)$/i;

/**
 * Le nom du dessin tire d'une adresse : son dernier segment de chemin, decode, sans extension, nettoye par `nomDeFichier` ; le nom
 * d'hote faute de segment. Les parametres (`?…`) n'entrent jamais dans le nom : ils peuvent porter un jeton.
 */
export function nomDepuisAdresse(url: string): string {
  let u: URL;
  try { u = new URL(url); } catch { return 'dessin'; }
  const segments = u.pathname.split('/').filter(s => s.length > 0);
  let dernier = segments.length ? segments[segments.length - 1] ?? '' : '';
  try { dernier = decodeURIComponent(dernier); } catch { /* un %XX casse : le segment tel quel */ }
  const base = dernier.replace(EXTENSIONS, '');
  return nomDeFichier(base || u.hostname.replace(/^www\./, ''), 'dessin');
}
