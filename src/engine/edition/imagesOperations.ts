// Inserer une image dans le dessin (ADR-0012, etape 8 ; reste de l'etape 12) : les octets d'un PNG, JPEG, GIF ou WebP, deja mis en
// `data:` base64 par l'appelant (la lecture du fichier vit dans `io`), deviennent une feuille image. Ils sont verifies comme a la
// lecture d'un SVG (`verifierDonneesImage` : nature et dimensions sur les octets, 4 Mo, 64 millions de pixels) et le dessin entier
// garde ses 16 Mo d'images, contenus des masques compris. L'image se pose a sa taille naturelle (un pixel, une unite du plan), reduite
// pour tenir dans le plan, centree sur le point donne (le centre de la vue), ramene dans le plan. Pur.

import type { DessinSvg, Forme, ImageIntegree } from './types.js';
import { parcourirContenus } from './arbre.js';
import { ajouterForme } from './formes.js';
import { IMAGES_OCTETS_MAX, MSG_IMAGE_PETITE, MSG_IMAGES_LOURDES, rectangleImage, verifierDonneesImage, type DonneesVerifiees } from './fonctions/images.js';
import { t } from '../../util/i18n.js';

/** Les octets d'une image `data:…;base64,…` d'apres la longueur de son base64 (sans le decoder). */
function octetsDe(donnees: string): number {
  const b64 = donnees.slice(donnees.indexOf(',') + 1);
  const bourrage = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor(b64.length * 3 / 4) - bourrage;
}

/** Les octets de toutes les images d'un dessin, celles des contenus imbriques (masques, tuiles) comprises. */
export function octetsImages(d: DessinSvg): number {
  let n = 0;
  parcourirContenus(d, c => { for (const f of c.formes) if (f.image) n += octetsDe(f.image.donnees); });
  return n;
}

/** Le cadre d'une image de `l` x `h` pixels : a sa taille, reduite pour tenir dans le plan, centree sur `centre` ramene dans le plan. */
export function cadreImage(vb: DessinSvg['vb'], l: number, h: number, centre: { readonly x: number; readonly y: number }): { x: number; y: number; l: number; h: number } {
  const [vx, vy, vl, vh] = vb;
  const k = Math.min(1, vl / l, vh / h);
  const il = l * k, ih = h * k;
  const borne = (v: number, min: number, max: number) => (min > max ? (min + max) / 2 : Math.min(max, Math.max(min, v)));
  const cx = borne(centre.x, vx + il / 2, vx + vl - il / 2), cy = borne(centre.y, vy + ih / 2, vy + vh - ih / 2);
  // Au millieme : ce que l'ecriture garde a la precision 3, pour que la feuille posee soit deja celle que la relecture rendra.
  const m = (v: number) => Math.round(v * 1000) / 1000;
  return { x: m(cx - il / 2), y: m(cy - ih / 2), l: m(il), h: m(ih) };
}

/**
 * Insere une image : `donnees` est une adresse `data:image/…;base64,…` ; `parent`, le groupe du contexte d'edition (l'image s'y pose
 * au premier plan), absent a la racine. Rend le dessin, l'identifiant de la feuille et ce que la verification a dit (un type annonce
 * corrige d'apres les octets), ou le refus nomme (la phrase de la lecture : « une image trop grande (plus de 4 Mo) »…).
 */
export function insererImage(d: DessinSvg, donnees: string, centre: { readonly x: number; readonly y: number }, parent?: string):
  { readonly dessin: DessinSvg; readonly id: string; readonly verifiee: DonneesVerifiees } | { readonly refus: string } {
  const v = verifierDonneesImage(donnees);
  if ('refus' in v) return v;
  if (octetsImages(d) + v.octets > IMAGES_OCTETS_MAX) return { refus: t(MSG_IMAGES_LOURDES) };
  const image: ImageIntegree = { donnees: v.donnees, ...cadreImage(d.vb, v.l, v.h, centre) };
  if (!(image.l > 0) || !(image.h > 0)) return { refus: t(MSG_IMAGE_PETITE) };
  // La forme passe par `ajouterForme` (son numero, sa place dans le groupe du contexte), puis devient la feuille image.
  const r = ajouterForme(d, rectangleImage(image), { remplissage: null, contour: null, epaisseur: 0 }, 'nonzero', parent);
  if (r.id === null) return { refus: t(MSG_IMAGE_PETITE) };
  const id = r.id;
  const formes = r.dessin.formes.map((f): Forme => (f.id === id ? { ...f, remplissage: null, contour: null, epaisseur: 0, image } : f));
  return { dessin: { ...r.dessin, formes }, id, verifiee: v };
}
