// Les options d'export que partagent les formats, et la facon dont chacun les lit. Ce que la personne regle
// dans l'interface (une unite, une taille, une resolution…) devient ici les options propres a chaque
// writer ; rien n'est stocke, c'est l'etat d'une session. Pur.

import { largeurPixels, PX_PAR_POUCE, tailleValide, type Taille, type Unite } from './dimensions.js';
import type { OptionsEps } from './eps.js';
import type { OptionsDxf } from './dxf.js';
import type { OptionsPdf } from './pdfPage.js';
import type { OptionsSvg } from './svgs.js';

export type PageExport = 'dessin' | 'A4' | 'A3' | 'Letter' | 'perso';
export const PAGES_EXPORT: readonly PageExport[] = ['dessin', 'A4', 'A3', 'Letter', 'perso'];

/** Les resolutions proposees pour un PNG, en points par pouce. */
export const DPI_CHOIX: readonly number[] = [72, 150, 300, 600];
/** Les largeurs de PNG proposees, en pixels (celles d'avant les options). */
export const LARGEURS_PNG: readonly number[] = [512, 1024, 2048, 4096];
/** Les decimales proposees pour les coordonnees d'un SVG. */
export const PRECISIONS: readonly number[] = [1, 2, 3, 4];
/** Au-dela, les navigateurs refusent le canevas (16 384 px de cote, 268 millions de pixels au plus). */
export const LARGEUR_RASTER_MAX = 16384;
/** Le fond perdu usuel des imprimeurs, en millimetres. */
export const FOND_PERDU_DEFAUT = 3;

export interface OptionsExport {
  readonly unite: Unite;
  /** La largeur voulue du dessin dans `unite` ; null : la taille du dessin. */
  readonly largeur: number | null;
  /** La resolution ecrite dans un PNG ; null : aucune. */
  readonly dpi: number | null;
  readonly page: PageExport;
  readonly pageLargeur: number;
  readonly pageHauteur: number;
  readonly marge: number;
  readonly fondPerdu: boolean;
  readonly fondPerduMm: number;
  readonly cmjn: boolean;
  readonly precision: number;
  readonly optimise: boolean;
  /** Le fond d'un JPEG, qui n'a pas d'alpha. */
  readonly fond: string;
  /** La qualite d'un JPEG ou d'un WebP, de 1 a 100. */
  readonly qualite: number;
  /** Le titre ecrit dans un PDF ou un EPS ; vide : aucun (le fichier garde les octets d'avant). */
  readonly titre: string;
}

/** Les options de depart : toutes neutres, de sorte que chaque export rende ce qu'il rendait avant elles. */
export const OPTIONS_EXPORT_DEFAUT: OptionsExport = {
  unite: 'px', largeur: null, dpi: null, page: 'dessin', pageLargeur: 210, pageHauteur: 297, marge: 0,
  fondPerdu: false, fondPerduMm: FOND_PERDU_DEFAUT, cmjn: false, precision: 3, optimise: false, fond: '#ffffff', qualite: 90, titre: ''
};

/** Un nombre tape par une personne : virgule ou point decimal, ou null si ce n'est pas un nombre fini. */
export function lireNombre(texte: string): number | null {
  const t = texte.trim().replace(',', '.');
  if (t === '' || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

export const tailleDe = (o: OptionsExport): Taille | null => (o.largeur === null ? null : tailleValide({ largeur: o.largeur, unite: o.unite }));

export function optionsSvg(o: OptionsExport): OptionsSvg {
  return { precision: o.precision, taille: tailleDe(o), optimise: o.optimise };
}

export function optionsPdf(o: OptionsExport): OptionsPdf {
  const page = o.page === 'perso' ? { largeur: o.pageLargeur, hauteur: o.pageHauteur } : o.page;
  return {
    cmjn: o.cmjn, page, marge: o.marge, taille: tailleDe(o),
    fondPerdu: o.fondPerdu ? o.fondPerduMm : 0, reperes: o.fondPerdu,
    ...(o.titre.trim() ? { titre: o.titre.trim() } : {})
  };
}

export function optionsDxf(o: OptionsExport): OptionsDxf {
  return { unite: o.unite, taille: tailleDe(o) };
}

export function optionsEps(o: OptionsExport): OptionsEps {
  return { taille: tailleDe(o), cmjn: o.cmjn, ...(o.titre.trim() ? { titre: o.titre.trim() } : {}) };
}

/**
 * La largeur en pixels d'un raster : celle du choix de largeur, sauf si une taille est donnee. En pixels, la
 * taille est la largeur ; en millimetres ou en pouces, elle se convertit a la resolution choisie (96 sans resolution).
 */
export function largeurRaster(o: OptionsExport, largeurChoisie: number): number {
  const t = tailleDe(o);
  const px = !t ? largeurChoisie : t.unite === 'px' ? Math.round(t.largeur) : largeurPixels(t, o.dpi ?? PX_PAR_POUCE);
  return Math.min(LARGEUR_RASTER_MAX, Math.max(1, px));
}
