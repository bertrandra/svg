// Le texte vivant dans le fichier (ADR-0022) : un <path> ecrit en contours exacts, plus des attributs `data-ed-*` qui
// permettent de le rouvrir comme texte. Ici, seulement ce qui touche aux octets et a l'identite du texte : l'encodage,
// l'ecriture et la lecture des attributs, la matrice qui suit les transformations, et la garde qui retire le texte d'une
// forme dont un outil a change le trace sans le connaitre. Pur ; n'importe que des modules d'edition de bas niveau.
//
// L'encodage : tout ce qui n'est pas une lettre ASCII ou un chiffre s'ecrit en pourcentage de ses octets UTF-8
// (« Noel » avec son trema : « No%C3%ABl »). La valeur ne porte alors ni espace, ni deux-points, ni parenthese, ni arobase, ni tiret :
// aucune expression du nettoyage (`assainirSvg`) ni des invariants de securite n'y trouve prise, quel que soit le texte
// tape (« javascript: », « url(x) », « @import », « -moz-binding »). L'annexe 4 de l'ADR-0012 gardait les lettres non
// ASCII en clair ; tout encoder rend l'attribut verifiable par une seule expression, au prix de quelques octets.

import { estPoliceLivree, phraseRemplacement, remplacerPolice } from '../../model/polices.js';
import { estIdCatalogue } from '../../model/cataloguePolices.js';
import type { AlignementTexte, Chemin, Commande, DessinSvg, DispositionTexte, Forme, Matrice, PoliceTexte, TexteVivant } from './types.js';
import { IDENTITE } from './types.js';
import { ecrireChemin, lireChemin, nb } from './chemins.js';
import { multiplier, transformerChemin } from './geometrie.js';

/** Au-dela, un texte n'est pas repris comme texte : il reste en contours (annexe 5 de l'ADR-0012). */
export const TEXTE_MAX = 10_000;
/** Bornes de lecture d'une taille et d'un coefficient (interlettrage, interligne). */
const TAILLE_MAX = 1e6, COEFFICIENT_MAX = 100;
export const INTERLIGNE_DEFAUT = 1.2;

/** Le message dit a l'ouverture quand les donnees d'un texte ne se lisent pas. */
export const MSG_TEXTE_ILLISIBLE = 'les données d’édition d’un texte sont illisibles : il reste en contours';

const ENCODE = /^(?:[A-Za-z0-9]|%[0-9A-F]{2})*$/;
const ID_POLICE = /^(?:[a-z0-9][a-z0-9-]{0,31}|u-[0-9a-f]{14})$/;
const VERSION = /^[0-9a-f]{14}$/;

/** Le texte encode : lettres ASCII et chiffres en clair, tout le reste en %XX des octets UTF-8. */
export function encoderTexte(t: string): string {
  // encodeURIComponent rend deja les octets UTF-8 en %XX ; il laisse en clair « - _ . ! ~ * ' ( ) », qu'on encode aussi.
  // Une moitie de paire de substitution isolee ne s'encode pas : elle devient le caractere de remplacement.
  let sain = '';
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i), suite = t.charCodeAt(i + 1);
    if (c >= 0xd800 && c < 0xdc00 && suite >= 0xdc00 && suite < 0xe000) { sain += t.slice(i, i + 2); i++; } else sain += c >= 0xd800 && c < 0xe000 ? '\uFFFD' : t.charAt(i);
  }
  return encodeURIComponent(sain).replace(/[^A-Za-z0-9%]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
}

/** Le texte d'une valeur encodee, ou null si elle n'est pas de la forme que l'ecriture produit (ou n'est pas de l'UTF-8). */
export function decoderTexte(v: string): string | null {
  if (!ENCODE.test(v)) return null;
  try { return decodeURIComponent(v); } catch { return null; }
}

/** Les noms des attributs, dans leur ordre d'ecriture. */
export const ATTRIBUTS_TEXTE = [
  'data-ed-texte', 'data-ed-police', 'data-ed-police-version', 'data-ed-famille', 'data-ed-taille', 'data-ed-interlettrage',
  'data-ed-interligne', 'data-ed-alignement', 'data-ed-ligatures', 'data-ed-trace', 'data-ed-matrice',
  // La disposition sur ou dans une forme (ADR-0031), seulement quand elle existe, chacun absent a son defaut.
  'data-ed-disposition', 'data-ed-depart', 'data-ed-cote', 'data-ed-repartir', 'data-ed-marge', 'data-ed-ajuster', 'data-ed-justifier'
] as const;

/**
 * Les attributs du lien d'un texte pose vers sa forme (ADR-0031), ecrits apres les autres par l'ecriture du dessin (ils dependent
 * de la place de la forme, pas du texte seul) : le rang de la forme parmi les chemins ecrits, ou, pour une forme masquee (qui ne
 * s'ecrit pas), son trace encode et sa regle de remplissage quand elle est pair-impair.
 */
export const ATTRIBUTS_LIEN = ['data-ed-forme', 'data-ed-forme-d', 'data-ed-forme-regle'] as const;

/** La marge interieure par defaut d'un texte dans une forme, en part de la taille. */
export const MARGE_DEFAUT = 0.25;
/** Au-dela, le trace d'une forme masquee n'est pas repris (en caracteres encodes). */
const TRACE_LIEN_MAX = 400_000;

const estIdentite = (m: Matrice): boolean => m.every((v, i) => v === IDENTITE[i]);
// Les parts lineaires d'une matrice sont des rapports sans unite : six decimales, pour qu'une rotation reste une rotation.
const ecrireMatrice = (m: Matrice): string => m.map((v, i) => nb(v, i < 4 ? 6 : 3)).join(' ');

/** Ce que l'ecriture ajoute au <path> d'un texte vivant : les attributs dans l'ordre, chacun absent quand il vaut son defaut. */
export function attributsTexte(f: Forme): string {
  const t = f.texte;
  if (!t) return '';
  const a: Array<[string, string]> = [['data-ed-texte', encoderTexte(t.texte)], ['data-ed-police', t.police.id]];
  if (t.police.version !== undefined) a.push(['data-ed-police-version', t.police.version]);
  if (t.police.famille !== undefined) a.push(['data-ed-famille', encoderTexte(t.police.famille)]);
  a.push(['data-ed-taille', nb(t.taille, 4)]);
  if (t.interlettrage !== 0) a.push(['data-ed-interlettrage', nb(t.interlettrage, 4)]);
  if (t.interligne !== INTERLIGNE_DEFAUT) a.push(['data-ed-interligne', nb(t.interligne, 4)]);
  if (t.alignement !== 'gauche') a.push(['data-ed-alignement', t.alignement]);
  if (t.ligatures) a.push(['data-ed-ligatures', '1']);
  if (t.trace === 'median') a.push(['data-ed-trace', 'median']);
  if (!estIdentite(t.matrice)) a.push(['data-ed-matrice', ecrireMatrice(t.matrice)]);
  const p = t.disposition;
  if (p) {
    a.push(['data-ed-disposition', p.mode]);
    if (p.mode === 'sur') {
      if (p.depart !== 0) a.push(['data-ed-depart', nb(p.depart, 4)]);
      if (p.cote !== 'dessus') a.push(['data-ed-cote', p.cote]);
      if (p.repartir) a.push(['data-ed-repartir', '1']);
    } else {
      if (p.marge !== MARGE_DEFAUT) a.push(['data-ed-marge', nb(p.marge, 4)]);
      if (p.ajuster) a.push(['data-ed-ajuster', '1']);
      if (p.justifier) a.push(['data-ed-justifier', '1']);
    }
  }
  return a.map(([k, v]) => ' ' + k + '="' + v + '"').join('');
}

/**
 * Le lien d'un texte pose vers sa forme, tel que l'ecriture du dessin l'ajoute (ADR-0031) : `data-ed-forme` et le rang de la
 * forme parmi les chemins ecrits (`rangs`, a partir de 1) quand elle est ecrite ; sinon, pour une forme masquee, son trace
 * encode (`data-ed-forme-d`), et `data-ed-forme-regle="evenodd"` s'il le faut. Rien pour un texte libre ou sans forme.
 */
export function attributsLien(f: Forme, formes: ReadonlyMap<string, Forme>, rangs: ReadonlyMap<string, number>, precision: number): string {
  const p = f.texte?.disposition;
  const base = p ? formes.get(p.forme) : undefined;
  if (!base || base.id === f.id || base.texte) return '';
  const rang = rangs.get(base.id);
  if (rang !== undefined) return ' data-ed-forme="' + rang + '"';
  return ' data-ed-forme-d="' + encoderTexte(ecrireChemin(base.d, precision)) + '"' + (base.regle === 'evenodd' ? ' data-ed-forme-regle="evenodd"' : '');
}

const nombre = (v: string | undefined, defaut: number): number | null => {
  if (v === undefined) return defaut;
  const n = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(v.trim()) ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

function lireMatrice(v: string | undefined): Matrice | null {
  if (v === undefined) return IDENTITE;
  const n = v.trim().split(/\s+/).map(x => nombre(x, NaN));
  if (n.length !== 6 || n.some(x => x === null || !Number.isFinite(x))) return null;
  const m = n as unknown as Matrice;
  // Une matrice degeneree ecraserait le texte recompose sur une ligne : on ne la reprend pas.
  return Math.abs(m[0] * m[3] - m[1] * m[2]) > 1e-12 ? m : null;
}

/**
 * Le lien d'un texte pose vers sa forme, tel que la lecture le trouve (ADR-0031) : le rang de la forme parmi les formes lues, ou
 * le trace d'une forme masquee, que la lecture recree (masquee) juste avant le texte.
 */
export type LienLu = { readonly rang: number } | { readonly d: Commande[]; readonly regle: 'nonzero' | 'evenodd' };

/**
 * Un texte lu, ou la raison de ne pas le reprendre. `remplacement` dit une police inconnue, remplacee par la regle. Un texte pose
 * (ADR-0031) porte une disposition dont la forme est encore a trouver (`forme` vide) et son `lien`, que la lecture resout.
 */
export type TexteLu = { readonly texte: TexteVivant; readonly remplacement?: string; readonly lien?: LienLu } | { readonly illisible: true } | null;

/** La disposition lue (forme encore inconnue), null si elle est hors de ses bornes, undefined sans disposition. */
function lireDisposition(a: Readonly<Record<string, string>>): DispositionTexte | null | undefined {
  const mode = a['data-ed-disposition'];
  if (mode === undefined) return undefined;
  const drapeau = (k: string): boolean | null => (a[k] === undefined ? false : a[k] === '1' ? true : null);
  if (mode === 'sur') {
    const depart = nombre(a['data-ed-depart'], 0), cote = a['data-ed-cote'] ?? 'dessus', repartir = drapeau('data-ed-repartir');
    if (depart === null || !(depart >= 0 && depart <= 1) || (cote !== 'dessus' && cote !== 'dessous') || repartir === null) return null;
    return { mode, forme: '', depart, cote, repartir };
  }
  if (mode === 'dans') {
    const marge = nombre(a['data-ed-marge'], MARGE_DEFAUT), ajuster = drapeau('data-ed-ajuster'), justifier = drapeau('data-ed-justifier');
    if (marge === null || !(marge >= 0 && marge <= COEFFICIENT_MAX) || ajuster === null || justifier === null) return null;
    return { mode, forme: '', marge, ajuster, justifier };
  }
  return null;
}

/** Le lien d'un texte pose : null s'il est illisible, undefined s'il n'y en a pas (la forme n'a pas ete ecrite). */
function lireLien(a: Readonly<Record<string, string>>, m: Matrice): LienLu | null | undefined {
  const rang = a['data-ed-forme'], d = a['data-ed-forme-d'], regle = a['data-ed-forme-regle'];
  if (rang !== undefined) return /^[1-9]\d{0,6}$/.test(rang) && d === undefined ? { rang: Number(rang) } : null;
  if (d === undefined) return regle === undefined ? undefined : null;
  const texte = d.length <= TRACE_LIEN_MAX ? decoderTexte(d) : null;
  const chemin = texte === null ? [] : lireChemin(texte);
  if (!chemin.length || (regle !== undefined && regle !== 'evenodd')) return null;
  return { d: estIdentite(m) ? chemin : transformerChemin(chemin, m), regle: regle === 'evenodd' ? 'evenodd' : 'nonzero' };
}

function lirePolice(a: Readonly<Record<string, string>>): { police: PoliceTexte; remplacement?: string } | null {
  const id = (a['data-ed-police'] ?? '').trim(), version = a['data-ed-police-version'];
  const famille = a['data-ed-famille'] === undefined ? undefined : decoderTexte(a['data-ed-famille']);
  if (!ID_POLICE.test(id) || (version !== undefined && !VERSION.test(version)) || famille === null) return null;
  const base: PoliceTexte = { id, ...(version !== undefined ? { version } : {}), ...(famille !== undefined ? { famille: famille.slice(0, 60) } : {}) };
  // Une fonte deposee (`u-`) ou une police du catalogue telechargeable (`c-`, ADR-0025) se garde telle quelle : l'interface la
  // retrouve (fichier depose, ou telechargement verifie par son empreinte) ; les contours ecrits restent la verite du dessin.
  if (id.startsWith('u-') || estIdCatalogue(id) || estPoliceLivree(id)) return { police: base };
  // Une police que ce programme ne livre pas (un fichier d'une autre version, ou retouche a la main) : remplacee, et dit.
  const r = remplacerPolice({ nom: famille ?? id });
  return { police: { id: r.id }, remplacement: phraseRemplacement(1, r) };
}

/**
 * Le texte vivant porte par les attributs d'un <path>, compose avec la matrice `m` des groupes qui l'entourent. Rend null
 * sans `data-ed-texte` (un chemin ordinaire), `{ illisible }` quand une donnee est hors de ses bornes : la forme reste
 * alors un chemin, et la lecture le dit.
 */
export function lireTexteVivant(a: Readonly<Record<string, string>>, m: Matrice): TexteLu {
  if (a['data-ed-texte'] === undefined) return null;
  const texte = decoderTexte(a['data-ed-texte']), police = lirePolice(a);
  const taille = nombre(a['data-ed-taille'], NaN), interlettrage = nombre(a['data-ed-interlettrage'], 0), interligne = nombre(a['data-ed-interligne'], INTERLIGNE_DEFAUT);
  const alignement = a['data-ed-alignement'] ?? 'gauche', ligatures = a['data-ed-ligatures'], trace = a['data-ed-trace'];
  const matrice = lireMatrice(a['data-ed-matrice']);
  const disposition = lireDisposition(a), lien = disposition ? lireLien(a, m) : undefined;
  if (disposition === null || lien === null) return { illisible: true };
  if (texte === null || texte.length > TEXTE_MAX || /^\s*$/.test(texte) || !police || taille === null || !(taille > 0 && taille <= TAILLE_MAX)
    || interlettrage === null || Math.abs(interlettrage) > COEFFICIENT_MAX || interligne === null || !(interligne > 0 && interligne <= COEFFICIENT_MAX)
    || (alignement !== 'gauche' && alignement !== 'centre' && alignement !== 'droite') || (ligatures !== undefined && ligatures !== '1') || (trace !== undefined && trace !== 'median') || !matrice) return { illisible: true };
  const vivant: TexteVivant = {
    texte, police: police.police, taille, interlettrage, interligne, alignement: alignement as AlignementTexte, ligatures: ligatures === '1', ...(trace === 'median' ? { trace: 'median' as const } : {}),
    matrice: estIdentite(m) ? matrice : multiplier(m, matrice),
    // Une disposition sans lien (sa forme n'a pas ete ecrite) ne se reprend pas : le texte redevient libre, ses contours restent.
    ...(disposition && lien ? { disposition } : {})
  };
  return { texte: vivant, ...(police.remplacement ? { remplacement: police.remplacement } : {}), ...(disposition && lien ? { lien } : {}) };
}

/** Le texte sans disposition : un texte libre (ses contours ne bougent qu'a la prochaine composition). Le meme s'il n'en a pas. */
export function sansDisposition(t: TexteVivant): TexteVivant {
  if (!t.disposition) return t;
  const { disposition: _d, ...reste } = t;
  void _d;
  return reste;
}

/**
 * Les formes que transforme une operation affine sur `ids` (ADR-0031) : un texte pose emmene sa forme (sauf verrouillee), qui le
 * porte ; le texte se recompose ensuite sur elle (suivreDispositions). Les memes identifiants quand aucun texte pose n'est choisi.
 */
export function avecFormesPorteuses(dessin: DessinSvg, ids: readonly string[]): readonly string[] {
  if (!dessin.formes.some(f => f.texte?.disposition)) return ids;
  const voulus = new Set(ids), avant = voulus.size;
  for (const f of dessin.formes) {
    const p = voulus.has(f.id) ? f.texte?.disposition : undefined;
    const base = p ? dessin.formes.find(x => x.id === p.forme) : undefined;
    if (base && !base.verrouille) voulus.add(base.id);
  }
  return voulus.size === avant ? ids : [...voulus];
}

/** Vrai si `id` est un texte pose sur une forme qui est aussi parmi `ids` : il la suit, on ne le deplace pas pour lui-meme. */
export function suitUneFormeChoisie(dessin: DessinSvg, id: string, ids: readonly string[]): boolean {
  const p = dessin.formes.find(f => f.id === id)?.texte?.disposition;
  return !!p && p.forme !== id && ids.includes(p.forme);
}

/**
 * Les copies d'une operation (dupliquer, coller, inserer) gardent le lien de leurs textes poses vers la copie de leur forme quand
 * elle est copiee aussi ; sinon le lien se perd (forme vide), et la recomposition fera de la copie un texte libre.
 */
export function relierCopie(f: Forme, correspondance: ReadonlyMap<string, string>): Forme {
  const p = f.texte?.disposition;
  if (!p || !f.texte) return f;
  const forme = correspondance.get(p.forme) ?? '';
  return forme === p.forme ? f : { ...f, texte: { ...f.texte, disposition: { ...p, forme } } };
}

export const relierCopies = (formes: readonly Forme[], correspondance: ReadonlyMap<string, string>): Forme[] => formes.map(f => relierCopie(f, correspondance));

/** Le texte transforme avec sa forme : la matrice de composition suit la transformation `m` du plan. */
export const transformerTexte = (t: TexteVivant, m: Matrice): TexteVivant => ({ ...t, matrice: multiplier(m, t.matrice) });

/** La forme transformee par `m`, son texte compris : ce que posent toutes les operations affines (deplacer, tourner, coller…). */
export const avecTexteTransforme = <F extends Forme>(f: F, source: Forme, m: Matrice): F => (source.texte ? { ...f, texte: transformerTexte(source.texte, m) } : f);

/** La forme sans son texte : elle garde ses contours et devient un chemin ordinaire. La meme forme si elle n'en a pas. */
export function sansTexte(f: Forme): Forme {
  if (!f.texte) return f;
  const { texte: _texte, ...reste } = f;
  void _texte;
  return reste;
}

/** Le dessin sans aucun texte vivant (un export qui ne porte que des contours). Le meme dessin s'il n'y en a pas. */
export function dessinSansTextes(d: DessinSvg): DessinSvg {
  return d.formes.some(f => f.texte) ? { ...d, formes: d.formes.map(sansTexte) } : d;
}

/**
 * La garde du texte vivant, appliquee apres chaque operation : une forme qui porte encore LE MEME objet texte qu'avant,
 * mais dont le trace a change, a ete modifiee par un outil qui ne connait pas le texte (booleen, points, contour en forme,
 * combiner, separer…). Ses contours ne sont plus ceux du texte : elle le perd et devient un chemin ordinaire. Les
 * operations qui savent le texte (transformer, retaper) posent un objet texte neuf, et passent. Rend `apres` lui-meme
 * quand rien n'est a retirer, et les identifiants des formes vectorisees.
 */
export function garderTextes(avant: DessinSvg, apres: DessinSvg): { dessin: DessinSvg; vectorises: string[] } {
  if (avant === apres || !apres.formes.some(f => f.texte)) return { dessin: apres, vectorises: [] };
  const traces = new Map<TexteVivant, Chemin>();
  for (const f of avant.formes) if (f.texte) traces.set(f.texte, f.d);
  const vectorises: string[] = [];
  const formes = apres.formes.map(f => {
    if (!f.texte) return f;
    const d = traces.get(f.texte);
    if (d === undefined || d === f.d) return f;
    vectorises.push(f.id);
    return sansTexte(f);
  });
  return vectorises.length ? { dessin: { ...apres, formes }, vectorises } : { dessin: apres, vectorises };
}

/**
 * Les liens des textes poses, resolus apres la lecture de toutes les formes (ADR-0031) : un rang designe la forme lue a cette
 * place (ni le texte lui-meme, ni un autre texte) ; un trace recree la forme masquee juste avant son texte, sans peinture a elle
 * (un filet noir d'une unite, s'il est un jour montre). Un lien qui ne mene a rien rend le texte libre, ses contours inchanges.
 */
export function resoudreLiens(formes: readonly Forme[], liens: ReadonlyArray<{ readonly id: string; readonly lien: LienLu }>): Forme[] {
  if (!liens.length) return [...formes];
  const parId = new Map(liens.map(l => [l.id, l.lien]));
  let n = formes.reduce((m, f) => Math.max(m, Number(/^f(\d+)$/.exec(f.id)?.[1] ?? 0)), 0) + 1;
  const r: Forme[] = [];
  for (const f of formes) {
    const lien = parId.get(f.id), p = f.texte?.disposition;
    if (!lien || !p || !f.texte) { r.push(f); continue; }
    if ('rang' in lien) {
      const base = formes[lien.rang - 1];
      const ok = !!base && base.id !== f.id && !base.texte && base.d.length > 0;
      r.push({ ...f, texte: ok ? { ...f.texte, disposition: { ...p, forme: base.id } } : sansDisposition(f.texte) });
      continue;
    }
    const id = 'f' + n++;
    r.push({ id, d: lien.d, remplissage: null, contour: '#000000', epaisseur: 1, opacite: 1, regle: lien.regle, visible: false, verrouille: false });
    r.push({ ...f, texte: { ...f.texte, disposition: { ...p, forme: id } } });
  }
  return r;
}
