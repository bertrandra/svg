// Ce que la page garde dans ce navigateur (ADR-0004) : le dessin en cours, pour survivre a un
// rechargement, et les versions nommees. Le stockage se passe en parametre (io/stockage.ts) : sans lui
// (null), rien ne se garde et rien ne se lit, et la page marche quand meme.

import type { Stockage } from '../io/stockage.js';

export interface Brouillon { nom: string; svg: string; quand: number }
export interface Version { id: string; nom: string; svg: string; quand: number }

export const CLE_BROUILLON = 'svg.brouillon', CLE_VERSIONS = 'svg.versions';
export const VERSIONS_MAX = 30;

export const lireBrouillon = (s: Stockage | null): Brouillon | null => s?.lire<Brouillon>(CLE_BROUILLON) ?? null;
export const garderBrouillon = (s: Stockage | null, nom: string, svg: string, quand: number): boolean => s?.ecrire(CLE_BROUILLON, { nom, svg, quand }) ?? false;
export const oublierBrouillon = (s: Stockage | null): void => { s?.retirer(CLE_BROUILLON); };

export const lireVersions = (s: Stockage | null): Version[] => s?.lire<Version[]>(CLE_VERSIONS) ?? [];
/** Garde les versions, les plus recentes d'abord, trente au plus. */
export const garderVersions = (s: Stockage | null, versions: readonly Version[]): boolean => s?.ecrire(CLE_VERSIONS, versions.slice(0, VERSIONS_MAX)) ?? false;

/** Un identifiant stable pour une version : son instant et un compteur, jamais un tirage. */
export const idVersion = (quand: number, rang: number): string => 'v' + quand.toString(36) + '-' + rang;

/** La date d'une version, en francais court. */
export function dateCourte(quand: number): string {
  const d = new Date(quand);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
