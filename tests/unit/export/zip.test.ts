import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { crc32, ecrireZip, ErreurZip, nomsUniques, nomSur, type EntreeZip } from '../../../src/export/zip.js';

const texte = (t: string) => new TextEncoder().encode(t);

/** Un lecteur de ZIP ecrit independamment de l'ecrivain : il ne lit que la norme (APPNOTE), de la fin vers le debut. */
interface Lu { nom: string; donnees: Uint8Array; crc: number; flags: number; methode: number; heure: number; date: number; decalage: number }
function lire(zip: Uint8Array): Lu[] {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let fin = zip.length - 22;
  while (fin >= 0 && v.getUint32(fin, true) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error('pas de fin de repertoire central');
  const n = v.getUint16(fin + 10, true), taille = v.getUint32(fin + 12, true), debut = v.getUint32(fin + 16, true);
  expect(v.getUint16(fin + 8, true), 'entrees de ce disque').toBe(n);
  expect(debut + taille, 'le repertoire central finit ou la fin commence').toBe(fin);
  const sortie: Lu[] = [];
  let p = debut;
  for (let i = 0; i < n; i++) {
    expect(v.getUint32(p, true)).toBe(0x02014b50);
    const flags = v.getUint16(p + 8, true), methode = v.getUint16(p + 10, true), heure = v.getUint16(p + 12, true), date = v.getUint16(p + 14, true);
    const crc = v.getUint32(p + 16, true), comp = v.getUint32(p + 20, true), brut = v.getUint32(p + 24, true);
    const ln = v.getUint16(p + 28, true), lx = v.getUint16(p + 30, true), lc = v.getUint16(p + 32, true), decalage = v.getUint32(p + 42, true);
    const nom = new TextDecoder('utf-8', { fatal: true }).decode(zip.subarray(p + 46, p + 46 + ln));
    // L'entete local doit dire la meme chose que le central.
    expect(v.getUint32(decalage, true)).toBe(0x04034b50);
    expect(v.getUint32(decalage + 14, true)).toBe(crc);
    expect(v.getUint32(decalage + 18, true)).toBe(comp);
    const lnl = v.getUint16(decalage + 26, true), lxl = v.getUint16(decalage + 28, true);
    const debutDonnees = decalage + 30 + lnl + lxl;
    expect(comp).toBe(brut);
    sortie.push({ nom, donnees: zip.subarray(debutDonnees, debutDonnees + comp), crc, flags, methode, heure, date, decalage });
    p += 46 + ln + lx + lc;
  }
  return sortie;
}

describe('crc32', () => {
  it('donne les valeurs de reference connues', () => {
    expect(crc32(new Uint8Array())).toBe(0);
    expect(crc32(texte('123456789'))).toBe(0xcbf43926);
    expect(crc32(texte('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339);
  });
});

describe('ecrireZip', () => {
  const entrees: EntreeZip[] = [
    { nom: 'logo.svg', donnees: texte('<svg xmlns="http://www.w3.org/2000/svg"/>') },
    { nom: 'été ☂ 日本.svg', donnees: texte('<svg/>'.repeat(500)) },
    { nom: 'vide.svg', donnees: new Uint8Array() }
  ];

  it('s ecrit en structure ZIP valide : noms, tailles, CRC-32 et donnees relus un a un', () => {
    const lus = lire(ecrireZip(entrees));
    expect(lus.map(l => l.nom)).toEqual(entrees.map(e => e.nom));
    lus.forEach((l, i) => {
      expect(Array.from(l.donnees)).toEqual(Array.from(entrees[i]?.donnees ?? []));
      expect(l.crc).toBe(crc32(l.donnees));
      expect(l.methode, 'stocke, sans compression').toBe(0);
      expect(l.flags & 0x0800, 'noms en UTF-8').toBe(0x0800);
    });
  });

  it('fixe l horodatage au 1er janvier 1980 et rend les memes octets a chaque fois', () => {
    const a = ecrireZip(entrees), b = ecrireZip(entrees);
    expect(createHash('sha256').update(a).digest('hex')).toBe(createHash('sha256').update(b).digest('hex'));
    for (const l of lire(a)) {
      expect(l.heure).toBe(0);
      // Date DOS : (annee - 1980) << 9 | mois << 5 | jour, soit 0 | 1 | 1.
      expect(l.date).toBe((1 << 5) | 1);
    }
  });

  it('place chaque entete local ou le repertoire central le dit, dans l ordre', () => {
    const lus = lire(ecrireZip(entrees));
    expect(lus[0]?.decalage).toBe(0);
    expect(lus.map(l => l.decalage)).toEqual([...lus.map(l => l.decalage)].sort((x, y) => x - y));
  });

  it('une archive vide est une simple fin de repertoire central de 22 octets', () => {
    const z = ecrireZip([]);
    expect(z.length).toBe(22);
    expect(lire(z)).toEqual([]);
  });

  it('refuse un doublon de nom, en le nommant', () => {
    expect(() => ecrireZip([{ nom: 'a.svg', donnees: texte('x') }, { nom: 'a.svg', donnees: texte('y') }])).toThrowError(/« a\.svg »/);
  });

  it('refuse au-dela de 4 Go, avec une phrase qui le dit, avant d allouer', () => {
    const enorme = { length: 0x100000000 } as unknown as Uint8Array;
    expect(() => ecrireZip([{ nom: 'a.bin', donnees: enorme }])).toThrowError(ErreurZip);
    expect(() => ecrireZip([{ nom: 'a.bin', donnees: enorme }])).toThrowError(/4 Go/);
  });

  it('refuse plus de 65 535 entrees', () => {
    const trop = Array.from({ length: 65536 }, (_, i) => ({ nom: 'f' + i, donnees: new Uint8Array() }));
    expect(() => ecrireZip(trop)).toThrowError(/Trop de fichiers/);
  });

  it('est lu par le module zipfile de Python quand il est la (controle independant)', () => {
    const essai = spawnSync('python3', ['-c', 'import zipfile'], { encoding: 'utf8' });
    if (essai.status !== 0) return; // pas de Python : le lecteur ci-dessus reste le controle
    const dossier = mkdtempSync(join(tmpdir(), 'zip-'));
    try {
      const chemin = join(dossier, 'lot.zip');
      writeFileSync(chemin, ecrireZip(entrees));
      const r = spawnSync('python3', ['-I', '-c', [
        'import sys, zipfile, zlib, json',
        'z = zipfile.ZipFile(sys.argv[1])',
        'assert z.testzip() is None',
        'out = []',
        'for i in z.infolist():',
        '    d = z.read(i.filename)',
        '    out.append([i.filename, len(d), zlib.crc32(d) & 0xffffffff, i.CRC, list(i.date_time), i.compress_type])',
        'print(json.dumps(out))'
      ].join('\n'), chemin], { encoding: 'utf8' });
      expect(r.stderr).toBe('');
      expect(r.status).toBe(0);
      const lignes = JSON.parse(r.stdout) as Array<[string, number, number, number, number[], number]>;
      expect(lignes.map(l => l[0])).toEqual(entrees.map(e => e.nom));
      for (const [i, l] of lignes.entries()) {
        expect(l[1]).toBe(entrees[i]?.donnees.length);
        expect(l[2]).toBe(l[3]);
        expect(l[4]).toEqual([1980, 1, 1, 0, 0, 0]);
        expect(l[5]).toBe(0);
      }
    } finally { rmSync(dossier, { recursive: true, force: true }); }
  });
});

describe('noms', () => {
  it('nomSur retire les separateurs et les caracteres refuses', () => {
    expect(nomSur('a/b\\c:d*e?.svg')).toBe('a_b_c_d_e_.svg');
    expect(nomSur('  ..  ')).toBe('fichier');
    expect(nomSur('')).toBe('fichier');
    expect(nomSur('é日本.svg')).toBe('é日本.svg');
  });

  it('nomsUniques numerote les doublons, casse comprise, en gardant l extension', () => {
    expect(nomsUniques(['logo.svg', 'logo.svg', 'LOGO.svg', 'autre.svg', 'logo-2.svg'])).toEqual(['logo.svg', 'logo-2.svg', 'LOGO-3.svg', 'autre.svg', 'logo-2-2.svg']);
    expect(nomsUniques(['sans-extension', 'sans-extension'])).toEqual(['sans-extension', 'sans-extension-2']);
    expect(nomsUniques(['.svg', '.svg'])).toEqual(['svg', 'svg-2']);
  });
});
