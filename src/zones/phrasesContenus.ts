// Ce que l'editeur dit des decoupes, des masques, des effets et des images inserees (ADR-0012, etape 8 ; annexe 6 §3, §6 et §7) : les
// phrases entieres que la region vocale dit apres une commande, et les raisons d'une commande grisee. Les refus du moteur
// (`MSG_DECOUPE`, `MSG_MASQUE`) sont deja des phrases au vouvoiement : ils se disent tels quels.

import { pluriel } from '../util/texte.js';
import { elementsDits, groupeDit, phraseEntreeGroupe } from './phrasesGroupes.js';
import { arbreDe, groupeDe, type DessinSvg } from '../engine/editionSvg.js';
import { nombre } from '../util/i18n.js';

/** « Découpe créée : la forme du dessus découpe 2 éléments. » ; `autres` sont les noeuds decoupes, lus dans le dessin d'avant. */
export const phraseDecoupeCreee = (avant: DessinSvg, autres: readonly string[]): string =>
  'Découpe créée : la forme du dessus découpe ' + elementsDits(avant, autres) + '.';

/** « Découpe libérée : la forme revient au premier plan du groupe, sans fond, d'un trait noir. » */
export const phraseDecoupeLiberee = (n: number): string =>
  'Découpe libérée : ' + (n > 1 ? n + ' formes reviennent' : 'la forme revient') + ' au premier plan du groupe, sans fond, d’un trait noir.';

/** « Masque créé : l'élément du dessus masque 2 éléments. » */
export const phraseMasqueCree = (avant: DessinSvg, autres: readonly string[]): string =>
  'Masque créé : l’élément du dessus masque ' + elementsDits(avant, autres) + ' ; le clair laisse voir, le sombre cache.';

export const PHRASE_MASQUE_INVERSE = 'Masque inversé : ce qui était caché se voit, ce qui se voyait est caché.';

/** « Masque libéré : 2 éléments reviennent au premier plan du groupe. » */
export const phraseMasqueLibere = (n: number): string =>
  'Masque libéré : ' + (n > 1 ? pluriel(n, 'élément') + ' reviennent' : 'son élément revient') + ' au premier plan du groupe.';

/** Les raisons d'une commande grisee (son infobulle). */
export const RAISONS_CONTENUS = {
  deux: 'Choisissez au moins deux éléments : celui du dessus découpe ou masque les autres.',
  decoupe: 'Choisissez un groupe découpé (ou un élément qu’il contient).',
  masque: 'Choisissez un groupe masqué (ou un élément qu’il contient).'
} as const;

// ---------------------------------------------------------------- modifier une decoupe ou un masque (paquet 8-D)

/** Le nom du contenu, tel que le fil d'Ariane le montre : « Découpe », « Masque ». */
export const nomContenu = (genre: 'decoupe' | 'masque'): string => (genre === 'decoupe' ? 'Découpe' : 'Masque');

/** « la découpe du groupe « Nuage » », « le masque du groupe 3 » ; le groupe lu dans le dessin complet. */
function contenuDit(complet: DessinSvg, groupe: string, genre: 'decoupe' | 'masque'): string {
  const g = groupeDe(complet, groupe), du = g ? ' du ' + groupeDit(g) : '';
  return (genre === 'decoupe' ? 'la découpe' : 'le masque') + du;
}

/**
 * « Dans la découpe du groupe « Nuage », 1 forme, tracée en contour ; le reste est estompé. Échap ou Maj+Entrée en sort. » ; `vue` est le
 * dessin de travail du contenu.
 */
export function phraseEntreeContenu(complet: DessinSvg, groupe: string, genre: 'decoupe' | 'masque', vue: DessinSvg): string {
  const n = arbreDe(vue).racine.length, quoi = contenuDit(complet, groupe, genre);
  const comment = genre === 'decoupe' ? ', tracée' + (n > 1 ? 's' : '') + ' en contour : seule la forme compte' : ' : le clair laisse voir, le sombre cache';
  return 'Dans ' + quoi + ', ' + elementsDits(vue, arbreDe(vue).racine.map(x => (x.genre === 'feuille' ? x.forme.id : x.groupe.id))) + comment + ' ; le reste est estompé. Échap ou Maj+Entrée en sort.';
}

/** « Découpe reposée. Dans le groupe « Nuage », 2 éléments. » : la sortie, et le niveau ou l'on arrive (le groupe). */
export const phraseSortieContenu = (complet: DessinSvg, groupe: string, genre: 'decoupe' | 'masque'): string =>
  (genre === 'decoupe' ? 'Découpe reposée.' : 'Masque reposé.') + ' ' + (phraseEntreeGroupe(complet, groupe) ?? '');

/** « De retour dans la découpe du groupe « Nuage ». » : on sort d'un groupe du contenu, jusqu'a sa racine. */
export const phraseRacineContenu = (complet: DessinSvg, groupe: string, genre: 'decoupe' | 'masque'): string =>
  'De retour dans ' + contenuDit(complet, groupe, genre) + '.';

/** Un contenu vide ne se repose pas : il cacherait tout le groupe. On reste dedans, et on dit les trois issues. */
export const phraseContenuVide = (genre: 'decoupe' | 'masque'): string => genre === 'decoupe'
  ? 'La découpe est vide : elle cacherait tout le groupe. Dessinez la forme qui découpe, annulez (Ctrl+Z), ou choisissez « Libérer la découpe » (menu Édition).'
  : 'Le masque est vide : il cacherait tout le groupe. Dessinez ce qui laisse voir, annulez (Ctrl+Z), ou choisissez « Libérer le masque » (menu Édition).';

/** Les raisons de ce qui ne passe pas par la lentille (infobulles, refus dits). */
export const RAISONS_LENTILLE = {
  dejaDedans: 'Sortez d’abord de la découpe ou du masque (Échap) : on n’en modifie qu’un à la fois.',
  texte: 'Le texte ne se pose pas dans une découpe ou un masque : écrivez-le dans le dessin, puis faites-en la découpe ou le masque.',
  decoupe: 'Une découpe ne garde que la géométrie : ni masque, ni effets, ni image n’y entrent.',
  peinture: 'Dans une découpe, seule la forme compte : ni le fond, ni le contour, ni l’opacité, ni les effets ne s’y appliquent. Les trous, eux, découpent.',
  plan: 'Le plan de travail se règle hors de la découpe ou du masque (Échap).',
  autreContenu: 'Cette commande vise l’autre contenu du groupe : sortez d’abord (Échap).',
  modifierDecoupe: 'Choisissez un groupe découpé (ou un élément qu’il contient) pour modifier sa découpe.',
  modifierMasque: 'Choisissez un groupe masqué (ou un élément qu’il contient) pour modifier son masque.'
} as const;

// ---------------------------------------------------------------- effets

/** « Flou : écart 2. », « Flou retiré. » */
export const phraseFlou = (ecart: number | null): string => (ecart === null ? 'Flou retiré.' : 'Flou : écart ' + nombreDit(ecart) + '.');

/** « Ombre portée posée. », « Ombre portée retirée. » */
export const phraseOmbre = (posee: boolean): string => (posee ? 'Ombre portée posée : elle ne tourne pas avec la forme.' : 'Ombre portée retirée.');

/** Un nombre tel qu'on le dit : au millieme, a la francaise. */
export const nombreDit = (v: number): string => nombre(Math.round(v * 1000) / 1000);

// ---------------------------------------------------------------- images

/** « Image insérée : 640 × 480 pixels, au centre de la vue. » ; `reduite` : elle a ete ramenee a la taille du plan. */
export const phraseImageInseree = (l: number, h: number, reduite: boolean): string =>
  'Image insérée : ' + nombre(l) + ' × ' + nombre(h) + ' pixels, au centre de la vue'
  + (reduite ? ', réduite pour tenir dans le plan' : '') + '. Déplacez-la, tournez-la ou redimensionnez-la.';

/** Le refus d'une image (une phrase de la lecture : « une image trop grande (plus de 4 Mo) ») devient une phrase entiere. */
export const phraseImageRefusee = (refus: string): string => 'Cette image n’est pas insérée : ' + refus + '.';

export const PHRASE_DEPOT_PAS_IMAGE = 'Seules les images PNG, JPEG, GIF ou WebP se déposent sur la toile ; ouvrez un SVG ou un PDF depuis l’accueil.';
