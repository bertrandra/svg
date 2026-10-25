// Le pretraitement d'une image avant le traceur (ADR-0005 prolonge) : ce que les vectoriseurs du commerce
// font avant de tracer. Un tuyau unique, `pretraiter`, dont chaque etape est une fonction pure sur des
// pixels RGBA (engine/pixels/) qui rend une image neuve. Comme les reglages fins du traceur, un reglage
// n'existe que s'il a ete touche : sans reglage, `pretraiter` rend la source elle-meme, sans copie, et le
// traceur voit exactement les octets d'avant. La meme image et les memes reglages rendent la meme image.
//
// L'ordre est fixe, et c'est lui qui compte :
//   1. alpha        aplatir les bords translucides (avant tout : un halo alpha fausse le reste) ;
//   2. debruitage   le grain d'abord, a la taille de la source (quatre fois moins de pixels qu'agrandi) ;
//   3. agrandir     x2, sur une image deja nette de grain ;
//   4. nettete      le masque flou rattrape ce que l'agrandissement adoucit ; puis le gamma ;
//   5. couleurs     reduire a N couleurs, quand le grain et le flou ne peuvent plus rien changer ;
//   6. lissage      le filtre de mode, en dernier : sur des couleurs exactes, il ne confond rien.

import { aplatirAlpha } from './pixels/alpha.js';
import { agrandirX2, peutAgrandir } from './pixels/agrandir.js';
import { debruiter } from './pixels/debruitage.js';
import { lisserBords } from './pixels/lissage.js';
import { affuter, corrigerGamma } from './pixels/nettete.js';
import { COULEURS_MAX, COULEURS_MIN, quantifier } from './pixels/quantification.js';
import type { ImageRgba } from './pixels/types.js';

export type { ImageRgba };
export { COULEURS_MAX, COULEURS_MIN };

/** Une force de 1 a 3 (debruitage, nettete, lissage). */
export type Force = 1 | 2 | 3;

/**
 * Les reglages de pretraitement : chacun, present, a ete touche. Absent, l'etape n'a pas lieu. Un reglage
 * qui vaudrait « rien » (force 0, gamma 1) n'est jamais stocke : `poserPre` le retire.
 */
export interface ReglagesPretraitement {
  /** Aplatir les bords translucides contre le fond de l'image. */
  alpha?: true;
  /** Debruiter en gardant les bords : 1 mediane, 2 bilateral, 3 les deux. */
  debruitage?: Force;
  /** Doubler la taille avant de tracer (pour une petite source). */
  agrandir?: true;
  /** Masque flou : la force du rehaussement des contours. */
  nettete?: Force;
  /** Gamma : > 1 eclaircit les demi-teintes, < 1 les assombrit. */
  gamma?: number;
  /** Reduire a N couleurs (2 a 64). */
  couleurs?: number;
  /** Avec `couleurs` : garder la couleur du fond (ou le blanc) a l'octet. */
  garderFond?: true;
  /** Lisser les bords par un filtre de mode : le nombre de passes. */
  lissage?: Force;
}

export type ClePretraitement = keyof ReglagesPretraitement;

/** Ce que le tuyau rend : l'image, et ce qu'on a envie de savoir d'elle. */
export interface ResultatPretraitement {
  image: ImageRgba;
  /** La palette de la quantification (les plus presentes d'abord), ou null si on n'a pas reduit les couleurs. */
  palette: string[] | null;
  /** Vrai si l'image a ete doublee. */
  agrandie: boolean;
  /** Les etapes jouees, dans l'ordre : de quoi les dire a la personne. */
  etapes: ClePretraitement[];
}

export const GAMMA_MIN = 0.5, GAMMA_MAX = 2;
const forceValide = (f: number | undefined): Force | undefined => (f === 1 || f === 2 || f === 3 ? f : undefined);

/**
 * Remet des reglages en forme : valeurs bornees, reglages neutres retires, `garderFond` sans `couleurs`
 * retire. Rend undefined quand plus rien n'est touche. C'est la seule forme que le tuyau et la cle d'un
 * traitement voient ; deux reglages equivalents en font la meme.
 */
export function normaliserPretraitement(r: ReglagesPretraitement | undefined): ReglagesPretraitement | undefined {
  if (!r) return undefined;
  const sortie: ReglagesPretraitement = {};
  if (r.alpha) sortie.alpha = true;
  const deb = forceValide(r.debruitage); if (deb) sortie.debruitage = deb;
  if (r.agrandir) sortie.agrandir = true;
  const net = forceValide(r.nettete); if (net) sortie.nettete = net;
  if (typeof r.gamma === 'number' && Number.isFinite(r.gamma) && r.gamma !== 1) sortie.gamma = Math.round(Math.min(GAMMA_MAX, Math.max(GAMMA_MIN, r.gamma)) * 100) / 100;
  if (typeof r.couleurs === 'number' && Number.isFinite(r.couleurs)) {
    sortie.couleurs = Math.min(COULEURS_MAX, Math.max(COULEURS_MIN, Math.round(r.couleurs)));
    if (r.garderFond) sortie.garderFond = true;
  }
  const lis = forceValide(r.lissage); if (lis) sortie.lissage = lis;
  return Object.keys(sortie).length ? sortie : undefined;
}

/** Pose un reglage (ou le retire quand `valeur` est undefined) ; rend undefined quand plus rien n'est touche. */
export function poserPre<K extends ClePretraitement>(r: ReglagesPretraitement | undefined, id: K, valeur: ReglagesPretraitement[K] | undefined): ReglagesPretraitement | undefined {
  const base: ReglagesPretraitement = { ...(r ?? {}) };
  if (valeur === undefined) delete base[id]; else base[id] = valeur;
  return normaliserPretraitement(base);
}

/** Un reglage de la liste de curseurs : de quoi construire l'interface sans la recopier. */
export interface ParametrePre {
  id: 'debruitage' | 'nettete' | 'lissage' | 'gamma' | 'couleurs';
  libelle: string;
  aide: string;
  min: number;
  max: number;
  pas: number;
  /** La valeur « rien » (l'etape n'a pas lieu) ; pour `couleurs`, la valeur proposee a l'activation. */
  neutre: number;
}

export const PARAMETRES_PRETRAITEMENT: readonly ParametrePre[] = [
  { id: 'debruitage', libelle: 'Effacer le grain', aide: 'Débruitage : efface le grain d’un JPEG ou d’un scan en gardant les bords. 1 : médiane, 2 : bilatéral, 3 : les deux.', min: 0, max: 3, pas: 1, neutre: 0 },
  { id: 'nettete', libelle: 'Netteté', aide: 'Redonne de la tenue à des contours mous. 0 : aucune.', min: 0, max: 3, pas: 1, neutre: 0 },
  { id: 'gamma', libelle: 'Éclaircir les demi-teintes', aide: 'Gamma : plus haut, des demi-teintes plus claires ; plus bas, plus sombres. 1 : inchangé.', min: GAMMA_MIN, max: GAMMA_MAX, pas: 0.05, neutre: 1 },
  { id: 'couleurs', libelle: 'Couleurs', aide: 'Réduit l’image à N couleurs avant le tracé : des aplats francs, moins de formes.', min: COULEURS_MIN, max: COULEURS_MAX, pas: 1, neutre: 8 },
  { id: 'lissage', libelle: 'Lissage des bords', aide: 'Filtre de mode : retire les pixels parasites le long des contours. Nombre de passes.', min: 0, max: 3, pas: 1, neutre: 0 }
];

/** Un jeu de reglages nomme, qui en pose plusieurs d'un coup : ils se voient ensuite comme des valeurs touchees. */
export interface PresetPre { id: string; libelle: string; aide: string; reglages: ReglagesPretraitement }

export const PRESETS_PRETRAITEMENT: readonly PresetPre[] = [
  { id: 'logo', libelle: 'Logo net', aide: 'Un logo en aplats, un peu bruité : débruiter, réduire à 8 couleurs en gardant le fond, lisser les bords.', reglages: { alpha: true, debruitage: 1, couleurs: 8, garderFond: true, lissage: 1 } },
  { id: 'trait', libelle: 'Dessin au trait', aide: 'Un dessin à l’encre ou au crayon : netteté, deux couleurs (le trait et le papier), bords lissés.', reglages: { alpha: true, debruitage: 1, nettete: 1, couleurs: 2, garderFond: true, lissage: 1 } },
  { id: 'photo', libelle: 'Photo (aplats)', aide: 'Une photo en aplats : débruitage fort, 12 couleurs, bords lissés.', reglages: { debruitage: 2, couleurs: 12, lissage: 2 } }
];

const NOMS_PRE: Record<ClePretraitement, string> = {
  alpha: 'bords translucides aplatis', debruitage: 'débruitage', agrandir: 'agrandi ×2', nettete: 'netteté', gamma: 'gamma', couleurs: 'couleurs', garderFond: 'fond gardé', lissage: 'lissage'
};
const ORDRE_PRE: readonly ClePretraitement[] = ['alpha', 'debruitage', 'agrandir', 'nettete', 'gamma', 'couleurs', 'garderFond', 'lissage'];

/** Les reglages en une ligne : « débruitage 1 · couleurs 8 · fond gardé ». Vide quand rien n'est touche. */
export function resumePretraitement(r: ReglagesPretraitement | undefined): string {
  const n = normaliserPretraitement(r);
  if (!n) return '';
  return ORDRE_PRE.filter(k => n[k] !== undefined).map(k => (typeof n[k] === 'number' ? NOMS_PRE[k] + ' ' + String(n[k]) : NOMS_PRE[k])).join(' · ');
}

/** Le nombre de couleurs distinctes des pixels presents (alpha d'au moins 128) : un bitmap de 2 Mo, pas de table. */
export function compterCouleurs(img: ImageRgba): number {
  const vus = new Uint8Array(1 << 21);
  let n = 0;
  for (let i = 0; i < img.largeur * img.hauteur; i++) {
    if ((img.data[i * 4 + 3] ?? 0) < 128) continue;
    const c = ((img.data[i * 4] ?? 0) << 16) | ((img.data[i * 4 + 1] ?? 0) << 8) | (img.data[i * 4 + 2] ?? 0);
    const octet = c >> 3, bit = 1 << (c & 7), avant = vus[octet] ?? 0;
    if (!(avant & bit)) { vus[octet] = avant | bit; n++; }
  }
  return n;
}

/**
 * Les couleurs exactes d'une image deja reduite, les plus presentes d'abord, avec leur part. Au plus
 * `max` ; au-dela (une image qui n'a pas ete reduite), null : ce n'est pas une palette.
 */
export function couleursExactes(img: ImageRgba, max: number): Array<{ hex: string; part: number }> | null {
  const comptes = new Map<number, number>();
  let total = 0;
  for (let i = 0; i < img.largeur * img.hauteur; i++) {
    if ((img.data[i * 4 + 3] ?? 0) < 128) continue;
    const c = ((img.data[i * 4] ?? 0) << 16) | ((img.data[i * 4 + 1] ?? 0) << 8) | (img.data[i * 4 + 2] ?? 0);
    comptes.set(c, (comptes.get(c) ?? 0) + 1);
    total++;
    if (comptes.size > max) return null;
  }
  return [...comptes].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([c, n]) => ({ hex: '#' + c.toString(16).padStart(6, '0'), part: Math.round((n / total) * 1000) / 1000 }));
}

/**
 * Le tuyau. Sans reglage touche, rend la source elle-meme (meme tampon) : le traceur voit les octets
 * d'avant. Sinon chaque etape rend une image neuve et la source n'est jamais modifiee.
 */
export function pretraiter(source: ImageRgba, reglages: ReglagesPretraitement | undefined): ResultatPretraitement {
  const r = normaliserPretraitement(reglages);
  if (!r) return { image: source, palette: null, agrandie: false, etapes: [] };
  let image = source, palette: string[] | null = null, agrandie = false;
  const etapes: ClePretraitement[] = [];
  const jouer = (cle: ClePretraitement, f: () => ImageRgba) => { image = f(); etapes.push(cle); };
  if (r.alpha) jouer('alpha', () => aplatirAlpha(image));
  if (r.debruitage) jouer('debruitage', () => debruiter(image, r.debruitage ?? 0));
  if (r.agrandir && peutAgrandir(image.largeur, image.hauteur)) { jouer('agrandir', () => agrandirX2(image)); agrandie = true; }
  if (r.nettete) jouer('nettete', () => affuter(image, r.nettete ?? 0));
  if (r.gamma !== undefined) jouer('gamma', () => corrigerGamma(image, r.gamma ?? 1));
  if (r.couleurs !== undefined) {
    jouer('couleurs', () => { const q = quantifier(image, r.couleurs ?? COULEURS_MIN, r.garderFond === true); palette = q.palette; return q.image; });
    if (r.garderFond) etapes.push('garderFond');
  }
  // Apres une quantification les couleurs sont exactes (precision 0) ; sinon on ignore le grain des trois bits bas.
  if (r.lissage) jouer('lissage', () => lisserBords(image, r.lissage ?? 0, r.couleurs !== undefined ? 0 : 3));
  return { image, palette, agrandie, etapes };
}
