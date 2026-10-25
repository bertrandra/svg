// Fabriquer des PDF a la main pour les tests : des objets ecrits en texte, une table des objets aux decalages justes (classique,
// ou en flux avec un flux d'objets, comme les PDF 1.5 d'Illustrator, d'Inkscape ou de Cairo), et la decompression de Node pour
// remplacer celle du navigateur. Rien ici n'est du code livre : c'est l'outillage des tests et des fixtures (tests/fixtures/pdf).

import { constants, deflateSync, inflateSync } from 'node:zlib';
import { lirePdf, type Decompression, type LecturePdf, type PdfLu } from '../../../../src/engine/lecturePdf.js';

export const octets = (t: string): Buffer => Buffer.from(t, 'latin1');

/** La decompression de Node, au contrat de `Decompression` : bornee a `max`, 'illisible' pour un flux casse. */
export const inflerSync: Decompression = (brut, max) => {
  try {
    const r = inflateSync(brut, { maxOutputLength: Math.max(1, max + 1), finishFlush: constants.Z_SYNC_FLUSH });
    return r.length > max ? 'trop' : new Uint8Array(r);
  } catch (e) {
    return (e as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE' ? 'trop' : 'illisible';
  }
};

/** Le corps d'un objet flux : son dictionnaire (sans Length, ajoutee ici) et ses octets, compresses a la demande. */
export function flux(dict: string, donnees: string | Uint8Array, compresse = false): Buffer {
  const brut = typeof donnees === 'string' ? octets(donnees) : Buffer.from(donnees);
  const corps = compresse ? deflateSync(brut) : brut;
  const d = dict.replace(/^<<\s*/, '').replace(/\s*>>$/, '');
  const entete = '<< ' + [d, compresse ? '/Filter /FlateDecode' : '', '/Length ' + corps.length].filter(Boolean).join(' ') + ' >>';
  return Buffer.concat([octets(entete + '\nstream\n'), corps, octets('\nendstream')]);
}

type Corps = string | Buffer;

/** Un PDF a table classique : les objets 1..n dans l'ordre, puis la table et le trailer. `trailer` sans /Size (ajoutee). */
export function pdfClassique(objets: readonly Corps[], trailer = '/Root 1 0 R', entete = '%PDF-1.4'): Buffer {
  const morceaux: Buffer[] = [octets(entete + '\n%\xe2\xe3\xcf\xd3\n')];
  let pos = morceaux[0]?.length ?? 0;
  const positions: number[] = [];
  objets.forEach((o, i) => {
    positions.push(pos);
    const b = Buffer.concat([octets((i + 1) + ' 0 obj\n'), typeof o === 'string' ? octets(o) : o, octets('\nendobj\n')]);
    morceaux.push(b);
    pos += b.length;
  });
  const table = 'xref\n0 ' + (objets.length + 1) + '\n0000000000 65535 f \n' + positions.map(p => String(p).padStart(10, '0') + ' 00000 n \n').join('');
  morceaux.push(octets(table + 'trailer\n<< /Size ' + (objets.length + 1) + ' ' + trailer + ' >>\nstartxref\n' + pos + '\n%%EOF\n'));
  return Buffer.concat(morceaux);
}

/**
 * Un PDF 1.5 « moderne » : les objets qui ne sont pas des flux vont dans un flux d'objets compresse, la table est un flux
 * compresse avec le predicteur PNG (Columns 4, Predictor 12), comme l'ecrivent Acrobat et Illustrator. Les flux restent dehors.
 */
export function pdfModerne(objets: readonly Corps[], trailer = '/Root 1 0 R', bourrage = 0): Buffer {
  const estFlux = (o: Corps) => typeof o !== 'string';
  const dedans = objets.map((o, i) => [i + 1, o] as const).filter(([, o]) => !estFlux(o));
  const n = objets.length, numObjStm = n + 1, numXref = n + 2;
  let entetes = '', corps = '';
  for (const [num, o] of dedans) { entetes += num + ' ' + corps.length + ' '; corps += o + '\n'; }
  // `bourrage` : des blancs apres les objets, pour fabriquer un flux d'objets demesure (corpus hostile).
  const objStm = flux('<< /Type /ObjStm /N ' + dedans.length + ' /First ' + entetes.length + ' >>', bourrage ? Buffer.concat([octets(entetes + corps), Buffer.alloc(bourrage, 32)]) : entetes + corps, true);
  const morceaux: Buffer[] = [octets('%PDF-1.5\n%\xe2\xe3\xcf\xd3\n')];
  let pos = morceaux[0]?.length ?? 0;
  const entrees: Array<[number, number, number]> = [[0, 0, 0xffff]];
  const ecrire = (num: number, b: Buffer) => { morceaux.push(Buffer.concat([octets(num + ' 0 obj\n'), b, octets('\nendobj\n')])); };
  const index = new Map(dedans.map(([num], k) => [num, k]));
  for (let num = 1; num <= n; num++) {
    const o = objets[num - 1];
    if (o === undefined) continue;
    if (estFlux(o)) { entrees[num] = [1, pos, 0]; ecrire(num, o as Buffer); pos += morceaux[morceaux.length - 1]?.length ?? 0; }
    else entrees[num] = [2, numObjStm, index.get(num) ?? 0];
  }
  entrees[numObjStm] = [1, pos, 0];
  ecrire(numObjStm, objStm);
  pos += morceaux[morceaux.length - 1]?.length ?? 0;
  entrees[numXref] = [1, pos, 0];
  // Le predicteur PNG « Up » (type 2) ligne par ligne, avec W [1 2 1] : quatre colonnes.
  const lignes: number[] = [];
  let avant = [0, 0, 0, 0];
  for (const [t, a, b] of entrees.map(e => e ?? [0, 0, 0])) {
    const l = [t, (a >> 8) & 255, a & 255, b & 255];
    lignes.push(2, ...l.map((v, k) => (v - (avant[k] ?? 0)) & 255));
    avant = l;
  }
  const xref = flux('<< /Type /XRef /Size ' + (numXref + 1) + ' /W [1 2 1] /DecodeParms << /Columns 4 /Predictor 12 >> ' + trailer + ' >>', Uint8Array.from(lignes), true);
  ecrire(numXref, xref);
  morceaux.push(octets('startxref\n' + pos + '\n%%EOF\n'));
  return Buffer.concat(morceaux);
}

/** Une page simple : catalogue, arbre a une page, page avec ce contenu (compresse a la demande) et ces ressources. */
export function pdfUnePage(contenu: string, options: { boite?: string; ressources?: string; compresse?: boolean; autres?: readonly Corps[]; pageEnPlus?: string } = {}): Buffer {
  return pdfClassique([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox ' + (options.boite ?? '[0 0 200 100]') + ' /Contents 4 0 R /Resources << ' + (options.ressources ?? '') + ' >> ' + (options.pageEnPlus ?? '') + ' >>',
    flux('<< >>', contenu, options.compresse),
    ...(options.autres ?? [])
  ]);
}

/** Lit un PDF avec la decompression de Node. */
export const lire = (o: Uint8Array, page?: number): LecturePdf => lirePdf(o, { decompresser: inflerSync, ...(page ? { page } : {}) });

/** Lit un PDF qui doit s'ouvrir ; echoue en disant pourquoi sinon. */
export function lu(o: Uint8Array, page?: number): PdfLu {
  const r = lire(o, page);
  if ('erreur' in r) throw new Error('le PDF devait se lire : ' + r.erreur);
  return r;
}

/** Le refus d'un PDF qui ne doit pas s'ouvrir. */
export function refus(o: Uint8Array, page?: number): string {
  const r = lire(o, page);
  if (!('erreur' in r)) throw new Error('le PDF devait être refusé');
  return r.erreur;
}

/** Les commandes d'une forme en texte court (« M0,0 L10,0 Z »), arrondies au millieme, pour comparer d'un coup d'oeil. */
export const enTexte = (d: ReadonlyArray<{ c: string; p: readonly number[] }>): string =>
  d.map(c => c.c + c.p.map(v => { const r = Math.round(v * 1000) / 1000; return Object.is(r, -0) ? 0 : r; }).join(',')).join(' ');
