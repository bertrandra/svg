// La recherche dans la bibliotheque de formes : ce qu'un mot trouve, et dans quel ordre. Pur : une date se passe
// en parametre (le mois du calendrier), rien ne se lit de l'horloge ; la meme bibliotheque et le meme texte rendent
// toujours la meme liste.
//
// Un mot cherche se compare aux noms francais, sans accents ni majuscules, au singulier pres (« chats » trouve
// « chat », « Noël » et « noel » sont le meme mot). Il trouve, du plus fort au plus faible : un mot entier du nom,
// le debut d'un mot du nom, le nom d'un evenement ou d'une categorie de la forme, un synonyme (model/synonymes.ts),
// enfin un mot de l'identifiant anglais. A force egale, l'ordre est celui de presentation (`ordreDePresentation`),
// et dans un evenement, les formes les plus representatives viennent d'abord (`rangDansEvenement`).

import { distanceEdition } from '../util/texte.js';
import { EVENEMENTS, contient, type EntreeBibliotheque, type Evenement } from './bibliotheque.js';
import { SYNONYMES } from './synonymes.js';
import { rangDeSource, sourceDeEntree } from './bibliothequeSources.js';

/** Les forces d'une correspondance, de la plus forte a la plus faible. Un synonyme perd un point par rang. */
export const FORCES = { nomEntier: 1000, mot: 100, debut: 70, evenement: 40, synonyme: 30, anglais: 10 } as const;

const MOTS_VIDES: ReadonlySet<string> = new Set(['a', 'au', 'aux', 'avec', 'd', 'de', 'des', 'du', 'en', 'et', 'l', 'la', 'le', 'les', 'pour', 'sur', 'un', 'une', 'of', 'the']);
const NUMERIQUE = /^\d+$/;

/** Un texte tel que la recherche le compare : minuscules, sans accents, ligatures ouvertes, ponctuation en blancs. */
export function normaliser(texte: string): string {
  return texte.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Le singulier approche d'un mot normalise : « chats » donne « chat », « gateaux » donne « gateau ». Applique des deux cotes. */
export function racine(mot: string): string {
  return mot.length > 3 && /[sx]$/.test(mot) && !mot.endsWith('ss') ? mot.slice(0, -1) : mot;
}

const motsNormalises = (texte: string): string[] => normaliser(texte).split(' ').filter(Boolean);
/** « chevaux » cherche aussi « cheval » : un pluriel en -aux que la racine seule ne ramene pas. */
const variantes = (mot: string): string[] => {
  const r = racine(mot);
  return mot.length > 4 && mot.endsWith('aux') ? [r, mot.slice(0, -3) + 'al'] : [r];
};
const pleins = (mots: readonly string[]): string[] => mots.filter(m => !MOTS_VIDES.has(m));

/** Les synonymes, cles et mots ramenes a leur racine, une fois pour toutes. */
const SYNONYMES_RACINES: ReadonlyMap<string, { phrases: readonly (readonly string[])[]; evenements: readonly string[] }> = new Map(
  Object.entries(SYNONYMES).map(([cle, s]) => [racine(normaliser(cle)), { phrases: s.mots.map(p => pleins(motsNormalises(p)).map(racine)), evenements: s.evenements ?? [] }])
);

/** Ce qu'on sait d'une forme pour la chercher, calcule une fois par bibliotheque. */
interface Fiche {
  readonly entree: EntreeBibliotheque;
  /** La place de la forme dans l'ordre de presentation. */
  readonly rang: number;
  /** Les racines des mots du nom. */
  readonly mots: readonly string[];
  /** Les racines des mots pleins du nom, jointes : pour reconnaitre le nom entier. */
  readonly entier: string;
  readonly anglais: readonly string[];
  /** Les racines des mots des noms de ses evenements. */
  readonly motsEvenements: readonly string[];
}

export interface IndexRecherche {
  readonly fiches: readonly Fiche[];
  readonly evenements: readonly Evenement[];
  readonly nombres: ReadonlyMap<string, number>;
  /** Chaque racine des noms, et une forme a montrer (avec ses accents) : de quoi corriger une faute de frappe. */
  readonly vocabulaire: ReadonlyMap<string, { forme: string; frequence: number }>;
  readonly motsEvenement: ReadonlyMap<string, readonly string[]>;
}

const estSerie = (e: EntreeBibliotheque): boolean => e.id.split('-').some(m => NUMERIQUE.test(m));
const comparer = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** La cle alphabetique d'un nom : sans accents, sans ses mots vides de tete (« à cheval » se range a « cheval »). */
function cleAlphabetique(nom: string): string {
  const mots = motsNormalises(nom);
  let i = 0;
  while (i < mots.length - 1 && MOTS_VIDES.has(mots[i] ?? '')) i++;
  return mots.slice(i).join(' ');
}

/**
 * L'ordre de presentation, sans recherche : les series numerotees (« abstrait 001 », « carte 10 cœurs ») en dernier, les
 * formes que les regles rangent dans un evenement avant celles qu'aucune ne range, puis l'ordre alphabetique du nom
 * francais (sans accents ni mot vide de tete), puis l'identifiant, puis la source. Une regle, pas un choix fait a la main.
 */
export function ordreDePresentation(entrees: readonly EntreeBibliotheque[]): EntreeBibliotheque[] {
  const cles = new Map(entrees.map(e => [e, cleAlphabetique(e.nom)]));
  const groupe = (e: EntreeBibliotheque): number => (estSerie(e) ? 2 : e.evenements.length ? 0 : 1);
  // Deux formes de meme nom et de meme identifiant viennent de deux sources : l'ordre du registre les departage.
  const rang = (e: EntreeBibliotheque): number => rangDeSource(sourceDeEntree(e));
  return [...entrees].sort((a, b) => groupe(a) - groupe(b) || comparer(cles.get(a) ?? '', cles.get(b) ?? '') || comparer(a.id, b.id) || rang(a) - rang(b));
}

/**
 * La representativite d'une forme dans un evenement, plus petit d'abord : le rang du premier mot-cle de l'evenement que
 * porte son identifiant (les mots-cles vont du plus typique au moins typique), puis le nombre de ses mots pleins (un nom
 * court est l'archetype : « bonhomme de neige » avant « tete de bonhomme de neige »). Une forme rangee la a la main, sans
 * mot-cle, vient apres les autres.
 */
export function rangDansEvenement(entree: EntreeBibliotheque, ev: Evenement): readonly [number, number] {
  const mots = entree.id.split('-').filter(Boolean);
  const i = ev.mots.findIndex(m => contient(mots, m));
  return [i < 0 ? ev.mots.length : i, mots.filter(m => !NUMERIQUE.test(m) && !MOTS_VIDES.has(m)).length];
}

/** Les formes d'un evenement, les plus representatives d'abord ; a egalite, l'ordre de presentation. */
function trierPourEvenement(fiches: readonly Fiche[], ev: Evenement): Fiche[] {
  const rangs = new Map(fiches.map(f => [f, rangDansEvenement(f.entree, ev)]));
  const r = (f: Fiche) => rangs.get(f) ?? [0, 0];
  return [...fiches].sort((a, b) => r(a)[0] - r(b)[0] || r(a)[1] - r(b)[1] || a.rang - b.rang);
}

/** Les mots d'un nom tels qu'on les montre (minuscules, accents gardes) et leur racine, dans l'ordre. */
function motsAffiches(nom: string): Array<[string, string]> {
  return nom.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).flatMap(m => motsNormalises(m).map(n => [m, racine(n)] as [string, string]));
}

/** L'index d'une bibliotheque : a calculer une fois (useMemo), il sert a chaque frappe. */
export function indexer(entrees: readonly EntreeBibliotheque[], evenements: readonly Evenement[] = EVENEMENTS): IndexRecherche {
  const motsEvenement = new Map(evenements.map(ev => [ev.id, motsNormalises(ev.nom).map(racine)]));
  const nombres = new Map<string, number>();
  const vocabulaire = new Map<string, { forme: string; frequence: number }>();
  const fiches = ordreDePresentation(entrees).map((entree, rang): Fiche => {
    const mots = motsNormalises(entree.nom).map(racine);
    for (const id of entree.evenements) nombres.set(id, (nombres.get(id) ?? 0) + 1);
    for (const [forme, r] of motsAffiches(entree.nom)) {
      const v = vocabulaire.get(r);
      vocabulaire.set(r, { forme: v?.forme ?? forme, frequence: (v?.frequence ?? 0) + 1 });
    }
    return {
      entree, rang, mots, entier: pleins(mots).join(' '),
      anglais: entree.id.split('-').filter(Boolean),
      motsEvenements: entree.evenements.flatMap(id => motsEvenement.get(id) ?? [])
    };
  });
  return { fiches, evenements, nombres, vocabulaire, motsEvenement };
}

/** Un mot de la requete : ses variantes (singulier, -aux en -al) et les suites de mots que ses synonymes acceptent. */
interface MotCherche { readonly brut: string; readonly variantes: readonly string[]; readonly synonymes: readonly (readonly string[])[]; readonly evenements: readonly string[] }

/** La requete lue : les mots pleins (ou tous, si elle n'a que des mots vides), et le nom entier qu'elle forme. */
function lireRequete(texte: string): { mots: MotCherche[]; entier: string } {
  const tous = motsNormalises(texte);
  const retenus = pleins(tous).length ? pleins(tous) : tous;
  const mots = retenus.map(brut => {
    const vs = variantes(brut);
    const syn = vs.map(v => SYNONYMES_RACINES.get(v)).filter(s => s !== undefined);
    return { brut, variantes: vs, synonymes: syn.flatMap(s => s.phrases), evenements: syn.flatMap(s => s.evenements) };
  });
  return { mots, entier: retenus.map(racine).join(' ') };
}

const debutDe = (mots: readonly string[], v: string, longueurMin: number): boolean => v.length >= longueurMin && mots.some(m => m.startsWith(v));

/** La force d'un mot cherche sur une forme : la plus forte des correspondances, 0 si aucune. */
function forceMot(f: Fiche, m: MotCherche): number {
  const vs = m.variantes;
  if (vs.some(v => f.mots.includes(v))) return FORCES.mot;
  if (vs.some(v => debutDe(f.mots, v, 1))) return FORCES.debut;
  if (vs.some(v => f.motsEvenements.includes(v) || debutDe(f.motsEvenements, v, 3))) return FORCES.evenement;
  const k = m.synonymes.findIndex(phrase => phrase.length > 0 && phrase.every(p => f.mots.includes(p)));
  if (k >= 0) return Math.max(FORCES.evenement / 2, FORCES.synonyme - k);
  if (vs.some(v => f.anglais.includes(v) || debutDe(f.anglais, v, 3))) return FORCES.anglais;
  return 0;
}

/** La force d'une requete sur une forme : chaque mot doit trouver quelque chose, les forces s'ajoutent. */
function force(f: Fiche, r: { mots: readonly MotCherche[]; entier: string }): number {
  let total = 0;
  for (const m of r.mots) {
    const s = forceMot(f, m);
    if (s === 0) return 0;
    total += s;
  }
  return total + (f.entier === r.entier ? FORCES.nomEntier : 0);
}

/** L'evenement que la requete nomme (« noel », « anniv »), le premier dans l'ordre de la bibliotheque. */
function evenementNomme(index: IndexRecherche, mots: readonly MotCherche[]): Evenement | undefined {
  return index.evenements.find(ev => {
    const noms = index.motsEvenement.get(ev.id) ?? [];
    return mots.some(m => m.variantes.some(v => noms.includes(v) || debutDe(noms, v, 3)));
  });
}

/**
 * Les formes que trouve `texte`, dans l'evenement `evenementId` s'il est donne, de la plus pertinente a la moins
 * pertinente. Sans texte : l'evenement par representativite, ou toute la bibliotheque dans l'ordre de presentation.
 */
export function rechercher(index: IndexRecherche, texte: string, evenementId: string | null): EntreeBibliotheque[] {
  const requete = lireRequete(texte);
  const ev = evenementId === null ? undefined : index.evenements.find(x => x.id === evenementId);
  const candidates = evenementId === null ? index.fiches : index.fiches.filter(f => f.entree.evenements.includes(evenementId));
  if (!requete.mots.length) return (ev ? trierPourEvenement(candidates, ev) : candidates).map(f => f.entree);
  const forces = new Map<Fiche, number>();
  for (const f of candidates) {
    const s = force(f, requete);
    if (s > 0) forces.set(f, s);
  }
  const trouvees = [...forces.keys()];
  // A force egale, la representativite dans l'evenement choisi, ou dans celui que la requete nomme.
  const focal = ev ?? evenementNomme(index, requete.mots);
  const ordre = new Map((focal ? trierPourEvenement(trouvees, focal) : trouvees).map((f, i) => [f, i]));
  return trouvees.sort((a, b) => (forces.get(b) ?? 0) - (forces.get(a) ?? 0) || (ordre.get(a) ?? 0) - (ordre.get(b) ?? 0)).map(f => f.entree);
}

/** La recherche en un appel, sans index garde : pour un usage ponctuel et les tests. */
export function chercher(entrees: readonly EntreeBibliotheque[], texte: string, evenementId: string | null, evenements: readonly Evenement[] = EVENEMENTS): EntreeBibliotheque[] {
  return rechercher(indexer(entrees, evenements), texte, evenementId);
}

const distance = (ecart: number) => (ecart <= 5 ? 1 : 2);
const ecartMois = (ev: Evenement, mois: number): number => (((ev.mois ?? mois) - mois) % 12 + 12) % 12;

/** Les evenements du calendrier dans l'ordre ou ils arrivent a partir du mois `mois` (1 a 12) ; a mois egal, l'ordre de la bibliotheque. */
export function ordreCalendrier(evenements: readonly Evenement[], mois: number): Evenement[] {
  const calendrier = evenements.filter(ev => ev.famille === 'calendrier');
  return calendrier.map((ev, i) => ({ ev, i })).sort((a, b) => ecartMois(a.ev, mois) - ecartMois(b.ev, mois) || a.i - b.i).map(x => x.ev);
}

/** Les `n` evenements du calendrier les plus proches du mois `mois`, a venir d'abord. */
export const evenementsProches = (evenements: readonly Evenement[], mois: number, n: number): Evenement[] => ordreCalendrier(evenements, mois).slice(0, n);

/** Un evenement propose, avec le nombre de formes qu'il porte. */
export interface EvenementPropose { readonly id: string; readonly nom: string; readonly nombre: number }

const propose = (index: IndexRecherche, ev: Evenement): EvenementPropose => ({ id: ev.id, nom: ev.nom, nombre: index.nombres.get(ev.id) ?? 0 });

/** Les evenements qu'une requete nomme ou que ses synonymes designent (« sapin » : Noël), trois au plus. */
export function evenementsLies(index: IndexRecherche, texte: string): EvenementPropose[] {
  const { mots } = lireRequete(texte);
  if (!mots.length) return [];
  const ids = new Set(mots.flatMap(m => m.evenements));
  const lies = index.evenements.filter(ev => {
    if (ids.has(ev.id)) return true;
    const noms = index.motsEvenement.get(ev.id) ?? [];
    return mots.some(m => m.variantes.some(v => noms.includes(v) || debutDe(noms, v, 3)));
  });
  return lies.map(ev => propose(index, ev)).filter(p => p.nombre > 0).slice(0, 3);
}

/** Ce qu'on propose quand une recherche ne trouve rien. */
export type Suggestion =
  | { readonly type: 'tous'; readonly nombre: number }
  | { readonly type: 'texte'; readonly texte: string; readonly nombre: number }
  | ({ readonly type: 'evenement' } & EvenementPropose);

/** Le mot du vocabulaire le plus proche d'un mot sans correspondance, a une faute de frappe pres ; undefined si rien n'est assez pres. */
function corriger(index: IndexRecherche, brut: string): string | undefined {
  const r = racine(brut);
  if (index.vocabulaire.has(r) || [...index.vocabulaire.keys()].some(v => v.startsWith(r))) return undefined;
  let meilleur: { forme: string; d: number; frequence: number } | undefined;
  for (const [v, { forme, frequence }] of index.vocabulaire) {
    const d = distanceEdition(r, v, distance(r.length));
    if (d > distance(r.length)) continue;
    if (!meilleur || d < meilleur.d || (d === meilleur.d && frequence > meilleur.frequence)) meilleur = { forme, d, frequence };
  }
  return meilleur?.forme;
}

/** Les evenements dont le nom ressemble a un mot cherche (« halowen », « aniversaire »). */
function evenementsVoisins(index: IndexRecherche, mots: readonly MotCherche[]): Evenement[] {
  return index.evenements.filter(ev => (index.motsEvenement.get(ev.id) ?? []).some(n => n.length >= 4
    && mots.some(m => m.variantes.some(v => v.length >= 4 && distanceEdition(v, n, distance(n.length)) <= distance(n.length)))));
}

/**
 * Ce qu'on propose quand `texte` ne trouve rien (dans `evenementId` s'il est donne) : la meme recherche dans tous les
 * evenements, une faute de frappe corrigee, puis des evenements, ceux que la requete designe ou dont le nom lui ressemble,
 * et a defaut ceux du calendrier qui arrivent apres le mois `mois`. Chaque proposition trouve au moins une forme.
 */
export function suggestions(index: IndexRecherche, texte: string, evenementId: string | null, mois: number): Suggestion[] {
  const { mots } = lireRequete(texte);
  const sortie: Suggestion[] = [];
  if (evenementId !== null && mots.length) {
    const n = rechercher(index, texte, null).length;
    if (n) sortie.push({ type: 'tous', nombre: n });
  }
  if (mots.length) {
    const corriges = mots.map(m => corriger(index, m.brut) ?? m.brut);
    const texteCorrige = corriges.join(' ');
    if (corriges.some((c, i) => c !== mots[i]?.brut)) {
      const n = rechercher(index, texteCorrige, evenementId).length || rechercher(index, texteCorrige, null).length;
      if (n) sortie.push({ type: 'texte', texte: texteCorrige, nombre: n });
    }
  }
  const designes = index.evenements.filter(ev => mots.some(m => m.evenements.includes(ev.id)));
  const candidats = [...designes, ...evenementsVoisins(index, mots), ...ordreCalendrier(index.evenements, mois)];
  const vus = new Set<string>(evenementId === null ? [] : [evenementId]);
  for (const ev of candidats) {
    if (vus.has(ev.id) || sortie.filter(s => s.type === 'evenement').length >= 3) continue;
    vus.add(ev.id);
    const p = propose(index, ev);
    if (p.nombre > 0) sortie.push({ type: 'evenement', ...p });
  }
  return sortie;
}
