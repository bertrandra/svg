import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ecrireAse, ecrireGpl } from '../../../src/export/nuancier.js';

const TEINTES = [
  { nom: 'Rouge #C81E28', hex: '#c81e28' },
  { nom: 'Bleu foncé #1428A0, opacité 50 %', hex: '#1428a0' },
  { nom: 'Noir #000000', hex: '#000000' },
  { nom: 'illisible', hex: 'rebeccapurple' }
];

describe('la palette GIMP (.gpl)', () => {
  it('s’ecrit a l’octet : en-tete, nom, colonnes, une ligne par teinte lisible', () => {
    expect(ecrireGpl('Couleurs du dessin', TEINTES)).toBe(
      'GIMP Palette\nName: Couleurs du dessin\nColumns: 8\n#\n'
      + '200  30  40\tRouge #C81E28\n'
      + ' 20  40 160\tBleu foncé #1428A0, opacité 50 %\n'
      + '  0   0   0\tNoir #000000\n'
    );
  });

  it('garde chaque teinte sur sa ligne et donne un nom a une palette sans nom', () => {
    const t = ecrireGpl('', [{ nom: 'deux\nlignes\tici', hex: '#ffffff' }]);
    expect(t).toBe('GIMP Palette\nName: Nuancier\nColumns: 8\n#\n255 255 255\tdeux lignes ici\n');
  });
});

describe('l’Adobe Swatch Exchange (.ase)', () => {
  /** Relit un .ase : la signature, la version, puis chaque bloc (type, nom, modele, composantes). */
  function relire(o: Uint8Array) {
    const v = new DataView(o.buffer, o.byteOffset, o.byteLength);
    const signature = String.fromCharCode(...o.subarray(0, 4));
    const version = [v.getUint16(4), v.getUint16(6)];
    const n = v.getUint32(8);
    const blocs: { type: number; nom?: string; modele?: string; rvb?: number[]; genre?: number }[] = [];
    let p = 12;
    for (let i = 0; i < n; i++) {
      const type = v.getUint16(p), longueur = v.getUint32(p + 2);
      let q = p + 6;
      const bloc: (typeof blocs)[number] = { type };
      if (longueur) {
        const lettres = v.getUint16(q); q += 2;
        let nom = '';
        for (let k = 0; k < lettres - 1; k++) nom += String.fromCharCode(v.getUint16(q + k * 2));
        q += lettres * 2;
        bloc.nom = nom;
        if (type === 1) {
          bloc.modele = String.fromCharCode(...o.subarray(q, q + 4)); q += 4;
          bloc.rvb = [v.getFloat32(q), v.getFloat32(q + 4), v.getFloat32(q + 8)].map(x => Math.round(x * 255)); q += 12;
          bloc.genre = v.getUint16(q); q += 2;
        }
      }
      expect(q - (p + 6)).toBe(longueur);
      blocs.push(bloc);
      p += 6 + longueur;
    }
    expect(p).toBe(o.length);
    return { signature, version, blocs };
  }

  it('porte un groupe nomme et une entree RGB par teinte lisible', () => {
    const r = relire(ecrireAse('Couleurs du dessin', TEINTES));
    expect(r.signature).toBe('ASEF');
    expect(r.version).toEqual([1, 0]);
    expect(r.blocs).toEqual([
      { type: 0xc001, nom: 'Couleurs du dessin' },
      { type: 1, nom: 'Rouge #C81E28', modele: 'RGB ', rvb: [200, 30, 40], genre: 2 },
      { type: 1, nom: 'Bleu foncé #1428A0, opacité 50 %', modele: 'RGB ', rvb: [20, 40, 160], genre: 2 },
      { type: 1, nom: 'Noir #000000', modele: 'RGB ', rvb: [0, 0, 0], genre: 2 },
      { type: 0xc002 }
    ]);
  });

  it('rend les memes octets pour les memes teintes', () => {
    const empreinte = (o: Uint8Array) => createHash('sha256').update(o).digest('hex');
    expect(empreinte(ecrireAse('Couleurs du dessin', TEINTES))).toBe(empreinte(ecrireAse('Couleurs du dessin', [...TEINTES])));
  });
});
