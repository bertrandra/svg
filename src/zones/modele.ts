// Le reglage du modele (ADR-0012, annexe 5 §3) : `plat`, le defaut et le contrat de l'ADR-0001 (les groupes se fondent ; degrades,
// images, decoupes refuses en les nommant), ou `riche`, la beta des groupes, degrades et effets. Il dit comment se LIT un SVG : un
// dessin deja lu s'affiche et s'ecrit selon ce qu'il porte (estPlat), quel que soit le reglage.
//
// La page et le site le gardent dans le stockage injecte (cle `svg.modele`) ; sans reglage lisible, c'est le defaut de la page
// (`MODELE_PAGE`), et `plat` pour tout autre appelant. Un hote qui passe `modele` le fixe : le reglage du menu Edition disparait, et
// la promesse d'« a l'identique demain » tient tant qu'il garde `plat` (le defaut de l'embarquement ne change pas : annexe 9, question 3).
// Tout ce qui vient du stockage se valide (ADR-0014) : une valeur qu'on n'a pas ecrite se lit comme absente.

import type { DessinSvg, OptionsLecture } from '../engine/editionSvg.js';
import { ATTRIBUT_MODELE, estPlat } from '../engine/editionSvg.js';
import type { Stockage } from '../io/stockage.js';
import type { Modele } from './typesEditeur.js';

export const CLE_MODELE = 'svg.modele';

/** Vrai pour un modele connu. */
export const estModele = (v: unknown): v is Modele => v === 'plat' || v === 'riche';

/** Le modele garde, ou null s'il n'a pas la forme que cette page ecrit (`{ modele: 'riche' }`). */
export function lireModele(v: unknown): Modele | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const m = (v as Record<string, unknown>)['modele'];
  return estModele(m) ? m : null;
}

/**
 * Le modele de la page autonome et du site PHP quand le stockage n'en garde aucun (ou un illisible). Une seule valeur, pour que la
 * bascule (ADR-0012, etape 14) tienne en un seul commit, que l'on defait seul. L'embarquement ne la lit jamais.
 */
export const MODELE_PAGE: Modele = 'plat';

/** Le modele retenu dans ce stockage ; `defaut` sans stockage, ou sans reglage lisible (`plat` si l'appelant ne dit rien). */
export const modeleRetenu = (s: Stockage | null, defaut: Modele = 'plat'): Modele => lireModele(s?.lire<unknown>(CLE_MODELE)) ?? defaut;

/** Garde le reglage ; faux si le stockage le refuse (ou manque). Un objet : un champ de plus demain ne cassera pas la lecture. */
export const garderModele = (s: Stockage | null, m: Modele): boolean => s?.ecrire(CLE_MODELE, { modele: m }) ?? false;

/** Les options de lecture d'un modele : rien pour `plat` (le contrat d'avant, a l'appel pres), le mode pour `riche`. */
export const optionsModele = (m: Modele | undefined): OptionsLecture => (m === 'riche' ? { modele: 'riche' } : {});

/** Le marqueur du modele v2 sur la balise <svg> : le fichier a ete ecrit avec des groupes, des degrades ou des effets. */
export function porteModeleRiche(svg: string): boolean {
  const debut = /<svg[\s>]/i.exec(svg);
  if (!debut) return false;
  const fin = svg.indexOf('>', debut.index);
  return new RegExp('\\s' + ATTRIBUT_MODELE + '\\s*=').test(svg.slice(debut.index, fin < 0 ? undefined : fin));
}

/** Ce qui se rouvre d'un SVG garde : une version nommee, le brouillon. */
export type Garde = 'version' | 'brouillon';

/**
 * Le refus d'ouvrir un SVG garde en modele `plat` quand il a ete ecrit en `riche` (annexe 5 §3) : la lecture plate fondrait ses
 * groupes ou refuserait ses degrades. Rien n'est efface : on dit seulement quoi faire. Null quand rien n'empeche de l'ouvrir.
 */
export function refusModele(svg: string, m: Modele, garde: Garde): string | null {
  if (m === 'riche' || !porteModeleRiche(svg)) return null;
  return garde === 'version'
    ? 'Cette version emploie des groupes, des dégradés ou des effets ; activez le modèle riche (« Groupes, dégradés, effets (bêta) », menu Édition) pour l’ouvrir.'
    : 'Ce brouillon emploie des groupes, des dégradés ou des effets ; activez le modèle riche (bêta) pour le reprendre.';
}

/** Ce que dit le reglage quand il change : il vaut pour les fichiers ouverts ensuite, le dessin ouvert reste tel qu'il a ete lu. */
export function phraseModele(m: Modele, garde: boolean): string {
  const quoi = m === 'riche'
    ? 'Groupes, dégradés et effets activés (bêta) : les prochains fichiers ouverts gardent leurs groupes.'
    : 'Groupes, dégradés et effets désactivés : les prochains fichiers s’ouvrent à plat.';
  return garde ? quoi : quoi + ' Ce navigateur ne garde pas ce réglage : il ne vaut que pour cette édition.';
}

/**
 * Les groupes se commandent-ils ? En modele riche, ou sur un dessin deja riche (un projet du site s'ouvre tel qu'il a ete enregistre,
 * quel que soit le reglage) : ses groupes se voient, on doit pouvoir y entrer et en sortir. Un dessin plat lu a plat : non. (Ici, sans
 * dependance : les actions du texte la lisent aussi, et commandesGroupes.ts la reexporte.)
 */
export const groupesActifs = (d: DessinSvg, modele: Modele): boolean => modele === 'riche' || !estPlat(d);
