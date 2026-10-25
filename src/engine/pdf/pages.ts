// L'arbre des pages (ISO 32000-1, 7.7.3) : Root, puis Pages, puis Kids, jusqu'aux feuilles. MediaBox, CropBox, Rotate et
// Resources s'heritent d'un noeud a ses enfants. L'arbre vient d'un inconnu : un cycle, une profondeur ou un nombre de pages
// demesures sont des refus nommes, jamais une boucle.

import { LIMITES_PDF, RefusPdf, SyntaxePdf, enFrancais } from './limites.js';
import { estDict, estNombre, estRef, estTableau, type Dict, type ObjetPdf } from './objets.js';
import type { DocumentPdf } from './structure.js';

/** Une boite [x0, y0, x1, y1], x0 <= x1 et y0 <= y1, en points. */
export type Boite4 = readonly [number, number, number, number];

export interface PagePdf {
  readonly dict: Dict;
  /** La boite visible : CropBox ramenee dans MediaBox, a defaut MediaBox. */
  readonly boite: Boite4;
  readonly rotation: 0 | 90 | 180 | 270;
  readonly ressources: Dict | null;
}

/** Le format Letter, que les lecteurs courants prennent quand une page n'a aucune MediaBox (elle est pourtant obligatoire). */
const LETTER: Boite4 = [0, 0, 612, 792];

interface Herite { media: ObjetPdf; crop: ObjetPdf; rotation: ObjetPdf; ressources: ObjetPdf }

/** Toutes les pages du document, dans l'ordre. */
export function listerPages(doc: DocumentPdf): PagePdf[] {
  const catalogue = doc.resoudre(doc.trailer.get('Root'));
  if (!estDict(catalogue)) throw new RefusPdf('Ce PDF ne se lit pas : son catalogue est introuvable.');
  const racine = catalogue.get('Pages');
  const pages: PagePdf[] = [];
  const vus = new Set<number>();
  const visiter = (o: ObjetPdf | undefined, h: Herite, profondeur: number): void => {
    if (profondeur > LIMITES_PDF.profondeurPages) throw new RefusPdf('Ce PDF a un arbre de pages trop profond (plus de ' + LIMITES_PDF.profondeurPages + ' niveaux) : il ne se lit pas ici.');
    if (estRef(o)) { if (vus.has(o.n)) throw new SyntaxePdf('un arbre de pages en boucle'); vus.add(o.n); }
    const d = doc.resoudre(o);
    if (!estDict(d)) return;
    const ici: Herite = {
      media: d.get('MediaBox') ?? h.media, crop: d.get('CropBox') ?? h.crop,
      rotation: d.get('Rotate') ?? h.rotation, ressources: d.get('Resources') ?? h.ressources
    };
    const enfants = doc.resoudre(d.get('Kids'));
    if (d.get('Type') === 'Pages' || (d.get('Type') !== 'Page' && estTableau(enfants))) {
      if (estTableau(enfants)) for (const k of enfants) visiter(k, ici, profondeur + 1);
      return;
    }
    if (pages.length >= LIMITES_PDF.pages) throw new RefusPdf('Ce PDF compte plus de ' + enFrancais(LIMITES_PDF.pages) + ' pages : il ne se lit pas ici.');
    pages.push(page(doc, d, ici));
  };
  visiter(racine, { media: null, crop: null, rotation: null, ressources: null }, 0);
  return pages;
}

function page(doc: DocumentPdf, d: Dict, h: Herite): PagePdf {
  const media = boite(doc, h.media) ?? LETTER;
  const crop = boite(doc, h.crop);
  // La CropBox est ramenee dans la MediaBox (14.11.2) ; une intersection vide garde la MediaBox.
  const inter: Boite4 | null = crop ? [Math.max(crop[0], media[0]), Math.max(crop[1], media[1]), Math.min(crop[2], media[2]), Math.min(crop[3], media[3])] : null;
  const r = doc.resoudre(h.rotation);
  const quart = estNombre(r) && Number.isInteger(r) && r % 90 === 0 ? (((r % 360) + 360) % 360) as 0 | 90 | 180 | 270 : 0;
  const ressources = doc.resoudre(h.ressources);
  return { dict: d, boite: inter && inter[2] > inter[0] && inter[3] > inter[1] ? inter : media, rotation: quart, ressources: estDict(ressources) ? ressources : null };
}

/** Une boite lue d'un tableau de quatre nombres, remise dans l'ordre ; null si elle ne se lit pas. */
export function boite(doc: DocumentPdf, o: ObjetPdf | undefined): Boite4 | null {
  const t = doc.resoudre(o);
  if (!estTableau(t) || t.length < 4) return null;
  const v = t.slice(0, 4).map(x => doc.resoudre(x));
  if (!v.every(estNombre)) return null;
  const [a, b, c, e] = v as [number, number, number, number];
  return [Math.min(a, c), Math.min(b, e), Math.max(a, c), Math.max(b, e)];
}
