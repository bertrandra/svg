// Les metadonnees d'un PNG : sa resolution. Le canevas du navigateur ecrit un PNG sans `pHYs`, donc un
// logiciel de mise en page le croit a 72 ppp quelle que soit sa taille. `avecDpiPng` insere le bloc, sans
// toucher a un seul pixel : les autres blocs sont recopies tels quels. Pur.

import { t } from '../util/i18n.js';

const SIGNATURE =[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

let table: Uint32Array | null = null;

/** Le CRC-32 d'un PNG (polynome 0xEDB88320, ISO 3309) sur `octets`. */
export function crc32(octets: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const o of octets) c = (table[(c ^ o) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const lire32 = (o: Uint8Array, i: number) => (((o[i] ?? 0) << 24) | ((o[i + 1] ?? 0) << 16) | ((o[i + 2] ?? 0) << 8) | (o[i + 3] ?? 0)) >>> 0;
const ecrire32 = (o: Uint8Array, i: number, v: number) => { o[i] = (v >>> 24) & 0xff; o[i + 1] = (v >>> 16) & 0xff; o[i + 2] = (v >>> 8) & 0xff; o[i + 3] = v & 0xff; };
const typeDe = (o: Uint8Array, i: number) => String.fromCharCode(o[i] ?? 0, o[i + 1] ?? 0, o[i + 2] ?? 0, o[i + 3] ?? 0);

/** Un bloc PNG complet : longueur, type, donnees, CRC (calcule sur le type et les donnees). */
function bloc(type: string, donnees: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + donnees.length);
  ecrire32(out, 0, donnees.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(donnees, 8);
  ecrire32(out, 8 + donnees.length, crc32(out.subarray(4, 8 + donnees.length)));
  return out;
}

/** Les points par metre d'une resolution en points par pouce (le PNG compte en metres). */
export const pointsParMetre = (dpi: number): number => Math.round(dpi / 0.0254);

/**
 * Le PNG avec sa resolution (bloc `pHYs`, unite = le metre), place juste apres `IHDR` comme l'exige la
 * specification (avant le premier `IDAT`). Un `pHYs` deja present est remplace. Leve une erreur si les
 * octets ne sont pas un PNG ou si `dpi` n'est pas un nombre positif.
 */
export function avecDpiPng(octets: Uint8Array, dpi: number): Uint8Array {
  if (!Number.isFinite(dpi) || dpi <= 0 || dpi > 100000) throw new RangeError('avecDpiPng : resolution invalide');
  if (octets.length < 33 || SIGNATURE.some((v, i) => octets[i] !== v) || typeDe(octets, 12) !== 'IHDR') throw new Error(t('avecDpiPng : ce ne sont pas les octets d’un PNG'));
  const donnees = new Uint8Array(9), ppm = pointsParMetre(dpi);
  ecrire32(donnees, 0, ppm); ecrire32(donnees, 4, ppm); donnees[8] = 1;
  const phys = bloc('pHYs', donnees);
  const finIhdr = 8 + 12 + lire32(octets, 8);
  const morceaux: Uint8Array[] = [octets.subarray(0, finIhdr), phys];
  // Les blocs suivants, moins un ancien pHYs.
  for (let i = finIhdr; i + 12 <= octets.length;) {
    const fin = i + 12 + lire32(octets, i);
    if (fin > octets.length) throw new Error('avecDpiPng : PNG tronque');
    if (typeDe(octets, i + 4) !== 'pHYs') morceaux.push(octets.subarray(i, fin));
    i = fin;
  }
  const out = new Uint8Array(morceaux.reduce((n, m) => n + m.length, 0));
  let p = 0;
  for (const m of morceaux) { out.set(m, p); p += m.length; }
  return out;
}
