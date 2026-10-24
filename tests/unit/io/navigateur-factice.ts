// Le minimum de navigateur dont io/ a besoin pour tourner sous Node : un canevas qui garde ses
// pixels en memoire (putImageData, getImageData, drawImage par plus proche voisin, toDataURL qui
// rend les octets RGBA en base64, pour qu'un test les relise), une classe ImageData et une classe
// Image. Rien de plus : le rendu reel (decodage PNG, lissage, anticrenelage) reste l'affaire d'un
// vrai navigateur ; ce qu'on teste ici, c'est la logique de io/, pas le canevas.

import { vi } from 'vitest';

export class ImageDataFausse {
  constructor(readonly data: Uint8ClampedArray, readonly width: number, readonly height: number) {}
}

/** Une image deja decodee, a dessiner dans un canevas : un aplat de la couleur donnee. */
export interface DecodageFaux { largeur: number; hauteur: number; erreur?: boolean; couleur?: readonly [number, number, number, number] }

export class ToileFausse {
  pixels = new Uint8ClampedArray(300 * 150 * 4);
  /** Ce que le test a fait dessiner avec drawImage depuis une image. */
  dessins: Array<{ l: number; h: number }> = [];
  /** Vrai pour faire echouer toBlob, comme un navigateur qui refuse le rendu. */
  refuseBlob = false;
  private l = 300;
  private h = 150;

  // Comme un vrai canevas, changer une dimension remet le fond a zero.
  get width(): number { return this.l; }
  set width(v: number) { this.l = v; this.pixels = new Uint8ClampedArray(this.l * this.h * 4); }
  get height(): number { return this.h; }
  set height(v: number) { this.h = v; this.pixels = new Uint8ClampedArray(this.l * this.h * 4); }

  getContext(): ContexteFaux { return new ContexteFaux(this); }

  toDataURL(type = 'image/png'): string { return 'data:' + type + ';base64,' + Buffer.from(this.pixels).toString('base64'); }

  toBlob(rappel: (b: Blob | null) => void, type = 'image/png'): void {
    rappel(this.refuseBlob ? null : new Blob([this.pixels], { type }));
  }
}

class ContexteFaux {
  constructor(private readonly toile: ToileFausse) {}

  putImageData(img: ImageDataFausse): void {
    if (img.data.length !== this.toile.pixels.length) throw new Error('putImageData : ' + img.data.length + ' octets pour une toile de ' + this.toile.pixels.length);
    this.toile.pixels.set(img.data);
  }

  getImageData(x: number, y: number, l: number, h: number): ImageDataFausse {
    if (x !== 0 || y !== 0 || l !== this.toile.width || h !== this.toile.height) throw new Error('getImageData : seule la toile entiere est simulee');
    return new ImageDataFausse(new Uint8ClampedArray(this.toile.pixels), l, h);
  }

  drawImage(source: ToileFausse | { couleur: readonly number[] }, x: number, y: number, l: number, h: number): void {
    if (x !== 0 || y !== 0 || l !== this.toile.width || h !== this.toile.height) throw new Error('drawImage : seul le plein cadre est simule');
    if (source instanceof ToileFausse) {
      // Plus proche voisin : assez pour reduire une toile, sans lissage a deviner.
      for (let j = 0; j < h; j++) for (let i = 0; i < l; i++) {
        const si = Math.min(source.width - 1, Math.floor(((i + 0.5) * source.width) / l)), sj = Math.min(source.height - 1, Math.floor(((j + 0.5) * source.height) / h));
        this.toile.pixels.set(source.pixels.subarray((sj * source.width + si) * 4, (sj * source.width + si) * 4 + 4), (j * l + i) * 4);
      }
      return;
    }
    this.toile.dessins.push({ l, h });
    for (let k = 0; k < l * h; k++) this.toile.pixels.set(source.couleur, k * 4);
  }
}

/** Installe `document.createElement('canvas')` et `ImageData` ; rend les toiles creees, dans l'ordre. */
export function installerCanvas(options: { refuseBlob?: boolean } = {}): { toiles: ToileFausse[] } {
  const toiles: ToileFausse[] = [];
  vi.stubGlobal('ImageData', ImageDataFausse);
  vi.stubGlobal('document', {
    createElement: (balise: string) => {
      if (balise !== 'canvas') throw new Error('createElement(' + balise + ') n\'est pas simule');
      const t = new ToileFausse();
      t.refuseBlob = options.refuseBlob ?? false;
      toiles.push(t);
      return t;
    }
  });
  return { toiles };
}

/** Installe une classe `Image` dont le decodage reussit (ou echoue) tout de suite, aux dimensions donnees. */
export function installerImage(decodage: DecodageFaux): void {
  class ImageFausse {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = decodage.largeur;
    naturalHeight = decodage.hauteur;
    couleur: readonly [number, number, number, number] = decodage.couleur ?? [200, 30, 40, 255];
    set src(_url: string) { queueMicrotask(() => (decodage.erreur ? this.onerror?.() : this.onload?.())); }
  }
  vi.stubGlobal('Image', ImageFausse);
}

/** Les octets RGBA qu'un `toDataURL('image/png')` de ToileFausse transporte. */
export function pixelsDeDataUrl(url: string): Uint8ClampedArray {
  const base64 = url.slice(url.indexOf(',') + 1);
  return new Uint8ClampedArray(Buffer.from(base64, 'base64'));
}

/** Une image RGBA l x h, remplie par `couleurDe(x, y)`. */
export function peindre(l: number, h: number, couleurDe: (x: number, y: number) => readonly [number, number, number, number]): Uint8ClampedArray {
  const p = new Uint8ClampedArray(l * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) p.set(couleurDe(x, y), (y * l + x) * 4);
  return p;
}
