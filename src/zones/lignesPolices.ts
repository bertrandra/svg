// Les lignes de la liste deroulante des polices (ADR-0034) : quelles polices, dans quels groupes, dans quel ordre, et ce que
// chaque ligne dit de son etat (deja la, a telecharger, en cours, absente). Pur : ni DOM, ni React, ni reseau ; la zone donne les
// fontes lues, l'index, les polices du document, les favoris et les recentes, et ce que le cache garde deja.
//
// L'ordre est celui d'un selecteur de traitement de texte : la police actuelle, puis « Dans ce document », « Favoris »,
// « Récentes », « Livrées avec l'éditeur », « Trait unique (stylo) », « Vos polices », et tout le catalogue, une ligne par nom
// de famille (la regle de l'ADR-0026, `famillesMontrees`). Une recherche ne garde que les polices qui repondent, une fois
// chacune : les raccourcis (document, favoris, recentes) se retirent, ils redoubleraient les lignes de leur groupe.

import { estIdCatalogue, familleDe, famillesMontrees, filtrerParNom, trouverVariante, uneParNom, variantePrincipale, type CataloguePolices, type FamilleCatalogue, type VariantePolice } from '../model/cataloguePolices.js';
import { LICENCES_POLICES, type IdSourcePolices, type LicencePolice } from '../model/sourcesPolices.js';
import { FAMILLES_LIVREES, baseDeGrasse, estPoliceLivree, type NaturePolice } from '../model/polices.js';
import type { Police } from '../io/polices.js';

export type SourceLigne = IdSourcePolices | 'livree' | 'deposee';

/** Le nom court d'une source, pour le badge d'une ligne. */
export const COURTS_SOURCES: Readonly<Record<IdSourcePolices, string>> = {
  google: 'Google Fonts', fontsource: 'Fontsource', league: 'League', sil: 'SIL', collletttivo: 'Collletttivo', velvetyne: 'Velvetyne', fontshare: 'Fontshare'
};

/** La cle d'une famille de l'index, celle que retiennent les favoris et qu'emploient les apercus prepares. */
export const cleFamille = (f: Pick<FamilleCatalogue, 'depot' | 'id'>): string => f.depot + ':' + f.id;

export type IdGroupe = 'courante' | 'document' | 'favoris' | 'recentes' | 'livrees' | 'trait' | 'deposees' | 'catalogue';

export const TITRES_GROUPES: Readonly<Record<IdGroupe, string>> = {
  courante: 'Police actuelle', document: 'Dans ce document', favoris: 'Favoris', recentes: 'Récentes', livrees: 'Livrées avec l’éditeur',
  trait: 'Trait unique (stylo)', deposees: 'Vos polices', catalogue: 'Toutes les polices'
};

/** Une ligne : une fonte deja lue, une famille de l'index (sa variante principale), ou une variante precise (document, recente). */
export interface LignePolice {
  /** Unique dans son groupe. */
  readonly cle: string;
  readonly nom: string;
  readonly source: SourceLigne;
  readonly nature: NaturePolice;
  readonly licence?: LicencePolice;
  readonly police?: Police;
  readonly famille?: FamilleCatalogue;
  readonly variante?: VariantePolice;
  /**
   * Le nom de famille qui regroupe les sources (une ligne par nom) ; null pour une fonte deposee, qui ne cache rien. Une police
   * d'une source que le catalogue cache (Bebas Neue de Fontshare, quand la livree existe) garde son badge de source.
   */
  readonly nomFamille: string | null;
}

export interface GroupePolices {
  readonly id: IdGroupe;
  readonly titre: string;
  readonly lignes: readonly LignePolice[];
}

/** Une police du document : son identifiant, la version et le nom que le texte garde. */
export interface PoliceDuDocument { readonly id: string; readonly version?: string | undefined; readonly famille?: string | undefined }

export interface EntreesListe {
  readonly polices: readonly Police[];
  readonly catalogue: CataloguePolices | null;
  /** La police choisie (identifiant), vide tant qu'aucune. */
  readonly valeur: string;
  /** Ce que dit la ligne d'une police que la page n'a pas et ne sait pas trouver (« Police absente : Ma fonte »). */
  readonly absente?: string | undefined;
  readonly duDocument: readonly PoliceDuDocument[];
  readonly favoris: readonly string[];
  readonly recentes: readonly string[];
  readonly texte: string;
}

const NOMS_LIVREES = Object.values(FAMILLES_LIVREES);

const ligneDePolice = (p: Police, source: SourceLigne, nomFamille: string | null, famille?: FamilleCatalogue): LignePolice => ({
  cle: p.id, nom: p.nom, source, nature: p.nature, police: p, nomFamille,
  ...(famille ? { famille, licence: LICENCES_POLICES[famille.licence] } : {})
});

const ligneDeFamille = (f: FamilleCatalogue): LignePolice => ({
  cle: cleFamille(f), nom: f.nom, source: f.source, nature: 'contour', licence: LICENCES_POLICES[f.licence], famille: f, nomFamille: f.nom
});

const ligneDeVariante = (v: VariantePolice): LignePolice => ({
  cle: v.id, nom: v.nom, source: v.famille.source, nature: 'contour', licence: LICENCES_POLICES[v.famille.licence], variante: v, famille: v.famille, nomFamille: v.famille.nom
});

/** La ligne d'une police par son identifiant : lue (livree, deposee, telechargee), sinon sa variante dans l'index, sinon rien. */
function ligneDId(id: string, polices: readonly Police[], c: CataloguePolices | null, version?: string): LignePolice | null {
  const p = polices.find(x => x.id === id);
  if (p) {
    if (estPoliceLivree(p.id)) return ligneDePolice(p, 'livree', FAMILLES_LIVREES[p.id]);
    if (p.id.startsWith('u-')) return ligneDePolice(p, 'deposee', null);
    const f = c && estIdCatalogue(p.id) ? familleDe(c, p.id) : null;
    return f ? ligneDePolice(p, f.source, f.nom, f) : ligneDePolice(p, 'deposee', null);
  }
  if (!c) return null;
  const v = (version !== undefined ? trouverVariante(c, id, version) : null) ?? trouverVariante(c, id);
  return v ? ligneDeVariante(v) : null;
}

/** La variante qu'une ligne poserait : la sienne, ou la principale de sa famille ; null pour une fonte deja lue sans famille. */
export function varianteDeLigne(l: LignePolice): VariantePolice | null {
  if (l.police) return null;
  return l.variante ?? (l.famille ? variantePrincipale(l.famille) : null);
}

/** L'identifiant que la ligne poserait, ou null pour une police absente. */
export function idDeLigne(l: LignePolice): string | null {
  return l.police?.id ?? varianteDeLigne(l)?.id ?? null;
}

export type EtatLigne = 'locale' | 'a-telecharger' | 'en-cours' | 'absente';

export interface Disponibilite {
  /** Les identifiants des fontes lues dans la session. */
  readonly chargees: ReadonlySet<string>;
  /** Vrai quand le cache du navigateur garde deja les fichiers de la variante : la choisir ne contacte personne. */
  readonly enCache: (v: VariantePolice) => boolean;
  /** La variante qui se telecharge en ce moment. */
  readonly enCours: string | null;
}

/**
 * L'etat d'une ligne : « locale » pour une fonte livree, deposee, deja telechargee ou gardee dans le cache ; « en-cours » le
 * temps de son telechargement ; « a-telecharger » pour une police de l'index que la choisir fera venir ; « absente » pour une
 * police que la page ne sait pas trouver (une fonte deposee sur une autre machine, un index absent).
 */
export function etatLigne(l: LignePolice, d: Disponibilite): EtatLigne {
  if (l.police) return 'locale';
  const v = varianteDeLigne(l);
  if (!v) return 'absente';
  if (d.chargees.has(v.id)) return 'locale';
  if (d.enCours === v.id) return 'en-cours';
  return d.enCache(v) ? 'locale' : 'a-telecharger';
}

/** La ligne d'une police que rien ne trouve : nommee, jamais choisie. */
const ligneAbsente = (id: string, nom: string): LignePolice => ({ cle: 'absente-' + id, nom, source: 'deposee', nature: 'contour', nomFamille: null });

/**
 * Les groupes de la liste, dans leur ordre, sans groupe vide. Sans index (un hote sans polices en ligne, ou l'index pas encore
 * charge), seules les polices locales et celles du document qu'on peut nommer.
 */
export function groupesListe(e: EntreesListe): GroupePolices[] {
  const { polices, catalogue: c } = e;
  const livrees: LignePolice[] = [], trait: LignePolice[] = [], deposees: LignePolice[] = [];
  for (const p of polices) {
    if (estPoliceLivree(p.id)) {
      // La variante grasse d'une famille livree n'a pas sa ligne : elle se choisit dans « Style ».
      if (p.nature === 'trait') trait.push(ligneDePolice(p, 'livree', FAMILLES_LIVREES[p.id]));
      else if (baseDeGrasse(p.id) === null) livrees.push(ligneDePolice(p, 'livree', FAMILLES_LIVREES[p.id]));
    } else if (p.id.startsWith('u-')) deposees.push(ligneDePolice(p, 'deposee', null));
  }
  const toutes = c ? famillesMontrees(c.familles, { livrees: NOMS_LIVREES }) : [];
  const catalogue = toutes.map(ligneDeFamille);

  const texte = e.texte.trim();
  if (texte) {
    const parNom = (l: readonly LignePolice[]) => filtrerParNom(l, x => x.nom, texte);
    return avecTitres([['livrees', parNom(livrees)], ['trait', parNom(trait)], ['deposees', parNom(deposees)], ['catalogue', parNom(catalogue)]]);
  }

  const uneParFamille = (l: readonly LignePolice[]) => uneParNom(l, x => x.nomFamille, x => x.source);

  const courante: LignePolice[] = [];
  if (e.valeur) {
    const id = baseDeGrasse(e.valeur) ?? e.valeur;
    const l = ligneDId(id, polices, c);
    courante.push(l ?? ligneAbsente(id, e.absente ?? 'Police absente'));
  }

  const document: LignePolice[] = [];
  const vus = new Set<string>();
  for (const d of e.duDocument) {
    if (vus.has(d.id)) continue;
    vus.add(d.id);
    const l = ligneDId(d.id, polices, c, d.version);
    document.push(l ?? ligneAbsente(d.id, d.famille ?? d.id));
  }

  const parCle = new Map<string, LignePolice>([...livrees, ...trait].map(l => [l.cle, l]));
  for (const f of c?.familles ?? []) parCle.set(cleFamille(f), ligneDeFamille(f));
  const favoris = uneParFamille(e.favoris.flatMap(k => { const l = parCle.get(k); return l ? [l] : []; }));
  const recentes = uneParFamille(e.recentes.flatMap(id => { const l = ligneDId(id, polices, c); return l ? [l] : []; }));

  return avecTitres([
    ['courante', courante], ['document', document], ['favoris', favoris], ['recentes', recentes],
    ['livrees', livrees], ['trait', trait], ['deposees', deposees], ['catalogue', catalogue]
  ]);
}

const avecTitres = (g: ReadonlyArray<readonly [IdGroupe, readonly LignePolice[]]>): GroupePolices[] =>
  g.filter(([, l]) => l.length > 0).map(([id, lignes]) => ({ id, titre: TITRES_GROUPES[id], lignes }));

/** Le nombre de polices differentes d'une liste : le catalogue et les groupes locaux, sans les raccourcis qui les redoublent. */
export function nombrePolices(groupes: readonly GroupePolices[]): number {
  return groupes.reduce((n, g) => n + (g.id === 'courante' || g.id === 'document' || g.id === 'favoris' || g.id === 'recentes' ? 0 : g.lignes.length), 0);
}

/**
 * Vrai quand la ligne represente la police choisie : la meme fonte, la famille livree de sa variante grasse, ou la famille de
 * l'index dont une variante est choisie (« Roboto » quand « Roboto Grasse » l'est).
 */
export function estChoisie(l: LignePolice, valeur: string, familleChoisie: FamilleCatalogue | null): boolean {
  if (!valeur) return false;
  const id = idDeLigne(l);
  if (id !== null && (id === valeur || id === baseDeGrasse(valeur))) return true;
  return !l.variante && !l.police && !!l.famille && l.famille === familleChoisie;
}

// --- Ce que dit une ligne, et ou poser la liste ouverte : pur, la zone mesure ---

export interface Rectangle { readonly top: number; readonly bottom: number; readonly left: number; readonly right: number }

export interface Placement {
  readonly left: number;
  readonly width: number;
  /** Le haut de la liste, quand elle s'ouvre sous le champ ; sinon `bottom`, la distance au bas de l'ecran. */
  readonly top?: number;
  readonly bottom?: number;
  readonly maxHeight: number;
  /** Sur un petit ecran : une feuille de toute la largeur, du champ jusqu'au bord de l'ecran. */
  readonly feuille: boolean;
}

/** Les groupes dont le titre dit deja la source : leurs lignes n'ont pas de badge de source. */
const SOURCE_DITE_PAR_LE_GROUPE: ReadonlySet<IdGroupe> = new Set(['livrees', 'trait', 'deposees']);

/** Le badge de source d'une ligne : rien quand le titre du groupe le dit deja, ni pour une police absente. */
export function badgeSource(l: LignePolice, groupe: IdGroupe, etat: EtatLigne): string | null {
  if (SOURCE_DITE_PAR_LE_GROUPE.has(groupe) || etat === 'absente') return null;
  return l.source === 'livree' ? 'Livrée' : l.source === 'deposee' ? 'Déposée' : COURTS_SOURCES[l.source];
}

const DIT_ETAT: Readonly<Record<EtatLigne, string | null>> = { locale: null, 'a-telecharger': 'à télécharger', 'en-cours': 'téléchargement en cours', absente: 'absente' };

/**
 * Le nom accessible d'une ligne : le nom, ses badges en mots, puis son etat. La marque « à télécharger » est une icone pour l'oeil
 * et ces mots pour un lecteur d'ecran : elle ne tient ni a la seule couleur, ni a la seule image.
 */
export function nomAccessibleLigne(l: LignePolice, groupe: IdGroupe, etat: EtatLigne): string {
  const dit = DIT_ETAT[etat];
  const morceaux = [l.nom, badgeSource(l, groupe, etat), l.nature === 'trait' ? 'trait unique' : null, l.licence?.badge ? l.licence.nom : null,
    dit && !(etat === 'absente' && /absente/i.test(l.nom)) ? dit : null];
  return morceaux.filter((m): m is string => !!m).join(', ');
}

/** La largeur que la liste prend au moins : de quoi lire un nom dessine et ses badges, meme sous un champ compact. */
export const LARGEUR_LISTE = 340;
/** La hauteur au plus d'une liste flottante (sur un petit ecran, la feuille va jusqu'au bord). */
export const HAUTEUR_LISTE = 440;
const MARGE = 8, ECART = 4;

/**
 * Ou poser la liste : sous le champ, ou au-dessus quand la place y est plus grande ; aussi large que le champ et au moins
 * `LARGEUR_LISTE`, jamais hors de l'ecran. Sur un petit ecran (`feuille`), toute la largeur et toute la hauteur du cote choisi.
 */
export function placerListe(champ: Rectangle, ecran: { readonly largeur: number; readonly hauteur: number }, feuille: boolean): Placement {
  const dessous = ecran.hauteur - champ.bottom - ECART, dessus = champ.top - ECART;
  const enBas = dessous >= Math.min(HAUTEUR_LISTE, 240) || dessous >= dessus;
  const place = Math.max(0, (enBas ? dessous : dessus) - (feuille ? 0 : MARGE));
  const maxHeight = Math.floor(feuille ? place : Math.min(HAUTEUR_LISTE, place));
  const cote = enBas ? { top: Math.round(champ.bottom + ECART) } : { bottom: Math.round(ecran.hauteur - champ.top + ECART) };
  if (feuille) return { left: 0, width: Math.floor(ecran.largeur), maxHeight, feuille, ...cote };
  const width = Math.floor(Math.min(Math.max(champ.right - champ.left, LARGEUR_LISTE), ecran.largeur - 2 * MARGE));
  const left = Math.round(Math.max(MARGE, Math.min(champ.left, ecran.largeur - MARGE - width)));
  return { left, width, maxHeight, feuille, ...cote };
}

/** Le pas d'une page (Page haut, Page bas) : les lignes qu'on voit, moins une pour garder un repere. */
export const pasDePage = (visible: number, pas: number): number => Math.max(1, Math.floor(visible / Math.max(1, pas)) - 1);
