// L'extracteur des textes de l'interface (ADR-0042 §4), pour le test de couverture et le cliquet : il lit chaque fichier de src/
// avec l'analyseur de TypeScript (jamais une expression reguliere : un guillemet dans un commentaire ou une regex la tromperait) et
// rend deux choses.
//
//   - Les CLES : le premier argument litteral d'un `t('…')`, le mot (et le pluriel irregulier) d'un `pluriel(n, '…')`. Chacune doit
//     avoir sa traduction.
//   - Les RESTES : tout littéral de chaine (simple, double, gabarit) ou texte JSX qui a l'air francais (un caractere accentue, un
//     guillemet « », une apostrophe ’) hors d'un appel a `t` ou `pluriel`, hors des imports, hors des attributs `data-ed-*`, hors des
//     fichiers de donnees exclus (tests/fixtures/i18n/exclus.json). Les commentaires ne sont pas des noeuds : ils ne comptent jamais.
//   - Les CONSTANTES : un `const X = t('…')` au niveau d'un module, evalue a son chargement. L'amorce (util/i18n.ts) pose le
//     dictionnaire avant le code, donc elles sont traduites en pratique ; mais un hote sans amorce les verrait en francais, et une
//     fonction (`() => t('…')`) ou un accesseur ne coute rien : leur nombre ne doit plus augmenter (tests/fixtures/i18n/constantes.json).
//
// scripts/i18n-restes.mjs l'importe (compile par esbuild) pour lister les restes par fichier.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

/** Ce qui trahit un texte francais dans un littéral : un accent, un guillemet francais, une apostrophe typographique. */
export const FRANCAIS = /[éèàçùêâîôûœÉÈÀÇ«»’]/;

export interface Position { fichier: string; ligne: number }

/** Une cle trouvee dans le code : la phrase, d'ou elle vient, et par quel appel. */
export interface Cle extends Position {
  cle: string;
  /** `t` : le premier argument de `t` ; `pluriel` : le mot d'un `pluriel(n, mot, irregulier?)`. */
  origine: 't' | 'pluriel';
}

/** Un littéral francais hors de `t` : d'ou il vient et son debut, pour le retrouver. */
export interface Reste extends Position { texte: string }

/** Une constante de module dont la valeur est un appel a `t` : d'ou elle vient, et son nom. */
export interface Constante extends Position { nom: string }

export interface Extraction {
  cles: Cle[];
  restes: Reste[];
  /** Tous les littéraux de chaine du code, francais ou non, hors imports : de quoi savoir si une cle du dictionnaire est orpheline. */
  litteraux: Set<string>;
  constantes: Constante[];
}

/** Les fichiers TypeScript d'un dossier, en profondeur, par chemin absolu. */
export function fichiersTs(dossier: string): string[] {
  return readdirSync(dossier).sort().flatMap(nom => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiersTs(chemin);
    return /\.tsx?$/.test(nom) && !nom.endsWith('.d.ts') ? [chemin] : [];
  });
}

const estAppelDe = (n: ts.Node, nom: string | undefined): n is ts.CallExpression => nom !== undefined && ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === nom;

/** Les noms sous lesquels un fichier importe `t` (d'util/i18n) et `pluriel` (d'util/texte) ; undefined quand il ne les importe pas. */
interface NomsImportes { t: string | undefined; pluriel: string | undefined }

/**
 * Un `t(…)` n'est une cle que si le fichier importe `t` d'util/i18n : zones/icones.tsx a un `t` a lui (un trace), et util/i18n.ts
 * definit le sien. Meme regle pour `pluriel`, d'util/texte.
 */
function nomsImportes(source: ts.SourceFile): NomsImportes {
  const noms: NomsImportes = { t: undefined, pluriel: undefined };
  for (const d of source.statements) {
    if (!ts.isImportDeclaration(d) || !ts.isStringLiteral(d.moduleSpecifier) || !d.importClause?.namedBindings || !ts.isNamedImports(d.importClause.namedBindings)) continue;
    const module = d.moduleSpecifier.text;
    const voulu: keyof NomsImportes | null = /(^|\/)i18n\.js$/.test(module) ? 't' : /(^|\/)texte\.js$/.test(module) ? 'pluriel' : null;
    if (voulu === null) continue;
    for (const e of d.importClause.namedBindings.elements) if ((e.propertyName ?? e.name).text === voulu) noms[voulu] = e.name.text;
  }
  return noms;
}

/** Les textes d'un gabarit `…${x}…` : la tete, chaque milieu et la queue, sans les expressions. */
function morceauxGabarit(n: ts.TemplateExpression): string[] {
  return [n.head.text, ...n.templateSpans.map(s => s.literal.text)];
}

/** Un littéral de chaine simple : `'…'`, `"…"`, ou un gabarit sans expression. */
const estChaine = (n: ts.Node): n is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral => ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n);

/** Vrai pour un littéral qui n'est pas un texte de l'interface : un specifieur d'import, un attribut ou une valeur `data-ed-*`. */
function horsInterface(n: ts.Node): boolean {
  const p = n.parent;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isImportTypeNode(p)) return true;
  if (ts.isCallExpression(p) && p.expression.kind === ts.SyntaxKind.ImportKeyword) return true;
  if (ts.isJsxAttribute(p) && p.name.getText().startsWith('data-ed-')) return true;
  return estChaine(n) && n.text.startsWith('data-ed-');
}

/** Vrai pour le littéral qui est la cle d'un `t(…)` ou le mot (ou le pluriel irregulier) d'un `pluriel(…)`. */
function estCle(n: ts.Node, noms: NomsImportes): Cle['origine'] | null {
  const p = n.parent;
  if (estAppelDe(p, noms.t) && p.arguments[0] === n) return 't';
  if (estAppelDe(p, noms.pluriel) && (p.arguments[1] === n || p.arguments[2] === n)) return 'pluriel';
  return null;
}

/** Extrait les cles et les restes d'un fichier, dont le chemin est celui qu'on veut lire dans les rapports (relatif a src/). */
export function extraireFichier(fichier: string, texte: string): Extraction {
  const source = ts.createSourceFile(fichier, texte, ts.ScriptTarget.Latest, true, fichier.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const r: Extraction = { cles: [], restes: [], litteraux: new Set(), constantes: [] };
  const noms = nomsImportes(source);
  const ligneDe = (n: ts.Node): number => source.getLineAndCharacterOfPosition(n.getStart(source)).line + 1;
  const reste = (n: ts.Node, t: string): void => { r.restes.push({ fichier, ligne: ligneDe(n), texte: t.trim().replace(/\s+/g, ' ').slice(0, 80) }); };
  // Les constantes de module : une declaration de variable au premier niveau du fichier, initialisee par un appel direct a `t`.
  for (const d of source.statements) {
    if (!ts.isVariableStatement(d)) continue;
    for (const decl of d.declarationList.declarations) {
      if (decl.initializer !== undefined && estAppelDe(decl.initializer, noms.t)) r.constantes.push({ fichier, ligne: ligneDe(decl), nom: decl.name.getText(source) });
    }
  }
  const visiter = (n: ts.Node): void => {
    if (estChaine(n)) {
      if (!horsInterface(n)) {
        r.litteraux.add(n.text);
        const origine = estCle(n, noms);
        if (origine) r.cles.push({ cle: n.text, fichier, ligne: ligneDe(n), origine });
        else if (FRANCAIS.test(n.text)) reste(n, n.text);
      }
    } else if (ts.isTemplateExpression(n)) {
      const morceaux = morceauxGabarit(n);
      if (morceaux.some(m => FRANCAIS.test(m))) reste(n, morceaux.join('…'));
    } else if (ts.isJsxText(n)) {
      if (!n.containsOnlyTriviaWhiteSpaces && FRANCAIS.test(n.text)) reste(n, n.text);
    }
    ts.forEachChild(n, visiter);
  };
  visiter(source);
  return r;
}

/** Extrait tout src/ (hors `exclus`, des chemins relatifs a src/, a la barre oblique), les chemins relatifs a src/. */
export function extraireDossier(src: string, exclus: readonly string[]): Extraction {
  const r: Extraction = { cles: [], restes: [], litteraux: new Set(), constantes: [] };
  const exclusion = new Set(exclus);
  for (const chemin of fichiersTs(src)) {
    const relatif = relative(src, chemin).split(sep).join('/');
    const e = extraireFichier(relatif, readFileSync(chemin, 'utf8'));
    r.cles.push(...e.cles);
    r.constantes.push(...e.constantes);
    for (const l of e.litteraux) r.litteraux.add(l);
    if (!exclusion.has(relatif)) r.restes.push(...e.restes);
  }
  return r;
}

/** Les restes (ou les constantes) par fichier, du plus charge au moins charge, pour le rapport. */
export function restesParFichier(restes: readonly Position[]): Array<{ fichier: string; nombre: number }> {
  const compte = new Map<string, number>();
  for (const x of restes) compte.set(x.fichier, (compte.get(x.fichier) ?? 0) + 1);
  return [...compte.entries()].map(([fichier, nombre]) => ({ fichier, nombre })).sort((a, b) => b.nombre - a.nombre || (a.fichier < b.fichier ? -1 : 1));
}
