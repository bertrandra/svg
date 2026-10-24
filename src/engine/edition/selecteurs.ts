// Les selecteurs CSS d'une feuille <style> : lus en une petite structure, puis confrontes a un noeud de
// l'arbre sans DOM (util/xml.ts). Le sous-ensemble utile a un SVG : type, `*`, `.classe` (autant qu'on
// veut), `#id`, attributs `[a]` `[a=v]` `[a~=v]` `[a|=v]` `[a^=v]` `[a$=v]` `[a*=v]` (drapeau `i`), descendant
// (`A B`) et enfant (`A > B`), groupes a virgules, `:root`, `:first-child`, `:last-child`, `:only-child`.
// Tout le reste (frere `+` et `~`, autres pseudo-classes et pseudo-elements, espaces de noms) n'est pas
// devine : le membre du groupe est ecarte avec une phrase precise, jamais en silence. Pur.

import type { Noeud } from '../../util/xml.js';
import { au } from '../../util/tableaux.js';
import { msgPseudo, MSG_FRERES, MSG_ESPACE_DE_NOMS } from './ignores.js';

export type Lien = 'descendant' | 'enfant';
type OperateurAttribut = '' | '=' | '~=' | '|=' | '^=' | '$=' | '*=';
export type PseudoLue = 'root' | 'first-child' | 'last-child' | 'only-child';

export type Condition =
  | { readonly t: 'classe'; readonly v: string }
  | { readonly t: 'id'; readonly v: string }
  | { readonly t: 'attribut'; readonly nom: string; readonly op: OperateurAttribut; readonly v: string; readonly i: boolean }
  | { readonly t: 'pseudo'; readonly v: PseudoLue };

/** Un selecteur compose : un type facultatif (null pour `*` ou absent) et toutes les conditions qui s'y ajoutent. */
export interface Compose { readonly type: string | null; readonly conditions: readonly Condition[] }

/** Un selecteur complexe, de gauche a droite : `parties[i]` et `parties[i + 1]` sont reliees par `liens[i]`. */
export interface Selecteur {
  readonly parties: readonly Compose[];
  readonly liens: readonly Lien[];
  /** (identifiants, classes + attributs + pseudo-classes, types) rangees en un seul nombre, comparable. */
  readonly specificite: number;
}

/** Ce qu'une liste de selecteurs donne : ceux qu'on sait confronter, et pourquoi on a ecarte les autres. */
export interface ListeSelecteurs {
  readonly selecteurs: readonly Selecteur[];
  /** Les phrases des membres valides mais non pris en charge (a dire si la regle peint). */
  readonly ignores: readonly string[];
  /** Vrai si un membre est une erreur de syntaxe : un navigateur abandonne alors toute la regle. */
  readonly invalide: boolean;
}

const IDENT = /^(?:[\w-]|[^\p{ASCII}]|\\[0-9a-fA-F]{1,6}\s?|\\[^\n])+/u;
const ATTRIBUT = /^\[\s*([^\s~|^$*=\]"']+)\s*(?:([~|^$*]?=)\s*("[^"]*"|'[^']*'|[^\s\]"']+)\s*([iIsS])?\s*)?\]/;
const PSEUDOS_LUES: ReadonlySet<string> = new Set(['root', 'first-child', 'last-child', 'only-child']);
const PSEUDO_ELEMENTS_UN_DEUX_POINTS = new Set(['before', 'after', 'first-line', 'first-letter']);

/** Un identifiant CSS rendu a sa valeur : `\:` donne `:`, `\31 23` donne `123`. */
function desechapper(t: string): string {
  return t.replace(/\\([0-9a-fA-F]{1,6})\s?|\\([^\n])/g, (_, hex: string | undefined, car: string | undefined) => {
    if (hex === undefined) return car ?? '';
    const n = parseInt(hex, 16);
    return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '�';
  });
}

/** Coupe `texte` aux virgules qui ne sont ni dans des parentheses, ni dans des crochets, ni dans une chaine. */
export function couperVirgules(texte: string): string[] {
  const out: string[] = [];
  let profondeur = 0, guillemet = '', debut = 0;
  for (let i = 0; i < texte.length; i++) {
    const c = texte.charAt(i);
    if (guillemet) { if (c === '\\') i++; else if (c === guillemet) guillemet = ''; continue; }
    if (c === '"' || c === "'") guillemet = c;
    else if (c === '\\') i++;
    else if (c === '(' || c === '[') profondeur++;
    else if (c === ')' || c === ']') profondeur = Math.max(0, profondeur - 1);
    else if (c === ',' && profondeur === 0) { out.push(texte.slice(debut, i)); debut = i + 1; }
  }
  out.push(texte.slice(debut));
  return out;
}

type Pas<T> = { suite: string; valeur: T } | { ignore: string } | null;

/** Le saut d'une pseudo-classe ou d'un pseudo-element qui commence a `:` ; `(…)` eventuel compris. */
function lirePseudo(s: string): Pas<PseudoLue | null> {
  const element = s.startsWith('::');
  const m = /^:{1,2}(-?[a-zA-Z][\w-]*)/.exec(s);
  if (!m) return null;
  const nom = (m[1] ?? '').toLowerCase();
  const reste = s.slice(m[0].length);
  if (reste.startsWith('(')) {
    // Une pseudo-classe fonctionnelle (:nth-child(2), :not(.a)) n'est jamais lue ; on verifie seulement qu'elle se ferme.
    let prof = 0;
    for (const c of reste) { if (c === '(') prof++; else if (c === ')' && --prof === 0) break; }
    return prof === 0 ? { ignore: msgPseudo(nom, false) } : null;
  }
  if (element || PSEUDO_ELEMENTS_UN_DEUX_POINTS.has(nom)) return { ignore: msgPseudo(nom, true) };
  if (PSEUDOS_LUES.has(nom)) return { suite: reste, valeur: nom as PseudoLue };
  return { ignore: msgPseudo(nom, false) };
}

/** Un selecteur compose lu au debut de `s` ; null si rien ne se lit. */
function lireCompose(s: string): Pas<Compose> {
  let reste = s, type: string | null = null, lu = false;
  const conditions: Condition[] = [];
  if (reste.startsWith('*')) { reste = reste.slice(1); lu = true; } else {
    const t = IDENT.exec(reste);
    if (t) { type = desechapper(t[0]); reste = reste.slice(t[0].length); lu = true; }
  }
  if (reste.startsWith('|') && !reste.startsWith('|=')) return { ignore: MSG_ESPACE_DE_NOMS };
  for (;;) {
    const c = reste.charAt(0);
    if (c === '.' || c === '#') {
      const m = IDENT.exec(reste.slice(1));
      if (!m) return null;
      conditions.push({ t: c === '.' ? 'classe' : 'id', v: desechapper(m[0]) });
      reste = reste.slice(1 + m[0].length);
    } else if (c === '[') {
      const m = ATTRIBUT.exec(reste);
      if (!m) return null;
      const brut = m[3] ?? '', v = /^["']/.test(brut) ? brut.slice(1, -1) : desechapper(brut);
      conditions.push({ t: 'attribut', nom: desechapper(m[1] ?? ''), op: (m[2] ?? '') as OperateurAttribut, v, i: (m[4] ?? '').toLowerCase() === 'i' });
      reste = reste.slice(m[0].length);
    } else if (c === ':') {
      const p = lirePseudo(reste);
      if (!p) return null;
      if ('ignore' in p) return p;
      if (p.valeur) conditions.push({ t: 'pseudo', v: p.valeur });
      reste = p.suite;
    } else break;
    lu = true;
  }
  return lu ? { suite: reste, valeur: { type, conditions } } : null;
}

/** La specificite d'une suite de composes : identifiants, puis classes / attributs / pseudo-classes, puis types. */
function specificiteDe(parties: readonly Compose[]): number {
  let a = 0, b = 0, c = 0;
  for (const p of parties) {
    if (p.type !== null) c++;
    for (const k of p.conditions) { if (k.t === 'id') a++; else b++; }
  }
  return a * 1e6 + b * 1e3 + c;
}

/** Un selecteur complexe ; `{ ignore }` pour un membre valide qu'on ne porte pas, null pour une erreur de syntaxe. */
function lireSelecteur(texte: string): Selecteur | { ignore: string } | null {
  let reste = texte.trim();
  const parties: Compose[] = [], liens: Lien[] = [];
  for (;;) {
    const p = lireCompose(reste);
    if (!p) return null;
    if ('ignore' in p) return p;
    parties.push(p.valeur);
    const apres = p.suite.trimStart(), blanc = apres.length !== p.suite.length;
    if (apres === '') break;
    const c = apres.charAt(0);
    if (c === '+' || c === '~') return { ignore: MSG_FRERES };
    if (c === '>') { liens.push('enfant'); reste = apres.slice(1).trimStart(); } else if (blanc) { liens.push('descendant'); reste = apres; } else return null;
    if (reste === '') return null;
  }
  return { parties, liens, specificite: specificiteDe(parties) };
}

/** Les selecteurs d'une liste a virgules (le prelude d'une regle). */
export function lireListeSelecteurs(prelude: string): ListeSelecteurs {
  const selecteurs: Selecteur[] = [], ignores: string[] = [];
  let invalide = false;
  for (const membre of couperVirgules(prelude)) {
    const s = lireSelecteur(membre);
    if (s === null) invalide = true;
    else if ('ignore' in s) ignores.push(s.ignore);
    else selecteurs.push(s);
  }
  return { selecteurs: invalide ? [] : selecteurs, ignores: invalide ? [] : ignores, invalide };
}

// ---------------------------------------------------------------- confrontation

type Parents = ReadonlyMap<Noeud, Noeud>;

function valeurCorrespond(op: OperateurAttribut, valeur: string, attendu: string, i: boolean): boolean {
  const a = i ? valeur.toLowerCase() : valeur, b = i ? attendu.toLowerCase() : attendu;
  switch (op) {
    case '': return true;
    case '=': return a === b;
    case '~=': return b !== '' && !/\s/.test(b) && a.split(/\s+/).includes(b);
    case '|=': return a === b || a.startsWith(b + '-');
    case '^=': return b !== '' && a.startsWith(b);
    case '$=': return b !== '' && a.endsWith(b);
    default: return b !== '' && a.includes(b);
  }
}

function conditionVraie(c: Condition, n: Noeud, parents: Parents): boolean {
  switch (c.t) {
    case 'classe': return (n.attributs.class ?? '').split(/\s+/).includes(c.v);
    case 'id': return n.attributs.id === c.v;
    case 'attribut': { const v = n.attributs[c.nom]; return v !== undefined && valeurCorrespond(c.op, v, c.v, c.i); }
    default: {
      const parent = parents.get(n);
      // La racine n'a pas de parent element : elle est seule de son rang.
      if (c.v === 'root') return parent === undefined;
      if (!parent) return true;
      const premier = parent.enfants[0] === n, dernier = parent.enfants[parent.enfants.length - 1] === n;
      return c.v === 'first-child' ? premier : c.v === 'last-child' ? dernier : premier && dernier;
    }
  }
}

const composeVrai = (p: Compose, n: Noeud, parents: Parents): boolean =>
  (p.type === null || p.type === n.nom) && p.conditions.every(c => conditionVraie(c, n, parents));

function correspondDepuis(s: Selecteur, i: number, n: Noeud, parents: Parents): boolean {
  if (!composeVrai(au(s.parties, i), n, parents)) return false;
  if (i === 0) return true;
  const parent = parents.get(n);
  if (!parent) return false;
  if (s.liens[i - 1] === 'enfant') return correspondDepuis(s, i - 1, parent, parents);
  for (let a: Noeud | undefined = parent; a; a = parents.get(a)) if (correspondDepuis(s, i - 1, a, parents)) return true;
  return false;
}

/**
 * Vrai si le noeud est vise par le selecteur. De droite a gauche : le dernier compose se verifie sur le noeud, les
 * autres sur ses ancetres (`parents` : chaque element vers son parent, la racine vers rien).
 */
export const correspond = (s: Selecteur, n: Noeud, parents: Parents): boolean => correspondDepuis(s, s.parties.length - 1, n, parents);
