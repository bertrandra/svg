// Les fonctions des tons directs et des degrades : types 0 (echantillonnee), 2, 3 et 4 (calculatrice PostScript), bornees.

import { describe, it, expect } from 'vitest';
import { lireFonction } from '../../../../src/engine/pdf/fonctions.js';
import { ouvrirDocument } from '../../../../src/engine/pdf/structure.js';
import { flux, inflerSync, pdfClassique } from './fabrique.js';

/** La fonction ecrite en objet 1 d'un petit document. */
function fonction(corps: string | Buffer) {
  const doc = ouvrirDocument(pdfClassique([corps]), inflerSync);
  return lireFonction(doc, { t: 'ref', n: 1, g: 0 });
}
const calc = (programme: string, domaine = '[0 1]', plage = '[0 1 0 1 0 1 0 1]') => fonction(flux('<< /FunctionType 4 /Domain ' + domaine + ' /Range ' + plage + ' >>', programme));
const proche = (r: number[] | null | undefined) => r?.map(v => Math.round(v * 1000) / 1000);

describe('les fonctions', () => {
  it('type 2 : C0 + x^N (C1 - C0), entree bornee au domaine', () => {
    const f = fonction('<< /FunctionType 2 /Domain [0 1] /C0 [0 1] /C1 [1 0] /N 2 >>');
    expect(proche(f?.([0.5]))).toEqual([0.25, 0.75]);
    expect(proche(f?.([7]))).toEqual([1, 0]);
  });

  it('type 3 : choisit le morceau par ses bornes et y projette l entree', () => {
    const f = fonction('<< /FunctionType 3 /Domain [0 1] /Bounds [0.5] /Encode [0 1 1 0] /Functions [<< /FunctionType 2 /C0 [0] /C1 [1] /N 1 >> << /FunctionType 2 /C0 [0] /C1 [1] /N 1 >>] >>');
    expect(proche([0, 0.25, 0.5, 0.75, 1].map(x => f?.([x])?.[0] ?? -1))).toEqual([0, 0.5, 1, 0.5, 0]);
  });

  it('type 0 a une entree : interpolation lineaire des echantillons', () => {
    const f = fonction(flux('<< /FunctionType 0 /Domain [0 1] /Range [0 1 0 1] /Size [3] /BitsPerSample 8 >>', Uint8Array.from([0, 255, 255, 0, 0, 255])));
    expect(proche(f?.([0.25]))).toEqual([0.5, 0.5]);
    expect(proche(f?.([1]))).toEqual([0, 1]);
  });

  it('type 4 : arithmetique, pile, comparaisons, if et ifelse', () => {
    expect(proche(calc('{ dup 0.5 mul exch 1 exch sub 2 copy add 3 1 roll }')?.([0.4]))).toEqual([0.8, 0.2, 0.6]);
    expect(proche(calc('{ dup 0.5 gt { pop 1 } { 2 mul } ifelse }')?.([0.3]))).toEqual([0.6]);
    expect(proche(calc('{ dup 0.5 gt { pop 1 } { 2 mul } ifelse }')?.([0.8]))).toEqual([1]);
    expect(proche(calc('{ dup 0 eq { pop 0.25 } if }')?.([0]))).toEqual([0.25]);
    expect(proche(calc('{ 3 2 bitshift 12 eq 1 index }')?.([0.5]))).toEqual([0.5, 1, 0.5]);
    expect(proche(calc('{ 90 sin 0 cos add 2 div abs neg abs 1 index pop }', '[0 1]')?.([0]))).toEqual([0, 1]);
  });

  it('type 4 : un programme casse, une pile qui deborde, un operateur inconnu rendent null', () => {
    expect(calc('{ dup')?.([0]) ?? null).toBeNull();
    expect(calc('{ pop pop }')?.([0]) ?? null).toBeNull();
    expect(calc('{ ' + 'dup '.repeat(200) + '}')?.([0]) ?? null).toBeNull();
    expect(calc('{ 1 quit }')?.([0]) ?? null).toBeNull();
    expect(calc('{ ' + '1 pop '.repeat(6000) + '}')?.([0]) ?? null).toBeNull();
  });

  it('un tableau de fonctions a une sortie se lit comme une seule ; une fonction inconnue rend null', () => {
    const doc = ouvrirDocument(pdfClassique(['<< /FunctionType 2 /C0 [0] /C1 [1] /N 1 >>', '<< /FunctionType 2 /C0 [1] /C1 [0] /N 1 >>', '[1 0 R 2 0 R]', '<< /FunctionType 9 >>']), inflerSync);
    expect(proche(lireFonction(doc, { t: 'ref', n: 3, g: 0 })?.([0.25]))).toEqual([0.25, 0.75]);
    expect(lireFonction(doc, { t: 'ref', n: 4, g: 0 })).toBeNull();
  });
});
