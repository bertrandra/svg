// Le PDF d'un dessin, tel que l'editeur le remet (ADR-0012, etape 13a) : la descente pour le PDF (`aplatirPour`), puis, s'il reste une
// scene native, ses flux PNG decompresses par le navigateur (DecompressionStream, asynchrone : `decompresserZlib`), ses images
// preparees et le fichier ecrit — le tout pur sauf la decompression, injectee. Un dessin plat ne passe par rien de cela : ses octets
// sont ceux d'avant. Ne leve pas : une image dont le flux ne se decompresse pas est perdue, et dite.

import type { DessinSvg } from '../engine/editionSvg.js';
import { aplatirPour } from '../engine/aplatir.js';
import type { ResultatDecompression } from '../engine/lecturePdf.js';
import { CAPACITES_PDF } from '../export/capacites.js';
import { ecrirePdf, type OptionsPdf } from '../export/pdf.js';
import { aDecompresser, preparerImagesPdf } from '../export/pdfImages.js';
import { decompresserZlib } from './pdf.js';

export interface PdfEcrit {
  readonly octets: Uint8Array;
  /** Ce qui est approche ou perdu, pour `phrasePertes(pertes, perdus)`. */
  readonly pertes: readonly string[];
  readonly perdus: readonly string[];
}

export async function pdfDuDessin(d: DessinSvg, options: OptionsPdf, decompresser: (brut: Uint8Array, max: number) => Promise<ResultatDecompression> = decompresserZlib): Promise<PdfEcrit> {
  const r = aplatirPour(d, CAPACITES_PDF);
  if (!r.scene) return { octets: ecrirePdf(r.dessin, options), pertes: r.pertes, perdus: r.perdus };
  const decompresses = new Map<string, Uint8Array>();
  for (const f of aDecompresser(r.scene)) {
    const x = await decompresser(f.flux, f.max).catch(() => 'illisible' as const);
    if (x instanceof Uint8Array) decompresses.set(f.donnees, x);
  }
  const images = preparerImagesPdf(r.scene, decompresses, options.cmjn === true);
  return {
    octets: ecrirePdf(r.dessin, options, { scene: r.scene, images }),
    pertes: [...r.pertes, ...images.pertes.filter(p => !r.pertes.includes(p))],
    perdus: [...r.perdus, ...images.perdus.filter(p => !r.perdus.includes(p))]
  };
}
