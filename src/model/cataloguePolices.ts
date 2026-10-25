// L'index des polices libres telechargeables (ADR-0025) : sa forme, sa validation, l'identite d'une variante et les adresses
// de ses fichiers. L'index est un instantane commis (data/catalogue-polices.json), produit a la main par
// scripts/catalogue-polices.mjs et livre dans l'annexe dist/polices-catalogue.js : rien ne le construit en contactant le
// reseau, et ce module ne fait que le lire. Pur : des donnees en entree, des donnees en sortie.
//
// La reproductibilite : une variante (une famille, une graisse, un style) a un identifiant stable `c-` suivi de 14 chiffres
// hexadecimaux, calcule de son depot, de sa famille et de son style ; sa version est l'empreinte des empreintes sha256 de ses
// fichiers. Un texte vivant garde les deux (ADR-0022) : le meme identifiant et la meme version designent les memes octets,
// verifies a chaque telechargement. Quand l'index est rafraichi, la version qu'il remplace passe dans `anciennes` : un dessin
// d'hier retrouve ses fichiers.

import { empreinteTexte } from '../util/empreinte.js';
import { SERVEURS_POLICES, estLicenceAdmise, rangSource, sourcePolices, type IdDepot, type IdLicencePolice, type IdServeur, type IdSourcePolices } from './sourcesPolices.js';

export type CategoriePolice = 'lineale' | 'empattements' | 'affiche' | 'manuscrite' | 'chasse-fixe' | 'autre';

export const NOMS_CATEGORIES: Readonly<Record<CategoriePolice, string>> = {
  lineale: 'Linéales', empattements: 'À empattements', affiche: 'Affiche', manuscrite: 'Manuscrites et scriptes', 'chasse-fixe': 'Chasse fixe', autre: 'Autres'
};
export const CATEGORIES: readonly CategoriePolice[] = ['lineale', 'empattements', 'affiche', 'manuscrite', 'chasse-fixe', 'autre'];

/**
 * Une variante telle que l'index la porte, en tableau pour que l'annexe reste legere :
 * [poids, italique (0 ou 1), empreinte sha256 du fichier latin, empreinte du fichier latin-ext ou null, chemin, libelle].
 * Le chemin n'existe que pour un depot dont les noms de fichiers ne se calculent pas (Velvetyne, Fontshare) ; le libelle
 * nomme un style qui n'est pas une graisse (« Fractura »).
 */
export type VarianteBrute = readonly [number, 0 | 1, string, string | null, string?, string?];

export interface FamilleCatalogue {
  /** L'identifiant de la famille dans son depot : le nom du paquet Fontsource, le chemin du depot Velvetyne, le slug Fontshare. */
  readonly id: string;
  readonly nom: string;
  readonly depot: IdDepot;
  /** La source du registre a qui on la doit (Google Fonts, la League, SIL, Velvetyne…). */
  readonly source: IdSourcePolices;
  readonly categorie: CategoriePolice;
  readonly licence: IdLicencePolice;
  /** La version epinglee : celle du paquet npm, un commit de 40 chiffres, la version annoncee par Fontshare. */
  readonly version: string;
  /** Les sous-ensembles d'ecriture que la famille couvre (latin, latin-ext, cyrillic…), pour information. */
  readonly ecritures: readonly string[];
  /** L'identifiant numerique du projet GitLab (Velvetyne). */
  readonly projet?: string;
  readonly variantes: readonly VarianteBrute[];
}

export interface CataloguePolices {
  readonly format: 1;
  /** La date de l'instantane (AAAA-MM-JJ), ecrite par le script. */
  readonly instantane: string;
  readonly familles: readonly FamilleCatalogue[];
  /** Les versions remplacees par un rafraichissement de l'index : de quoi recomposer un dessin d'hier. */
  readonly anciennes: readonly FamilleCatalogue[];
}

/** Une variante lue : de quoi la nommer, la choisir et telecharger ses fichiers. */
export interface VariantePolice {
  /** `c-` et 14 chiffres hexadecimaux : stable d'une version de l'index a l'autre. */
  readonly id: string;
  /** L'empreinte des empreintes de ses fichiers (14 chiffres hexadecimaux) : ce qu'un texte vivant garde comme version. */
  readonly version: string;
  readonly famille: FamilleCatalogue;
  readonly poids: number;
  readonly italique: boolean;
  readonly libelle?: string;
  /** Le nom lisible : « Roboto », « Roboto 700 italique », « Flor de Ruina Fractura ». */
  readonly nom: string;
  /** Les fichiers, le latin d'abord : leur empreinte sha256 (base64) et leurs adresses dans l'ordre ou on les essaie. */
  readonly fichiers: readonly FichierPolice[];
}

export interface FichierPolice {
  readonly sousEnsemble: 'latin' | 'latin-ext' | 'complet';
  readonly empreinte: string;
  readonly adresses: ReadonlyArray<{ readonly serveur: IdServeur; readonly url: string }>;
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SHA256_B64 = /^[A-Za-z0-9+/]{43}=$/;
const VERSION: Readonly<Record<IdDepot, RegExp>> = { fontsource: /^\d{1,4}\.\d{1,4}\.\d{1,4}$/, velvetyne: /^[0-9a-f]{40}$/, fontshare: /^\d{1,3}(?:\.\d{1,3}){0,2}$/ };
const CHEMIN: Readonly<Record<IdDepot, RegExp | null>> = {
  fontsource: null,
  // Un chemin de depot : des noms simples separes par des barres, jamais « .. », une extension de fonte.
  velvetyne: /^(?:[A-Za-z0-9_][A-Za-z0-9 _.-]{0,80}\/){0,4}[A-Za-z0-9_][A-Za-z0-9 _.-]{0,80}\.(?:woff|ttf|otf)$/,
  fontshare: /^[A-Z0-9]{32}\/[A-Z0-9]{32}\/[A-Z0-9]{32}\.woff$/
};
const ECRITURE = /^[a-z0-9-]{1,40}$/;
/** Vrai quand un chemin de fichier a la forme que le depot admet (jamais « .. ») : le script le demande avant de garder un fichier. */
export const cheminAdmis = (depot: IdDepot, chemin: string): boolean => { const m = CHEMIN[depot]; return m !== null && m.test(chemin) && !chemin.includes('..'); };
const LIBELLE = /^[\p{L}\p{N} .'-]{1,40}$/u;
/** Ce que l'index porte au plus : au-dela, ce n'est pas un index de ce programme. */
export const LIMITES_CATALOGUE = { familles: 10_000, variantes: 64, nom: 80 } as const;

/** La cle stable d'une variante, d'ou se tire son identifiant. */
const cleVariante = (f: Pick<FamilleCatalogue, 'depot' | 'id'>, v: VarianteBrute): string =>
  f.depot + ':' + f.id + ':' + v[0] + ':' + (v[1] ? 'i' : 'n') + (v[5] ? ':' + v[5] : '');

/** L'identifiant d'une variante : `c-` et l'empreinte de sa cle. Un texte vivant l'ecrit dans `data-ed-police`. */
export const idVariante = (f: Pick<FamilleCatalogue, 'depot' | 'id'>, v: VarianteBrute): string => 'c-' + empreinteTexte(cleVariante(f, v));

/** La version d'une variante : l'empreinte de ses empreintes sha256, dans l'ordre des fichiers. */
export const versionVariante = (v: VarianteBrute): string => empreinteTexte(v[2] + (v[3] ? ' ' + v[3] : ''));

/** Vrai pour un identifiant de police du catalogue (`c-` et 14 chiffres hexadecimaux). */
export const estIdCatalogue = (id: string): boolean => /^c-[0-9a-f]{14}$/.test(id);

const GRAISSES: Readonly<Record<number, string>> = { 100: 'Extra-fine', 200: 'Ultra-fine', 300: 'Fine', 400: '', 500: 'Medium', 600: 'Demi-grasse', 700: 'Grasse', 800: 'Extra-grasse', 900: 'Noire' };

/** Le nom lisible d'une variante. */
export function nomVariante(f: Pick<FamilleCatalogue, 'nom'>, v: VarianteBrute): string {
  const morceaux = [f.nom];
  if (v[5]) morceaux.push(v[5]);
  else if (v[0] !== 400) morceaux.push(GRAISSES[v[0]] || String(v[0]));
  if (v[1] && !(v[5] && /ital|obli/i.test(v[5]))) morceaux.push('italique');
  return morceaux.join(' ');
}

/** Les adresses d'un fichier, dans l'ordre ou on les essaie ; chacune verifiee contre le prefixe de son serveur. */
export function adressesFichier(f: FamilleCatalogue, v: VarianteBrute, sousEnsemble: FichierPolice['sousEnsemble']): FichierPolice['adresses'] {
  const style = v[1] ? 'italic' : 'normal';
  const a: Array<{ serveur: IdServeur; url: string }> = [];
  if (f.depot === 'fontsource') {
    const nom = f.id + '-' + sousEnsemble + '-' + v[0] + '-' + style + '.woff';
    a.push({ serveur: 'jsdelivr', url: SERVEURS_POLICES.jsdelivr.prefixe + f.id + '@' + f.version + '/files/' + nom });
    // Bunny Fonts sert les fichiers de la derniere version de Fontsource, sans version dans l'adresse : un repli tant qu'elle
    // est celle de l'index, que l'empreinte verifie (un fichier d'une autre version est refuse).
    a.push({ serveur: 'bunny', url: SERVEURS_POLICES.bunny.prefixe + f.id + '/files/' + nom });
  } else if (f.depot === 'velvetyne' && v[4] && f.projet) {
    a.push({ serveur: 'gitlab', url: SERVEURS_POLICES.gitlab.prefixe + f.projet + '/repository/files/' + encodeURIComponent(v[4]) + '/raw?ref=' + f.version });
  } else if (f.depot === 'fontshare' && v[4]) {
    a.push({ serveur: 'fontshare', url: SERVEURS_POLICES.fontshare.prefixe + v[4] });
  }
  return a.filter(x => x.url.startsWith(SERVEURS_POLICES[x.serveur].prefixe) && !x.url.includes('..'));
}

/** La variante lue d'une famille. */
export function lireVariante(f: FamilleCatalogue, v: VarianteBrute): VariantePolice {
  const fichiers: FichierPolice[] = [];
  const premier: FichierPolice['sousEnsemble'] = f.depot === 'fontsource' ? 'latin' : 'complet';
  fichiers.push({ sousEnsemble: premier, empreinte: v[2], adresses: adressesFichier(f, v, premier) });
  if (v[3]) fichiers.push({ sousEnsemble: 'latin-ext', empreinte: v[3], adresses: adressesFichier(f, v, 'latin-ext') });
  return {
    id: idVariante(f, v), version: versionVariante(v), famille: f, poids: v[0], italique: v[1] === 1,
    ...(v[5] ? { libelle: v[5] } : {}), nom: nomVariante(f, v), fichiers
  };
}

/** Les variantes d'une famille, lues. */
export const variantesDe = (f: FamilleCatalogue): VariantePolice[] => f.variantes.map(v => lireVariante(f, v));

/** La variante par defaut d'une famille : la reguliere droite, a defaut la plus proche de 400, droite d'abord. */
export function variantePrincipale(f: FamilleCatalogue): VariantePolice | null {
  const triees = [...f.variantes].sort((a, b) => a[1] - b[1] || Math.abs(a[0] - 400) - Math.abs(b[0] - 400) || a[0] - b[0]);
  const v = triees[0];
  return v ? lireVariante(f, v) : null;
}

/**
 * La variante d'un identifiant, et de la version voulue quand elle est donnee : dans l'index, puis dans les versions qu'il a
 * remplacees. Sans version, la courante.
 */
export function trouverVariante(c: CataloguePolices, id: string, version?: string): VariantePolice | null {
  if (!estIdCatalogue(id)) return null;
  let sansVersion: VariantePolice | null = null;
  for (const f of [...c.familles, ...c.anciennes]) {
    for (const v of f.variantes) {
      if (idVariante(f, v) !== id) continue;
      const lue = lireVariante(f, v);
      if (version === undefined || lue.version === version) return lue;
      sansVersion ??= lue;
    }
  }
  return version === undefined ? sansVersion : null;
}

/** La famille d'une variante par son identifiant (la courante), pour proposer ses autres graisses. */
export function familleDe(c: CataloguePolices, id: string): FamilleCatalogue | null {
  return trouverVariante(c, id)?.famille ?? null;
}

// --- Validation : l'index vient d'un fichier, on ne le croit pas sur parole ---

function validerVariante(v: unknown, depot: IdDepot): string | null {
  if (!Array.isArray(v) || v.length < 4 || v.length > 6) return 'une variante n’est pas un tableau de 4 à 6 valeurs';
  const [poids, italique, latin, ext, chemin, libelle] = v as unknown[];
  if (typeof poids !== 'number' || !Number.isInteger(poids) || poids < 1 || poids > 1000) return 'graisse invalide';
  if (italique !== 0 && italique !== 1) return 'style invalide';
  if (typeof latin !== 'string' || !SHA256_B64.test(latin)) return 'empreinte sha256 invalide';
  if (ext !== null && (typeof ext !== 'string' || !SHA256_B64.test(ext))) return 'empreinte latin-ext invalide';
  const motif = CHEMIN[depot];
  if (motif ? typeof chemin !== 'string' || !motif.test(chemin) || chemin.includes('..') : chemin !== undefined && chemin !== null) return 'chemin de fichier invalide';
  if (libelle !== undefined && (typeof libelle !== 'string' || !LIBELLE.test(libelle))) return 'libellé invalide';
  return null;
}

/** Le premier defaut d'une famille, ou null. */
export function defautFamille(f: unknown): string | null {
  if (typeof f !== 'object' || f === null) return 'une famille n’est pas un objet';
  const o = f as Record<string, unknown>;
  const nom = typeof o.id === 'string' ? o.id : '?';
  if (typeof o.id !== 'string' || !SLUG.test(o.id)) return 'identifiant de famille invalide (' + nom.slice(0, 40) + ')';
  if (typeof o.nom !== 'string' || !o.nom.trim() || o.nom.length > LIMITES_CATALOGUE.nom || /[\p{Cc}<>&"]/u.test(o.nom)) return nom + ' : nom invalide';
  if (o.depot !== 'fontsource' && o.depot !== 'velvetyne' && o.depot !== 'fontshare') return nom + ' : dépôt inconnu';
  const source = typeof o.source === 'string' ? sourcePolices(o.source) : undefined;
  if (!source) return nom + ' : source absente du registre';
  if (source.depot !== o.depot) return nom + ' : la source ' + source.id + ' ne sert pas le dépôt ' + String(o.depot);
  if (!estLicenceAdmise(o.licence)) return nom + ' : licence hors de la liste blanche (' + String(o.licence).slice(0, 30) + ')';
  if (!source.licences.includes(o.licence)) return nom + ' : licence ' + o.licence + ' non déclarée par la source ' + source.id;
  if (typeof o.categorie !== 'string' || !(CATEGORIES as readonly string[]).includes(o.categorie)) return nom + ' : catégorie inconnue';
  if (typeof o.version !== 'string' || !VERSION[o.depot].test(o.version)) return nom + ' : version non épinglée';
  if (!Array.isArray(o.ecritures) || !o.ecritures.every(e => typeof e === 'string' && ECRITURE.test(e))) return nom + ' : écritures invalides';
  if (o.depot === 'velvetyne' ? typeof o.projet !== 'string' || !/^\d{1,12}$/.test(o.projet) : o.projet !== undefined) return nom + ' : projet invalide';
  if (!Array.isArray(o.variantes) || !o.variantes.length || o.variantes.length > LIMITES_CATALOGUE.variantes) return nom + ' : variantes absentes ou trop nombreuses';
  for (const v of o.variantes) { const d = validerVariante(v, o.depot); if (d) return nom + ' : ' + d; }
  return null;
}

/**
 * L'index valide, ou la raison de le refuser. Tout est verifie : la forme, les licences (liste blanche), les versions
 * epinglees, les empreintes, les chemins, et l'unicite des identifiants de variante (deux variantes de meme identifiant
 * rendraient un texte ambigu).
 */
export function validerCatalogue(v: unknown): CataloguePolices | { erreur: string } {
  if (typeof v !== 'object' || v === null) return { erreur: 'l’index des polices n’est pas un objet' };
  const o = v as Record<string, unknown>;
  if (o.format !== 1) return { erreur: 'format d’index inconnu' };
  if (typeof o.instantane !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.instantane)) return { erreur: 'date d’instantané invalide' };
  if (!Array.isArray(o.familles) || !Array.isArray(o.anciennes)) return { erreur: 'familles absentes' };
  if (o.familles.length + o.anciennes.length > LIMITES_CATALOGUE.familles) return { erreur: 'trop de familles' };
  const vus = new Set<string>();
  for (const f of o.familles as unknown[]) {
    const d = defautFamille(f);
    if (d) return { erreur: d };
    const fam = f as FamilleCatalogue;
    for (const variante of fam.variantes) {
      const id = idVariante(fam, variante);
      if (vus.has(id)) return { erreur: fam.id + ' : identifiant de variante en double (' + id + ')' };
      vus.add(id);
    }
  }
  for (const f of o.anciennes as unknown[]) { const d = defautFamille(f); if (d) return { erreur: 'ancienne version : ' + d }; }
  return v as CataloguePolices;
}

// --- Recherche et filtres : ce que le selecteur montre ---

const normaliser = (t: string): string => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export interface FiltrePolices {
  readonly texte?: string;
  readonly categorie?: CategoriePolice | '';
  readonly source?: IdSourcePolices | '';
}

/** Les familles qui repondent au filtre, dans l'ordre de l'index (alphabetique) ; un mot commence le nom avant de le contenir. */
export function filtrerFamilles(familles: readonly FamilleCatalogue[], filtre: FiltrePolices): FamilleCatalogue[] {
  const mots = normaliser(filtre.texte ?? '').split(' ').filter(Boolean);
  const r = familles.filter(f => (!filtre.categorie || f.categorie === filtre.categorie) && (!filtre.source || f.source === filtre.source)
    && mots.every(m => normaliser(f.nom).includes(m)));
  if (!mots.length) return r;
  const debut = (f: FamilleCatalogue) => (normaliser(f.nom).startsWith(mots.join(' ')) ? 0 : 1);
  return r.map((f, i) => [f, i] as const).sort((a, b) => debut(a[0]) - debut(b[0]) || a[1] - b[1]).map(([f]) => f);
}

// --- Une ligne par nom de famille (ADR-0026) ---

/** La cle de regroupement d'un nom de famille : casse, accents et ponctuation ignores (« Bebas Neue » = « bebas-neue »). */
export const cleDeNom = (nom: string): string => normaliser(nom);

/**
 * Pour chaque nom de famille, le meilleur rang de source (PREFERENCE_SOURCES) parmi les elements donnes. Un element dont
 * `nom` rend null ne concourt pas (une fonte deposee : son nom vient d'un fichier, il ne cache rien).
 */
export function rangsParNom<T>(elements: readonly T[], nom: (e: T) => string | null, source: (e: T) => string): ReadonlyMap<string, number> {
  const rangs = new Map<string, number>();
  for (const e of elements) {
    const n = nom(e);
    if (n === null) continue;
    const k = cleDeNom(n), r = rangSource(source(e));
    const avant = rangs.get(k);
    if (avant === undefined || r < avant) rangs.set(k, r);
  }
  return rangs;
}

/**
 * Une ligne par nom de famille : pour chaque nom, seuls restent les elements de la source la mieux placee (la fonte livree,
 * puis Google Fonts, puis… Fontshare en dernier), dans l'ordre d'origine. Deux elements de la meme source gardent leur ligne
 * (la variante grasse d'une fonte livree est retiree avant, par la zone : elle se choisit dans « Style »). Un element sans
 * nom (`null`) reste toujours.
 */
export function uneParNom<T>(elements: readonly T[], nom: (e: T) => string | null, source: (e: T) => string): T[] {
  const rangs = rangsParNom(elements, nom, source);
  return elements.filter(e => { const n = nom(e); return n === null || rangSource(source(e)) === rangs.get(cleDeNom(n)); });
}

/**
 * Les familles de l'index qu'on montre : sans filtre de source, une par nom, et aucune dont une fonte livree porte le nom
 * (`livrees` : les noms de famille des fontes livrees) ; une source choisie explicitement montre toutes ses familles, meme
 * celles qu'une source mieux placee cache d'ordinaire.
 */
export function famillesMontrees(familles: readonly FamilleCatalogue[], options: { readonly livrees?: readonly string[]; readonly source?: IdSourcePolices | '' } = {}): FamilleCatalogue[] {
  if (options.source) return familles.filter(f => f.source === options.source);
  type Element = { readonly nom: string; readonly source: string; readonly famille?: FamilleCatalogue };
  const elements: Element[] = [...(options.livrees ?? []).map(nom => ({ nom, source: 'livree' })), ...familles.map(f => ({ nom: f.nom, source: f.source, famille: f }))];
  return uneParNom(elements, e => e.nom, e => e.source).flatMap(e => (e.famille ? [e.famille] : []));
}

/** Les serveurs qu'une liste de variantes ferait contacter, sans doublon : ceux qu'un hote doit autoriser en `connect-src`. */
export function serveursDe(variantes: readonly VariantePolice[]): IdServeur[] {
  return [...new Set(variantes.flatMap(v => v.fichiers.flatMap(f => f.adresses.map(a => a.serveur))))];
}
