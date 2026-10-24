// La feuille <style> d'un SVG et l'attribut `style` : des declarations et des regles. La lecture suit CSS
// la ou cela change un rendu (virgules et points-virgules dans `url(…)` ou une chaine, `!important`,
// commentaires, blocs @-regles sautes en entier) et dit, par `ignores`, ce qu'elle laisse tomber. Pur.

import { lireListeSelecteurs, type Selecteur } from './selecteurs.js';
import {
  msgBlocArobase, MSG_FONT_FACE, MSG_IMBRIQUEES, MSG_IMPORT, MSG_KEYFRAMES, MSG_SELECTEUR_ILLISIBLE, reglePeint, textePeint
} from './ignores.js';

/** Une declaration `propriete: valeur [!important]`. La propriete est en minuscules, la valeur telle qu'ecrite. */
export interface Declaration { readonly prop: string; readonly valeur: string; readonly important: boolean }

/** Une regle pour UN selecteur (une regle a virgules en donne autant), avec son rang dans la feuille. */
export interface Regle { readonly selecteur: Selecteur; readonly declarations: readonly Declaration[]; readonly ordre: number }

export interface Feuille {
  readonly regles: readonly Regle[];
  readonly ignores: readonly string[];
  /** Le rang que prendrait la regle suivante : la feuille d'apres y reprend. */
  readonly suivant: number;
}

const PROPRIETE = /^-?[a-z_][\w-]*$/i;

/** Coupe aux `;` de premier niveau : ni dans des parentheses, ni dans une chaine, ni dans un bloc `{ }`. */
function couperDeclarations(texte: string): string[] {
  const out: string[] = [];
  let paren = 0, accolade = 0, guillemet = '', debut = 0;
  for (let i = 0; i < texte.length; i++) {
    const c = texte.charAt(i);
    if (guillemet) { if (c === '\\') i++; else if (c === guillemet) guillemet = ''; continue; }
    if (c === '"' || c === "'") guillemet = c;
    else if (c === '\\') i++;
    else if (c === '(') paren++;
    else if (c === ')') paren = Math.max(0, paren - 1);
    else if (c === '{') accolade++;
    else if (c === '}') accolade = Math.max(0, accolade - 1);
    else if (c === ';' && paren === 0 && accolade === 0) { out.push(texte.slice(debut, i)); debut = i + 1; }
  }
  out.push(texte.slice(debut));
  return out;
}

/** Les declarations d'un corps de regle ou d'un attribut `style`, dans l'ordre. Les proprietes personnalisees (`--x`) et le reste illisible sont laisses. */
export function lireDeclarations(texte: string): Declaration[] {
  const out: Declaration[] = [];
  for (const brut of couperDeclarations(texte)) {
    const k = brut.indexOf(':');
    if (k <= 0 || brut.includes('{')) continue;
    const prop = brut.slice(0, k).trim().toLowerCase();
    if (!PROPRIETE.test(prop) || prop.startsWith('--')) continue;
    let valeur = brut.slice(k + 1).trim(), important = false;
    const i = /\s*!\s*important\s*$/i.exec(valeur);
    if (i) { important = true; valeur = valeur.slice(0, i.index).trim(); }
    out.push({ prop, valeur, important });
  }
  return out;
}

/** Position de l'accolade (ou du point-virgule, si `pointVirgule`) de premier niveau a partir de `debut`, hors chaines et parentheses ; -1 si absente. */
function chercherFin(t: string, debut: number, pointVirgule: boolean): number {
  let paren = 0, crochet = 0, guillemet = '';
  for (let i = debut; i < t.length; i++) {
    const c = t.charAt(i);
    if (guillemet) { if (c === '\\') i++; else if (c === guillemet) guillemet = ''; continue; }
    if (c === '"' || c === "'") guillemet = c;
    else if (c === '\\') i++;
    else if (c === '(') paren++;
    else if (c === ')') paren = Math.max(0, paren - 1);
    else if (c === '[') crochet++;
    else if (c === ']') crochet = Math.max(0, crochet - 1);
    else if (paren === 0 && crochet === 0 && (c === '{' || (pointVirgule && c === ';'))) return i;
  }
  return -1;
}

/** Position de l'accolade fermante qui referme celle ouverte en `ouvrante` ; la fin du texte si elle manque. */
function accoladeFermante(t: string, ouvrante: number): number {
  let prof = 0, guillemet = '';
  for (let i = ouvrante; i < t.length; i++) {
    const c = t.charAt(i);
    if (guillemet) { if (c === '\\') i++; else if (c === guillemet) guillemet = ''; continue; }
    if (c === '"' || c === "'") guillemet = c;
    else if (c === '\\') i++;
    else if (c === '{') prof++;
    else if (c === '}' && --prof === 0) return i;
  }
  return t.length;
}

/** L'effet d'une @-regle sur ce qu'on dit : null quand elle ne change aucun rendu. */
function phraseArobase(nom: string, corps: string | null): string | null {
  if (nom === 'import') return MSG_IMPORT;
  if (corps === null) return null;
  if (nom === 'font-face') return MSG_FONT_FACE;
  if (!textePeint(corps)) return null;
  return /keyframes$/.test(nom) ? MSG_KEYFRAMES : msgBlocArobase(nom);
}

/** Les regles d'un texte de feuille, dans l'ordre ; `depart` est le rang de la premiere. */
export function lireFeuille(source: string, depart = 0): Feuille {
  const t = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const regles: Regle[] = [], ignores = new Set<string>();
  let i = 0, ordre = depart;
  const dire = (m: string | null) => { if (m) ignores.add(m); };
  while (i < t.length) {
    const car = t.charAt(i);
    if (/\s/.test(car) || car === '}') { i++; continue; }
    if (car === '@') {
      const nom = (/^@([\w-]+)/.exec(t.slice(i))?.[1] ?? '').toLowerCase();
      const fin = chercherFin(t, i, true);
      if (fin < 0) { dire(phraseArobase(nom, null)); break; }
      if (t.charAt(fin) === ';') { dire(phraseArobase(nom, null)); i = fin + 1; continue; }
      const close = accoladeFermante(t, fin);
      dire(phraseArobase(nom, t.slice(fin + 1, close)));
      i = close + 1;
      continue;
    }
    const ouvrante = chercherFin(t, i, false);
    if (ouvrante < 0) break;
    const prelude = t.slice(i, ouvrante), close = accoladeFermante(t, ouvrante), corps = t.slice(ouvrante + 1, close);
    i = close + 1;
    const declarations = lireDeclarations(corps);
    const peint = reglePeint(declarations.map(d => d.prop));
    const liste = lireListeSelecteurs(prelude);
    if (corps.includes('{') && textePeint(corps.slice(corps.indexOf('{')))) dire(MSG_IMBRIQUEES);
    if (liste.invalide) { if (peint) dire(MSG_SELECTEUR_ILLISIBLE); continue; }
    if (peint) liste.ignores.forEach(m => dire(m));
    for (const selecteur of liste.selecteurs) regles.push({ selecteur, declarations, ordre });
    ordre++;
  }
  return { regles, ignores: [...ignores], suivant: ordre };
}
