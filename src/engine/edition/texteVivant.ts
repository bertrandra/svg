// Le texte vivant dans le fichier (ADR-0021) : un <path> ecrit en contours exacts, plus des attributs `data-ed-*` qui
// permettent de le rouvrir comme texte. Ici, seulement ce qui touche aux octets et a l'identite du texte : l'encodage,
// l'ecriture et la lecture des attributs, la matrice qui suit les transformations, et la garde qui retire le texte d'une
// forme dont un outil a change le trace sans le connaitre. Pur ; n'importe que des modules d'edition de bas niveau.
//
// L'encodage : tout ce qui n'est pas une lettre ASCII ou un chiffre s'ecrit en pourcentage de ses octets UTF-8
// (« Noël » : « No%C3%ABl »). La valeur ne porte alors ni espace, ni deux-points, ni parenthese, ni arobase, ni tiret :
// aucune expression du nettoyage (`assainirSvg`) ni des invariants de securite n'y trouve prise, quel que soit le texte
// tape (« javascript: », « url(x) », « @import », « -moz-binding »). L'annexe 4 de l'ADR-0012 gardait les lettres non
// ASCII en clair ; tout encoder rend l'attribut verifiable par une seule expression, au prix de quelques octets.

import { estPoliceLivree, phraseRemplacement, remplacerPolice } from '../../model/polices.js';
import type { AlignementTexte, Chemin, DessinSvg, Forme, Matrice, PoliceTexte, TexteVivant } from './types.js';
import { IDENTITE } from './types.js';
import { nb } from './chemins.js';
import { multiplier } from './geometrie.js';

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
  'data-ed-interligne', 'data-ed-alignement', 'data-ed-ligatures', 'data-ed-matrice'
] as const;

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
  if (!estIdentite(t.matrice)) a.push(['data-ed-matrice', ecrireMatrice(t.matrice)]);
  return a.map(([k, v]) => ' ' + k + '="' + v + '"').join('');
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

/** Un texte lu, ou la raison de ne pas le reprendre. `remplacement` dit une police inconnue, remplacee par la regle. */
export type TexteLu = { readonly texte: TexteVivant; readonly remplacement?: string } | { readonly illisible: true } | null;

function lirePolice(a: Readonly<Record<string, string>>): { police: PoliceTexte; remplacement?: string } | null {
  const id = (a['data-ed-police'] ?? '').trim(), version = a['data-ed-police-version'];
  const famille = a['data-ed-famille'] === undefined ? undefined : decoderTexte(a['data-ed-famille']);
  if (!ID_POLICE.test(id) || (version !== undefined && !VERSION.test(version)) || famille === null) return null;
  const base: PoliceTexte = { id, ...(version !== undefined ? { version } : {}), ...(famille !== undefined ? { famille: famille.slice(0, 60) } : {}) };
  if (id.startsWith('u-') || estPoliceLivree(id)) return { police: base };
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
  const alignement = a['data-ed-alignement'] ?? 'gauche', ligatures = a['data-ed-ligatures'];
  const matrice = lireMatrice(a['data-ed-matrice']);
  if (texte === null || texte.length > TEXTE_MAX || /^\s*$/.test(texte) || !police || taille === null || !(taille > 0 && taille <= TAILLE_MAX)
    || interlettrage === null || Math.abs(interlettrage) > COEFFICIENT_MAX || interligne === null || !(interligne > 0 && interligne <= COEFFICIENT_MAX)
    || (alignement !== 'gauche' && alignement !== 'centre' && alignement !== 'droite') || (ligatures !== undefined && ligatures !== '1') || !matrice) return { illisible: true };
  const vivant: TexteVivant = {
    texte, police: police.police, taille, interlettrage, interligne, alignement: alignement as AlignementTexte, ligatures: ligatures === '1',
    matrice: estIdentite(m) ? matrice : multiplier(m, matrice)
  };
  return { texte: vivant, ...(police.remplacement ? { remplacement: police.remplacement } : {}) };
}

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
