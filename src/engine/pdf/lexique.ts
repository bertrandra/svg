// Le decoupage d'un PDF en jetons, puis en objets (ISO 32000-1, 7.2 et 7.3), sur des octets : un PDF est un fichier binaire.
// Un balayage lineaire ecrit a la main, comme `util/xml.ts` : chaque octet est lu une fois, l'imbrication des tableaux et des
// dictionnaires est bornee, et un texte casse leve `SyntaxePdf` (que la lecture rattrape et nomme), jamais autre chose.
// Le meme lecteur sert a la structure du fichier (ou `12 0 R` est un renvoi) et aux flux de contenu (ou il n'y en a pas).

import { LIMITES_PDF, SyntaxePdf } from './limites.js';
import { Mot, type Chaine, type Dict, type ObjetPdf } from './objets.js';

const BLANC = new Uint8Array(256);
for (const c of [0, 9, 10, 12, 13, 32]) BLANC[c] = 1;
const DELIMITEUR = new Uint8Array(256);
for (const c of '()<>[]{}/%') DELIMITEUR[c.charCodeAt(0)] = 1;

/** Vrai pour un octet blanc au sens du PDF (NUL, tab, LF, FF, CR, espace). */
export const estBlanc = (c: number): boolean => BLANC[c] === 1;
/** Vrai pour un octet qui finit un jeton : blanc ou delimiteur. */
export const finitJeton = (c: number): boolean => BLANC[c] === 1 || DELIMITEUR[c] === 1;

const MOTS = new Map<string, Mot>();
/** Un mot-cle, toujours la meme instance pour le meme texte : un flux de contenu en repete des millions. */
export function mot(v: string): Mot {
  let m = MOTS.get(v);
  if (!m) { m = new Mot(v); if (MOTS.size < 4096) MOTS.set(v, m); }
  return m;
}

const hex = (c: number): number => (c >= 48 && c <= 57 ? c - 48 : c >= 65 && c <= 70 ? c - 55 : c >= 97 && c <= 102 ? c - 87 : -1);

/** Un lecteur de jetons sur `octets`, de `pos` a `fin` (exclu). */
export class Lecteur {
  pos: number;
  readonly fin: number;
  constructor(readonly octets: Uint8Array, debut = 0, fin = octets.length) {
    this.pos = debut;
    this.fin = Math.min(fin, octets.length);
  }

  /** Saute les blancs et les commentaires. */
  blancs(): void {
    const o = this.octets;
    while (this.pos < this.fin) {
      const c = o[this.pos] ?? 0;
      if (BLANC[c] === 1) { this.pos++; continue; }
      if (c !== 37) return;
      while (this.pos < this.fin && o[this.pos] !== 10 && o[this.pos] !== 13) this.pos++;
    }
  }

  /** Le prochain jeton : un nombre, un nom, une chaine, un mot (ou un delimiteur), ou undefined a la fin. */
  jeton(): number | string | Chaine | Mot | undefined {
    this.blancs();
    if (this.pos >= this.fin) return undefined;
    const o = this.octets, c = o[this.pos] ?? 0;
    if ((c >= 48 && c <= 57) || c === 43 || c === 45 || c === 46) return this.nombre();
    if (c === 47) return this.nom();
    if (c === 40) return this.chaineLitterale();
    if (c === 60) {
      if (o[this.pos + 1] === 60) { this.pos += 2; return mot('<<'); }
      return this.chaineHexa();
    }
    if (c === 62) {
      if (o[this.pos + 1] === 62) { this.pos += 2; return mot('>>'); }
      this.pos++;
      throw new SyntaxePdf('un « > » isolé');
    }
    if (c === 91 || c === 93 || c === 123 || c === 125) { this.pos++; return mot(String.fromCharCode(c)); }
    if (c === 41) { this.pos++; throw new SyntaxePdf('une « ) » isolée'); }
    return this.motCle();
  }

  private nombre(): number {
    const o = this.octets;
    let signe = 1, entier = 0, frac = 0, echelle = 1, point = false, chiffres = 0;
    // Plusieurs signes de suite (« --5 ») viennent de producteurs fautifs : le premier compte, comme dans les lecteurs courants.
    let premier = true;
    while (this.pos < this.fin) {
      const c = o[this.pos] ?? 0;
      if (c === 45 || c === 43) { if (premier && c === 45) signe = -1; premier = false; if (chiffres || point) break; this.pos++; continue; }
      if (c === 46) { if (point) break; point = true; this.pos++; continue; }
      if (c < 48 || c > 57) break;
      if (point) { if (echelle < 1e15) { frac = frac * 10 + (c - 48); echelle *= 10; } }
      else entier = entier * 10 + (c - 48);
      chiffres++;
      this.pos++;
    }
    const v = signe * (entier + frac / echelle);
    // « -0 » s'ecrirait « -0 » : zero est zero.
    return Number.isFinite(v) && v !== 0 ? v : 0;
  }

  private nom(): string {
    const o = this.octets;
    this.pos++;
    let s = '';
    const debut = this.pos;
    while (this.pos < this.fin) {
      const c = o[this.pos] ?? 0;
      if (BLANC[c] === 1 || DELIMITEUR[c] === 1) break;
      if (c === 35) {
        const a = hex(o[this.pos + 1] ?? 0), b = hex(o[this.pos + 2] ?? 0);
        if (a >= 0 && b >= 0) { s += String.fromCharCode(a * 16 + b); this.pos += 3; continue; }
      }
      s += String.fromCharCode(c);
      this.pos++;
      if (this.pos - debut > 1024) throw new SyntaxePdf('un nom dépasse 1 024 caractères');
    }
    return s;
  }

  private chaineLitterale(): Chaine {
    const o = this.octets, codes: number[] = [];
    let profondeur = 1, morceaux = '';
    this.pos++;
    while (this.pos < this.fin) {
      let c = o[this.pos++] ?? 0;
      if (c === 92) {
        const e = o[this.pos++] ?? 0;
        if (e === 110) c = 10; else if (e === 114) c = 13; else if (e === 116) c = 9; else if (e === 98) c = 8; else if (e === 102) c = 12;
        else if (e >= 48 && e <= 55) {
          let v = e - 48;
          for (let k = 0; k < 2 && (o[this.pos] ?? 0) >= 48 && (o[this.pos] ?? 0) <= 55; k++) v = v * 8 + ((o[this.pos++] ?? 0) - 48);
          c = v & 0xff;
        } else if (e === 13) { if (o[this.pos] === 10) this.pos++; continue; }
        else if (e === 10) continue;
        else c = e;
      } else if (c === 40) profondeur++;
      else if (c === 41 && --profondeur === 0) { morceaux += String.fromCharCode(...codes); return { t: 'chaine', v: morceaux }; }
      codes.push(c);
      // Par paquets : String.fromCharCode(...t) deborde la pile au-dela de quelques dizaines de milliers d'arguments.
      if (codes.length >= 8192) { morceaux += String.fromCharCode(...codes); codes.length = 0; }
    }
    throw new SyntaxePdf('une chaîne de texte n’est jamais fermée');
  }

  private chaineHexa(): Chaine {
    const o = this.octets, codes: number[] = [];
    let morceaux = '', moitie = -1;
    this.pos++;
    while (this.pos < this.fin) {
      const c = o[this.pos++] ?? 0;
      if (c === 62) {
        if (moitie >= 0) codes.push(moitie * 16);
        return { t: 'chaine', v: morceaux + String.fromCharCode(...codes) };
      }
      const v = hex(c);
      if (v < 0) { if (BLANC[c] === 1) continue; throw new SyntaxePdf('une chaîne hexadécimale porte un caractère étranger'); }
      if (moitie < 0) moitie = v; else { codes.push(moitie * 16 + v); moitie = -1; }
      if (codes.length >= 8192) { morceaux += String.fromCharCode(...codes); codes.length = 0; }
    }
    throw new SyntaxePdf('une chaîne hexadécimale n’est jamais fermée');
  }

  private motCle(): Mot {
    const o = this.octets, debut = this.pos;
    while (this.pos < this.fin && !finitJeton(o[this.pos] ?? 0)) this.pos++;
    if (this.pos === debut) { this.pos++; throw new SyntaxePdf('un caractère inattendu'); }
    if (this.pos - debut > 256) throw new SyntaxePdf('un mot-clé dépasse 256 caractères');
    let s = '';
    for (let i = debut; i < this.pos; i++) s += String.fromCharCode(o[i] ?? 0);
    return mot(s);
  }
}

/**
 * Le prochain objet, tableaux et dictionnaires compris. Avec `renvois`, « 12 0 R » est un renvoi (structure du fichier) ; dans un
 * flux de contenu, il n'y en a pas, et l'on epargne la lecture en avance de deux jetons apres chaque nombre. Rend un `Mot` pour un
 * mot-cle hors objet (un operateur, « obj », « stream »…), undefined a la fin.
 */
export function lireObjet(l: Lecteur, renvois: boolean, profondeur = 0): ObjetPdf | Mot | undefined {
  const j = l.jeton();
  if (j instanceof Mot) {
    switch (j.v) {
      case '[': return lireTableau(l, renvois, profondeur + 1);
      case '<<': return lireDict(l, renvois, profondeur + 1);
      case 'true': return true;
      case 'false': return false;
      case 'null': return null;
      default: return j;
    }
  }
  if (renvois && typeof j === 'number' && Number.isInteger(j) && j >= 0) {
    const avant = l.pos;
    const g = l.jeton();
    if (typeof g === 'number' && Number.isInteger(g) && g >= 0) {
      const r = l.jeton();
      if (r instanceof Mot && r.v === 'R') return { t: 'ref', n: j, g };
    }
    l.pos = avant;
  }
  return j;
}

function verifierProfondeur(profondeur: number): void {
  if (profondeur > LIMITES_PDF.imbrication) throw new SyntaxePdf('des tableaux ou dictionnaires imbriqués sur plus de ' + LIMITES_PDF.imbrication + ' niveaux');
}

function lireTableau(l: Lecteur, renvois: boolean, profondeur: number): ObjetPdf[] {
  verifierProfondeur(profondeur);
  const t: ObjetPdf[] = [];
  for (;;) {
    const o = lireObjet(l, renvois, profondeur);
    if (o === undefined) throw new SyntaxePdf('un tableau n’est jamais fermé');
    if (o instanceof Mot) {
      if (o.v === ']') return t;
      throw new SyntaxePdf('« ' + o.v.slice(0, 20) + ' » dans un tableau');
    }
    t.push(o);
  }
}

function lireDict(l: Lecteur, renvois: boolean, profondeur: number): Dict {
  verifierProfondeur(profondeur);
  const d = new Map<string, ObjetPdf>();
  for (;;) {
    const cle = lireObjet(l, renvois, profondeur);
    if (cle instanceof Mot && cle.v === '>>') return d;
    if (typeof cle !== 'string') throw new SyntaxePdf(cle === undefined ? 'un dictionnaire n’est jamais fermé' : 'une clé de dictionnaire qui n’est pas un nom');
    const v = lireObjet(l, renvois, profondeur);
    if (v === undefined) throw new SyntaxePdf('un dictionnaire n’est jamais fermé');
    if (v instanceof Mot) {
      // Une cle sans valeur avant la fermeture : les lecteurs courants l'oublient, on fait de meme.
      if (v.v === '>>') return d;
      throw new SyntaxePdf('« ' + v.v.slice(0, 20) + ' » comme valeur de dictionnaire');
    }
    // Une valeur nulle equivaut a une cle absente (7.3.7).
    if (v !== null) d.set(cle, v);
  }
}

/** La position de `motif` (en ASCII) dans `octets` a partir de `depuis`, ou -1 ; `jusqua` borne la recherche. */
export function chercher(octets: Uint8Array, motif: string, depuis: number, jusqua = octets.length): number {
  const premier = motif.charCodeAt(0), n = motif.length;
  for (let i = octets.indexOf(premier, depuis); i >= 0 && i + n <= jusqua; i = octets.indexOf(premier, i + 1)) {
    let k = 1;
    while (k < n && octets[i + k] === motif.charCodeAt(k)) k++;
    if (k === n) return i;
  }
  return -1;
}

/** La derniere position de `motif` dans `octets` avant `avant` (exclu), sans descendre sous `depuis` ; -1 sinon. */
export function chercherAvant(octets: Uint8Array, motif: string, avant: number, depuis = 0): number {
  const n = motif.length;
  for (let i = Math.min(avant, octets.length) - n; i >= depuis; i--) {
    let k = 0;
    while (k < n && octets[i + k] === motif.charCodeAt(k)) k++;
    if (k === n) return i;
  }
  return -1;
}
