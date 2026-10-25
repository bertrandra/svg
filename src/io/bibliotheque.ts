// Charger la bibliotheque de formes, a la demande : un script (dist/bibliotheque.js, construit par
// scripts/bibliotheque.mjs) pose a cote de la page, qui pese plusieurs mega-octets et ne se charge
// que quand on l'ouvre. Une balise <script> plutot qu'un fetch : cela marche aussi depuis le disque.

import type { EntreeBibliotheque, Evenement } from '../model/bibliotheque.js';
import { SOURCES_FORMES, sourceFormes, type NatureForme, type SourceFormes } from '../model/sourcesFormes.js';
import { annexePosee, fabriquerChargeurAnnexe, navigateur, type Annexe, type Chargeur } from './annexes.js';

export interface Bibliotheque {
  source: string;
  licence: string;
  url: string;
  evenements: readonly Evenement[];
  entrees: readonly EntreeBibliotheque[];
}

export const FICHIER_BIBLIOTHEQUE = 'bibliotheque.js';

const estTexte = (v: unknown): v is string => typeof v === 'string';
const estListeDeTextes = (v: unknown): v is string[] => Array.isArray(v) && v.every(estTexte);
const FAMILLES: ReadonlySet<string> = new Set(['calendrier', 'vie', 'categorie']);

/**
 * Une bibliotheque donnee par un hote (ou posee par un script) remise a la forme attendue : les entrees et les evenements qui n'ont
 * pas les bons champs sont ecartes, rien d'autre n'est garde. Null quand ce n'est pas une bibliotheque (`entrees` n'est pas une liste).
 */
export function normaliserBibliotheque(v: unknown): Bibliotheque | null {
  if (typeof v !== 'object' || v === null) return null;
  const b = v as Record<string, unknown>;
  if (!Array.isArray(b.entrees)) return null;
  const entrees: EntreeBibliotheque[] = [];
  for (const e of b.entrees as unknown[]) {
    if (typeof e !== 'object' || e === null) continue;
    const { id, nom, svg, evenements } = e as Record<string, unknown>;
    if (estTexte(id) && estTexte(nom) && estTexte(svg) && estListeDeTextes(evenements)) entrees.push({ id, nom, svg, evenements: [...evenements] });
  }
  const evenements: Evenement[] = [];
  if (Array.isArray(b.evenements)) {
    for (const ev of b.evenements as unknown[]) {
      if (typeof ev !== 'object' || ev === null) continue;
      const { id, nom, famille, mots, mois } = ev as Record<string, unknown>;
      if (estTexte(id) && estTexte(nom) && estTexte(famille) && FAMILLES.has(famille) && estListeDeTextes(mots)) {
        evenements.push({ id, nom, famille: famille as Evenement['famille'], mots: [...mots], ...(typeof mois === 'number' && Number.isInteger(mois) && mois >= 1 && mois <= 12 ? { mois } : {}) });
      }
    }
  }
  return { source: estTexte(b.source) ? b.source : '', licence: estTexte(b.licence) ? b.licence : '', url: estTexte(b.url) ? b.url : '', evenements, entrees };
}

/** Une bibliotheque posee a la forme attendue : des entrees en liste, le reste suit du build. */
const annexe: Annexe<Bibliotheque> = {
  fichier: FICHIER_BIBLIOTHEQUE,
  globale: '__bibliothequeSvg',
  contenu: 'la bibliothèque',
  consigne: 'lancez « npm run bibliotheque »',
  valider: v => (typeof v === 'object' && v !== null && 'entrees' in v && Array.isArray(v.entrees) ? v as Bibliotheque : undefined)
};

export const chargerBibliotheque: () => Promise<Bibliotheque> = fabriquerChargeurAnnexe(annexe, navigateur).charger;

// ---------------------------------------------------------------- les sources libres

/** Une source libre chargee : son identifiant de registre et ses entrees, chacune portant sa source et sa nature. */
export interface SourceChargee {
  readonly source: string;
  readonly entrees: readonly EntreeBibliotheque[];
}

const NATURES: ReadonlySet<string> = new Set<NatureForme>(['plein', 'ligne']);

/**
 * L'annexe d'une source libre remise a la forme attendue : la source doit etre celle qu'on a demandee (une annexe d'une autre
 * source, ou d'un fichier etranger, est refusee) ; chaque entree garde son id, son nom, ses evenements, son SVG et une nature
 * connue, et recoit la source. Undefined quand ce n'est pas une annexe de cette source.
 */
export function normaliserSource(attendue: SourceFormes, v: unknown): SourceChargee | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const b = v as Record<string, unknown>;
  if (b.source !== attendue.id || !Array.isArray(b.entrees)) return undefined;
  const entrees: EntreeBibliotheque[] = [];
  for (const e of b.entrees as unknown[]) {
    if (typeof e !== 'object' || e === null) continue;
    const { id, nom, svg, evenements, nature } = e as Record<string, unknown>;
    if (!estTexte(id) || !estTexte(nom) || !estTexte(svg) || !estListeDeTextes(evenements)) continue;
    entrees.push({ id, nom, svg, evenements: [...evenements], source: attendue.id, nature: estTexte(nature) && NATURES.has(nature) ? nature as NatureForme : 'plein' });
  }
  return { source: attendue.id, entrees };
}

/** L'annexe d'une source libre, decrite pour le chargeur commun (annexes.ts). */
export const annexeSource = (s: SourceFormes): Annexe<SourceChargee> => ({
  fichier: s.fichier,
  globale: s.globale,
  contenu: 'les formes de ' + s.nomCourt,
  consigne: 'lancez « npm run bibliotheque »',
  valider: v => normaliserSource(s, v)
});

// Un chargeur par source, cree au premier besoin : une source qu'on ne demande jamais ne coute rien.
const chargeurs = new Map<string, Chargeur<SourceChargee>>();

/** Charge l'annexe d'une source libre du registre ; une source inconnue est refusee en la nommant. */
export function chargerSource(id: string): Promise<SourceChargee> {
  const s = sourceFormes(id);
  if (!s) return Promise.reject(new Error('Source de formes inconnue : ' + id + '.'));
  let c = chargeurs.get(id);
  if (!c) { c = fabriquerChargeurAnnexe(annexeSource(s), navigateur); chargeurs.set(id, c); }
  return c.charger();
}

/** Vrai quand l'annexe de cette source est deja arrivee. */
export const sourceChargee = (id: string): boolean => {
  const s = sourceFormes(id);
  return s !== undefined && annexePosee(annexeSource(s));
};

/** Les sources libres du registre (toutes sauf celle par defaut, que `chargerBibliotheque` amene). */
export const sourcesLibres = (): readonly SourceFormes[] => SOURCES_FORMES.filter(s => s.fichier !== FICHIER_BIBLIOTHEQUE);
