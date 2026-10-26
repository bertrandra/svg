// L'image integree d'une forme dans le projet JSON (ADR-0030, ADR-0012 etape 12) : champ pour champ `ImageIntegree` du modele, a
// pleine precision, les donnees en ligne (`data:`) dans le projet lui-meme. Un projet vient d'un fichier, d'un serveur ou d'un autre
// onglet : il ne se croit pas sur parole. Cette validation-ci porte sur la forme (types, bornes, alphabet) ; les octets eux-memes
// (nature, dimensions, pixels) se verifient a cote, dans le moteur (`engine/projetV2/image.ts`), par la fonction de la lecture d'un
// SVG. Branche par une ligne du cadre des champs v2 (model/projetV2/champs.ts).
// Pur ; ne leve jamais.

import { t } from '../../util/i18n.js';

/** Ce que le projet garde d'une image integree : les donnees, le cadre, la matrice composee et l'aspect, s'ils existent. */
export interface ImageIntegreeProjet {
  readonly donnees: string;
  readonly x: number;
  readonly y: number;
  readonly l: number;
  readonly h: number;
  readonly matrice?: readonly [number, number, number, number, number, number];
  readonly aspect?: string;
}

export const BORNES_IMAGE_PROJET = {
  /** Le texte des donnees : l'en-tete le plus long et le base64 de 4 Mo (la borne de la lecture). */
  donnees: 'data:image/jpeg;base64,'.length + Math.ceil((4 * 1024 * 1024) / 3) * 4,
  coordonnee: 1e9
} as const;

const DONNEES = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const ASPECT = /^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max))(?: slice)?$/;

const estObjet = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const fini = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

/** L'image d'une forme de projet, reconstruite dans un ordre de champs fixe, ou la raison de la refuser. */
export function lireImageProjet(v: unknown): { readonly image: ImageIntegreeProjet } | { readonly erreur: string } {
  const C = BORNES_IMAGE_PROJET.coordonnee;
  if (!estObjet(v)) return { erreur: t('l’image d’une forme n’est pas un objet') };
  const d = v['donnees'];
  if (typeof d !== 'string' || d.length > BORNES_IMAGE_PROJET.donnees) return { erreur: t('les données d’une image ne sont pas un texte de taille admise') };
  if (!DONNEES.test(d) || (d.length - d.indexOf(',') - 1) % 4 !== 0) return { erreur: t('les données d’une image ne sont pas une image PNG, JPEG, GIF ou WebP en base64') };
  const { x, y, l, h } = v;
  if (!fini(x, -C, C) || !fini(y, -C, C)) return { erreur: t('la position d’une image est hors de ses bornes') };
  if (!fini(l, 0, C) || !fini(h, 0, C) || !(l > 0 && h > 0)) return { erreur: t('la taille d’une image est hors de ses bornes') };
  const m = v['matrice'];
  let matrice: ImageIntegreeProjet['matrice'];
  if (m !== undefined) {
    if (!Array.isArray(m) || m.length !== 6 || !m.every(n => fini(n, -C, C))) return { erreur: t('la matrice d’une image n’a pas six nombres bornés') };
    const [a, b, c, e, f, g] = m as [number, number, number, number, number, number];
    if (Math.abs(a * e - b * c) < 1e-12) return { erreur: t('la matrice d’une image écrase le plan') };
    matrice = [a, b, c, e, f, g];
  }
  const aspect = v['aspect'];
  if (aspect !== undefined && (typeof aspect !== 'string' || !ASPECT.test(aspect) || aspect === 'xMidYMid')) return { erreur: t('l’aspect d’une image n’est pas une valeur admise') };
  return { image: { donnees: d, x, y, l, h, ...(matrice ? { matrice } : {}), ...(aspect !== undefined ? { aspect } : {}) } };
}
