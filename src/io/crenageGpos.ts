// Le crenage lu dans la table GPOS d'une fonte (feature « kern », lookups de type 2 : paires de glyphes,
// format 1 par paire et format 2 par classes, y compris derriere un lookup d'extension de type 9).
//
// Pourquoi ce lecteur : opentype.js 2.0.0 ne sait pas lire les lookups d'extension (type 9 : « GPOS
// Lookup 9 not supported »), or Inter et Playfair y rangent tout leur crenage par classes ; et il ne
// retient, par script, que les lookups de type 2 directs, ce qui laisse Lobster, Pacifico et Fredoka
// sans paire A-V alors que leurs sous-tables de classes la portent. Lecture pure sur les octets de la
// fonte : aucun DOM, aucune horloge, le meme resultat a chaque appel.

/** Le crenage entre deux glyphes (par indice), en unites de la fonte ; 0 quand la fonte n'en dit rien. */
export type LecteurCrenage = (gauche: number, droite: number) => number;

/** Le nombre de bits a 1 dans un entier de 16 bits. */
const bits = (v: number): number => { let n = 0; for (let x = v & 0xffff; x; x >>= 1) n += x & 1; return n; };

/** Une zone de la table GPOS, adressee en octets depuis son debut ; lever (RangeError) hors limites. */
class Zone {
  constructor(readonly vue: DataView, readonly debut: number) {}
  u16(o: number): number { return this.vue.getUint16(this.debut + o); }
  i16(o: number): number { return this.vue.getInt16(this.debut + o); }
  u32(o: number): number { return this.vue.getUint32(this.debut + o); }
  /** Une sous-zone dont le decalage est lu en 16 bits a `o`, relatif a cette zone. */
  sous16(o: number): Zone { return new Zone(this.vue, this.debut + this.u16(o)); }
  etiquette(o: number): string { return String.fromCharCode(this.vue.getUint8(this.debut + o), this.vue.getUint8(this.debut + o + 1), this.vue.getUint8(this.debut + o + 2), this.vue.getUint8(this.debut + o + 3)); }
}

/** Le rang d'un glyphe dans une table de couverture, ou -1. */
function rangCouverture(c: Zone, glyphe: number): number {
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

/** La classe d'un glyphe dans une table de classes ; 0 quand il n'y figure pas. */
function classeDe(c: Zone, glyphe: number): number {
  const format = c.u16(0);
  if (format === 1) {
    const debut = c.u16(2), n = c.u16(4);
    return glyphe >= debut && glyphe < debut + n ? c.u16(6 + (glyphe - debut) * 2) : 0;
  }
  if (format === 2) {
    const n = c.u16(2);
    for (let i = 0; i < n; i++) if (glyphe >= c.u16(4 + i * 6) && glyphe <= c.u16(6 + i * 6)) return c.u16(8 + i * 6);
  }
  return 0;
}

/** Ou, dans un enregistrement de valeur, se trouve l'avance horizontale (apres les deux placements). */
const decalageAvance = (format: number): number => bits(format & 0x3) * 2;

/** L'avance horizontale d'un enregistrement de valeur lu a `o`, ou 0 si le format n'en porte pas. */
const avanceDe = (z: Zone, o: number, format: number): number => ((format & 0x4) !== 0 ? z.i16(o + decalageAvance(format)) : 0);

/** Le crenage d'une sous-table de paires ; null quand elle ne dit rien de cette paire (on passe a la suivante). */
function paire(sous: Zone, gauche: number, droite: number): number | null {
  const format = sous.u16(0), v1 = sous.u16(4), v2 = sous.u16(6);
  const rang = rangCouverture(sous.sous16(2), gauche);
  if (rang < 0) return null;
  const taille1 = bits(v1 & 0xff) * 2, taille2 = bits(v2 & 0xff) * 2;
  if (format === 1) {
    const jeu = sous.sous16(10 + rang * 2), n = jeu.u16(0), pas = 2 + taille1 + taille2;
    for (let i = 0; i < n; i++) {
      const o = 2 + i * pas, second = jeu.u16(o);
      if (second === droite) return avanceDe(jeu, o + 2, v1);
      if (second > droite) return null;
    }
    return null;
  }
  if (format === 2) {
    const c1 = classeDe(sous.sous16(8), gauche), c2 = classeDe(sous.sous16(10), droite), n2 = sous.u16(14);
    if (c1 >= sous.u16(12) || c2 >= n2) return null;
    return avanceDe(sous, 16 + (c1 * n2 + c2) * (taille1 + taille2), v1);
  }
  return null;
}

/** La sous-table de paires derriere une sous-table de lookup, directe (type 2) ou d'extension (type 9, format 1 vers le type 2). */
function sousTableDePaires(lookup: Zone, type: number, i: number): Zone | null {
  const sous = lookup.sous16(6 + i * 2);
  if (type === 2) return sous;
  if (type === 9 && sous.u16(0) === 1 && sous.u16(2) === 2) return new Zone(sous.vue, sous.debut + sous.u32(4));
  return null;
}

/** Les indices de lookups de la feature « kern » du script latin (a defaut DFLT, a defaut le premier), langue par defaut. */
function lookupsKern(gpos: Zone): number[] {
  const scripts = gpos.sous16(4), nScripts = scripts.u16(0);
  const choisi = (etiq: string) => { for (let i = 0; i < nScripts; i++) if (scripts.etiquette(2 + i * 6) === etiq) return scripts.sous16(2 + i * 6 + 4); return null; };
  const script = choisi('latn') ?? choisi('DFLT');
  if (!script || script.u16(0) === 0) return [];
  const langue = script.sous16(0), requis = langue.u16(2), nIndices = langue.u16(4);
  const caracteristiques = gpos.sous16(6), nCaracs = caracteristiques.u16(0);
  const indices = [...Array.from({ length: nIndices }, (_, i) => langue.u16(6 + i * 2)), ...(requis !== 0xffff ? [requis] : [])];
  const lookups = new Set<number>();
  for (const k of indices) {
    if (k >= nCaracs || caracteristiques.etiquette(2 + k * 6) !== 'kern') continue;
    const carac = caracteristiques.sous16(2 + k * 6 + 4), n = carac.u16(2);
    for (let i = 0; i < n; i++) lookups.add(carac.u16(4 + i * 2));
  }
  return [...lookups].sort((a, b) => a - b);
}

/** L'adresse de la table GPOS dans le fichier (repertoire sfnt), ou null s'il n'y en a pas. */
function adresseGpos(vue: DataView): number | null {
  const version = vue.getUint32(0);
  if (version !== 0x00010000 && version !== 0x4f54544f && version !== 0x74727565) return null;
  const n = vue.getUint16(4);
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    if (vue.getUint32(o) === 0x47504f53) return vue.getUint32(o + 8);
  }
  return null;
}

/**
 * Le lecteur de crenage GPOS d'une fonte, ou null quand elle n'en porte pas (ou que ses octets ne se lisent
 * pas) : l'appelant se rabat alors sur la bibliotheque. Plusieurs lookups « kern » s'additionnent, comme
 * le fait un moteur de mise en forme ; dans un lookup, la premiere sous-table qui parle de la paire l'emporte.
 */
export function lireCrenageGpos(octets: ArrayBuffer): LecteurCrenage | null {
  try {
    const vue = new DataView(octets), debut = adresseGpos(vue);
    if (debut === null) return null;
    const gpos = new Zone(vue, debut), liste = gpos.sous16(8);
    const lookups = lookupsKern(gpos).map(i => liste.sous16(2 + i * 2)).filter(l => l.u16(0) === 2 || l.u16(0) === 9);
    if (!lookups.length) return null;
    const cache = new Map<number, number>();
    return (gauche, droite) => {
      const cle = gauche * 65536 + droite, deja = cache.get(cle);
      if (deja !== undefined) return deja;
      let total = 0;
      try {
        for (const l of lookups) {
          const type = l.u16(0), n = l.u16(4);
          for (let i = 0; i < n; i++) {
            const sous = sousTableDePaires(l, type, i), v = sous ? paire(sous, gauche, droite) : null;
            if (v !== null) { total += v; break; }
          }
        }
      } catch { total = 0; }
      cache.set(cle, total);
      return total;
    };
  } catch { return null; }
}
