// Les fonctions d'un PDF (ISO 32000-1, 7.10) : ce qui donne la couleur d'un ton direct (Separation, DeviceN) ou d'un point de
// degrade. Types 2 (exponentielle), 3 (assemblage) et 4 (calculatrice PostScript) en entier ; type 0 (echantillonnee) pour une
// entree seulement, le cas des teintes et des degrades. Une fonction qui ne se lit pas rend null : l'appelant approche la
// couleur et le dit. Chaque evaluation est bornee (pas de boucle dans le langage du type 4, et un nombre d'operations plafonne).

import { Lecteur } from './lexique.js';
import { SyntaxePdf } from './limites.js';
import { Mot, estDict, estFlux, estNombre, estTableau, type Dict, type ObjetPdf } from './objets.js';
import type { DocumentPdf } from './structure.js';

/** Une fonction : des entrees, des sorties ; null si elle ne se calcule pas. */
export type Fonction = (entree: readonly number[]) => number[] | null;

const PROFONDEUR_MAX = 8, OPERATIONS_MAX = 10_000, PILE_MAX = 100;

const nombres = (doc: DocumentPdf, o: ObjetPdf | undefined): number[] | null => {
  const t = doc.resoudre(o);
  if (!estTableau(t)) return null;
  const v = t.map(x => doc.resoudre(x));
  return v.every(estNombre) ? v : null;
};
const borner = (v: number, a: number, b: number) => Math.min(Math.max(v, Math.min(a, b)), Math.max(a, b));

/** La fonction decrite par `o` (un dictionnaire, un flux, ou un tableau de fonctions a une sortie), ou null. */
export function lireFonction(doc: DocumentPdf, o: ObjetPdf | undefined, profondeur = 0): Fonction | null {
  if (profondeur > PROFONDEUR_MAX) return null;
  const v = doc.resoudre(o);
  if (estTableau(v)) {
    const parties = v.map(x => lireFonction(doc, x, profondeur + 1));
    if (!parties.length || parties.some(p => p === null)) return null;
    return e => { const r: number[] = []; for (const p of parties) { const s = p?.(e); if (!s) return null; r.push(...s); } return r; };
  }
  const d = estDict(v) ? v : estFlux(v) ? v.dict : null;
  if (!d) return null;
  const domaine = nombres(doc, d.get('Domain')) ?? [0, 1], plage = nombres(doc, d.get('Range'));
  const type = doc.resoudre(d.get('FunctionType'));
  let f: Fonction | null = null;
  if (type === 2) f = exponentielle(doc, d);
  else if (type === 3) f = assemblage(doc, d, domaine, profondeur);
  else if (type === 4 && estFlux(v)) f = calculatrice(doc.donnees(v));
  else if (type === 0 && estFlux(v)) f = echantillonnee(doc, d, doc.donnees(v), domaine, plage);
  if (!f) return null;
  const g = f;
  return e => {
    const x = e.map((v2, i) => borner(v2, domaine[2 * i] ?? 0, domaine[2 * i + 1] ?? 1));
    const r = g(x);
    if (!r || r.some(n => !Number.isFinite(n))) return null;
    return plage ? r.map((n, i) => (i * 2 + 1 < plage.length ? borner(n, plage[2 * i] ?? 0, plage[2 * i + 1] ?? 1) : n)) : r;
  };
}

function exponentielle(doc: DocumentPdf, d: Dict): Fonction | null {
  const c0 = nombres(doc, d.get('C0')) ?? [0], c1 = nombres(doc, d.get('C1')) ?? [1], n = doc.resoudre(d.get('N'));
  if (!estNombre(n) || c0.length !== c1.length) return null;
  return ([x = 0]) => { const t = Math.pow(x, n); return c0.map((a, i) => a + t * ((c1[i] ?? 0) - a)); };
}

function assemblage(doc: DocumentPdf, d: Dict, domaine: readonly number[], profondeur: number): Fonction | null {
  const fonctions = doc.resoudre(d.get('Functions')), bornes = nombres(doc, d.get('Bounds')) ?? [], encode = nombres(doc, d.get('Encode'));
  if (!estTableau(fonctions) || !encode) return null;
  const parties = fonctions.map(x => lireFonction(doc, x, profondeur + 1));
  if (!parties.length || parties.some(p => p === null) || bornes.length !== parties.length - 1 || encode.length < 2 * parties.length) return null;
  const d0 = domaine[0] ?? 0, d1 = domaine[1] ?? 1;
  return ([x = 0]) => {
    let k = 0;
    while (k < bornes.length && x >= (bornes[k] ?? 0)) k++;
    const a = k === 0 ? d0 : bornes[k - 1] ?? d0, b = k === bornes.length ? d1 : bornes[k] ?? d1;
    const e0 = encode[2 * k] ?? 0, e1 = encode[2 * k + 1] ?? 1;
    const t = b === a ? e0 : e0 + ((x - a) * (e1 - e0)) / (b - a);
    return parties[k]?.([t]) ?? null;
  };
}

function echantillonnee(doc: DocumentPdf, d: Dict, donnees: Uint8Array, domaine: readonly number[], plage: readonly number[] | null): Fonction | null {
  const taille = nombres(doc, d.get('Size')), bits = doc.resoudre(d.get('BitsPerSample'));
  if (!taille || taille.length !== 1 || !plage || !estNombre(bits) || ![1, 2, 4, 8, 12, 16, 24, 32].includes(bits)) return null;
  const n = Math.floor(taille[0] ?? 0), sorties = plage.length / 2;
  if (n < 1 || sorties < 1 || n * sorties * bits > donnees.length * 8) return null;
  const encode = nombres(doc, d.get('Encode')) ?? [0, n - 1], decode = nombres(doc, d.get('Decode')) ?? plage;
  const max = Math.pow(2, bits) - 1;
  const echantillon = (i: number, j: number): number => {
    let pos = (i * sorties + j) * bits, v = 0;
    for (let k = 0; k < bits; k++, pos++) v = v * 2 + (((donnees[pos >> 3] ?? 0) >> (7 - (pos & 7))) & 1);
    return v;
  };
  return ([x = 0]) => {
    const d0 = domaine[0] ?? 0, d1 = domaine[1] ?? 1;
    const e = (encode[0] ?? 0) + ((x - d0) * ((encode[1] ?? n - 1) - (encode[0] ?? 0))) / (d1 - d0 || 1);
    const p = borner(e, 0, n - 1), i0 = Math.floor(p), i1 = Math.min(i0 + 1, n - 1), t = p - i0;
    const r: number[] = [];
    for (let j = 0; j < sorties; j++) {
      const s = echantillon(i0, j) * (1 - t) + echantillon(i1, j) * t;
      r.push((decode[2 * j] ?? 0) + (s * ((decode[2 * j + 1] ?? 1) - (decode[2 * j] ?? 0))) / max);
    }
    return r;
  };
}

type Programme = ReadonlyArray<number | string | Programme>;

/** Le programme d'une fonction de type 4 : des nombres, des operateurs, des blocs { } pour if et ifelse. */
function lireProgramme(octets: Uint8Array): Programme | null {
  const l = new Lecteur(octets);
  const lire = (profondeur: number): Programme => {
    if (profondeur > PROFONDEUR_MAX) throw new SyntaxePdf('une fonction PostScript trop imbriquée');
    const p: Array<number | string | Programme> = [];
    for (;;) {
      const j = l.jeton();
      if (j === undefined) { if (profondeur > 0) throw new SyntaxePdf('une fonction PostScript jamais fermée'); return p; }
      if (j instanceof Mot) {
        if (j.v === '{') p.push(lire(profondeur + 1));
        else if (j.v === '}') return p;
        else p.push(j.v);
      } else if (typeof j === 'number') p.push(j);
      else throw new SyntaxePdf('une fonction PostScript illisible');
    }
  };
  try {
    const tout = lire(0);
    const premier = tout[0];
    return Array.isArray(premier) ? premier : null;
  } catch (e) { if (e instanceof SyntaxePdf) return null; throw e; }
}

const UN: Readonly<Record<string, (a: number) => number>> = {
  neg: a => -a, abs: Math.abs, ceiling: Math.ceil, floor: Math.floor, round: a => Math.floor(a + 0.5), truncate: Math.trunc,
  sqrt: Math.sqrt, sin: a => Math.sin((a * Math.PI) / 180), cos: a => Math.cos((a * Math.PI) / 180),
  ln: Math.log, log: Math.log10, cvi: Math.trunc, cvr: a => a, not: a => (a === 0 ? 1 : a === 1 ? 0 : ~a)
};
const DEUX: Readonly<Record<string, (a: number, b: number) => number>> = {
  add: (a, b) => a + b, sub: (a, b) => a - b, mul: (a, b) => a * b, div: (a, b) => a / b, idiv: (a, b) => Math.trunc(a / b),
  mod: (a, b) => a % b, exp: (a, b) => Math.pow(a, b), atan: (a, b) => ((Math.atan2(a, b) * 180) / Math.PI + 360) % 360,
  eq: (a, b) => +(a === b), ne: (a, b) => +(a !== b), gt: (a, b) => +(a > b), ge: (a, b) => +(a >= b), lt: (a, b) => +(a < b), le: (a, b) => +(a <= b),
  and: (a, b) => a & b, or: (a, b) => a | b, xor: (a, b) => a ^ b, bitshift: (a, b) => (b >= 0 ? a << b : a >> -b)
};

function calculatrice(octets: Uint8Array): Fonction | null {
  const programme = lireProgramme(octets);
  if (!programme) return null;
  return entree => {
    const pile = [...entree];
    let operations = 0;
    const executer = (p: Programme): boolean => {
      // Les blocs { } ne s'executent que par `if` ou `ifelse`, qui prennent les derniers blocs lus.
      const blocs: Programme[] = [];
      for (const x of p) {
        if (++operations > OPERATIONS_MAX || pile.length > PILE_MAX) return false;
        if (typeof x === 'number') { pile.push(x); continue; }
        if (Array.isArray(x)) { blocs.push(x as Programme); continue; }
        if (x === 'if' || x === 'ifelse') {
          const corps = x === 'if' ? blocs.splice(-1, 1) : blocs.splice(-2, 2), cond = pile.pop();
          if (corps.length !== (x === 'if' ? 1 : 2) || cond === undefined) return false;
          const choisi = x === 'if' ? (cond ? corps[0] : undefined) : cond ? corps[0] : corps[1];
          if (choisi && !executer(choisi)) return false;
          continue;
        }
        if (!operer(x as string, pile)) return false;
      }
      return true;
    };
    return executer(programme) ? pile : null;
  };
}

/** Un operateur de la calculatrice ; faux si la pile ne le permet pas. */
function operer(op: string, pile: number[]): boolean {
  const un = UN[op], deux = DEUX[op];
  if (deux) { if (pile.length < 2) return false; const b = pile.pop() ?? 0, a = pile.pop() ?? 0; pile.push(deux(a, b)); return true; }
  if (un) { if (pile.length < 1) return false; pile.push(un(pile.pop() ?? 0)); return true; }
  switch (op) {
    case 'true': pile.push(1); return true;
    case 'false': pile.push(0); return true;
    case 'pop': return pile.pop() !== undefined;
    case 'dup': { if (!pile.length) return false; pile.push(pile[pile.length - 1] ?? 0); return true; }
    case 'exch': { if (pile.length < 2) return false; const b = pile.pop() ?? 0, a = pile.pop() ?? 0; pile.push(b, a); return true; }
    case 'copy': { const n = pile.pop() ?? -1; if (n < 0 || n > pile.length) return false; pile.push(...pile.slice(pile.length - n)); return true; }
    case 'index': { const n = pile.pop() ?? -1; if (n < 0 || n >= pile.length) return false; pile.push(pile[pile.length - 1 - n] ?? 0); return true; }
    case 'roll': {
      const j = pile.pop() ?? 0, n = pile.pop() ?? -1;
      if (n < 0 || n > pile.length || !Number.isInteger(j) || !Number.isInteger(n)) return false;
      const morceau = pile.splice(pile.length - n, n), k = n ? ((j % n) + n) % n : 0;
      pile.push(...morceau.slice(n - k), ...morceau.slice(0, n - k));
      return true;
    }
    default: return false;
  }
}
