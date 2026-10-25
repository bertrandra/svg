// L'assainissement d'un SVG venu d'un inconnu (docs/securite.md). On ne cherche pas le danger par des
// expressions regulieres sur le texte : on LIT le document (util/xml.ts, balayage lineaire) et on ne
// reecrit que ce qui est permis. Un element hors de la liste blanche part avec tout ce qu'il contient,
// un attribut hors des regles part seul, et ce qui reste est reemis octet pour octet. Deux consequences :
//
//   - rien ne se recompose : retirer un morceau ne peut pas en assembler un autre (`<scr<script>ipt>`), puisque
//     la sortie est faite de jetons entiers et jamais d'un texte rabote ;
//   - la sortie est du XML bien forme (une seule racine, des guillemets, des entites predefinies), sans
//     commentaire, instruction de traitement, DOCTYPE ni section CDATA hors d'une feuille de style.
//
// Pur : aucun DOM, aucune horloge.

import { decoderEntites, echapperAttribut, ErreurXml, apresDoctype, parcourirXml, phraseErreurXml, type AttributBrut, type Jeton } from './xml.js';

export const ESPACE_SVG = 'http://www.w3.org/2000/svg';
/** L'attribut inerte qui garde, sur un <use>, le renvoi externe que le nettoyage retire : la lecture le refuse en le nommant. */
export const ATTRIBUT_HREF_EXTERNE = 'data-href-externe';

/** Les elements qu'un SVG nettoye peut garder : le vocabulaire graphique de SVG 1.1 et 2. Ni script, ni objet etranger, ni police SVG, ni curseur. */
const ELEMENTS: ReadonlySet<string> = new Set([
  'svg', 'g', 'defs', 'symbol', 'use', 'a', 'switch', 'view', 'title', 'desc', 'metadata', 'style',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'image', 'text', 'tspan', 'textPath', 'tref', 'altGlyph',
  'linearGradient', 'radialGradient', 'stop', 'pattern', 'clipPath', 'mask', 'marker', 'filter', 'solidcolor',
  'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap',
  'feDistantLight', 'feDropShadow', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur', 'feImage', 'feMerge',
  'feMergeNode', 'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile', 'feTurbulence',
  'animate', 'animateColor', 'animateMotion', 'animateTransform', 'set', 'mpath'
]);
const ANIMATIONS: ReadonlySet<string> = new Set(['animate', 'animateColor', 'animateMotion', 'animateTransform', 'set']);
/** Ces elements ne portent que du texte : un element dedans est un piege de re-analyse HTML (<title><style>…), il part. */
const TEXTE_SEUL: ReadonlySet<string> = new Set(['title', 'desc', 'style']);

/** Les espaces de noms inertes qu'un outil de dessin declare, par prefixe : toute autre declaration part. */
const ESPACES_PERMIS: Readonly<Record<string, string>> = {
  xlink: 'http://www.w3.org/1999/xlink',
  svg: ESPACE_SVG,
  inkscape: 'http://www.inkscape.org/namespaces/inkscape',
  sodipodi: 'http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  cc: 'http://creativecommons.org/ns#',
  dc: 'http://purl.org/dc/elements/1.1/',
  dcterms: 'http://purl.org/dc/terms/'
};
/** Les prefixes de metadonnees : permis sur des elements dans <metadata> seulement. */
const PREFIXES_METADONNEES: ReadonlySet<string> = new Set(['rdf', 'cc', 'dc', 'dcterms']);
const PREFIXES_ATTRIBUT: ReadonlySet<string> = new Set(['xlink', 'xml', 'inkscape', 'sodipodi', 'rdf', 'cc', 'dc', 'dcterms']);
/** Des attributs HTML qui portent une adresse ; sur un element SVG ils ne servent a rien d'honnete. */
const ATTRIBUTS_A_ADRESSE: ReadonlySet<string> = new Set(['src', 'srcset', 'action', 'formaction', 'poster', 'background', 'ping', 'codebase', 'manifest', 'longdesc', 'data']);

// ---------------------------------------------------------------- texte et CSS

const NOM_PREFIXE = /^(?:[\p{L}_][\p{L}\p{N}_.-]*:)?[\p{L}_][\p{L}\p{N}_.-]*$/u;
const IMAGE_EN_LIGNE = /^data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/= \t\r\n]*$/;
const SCHEMAS = /(?:javascript|vbscript|livescript|data)\s*:/gi;
const UN_SCHEMA = /(?:javascript|vbscript|livescript|data)\s*:/i;
/** Ce qui, dans un texte de style ou une valeur, demande un nettoyage : evite de passer les remplacements sur un chemin de 7 Mo. */
const SUSPECT = /url\s*\(|@|script\s*:|data\s*:|expression|binding|behavio|image-set|cross-fade|src\s*\(|\\|\/\*/i;
const DANGER_CSS = /@import|url\s*\(|expression\s*\(|-moz-binding|behavior\s*:|image-set|cross-fade|\bsrc\s*\(|(?:javascript|vbscript|livescript|data)\s*:/i;

/** Un texte CSS dont les commentaires et les echappements (`\72` pour « r ») sont resolus : c'est ce qu'un navigateur lit. */
function resoudreCss(css: string): string {
  return css.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, ' ').replace(/\\([0-9a-fA-F]{1,6})[ \t\n\r\f]?|\\([^\n])/g, (_, hex: string | undefined, car: string | undefined) => {
    if (hex === undefined) return car ?? '';
    const n = parseInt(hex, 16);
    return n > 0 && n < 0x110000 && !(n >= 0xd800 && n < 0xe000) ? String.fromCodePoint(n) : '';
  });
}

/**
 * Une reference locale `url(#id)` reste ; toute autre adresse devient « none », et un `url(` jamais ferme devient `none(`. Un seul
 * balayage : chaque parenthese fermante n'est cherchee qu'une fois (une expression reguliere `url\(…[^)]*\)` relirait tout le reste du
 * texte a chaque `url(` non ferme, soit un temps quadratique sur une feuille hostile).
 */
function neutraliserUrl(s: string): string {
  const re = /url\s*\(/gi;
  const morceaux: string[] = [];
  let dernier = 0, fermante = -2;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    const interieur = re.lastIndex;
    if (fermante !== -1 && fermante < interieur) fermante = s.indexOf(')', interieur);
    if (fermante < 0) { morceaux.push(s.slice(dernier, m.index), 'none('); dernier = interieur; continue; }
    if (/^\s*['"]?\s*#/.test(s.slice(interieur, Math.min(fermante, interieur + 64)))) continue;
    morceaux.push(s.slice(dernier, m.index), 'none');
    dernier = fermante + 1;
    re.lastIndex = dernier;
  }
  if (dernier === 0) return s;
  morceaux.push(s.slice(dernier));
  return morceaux.join('');
}

/** Une passe de nettoyage ; rend le meme texte quand il n'y a plus rien a retirer. */
function passeCss(s: string): string {
  return neutraliserUrl(s)
    .replace(/@import[^;]*;?/gi, '')
    .replace(/expression\s*\(/gi, 'none(')
    .replace(/(?:-moz-binding|behavior)\s*:[^;}]*/gi, '')
    .replace(/(?:-webkit-)?(?:image-set|cross-fade)\s*\(/gi, 'none(')
    .replace(/(^|[^\w-])src\s*\(/gi, '$1none(')
    .replace(SCHEMAS, '');
}

/**
 * Le CSS d'une feuille, d'un attribut `style` ou d'une valeur, sans adresse externe ni schema actif. Les retraits peuvent
 * en recomposer d'autres (`behbehavior:avior:`) : on repasse jusqu'a ce que le texte ne bouge plus, et on le vide s'il ne se stabilise pas.
 */
export function nettoyerCss(css: string): string {
  if (!SUSPECT.test(css)) return css;
  let s = css;
  // Un echappement ou un commentaire peut cacher un mot (`u\72l(`) : si le texte resolu est dangereux, on travaille sur lui.
  if (s.includes('\\') || s.includes('/*')) { const clair = resoudreCss(s); if (clair !== s && DANGER_CSS.test(clair)) s = clair; }
  for (let i = 0; i < 8; i++) { const suite = passeCss(s); if (suite === s) return s; s = suite; }
  return '';
}

// Les caracteres interdits en XML 1.0 (controles, U+FFFE, U+FFFF) et les references numeriques qui les designent.
const INTERDITS = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(8) + String.fromCharCode(11) + String.fromCharCode(12) + String.fromCharCode(14) + '-' + String.fromCharCode(31) + String.fromCharCode(0xfffe) + String.fromCharCode(0xffff) + ']', 'g');
const REF_NUM = /&#(x[0-9a-fA-F]+|[0-9]+);/g;

function refPermise(m: string, v: string): string {
  const n = v[0] === 'x' ? parseInt(v.slice(1), 16) : Number(v);
  return n === 9 || n === 10 || n === 13 || (n >= 0x20 && n <= 0xd7ff) || (n >= 0xe000 && n <= 0xfffd) || (n >= 0x10000 && n <= 0x10ffff) ? m : '';
}

/** Un morceau de texte ou de valeur reemis tel quel, rendu bien forme : caracteres permis, « & » et « < » echappes quand ils ne sont pas valides. */
function rendreBienForme(brut: string): string {
  let t = brut;
  // Les navigateurs lisent `&#NN` et `&amp` sans point-virgule dans du HTML : on n'en laisse aucun.
  if (t.includes('&')) t = t.replace(REF_NUM, refPermise).replace(/&(?!(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/g, '&amp;');
  if (t.includes('<')) t = t.replace(/</g, '&lt;');
  if (t.includes(']]>')) t = t.replace(/\]\]>/g, ']]&gt;');
  return INTERDITS.test(t) ? t.replace(INTERDITS, '') : t;
}
const echapperTexte = (t: string): string => rendreBienForme(t.replace(/&/g, '&amp;').replace(/>/g, '&gt;'));

/** La valeur d'un attribut ordinaire, nettoyee ; `null` si elle reste telle qu'elle est ecrite. */
function valeurNettoyee(valeur: string): string | null {
  const dec = decoderEntites(valeur);
  const neu = nettoyerCss(dec);
  if (neu === dec && !UN_SCHEMA.test(dec)) return null;
  return neu.replace(SCHEMAS, '');
}

// ---------------------------------------------------------------- attributs

interface ContexteBalise {
  readonly nom: string; readonly racine: boolean; readonly metadonnees: boolean;
  /** Un <use> n'a qu'un renvoi externe garde : deux attributs de meme nom ne feraient pas du XML. */
  externeGarde: boolean;
}

/** Un attribut reemis : le guillemet d'origine quand la valeur le permet, sinon des guillemets doubles avec ceux de la valeur echappes. */
function emis(a: AttributBrut, valeur: string): string {
  // Une valeur que rien n'a touche garde son ecriture d'origine (blancs autour du « = » compris).
  if (valeur === a.valeur && a.guillemet !== '') return a.blancs + a.corps;
  if (a.guillemet === "'" && !valeur.includes("'")) return a.blancs + a.nom + "='" + valeur + "'";
  return a.blancs + a.nom + '="' + valeur.replace(/"/g, '&quot;') + '"';
}

/** Un attribut `href` : un renvoi local reste, une image en ligne reste, un <use> externe passe en attribut inerte, le reste part. */
function emettreHref(a: AttributBrut, c: ContexteBalise): string {
  const dec = decoderEntites(a.valeur).trim();
  if (dec.startsWith('#')) return emis(a, rendreBienForme(a.valeur));
  if (c.nom === 'use') {
    if (c.externeGarde) return '';
    c.externeGarde = true;
    const retire = dec.replace(SCHEMAS, '').slice(0, 300);
    return a.blancs + ATTRIBUT_HREF_EXTERNE + '="' + rendreBienForme(echapperAttribut(retire)) + '"';
  }
  if ((c.nom === 'image' || c.nom === 'feImage') && !a.valeur.includes('&') && IMAGE_EN_LIGNE.test(dec)) return emis(a, rendreBienForme(a.valeur));
  return '';
}

/** Un attribut `xmlns:p` : permis seulement sur la racine et dans <metadata>, avec l'espace de noms qui va avec ce prefixe. */
function emettreXmlns(a: AttributBrut, c: ContexteBalise): string {
  const prefixe = a.nom.slice(6);
  const uri = decoderEntites(a.valeur);
  return (c.racine || c.metadonnees) && ESPACES_PERMIS[prefixe] === uri ? emis(a, a.valeur) : '';
}

/** Ce que devient un attribut : son texte reemis (avec ses blancs d'avant), ou '' quand il part. `retirerBlanc` dit qu'un seul blanc part avec lui. */
function emettreAttribut(a: AttributBrut, c: ContexteBalise): string {
  // Un nom doit etre « local » ou « prefixe:local » : « :href », « a:b:c » ou « x: » n'ont de sens dans aucun espace de noms.
  if (!NOM_PREFIXE.test(a.nom)) return '';
  const nom = a.nom, i = nom.indexOf(':'), prefixe = i > 0 ? nom.slice(0, i) : '', local = (i > 0 ? nom.slice(i + 1) : nom).toLowerCase();
  if (!a.aValeur || local.startsWith('on')) return '';
  if (nom.startsWith('xmlns:')) return emettreXmlns(a, c);
  if (nom === 'xmlns') return c.racine && decoderEntites(a.valeur) === ESPACE_SVG ? emis(a, a.valeur) : '';
  if (prefixe !== '' && !PREFIXES_ATTRIBUT.has(prefixe)) return '';
  if (c.metadonnees && prefixe === '' && nom !== 'id') return '';
  if (nom === 'xml:base' || ATTRIBUTS_A_ADRESSE.has(nom.toLowerCase())) return '';
  if (local === 'href') return prefixe === '' || prefixe === 'xlink' ? emettreHref(a, c) : '';
  // La valeur est d'abord rendue bien formee (caracteres interdits et references invalides retires), PUIS nettoyee : retirer
  // un NUL apres le nettoyage pouvait reassembler un mot qu'il venait de juger inoffensif (« @\69m<NUL>port » : « @import »).
  const forme = rendreBienForme(a.valeur);
  const neu = valeurNettoyee(forme);
  return neu === null ? emis(a, forme) : emis({ ...a, guillemet: '"' }, rendreBienForme(echapperAttribut(neu)));
}

/** Vrai quand une animation vise un attribut qui porte une adresse ou un gestionnaire (`href`, `onbegin`…) : elle part avec son contenu. */
function animationDangereuse(attributs: readonly AttributBrut[]): boolean {
  for (const a of attributs) {
    if (a.nom !== 'attributeName') continue;
    const cible = decoderEntites(a.valeur).trim().toLowerCase().replace(/^[^:]*:/, '');
    if (cible === 'href' || cible.startsWith('on') || cible === 'base') return true;
  }
  return false;
}

// ---------------------------------------------------------------- la racine

/** Une longueur de la racine, comme la lit `parseFloat` : « 10mm » vaut 10. */
const longueur = (v: string | undefined): number => Number.parseFloat(v ?? '');

/** Le viewBox d'une racine : quatre nombres, largeur et hauteur positives ; null sinon. */
function lireViewBox(v: string | undefined): [number, number, number, number] | null {
  const n = (v ?? '').trim().split(/[\s,]+/).map(Number);
  const [x = NaN, y = NaN, l = NaN, h = NaN] = n;
  return n.length === 4 && [x, y, l, h].every(Number.isFinite) && l > 0 && h > 0 ? [x, y, l, h] : null;
}

// ---------------------------------------------------------------- le balayage

export interface SvgAssaini { readonly svg: string; readonly ratio: number }

/** Le debut du premier element <svg>, en sautant commentaires, CDATA, instructions et DOCTYPE (un balayage, lineaire) ; -1 s'il n'y en a pas. */
function trouverRacine(t: string): number {
  let i = 0;
  while (i < t.length) {
    const lt = t.indexOf('<', i);
    if (lt < 0) return -1;
    let suite = -2;
    if (t.startsWith('<!--', lt)) { const f = t.indexOf('-->', lt + 4); suite = f < 0 ? -1 : f + 3; }
    else if (t.startsWith('<![CDATA[', lt)) { const f = t.indexOf(']]>', lt + 9); suite = f < 0 ? -1 : f + 3; }
    else if (t.startsWith('<?', lt)) { const f = t.indexOf('?>', lt + 2); suite = f < 0 ? -1 : f + 2; }
    else if (t.startsWith('<!', lt)) suite = apresDoctype(t, lt);
    else if (/^<svg[\s/>]/i.test(t.slice(lt, lt + 6))) return lt;
    if (suite === -1) return -1;
    i = suite === -2 ? lt + 1 : suite;
  }
  return -1;
}

class Fin extends Error {}
const SANS_PLAN = 'sans viewBox ni dimensions';

interface Etat {
  readonly sortie: string[];
  readonly pile: Array<{ nom: string; metadonnees: boolean }>;
  /** Niveaux d'un element retire en cours de saut (ses enfants ne sont pas lus). */
  saut: number;
  /** Les morceaux de la feuille de style en cours : leur texte decode, et s'il y avait du CDATA. */
  feuille: { morceaux: Array<{ brut: string; cdata: boolean }>; texte: string; cdata: boolean } | null;
  racine: { ratio: number } | null;
}

/** Les attributs de la racine, decodes, pour decider de xmlns, de viewBox et du ratio. */
function racineDe(attributs: readonly AttributBrut[]): { ratio: number | null; xmlns: boolean; viewBoxValide: boolean; attributs: Record<string, string> } {
  const dec: Record<string, string> = {};
  for (const a of attributs) dec[a.nom] = decoderEntites(a.valeur);
  const vb = lireViewBox(dec.viewBox);
  const l = vb ? vb[2] : longueur(dec.width), h = vb ? vb[3] : longueur(dec.height);
  const ratio = l > 0 && h > 0 && Number.isFinite(l / h) && l / h > 0 ? l / h : null;
  return { ratio, xmlns: dec.xmlns === ESPACE_SVG, viewBoxValide: vb !== null, attributs: dec };
}

function debutDeBalise(e: Etat, j: Extract<Jeton, { t: 'debut' }>): void {
  if (e.saut > 0) { if (!j.autoFermant) e.saut++; return; }
  const parent = e.pile[e.pile.length - 1];
  const metadonnees = (parent?.metadonnees ?? false) || j.nom === 'metadata';
  const prefixe = j.nom.indexOf(':') > 0 ? j.nom.slice(0, j.nom.indexOf(':')) : '';
  const permis = e.racine === null ? j.nom === 'svg'
    : !TEXTE_SEUL.has(parent?.nom ?? '') && ((parent?.metadonnees && j.nom !== 'metadata') ? PREFIXES_METADONNEES.has(prefixe) && /^[^:]+:[\p{L}][\p{L}\p{N}_.-]*$/u.test(j.nom) : ELEMENTS.has(j.nom) && !(ANIMATIONS.has(j.nom) && animationDangereuse(j.attributs)));
  if (!permis) { if (!j.autoFermant) e.saut = 1; return; }
  const c: ContexteBalise = { nom: j.nom, racine: e.racine === null, metadonnees: parent?.metadonnees === true && j.nom !== 'metadata', externeGarde: false };
  const vus = new Set<string>();
  const r = c.racine ? racineDe(j.attributs) : null;
  if (r && r.ratio === null) throw new ErreurXml(SANS_PLAN);
  let corps = '';
  for (const a of j.attributs) {
    if (vus.has(a.nom)) throw new ErreurXml('l’attribut « ' + a.nom.slice(0, 40) + ' » est répété sur la balise « ' + j.nom + ' »');
    vus.add(a.nom);
    // Un viewBox illisible est remplace par celui des dimensions (plus bas) ; un attribut retire emporte le blanc qui le precedait (un seul).
    const t = r && a.nom === 'viewBox' && !r.viewBoxValide ? '' : emettreAttribut(a, c);
    corps += t === '' ? a.blancs.slice(0, -1) : t;
  }
  let avant = '';
  if (r?.ratio) {
    e.racine = { ratio: r.ratio };
    // viewBox d'abord, xmlns ensuite : l'ordre qu'avait l'ancien nettoyage (`<svg viewBox="…" xmlns="…"`).
    if (!r.viewBoxValide) avant = ' viewBox="0 0 ' + longueur(r.attributs.width) + ' ' + longueur(r.attributs.height) + '"';
    if (!r.xmlns) avant += ' xmlns="' + ESPACE_SVG + '"';
  }
  // Le saut de page et la tabulation verticale separent des attributs pour un analyseur HTML, mais ne sont pas des caracteres XML.
  e.sortie.push(('<' + j.nom + avant + corps + j.queue).replace(/[\v\f]/g, ' '));
  if (!j.autoFermant) e.pile.push({ nom: j.nom, metadonnees });
  else if (c.racine) throw new Fin();
}

function finDeBalise(e: Etat, nom: string): void {
  if (e.saut > 0) { e.saut--; return; }
  const haut = e.pile.pop();
  if (haut === undefined) return;
  if (haut.nom === 'style' && e.feuille) viderFeuille(e);
  e.sortie.push('</' + nom + '>');
  if (e.pile.length === 0) throw new Fin();
}

/** Ecrit la feuille de style en cours : telle quelle si rien n'a change, sinon nettoyee. */
function viderFeuille(e: Etat): void {
  const f = e.feuille;
  e.feuille = null;
  if (!f) return;
  const neu = nettoyerCss(f.texte);
  if (neu === f.texte && !f.texte.includes('<')) {
    for (const m of f.morceaux) e.sortie.push(m.cdata ? '<![CDATA[' + m.brut + ']]>' : rendreBienForme(m.brut));
  } else if (f.cdata && !neu.includes(']]>') && !neu.includes('<')) e.sortie.push('<![CDATA[' + neu + ']]>');
  else e.sortie.push(echapperTexte(neu));
}

function texteDe(e: Etat, brut: string, cdata: boolean): void {
  if (e.saut > 0 || e.pile.length === 0) return;
  if (e.pile[e.pile.length - 1]?.nom === 'style') {
    e.feuille ??= { morceaux: [], texte: '', cdata: false };
    e.feuille.morceaux.push({ brut, cdata });
    e.feuille.texte += cdata ? brut : decoderEntites(brut);
    e.feuille.cdata ||= cdata;
  } else e.sortie.push(cdata ? echapperTexte(brut) : rendreBienForme(brut));
}

/**
 * Assainit un SVG : le texte du premier element <svg> jusqu'a sa fermeture, sans rien d'actif ni d'externe, avec `xmlns` et
 * `viewBox` ; `null` s'il n'y a pas de <svg> ou ni viewBox ni dimensions ; `{ erreur }` pour un texte qu'on refuse en le nommant
 * (mal forme, trop profond, trop gros…).
 */
export function assainirSvg(texte: string): SvgAssaini | { erreur: string } | null {
  const debut = trouverRacine(texte);
  if (debut < 0) return null;
  const e: Etat = { sortie: [], pile: [], saut: 0, feuille: null, racine: null };
  try {
    parcourirXml(debut === 0 ? texte : texte.slice(debut), j => {
      if (j.t === 'debut') debutDeBalise(e, j);
      else if (j.t === 'fin') finDeBalise(e, j.nom);
      else if (j.t === 'texte') texteDe(e, j.brut, false);
      else if (j.t === 'cdata') texteDe(e, j.contenu, true);
    });
  } catch (x) {
    if (x instanceof Fin) { /* la racine est refermee : le reste du texte ne compte pas */ } else if (x instanceof ErreurXml) {
      if (x.message === SANS_PLAN) return null;
      return { erreur: phraseErreurXml(x.message) };
    } else throw x;
  }
  if (e.racine === null || e.pile.length > 0) return { erreur: 'Ce SVG ne se lit pas : la balise « svg » n’est jamais fermée.' };
  return { svg: e.sortie.join(''), ratio: e.racine.ratio };
}
