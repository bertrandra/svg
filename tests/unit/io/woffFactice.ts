// Une fonte sfnt (TTF, OTF) mise en WOFF 1.0, pour les tests : chaque table compressee par zlib quand elle y gagne, comme le
// font les outils qui produisent les fichiers de Fontsource. Sert aux tests unitaires de io/woff.ts et au test de navigateur
// qui sert une police du catalogue par `page.route`.

import { deflateSync } from 'node:zlib';

const aligne = (x: number): number => (x + 3) & ~3;

export function enWoff(sfnt: Uint8Array): Uint8Array {
  const v = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
  const saveur = v.getUint32(0), n = v.getUint16(4);
  const tables = Array.from({ length: n }, (_, i) => {
    const p = 12 + i * 16;
    const etiquette = v.getUint32(p), somme = v.getUint32(p + 4), decalage = v.getUint32(p + 8), longueur = v.getUint32(p + 12);
    const brut = sfnt.subarray(decalage, decalage + longueur), compresse = deflateSync(brut);
    return { etiquette, somme, longueur, donnees: compresse.length < longueur ? new Uint8Array(compresse) : brut };
  });
  const total = 12 + n * 16 + tables.reduce((s, t) => s + aligne(t.longueur), 0);
  let taille = 44 + n * 20;
  for (const t of tables) taille += aligne(t.donnees.length);
  const out = new Uint8Array(taille), w = new DataView(out.buffer);
  w.setUint32(0, 0x774f4646); w.setUint32(4, saveur); w.setUint32(8, taille); w.setUint16(12, n); w.setUint32(16, total); w.setUint16(20, 1);
  let position = 44 + n * 20;
  tables.forEach((t, i) => {
    const p = 44 + i * 20;
    w.setUint32(p, t.etiquette); w.setUint32(p + 4, position); w.setUint32(p + 8, t.donnees.length); w.setUint32(p + 12, t.longueur); w.setUint32(p + 16, t.somme);
    out.set(t.donnees, position);
    position += aligne(t.donnees.length);
  });
  return out;
}
