// Ce que l'editeur dit des decoupes, des masques, des effets et des images inserees (ADR-0012, etape 8 ; annexe 6 §3, §6 et §7) : les
// phrases entieres que la region vocale dit apres une commande, et les raisons d'une commande grisee. Les refus du moteur
// (`MSG_DECOUPE`, `MSG_MASQUE`) sont deja des phrases au vouvoiement : ils se disent tels quels.
//
// Les raisons sont des accesseurs : le dictionnaire de la langue est pose apres le chargement des modules (ADR-0042), le texte se
// traduit donc a la lecture, pas a l'import.

import { pluriel } from '../util/texte.js';
import { elementsDits, groupeDit, phraseEntreeGroupe } from './phrasesGroupes.js';
import { arbreDe, groupeDe, type DessinSvg } from '../engine/editionSvg.js';
import { nombre, t } from '../util/i18n.js';

/** « Découpe créée : la forme du dessus découpe 2 éléments. » ; `autres` sont les noeuds decoupes, lus dans le dessin d'avant. */
export const phraseDecoupeCreee = (avant: DessinSvg, autres: readonly string[]): string =>
  t('Découpe créée : la forme du dessus découpe {elements}.', { elements: elementsDits(avant, autres) });

/** « Découpe libérée : la forme revient au premier plan du groupe, sans fond, d'un trait noir. » */
export const phraseDecoupeLiberee = (n: number): string =>
  (n > 1
    ? t('Découpe libérée : {n} formes reviennent au premier plan du groupe, sans fond, d’un trait noir.', { n })
    : t('Découpe libérée : la forme revient au premier plan du groupe, sans fond, d’un trait noir.'));

/** « Masque créé : l'élément du dessus masque 2 éléments. » */
export const phraseMasqueCree = (avant: DessinSvg, autres: readonly string[]): string =>
  t('Masque créé : l’élément du dessus masque {elements} ; le clair laisse voir, le sombre cache.', { elements: elementsDits(avant, autres) });

export const PHRASE_MASQUE_INVERSE = t('Masque inversé : ce qui était caché se voit, ce qui se voyait est caché.');

/** « Masque libéré : 2 éléments reviennent au premier plan du groupe. » */
export const phraseMasqueLibere = (n: number): string =>
  (n > 1
    ? t('Masque libéré : {elements} reviennent au premier plan du groupe.', { elements: pluriel(n, 'élément') })
    : t('Masque libéré : son élément revient au premier plan du groupe.'));

/** Les raisons d'une commande grisee (son infobulle). */
export const RAISONS_CONTENUS: Readonly<Record<'deux' | 'decoupe' | 'masque', string>> = {
  get deux() { return t('Choisissez au moins deux éléments : celui du dessus découpe ou masque les autres.'); },
  get decoupe() { return t('Choisissez un groupe découpé (ou un élément qu’il contient).'); },
  get masque() { return t('Choisissez un groupe masqué (ou un élément qu’il contient).'); }
};

// ---------------------------------------------------------------- modifier une decoupe ou un masque (paquet 8-D)

/**
 * Le nom du contenu, tel que le fil d'Ariane le montre : « Découpe », « Masque ». La decoupe prend sa capitale sur le mot de la
 * pastille (« découpe », un clip) : « Découpe » tout court est le nom du procede de la machine (model/contextes.ts), un autre mot ailleurs.
 */
export const nomContenu = (genre: 'decoupe' | 'masque'): string => {
  if (genre === 'masque') return t('Masque');
  const mot = t('découpe');
  return mot.charAt(0).toUpperCase() + mot.slice(1);
};

/** « la découpe du groupe « Nuage » », « le masque du groupe 3 » ; le groupe lu dans le dessin complet. */
function contenuDit(complet: DessinSvg, groupe: string, genre: 'decoupe' | 'masque'): string {
  const g = groupeDe(complet, groupe);
  if (genre === 'decoupe') return g ? t('la découpe du {groupe}', { groupe: groupeDit(g) }) : t('la découpe');
  return g ? t('le masque du {groupe}', { groupe: groupeDit(g) }) : t('le masque');
}

/**
 * « Dans la découpe du groupe « Nuage », 1 forme, tracée en contour ; le reste est estompé. Échap ou Maj+Entrée en sort. » ; `vue` est le
 * dessin de travail du contenu.
 */
export function phraseEntreeContenu(complet: DessinSvg, groupe: string, genre: 'decoupe' | 'masque', vue: DessinSvg): string {
  const racine = arbreDe(vue).racine;
  const v = { quoi: contenuDit(complet, groupe, genre), elements: elementsDits(vue, racine.map(x => (x.genre === 'feuille' ? x.forme.id : x.groupe.id))) };
  if (genre === 'masque') return t('Dans {quoi}, {elements} : le clair laisse voir, le sombre cache ; le reste est estompé. Échap ou Maj+Entrée en sort.', v);
  return racine.length > 1
    ? t('Dans {quoi}, {elements}, tracées en contour : seule la forme compte ; le reste est estompé. Échap ou Maj+Entrée en sort.', v)
    : t('Dans {quoi}, {elements}, tracée en contour : seule la forme compte ; le reste est estompé. Échap ou Maj+Entrée en sort.', v);
}

/** « Découpe reposée. Dans le groupe « Nuage », 2 éléments. » : la sortie, et le niveau ou l'on arrive (le groupe). */
export const phraseSortieContenu = (complet: DessinSvg, groupe: string, genre: 'decoupe' | 'masque'): string =>
  (genre === 'decoupe' ? t('Découpe reposée.') : t('Masque reposé.')) + ' ' + (phraseEntreeGroupe(complet, groupe) ?? '');

/** « De retour dans la découpe du groupe « Nuage ». » : on sort d'un groupe du contenu, jusqu'a sa racine. */
export const phraseRacineContenu = (complet: DessinSvg, groupe: string, genre: 'decoupe' | 'masque'): string =>
  t('De retour dans {quoi}.', { quoi: contenuDit(complet, groupe, genre) });

/** Un contenu vide ne se repose pas : il cacherait tout le groupe. On reste dedans, et on dit les trois issues. */
export const phraseContenuVide = (genre: 'decoupe' | 'masque'): string => (genre === 'decoupe'
  ? t('La découpe est vide : elle cacherait tout le groupe. Dessinez la forme qui découpe, annulez (Ctrl+Z), ou choisissez « Libérer la découpe » (menu Édition).')
  : t('Le masque est vide : il cacherait tout le groupe. Dessinez ce qui laisse voir, annulez (Ctrl+Z), ou choisissez « Libérer le masque » (menu Édition).'));

/** Les raisons de ce qui ne passe pas par la lentille (infobulles, refus dits). */
export const RAISONS_LENTILLE: Readonly<Record<'dejaDedans' | 'texte' | 'decoupe' | 'peinture' | 'plan' | 'autreContenu' | 'modifierDecoupe' | 'modifierMasque', string>> = {
  get dejaDedans() { return t('Sortez d’abord de la découpe ou du masque (Échap) : on n’en modifie qu’un à la fois.'); },
  get texte() { return t('Le texte ne se pose pas dans une découpe ou un masque : écrivez-le dans le dessin, puis faites-en la découpe ou le masque.'); },
  get decoupe() { return t('Une découpe ne garde que la géométrie : ni masque, ni effets, ni image n’y entrent.'); },
  get peinture() { return t('Dans une découpe, seule la forme compte : ni le fond, ni le contour, ni l’opacité, ni les effets ne s’y appliquent. Les trous, eux, découpent.'); },
  get plan() { return t('Le plan de travail se règle hors de la découpe ou du masque (Échap).'); },
  get autreContenu() { return t('Cette commande vise l’autre contenu du groupe : sortez d’abord (Échap).'); },
  get modifierDecoupe() { return t('Choisissez un groupe découpé (ou un élément qu’il contient) pour modifier sa découpe.'); },
  get modifierMasque() { return t('Choisissez un groupe masqué (ou un élément qu’il contient) pour modifier son masque.'); }
};

// ---------------------------------------------------------------- effets

/** « Flou : écart 2. », « Flou retiré. » */
export const phraseFlou = (ecart: number | null): string => (ecart === null ? t('Flou retiré.') : t('Flou : écart {ecart}.', { ecart: nombreDit(ecart) }));

/** « Ombre portée posée. », « Ombre portée retirée. » */
export const phraseOmbre = (posee: boolean): string => (posee ? t('Ombre portée posée : elle ne tourne pas avec la forme.') : t('Ombre portée retirée.'));

/** Un nombre tel qu'on le dit : au millieme, dans la langue de l'interface. */
export const nombreDit = (v: number): string => nombre(Math.round(v * 1000) / 1000);

// ---------------------------------------------------------------- images

/** « Image insérée : 640 × 480 pixels, au centre de la vue. » ; `reduite` : elle a ete ramenee a la taille du plan. */
export const phraseImageInseree = (l: number, h: number, reduite: boolean): string => {
  const v = { largeur: nombre(l), hauteur: nombre(h) };
  return reduite
    ? t('Image insérée : {largeur} × {hauteur} pixels, au centre de la vue, réduite pour tenir dans le plan. Déplacez-la, tournez-la ou redimensionnez-la.', v)
    : t('Image insérée : {largeur} × {hauteur} pixels, au centre de la vue. Déplacez-la, tournez-la ou redimensionnez-la.', v);
};

/** Le refus d'une image (une phrase de la lecture : « une image trop grande (plus de 4 Mo) ») devient une phrase entiere. */
export const phraseImageRefusee = (refus: string): string => t('Cette image n’est pas insérée : {refus}.', { refus });

export const PHRASE_DEPOT_PAS_IMAGE = t('Seules les images PNG, JPEG, GIF ou WebP se déposent sur la toile ; ouvrez un SVG ou un PDF depuis l’accueil.');
