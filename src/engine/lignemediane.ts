// La vectorisation en ligne mediane (ADR-0021) : un dessin au trait devient des traces OUVERTS d'une seule
// ligne, au milieu du trait, sans remplissage. vtracer ne rend que des contours (des formes pleines) : une
// ecriture scannee y devient des lettres creuses, que le stylo d'une machine de decoupe dessine en double
// trait. Ici, tout est pur et deterministe, sans WebAssembly :
//
//   1. masque      l'ecart de luminosite au fond, coupe au seuil d'Otsu (ou au seuil touche) ;
//   2. nettoyage   les taches et les trous de moins de N x N pixels disparaissent ;
//   3. squelette   amincissement de Guo-Hall, marches d'escalier retirees (squelette.ts) ;
//   4. mesure      l'epaisseur mediane du trait (distance au fond le long du squelette) et sa couleur ;
//   5. graphe      extremites, jonctions, aretes, boucles ; barbules elaguees, jonctions proches fondues (graphe.ts) ;
//   6. raccord     les petites coupures entre deux bouts qui se font face (raccord.ts) ;
//   7. courbes     lissage, coins, cubiques ajustees (courbes.ts) ;
//   8. ecriture    un dessin a plat, ecrit par `ecrireDessin` : ce que l'editeur relit tel quel.
//
// Comme les reglages fins du traceur (ADR-0005), un reglage n'existe que touche ; ses valeurs par defaut se
// calculent sur l'image (l'epaisseur mesuree, le seuil d'Otsu) et sur le grain.

import type { Rgb } from '../util/couleur.js';
import { versHex } from '../util/couleur.js';
import { ecrireDessin } from './edition/ecriture.js';
import type { Chemin, DessinSvg, Forme } from './edition/types.js';
import { versChemin } from './lignemediane/courbes.js';
import { degres, elaguer, fondreJonctionsProches, longueur, suivreSquelette, type Graphe, type Pt } from './lignemediane/graphe.js';
import { boucherTrous, contrastes, masquer, retirerTaches, seuilOtsu, type Masque } from './lignemediane/masque.js';
import { raccorder, traverserJonctions, type Trace } from './lignemediane/raccord.js';
import { amincir, distances2, retirerMarches } from './lignemediane/squelette.js';
import type { ImageRgba } from './pixels/types.js';
import type { Finesse } from './vectorisation.js';

/** Les reglages de la ligne mediane : chacun, present, a ete touche ; absent, il suit l'image et le grain. */
export interface ReglagesLigne {
  /** L'epaisseur du trait ecrit, en pixels de l'image. */
  epaisseur?: number;
  /** L'ecart de luminosite au fond au-dela duquel un pixel est du trait (0 a 255). */
  seuil?: number;
  /** Les taches (et les trous) de moins de N x N pixels sont ignores. */
  taches?: number;
  /** Les barbules de moins de N pixels sont retirees. */
  barbules?: number;
  /** Les coupures de moins de N pixels (le blanc entre deux bouts de trait) sont raccordees ; 0, aucune. */
  coupures?: number;
  /** La couleur du trait ecrit : celle du dessin, ou noir. */
  couleur?: 'trait' | 'noir';
}

/** Ce que l'image dit d'elle-meme : de quoi calculer les valeurs par defaut. */
export interface MesureLigne {
  /** L'epaisseur mediane du trait d'origine, en pixels, au dixieme. */
  epaisseur: number;
  /** Le seuil d'Otsu de l'image. */
  seuil: number;
  /** La couleur dominante du trait, ou noir pour un trait sans teinte. */
  couleur: string;
}

export interface ValeursLigne { epaisseur: number; seuil: number; taches: number; barbules: number; coupures: number; couleur: 'trait' | 'noir' }

/** Au-dela, l'image est refusee : quatre millions de pixels, la taille d'une source agrandie x2. */
export const PIXELS_LIGNE_MAX = 2048 * 2048;
/**
 * Au-dela, le resultat est refuse : le plafond des traces de vtracer (TRACES_MAX, un test garde l'egalite), recopie ici
 * parce que vectorisation.ts lit ce module et qu'un import dans l'autre sens ferait un cycle.
 */
export const TRACES_LIGNE_MAX = 4000;
/** Au-dela, le resultat est refuse : un dessin au trait n'a pas cent mille points. */
export const POINTS_LIGNE_MAX = 100_000;
/** Au-dela de cette part de l'image, ce n'est plus un dessin au trait. */
export const PART_TRAIT_MAX = 0.5;

/** Ce que le grain change : les taches ignorees, l'ecart permis aux courbes, le lissage, et les barbules (en epaisseurs). */
const GRAINS: Record<Finesse, { taches: number; tolerance: number; passes: number; barbules: number }> = {
  fine: { taches: 2, tolerance: 0.6, passes: 1, barbules: 0.75 },
  normale: { taches: 4, tolerance: 1, passes: 2, barbules: 1.25 },
  lisse: { taches: 8, tolerance: 1.8, passes: 3, barbules: 2 }
};

const MESURE_NEUTRE: MesureLigne = { epaisseur: 3, seuil: 127, couleur: '#000000' };

/** Les valeurs de tous les reglages, telles que l'image mesuree et le grain les donnent sans rien toucher. */
export function valeursLigneParDefaut(finesse: Finesse, mesure: MesureLigne | null): ValeursLigne {
  const m = mesure ?? MESURE_NEUTRE, g = GRAINS[finesse];
  return {
    epaisseur: Math.max(0.5, Math.round(m.epaisseur * 2) / 2), seuil: m.seuil, taches: g.taches,
    barbules: Math.max(2, Math.round(m.epaisseur * g.barbules)), coupures: Math.max(1, Math.min(24, Math.round(m.epaisseur * 0.75))), couleur: 'trait'
  };
}

export interface ParametreLigne {
  id: 'epaisseur' | 'seuil' | 'taches' | 'barbules' | 'coupures';
  libelle: string;
  aide: string;
  unite?: string;
  min: number;
  max: number;
  pas: number;
}

/** Les curseurs, dans l'ordre ou on les propose : l'epaisseur se voit, les autres sont des reglages fins. */
export const PARAMETRES_LIGNE: readonly ParametreLigne[] = [
  { id: 'epaisseur', libelle: 'Épaisseur du trait', aide: 'L’épaisseur de la ligne écrite. Par défaut, celle du trait de l’image, mesurée au milieu du trait.', unite: ' px', min: 0.5, max: 30, pas: 0.5 },
  { id: 'seuil', libelle: 'Séparer le trait du fond', aide: 'Plus haut : seuls les pixels nettement plus foncés (ou plus clairs) que le fond sont du trait. Par défaut, le seuil d’Otsu de l’image.', min: 1, max: 254, pas: 1 },
  { id: 'taches', libelle: 'Ignorer les taches de moins de', aide: 'Les taches et les trous de moins de N pixels de côté sont ignorés : poussières du scan, points blancs dans un trait épais.', unite: ' px', min: 0, max: 16, pas: 1 },
  { id: 'barbules', libelle: 'Retirer les barbules de moins de', aide: 'Les petites branches parasites, aux coins d’un trait épais, de moins de N pixels, sont retirées. Par défaut, selon l’épaisseur du trait et le grain.', unite: ' px', min: 0, max: 60, pas: 1 },
  { id: 'coupures', libelle: 'Raccorder les coupures de moins de', aide: 'Deux bouts de trait qui se font face, à moins de N pixels, se rejoignent : le stylo ne se lève pas pour rien. 0 : aucun raccord.', unite: ' px', min: 0, max: 24, pas: 1 }
];

/** Pose un reglage ; une valeur egale a celle par defaut se retire. Rend undefined quand plus rien n'est touche. */
export function poserLigne<K extends keyof ReglagesLigne>(r: ReglagesLigne | undefined, id: K, valeur: NonNullable<ReglagesLigne[K]>, defaut: NonNullable<ReglagesLigne[K]>): ReglagesLigne | undefined {
  const autres = Object.entries(r ?? {}).filter(([k]) => k !== id);
  const sortie = Object.fromEntries(valeur === defaut ? autres : [...autres, [id, valeur]]) as ReglagesLigne;
  return Object.keys(sortie).length ? sortie : undefined;
}

/** Retire un reglage : il suit de nouveau l'image et le grain. */
export function retirerLigne(r: ReglagesLigne | undefined, id: keyof ReglagesLigne): ReglagesLigne | undefined {
  const sortie = Object.fromEntries(Object.entries(r ?? {}).filter(([k]) => k !== id)) as ReglagesLigne;
  return Object.keys(sortie).length ? sortie : undefined;
}

const LIBELLES_LIGNE: Record<keyof ReglagesLigne, string> = { epaisseur: 'épaisseur', seuil: 'seuil', taches: 'taches', barbules: 'barbules', coupures: 'coupures', couleur: 'couleur' };

/** Les reglages touches en mots courts : « épaisseur 4 », « barbules 6 », « noir ». */
export function resumeLigne(r: ReglagesLigne | undefined): string[] {
  return (Object.keys(LIBELLES_LIGNE) as (keyof ReglagesLigne)[]).filter(k => r?.[k] !== undefined).map(k => (k === 'couleur' ? (r?.couleur === 'noir' ? 'noir' : 'couleur du trait') : LIBELLES_LIGNE[k] + ' ' + String(r?.[k])));
}

/** La mediane des epaisseurs locales le long du squelette : deux fois la distance au fond, moins un demi-pixel. */
function epaisseurMediane(m: Masque, d2: Float64Array): number {
  const locales: number[] = [];
  for (let i = 0; i < m.bits.length; i++) if (m.bits[i]) locales.push(2 * Math.sqrt(d2[i] ?? 0) - 0.5);
  if (!locales.length) return 1;
  locales.sort((a, b) => a - b);
  return Math.max(1, Math.round((locales[(locales.length - 1) >> 1] ?? 1) * 10) / 10);
}

/**
 * La couleur dominante du trait : la case la plus peuplee (5 bits par canal) des pixels du coeur du trait
 * (loin du bord anticrenele), en moyenne. Une couleur sans teinte (gris, noir) rend le noir : un crayon
 * ou une encre noire scannes donnent du noir, une encre bleue reste bleue.
 */
function couleurDominante(img: ImageRgba, m: Masque, d2: Float64Array): string {
  const compte = new Uint32Array(1 << 15), somme = new Float64Array((1 << 15) * 3);
  for (const coeur of [true, false]) {
    for (let y = 0; y < img.hauteur; y++) for (let x = 0; x < img.largeur; x++) {
      const j = (y + 1) * m.pas + x + 1;
      if (!(d2[j] ?? 0) || (coeur && (d2[j] ?? 0) < 2)) continue;
      const i = (y * img.largeur + x) * 4, r = img.data[i] ?? 0, g = img.data[i + 1] ?? 0, b = img.data[i + 2] ?? 0, c = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      compte[c] = (compte[c] ?? 0) + 1;
      somme[c * 3] = (somme[c * 3] ?? 0) + r; somme[c * 3 + 1] = (somme[c * 3 + 1] ?? 0) + g; somme[c * 3 + 2] = (somme[c * 3 + 2] ?? 0) + b;
    }
    let meilleure = -1, n = 0;
    for (let c = 0; c < compte.length; c++) if ((compte[c] ?? 0) > n) { n = compte[c] ?? 0; meilleure = c; }
    if (meilleure < 0) continue;
    const rgb: Rgb = { r: Math.round((somme[meilleure * 3] ?? 0) / n), g: Math.round((somme[meilleure * 3 + 1] ?? 0) / n), b: Math.round((somme[meilleure * 3 + 2] ?? 0) / n) };
    return Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b) < 48 ? '#000000' : versHex(rgb);
  }
  return '#000000';
}

/** Les traces du graphe : ses aretes (bouts libres aux extremites), ses boucles, ses points. Une boucle minuscule est un point. */
function tracesDuGraphe(g: Graphe): Trace[] {
  const d = degres(g), traces: Trace[] = [];
  for (const e of g.aretes) if (e) traces.push({ pts: e.pts, ferme: false, libres: [d[e.a] === 1, d[e.b] === 1], noeuds: [e.a, e.b] });
  for (const b of g.boucles) {
    if (longueur([...b, b[0] ?? [0, 0]]) >= 8) { traces.push({ pts: b, ferme: true, libres: [false, false] }); continue; }
    const sx = b.reduce((s, p) => s + p[0], 0) / Math.max(1, b.length), sy = b.reduce((s, p) => s + p[1], 0) / Math.max(1, b.length);
    traces.push({ pts: [[sx, sy] as Pt], ferme: false, libres: [false, false] });
  }
  for (const p of g.points) traces.push({ pts: [p], ferme: false, libres: [false, false] });
  return traces;
}

/** Ce que la ligne mediane rend : le SVG, le nombre de traces et de points, et ce que l'image a dit d'elle. */
export interface ResultatLigne { svg: string; traces: number; points: number; mesure: MesureLigne }

const forme = (k: number, d: Chemin, couleur: string, epaisseur: number): Forme => ({
  id: 'ligne-' + (k + 1), d, remplissage: null, contour: couleur, epaisseur, opacite: 1, bout: 'round', regle: 'nonzero', visible: true, verrouille: false
});

/** Le masque nettoye, ou la raison d'un refus. */
function masqueNettoye(image: ImageRgba, fond: Rgb, seuil: number, taches: number): Masque | { erreur: string } {
  const { masque, encre } = masquer(contrastes(image, fond), image.largeur, image.hauteur, seuil);
  if (!encre) return { erreur: 'Aucun trait trouvé : baissez « Séparer le trait du fond », ou vérifiez le détourage.' };
  if (encre > PART_TRAIT_MAX * image.largeur * image.hauteur) return { erreur: 'Plus de la moitié de l’image est du trait : ce n’est pas un dessin au trait. Montez « Séparer le trait du fond », ou choisissez un autre mode.' };
  retirerTaches(masque, taches * taches);
  boucherTrous(masque, taches * taches);
  if (!masque.bits.some(b => b)) return { erreur: 'Aucun trait ne reste : les taches ignorées ont tout retiré. Baissez « Ignorer les taches ».' };
  return masque;
}

/**
 * Trace la ligne mediane d'une image. `fond` est la couleur du fond (celle du bord, avant detourage) ; un
 * pixel transparent est du fond. Pur et deterministe : la meme image, le meme fond, le meme grain et les
 * memes reglages rendent les memes octets. Refuse en le nommant une image trop grande, sans trait, qui n'est
 * pas un dessin au trait, ou un resultat demesure.
 */
export function tracerLigneMediane(image: ImageRgba, fond: Rgb, finesse: Finesse, reglages?: ReglagesLigne): ResultatLigne | { erreur: string } {
  const { largeur: l, hauteur: h } = image;
  if (l * h > PIXELS_LIGNE_MAX) return { erreur: 'Image trop grande pour la ligne médiane (' + l + ' × ' + h + ' px, quatre millions de pixels au plus) : désactivez « Agrandir ×2 ».' };
  const r = reglages ?? {}, grain = GRAINS[finesse];
  const seuilMesure = seuilOtsu(contrastes(image, fond));
  const masque = masqueNettoye(image, fond, r.seuil ?? seuilMesure, r.taches ?? grain.taches);
  if ('erreur' in masque) return masque;
  const d2 = distances2(masque), couleurMesuree = couleurDominante(image, masque, d2);
  amincir(masque);
  retirerMarches(masque);
  const mesure: MesureLigne = { epaisseur: epaisseurMediane(masque, d2), seuil: seuilMesure, couleur: couleurMesuree };
  const v = { ...valeursLigneParDefaut(finesse, mesure), ...r };
  const g = suivreSquelette(masque);
  elaguer(g, v.barbules);
  // Au-dela de trois epaisseurs, deux jonctions ne sont plus un croisement : un angle de moins de 37 degres.
  const portee = Math.max(2, 1.5 * mesure.epaisseur);
  fondreJonctionsProches(g, 3 * mesure.epaisseur, portee);
  // Le squelette s'arrete a une demi-epaisseur du bout de chaque trait : le blanc d'une coupure, c'est l'ecart des
  // deux bouts du squelette moins une epaisseur.
  const traces = raccorder(traverserJonctions(tracesDuGraphe(g), portee), v.coupures > 0 ? v.coupures + mesure.epaisseur : 0);
  const couleur = v.couleur === 'noir' ? '#000000' : mesure.couleur;
  const formes: Forme[] = [];
  let points = 0;
  for (const t of traces) {
    const d = versChemin(t.pts, t.ferme, grain.tolerance, grain.passes);
    if (!d.length) continue;
    points += d.filter(c => c.c !== 'Z').length;
    if (points > POINTS_LIGNE_MAX) return { erreur: 'Plus de cent mille points : ce n’est plus un dessin au trait. Choisissez un grain plus lisse, ou ignorez plus de taches.' };
    formes.push(forme(formes.length, d, couleur, v.epaisseur));
  }
  if (formes.length > TRACES_LIGNE_MAX) return { erreur: formes.length + ' tracés : c’est une photo plus qu’un dessin au trait. Ignorez plus de taches, ou choisissez un grain plus lisse.' };
  const dessin: DessinSvg = { vb: [0, 0, l, h], formes };
  return { svg: ecrireDessin(dessin), traces: formes.length, points, mesure };
}
