// Les briques communes aux lecteurs de tables OpenType (GPOS pour le crenage, GSUB pour les ligatures) : une
// zone d'octets adressee depuis le debut d'une table, les tables de couverture, et le chemin
// script -> feature -> lookups. Lecture pure sur les octets de la fonte : aucun DOM, aucune horloge. Toute
// lecture hors limites leve une RangeError (DataView) : l'appelant la rattrape et se rabat sur autre chose.

/** Une zone d'une table, adressee en octets depuis son debut ; lever (RangeError) hors limites. */
export class Zone {
  constructor(readonly vue: DataView, readonly debut: number) {}
  u16(o: number): number { return this.vue.getUint16(this.debut + o); }
  i16(o: number): number { return this.vue.getInt16(this.debut + o); }
  u32(o: number): number { return this.vue.getUint32(this.debut + o); }
  /** Une sous-zone dont le decalage est lu en 16 bits a `o`, relatif a cette zone. */
  sous16(o: number): Zone { return new Zone(this.vue, this.debut + this.u16(o)); }
  /** Une sous-zone dont le decalage est lu en 32 bits a `o`, relatif a cette zone (lookup d'extension). */
  sous32(o: number): Zone { return new Zone(this.vue, this.debut + this.u32(o)); }
  etiquette(o: number): string { return String.fromCharCode(this.vue.getUint8(this.debut + o), this.vue.getUint8(this.debut + o + 1), this.vue.getUint8(this.debut + o + 2), this.vue.getUint8(this.debut + o + 3)); }
}

/** Le rang d'un glyphe dans une table de couverture, ou -1. */
export function rangCouverture(c: Zone, glyphe: number): number {
  const format = c.u16(0), n = c.u16(2);
  if (format === 1) {
    let bas = 0, haut = n - 1;
    while (bas <= haut) {
      const milieu = (bas + haut) >> 1, g = c.u16(4 + milieu * 2);
      if (g === glyphe) return milieu;
      if (g < glyphe) bas = milieu + 1; else haut = milieu - 1;
    }
    return -1;
  }
  if (format === 2) {
    for (let i = 0; i < n; i++) {
      const debut = c.u16(4 + i * 6), fin = c.u16(6 + i * 6);
      if (glyphe >= debut && glyphe <= fin) return c.u16(8 + i * 6) + glyphe - debut;
    }
  }
  return -1;
}

/** Les glyphes d'une table de couverture, rangees par rang : `rang i` est le glyphe `r[i]`. */
export function glyphesCouverts(c: Zone): number[] {
  const format = c.u16(0), n = c.u16(2), rangs: number[] = [];
  if (format === 1) {
    for (let i = 0; i < n; i++) rangs[i] = c.u16(4 + i * 2);
  } else if (format === 2) {
    for (let i = 0; i < n; i++) {
      const debut = c.u16(4 + i * 6), fin = c.u16(6 + i * 6), premier = c.u16(8 + i * 6);
      for (let g = debut; g <= fin; g++) rangs[premier + g - debut] = g;
    }
  }
  return rangs;
}

/** L'adresse d'une table dans le fichier (repertoire sfnt), ou null s'il n'y en a pas. */
export function adresseTable(vue: DataView, etiquette: string): number | null {
  const version = vue.getUint32(0);
  if (version !== 0x00010000 && version !== 0x4f54544f && version !== 0x74727565) return null;
  const n = vue.getUint16(4), voulue = [...etiquette].reduce((a, c) => a * 256 + c.charCodeAt(0), 0);
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    if (vue.getUint32(o) === voulue) return vue.getUint32(o + 8);
  }
  return null;
}

/**
 * Les indices de lookups d'une feature (« kern », « liga »…) d'une table GPOS ou GSUB, pour le script latin (a defaut
 * DFLT), langue par defaut ; croissants et sans doublon, comme un moteur de mise en forme les applique.
 */
export function lookupsDeFeature(table: Zone, feature: string): number[] {
  const scripts = table.sous16(4), nScripts = scripts.u16(0);
  const choisi = (etiq: string) => { for (let i = 0; i < nScripts; i++) if (scripts.etiquette(2 + i * 6) === etiq) return scripts.sous16(2 + i * 6 + 4); return null; };
  const script = choisi('latn') ?? choisi('DFLT');
  if (!script || script.u16(0) === 0) return [];
  const langue = script.sous16(0), requis = langue.u16(2), nIndices = langue.u16(4);
  const caracteristiques = table.sous16(6), nCaracs = caracteristiques.u16(0);
  const indices = [...Array.from({ length: nIndices }, (_, i) => langue.u16(6 + i * 2)), ...(requis !== 0xffff ? [requis] : [])];
  const lookups = new Set<number>();
  for (const k of indices) {
    if (k >= nCaracs || caracteristiques.etiquette(2 + k * 6) !== feature) continue;
    const carac = caracteristiques.sous16(2 + k * 6 + 4), n = carac.u16(2);
    for (let i = 0; i < n; i++) lookups.add(carac.u16(4 + i * 2));
  }
  return [...lookups].sort((a, b) => a - b);
}
