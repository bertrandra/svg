// Ce que la page garde dans ce navigateur (ADR-0004) : le dessin en cours, pour survivre a un
// rechargement, et les versions nommees. Le stockage se passe en parametre (io/stockage.ts) : sans lui
// (null), rien ne se garde et rien ne se lit, et la page marche quand meme.

import type { Stockage } from '../io/stockage.js';

export interface Brouillon { nom: string; svg: string; quand: number }
export interface Version { id: string; nom: string; svg: string; quand: number }

export const CLE_BROUILLON = 'svg.brouillon', CLE_VERSIONS = 'svg.versions';
export const VERSIONS_MAX = 30;
/** La longueur d'un nom gardé : une valeur qu'on n'a pas écrite ne gonfle pas la page. */
const NOM_MAX = 200;

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const estNombre = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Le brouillon gardé, ou null s'il n'a pas la forme que cette page écrit : un stockage qu'on n'a pas écrit (ou abîmé) ne doit jamais faire planter l'accueil. */
export function lireBrouillon(s: Stockage | null): Brouillon | null {
  const v = s?.lire<unknown>(CLE_BROUILLON);
  if (!estObjet(v) || typeof v.nom !== 'string' || typeof v.svg !== 'string' || !estNombre(v.quand)) return null;
  return { nom: v.nom.slice(0, NOM_MAX), svg: v.svg, quand: v.quand };
}
export const garderBrouillon = (s: Stockage | null, nom: string, svg: string, quand: number): boolean => s?.ecrire(CLE_BROUILLON, { nom, svg, quand }) ?? false;
export const oublierBrouillon = (s: Stockage | null): void => { s?.retirer(CLE_BROUILLON); };

/** Les versions gardées qui ont la bonne forme (copiées champ par champ : rien d'autre n'en sort), sans doublon d'identifiant, trente au plus. */
export function lireVersions(s: Stockage | null): Version[] {
  const v = s?.lire<unknown>(CLE_VERSIONS);
  if (!Array.isArray(v)) return [];
  const vus = new Set<string>(), r: Version[] = [];
  for (const x of v as unknown[]) {
    if (!estObjet(x) || typeof x.id !== 'string' || typeof x.nom !== 'string' || typeof x.svg !== 'string' || !estNombre(x.quand) || vus.has(x.id)) continue;
    vus.add(x.id);
    r.push({ id: x.id.slice(0, NOM_MAX), nom: x.nom.slice(0, NOM_MAX), svg: x.svg, quand: x.quand });
    if (r.length >= VERSIONS_MAX) break;
  }
  return r;
}
/** Garde les versions, les plus recentes d'abord, trente au plus. */
export const garderVersions = (s: Stockage | null, versions: readonly Version[]): boolean => s?.ecrire(CLE_VERSIONS, versions.slice(0, VERSIONS_MAX)) ?? false;

/** Un identifiant stable pour une version : son instant et un compteur, jamais un tirage. */
export const idVersion = (quand: number, rang: number): string => 'v' + quand.toString(36) + '-' + rang;

/** La date d'une version, en francais court. */
export function dateCourte(quand: number): string {
  const d = new Date(quand);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
