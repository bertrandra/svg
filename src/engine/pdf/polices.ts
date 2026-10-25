// Les polices d'un PDF (ISO 32000-1, 9.5 a 9.10) : pour chaque code d'une chaine, sa largeur, son texte, et de quoi dessiner sa
// glyphe. Trois cas :
//   - un programme TrueType (FontFile2) ou OpenType (FontFile3 /OpenType) embarque, que io/ sait lire : la glyphe exacte de
//     l'original, par l'encodage (WinAnsi, MacRoman, Standard, /Differences) ou, pour une police composite Identity-H/V, par le CID
//     et /CIDToGIDMap ;
//   - une police Type 3 : ses glyphes sont des flux de contenu, dessines comme des formulaires (contenu.ts) ;
//   - tout le reste (Type 1, CFF nu, police standard non embarquee, programme illisible) : une fonte embarquee de la page la
//     remplace (model/polices.ts), par le texte de chaque code (/ToUnicode, a defaut le nom de glyphe), et c'est dit.

import { remplacerPolice, type IdPolice, type Remplacement } from '../../model/polices.js';
import type { CommandeGlyphe, Glyphes, Matrice } from '../editionSvg.js';
import { decouper, lireCMap, type CMap } from './cmap.js';
import { encodage, unicodeDeNom } from './encodages.js';
import { estDict, estFlux, estNom, estNombre, estTableau, type Dict, type Flux, type ObjetPdf } from './objets.js';
import { RefusPdf, SyntaxePdf } from './limites.js';
import type { DocumentPdf } from './structure.js';

/** Un programme de fonte lu par io/ (opentype.js) : de quoi trouver une glyphe et dessiner son contour. */
export interface FonteEmbarquee {
  readonly unitesParEm: number;
  readonly nombreGlyphes: number;
  /** Le contour de la glyphe `gid`, en unites de la fonte, origine sur la ligne de base, Y vers le bas ; null si elle n'existe pas. */
  contour(gid: number): readonly CommandeGlyphe[] | null;
  /** L'avance de la glyphe, en unites de la fonte. */
  avance(gid: number): number;
  /** La glyphe d'un caractere par la table cmap Unicode ; 0 si aucune. */
  parUnicode(u: number): number;
  /** La glyphe d'un code par une sous-table cmap precise ((3, 0) symbolique, (1, 0) Macintosh) ; -1 si la sous-table manque. */
  parCode(plateforme: number, encodage: number, code: number): number;
  /** La glyphe d'un nom (table post, jeu de caracteres CFF) ; 0 si inconnu. */
  parNom(nom: string): number;
}

/** Ce que la page donne a la lecture pour le texte : lire un programme de fonte, et ses fontes de remplacement. */
export interface PolicesPdf {
  /** Lit un programme TrueType ou OpenType ; null s'il ne se lit pas (la police est alors remplacee, et c'est dit). */
  lire(octets: Uint8Array): FonteEmbarquee | null;
  /** Une fonte embarquee de la page (dist/polices.js), ou null si elle n'est pas chargee. */
  remplacement(id: IdPolice): Glyphes | null;
}

export interface PolicePdf {
  /** Le nom lisible (sans prefixe de sous-ensemble) et ce qui la remplace quand elle n'est pas dessinee exactement. */
  readonly remplacement: Remplacement;
  /** Le programme embarque, quand il se lit : la police est alors exacte. */
  readonly fonte: FonteEmbarquee | null;
  readonly type3: { readonly procs: Dict; readonly matrice: Matrice; readonly ressources: Dict | null } | null;
  /** Vrai si une police composite (codes de plusieurs octets). */
  readonly composite: boolean;
  /** Vrai si le codage des caracteres n'est pas lu (CMap predefinie autre qu'Identity) : le texte est alors approche. */
  readonly codageInconnu: boolean;
  codes(chaine: string): number[];
  /** La largeur d'un code en millemes d'em (espace glyphe), ou null si le fichier ne la donne pas. */
  largeur(code: number): number | null;
  unicode(code: number): string;
  /** Le nom de glyphe d'un code (police simple, Type 3), '' sinon. */
  nom(code: number): string;
  /** La glyphe du programme embarque, ou null. */
  gid(code: number): number | null;
}

/** La taille au-dela de laquelle un programme de fonte n'est pas lu (il est remplace) : les plus grosses fontes CJK font 20 Mo. */
export const PROGRAMME_MAX = 32 * 1024 * 1024;

const nombres = (doc: DocumentPdf, o: ObjetPdf | undefined): number[] => {
  const t = doc.resoudre(o);
  return estTableau(t) ? t.map(x => doc.resoudre(x)).map(x => (estNombre(x) ? x : 0)) : [];
};

/** Les 256 noms de glyphe d'une police simple : l'encodage de base, puis /Differences. */
function nomsDeCodes(doc: DocumentPdf, d: Dict, symbolique: boolean): string[] {
  const enc = doc.resoudre(d.get('Encoding'));
  const base = estNom(enc) ? enc : estDict(enc) ? doc.valeur(enc, 'BaseEncoding') : null;
  const sousType = doc.valeur(d, 'Subtype');
  const defaut = symbolique ? null : sousType === 'TrueType' ? 'WinAnsiEncoding' : 'StandardEncoding';
  const noms = [...(encodage(estNom(base) ? base : defaut ?? '') ?? new Array<string>(256).fill(''))];
  const diffs = estDict(enc) ? doc.tableau(enc, 'Differences') : null;
  let c = 0;
  for (const x of diffs ?? []) {
    const v = doc.resoudre(x);
    if (estNombre(v)) c = Math.floor(v);
    else if (estNom(v) && c >= 0 && c < 256) noms[c++] = v;
  }
  return noms;
}

/** Les largeurs d'une police composite (tableau /W) : « c [w1 w2 …] » ou « c1 c2 w ». */
function largeursCid(doc: DocumentPdf, w: ObjetPdf | undefined): Map<number, number> {
  const t = doc.resoudre(w), m = new Map<number, number>();
  if (!estTableau(t)) return m;
  for (let i = 0; i < t.length && m.size < 200_000;) {
    const a = doc.resoudre(t[i]), b = doc.resoudre(t[i + 1]);
    if (!estNombre(a)) break;
    if (estTableau(b)) { b.forEach((x, k) => { const v = doc.resoudre(x); if (estNombre(v)) m.set(a + k, v); }); i += 2; continue; }
    const c = doc.resoudre(t[i + 2]);
    if (estNombre(b) && estNombre(c)) for (let k = a; k <= Math.min(b, a + 65_535); k++) m.set(k, c);
    i += 3;
  }
  return m;
}

/** Le programme embarque d'un descripteur, s'il est TrueType ou OpenType et que io/ le lit. */
function programme(doc: DocumentPdf, descripteur: Dict | null, polices: PolicesPdf): FonteEmbarquee | null {
  const ff2 = doc.valeur(descripteur, 'FontFile2'), ff3 = doc.valeur(descripteur, 'FontFile3');
  const f = estFlux(ff2) ? ff2 : estFlux(ff3) && doc.valeur(ff3.dict, 'Subtype') === 'OpenType' ? ff3 : null;
  if (!f) return null;
  let octets: Uint8Array;
  try { octets = doc.donnees(f); } catch (e) { if (e instanceof SyntaxePdf || e instanceof RefusPdf) return null; throw e; }
  if (octets.length > PROGRAMME_MAX) return null;
  try { return polices.lire(octets); } catch { return null; }
}

function cmapDe(doc: DocumentPdf, o: ObjetPdf | undefined): CMap | null {
  const f = doc.resoudre(o);
  if (!estFlux(f)) return null;
  try { return lireCMap(doc.donnees(f)); } catch (e) { if (e instanceof SyntaxePdf || e instanceof RefusPdf) return null; throw e; }
}

/** Ce que les drapeaux d'un descripteur disent de la police : graisse, italique, famille (9.8.2). */
function indices(drapeaux: number): { gras?: boolean; italique?: boolean; indice?: 'serif' | 'script' | 'mono' } {
  const indice = drapeaux & 8 ? 'script' : drapeaux & 1 ? 'mono' : drapeaux & 2 ? 'serif' : undefined;
  return { ...(drapeaux & 0x40000 ? { gras: true } : {}), ...(drapeaux & 64 ? { italique: true } : {}), ...(indice ? { indice } : {}) };
}

/** La police d'un dictionnaire /Font. */
export function lirePolice(doc: DocumentPdf, d: Dict, polices: PolicesPdf): PolicePdf {
  const sousType = doc.valeur(d, 'Subtype');
  const baseFont = doc.valeur(d, 'BaseFont');
  if (sousType === 'Type0') return composite(doc, d, polices);
  const descripteur = doc.dict(d, 'FontDescriptor');
  const drapeaux = doc.nombre(descripteur, 'Flags') ?? 0, symbolique = (drapeaux & 4) !== 0 && (drapeaux & 32) === 0;
  const noms = nomsDeCodes(doc, d, symbolique);
  const versUnicode = cmapDe(doc, d.get('ToUnicode'));
  const premier = doc.nombre(d, 'FirstChar') ?? 0, largeurs = nombres(doc, d.get('Widths')), manquante = doc.nombre(descripteur, 'MissingWidth');
  const remplacement = remplacerPolice({ nom: estNom(baseFont) ? baseFont : sousType === 'Type3' ? 'Type 3' : 'police sans nom', ...indices(drapeaux) });
  const type3 = sousType === 'Type3' ? { procs: doc.dict(d, 'CharProcs') ?? new Map<string, ObjetPdf>(), matrice: matriceDe(doc, d), ressources: doc.dict(d, 'Resources') } : null;
  const fonte = type3 ? null : programme(doc, descripteur, polices);
  const nom = (c: number) => noms[c] ?? '';
  const unicode = (c: number): string => {
    const u = versUnicode?.unicode.get(c);
    if (u !== undefined) return u;
    const parNom = unicodeDeNom(nom(c));
    // Une police sous-ensemble sans encodage ni table Unicode garde souvent les codes ASCII : le seul indice qui reste.
    return parNom || (c >= 32 && c < 127 ? String.fromCharCode(c) : '');
  };
  return {
    remplacement, fonte, type3, composite: false, codageInconnu: false,
    codes: chaine => decouper(chaine, null, false),
    largeur: c => { const w = largeurs[c - premier]; return w !== undefined && c >= premier ? w : manquante; },
    unicode, nom,
    gid: c => (fonte ? gidSimple(fonte, c, nom(c), unicode(c)) : null)
  };
}

/** La glyphe d'un code d'une police simple embarquee : par Unicode, la sous-table symbolique (3, 0), la Macintosh (1, 0), le nom, le code. */
function gidSimple(f: FonteEmbarquee, code: number, nom: string, texte: string): number | null {
  const parNom = nom ? f.parNom(nom) : 0;
  if (parNom > 0) return parNom;
  const u = nom ? unicodeDeNom(nom) : '';
  const parU = u ? f.parUnicode(u.codePointAt(0) ?? 0) : 0;
  if (parU > 0) return parU;
  for (const essai of [f.parCode(3, 0, 0xf000 + code), f.parCode(3, 0, code), f.parCode(1, 0, code)]) if (essai > 0) return essai;
  const parTexte = texte ? f.parUnicode(texte.codePointAt(0) ?? 0) : 0;
  if (parTexte > 0) return parTexte;
  return code > 0 && code < f.nombreGlyphes ? code : null;
}

function matriceDe(doc: DocumentPdf, d: Dict): Matrice {
  const m = nombres(doc, d.get('FontMatrix'));
  return m.length === 6 ? (m as unknown as Matrice) : [0.001, 0, 0, 0.001, 0, 0];
}

function composite(doc: DocumentPdf, d: Dict, polices: PolicesPdf): PolicePdf {
  const baseFont = doc.valeur(d, 'BaseFont'), descendantes = doc.tableau(d, 'DescendantFonts');
  const cidFont = doc.resoudre(descendantes?.[0]);
  const desc = estDict(cidFont) ? cidFont : null;
  const descripteur = doc.dict(desc, 'FontDescriptor');
  const enc = doc.resoudre(d.get('Encoding'));
  const embarquee = estFlux(enc) ? cmapDe(doc, enc) : null;
  const identite = enc === 'Identity-H' || enc === 'Identity-V';
  const versUnicode = cmapDe(doc, d.get('ToUnicode'));
  const largeurs = largeursCid(doc, desc?.get('W')), defaut = doc.nombre(desc, 'DW') ?? 1000;
  const carte = doc.valeur(desc, 'CIDToGIDMap');
  const table = estFlux(carte) ? (() => { try { return doc.donnees(carte as Flux); } catch (e) { if (e instanceof SyntaxePdf || e instanceof RefusPdf) return null; throw e; } })() : null;
  const fonte = programme(doc, descripteur, polices);
  const cid = (c: number) => (embarquee ? embarquee.cid.get(c) ?? c : c);
  const drapeaux = doc.nombre(descripteur, 'Flags') ?? 0;
  return {
    remplacement: remplacerPolice({ nom: estNom(baseFont) ? baseFont : 'police sans nom', ...indices(drapeaux) }),
    fonte, type3: null, composite: true, codageInconnu: !identite && !embarquee,
    codes: chaine => decouper(chaine, embarquee?.espaces ?? null, true),
    largeur: c => largeurs.get(cid(c)) ?? defaut,
    unicode: c => versUnicode?.unicode.get(c) ?? '',
    nom: () => '',
    gid: c => {
      if (!fonte) return null;
      const n = cid(c);
      if (table) { const g = ((table[2 * n] ?? 0) << 8) | (table[2 * n + 1] ?? 0); return 2 * n + 1 < table.length ? g : null; }
      const parNom = fonte.parNom('cid' + n);
      return parNom > 0 ? parNom : n < fonte.nombreGlyphes ? n : null;
    }
  };
}

/** Les flux qu'une police demande (programme, tables, glyphes Type 3) : a decompresser d'avance avec ceux de la page. */
export function fluxDePolice(doc: DocumentPdf, d: Dict): Flux[] {
  const r: Flux[] = [];
  const ajouter = (o: ObjetPdf | undefined) => { const v = doc.resoudre(o); if (estFlux(v)) r.push(v); };
  const descendante = doc.resoudre(doc.tableau(d, 'DescendantFonts')?.[0]);
  for (const x of [d, estDict(descendante) ? descendante : null]) {
    if (!x) continue;
    const desc = doc.dict(x, 'FontDescriptor');
    for (const cle of ['FontFile2', 'FontFile3']) ajouter(desc?.get(cle));
    ajouter(x.get('ToUnicode'));
    ajouter(x.get('Encoding'));
    ajouter(x.get('CIDToGIDMap'));
  }
  const procs = doc.dict(d, 'CharProcs');
  for (const v of procs?.values() ?? []) ajouter(v);
  return r;
}
