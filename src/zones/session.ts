// Ce que la page garde dans ce navigateur (ADR-0004) : le dessin en cours, pour survivre a un
// rechargement, et les versions nommees. Chaque lecture et chaque ecriture est protegee : un
// stockage absent ou plein ne casse rien, la page marche sans lui.

export interface Brouillon { nom: string; svg: string; quand: number }
export interface Version { id: string; nom: string; svg: string; quand: number }

const CLE_BROUILLON = 'svg.brouillon', CLE_VERSIONS = 'svg.versions';
const VERSIONS_MAX = 30;

function lire<T>(cle: string): T | null {
  try { const t = localStorage.getItem(cle); return t ? (JSON.parse(t) as T) : null; } catch { return null; }
}
function ecrire(cle: string, valeur: unknown): boolean {
  try { localStorage.setItem(cle, JSON.stringify(valeur)); return true; } catch { return false; }
}

export const lireBrouillon = (): Brouillon | null => lire<Brouillon>(CLE_BROUILLON);
export const garderBrouillon = (nom: string, svg: string, quand: number): boolean => ecrire(CLE_BROUILLON, { nom, svg, quand });
export const oublierBrouillon = (): void => { try { localStorage.removeItem(CLE_BROUILLON); } catch { /* sans stockage, rien a oublier */ } };

export const lireVersions = (): Version[] => lire<Version[]>(CLE_VERSIONS) ?? [];
/** Garde les versions, les plus recentes d'abord, trente au plus. */
export const garderVersions = (versions: readonly Version[]): boolean => ecrire(CLE_VERSIONS, versions.slice(0, VERSIONS_MAX));

/** Un identifiant stable pour une version : son instant et un compteur, jamais un tirage. */
export const idVersion = (quand: number, rang: number): string => 'v' + quand.toString(36) + '-' + rang;

/** La date d'une version, en francais court. */
export function dateCourte(quand: number): string {
  const d = new Date(quand);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
