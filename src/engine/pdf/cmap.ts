// Les CMap d'un PDF (ISO 32000-1, 9.7.5 et 9.10.3) : la table /ToUnicode d'une police (code -> texte) et l'encodage d'une police
// composite ecrit dans le fichier (code -> CID, longueur des codes). Seul le sous-ensemble que les producteurs ecrivent est lu :
// codespacerange, bfchar, bfrange (destination simple ou tableau), cidchar, cidrange. Bornes : au plus 65 536 entrees par plage
// et 200 000 en tout ; au-dela, le reste est ignore (le texte d'un code inconnu est vide, le dessin de la glyphe ne change pas).

import { Lecteur } from './lexique.js';
import { SyntaxePdf } from './limites.js';
import { Mot, estChaine, estNombre, type ObjetPdf } from './objets.js';
import { lireObjet } from './lexique.js';

export interface CMap {
  /** Le texte de chaque code. */
  readonly unicode: Map<number, string>;
  /** Le CID de chaque code (encodage d'une police composite). */
  readonly cid: Map<number, number>;
  /** Les longueurs de code en octets que la CMap declare (codespacerange), avec leur plage. */
  readonly espaces: ReadonlyArray<{ readonly octets: number; readonly bas: number; readonly haut: number }>;
}

const PLAGE_MAX = 65_536, ENTREES_MAX = 200_000;

const code = (c: { v: string }): number => { let n = 0; for (let i = 0; i < c.v.length && i < 4; i++) n = n * 256 + (c.v.charCodeAt(i) & 0xff); return n; };

/** Le texte d'une destination UTF-16BE (une paire de substitution comprise). */
function utf16(c: { v: string }): string {
  let s = '';
  for (let i = 0; i + 1 < c.v.length; i += 2) s += String.fromCharCode(((c.v.charCodeAt(i) & 0xff) << 8) | (c.v.charCodeAt(i + 1) & 0xff));
  return s;
}

/** Le texte suivant : le dernier code unite augmente de `pas` (bfrange a destination simple). */
const suivant = (s: string, pas: number): string => (s.length ? s.slice(0, -1) + String.fromCharCode((s.charCodeAt(s.length - 1) + pas) & 0xffff) : s);

/** Lit une CMap ; un defaut de syntaxe arrete la lecture, ce qui precede est garde. */
export function lireCMap(octets: Uint8Array): CMap {
  const unicode = new Map<number, string>(), cid = new Map<number, number>();
  const espaces: Array<{ octets: number; bas: number; haut: number }> = [];
  const l = new Lecteur(octets);
  const pile: ObjetPdf[] = [];
  let entrees = 0;
  const poser = <T>(m: Map<number, T>, k: number, v: T) => { if (entrees++ < ENTREES_MAX) m.set(k, v); };
  try {
    for (;;) {
      const o = lireObjet(l, false);
      if (o === undefined) break;
      if (!(o instanceof Mot)) { pile.push(o); if (pile.length > 3 * 10_000) pile.splice(0, pile.length - 300); continue; }
      const args = pile.splice(0);
      switch (o.v) {
        case 'endcodespacerange':
          for (let i = 0; i + 1 < args.length; i += 2) { const a = args[i], b = args[i + 1]; if (estChaine(a) && estChaine(b)) espaces.push({ octets: Math.max(1, Math.min(4, a.v.length)), bas: code(a), haut: code(b) }); }
          break;
        case 'endbfchar':
          for (let i = 0; i + 1 < args.length; i += 2) { const a = args[i], b = args[i + 1]; if (estChaine(a) && estChaine(b)) poser(unicode, code(a), utf16(b)); }
          break;
        case 'endbfrange':
          for (let i = 0; i + 2 < args.length; i += 3) {
            const a = args[i], b = args[i + 1], d = args[i + 2];
            if (!estChaine(a) || !estChaine(b)) continue;
            const bas = code(a), haut = Math.min(code(b), bas + PLAGE_MAX - 1);
            for (let k = bas; k <= haut; k++) {
              if (estChaine(d)) poser(unicode, k, suivant(utf16(d), k - bas));
              else if (Array.isArray(d)) { const x = (d as ObjetPdf[])[k - bas]; if (estChaine(x)) poser(unicode, k, utf16(x)); }
            }
          }
          break;
        case 'endcidchar':
          for (let i = 0; i + 1 < args.length; i += 2) { const a = args[i], b = args[i + 1]; if (estChaine(a) && estNombre(b)) poser(cid, code(a), b); }
          break;
        case 'endcidrange':
          for (let i = 0; i + 2 < args.length; i += 3) {
            const a = args[i], b = args[i + 1], d = args[i + 2];
            if (!estChaine(a) || !estChaine(b) || !estNombre(d)) continue;
            const bas = code(a), haut = Math.min(code(b), bas + PLAGE_MAX - 1);
            for (let k = bas; k <= haut; k++) poser(cid, k, d + k - bas);
          }
          break;
        default: break;
      }
    }
  } catch (e) {
    if (!(e instanceof SyntaxePdf)) throw e;
  }
  return { unicode, cid, espaces };
}

/** Decoupe une chaine en codes selon les longueurs de la CMap (1 octet faute d'espace declare). */
export function decouper(chaine: string, espaces: CMap['espaces'] | null, deuxOctets: boolean): number[] {
  const codes: number[] = [];
  for (let i = 0; i < chaine.length;) {
    let n = deuxOctets ? 2 : 1;
    if (espaces && espaces.length) {
      // La plus courte longueur dont une plage contient le code lu : la regle de 9.7.6.2.
      n = 1;
      for (let k = 1; k <= 4; k++) {
        let v = 0;
        for (let j = 0; j < k; j++) v = v * 256 + (chaine.charCodeAt(i + j) & 0xff);
        if (espaces.some(e => e.octets === k && v >= e.bas && v <= e.haut)) { n = k; break; }
        if (k === 4) n = espaces[0]?.octets ?? 1;
      }
    }
    let v = 0;
    for (let j = 0; j < n; j++) v = v * 256 + (chaine.charCodeAt(i + j) & 0xff);
    codes.push(v);
    i += n;
  }
  return codes;
}
