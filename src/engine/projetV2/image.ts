// L'image integree entre le modele et le projet JSON (ADR-0030, ADR-0012 etape 12), dans les deux sens. L'aller-retour est exact :
// chaque nombre garde sa pleine precision (JSON porte les doubles tels quels), un champ facultatif reste absent quand il l'etait.
// Au retour, les octets se verifient comme a la lecture d'un SVG (`verifierDonneesImage` : nature, dimensions, pixels, 4 Mo par
// image, 16 Mo par dessin), et `d` redevient exactement le rectangle de l'image. Branche par une ligne du cadre des champs v2
// (engine/projetV2/champs.ts). Pur.

import type { ImageIntegreeProjet } from '../../model/projetV2/image.js';
import { IMAGES_OCTETS_MAX, rectangleImage, verifierDonneesImage, type Chemin, type ImageIntegree } from '../editionSvg.js';
import { t } from '../../util/i18n.js';

/** L'image telle que le projet la garde, dans l'ordre de ses champs. */
export function imageProjet(img: ImageIntegree): ImageIntegreeProjet {
  const m = img.matrice;
  return {
    donnees: img.donnees, x: img.x, y: img.y, l: img.l, h: img.h,
    ...(m ? { matrice: [m[0], m[1], m[2], m[3], m[4], m[5]] as const } : {}),
    ...(img.aspect !== undefined ? { aspect: img.aspect } : {})
  };
}

/** L'image d'un projet deja valide dans sa forme (model/projetV2/image.ts), ses octets verifies, et le `d` de sa feuille. */
export function imageDuProjet(p: ImageIntegreeProjet): { readonly image: ImageIntegree; readonly d: Chemin; readonly octets: number } | { readonly erreur: string } {
  const v = verifierDonneesImage(p.donnees);
  if ('refus' in v) return { erreur: t('Ce projet contient {refus}.', { refus: v.refus }) };
  // Les donnees d'un projet sont celles que l'editeur a ecrites : le type d'apres les octets, sans blanc. Autre chose n'en vient pas.
  if (v.donnees !== p.donnees) return { erreur: t('Ce projet contient une image dont le type annoncé ne correspond pas à son contenu.') };
  const image: ImageIntegree = {
    donnees: p.donnees, x: p.x, y: p.y, l: p.l, h: p.h,
    ...(p.matrice ? { matrice: [p.matrice[0], p.matrice[1], p.matrice[2], p.matrice[3], p.matrice[4], p.matrice[5]] as const } : {}),
    ...(p.aspect !== undefined ? { aspect: p.aspect } : {})
  };
  return { image, d: rectangleImage(image), octets: v.octets };
}

/** La borne de toutes les images d'un dessin de projet, comme a la lecture d'un SVG ; null quand elle tient. */
export function refusImagesProjet(images: readonly { readonly octets: number }[]): string | null {
  return images.reduce((s, i) => s + i.octets, 0) > IMAGES_OCTETS_MAX ? t('Ce projet contient des images trop lourdes (plus de 16 Mo en tout).') : null;
}
