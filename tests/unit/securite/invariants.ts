// Les invariants que doit satisfaire TOUT SVG qui sort du nettoyage ou de l'ecriture, quelle que soit
// l'entree (docs/securite.md). Ce fichier est la specification executable : il ne reutilise rien de
// `src/` (ni le lecteur XML, ni la liste d'elements du nettoyage), pour que le test ne soit pas
// d'accord avec le code par construction. Son analyseur XML est strict (XML 1.0 bien forme) et lineaire.

/** Les elements qu'un SVG nettoye peut contenir : le vocabulaire graphique de SVG 1.1 et 2, sans script ni objet etranger. */
export const ELEMENTS_PERMIS: ReadonlySet<string> = new Set([
  'svg', 'g', 'defs', 'symbol', 'use', 'a', 'switch', 'view', 'title', 'desc', 'metadata', 'style',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'image', 'text', 'tspan', 'textPath', 'tref', 'altGlyph',
  'linearGradient', 'radialGradient', 'stop', 'pattern', 'clipPath', 'mask', 'marker', 'filter', 'solidcolor',
  'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap',
  'feDistantLight', 'feDropShadow', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur', 'feImage', 'feMerge',
  'feMergeNode', 'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile', 'feTurbulence',
  'animate', 'animateColor', 'animateMotion', 'animateTransform', 'set', 'mpath'
]);

/** Les elements et attributs de l'ecriture (`ecrireDessin`) : rien d'autre ne doit en sortir. */
export const ELEMENTS_ECRITURE: ReadonlySet<string> = new Set(['svg', 'path', 'metadata']);
export const ATTRIBUTS_ECRITURE: ReadonlySet<string> = new Set([
  'xmlns', 'viewBox', 'width', 'height', 'd', 'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap',
  'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'opacity', 'data-origine',
  // La marque du contexte de production (ADR-0013) : sur la racine seule, des identifiants courts et rien d'autre.
  'data-ed-contexte', 'data-ed-machine', 'data-ed-tapis', 'data-ed-materiau', 'data-ed-procede', 'data-ed-unite'
]);

const ESPACES_DE_NOMS_PERMIS = new Set([
  'http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xlink', 'http://www.inkscape.org/namespaces/inkscape',
  'http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'http://creativecommons.org/ns#',
  'http://purl.org/dc/elements/1.1/', 'http://purl.org/dc/terms/'
]);
const PREFIXES_PERMIS = new Set(['xlink', 'xml', 'xmlns', 'inkscape', 'sodipodi', 'rdf', 'cc', 'dc', 'dcterms', 'svg']);

export interface ElementLu { nom: string; attributs: ReadonlyArray<readonly [string, string]>; profondeur: number; parent: string }
export type AnalyseStricte = { erreur: string } | { elements: ElementLu[]; textes: Array<{ parent: string; texte: string }>; cdata: number };

/** Une classe de caracteres par plages de points de code (evite les controles litteraux dans les expressions). */
const classe = (...plages: Array<readonly [number, number]>): RegExp =>
  new RegExp('[' + plages.map(([a, b]) => String.fromCharCode(a) + '-' + String.fromCharCode(b)).join('') + ']', 'g');

const NOM = /^[\p{L}_:][\p{L}\p{M}\p{N}_:.-]*$/u;
const REFERENCE_VALIDE = /^(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);/;

/** Vrai quand chaque « & » de `t` ouvre une reference d'entite predefinie ou numerique valide. */
function referencesValides(t: string): boolean {
  for (let i = t.indexOf('&'); i >= 0; i = t.indexOf('&', i + 1)) {
    if (!REFERENCE_VALIDE.test(t.slice(i + 1, i + 14))) return false;
  }
  return true;
}

/** Vrai quand la reference numerique designe un caractere XML permis (pas de NUL, de controle, de surrogate). */
function caracteresPermis(t: string): boolean {
  for (const m of t.matchAll(/&#(x[0-9a-fA-F]+|[0-9]+);/g)) {
    const n = m[1]?.startsWith('x') ? parseInt(m[1].slice(1), 16) : Number(m[1]);
    if (!(n === 9 || n === 10 || n === 13 || (n >= 0x20 && n <= 0xd7ff) || (n >= 0xe000 && n <= 0xfffd) || (n >= 0x10000 && n <= 0x10ffff))) return false;
  }
  return !classe([0, 8], [0xb, 0xc], [0xe, 0x1f], [0xfffe, 0xffff]).test(t);
}

/**
 * Lit `svg` comme du XML 1.0 strict : une racine, des noms valides, des attributs entre guillemets sans doublon, des
 * entites predefinies seulement, ni commentaire, ni instruction, ni DOCTYPE. Ne rend jamais d'exception.
 */
export function analyserStrict(svg: string): AnalyseStricte {
  const elements: ElementLu[] = [], textes: Array<{ parent: string; texte: string }> = [];
  const pile: string[] = [];
  let i = 0, racines = 0, cdata = 0;
  const n = svg.length;
  if (!caracteresPermis(svg)) return { erreur: 'caractere interdit en XML' };
  while (i < n) {
    const lt = svg.indexOf('<', i);
    const texte = svg.slice(i, lt < 0 ? n : lt);
    if (texte !== '') {
      if (pile.length === 0 && texte.trim() !== '') return { erreur: 'texte hors de la racine' };
      if (texte.includes(']]>')) return { erreur: '"]]>" dans le texte' };
      if (!referencesValides(texte)) return { erreur: 'entite invalide dans le texte' };
      if (pile.length > 0) textes.push({ parent: pile[pile.length - 1] ?? '', texte });
    }
    if (lt < 0) break;
    if (svg.startsWith('<![CDATA[', lt)) {
      const fin = svg.indexOf(']]>', lt);
      if (fin < 0 || pile.length === 0) return { erreur: 'CDATA mal place' };
      textes.push({ parent: pile[pile.length - 1] ?? '', texte: svg.slice(lt + 9, fin) });
      cdata++;
      i = fin + 3;
      continue;
    }
    if (svg.startsWith('<!', lt) || svg.startsWith('<?', lt)) return { erreur: 'commentaire, DOCTYPE ou instruction de traitement' };
    if (svg.startsWith('</', lt)) {
      const fin = svg.indexOf('>', lt);
      if (fin < 0) return { erreur: 'fermeture non terminee' };
      const nom = svg.slice(lt + 2, fin);
      if (pile.pop() !== nom) return { erreur: 'fermeture </' + nom.slice(0, 40) + '> orpheline' };
      i = fin + 1;
      continue;
    }
    // Une balise ouvrante : nom, attributs, puis > ou />.
    let j = lt + 1;
    while (j < n && !/[\s/>]/.test(svg.charAt(j))) j++;
    const nom = svg.slice(lt + 1, j);
    if (!NOM.test(nom)) return { erreur: 'nom d\'element invalide : ' + nom.slice(0, 40) };
    const attributs: Array<readonly [string, string]> = [], vus = new Set<string>();
    let ferme = false;
    for (;;) {
      const debutBlancs = j;
      while (j < n && /\s/.test(svg.charAt(j))) j++;
      if (j >= n) return { erreur: 'balise non terminee' };
      const c = svg.charAt(j);
      if (c === '>') { j++; break; }
      if (c === '/') { if (svg.charAt(j + 1) !== '>') return { erreur: 'barre isolee dans une balise' }; ferme = true; j += 2; break; }
      if (j === debutBlancs) return { erreur: 'attributs colles' };
      const d = j;
      while (j < n && !/[\s=/>]/.test(svg.charAt(j))) j++;
      const nomAttr = svg.slice(d, j);
      if (!NOM.test(nomAttr)) return { erreur: 'nom d\'attribut invalide : ' + nomAttr.slice(0, 40) };
      if (vus.has(nomAttr)) return { erreur: 'attribut repete : ' + nomAttr };
      vus.add(nomAttr);
      while (j < n && /\s/.test(svg.charAt(j))) j++;
      if (svg.charAt(j) !== '=') return { erreur: 'attribut sans valeur : ' + nomAttr };
      j++;
      while (j < n && /\s/.test(svg.charAt(j))) j++;
      const guillemet = svg.charAt(j);
      if (guillemet !== '"' && guillemet !== "'") return { erreur: 'valeur non quotee : ' + nomAttr };
      const fin = svg.indexOf(guillemet, j + 1);
      if (fin < 0) return { erreur: 'valeur non terminee' };
      const valeur = svg.slice(j + 1, fin);
      if (valeur.includes('<')) return { erreur: '"<" dans la valeur de ' + nomAttr };
      if (!referencesValides(valeur)) return { erreur: 'entite invalide dans ' + nomAttr };
      attributs.push([nomAttr, valeur]);
      j = fin + 1;
    }
    if (pile.length === 0) { if (++racines > 1) return { erreur: 'plusieurs racines' }; if (nom !== 'svg') return { erreur: 'la racine n\'est pas svg' }; }
    elements.push({ nom, attributs, profondeur: pile.length, parent: pile[pile.length - 1] ?? '' });
    if (!ferme) pile.push(nom);
    i = j;
  }
  if (pile.length > 0) return { erreur: 'element non ferme : ' + pile[pile.length - 1] };
  if (racines !== 1) return { erreur: 'pas de racine' };
  return { elements, textes, cdata };
}

/** Decode les entites d'une valeur comme le ferait un analyseur XML (puis, par prudence, comme un analyseur HTML laxiste). */
export function decoder(t: string): string {
  return t.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);?/gi, (_, e: string) => {
    if (e.startsWith('#')) {
      const n = /^#x/i.test(e) ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
    }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()] ?? '';
  });
}

/** Une valeur ramenee a ce qu'un navigateur lirait : entites decodees, controles et blancs retires, minuscules. */
const nu = (t: string): string => decoder(t).replace(classe([0, 0x20], [0x7f, 0x9f], [0xad, 0xad], [0x200b, 0x200f], [0x2028, 0x2029], [0xfeff, 0xfeff]), '').toLowerCase();

const DANGER_CSS: ReadonlyArray<readonly [string, RegExp]> = [
  ['@import', /@\s*import/i],
  ['url() non local', /url\(\s*(?!['"]?\s*#)/i],
  ['expression()', /expression\s*\(/i],
  ['-moz-binding', /-moz-binding/i],
  ['behavior', /behavior\s*:/i],
  ['image-set / src()', /(?:image-set|cross-fade|\bsrc)\s*\(/i]
];

/** Les defauts du CSS d'une feuille ou d'un attribut style (apres retrait des commentaires et des echappements). */
function defautsCss(css: string, ou: string): string[] {
  // Les echappements CSS (\72 = r) et les commentaires cachent un mot ; on les resout avant de chercher.
  const clair = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\\([0-9a-fA-F]{1,6})\s?|\\(.)/g, (_, h: string | undefined, c: string | undefined) => (h ? String.fromCodePoint(Math.min(parseInt(h, 16) || 63, 0x10ffff)) : c ?? ''));
  const defauts = DANGER_CSS.filter(([, re]) => re.test(clair) || re.test(css)).map(([nom]) => nom + ' dans ' + ou);
  if (/javascript:|vbscript:|data:/i.test(nu(clair))) defauts.push('schema dangereux dans ' + ou);
  return defauts;
}

const IMAGE_BASE64 = /^data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\s]*$/;

/** Les defauts d'un attribut d'un SVG nettoye (rien ne s'execute, rien ne va chercher ailleurs). */
function defautsAttribut(element: string, nom: string, valeur: string): string[] {
  const d: string[] = [], bas = nom.toLowerCase(), v = nu(valeur);
  const lieu = '<' + element + ' ' + nom + '>';
  if (/^on/i.test(nom)) d.push('gestionnaire ' + nom);
  if (nom.includes(':')) {
    const prefixe = nom.slice(0, nom.indexOf(':'));
    if (!PREFIXES_PERMIS.has(prefixe)) d.push('prefixe non permis ' + nom);
  }
  if (bas === 'xmlns' || bas.startsWith('xmlns:')) {
    if (!ESPACES_DE_NOMS_PERMIS.has(valeur)) d.push('espace de noms non permis ' + valeur.slice(0, 60));
    return d;
  }
  if (bas === 'xml:base') d.push('xml:base');
  if (/(^|:)(?:src|srcset|action|formaction|poster|background|ping|codebase|manifest|longdesc)$/i.test(nom)) d.push('attribut a URL ' + nom);
  const lien = /(^|:)href$/i.test(nom);
  if (lien) {
    const brut = decoder(valeur).trim();
    if (brut.startsWith('#')) { /* renvoi local */ } else if (['image', 'feImage'].includes(element) && IMAGE_BASE64.test(brut)) { /* image en ligne */ } else d.push('href non local sur ' + lieu + ' : ' + valeur.slice(0, 60));
  } else if (nom === 'data-href-externe') {
    if (/(?:javascript|vbscript|data)\s*:/i.test(v)) d.push('schema dangereux dans data-href-externe');
    return d;
  } else {
    if (/javascript:|vbscript:|livescript:/.test(v)) d.push('schema script dans ' + lieu);
    if (/data:/.test(v) && !IMAGE_BASE64.test(decoder(valeur).trim())) d.push('data: dans ' + lieu);
    d.push(...defautsCss(decoder(valeur), lieu));
  }
  if (['set', 'animate', 'animateColor', 'animateTransform', 'animateMotion'].includes(element) && bas === 'attributename' && /^(?:xlink:)?href$|^on|^xml:base$/i.test(decoder(valeur).trim())) d.push('animation de ' + valeur);
  return d;
}

/** Tous les defauts d'un SVG qui sort du nettoyage (`nettoyerSvg`), ou une liste vide. */
export function violationsNettoyage(svg: string): string[] {
  const a = analyserStrict(svg);
  if ('erreur' in a) return ['mal forme : ' + a.erreur];
  const d: string[] = [];
  if (/<script|<foreignobject|<!doctype|<!entity|<!--|<\?/i.test(svg.replace(/\sdata-href-externe="[^"]*"/g, ''))) d.push('motif interdit dans le texte');
  for (const e of a.elements) {
    // Un element prefixe n'est permis que dans <metadata> (RDF des licences).
    if (!ELEMENTS_PERMIS.has(e.nom) && !(e.nom.includes(':') && PREFIXES_PERMIS.has(e.nom.slice(0, e.nom.indexOf(':'))))) d.push('element non permis <' + e.nom.slice(0, 40) + '>');
    for (const [nom, valeur] of e.attributs) d.push(...defautsAttribut(e.nom, nom, valeur));
  }
  for (const t of a.textes) if (t.parent === 'style') d.push(...defautsCss(decoder(t.texte), '<style>'));
  return d;
}

/** La mention de provenance telle que l'ecriture la pose : des caracteres sans rien a echapper, des adresses fixes. */
const MENTION_ECRITE = /^Contient des formes dont la source est [A-Za-z0-9 .-]+ \(https:\/\/[a-z0-9./-]+\), sous licence [A-Za-z0-9 .]+ \(https:\/\/[a-z0-9./.-]+\)\.(?: Origines : [a-z0-9:, -]+\.)?$/;
const NOMBRE = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i;

/** Tous les defauts d'un SVG ecrit par `ecrireDessin` : seulement <svg> et <path>, des attributs connus, des valeurs sans texte libre. */
export function violationsEcriture(svg: string): string[] {
  const a = analyserStrict(svg);
  if ('erreur' in a) return ['mal forme : ' + a.erreur];
  const d: string[] = [];
  if (a.cdata > 0) d.push('CDATA dans une ecriture');
  // Le seul texte permis est la mention d'attribution des formes creditees (model/credits.ts), dans <metadata> : une
  // phrase fixe et des origines validees, jamais ce que l'entree contenait.
  if (a.textes.some(t => t.texte.trim() !== '' && !(t.parent === 'metadata' && MENTION_ECRITE.test(t.texte)))) d.push('texte dans une ecriture');
  for (const e of a.elements) {
    if (!ELEMENTS_ECRITURE.has(e.nom)) d.push('element ecrit inattendu <' + e.nom.slice(0, 40) + '>');
    if ((e.nom === 'svg') !== (e.profondeur === 0)) d.push('<svg> hors de la racine');
    for (const [nom, valeur] of e.attributs) {
      if (!ATTRIBUTS_ECRITURE.has(nom)) { d.push('attribut ecrit inattendu ' + nom.slice(0, 40)); continue; }
      if (nom.startsWith('data-ed-')) { if (e.profondeur !== 0 || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(valeur)) d.push(nom + ' inattendu : ' + valeur.slice(0, 60)); } else if (nom === 'data-origine') { if (!/^[a-z][a-z0-9-]*:[a-z0-9-]+(?: [a-z][a-z0-9-]*:[a-z0-9-]+)*$/.test(valeur)) d.push('data-origine inattendu : ' + valeur.slice(0, 60)); } else if (nom === 'xmlns') { if (valeur !== 'http://www.w3.org/2000/svg') d.push('xmlns different'); } else if (nom === 'd') {
        if (!/^[MLCQZ0-9eE.,\s+-]*$/.test(valeur)) d.push('chemin avec des caracteres inattendus');
      } else if (nom === 'fill' || nom === 'stroke') {
        // Une couleur #rrggbb, none, ou un mot-cle CSS en lettres : jamais d'adresse, de fonction ni de ponctuation.
        if (!/^(?:#[0-9a-f]{3,8}|[a-z][a-z0-9-]{0,40}(?:\([a-z0-9#%.,\s/+-]{0,150}\))?)$/i.test(valeur) || /url\(/i.test(valeur)) d.push(nom + ' avec une valeur libre : ' + valeur.slice(0, 60));
      } else if (nom === 'fill-rule' || nom === 'stroke-linecap' || nom === 'stroke-linejoin') {
        if (!/^[a-z-]{1,20}$/.test(valeur)) d.push(nom + ' inattendu : ' + valeur);
      } else if (nom === 'viewBox' || nom === 'stroke-dasharray') {
        if (!/^[0-9eE.\s+,-]*$/.test(valeur)) d.push(nom + ' avec des caracteres inattendus');
      } else if (!NOMBRE.test(valeur)) d.push(nom + ' non numerique : ' + valeur.slice(0, 40));
    }
  }
  return d;
}
