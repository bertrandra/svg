// Une compression zlib (RFC 1950, RFC 1951) ecrite a la main pour les flux d'un PDF (ADR-0018) : les pixels d'une image decodee et
// son alpha (ADR-0012, etape 13a). Pure et deterministe : memes octets d'entree, memes octets de sortie, quel que soit le navigateur
// (CompressionStream ne le promet pas, chaque moteur a son zlib). Codes de Huffman fixes et recherche de repetitions par une table de
// hachage a chaines courtes : moins serre que zlib au niveau 6, mais un alpha ou un aplat se reduisent a presque rien. Ce qui ne
// gagne rien (une photo deja bruitee) part en blocs stockes, jamais plus gros que l'entree de plus de quelques octets par 64 Kio.

const FENETRE = 32768, LONGUEUR_MAX = 258, CHAINE_MAX = 24;
const BITS_HACHAGE = 15, MASQUE_HACHAGE = (1 << BITS_HACHAGE) - 1;

// Les longueurs 3..258 et les distances 1..32768 : leur code, le nombre de bits en plus et la base (RFC 1951, 3.2.5).
const BASES_LONGUEUR = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const BITS_LONGUEUR = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const BASES_DISTANCE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const BITS_DISTANCE = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

/** Le code d'une longueur (index dans les tables), par table directe. */
const CODE_LONGUEUR = (() => {
  const t = new Uint8Array(LONGUEUR_MAX + 1);
  for (let c = 0; c < BASES_LONGUEUR.length; c++) {
    const base = BASES_LONGUEUR[c] ?? 0, fin = c + 1 < BASES_LONGUEUR.length ? (BASES_LONGUEUR[c + 1] ?? 0) : LONGUEUR_MAX + 1;
    for (let l = base; l < fin && l <= LONGUEUR_MAX; l++) t[l] = c;
  }
  t[LONGUEUR_MAX] = 28;
  return t;
})();

function codeDistance(d: number): number {
  let c = 0;
  while (c + 1 < BASES_DISTANCE.length && (BASES_DISTANCE[c + 1] ?? Infinity) <= d) c++;
  return c;
}

/** Un ecrivain de bits, du poids faible au poids fort (l'ordre de DEFLATE). */
class Bits {
  private tampon: Uint8Array;
  private n = 0;
  private acc = 0;
  private nbits = 0;
  constructor(capacite: number) { this.tampon = new Uint8Array(Math.max(64, capacite)); }
  private octet(v: number): void {
    if (this.n >= this.tampon.length) { const t = new Uint8Array(this.tampon.length * 2); t.set(this.tampon); this.tampon = t; }
    this.tampon[this.n++] = v;
  }
  ecrire(valeur: number, nbits: number): void {
    this.acc |= valeur << this.nbits;
    this.nbits += nbits;
    while (this.nbits >= 8) { this.octet(this.acc & 0xff); this.acc >>>= 8; this.nbits -= 8; }
  }
  /** Un code de Huffman s'ecrit du bit de poids fort au bit de poids faible : on le renverse. */
  code(valeur: number, nbits: number): void {
    let r = 0;
    for (let i = 0; i < nbits; i++) r |= ((valeur >>> i) & 1) << (nbits - 1 - i);
    this.ecrire(r, nbits);
  }
  aligner(): void { if (this.nbits > 0) { this.octet(this.acc & 0xff); this.acc = 0; this.nbits = 0; } }
  brut(o: Uint8Array): void { for (const v of o) this.octet(v); }
  get taille(): number { return this.n + (this.nbits > 0 ? 1 : 0); }
  fin(): Uint8Array { this.aligner(); return this.tampon.slice(0, this.n); }
}

/** Le code fixe d'un litteral ou d'une longueur (0..287). */
function litteral(b: Bits, v: number): void {
  if (v < 144) b.code(0x30 + v, 8);
  else if (v < 256) b.code(0x190 + v - 144, 9);
  else if (v < 280) b.code(v - 256, 7);
  else b.code(0xc0 + v - 280, 8);
}

function adler32(o: Uint8Array): number {
  let a = 1, s = 0;
  for (let i = 0; i < o.length;) {
    const fin = Math.min(o.length, i + 5552);
    for (; i < fin; i++) { a += o[i] ?? 0; s += a; }
    a %= 65521; s %= 65521;
  }
  return ((s << 16) | a) >>> 0;
}

/** Les donnees en un seul bloc a codes fixes, repetitions comprises ; s'arrete (null) des que la sortie depasse `plafond`. */
function blocFixe(o: Uint8Array, plafond: number): Uint8Array | null {
  const b = new Bits(Math.min(plafond, o.length + 64));
  b.ecrire(1, 1); // dernier bloc
  b.ecrire(1, 2); // codes fixes
  const tete = new Int32Array(1 << BITS_HACHAGE).fill(-1), precedent = new Int32Array(FENETRE).fill(-1);
  const hacher = (i: number) => ((((o[i] ?? 0) << 10) ^ ((o[i + 1] ?? 0) << 5) ^ (o[i + 2] ?? 0)) * 2654435761 >>> (32 - BITS_HACHAGE)) & MASQUE_HACHAGE;
  const inserer = (i: number) => { if (i + 2 >= o.length) return; const h = hacher(i); precedent[i & (FENETRE - 1)] = tete[h] ?? -1; tete[h] = i; };
  let i = 0;
  while (i < o.length) {
    let meilleure = 0, distance = 0;
    if (i + 2 < o.length) {
      let j = tete[hacher(i)] ?? -1, essais = 0;
      const max = Math.min(LONGUEUR_MAX, o.length - i);
      while (j >= 0 && i - j <= FENETRE && essais++ < CHAINE_MAX) {
        if (o[j + meilleure] === o[i + meilleure]) {
          let l = 0;
          while (l < max && o[j + l] === o[i + l]) l++;
          if (l > meilleure) { meilleure = l; distance = i - j; if (l === max) break; }
        }
        const k = precedent[j & (FENETRE - 1)] ?? -1;
        if (k >= j) break;
        j = k;
      }
    }
    if (meilleure >= 3) {
      const c = CODE_LONGUEUR[meilleure] ?? 0;
      litteral(b, 257 + c);
      if (BITS_LONGUEUR[c]) b.ecrire(meilleure - (BASES_LONGUEUR[c] ?? 0), BITS_LONGUEUR[c] ?? 0);
      const cd = codeDistance(distance);
      b.code(cd, 5);
      if (BITS_DISTANCE[cd]) b.ecrire(distance - (BASES_DISTANCE[cd] ?? 0), BITS_DISTANCE[cd] ?? 0);
      for (let k = 0; k < meilleure; k++) inserer(i + k);
      i += meilleure;
    } else {
      litteral(b, o[i] ?? 0);
      inserer(i);
      i++;
    }
    if (b.taille > plafond) return null;
  }
  litteral(b, 256);
  return b.fin();
}

/** Les donnees en blocs stockes (sans compression), de 65 535 octets au plus. */
function blocsStockes(o: Uint8Array): Uint8Array {
  const b = new Bits(o.length + 5 * Math.ceil(o.length / 65535 + 1));
  let i = 0;
  do {
    const n = Math.min(65535, o.length - i), dernier = i + n >= o.length;
    b.ecrire(dernier ? 1 : 0, 1);
    b.ecrire(0, 2);
    b.aligner();
    b.brut(new Uint8Array([n & 0xff, n >>> 8, ~n & 0xff, (~n >>> 8) & 0xff]));
    b.brut(o.subarray(i, i + n));
    i += n;
  } while (i < o.length);
  return b.fin();
}

/** Les octets compresses en un flux zlib (en-tete, donnees DEFLATE, somme Adler-32), prets pour `/FlateDecode`. */
export function deflateZlib(o: Uint8Array): Uint8Array {
  const stockes = 5 * Math.ceil(o.length / 65535 + 1) + o.length;
  const corps = blocFixe(o, stockes) ?? blocsStockes(o);
  const out = new Uint8Array(corps.length + 6);
  // 0x78 0x01 : fenetre de 32 Kio, sans dictionnaire, (0x7801 % 31 === 0).
  out[0] = 0x78; out[1] = 0x01;
  out.set(corps, 2);
  const s = adler32(o), k = corps.length + 2;
  out[k] = s >>> 24; out[k + 1] = (s >>> 16) & 0xff; out[k + 2] = (s >>> 8) & 0xff; out[k + 3] = s & 0xff;
  return out;
}
