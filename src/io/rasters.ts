// Le dessin en JPEG ou en WebP, par le canevas du navigateur : le SVG est decode comme une image, peint sur
// un fond a la taille voulue, puis encode. (Le PNG reste `versPng`, dans image.ts, intact.) Les octets que
// rend le navigateur dependent de son encodeur : ils ne sont pas stables d'un navigateur a l'autre, et le
// SVG, le PDF, l'EPS et le DXF le sont. Ce fichier est dans `io` parce qu'il touche au DOM.

import { chargerImage, toile } from './image.js';

export type FormatRaster = 'image/jpeg' | 'image/webp';

export const EXTENSIONS: Readonly<Record<FormatRaster, string>> = { 'image/jpeg': 'jpg', 'image/webp': 'webp' };

export interface OptionsRaster {
  readonly format: FormatRaster;
  /** La largeur en pixels ; la hauteur suit les proportions du dessin. */
  readonly largeur: number;
  /** La qualite de 0 a 1 (JPEG et WebP seulement). */
  readonly qualite?: number;
  /** La couleur du fond ; absente, le fond reste transparent. Un JPEG n'a pas d'alpha : il prend toujours un fond (blanc faute de mieux). */
  readonly fond?: string | null;
}

/** Le fond a peindre : celui qu'on demande, blanc pour un JPEG sans fond, rien sinon. */
export function fondDe(format: FormatRaster, fond: string | null | undefined): string | null {
  if (fond) return fond;
  return format === 'image/jpeg' ? '#ffffff' : null;
}

/** La qualite du canevas : ramenee dans [0, 1], 0,9 faute de valeur. */
export const qualiteDe = (q: number | undefined): number => (q === undefined || !Number.isFinite(q) ? 0.9 : Math.min(1, Math.max(0, q)));

/**
 * Le dessin en image. Le fichier rendu peut etre d'un autre type que celui demande si le navigateur ne sait
 * pas encoder le format (certains retombent sur le PNG pour le WebP) : l'appelant lit `type` pour le dire.
 */
export async function versRaster(svg: string, o: OptionsRaster): Promise<{ octets: Uint8Array; type: string }> {
  const img = await chargerImage(new Blob([svg], { type: 'image/svg+xml' }));
  const l = Math.max(1, Math.round(o.largeur)), h = Math.max(1, Math.round((img.naturalHeight / Math.max(1, img.naturalWidth)) * l));
  const { t, ctx } = toile(l, h);
  const fond = fondDe(o.format, o.fond);
  if (fond) { ctx.fillStyle = fond; ctx.fillRect(0, 0, l, h); }
  ctx.drawImage(img, 0, 0, l, h);
  const blob = await new Promise<Blob>((ok, ko) => t.toBlob(b => (b ? ok(b) : ko(new Error('rendu refusé'))), o.format, qualiteDe(o.qualite)));
  return { octets: new Uint8Array(await blob.arrayBuffer()), type: blob.type };
}
