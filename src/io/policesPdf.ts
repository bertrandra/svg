// Les programmes de fonte embarques dans un PDF (ADR-0020) : TrueType (FontFile2) et OpenType (FontFile3 /OpenType), lus par
// opentype.js (deja epingle pour le texte de l'editeur) ; la lecture pure n'en voit que l'interface `FonteEmbarquee`. Un programme
// de fonte vient d'un inconnu : il est lu dans un try, une glyphe a la fois, et tout echec le fait remplacer (c'est dit), jamais
// une exception.
//
// opentype.js ne lit que certaines tables cmap (formats 0, 4, 12) et refuse la fonte entiere sinon ; les sous-ensembles des PDF
// portent souvent une seule table (1, 0) au format 6, ou (3, 0) symbolique. La cmap est donc lue ici, toutes sous-tables et tous
// formats courants (0, 4, 6, 12), et opentype.js recoit une copie de la fonte dont la cmap est remplacee par une table minimale :
// il n'en a besoin que pour se construire, les glyphes se demandent par leur numero.

import { parse, type Font } from 'opentype.js';
import type { CommandeGlyphe } from '../engine/editionSvg.js';
import type { FonteEmbarquee } from '../engine/lecturePdf.js';

/** Au-dela, une sous-table cmap est tronquee : 65 536 codes couvrent tout le plan multilingue de base. */
const CODES_MAX = 65_536;

type Sous = Map<number, number>;

/** Les sous-tables cmap d'une fonte, par « plateforme/encodage ». */
function lireCmaps(vue: DataView, debut: number): Map<string, Sous> {
  const tables = new Map<string, Sous>();
  const n = vue.getUint16(debut + 2);
  for (let i = 0; i < Math.min(n, 64); i++) {
    const plateforme = vue.getUint16(debut + 4 + i * 8), encodage = vue.getUint16(debut + 6 + i * 8), o = debut + vue.getUint32(debut + 8 + i * 8);
    const cle = plateforme + '/' + encodage;
    if (tables.has(cle)) continue;
    try { tables.set(cle, sousTable(vue, o)); } catch { /* une sous-table illisible est ignoree : les autres restent */ }
  }
  return tables;
}

function sousTable(vue: DataView, o: number): Sous {
  const m: Sous = new Map(), format = vue.getUint16(o);
  if (format === 0) { for (let c = 0; c < 256; c++) m.set(c, vue.getUint8(o + 6 + c)); }
  else if (format === 6) {
    const premier = vue.getUint16(o + 6), nombre = Math.min(vue.getUint16(o + 8), CODES_MAX);
    for (let k = 0; k < nombre; k++) m.set(premier + k, vue.getUint16(o + 10 + k * 2));
  } else if (format === 4) {
    const segments = vue.getUint16(o + 6) / 2, fins = o + 14, debuts = fins + segments * 2 + 2, deltas = debuts + segments * 2, decalages = deltas + segments * 2;
    for (let s = 0; s < segments && m.size < CODES_MAX; s++) {
      const fin = vue.getUint16(fins + s * 2), d = vue.getUint16(debuts + s * 2), delta = vue.getInt16(deltas + s * 2), dec = vue.getUint16(decalages + s * 2);
      for (let c = d; c <= fin && c !== 0xffff && m.size < CODES_MAX; c++) {
        const g = dec === 0 ? (c + delta) & 0xffff : (() => { const v = vue.getUint16(decalages + s * 2 + dec + (c - d) * 2); return v === 0 ? 0 : (v + delta) & 0xffff; })();
        if (g) m.set(c, g);
      }
    }
  } else if (format === 12) {
    const groupes = Math.min(vue.getUint32(o + 12), CODES_MAX);
    for (let k = 0; k < groupes && m.size < CODES_MAX; k++) {
      const d = vue.getUint32(o + 16 + k * 12), fin = vue.getUint32(o + 20 + k * 12), g = vue.getUint32(o + 24 + k * 12);
      for (let c = d; c <= fin && m.size < CODES_MAX; c++) m.set(c, g + c - d);
    }
  }
  return m;
}

/** Une cmap minimale et valide (une sous-table (3, 1) au format 4 qui ne couvre rien) : de quoi laisser opentype.js se construire. */
const CMAP_VIDE = Uint8Array.from([0, 0, 0, 1, 0, 3, 0, 1, 0, 0, 0, 12, 0, 4, 0, 24, 0, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0xff, 0xff, 0, 0, 0xff, 0xff, 0, 1, 0, 0]);

/** Des tables minimales que les sous-ensembles omettent souvent et sans lesquelles opentype.js ne se construit pas. */
const NAME_VIDE = Uint8Array.from([0, 0, 0, 0, 0, 6]);
const POST_SANS_NOMS = Uint8Array.from([0, 3, 0, 0, ...new Array<number>(28).fill(0)]);
const etiquette = (t: string): number => [...t].reduce((a, c) => a * 256 + c.charCodeAt(0), 0) >>> 0;

/**
 * Une copie de la fonte qu'opentype.js sait construire, et les sous-tables de sa cmap d'origine ; null si le repertoire des tables
 * ne se lit pas. La cmap y est remplacee par CMAP_VIDE ; une table name ou post absente est ajoutee, vide. Le repertoire grandit
 * alors de 16 octets par table ajoutee, et les adresses des tables d'origine avec lui.
 */
function preparer(octets: Uint8Array): { copie: ArrayBuffer; cmaps: Map<string, Sous> } | null {
  const source = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  const version = source.getUint32(0);
  if (version !== 0x00010000 && version !== 0x4f54544f && version !== 0x74727565) return null;
  const n = source.getUint16(4);
  if (n > 256 || 12 + n * 16 > octets.length) return null;
  const tags = Array.from({ length: n }, (_, i) => source.getUint32(12 + i * 16));
  let cmaps = new Map<string, Sous>();
  const iCmap = tags.indexOf(etiquette('cmap'));
  if (iCmap >= 0) { try { cmaps = lireCmaps(source, source.getUint32(12 + iCmap * 16 + 8)); } catch { cmaps = new Map(); } }
  const ajouts: Array<readonly [string, Uint8Array]> = [['cmap', CMAP_VIDE], ['name', NAME_VIDE], ['post', POST_SANS_NOMS]];
  const nouvelles = ajouts.filter(([t]) => t === 'cmap' ? iCmap < 0 : !tags.includes(etiquette(t)));
  const decalage = nouvelles.length * 16, corps = 12 + n * 16;
  let fin = (octets.length + decalage + 3) & ~3;
  const places: Array<readonly [string, number, Uint8Array]> = ajouts.map(([t, o]) => { const p = fin; fin = (fin + o.length + 3) & ~3; return [t, p, o] as const; });
  const copie = new Uint8Array(fin), vue = new DataView(copie.buffer);
  copie.set(octets.subarray(0, 12));
  copie.set(octets.subarray(12, corps), 12);
  copie.set(octets.subarray(corps), corps + decalage);
  for (const [, p, o] of places) copie.set(o, p);
  const place = (t: string) => places.find(x => x[0] === t);
  for (let i = 0; i < n; i++) {
    const e = 12 + i * 16;
    vue.setUint32(e + 8, source.getUint32(e + 8) + decalage);
    if (i === iCmap) { const c = place('cmap'); if (c) { vue.setUint32(e + 8, c[1]); vue.setUint32(e + 12, c[2].length); } }
  }
  vue.setUint16(4, n + nouvelles.length);
  nouvelles.forEach(([t], k) => {
    const e = corps + k * 16, c = place(t);
    vue.setUint32(e, etiquette(t));
    vue.setUint32(e + 8, c?.[1] ?? 0);
    vue.setUint32(e + 12, c?.[2].length ?? 0);
  });
  return { copie: copie.buffer, cmaps };
}

/** Lit un programme de fonte TrueType ou OpenType embarque ; null s'il ne se lit pas. */
export function lireFontePdf(octets: Uint8Array): FonteEmbarquee | null {
  let fonte: Font, cmaps: Map<string, Sous>;
  try {
    const prepare = preparer(octets);
    if (!prepare) return null;
    fonte = parse(prepare.copie);
    cmaps = prepare.cmaps;
  } catch {
    return null;
  }
  const unitesParEm = fonte.unitsPerEm > 0 && fonte.unitsPerEm <= 16384 ? fonte.unitsPerEm : 1000;
  const nombre = fonte.numGlyphs ?? 0;
  const contours = new Map<number, readonly CommandeGlyphe[] | null>();
  const unicode = cmaps.get('3/10') ?? cmaps.get('3/1') ?? cmaps.get('0/4') ?? cmaps.get('0/3') ?? cmaps.get('0/1') ?? cmaps.get('0/0') ?? null;
  const glyphe = (gid: number) => { try { return gid >= 0 && gid < nombre ? fonte.glyphs.get(gid) : null; } catch { return null; } };
  return {
    unitesParEm,
    nombreGlyphes: nombre,
    contour: gid => {
      if (contours.has(gid)) return contours.get(gid) ?? null;
      let c: readonly CommandeGlyphe[] | null = null;
      try { c = glyphe(gid)?.getPath(0, 0, unitesParEm).commands ?? null; } catch { c = null; }
      contours.set(gid, c);
      return c;
    },
    avance: gid => { const a = glyphe(gid)?.advanceWidth; return typeof a === 'number' && Number.isFinite(a) ? a : unitesParEm / 2; },
    parUnicode: u => unicode?.get(u) ?? 0,
    parCode: (p, e, code) => { const t = cmaps.get(p + '/' + e); return t ? t.get(code) ?? 0 : -1; },
    parNom: nom => { try { const g = fonte.glyphNames?.nameToGlyphIndex(nom); return typeof g === 'number' && g > 0 && g < nombre ? g : 0; } catch { return 0; } }
  };
}
