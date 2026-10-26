// Ce que l'editeur dit des decoupes, des masques, des effets et des images inserees (ADR-0012, etape 8 ; annexe 6 §3, §6 et §7) : les
// phrases entieres que la region vocale dit apres une commande, et les raisons d'une commande grisee. Les refus du moteur
// (`MSG_DECOUPE`, `MSG_MASQUE`) sont deja des phrases au vouvoiement : ils se disent tels quels.

import { pluriel } from '../util/texte.js';
import { elementsDits } from './phrasesGroupes.js';
import type { DessinSvg } from '../engine/editionSvg.js';

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

// ---------------------------------------------------------------- effets

/** « Flou : écart 2. », « Flou retiré. » */
export const phraseFlou = (ecart: number | null): string => (ecart === null ? 'Flou retiré.' : 'Flou : écart ' + nombreDit(ecart) + '.');

/** « Ombre portée posée. », « Ombre portée retirée. » */
export const phraseOmbre = (posee: boolean): string => (posee ? 'Ombre portée posée : elle ne tourne pas avec la forme.' : 'Ombre portée retirée.');

/** Un nombre tel qu'on le dit : au millieme, a la francaise. */
export const nombreDit = (v: number): string => (Math.round(v * 1000) / 1000).toLocaleString('fr-FR');

// ---------------------------------------------------------------- images

/** « Image insérée : 640 × 480 pixels, au centre de la vue. » ; `reduite` : elle a ete ramenee a la taille du plan. */
export const phraseImageInseree = (l: number, h: number, reduite: boolean): string =>
  'Image insérée : ' + l.toLocaleString('fr-FR') + ' × ' + h.toLocaleString('fr-FR') + ' pixels, au centre de la vue'
  + (reduite ? ', réduite pour tenir dans le plan' : '') + '. Déplacez-la, tournez-la ou redimensionnez-la.';

/** Le refus d'une image (une phrase de la lecture : « une image trop grande (plus de 4 Mo) ») devient une phrase entiere. */
export const phraseImageRefusee = (refus: string): string => 'Cette image n’est pas insérée : ' + refus + '.';

export const PHRASE_DEPOT_PAS_IMAGE = 'Seules les images PNG, JPEG, GIF ou WebP se déposent sur la toile ; ouvrez un SVG ou un PDF depuis l’accueil.';
