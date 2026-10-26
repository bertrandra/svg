// Le projet (ADR-0030) : le JSON natif d'un travail, ce que le site PHP enregistre dans data/projets. Ce n'est pas le SVG (qui
// reste un export) mais tout ce qu'il faut pour rouvrir le travail a l'identique : le dessin du modele (formes, styles, textes
// vivants complets, operations, origines, verrouillage, visibilite, ordre, et le modele v2 : groupes, peintures, images, decoupes,
// masques, effets, motifs), le plan de travail, le contexte de production, le nuancier, le nom, les dates (posees par le serveur,
// jamais par le coeur pur) et les ressources que rien d'autre ne garde : une fonte deposee par la personne, l'image source d'une
// conversion.
//
// Pur : des donnees en entree, des donnees en sortie. La lecture d'un projet vient d'un fichier, d'un serveur ou d'un autre
// onglet : on ne le croit pas sur parole. `lireProjet` migre, valide champ par champ, borne chaque taille et refuse en le nommant,
// sans jamais lever (ADR-0014). Un projet valide se reconstruit dans un ordre de champs fixe : relu puis reecrit, il redonne le
// meme texte JSON.

import { t } from '../util/i18n.js';
import type { ChoixProduction } from './contextes.js';
import { normaliserOrigines } from './credits.js';
import { PROVENANCES_NUANCIER, TEINTES_NUANCIER_MAX, type NuancierDessin, type TeinteDessin } from './nuancier.js';
import { lireChampsFormeV2, type ChampsFormeV2, type OutilsProjet } from './projetV2/champs.js';
import { lireGroupesProjet, type GroupeProjet } from './projetV2/groupes.js';

/** Le nom du format : ce qui distingue un projet de l'editeur de tout autre JSON. */
export const FORMAT_PROJET = 'editeur-svg/projet';
/**
 * La version du format, la seule que ce programme lit et ecrit. Un seul format porte tout le modele : les champs du modele v2 (ADR-0012 :
 * groupes, peintures, images, decoupes, masques, effets, motifs) y sont des champs facultatifs comme les autres, absents d'un dessin plat,
 * dont le projet reste ainsi le texte d'avant eux. Aucun projet d'un format anterieur n'existait quand le format est devenu unique
 * (ADR-0030, revision du 26 octobre 2026) : un projet plus recent est refuse en le nommant, un plus ancien passerait par `migrer`.
 */
export const VERSION_PROJET = 1;
export type VersionProjet = typeof VERSION_PROJET;

/** Ce qu'un projet porte au plus : au-dela, ce n'est pas un projet de ce programme (ou il ne tiendrait pas dans un onglet). */
export const BORNES_PROJET = {
  /** Le texte JSON entier, controle avant meme de l'analyser (io/serveur.ts, et le serveur PHP). */
  octets: 64 * 1024 * 1024,
  formes: 200_000,
  /** Les caracteres de trace de toutes les formes (la lecture d'un SVG en admet 8 millions ; le projet garde la pleine precision). */
  trace: 24_000_000,
  identifiant: 64,
  nom: 120,
  nuancier: 256,
  origines: 32,
  pointilles: 64,
  texte: 10_000,
  famille: 60,
  polices: 32,
  /** Une fonte deposee : 8 Mo, la borne d'une police telechargee (io/policesEnLigne.ts), en base64. */
  base64Police: Math.ceil((8 * 1024 * 1024) / 3) * 4,
  images: 4,
  /** Une image source : 16 Mo, en base64. */
  base64Image: Math.ceil((16 * 1024 * 1024) / 3) * 4,
  /** Les reperes par axe (ADR-0038) : la borne de la lecture d'un SVG (engine/edition/reperes.ts). */
  reperes: 200,
  coordonnee: 1e9
} as const;

export interface TeinteProjet { readonly nom: string; readonly hex: string }

export interface PoliceTexteProjet { readonly id: string; readonly version?: string; readonly famille?: string }

export interface TexteProjet {
  readonly texte: string;
  readonly police: PoliceTexteProjet;
  readonly taille: number;
  readonly interlettrage: number;
  readonly interligne: number;
  readonly alignement: 'gauche' | 'centre' | 'droite';
  readonly ligatures: boolean;
  readonly trace?: 'median';
  readonly matrice: readonly [number, number, number, number, number, number];
  /** Le texte sur le trace ou dans une forme (ADR-0031), liee par son identifiant ; absent pour un texte libre. */
  readonly disposition?: DispositionProjet;
}

/**
 * La disposition d'un texte (ADR-0031), champ pour champ celle du modele : la forme de base reste une forme ordinaire du dessin
 * (masquee ou non), designee par son identifiant ; les identifiants du projet sont ceux du modele, sans renumerotation.
 */
export type DispositionProjet =
  | { readonly mode: 'sur'; readonly forme: string; readonly depart: number; readonly cote: 'dessus' | 'dessous'; readonly repartir: boolean }
  | { readonly mode: 'dans'; readonly forme: string; readonly marge: number; readonly ajuster: boolean; readonly justifier: boolean }
  /** Le texte deforme dans la forme (ADR-0032) : seulement sa marge. */
  | { readonly mode: 'enveloppe'; readonly forme: string; readonly marge: number };

/**
 * Une forme du dessin, champ pour champ celle du modele (engine/edition/types.ts), sauf `d` : le chemin en texte, chaque nombre a
 * sa pleine precision (le plus court texte qui redonne le meme nombre), pour qu'un projet rouvert reecrive les memes octets.
 */
/** Une forme de projet : ses champs du modele plat, et ceux du modele v2 (model/projetV2/champs.ts), facultatifs comme les autres. */
export interface FormeProjet extends ChampsFormeV2 {
  readonly id: string;
  readonly d: string;
  readonly remplissage: string | null;
  readonly contour: string | null;
  readonly epaisseur: number;
  readonly opacite: number;
  readonly opaciteRemplissage?: number;
  readonly opaciteContour?: number;
  readonly pointilles?: readonly number[];
  readonly decalagePointilles?: number;
  readonly bout?: 'round' | 'square';
  readonly jonction?: 'miter' | 'bevel';
  readonly limiteMitre?: number;
  readonly origine?: readonly string[];
  readonly texte?: TexteProjet;
  readonly operation?: 'decoupe' | 'ecriture';
  readonly regle: 'nonzero' | 'evenodd';
  readonly visible: boolean;
  readonly verrouille: boolean;
}

/** Les reperes du document (ADR-0038) : les ordonnees des horizontaux, les abscisses des verticaux, en unites du plan. */
export interface ReperesProjet { readonly h: readonly number[]; readonly v: readonly number[] }

/**
 * Le dessin du projet : le plan, les formes, et le nuancier du dessin (ADR-0037 : les couleurs tirees du fichier ou d'une
 * selection, et leur provenance), absent d'un projet d'avant lui ; l'editeur le tire alors des couleurs du dessin a l'ouverture.
 * Les reperes (ADR-0038) sont absents d'un dessin sans repere : un projet d'avant reste le meme texte.
 */
export interface DessinProjet {
  readonly vb: readonly [number, number, number, number];
  readonly formes: readonly FormeProjet[];
  readonly nuancier?: NuancierDessin;
  readonly reperes?: ReperesProjet;
  /** Les groupes du modele v2 (ADR-0012, etape 1), par identifiant ; absents d'un dessin plat. */
  readonly groupes?: Readonly<Record<string, GroupeProjet>>;
}

export type { GroupeProjet };

/** Une fonte deposee par la personne, incluse : son identifiant est l'empreinte de ses octets (`u-…`, ADR-0022). */
export interface PoliceProjet { readonly id: string; readonly famille: string; readonly donnees: string }

export type TypeImage = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
/** L'image source d'une conversion, quand le projet en garde une. */
export interface ImageProjet { readonly role: 'source'; readonly nom: string; readonly type: TypeImage; readonly donnees: string }

export interface RessourcesProjet { readonly polices: readonly PoliceProjet[]; readonly images: readonly ImageProjet[] }

export interface Projet {
  readonly format: typeof FORMAT_PROJET;
  readonly version: VersionProjet;
  readonly nom: string;
  /** Posees par le serveur (ISO 8601, UTC), absentes d'un projet jamais enregistre. */
  readonly creeLe?: string;
  readonly modifieLe?: string;
  readonly dessin: DessinProjet;
  readonly production: ChoixProduction;
  readonly nuancier: readonly TeinteProjet[];
  readonly ressources: RessourcesProjet;
}

export type ResultatProjet = { readonly projet: Projet; readonly migre: boolean } | { readonly erreur: string };

// --- Les migrations : une fonction par version, de n vers n + 1. La chaine n'est jamais tronquee (a partir du format unique 1). ---

type Migration = (ancien: Record<string, unknown>) => Record<string, unknown>;

/**
 * Les migrations connues, par version de depart ; un test verifie que chaque version anterieure a la sienne. Vide tant qu'il n'y a qu'un
 * format : le jour ou le format 2 existera, la migration du format 1 y entrera, et n'en sortira plus.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

const estObjet = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Le projet ramene a la version courante, ou la raison de le refuser (un autre JSON, une version plus recente, une chaine rompue). */
export function migrer(x: unknown): { donnees: Record<string, unknown>; migre: boolean } | { erreur: string } {
  if (!estObjet(x) || x['format'] !== FORMAT_PROJET) return { erreur: t('Ce fichier n’est pas un projet de l’Éditeur SVG.') };
  const v = x['version'];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return { erreur: t('Ce projet n’a pas de version lisible.') };
  if (v > VERSION_PROJET) {
    return { erreur: t('Ce projet a été enregistré par une version plus récente de l’éditeur (format {version}) ; cette version lit les projets jusqu’au format {courante}. Mettez le site à jour pour l’ouvrir.', { version: v, courante: VERSION_PROJET }) };
  }
  let donnees = x, version = v;
  while (version < VERSION_PROJET) {
    const etape = MIGRATIONS[version];
    if (!etape) return { erreur: t('Ce projet est au format {version}, que cette version ne sait plus convertir.', { version }) };
    donnees = etape(donnees);
    version++;
  }
  // « Migre » veut dire « complete » : une migration qui ne change rien (l'identite) ne fait pas dire a la page que le projet a change.
  return { donnees, migre: donnees !== x };
}

// --- La validation : chaque champ, sa forme et ses bornes ; un projet valide est reconstruit dans un ordre fixe. ---

/** Une erreur de validation : elle remonte jusqu'a `lireProjet`, qui la rend en phrase. Jamais visible hors de ce module. */
class Refus { constructor(readonly raison: string) {} }
const refuser = (raison: string): never => { throw new Refus(raison); };

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const HEX = /^#[0-9a-f]{6}$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;
const IDENTIFIANT = /^[a-z0-9][a-z0-9-]{0,39}$/;
const ID_POLICE = /^(?:[a-z0-9][a-z0-9-]{0,31}|u-[0-9a-f]{14})$/;
const ID_DEPOSEE = /^u-[0-9a-f]{14}$/;
const VERSION_FONTE = /^[0-9a-f]{14}$/;
/** La meme regle que l'ecriture d'une peinture (engine/edition/peinture.ts, `peintureSure`) : un `#hex`, un mot-cle, une fonction de couleur a un niveau. */
const PEINTURE_HEX = /^#[0-9a-f]{3,8}$/, PEINTURE_MOT = /^[a-z][a-z0-9-]{0,40}(?:\([a-z0-9#%.,\s/+-]*\))?$/;
const TYPES_IMAGE: readonly TypeImage[] = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

function texte(v: unknown, quoi: string, max: number): string {
  if (typeof v !== 'string') return refuser(t('{quoi} n’est pas un texte', { quoi }));
  if (v.length > max) return refuser(t('{quoi} dépasse {max} caractères', { quoi, max }));
  return v;
}

function nombre(v: unknown, quoi: string, min: number = -BORNES_PROJET.coordonnee, max: number = BORNES_PROJET.coordonnee): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return refuser(t('{quoi} n’est pas un nombre', { quoi }));
  if (v < min || v > max) return refuser(t('{quoi} est hors de ses bornes', { quoi }));
  return v;
}

function booleen(v: unknown, quoi: string): boolean {
  if (typeof v !== 'boolean') return refuser(t('{quoi} n’est ni vrai ni faux', { quoi }));
  return v;
}

function tableau(v: unknown, quoi: string, max: number): readonly unknown[] {
  if (!Array.isArray(v)) return refuser(t('{quoi} n’est pas une liste', { quoi }));
  if (v.length > max) return refuser(t('{quoi} compte plus de {max} éléments', { quoi, max }));
  return v;
}

function objet(v: unknown, quoi: string): Record<string, unknown> {
  if (!estObjet(v)) return refuser(t('{quoi} n’est pas un objet', { quoi }));
  return v;
}

function peinture(v: unknown, quoi: string): string | null {
  if (v === null) return null;
  const p = texte(v, quoi, 200);
  return PEINTURE_HEX.test(p) || PEINTURE_MOT.test(p) ? p : refuser(t('{quoi} n’est pas une couleur admise', { quoi }));
}

/** Un champ facultatif : absent (ou `undefined`) reste absent, present il est lu par `lire`. Rend un objet a etaler. */
function facultatif<K extends string, T>(o: Record<string, unknown>, cle: K, lire: (v: unknown) => T): { [P in K]?: T } {
  const v = o[cle];
  return (v === undefined ? {} : { [cle]: lire(v) }) as { [P in K]?: T };
}

function choix<T extends string>(v: unknown, quoi: string, permis: readonly T[]): T {
  return typeof v === 'string' && (permis as readonly string[]).includes(v) ? v as T : refuser(t('{quoi} n’est pas une valeur admise', { quoi }));
}

function base64(v: unknown, quoi: string, max: number): string {
  const b = texte(v, quoi, max);
  return b.length % 4 === 0 && BASE64.test(b) ? b : refuser(t('{quoi} n’est pas du base64', { quoi }));
}

// Le chemin : « M10 20L30 40Z », une lettre puis ses nombres separes par une espace. Le nombre de valeurs suit la lettre.
const VALEURS: Readonly<Record<string, number>> = { M: 2, L: 2, C: 6, Q: 4, Z: 0 };
const NOMBRE_CHEMIN = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/;

/** Vrai quand le texte est un chemin de projet bien forme : seulement des commandes absolues M, L, C, Q, Z, des nombres finis et bornes. */
export function cheminProjetValide(d: string): boolean {
  if (d === '') return true;
  if (!(d.charAt(0) in VALEURS)) return false;
  for (const morceau of d.split(/(?=[MLCQZ])/)) {
    const lettre = morceau.charAt(0), reste = morceau.slice(1), attendu = VALEURS[lettre];
    if (attendu === undefined) return false;
    const valeurs = reste === '' ? [] : reste.split(' ');
    if (valeurs.length !== attendu) return false;
    for (const v of valeurs) {
      if (!NOMBRE_CHEMIN.test(v)) return false;
      const n = Number(v);
      if (!Number.isFinite(n) || Math.abs(n) > BORNES_PROJET.coordonnee) return false;
    }
  }
  return true;
}

function lireTexte(v: unknown): TexteProjet {
  const o = objet(v, t('un texte vivant'));
  const p = objet(o['police'], t('la police d’un texte'));
  const id = texte(p['id'], t('la police d’un texte'), 40);
  if (!ID_POLICE.test(id) && !/^c-[0-9a-f]{14}$/.test(id)) refuser(t('l’identifiant de police « {id} » n’est pas admis', { id: id.slice(0, 20) }));
  const police: PoliceTexteProjet = {
    id,
    ...facultatif(p, 'version', x => { const s = texte(x, t('la version d’une police'), 14); return VERSION_FONTE.test(s) ? s : refuser(t('la version d’une police est mal formée')); }),
    ...facultatif(p, 'famille', x => texte(x, t('la famille d’une police'), BORNES_PROJET.famille))
  };
  const chaine = texte(o['texte'], t('un texte vivant'), BORNES_PROJET.texte);
  if (/^\s*$/.test(chaine)) refuser(t('un texte vivant est vide'));
  const m = tableau(o['matrice'], t('la matrice d’un texte'), 6);
  if (m.length !== 6) refuser(t('la matrice d’un texte n’a pas six valeurs'));
  const matrice = m.map(x => nombre(x, t('la matrice d’un texte'))) as unknown as TexteProjet['matrice'];
  if (!(Math.abs(matrice[0] * matrice[3] - matrice[1] * matrice[2]) > 1e-12)) refuser(t('la matrice d’un texte est dégénérée'));
  const taille = nombre(o['taille'], t('la taille d’un texte'), 0, 1e6);
  if (!(taille > 0)) refuser(t('la taille d’un texte est nulle'));
  const interligne = nombre(o['interligne'], t('l’interligne d’un texte'), 0, 100);
  if (!(interligne > 0)) refuser(t('l’interligne d’un texte est nul'));
  return {
    texte: chaine, police, taille,
    interlettrage: nombre(o['interlettrage'], t('l’interlettrage d’un texte'), -100, 100),
    interligne,
    alignement: choix(o['alignement'], t('l’alignement d’un texte'), ['gauche', 'centre', 'droite'] as const),
    ligatures: booleen(o['ligatures'], t('les ligatures d’un texte')),
    ...facultatif(o, 'trace', x => choix(x, t('le tracé d’un texte'), ['median'] as const)),
    matrice,
    ...facultatif(o, 'disposition', lireDisposition)
  };
}

function lireDisposition(v: unknown): DispositionProjet {
  const o = objet(v, t('la disposition d’un texte'));
  const forme = texte(o['forme'], t('la forme d’un texte posé'), BORNES_PROJET.identifiant);
  if (!ID.test(forme)) refuser(t('la forme d’un texte posé est mal désignée'));
  if (o['mode'] === 'sur') {
    return {
      mode: 'sur', forme, depart: nombre(o['depart'], t('le départ d’un texte sur une forme'), 0, 1),
      cote: choix(o['cote'], t('le côté d’un texte sur une forme'), ['dessus', 'dessous'] as const), repartir: booleen(o['repartir'], t('la répartition d’un texte sur une forme'))
    };
  }
  if (o['mode'] === 'dans') {
    return {
      mode: 'dans', forme, marge: nombre(o['marge'], t('la marge d’un texte dans une forme'), 0, 100),
      ajuster: booleen(o['ajuster'], t('l’ajustement d’un texte dans une forme')), justifier: booleen(o['justifier'], t('la justification d’un texte dans une forme'))
    };
  }
  if (o['mode'] === 'enveloppe') return { mode: 'enveloppe', forme, marge: nombre(o['marge'], t('la marge d’un texte déformé dans une forme'), 0, 100) };
  return refuser(t('la disposition d’un texte n’est ni « sur », ni « dans », ni « enveloppe » d’une forme'));
}

function lirePointilles(v: unknown): readonly number[] {
  const liste = tableau(v, t('les pointillés d’une forme'), BORNES_PROJET.pointilles);
  const p = liste.map(x => nombre(x, t('les pointillés d’une forme'), 0));
  if (p.length === 0 || p.length % 2 !== 0 || p.every(x => x === 0)) refuser(t('les pointillés d’une forme sont mal formés'));
  return p;
}

function lireOrigine(v: unknown): readonly string[] {
  const liste = tableau(v, t('la provenance d’une forme'), BORNES_PROJET.origines).map(x => texte(x, t('la provenance d’une forme'), 200));
  // Seules les origines que le produit sait crediter se gardent, triees et sans doublon (model/credits.ts) ; une liste vide disparait.
  const propres = normaliserOrigines(liste);
  if (!propres.length) refuser(t('la provenance d’une forme ne nomme aucune source connue'));
  return propres;
}

/** Les gardes de la validation, pretees aux lecteurs des champs du modele v2 (model/projetV2/champs.ts). */
/** Un trace de projet : un texte borne, bien forme (pour les feuilles d'une decoupe, model/projetV2/decoupe.ts). */
function chemin(v: unknown, quoi: string): string {
  const d = texte(v, quoi, BORNES_PROJET.trace);
  return cheminProjetValide(d) ? d : refuser(t('{quoi} est mal formé', { quoi }));
}

const OUTILS: OutilsProjet = {
  refuser, texte, nombre, booleen, tableau, objet, choix, chemin, identifiant: ID,
  // Le contenu d'un masque (etape 6) : des formes et des groupes, valides comme ceux du dessin.
  forme: (v, i) => lireForme(v, i),
  groupes: v => lireGroupesProjet(v, OUTILS, lireOrigine)
};

function lireForme(v: unknown, i: number): FormeProjet {
  const o = objet(v, t('la forme {n}', { n: i + 1 }));
  const id = texte(o['id'], t('l’identifiant d’une forme'), BORNES_PROJET.identifiant);
  if (!ID.test(id)) refuser(t('l’identifiant de la forme {n} est mal formé', { n: i + 1 }));
  const d = texte(o['d'], t('le tracé d’une forme'), BORNES_PROJET.trace);
  if (!cheminProjetValide(d)) refuser(t('le tracé de la forme {n} est mal formé', { n: i + 1 }));
  const remplissage = peinture(o['remplissage'], t('le remplissage d’une forme')), contour = peinture(o['contour'], t('le contour d’une forme'));
  return {
    id, d, remplissage, contour,
    epaisseur: nombre(o['epaisseur'], t('l’épaisseur d’une forme'), 0),
    opacite: nombre(o['opacite'], t('l’opacité d’une forme'), 0, 1),
    ...facultatif(o, 'opaciteRemplissage', x => nombre(x, t('l’opacité du remplissage'), 0, 1)),
    ...facultatif(o, 'opaciteContour', x => nombre(x, t('l’opacité du contour'), 0, 1)),
    ...facultatif(o, 'pointilles', lirePointilles),
    ...facultatif(o, 'decalagePointilles', x => nombre(x, t('le décalage des pointillés'))),
    ...facultatif(o, 'bout', x => choix(x, t('le bout d’un trait'), ['round', 'square'] as const)),
    ...facultatif(o, 'jonction', x => choix(x, t('la jonction d’un trait'), ['miter', 'bevel'] as const)),
    ...facultatif(o, 'limiteMitre', x => nombre(x, t('la limite de pointe'), 0)),
    ...facultatif(o, 'origine', lireOrigine),
    ...facultatif(o, 'texte', lireTexte),
    ...facultatif(o, 'operation', x => choix(x, t('l’opération d’une forme'), ['decoupe', 'ecriture'] as const)),
    ...lireChampsFormeV2(o, { remplissage, contour }, OUTILS),
    regle: choix(o['regle'], t('la règle de remplissage'), ['nonzero', 'evenodd'] as const),
    visible: booleen(o['visible'], t('la visibilité d’une forme')),
    verrouille: booleen(o['verrouille'], t('le verrouillage d’une forme'))
  };
}

function lireDessinProjet(v: unknown): DessinProjet {
  const o = objet(v, t('le dessin'));
  const vb = tableau(o['vb'], t('le plan de travail'), 4);
  if (vb.length !== 4) refuser(t('le plan de travail n’a pas quatre valeurs'));
  const plan = vb.map(x => nombre(x, t('le plan de travail'))) as unknown as DessinProjet['vb'];
  if (!(plan[2] >= 0.001 && plan[3] >= 0.001)) refuser(t('le plan de travail est trop petit'));
  const brutes = tableau(o['formes'], t('les formes'), BORNES_PROJET.formes);
  let trace = 0;
  const vus = new Set<string>();
  const formes = brutes.map((f, i) => {
    const forme = lireForme(f, i);
    trace += forme.d.length;
    if (trace > BORNES_PROJET.trace) refuser(t('le tracé du dessin dépasse {max} caractères', { max: BORNES_PROJET.trace }));
    if (vus.has(forme.id)) refuser(t('deux formes portent l’identifiant « {id} »', { id: forme.id }));
    vus.add(forme.id);
    return forme;
  });
  // Les groupes (etape 1), absents d'un dessin plat ; chaque parent nomme un groupe de la table.
  const groupes = o['groupes'] !== undefined ? lireGroupesProjet(o['groupes'], OUTILS, lireOrigine) : undefined;
  for (const f of formes) {
    if (f.parent !== undefined && !(groupes && Object.prototype.hasOwnProperty.call(groupes, f.parent))) refuser(t('la forme « {id} » est dans un groupe absent', { id: f.id }));
    if (groupes && Object.prototype.hasOwnProperty.call(groupes, f.id)) refuser(t('une forme et un groupe portent l’identifiant « {id} »', { id: f.id }));
  }
  return { vb: plan, formes, ...facultatif(o, 'nuancier', lireNuancierDessin), ...facultatif(o, 'reperes', lireReperesProjet), ...(groupes ? { groupes } : {}) };
}

/** Le nuancier du dessin (ADR-0037) : une provenance admise, des teintes `#rrggbb` et leur opacite si elle n'est pas pleine. */
function lireNuancierDessin(v: unknown): NuancierDessin {
  const o = objet(v, t('le nuancier du dessin'));
  const provenance = choix(o['provenance'], t('la provenance du nuancier'), PROVENANCES_NUANCIER);
  const teintes = tableau(o['teintes'], t('les teintes du nuancier du dessin'), TEINTES_NUANCIER_MAX).map((x): TeinteDessin => {
    const teinte = objet(x, t('une teinte du nuancier du dessin'));
    const hex = texte(teinte['hex'], t('une teinte du nuancier du dessin'), 7);
    if (!HEX.test(hex)) refuser(t('une teinte du nuancier du dessin n’est pas un code #rrggbb'));
    const opacite = teinte['opacite'] === undefined ? undefined : nombre(teinte['opacite'], t('l’opacité d’une teinte'), 0, 1);
    if (opacite === 1) refuser(t('l’opacité pleine d’une teinte ne s’écrit pas'));
    return opacite === undefined ? { hex } : { hex, opacite };
  });
  return { provenance, teintes };
}

/** Les reperes du document (ADR-0038) : deux listes de nombres bornees, dont l'une au moins porte un repere. */
function lireReperesProjet(v: unknown): ReperesProjet {
  const o = objet(v, t('les repères'));
  const axe = (cle: 'h' | 'v') => tableau(o[cle], t('les repères'), BORNES_PROJET.reperes).map(x => nombre(x, t('un repère')));
  const h = axe('h'), v2 = axe('v');
  if (!h.length && !v2.length) refuser(t('les repères sont vides'));
  return { h, v: v2 };
}

/** Le contexte de production tel que le projet le garde : Generique, ou les choix d'une Cricut en identifiants. */
function lireProduction(v: unknown): ChoixProduction {
  const o = objet(v, t('le contexte de production'));
  const contexte = o['contexte'];
  if (contexte === 'generique') return { contexte: 'generique' };
  if (contexte !== 'cricut') return refuser(t('le contexte de production « {contexte} » est inconnu de cette version', { contexte: String(contexte).slice(0, 20) }));
  const ident = (cle: string) => { const s = texte(o[cle], t('le contexte de production'), 40); return IDENTIFIANT.test(s) ? s : refuser(t('le contexte de production est mal formé')); };
  return {
    contexte: 'cricut', machine: ident('machine'), tapis: ident('tapis'), materiau: ident('materiau'),
    procede: choix(o['procede'], t('le procédé'), ['decoupe', 'imprimer-decouper', 'dessin-stylo'] as const),
    unite: choix(o['unite'], t('l’unité'), ['in', 'mm'] as const),
    // Le recalage actif et la feuille sur le tapis (ADR-0039) : presents seulement hors du defaut. L'ancienne valeur `false` (le tapis
    // fixe, avant qu'il soit le defaut, revision du 26 octobre 2026) se lit comme le defaut, sans refus.
    ...(o['recalage'] === undefined || o['recalage'] === false ? {} : o['recalage'] === true ? { recalage: true as const } : refuser(t('le recalage du contexte de production est mal formé'))),
    ...(o['feuille'] === undefined ? {} : { feuille: lireFeuilleProjet(o['feuille']) })
  };
}

/** La feuille sur le tapis : quatre nombres, des cotes positifs (le profil la ramene ensuite sur son tapis). */
function lireFeuilleProjet(v: unknown): { x: number; y: number; l: number; h: number } {
  const f = objet(v, t('la feuille sur le tapis'));
  const n = (cle: string) => nombre(f[cle], t('la feuille sur le tapis'), 0, 100_000);
  const r = { x: n('x'), y: n('y'), l: n('l'), h: n('h') };
  return r.l > 0 && r.h > 0 ? r : refuser(t('la feuille sur le tapis est vide'));
}

function lireNuancier(v: unknown): readonly TeinteProjet[] {
  return tableau(v, t('le nuancier'), BORNES_PROJET.nuancier).map(x => {
    const o = objet(x, t('une teinte du nuancier'));
    const hex = texte(o['hex'], t('une teinte du nuancier'), 7);
    if (!HEX.test(hex)) refuser(t('une teinte du nuancier n’est pas un code #rrggbb'));
    return { nom: texte(o['nom'], t('le nom d’une teinte'), 80), hex };
  });
}

function lireRessources(v: unknown): RessourcesProjet {
  const o = objet(v, t('les ressources'));
  const polices = tableau(o['polices'], t('les polices du projet'), BORNES_PROJET.polices).map(x => {
    const p = objet(x, t('une police du projet'));
    const id = texte(p['id'], t('une police du projet'), 16);
    if (!ID_DEPOSEE.test(id)) refuser(t('une police du projet n’est pas une fonte déposée'));
    return { id, famille: texte(p['famille'], t('le nom d’une police'), BORNES_PROJET.famille), donnees: base64(p['donnees'], t('une police du projet'), BORNES_PROJET.base64Police) };
  });
  const images = tableau(o['images'], t('les images du projet'), BORNES_PROJET.images).map(x => {
    const p = objet(x, t('une image du projet'));
    return {
      role: choix(p['role'], t('le rôle d’une image'), ['source'] as const), nom: texte(p['nom'], t('le nom d’une image'), BORNES_PROJET.nom),
      type: choix(p['type'], t('le type d’une image'), TYPES_IMAGE), donnees: base64(p['donnees'], t('une image du projet'), BORNES_PROJET.base64Image)
    };
  });
  return { polices, images };
}

function date(v: unknown, quoi: string): string {
  const s = texte(v, quoi, 40);
  return DATE.test(s) ? s : refuser(t('{quoi} n’est pas une date ISO', { quoi }));
}

/** Le projet a la version courante, valide et reconstruit ; ou le refus nomme. Ne leve jamais. */
export function validerProjet(x: Record<string, unknown>): Projet | { erreur: string } {
  try {
    if (x['format'] !== FORMAT_PROJET || x['version'] !== VERSION_PROJET) return { erreur: t('Ce projet n’est pas au format {version}.', { version: VERSION_PROJET }) };
    return {
      format: FORMAT_PROJET, version: VERSION_PROJET,
      nom: texte(x['nom'], t('le nom du projet'), BORNES_PROJET.nom),
      ...facultatif(x, 'creeLe', v => date(v, t('la date de création'))),
      ...facultatif(x, 'modifieLe', v => date(v, t('la date de modification'))),
      dessin: lireDessinProjet(x['dessin']),
      production: lireProduction(x['production']),
      nuancier: lireNuancier(x['nuancier']),
      ressources: lireRessources(x['ressources'])
    };
  } catch (e) {
    if (e instanceof Refus) return { erreur: t('Ce projet est illisible : {raison}.', { raison: e.raison }) };
    // Une pile qui deborderait, une valeur exotique d'un hote : jamais une exception, toujours un refus.
    return { erreur: t('Ce projet est illisible.') };
  }
}

/** Un projet venu d'ailleurs (serveur, fichier) : migre, valide, ou refuse en le nommant. Ne leve jamais. */
export function lireProjet(x: unknown): ResultatProjet {
  let m: ReturnType<typeof migrer>;
  try { m = migrer(x); } catch { return { erreur: t('Ce projet est illisible.') }; }
  if ('erreur' in m) return m;
  const v = validerProjet(m.donnees);
  return 'erreur' in v ? v : { projet: v, migre: m.migre };
}

/**
 * Le nom d'un projet tel qu'on le montre et l'enregistre : sans caractere de controle ni de mise en forme bidirectionnelle, sans
 * barre (un nom n'est jamais un chemin : le fichier, lui, porte un identifiant sur), blancs resserres, borne ; « Sans titre » s'il
 * ne reste rien. La meme regle que le serveur (outils/site-php/public/inc/projets.php, `nom_propre`).
 */
export function nomDeProjet(brut: string): string {
  let sans = '';
  for (const c of brut) {
    const code = c.codePointAt(0) ?? 0;
    // Une tabulation ou un retour a la ligne separent des mots : ils deviennent une espace ; les autres invisibles partent.
    if ((code >= 0x09 && code <= 0x0d) || code === 0x85) sans += ' ';
    else if (!caractereInvisible(code)) sans += c;
  }
  const propre = sans.replace(/[/\\]/g, '-').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').trim();
  return [...propre].slice(0, BORNES_PROJET.nom).join('').trim() || 'Sans titre';
}

/** Les caracteres qu'un nom ne garde pas : controle (C0, C1), largeur nulle, separateurs de ligne, mise en forme bidirectionnelle, BOM. */
function caractereInvisible(c: number): boolean {
  return c < 0x20 || (c >= 0x7f && c <= 0x9f) || (c >= 0x200b && c <= 0x200f) || (c >= 0x2028 && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069) || c === 0xfeff;
}
