// Ce que l'on emploie d'opentype.js (2.0.0), qui ne livre pas ses types : lire une fonte, et pour
// chaque caractere sa glyphe, son contour, son avance et le crenage avec la suivante.
declare module 'opentype.js' {
  export interface CommandeOpentype { type: 'M' | 'L' | 'C' | 'Q' | 'Z'; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }
  export interface Glyph { index: number; advanceWidth?: number; getPath(x: number, y: number, fontSize: number): { commands: CommandeOpentype[] } }
  export interface Font {
    unitsPerEm: number;
    ascender: number;
    descender: number;
    charToGlyph(c: string): Glyph;
    getKerningValue(left: Glyph, right: Glyph): number;
  }
  export function parse(buffer: ArrayBuffer): Font;
}
