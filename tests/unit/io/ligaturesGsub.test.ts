import { describe, it, expect } from 'vitest';
import { lireLigaturesGsub } from '../../../src/io/ligaturesGsub.js';

// Un GSUB minimal, ecrit a la main : un script, des features, des lookups de type 4 (directs ou par extension de
// type 7). Il prouve le lecteur sur chaque cas de la specification qu'il traite, sans dependre d'aucune fonte.
// Glyphes : f = 10, i = 11, l = 12 ; a = 20, e = 21 ; x = 30, y = 31, z = 32 ; ligatures = 60 et plus.

const u16 = (...v: number[]): number[] => v.flatMap(x => [(x >> 8) & 0xff, x & 0xff]);
const u32 = (v: number): number[] => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
const etiquette = (t: string): number[] => [...t].map(c => c.charCodeAt(0));

const F = 10, I = 11, L = 12, A = 20, E = 21, X = 30, Y = 31, Z = 32;

const couvertureListe = (...g: number[]): number[] => u16(1, g.length, ...g);
/** Une couverture de format 2 : des plages [debut, fin, rang du debut]. */
const couverturePlages = (...p: Array<[number, number, number]>): number[] => u16(2, p.length, ...p.flatMap(([d, f, r]) => [d, f, r]));
/** Une ligature : le glyphe qui remplace, puis les glyphes qui suivent le premier. */
const ligature = (glyphe: number, ...suite: number[]): number[] => u16(glyphe, suite.length + 1, ...suite);
const aplatir = (blocs: number[][], depart: number): { offsets: number[]; corps: number[] } => {
  const offsets: number[] = [], corps: number[] = [];
  let o = depart;
  for (const b of blocs) { offsets.push(o); corps.push(...b); o += b.length; }
  return { offsets, corps };
};
/** Un LigatureSet : ses ligatures, dans l'ordre de preference. */
const jeu = (...ligs: number[][]): number[] => { const { offsets, corps } = aplatir(ligs, 2 + ligs.length * 2); return [...u16(ligs.length, ...offsets), ...corps]; };
/** Une sous-table de type 4, format 1 : la couverture des premiers glyphes et un jeu par premier glyphe, dans l'ordre des rangs. */
const sousTable4 = (couverture: number[], ...jeux: number[][]): number[] => {
  const tete = 6 + jeux.length * 2, { offsets, corps } = aplatir(jeux, tete + couverture.length);
  return [...u16(1, tete, jeux.length, ...offsets), ...couverture, ...corps];
};

/** Un lookup d'un type donne, ses sous-tables directes ou, pour le type 7, chacune derriere une extension vers `typeEtendu`. */
function lookup(type: number, sousTables: number[][], typeEtendu = 4, drapeaux = 0): number[] {
  const tete = 6 + sousTables.length * 2;
  const blocs = type === 7 ? sousTables.map(s => [...u16(1, typeEtendu), ...u32(8), ...s]) : sousTables;
  const { offsets, corps } = aplatir(blocs, tete);
  return [...u16(type, drapeaux, sousTables.length, ...offsets), ...corps];
}

interface Options { script?: string; features: Array<[string, number[]]>; indicesDeLaLangue?: number[] }

/** Un fichier sfnt qui ne porte qu'une table GSUB. */
function gsub(lookups: number[][], { script = 'latn', features, indicesDeLaLangue = features.map((_, i) => i) }: Options): ArrayBuffer {
  const langue = u16(0, 0xffff, indicesDeLaLangue.length, ...indicesDeLaLangue);
  const scriptTable = [...u16(4, 0), ...langue];
  const scripts = [...u16(1), ...etiquette(script), ...u16(8), ...scriptTable];
  const tetes = 2 + features.length * 6;
  const caracs = aplatir(features.map(([, idx]) => u16(0, idx.length, ...idx)), tetes);
  const featureList = [...u16(features.length), ...features.flatMap(([tag], i) => [...etiquette(tag), ...u16(au(caracs.offsets, i))]), ...caracs.corps];
  const l = aplatir(lookups, 2 + lookups.length * 2);
  const liste = [...u16(lookups.length, ...l.offsets), ...l.corps];
  const enTete = 10, table = [...u32(0x00010000), ...u16(enTete, enTete + scripts.length, enTete + scripts.length + featureList.length), ...scripts, ...featureList, ...liste];
  const sfnt = [...u32(0x00010000), ...u16(1, 0, 0, 0), ...etiquette('GSUB'), ...u32(0), ...u32(28), ...u32(table.length), ...table];
  return new Uint8Array(sfnt).buffer as ArrayBuffer;
}
const au = <T,>(t: readonly T[], i: number): T => { const v = t[i]; if (v === undefined) throw new RangeError('index'); return v; };

// Lookup 0 (direct) : f -> [ffi 60 (f f i), ff 61 (f f), fi 62 (f i), fl 63 (f l)] dans cet ordre, a -> [ae 64].
const lookupDirect = (): number[] => lookup(4, [sousTable4(couvertureListe(F, A), jeu(ligature(60, F, I), ligature(61, F), ligature(62, I), ligature(63, L)), jeu(ligature(64, E)))]);
// Lookup 1 (extension de type 7 vers le type 4) : x -> [xyz 65 (x y z)], couverture en plages.
const lookupEtendu = (): number[] => lookup(7, [sousTable4(couverturePlages([X, X, 0]), jeu(ligature(65, Y, Z)))]);

describe('lireLigaturesGsub, sur un GSUB ecrit a la main', () => {
  const lecteur = lireLigaturesGsub(gsub([lookupDirect(), lookupEtendu()], { features: [['liga', [0, 1]]] }));

  it('lit des ligatures a deux et a trois composants', () => {
    expect(lecteur).not.toBeNull();
    expect(lecteur?.appliquer([F, I], 0)).toEqual({ glyphe: 62, n: 2 });
    expect(lecteur?.appliquer([F, L], 0)).toEqual({ glyphe: 63, n: 2 });
    expect(lecteur?.appliquer([F, F, I], 0)).toEqual({ glyphe: 60, n: 3 });
    expect(lecteur?.appliquer([A, E], 0)).toEqual({ glyphe: 64, n: 2 });
  });

  it('compte les ligatures et la fenetre qu il faut presenter', () => {
    expect(lecteur?.nombre).toBe(6);
    expect(lecteur?.maxGlyphes).toBe(3);
  });

  it('lit depuis la position donnee, et rend le nombre de glyphes absorbes', () => {
    expect(lecteur?.appliquer([A, F, F, I, X], 1)).toEqual({ glyphe: 60, n: 3 });
    expect(lecteur?.appliquer([A, F, F, I, X], 2)).toEqual({ glyphe: 62, n: 2 });
  });

  it('lit un lookup d extension (type 7) dont la sous-table a une couverture en plages', () => {
    expect(lecteur?.appliquer([X, Y, Z], 0)).toEqual({ glyphe: 65, n: 3 });
  });

  it('la premiere ligature qui s ajuste l emporte, dans l ordre de la fonte', () => {
    // ffi (60) est range avant ff (61) : « f f i » donne la plus longue ; « f f x » retombe sur ff.
    expect(lecteur?.appliquer([F, F, X], 0)).toEqual({ glyphe: 61, n: 2 });
  });

  it('ne rend rien quand aucune ligature ne commence la', () => {
    expect(lecteur?.appliquer([I, F], 0)).toBeNull();
    expect(lecteur?.appliquer([X, Y], 0)).toBeNull();
    expect(lecteur?.appliquer([X, Y, 99], 0)).toBeNull();
    expect(lecteur?.appliquer([F], 0)).toBeNull();
    expect(lecteur?.appliquer([], 0)).toBeNull();
    expect(lecteur?.appliquer([F, I], 5)).toBeNull();
  });

  it('ignore une ligature d un seul composant (une substitution simple, pas une ligature)', () => {
    const l = lireLigaturesGsub(gsub([lookup(4, [sousTable4(couvertureListe(F), jeu(ligature(70), ligature(71, I)))])], { features: [['liga', [0]]] }));
    expect(l?.nombre).toBe(1);
    expect(l?.appliquer([F, I], 0)).toEqual({ glyphe: 71, n: 2 });
    expect(l?.appliquer([F], 0)).toBeNull();
  });

  it('rend le meme resultat a chaque appel', () => {
    expect(lecteur?.appliquer([F, I], 0)).toEqual(lecteur?.appliquer([F, I], 0));
  });
});

describe('lireLigaturesGsub, la feature et le script', () => {
  const direct = lookupDirect(), dlig = lookup(4, [sousTable4(couvertureListe(40), jeu(ligature(66, 41)))]);

  it('ne retient que les lookups nommes par la feature liga : dlig, clig et les autres ne sont pas lues', () => {
    const l = lireLigaturesGsub(gsub([direct, dlig], { features: [['dlig', [1]], ['liga', [0]]] }));
    expect(l?.appliquer([F, I], 0)).toEqual({ glyphe: 62, n: 2 });
    expect(l?.appliquer([40, 41], 0)).toBeNull();
  });

  it('une feature qui omet liga ne donne rien : null, l interface n offrira pas l option', () => {
    expect(lireLigaturesGsub(gsub([direct, dlig], { features: [['dlig', [1]], ['kern', [0]]] }))).toBeNull();
  });

  it('une feature liga que la langue par defaut ne nomme pas n est pas lue', () => {
    expect(lireLigaturesGsub(gsub([direct], { features: [['liga', [0]], ['calt', [0]]], indicesDeLaLangue: [1] }))).toBeNull();
  });

  it('a defaut du script latn, le script DFLT ; un autre script ne compte pas', () => {
    expect(lireLigaturesGsub(gsub([direct], { script: 'DFLT', features: [['liga', [0]]] }))?.nombre).toBe(5);
    expect(lireLigaturesGsub(gsub([direct], { script: 'cyrl', features: [['liga', [0]]] }))).toBeNull();
  });

  it('un lookup d un autre type que 4 et 7 dans la feature est saute', () => {
    const simple = lookup(1, [u16(1, 6, 0)]);
    expect(lireLigaturesGsub(gsub([simple], { features: [['liga', [0]]] }))).toBeNull();
    expect(lireLigaturesGsub(gsub([simple, direct], { features: [['liga', [0, 1]]] }))?.nombre).toBe(5);
  });

  it('une extension qui n envoie pas vers le type 4 est sautee', () => {
    const l = lookup(7, [sousTable4(couvertureListe(F), jeu(ligature(62, I)))], 1);
    expect(lireLigaturesGsub(gsub([l], { features: [['liga', [0]]] }))).toBeNull();
  });

  it('plusieurs lookups liga se suivent dans l ordre des lookups ; les sous-tables d un lookup dans leur ordre', () => {
    const premier = lookup(4, [sousTable4(couvertureListe(F), jeu(ligature(80, I)))]);
    const second = lookup(4, [sousTable4(couvertureListe(F), jeu(ligature(81, I, L)))]);
    const l = lireLigaturesGsub(gsub([second, premier], { features: [['liga', [1, 0]]] }));
    // « liga » nomme les lookups 1 puis 0 : ils s'appliquent par indice croissant, donc `second` (indice 0) d'abord.
    expect(l?.appliquer([F, I, L], 0)).toEqual({ glyphe: 81, n: 3 });
    expect(l?.appliquer([F, I], 0)).toEqual({ glyphe: 80, n: 2 });
  });
});

describe('lireLigaturesGsub, sur ce qui n est pas lisible', () => {
  it('rend null pour des octets qui ne sont pas une fonte, ou une fonte sans GSUB', () => {
    expect(lireLigaturesGsub(new ArrayBuffer(0))).toBeNull();
    expect(lireLigaturesGsub(new TextEncoder().encode('ceci n est pas une fonte').buffer as ArrayBuffer)).toBeNull();
    expect(lireLigaturesGsub(new Uint8Array([...u32(0x00010000), ...u16(0, 0, 0, 0)]).buffer as ArrayBuffer)).toBeNull();
  });

  it('rend null, sans lever, pour un GSUB tronque a n importe quel endroit', () => {
    const entier = new Uint8Array(gsub([lookupDirect(), lookupEtendu()], { features: [['liga', [0, 1]]] }));
    expect(lireLigaturesGsub(entier.slice().buffer as ArrayBuffer)).not.toBeNull();
    for (let n = 0; n < entier.length; n++) {
      const l = lireLigaturesGsub(entier.slice(0, n).buffer as ArrayBuffer);
      // Une table coupee ne donne jamais de ligatures a moitie : tout ou rien, et jamais d'exception.
      expect(l === null || l.nombre === 6).toBe(true);
    }
    expect(lireLigaturesGsub(entier.slice(0, 60).buffer as ArrayBuffer)).toBeNull();
  });

  it('rend null pour un decalage qui sort du fichier', () => {
    const corrompu = new Uint8Array(gsub([lookupDirect()], { features: [['liga', [0]]] }));
    // Le decalage de la liste des lookups (octets 8-9 de la table, au fichier 28 + 8) pointe hors du fichier.
    corrompu[36] = 0xff; corrompu[37] = 0xf0;
    expect(lireLigaturesGsub(corrompu.buffer as ArrayBuffer)).toBeNull();
  });
});
