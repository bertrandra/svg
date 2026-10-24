import { describe, it, expect } from 'vitest';
import { lireCrenageGpos } from '../../../src/io/crenageGpos.js';

// Un GPOS minimal, ecrit a la main : script latn, une feature « kern », trois lookups. Il prouve le lecteur
// sur chaque cas de la specification qu'il traite, sans dependre d'aucune fonte.

const u16 = (...v: number[]): number[] => v.flatMap(x => [(x >> 8) & 0xff, x & 0xff]);
const u32 = (v: number): number[] => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
const etiquette = (t: string): number[] => [...t].map(c => c.charCodeAt(0));
const i16 = (v: number): number => (v < 0 ? v + 65536 : v);

/** Une couverture de format 1 (liste de glyphes). */
const couverture = (...g: number[]): number[] => u16(1, g.length, ...g);

// Lookup A, sous-table 1 : format 1, couvre le glyphe 5 ; valueFormat1 = xPlacement + xAdvance (0x0005), la
// paire (5, 7) vaut placement 99, avance -30 : le lecteur doit sauter le placement.
const paire1 = (): number[] => {
  const jeu = u16(1, 7, 99, i16(-30));
  return [...u16(1, 12, 0x0005, 0, 1, 12 + 6 /* couverture (6) puis le jeu */), ...couverture(5), ...jeu];
};

// Lookup A, sous-table 2 : format 2, couvre 5 et 6 ; classes : 5 et 6 -> 1 (cote gauche), 7 -> 1 (cote droit).
const paire2 = (): number[] => {
  const cov = couverture(5, 6), cd1 = u16(2, 1, 5, 6, 1), cd2 = u16(2, 1, 7, 7, 1);
  const enTete = 16, o1 = enTete + 8 /* 2 x 2 enregistrements de 1 mot */;
  const records = u16(0, 0, 0, i16(-50));
  return [...u16(2, o1, 0x0004, 0, o1 + cov.length, o1 + cov.length + cd1.length, 2, 2), ...records, ...cov, ...cd1, ...cd2];
};

/** Un lookup de type 2 (sous-tables directes) ou 9 (chacune a travers une extension de format 1). */
function lookup(type: 2 | 9, sousTables: number[][]): number[] {
  const tete = 6 + sousTables.length * 2;
  let o = tete;
  const offsets: number[] = [];
  const corps: number[] = [];
  for (const s of sousTables) {
    offsets.push(o);
    const bloc = type === 9 ? [...u16(1, 2), ...u32(8), ...s] : s;
    corps.push(...bloc);
    o += bloc.length;
  }
  return [...u16(type, 0, sousTables.length, ...offsets), ...corps];
}

function gpos(lookups: number[][], featureIndexes = lookups.map((_, i) => i)): ArrayBuffer {
  const script = [...u16(4, 0), ...u16(0, 0xffff, 1, 0)];
  const scripts = [...u16(1), ...etiquette('latn'), ...u16(8), ...script];
  const feature = u16(0, featureIndexes.length, ...featureIndexes);
  const features = [...u16(1), ...etiquette('kern'), ...u16(8), ...feature];
  let o = 2 + lookups.length * 2;
  const offsets: number[] = [];
  for (const l of lookups) { offsets.push(o); o += l.length; }
  const liste = [...u16(lookups.length, ...offsets), ...lookups.flat()];
  const enTete = 10, table = [...u16(1, 0, enTete, enTete + scripts.length, enTete + scripts.length + features.length), ...scripts, ...features, ...liste];
  const sfnt = [...u32(0x00010000), ...u16(1, 0, 0, 0), ...etiquette('GPOS'), ...u32(0), ...u32(28), ...u32(table.length), ...table];
  return new Uint8Array(sfnt).buffer as ArrayBuffer;
}

// Lookup B : un seul lookup d'extension portant (9, 10) -> -20. Lookup C : (5, 7) -> +4, qui s'ajoute a A.
const paire9 = (): number[] => [...u16(1, 12, 0x0004, 0, 1, 12 + 6), ...couverture(9), ...u16(1, 10, i16(-20))];
const paireC = (): number[] => [...u16(1, 12, 0x0004, 0, 1, 12 + 6), ...couverture(5), ...u16(1, 7, 4)];

describe('lireCrenageGpos, sur un GPOS ecrit a la main', () => {
  const crenage = lireCrenageGpos(gpos([lookup(2, [paire1(), paire2()]), lookup(9, [paire9()]), lookup(2, [paireC()])]));

  it('lit une paire de format 1 en sautant le placement de la valeur', () => {
    expect(crenage).not.toBeNull();
    // -30 (lookup A) + 4 (lookup C) : plusieurs lookups « kern » s'additionnent.
    expect(crenage?.(5, 7)).toBe(-26);
  });

  it('lit un crenage par classes (format 2) quand le format 1 ne dit rien de la paire', () => {
    expect(crenage?.(6, 7)).toBe(-50);
  });

  it('prend la sous-table qui couvre le glyphe meme quand sa valeur est nulle (format 2), sans chercher plus loin', () => {
    expect(crenage?.(5, 8)).toBe(0);
  });

  it('lit un lookup d extension (type 9), que opentype.js 2.0 ne sait pas lire', () => {
    expect(crenage?.(9, 10)).toBe(-20);
  });

  it('rend 0 pour une paire inconnue, et le meme nombre a chaque appel', () => {
    expect(crenage?.(1, 2)).toBe(0);
    expect(crenage?.(9, 10)).toBe(crenage?.(9, 10));
  });

  it('ne retient que les lookups nommes par la feature kern', () => {
    const seulA = lireCrenageGpos(gpos([lookup(2, [paire1(), paire2()]), lookup(9, [paire9()]), lookup(2, [paireC()])], [0]));
    expect(seulA?.(5, 7)).toBe(-30);
    expect(seulA?.(9, 10)).toBe(0);
  });
});

describe('lireCrenageGpos, sur ce qui n est pas lisible', () => {
  it('rend null pour des octets qui ne sont pas une fonte, ou une fonte sans GPOS', () => {
    expect(lireCrenageGpos(new ArrayBuffer(0))).toBeNull();
    expect(lireCrenageGpos(new TextEncoder().encode('ceci n est pas une fonte').buffer as ArrayBuffer)).toBeNull();
    expect(lireCrenageGpos(new Uint8Array([...u32(0x00010000), ...u16(0, 0, 0, 0)]).buffer as ArrayBuffer)).toBeNull();
  });

  it('rend null, sans lever, pour un GPOS tronque', () => {
    const entier = new Uint8Array(gpos([lookup(2, [paire1()])]));
    expect(lireCrenageGpos(entier.slice(0, 40).buffer as ArrayBuffer)).toBeNull();
  });
});
