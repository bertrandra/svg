// La vectorisation d'une image matricielle (ADR-0002) : ce que l'on demande au
// traceur, et ce que l'on garde de ce qu'il rend. Le traceur lui-meme (vtracer, en WebAssembly) vit
// cote io/ ; ici, seulement des reglages et du texte, purs : une meme image et un meme reglage
// donnent toujours le meme SVG.

import { TOLERANCE_DEFAUT, type PorteeDetourage } from './detourage.js';
import type { ReglagesPretraitement } from './pretraitement.js';

/** Ce que la vectorisation cherche a garder de l'image. */
export type ModeVectorisation = 'aplats' | 'trait' | 'fidele';
export const MODES_VECTORISATION: readonly ModeVectorisation[] = ['aplats', 'trait', 'fidele'];

/** Le grain : `fine` garde les petits details, `lisse` les efface au profit de courbes franches. */
export type Finesse = 'fine' | 'normale' | 'lisse';
export const FINESSES: readonly Finesse[] = ['fine', 'normale', 'lisse'];

/**
 * Les reglages fins : chacun, quand il est present, l'emporte sur la valeur que le mode et le grain
 * donneraient. Absent, le reglage suit le mode. C'est ce que la personne a touche, et rien d'autre.
 */
export interface ReglagesFins {
  /** Les taches de moins de N pixels de cote sont ignorees. */
  filterSpeckle?: number;
  /** Le lissage des courbes ; 0 garde tous les points. */
  simplify?: number;
  /** L'angle, en degres, au-dela duquel un coin reste un coin. */
  cornerThreshold?: number;
  /** Les bits significatifs par canal de couleur, de 1 a 8. */
  colorPrecision?: number;
  /** L'ecart de couleur entre deux couches : plus haut, moins de couches. */
  layerDifference?: number;
  /** Les couleurs de l'image imposees au traceur en mode aplats, les plus presentes d'abord. */
  couleursMax?: number;
  /** Des courbes lissees, ou des segments droits. */
  courbes?: 'spline' | 'polygon';
  /** Des formes empilees (une couche sous l'autre), ou decoupees (des trous, sans recouvrement). */
  empilement?: 'stacked' | 'cutout';
}

/** Ce que l'on demande au traceur : un mode, un grain, et les reglages fins touches. */
export interface ReglageVecteurs { mode: ModeVectorisation; finesse: Finesse; fins?: ReglagesFins }

/** Ce qu'on fait d'une image deposee : son fond, et sa forme (image enveloppee, ou vecteurs). */
export interface Traitement {
  detourer: boolean;
  /** L'ecart percu jusqu'auquel un pixel est encore du fond. */
  tolerance: number;
  /** Depuis le bord seulement, ou partout dans l'image (transparence complete de cette couleur). */
  portee: PorteeDetourage;
  /** Null : l'image reste une image, enveloppee dans un SVG. */
  vecteurs: null | ReglageVecteurs;
  /**
   * Ce qu'on fait de l'image avant le detourage et le traceur : les seuls reglages touches (voir
   * `engine/pretraitement.ts`). Absent, rien : la sortie est celle d'avant le pretraitement, a l'octet.
   */
  pretraitement?: ReglagesPretraitement;
}

export const TRAITEMENT_DEFAUT: Traitement = { detourer: true, tolerance: TOLERANCE_DEFAUT, portee: 'bord', vecteurs: { mode: 'aplats', finesse: 'normale' } };

/** Le sous-ensemble des options de vtracer que l'on emploie. */
export interface OptionsTraceur {
  preset?: 'bw' | 'poster' | 'photo';
  clustering?: 'color-cluster' | 'bw';
  hierarchical?: 'stacked' | 'cutout';
  mode?: 'spline' | 'polygon';
  filterSpeckle?: number;
  colorPrecision?: number;
  layerDifference?: number;
  cornerThreshold?: number;
  simplify?: number;
  pathPrecision?: number;
  palette?: string[];
  maxColors?: number;
  adaptive?: boolean;
}

/** Le traceur : des pixels RGBA en entree, un SVG en sortie. Injecte : le WebAssembly au navigateur, le paquet Node aux tests. */
export type Traceur = (rgba: Uint8Array, largeur: number, hauteur: number, options: OptionsTraceur) => string;

/** Le meme traitement sans pretraitement : de quoi retrouver l'essai de reference d'un reglage. */
export function sansPretraitement(t: Traitement): Traitement {
  const r: Traitement = { ...t };
  delete r.pretraitement;
  return r;
}

/** Au-dela, une image vectorisee n'est plus un dessin : une photo tracee, lourde et sans interet. */
export const TRACES_MAX = 4000;

/** Les couleurs de l'image imposees au traceur en aplats, au plus : huit, ou davantage quand le pretraitement les a reduites a N exactes. */
export const COULEURS_PALETTE_MAX = 8;

const GRAINS: Record<Finesse, { filterSpeckle: number; simplify?: number }> = {
  fine: { filterSpeckle: 2 },
  normale: { filterSpeckle: 4, simplify: 0.8 },
  lisse: { filterSpeckle: 8, simplify: 1.6 }
};

/**
 * Les options du traceur pour un mode et un grain. En `aplats`, la palette de l'image (les couleurs
 * extraites, huit au plus) est imposee : chaque forme prend exactement une couleur de l'image, sans
 * degrade parasite. Les reglages fins touches l'emportent sur ce que le mode donnerait.
 */
export function optionsTraceur(mode: ModeVectorisation, finesse: Finesse, couleurs: readonly string[] = [], fins: ReglagesFins = {}, plafond = COULEURS_PALETTE_MAX): OptionsTraceur {
  const grain = GRAINS[finesse];
  const simplify = fins.simplify ?? grain.simplify;
  const commun: OptionsTraceur = {
    mode: fins.courbes ?? 'spline', hierarchical: fins.empilement ?? 'stacked', pathPrecision: 2,
    filterSpeckle: fins.filterSpeckle ?? grain.filterSpeckle, ...(simplify ? { simplify } : {})
  };
  const angle = fins.cornerThreshold !== undefined ? { cornerThreshold: fins.cornerThreshold } : {};
  if (mode === 'trait') return { ...commun, clustering: 'bw', adaptive: true, ...angle };
  if (mode === 'fidele') return { ...commun, preset: 'poster', colorPrecision: fins.colorPrecision ?? 7, layerDifference: fins.layerDifference ?? 8, ...angle };
  const n = Math.max(1, Math.min(plafond, Math.round(fins.couleursMax ?? plafond)));
  const palette = couleurs.filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, n);
  return {
    ...commun, clustering: 'color-cluster', ...(palette.length ? { palette } : { maxColors: n }),
    colorPrecision: fins.colorPrecision ?? 6, layerDifference: fins.layerDifference ?? 16, cornerThreshold: fins.cornerThreshold ?? 60
  };
}

/** Les valeurs de tous les reglages fins, telles que le mode et le grain les donnent sans rien toucher. */
export interface ValeursFins {
  filterSpeckle: number; simplify: number; cornerThreshold: number; colorPrecision: number; layerDifference: number; couleursMax: number;
  courbes: 'spline' | 'polygon'; empilement: 'stacked' | 'cutout';
}

/** Les valeurs par defaut d'un mode et d'un grain ; `nCouleurs` est le nombre de couleurs extraites de l'image. */
export function valeursParDefaut(mode: ModeVectorisation, finesse: Finesse, nCouleurs = 8, plafond = COULEURS_PALETTE_MAX): ValeursFins {
  const grain = GRAINS[finesse];
  return {
    filterSpeckle: grain.filterSpeckle, simplify: grain.simplify ?? 0, cornerThreshold: 60,
    colorPrecision: mode === 'fidele' ? 7 : 6, layerDifference: mode === 'fidele' ? 8 : 16,
    couleursMax: Math.max(1, Math.min(plafond, nCouleurs)), courbes: 'spline', empilement: 'stacked'
  };
}

export interface ParametreFin {
  id: 'filterSpeckle' | 'simplify' | 'cornerThreshold' | 'colorPrecision' | 'layerDifference' | 'couleursMax';
  libelle: string;
  aide: string;
  min: number;
  max: number;
  pas: number;
  /** Les modes ou le reglage change quelque chose. */
  modes: readonly ModeVectorisation[];
}

const TOUS: readonly ModeVectorisation[] = ['aplats', 'trait', 'fidele'];

/** Les reglages numeriques, dans l'ordre ou on les propose. */
export const PARAMETRES_FINS: readonly ParametreFin[] = [
  { id: 'couleursMax', libelle: 'Couleurs', aide: 'Au plus N couleurs de l’image, les plus présentes d’abord. Moins : des aplats plus simples.', min: 1, max: 8, pas: 1, modes: ['aplats'] },
  { id: 'filterSpeckle', libelle: 'Poussières', aide: 'Ignore les taches de moins de N pixels de côté. Plus haut : moins de petits tracés.', min: 0, max: 16, pas: 1, modes: TOUS },
  { id: 'simplify', libelle: 'Simplification', aide: 'Lisse les courbes en retirant des points. 0 garde tout ; plus haut : des tracés plus légers, moins fidèles.', min: 0, max: 4, pas: 0.1, modes: TOUS },
  { id: 'cornerThreshold', libelle: 'Angles vifs', aide: 'Angle, en degrés, au-delà duquel un coin reste un coin. Plus haut : des coins plus arrondis.', min: 0, max: 180, pas: 5, modes: TOUS },
  { id: 'colorPrecision', libelle: 'Précision des couleurs', aide: 'Bits significatifs par canal. Plus haut : plus de nuances distinguées.', min: 1, max: 8, pas: 1, modes: ['aplats', 'fidele'] },
  { id: 'layerDifference', libelle: 'Écart entre couches', aide: 'Écart de couleur à partir duquel on ouvre une couche. Plus haut : moins de couches.', min: 0, max: 64, pas: 1, modes: ['aplats', 'fidele'] }
];

export const parametresDuMode = (mode: ModeVectorisation): ParametreFin[] => PARAMETRES_FINS.filter(p => p.modes.includes(mode));

/**
 * Pose un reglage fin. Une valeur egale a celle du mode n'est plus un reglage touche : elle se retire,
 * pour que « touche » veuille toujours dire « different ». Rend undefined quand plus rien n'est touche.
 */
export function poserFin<K extends keyof ReglagesFins>(fins: ReglagesFins | undefined, id: K, valeur: NonNullable<ReglagesFins[K]>, defaut: NonNullable<ReglagesFins[K]>): ReglagesFins | undefined {
  const autres = Object.entries(fins ?? {}).filter(([k]) => k !== id);
  const r = Object.fromEntries(valeur === defaut ? autres : [...autres, [id, valeur]]) as ReglagesFins;
  return Object.keys(r).length ? r : undefined;
}

/** Retire un reglage fin : il suit de nouveau le mode. */
export function retirerFin(fins: ReglagesFins | undefined, id: keyof ReglagesFins): ReglagesFins | undefined {
  const r = Object.fromEntries(Object.entries(fins ?? {}).filter(([k]) => k !== id)) as ReglagesFins;
  return Object.keys(r).length ? r : undefined;
}

const NOMS_COURTS_MODES: Record<ModeVectorisation, string> = { aplats: 'Aplats', trait: 'Trait', fidele: 'Fidèle' };
const NOMS_COURTS_FINESSES: Record<Finesse, string> = { fine: 'fin', normale: 'normal', lisse: 'lisse' };
const LIBELLES_FINS: Record<keyof ReglagesFins, string> = {
  filterSpeckle: 'poussières', simplify: 'simplif.', cornerThreshold: 'angles', colorPrecision: 'précision', layerDifference: 'écart', couleursMax: 'couleurs', courbes: 'courbes', empilement: 'empilement'
};

/** Un reglage en une ligne : « Aplats · normal · poussières 8 · segments droits ». */
export function resumeReglages(v: ReglageVecteurs): string {
  const fins = v.fins ?? {};
  const touches = (Object.keys(LIBELLES_FINS) as (keyof ReglagesFins)[]).filter(k => fins[k] !== undefined).map(k => {
    const val = fins[k];
    if (k === 'courbes') return val === 'polygon' ? 'segments droits' : 'courbes';
    if (k === 'empilement') return val === 'cutout' ? 'découpé' : 'empilé';
    return LIBELLES_FINS[k] + ' ' + String(val);
  });
  return [NOMS_COURTS_MODES[v.mode], NOMS_COURTS_FINESSES[v.finesse], ...touches].join(' · ');
}

const stable = (v: unknown): string => {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => JSON.stringify(k) + ':' + stable(x)).join(',') + '}';
  return JSON.stringify(v);
};

/** Une cle stable d'un traitement : deux traitements de memes reglages ont la meme, quel que soit l'ordre des champs. */
export const cleTraitement = (t: Traitement): string => stable(t);

/** Ce que le traceur rend, sans son en-tete XML ni son commentaire : le SVG seul, pret a nettoyer. */
export function svgDuTraceur(brut: string): string {
  const debut = brut.search(/<svg[\s>]/i);
  return (debut < 0 ? brut : brut.slice(debut)).replace(/<!--[\s\S]*?-->/g, '').trim();
}

export const compterTraces = (svg: string): number => (svg.match(/<path\b/gi) ?? []).length;

/**
 * Le meme SVG en contours seuls : chaque forme sans remplissage, filet fin d'epaisseur constante a
 * l'ecran. Une image vectorisee ressemble a l'image d'origine ; ses traces, eux, se voient ainsi. La
 * feuille de style l'emporte sur les attributs de presentation du traceur.
 */
export function svgContours(svg: string, couleur = '#0b6bcb'): string {
  const fin = svg.search(/<svg\b[^>]*>/i);
  if (fin < 0) return svg;
  const ouverture = svg.slice(fin).match(/<svg\b[^>]*>/i)?.[0] ?? '';
  const style = '<style>*{fill:none!important;stroke:' + couleur + '!important;stroke-width:1px!important;vector-effect:non-scaling-stroke}</style>';
  const apres = fin + ouverture.length;
  return svg.slice(0, apres) + style + svg.slice(apres);
}

/**
 * Vrai s'il reste au moins un pixel opaque a tracer. Le traceur s'arrete en erreur sur une image
 * vide en mode couleur (vtracer 1.0.0-alpha.4) : on ne le lui demande jamais.
 */
export function aTracer(rgba: ArrayLike<number>, alphaMin = 128): boolean {
  for (let i = 3; i < rgba.length; i += 4) if ((rgba[i] ?? 0) >= alphaMin) return true;
  return false;
}
