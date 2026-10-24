// Un mutateur deterministe pour le fuzzing (docs/securite.md) : un generateur pseudo-aleatoire a graine, des mutations d'octets, de
// jetons, d'imbrication et de nombres, et un generateur de SVG hostiles a partir d'une grammaire. Aucune dependance, aucune horloge :
// la meme graine redonne les memes entrees, donc un echec se rejoue.

/** mulberry32 : 32 bits d'etat, assez bon pour de l'exploration, identique partout. */
export function aleatoire(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Alea = () => number;
const entier = (r: Alea, n: number): number => Math.floor(r() * n);
const choisir = <T>(r: Alea, t: readonly T[]): T => t[entier(r, t.length)] as T;

/** Les morceaux qui font mal : on les colle un peu partout. */
export const JETONS: readonly string[] = [
  '<script>window.__pwn=1</script>', '<script', '</script>', 'onload="window.__pwn=1"', ' onclick=', '/onerror=', 'javascript:window.__pwn=1', 'jav&#x61;script:', 'vbscript:', 'data:text/html,',
  'url(https://evil.invalid/x)', 'url(', 'u\\72l(', '@import "https://evil.invalid/a.css";', '@\\69mport', 'expression(', '-moz-binding:', 'behavior:',
  '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><iframe src="x"/></div></foreignObject>', '<foreignObject>', '</foreignObject>',
  'xlink:href="https://evil.invalid/x"', 'href="javascript:x"', 'x:href="https://evil.invalid/"', ' href=', '<use href="#a"/>', '<use href="https://evil.invalid/s.svg#a"/>', '<g id="a">', '</g>',
  '<image href="https://evil.invalid/p.png"/>', '<image href="data:image/svg+xml;base64,PHN2Zy8+"/>', '<set attributeName="href" to="javascript:x"/>', '<animate attributeName="xlink:href" values="#a;x"/>',
  '<!--', '-->', '--!>', '<![CDATA[', ']]>', '<?xml-stylesheet href="x"?>', '<?', '?>', '<!DOCTYPE svg [<!ENTITY a "aaaa">]>', '&a;', '<!ENTITY % x SYSTEM "file:///etc/passwd">', '&#0;', '&#x110000;', '&#xD800;', '&',
  '<svg:script>', '<html:script xmlns:html="http://www.w3.org/1999/xhtml">', 'xmlns="http://www.w3.org/1999/xhtml"', 'xmlns:x="http://www.w3.org/1999/xlink"', '<style>', '</style>', '<title>', '</title>',
  '"', "'", '>', '<', '=', '/', '\\', ' ', '\n', '\u0000', '\u0001', ' ', '﻿', '\ud800', '\u{1F600}', '__proto__', 'constructor',
  'scale(1e308)', 'matrix(1e300 0 0 1e300 0 0)', 'translate(', 'rotate(', 'M', 'L', 'C', 'A', 'z', 'viewBox="0 0 1e308 1e308"', 'viewBox="0 0 -1 -1"', 'width="1e999"', 'fill="url(#a)"', 'fill="red;x"', 'class="a b"', 'id="a"'
];

export const NOMBRES: readonly string[] = ['0', '-0', '1e308', '-1e308', '1e999', '1e-999', '1e-320', 'NaN', 'Infinity', '-Infinity', '99999999999999999999', '0.0000000001', '1e', '.', '-', '+1', '0x10', '1,5', '1e+', '٣', '1'.repeat(400)];

const NOMBRE = /-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi;

/** Une mutation de `s`, choisie et placee par `r`. `max` borne la taille du resultat. */
export function muter(s: string, r: Alea, max = 300_000): string {
  if (s.length === 0) return choisir(r, JETONS);
  const i = entier(r, s.length);
  let sortie: string;
  switch (entier(r, 11)) {
    case 0: sortie = s.slice(0, i) + String.fromCharCode(entier(r, 0x80)) + s.slice(i + 1); break; // un octet change
    case 1: sortie = s.slice(0, i) + choisir(r, JETONS) + s.slice(i); break; // un jeton insere
    case 2: sortie = s.slice(0, i) + choisir(r, JETONS) + s.slice(i + 1 + entier(r, 20)); break; // un jeton qui en remplace quelques caracteres
    case 3: { const f = Math.min(s.length, i + 1 + entier(r, 200)); sortie = s.slice(0, i) + s.slice(f); break; } // un morceau retire
    case 4: { const f = Math.min(s.length, i + 1 + entier(r, 120)); sortie = s.slice(0, f) + s.slice(i, f).repeat(1 + entier(r, 60)) + s.slice(f); break; } // un morceau repete (multiplicateur d'imbrication)
    case 5: sortie = s.slice(0, i); break; // tronque
    case 6: sortie = s.replace(NOMBRE, m => (r() < 0.2 ? choisir(r, NOMBRES) : m)); break; // des nombres extremes
    case 7: { const ouvrantes = [...s.matchAll(/<g\b[^>]*>/g)]; const m = ouvrantes[entier(r, Math.max(1, ouvrantes.length))]; sortie = m ? s.slice(0, m.index) + m[0].repeat(1 + entier(r, 400)) + s.slice((m.index ?? 0) + m[0].length) : s + '<g>'.repeat(entier(r, 600)); break; } // imbrication
    case 8: sortie = s.replace(/"/g, () => (r() < 0.15 ? "'" : '"')); break; // guillemets echanges
    case 9: sortie = s.replace(/ /g, () => (r() < 0.1 ? choisir(r, ['\n', '\t', '/', '', '\r\n']) : ' ')); break; // separateurs
    default: sortie = s.slice(0, i) + s.slice(entier(r, s.length), entier(r, s.length) + 1 + entier(r, 80)) + s.slice(i); // un morceau copie ailleurs
  }
  return sortie.length > max ? sortie.slice(0, max) : sortie;
}

/** Plusieurs mutations a la suite. */
export function muterPlusieurs(s: string, r: Alea): string {
  let t = s;
  for (let k = 1 + entier(r, 4); k > 0; k--) t = muter(t, r);
  return t;
}

const ELEMENTS = ['g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'use', 'defs', 'symbol', 'style', 'title', 'a', 'image', 'text', 'script', 'foreignObject', 'set', 'animate', 'metadata', 'switch', 'clipPath', 'linearGradient', 'svg', 'svg:script', 'x:y'];
const ATTRIBUTS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['d', ['M0 0h10v10z', 'M1 1 A5 5 0 1 1 9 9', 'M0 0L1e308 1e308', 'M NaN 1', 'M0 0C1 1 2 2 3 3 S4 4 5 5 Q6 6 7 7 T8 8']],
  ['fill', ['#c81e28', 'none', 'red', 'url(#a)', 'url(https://evil.invalid/x)', 'rgb(1 2 3 / 50%)', 'inherit', 'x"y', '#fff\u0000']],
  ['stroke', ['#000', 'currentColor', 'hsl(10 50% 50%)', 'url(#g) red']],
  ['transform', ['translate(1 2)', 'scale(2) rotate(10)', 'matrix(1 0 0 1 0 0)', 'scale(', 'scale(1e308) scale(1e308)', 'skewX(90)']],
  ['href', ['#a', '#b', 'https://evil.invalid/', 'javascript:window.__pwn=1', 'data:text/html,x', '']],
  ['xlink:href', ['#a', 'https://evil.invalid/x', 'javascript:x']],
  ['style', ['fill:red', 'fill:url(https://evil.invalid/x)', 'cursor:url(x),auto', 'behavior:url(x)', 'transform:scale(2)']],
  ['class', ['a', 'a b', 'z']], ['id', ['a', 'b', 'z', '__proto__', 'constructor']],
  ['onclick', ['window.__pwn=1']], ['onload', ['window.__pwn=1']], ['src', ['https://evil.invalid/x']],
  ['width', ['10', '1e999', '-5', '50%']], ['height', ['10', '0', 'x']], ['x', ['0', '5']], ['y', ['0', '5']], ['r', ['3', '1e308']], ['cx', ['5']], ['cy', ['5']], ['points', ['1,2 3,4 5,6', '1']],
  ['attributeName', ['href', 'opacity', 'xlink:href']], ['to', ['javascript:x', '#a']], ['xmlns', ['http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xhtml']], ['xmlns:x', ['http://www.w3.org/1999/xlink']], ['viewBox', ['0 0 10 10', '0 0 0 0', '0 0 1e308 1e308']]
];
const TEXTES = ['', 'x', '.a{fill:red}', '@import "x";.a{fill:url(https://evil.invalid/x)}', '<b>', 'a & b', 'window.__pwn=1', ']]>'];

/** Un SVG fabrique par grammaire : des elements et attributs choisis au hasard, sains et hostiles, imbriques a une profondeur variable. */
export function engendrer(r: Alea): string {
  let compte = 0;
  const element = (profondeur: number): string => {
    if (++compte > 400) return '';
    const nom = choisir(r, ELEMENTS);
    let attrs = '';
    for (let k = entier(r, 5); k > 0; k--) { const [a, valeurs] = choisir(r, ATTRIBUTS); attrs += ' ' + a + '=' + (r() < 0.9 ? '"' : "'") + choisir(r, valeurs) + (r() < 0.9 ? '"' : "'"); }
    if (r() < 0.3 || profondeur > 8) return `<${nom}${attrs}/>`;
    let enfants = '';
    for (let k = entier(r, 4); k > 0; k--) enfants += r() < 0.15 ? choisir(r, TEXTES) : element(profondeur + 1);
    return `<${nom}${attrs}>${enfants}</${nom}>`;
  };
  const racine = r() < 0.9 ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"' : '<svg viewBox="0 0 10 10" width="5"';
  let corps = '';
  for (let k = 1 + entier(r, 5); k > 0; k--) corps += element(0);
  return `${racine}>${corps}</svg>`;
}

/**
 * Reduit `s` tant que `echoue` reste vrai : on retire des morceaux de plus en plus petits (delta debugging, sans la partie malignes).
 * Rend l'entree minimale pour le morceau retire le plus petit, de quoi la lire et la commiter dans tests/fixtures/regressions.
 */
export function reduire(s: string, echoue: (t: string) => boolean, tours = 400): string {
  let courant = s;
  for (let taille = Math.max(1, courant.length >> 1); taille >= 1 && tours > 0; taille >>= 1) {
    for (let i = 0; i < courant.length && tours > 0; ) {
      const essai = courant.slice(0, i) + courant.slice(i + taille);
      tours--;
      if (essai.length > 0 && echoue(essai)) courant = essai; else i += taille;
    }
  }
  return courant;
}
