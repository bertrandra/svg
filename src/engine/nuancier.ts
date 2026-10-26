// Le nuancier tire du dessin (ADR-0037) : les couleurs de remplissage et de contour reellement employees, rangees par la
// surface qu'elles couvrent, les presque identiques fusionnees, plafonnees, noir et blanc gardes s'ils servent. Puis ce qu'on
// en fait : le remplacer ou le completer par les couleurs d'une selection, le poser dans le dessin (une entree d'historique),
// le tirer des couleurs dominantes d'une image.
//
// Pur et deterministe : la meme liste de formes rend toujours les memes teintes dans le meme ordre. Ce que chaque forme apporte
// (sa couleur, son opacite, sa surface) se memorise par forme (ADR-0008) : une forme immuable n'est mesuree qu'une fois, et un
// dessin de cinq mille formes ne refait que l'addition quand une seule a change.

import { lireCode, versHex, versOklab, type Oklab } from '../util/couleur.js';
import { creerIndexVoisins } from '../util/voisinsOklab.js';
import { PLAFOND_NUANCIER, TEINTES_NUANCIER_MAX, type NuancierDessin, type ProvenanceNuancier, type TeinteDessin } from '../model/nuancier.js';
import { opaciteDuContour, opaciteDuRemplissage } from './edition/opacites.js';
import type { Contenu, DessinSvg, Forme, Peinture } from './edition/types.js';
import { visibleEffectif } from './edition/arbre.js';
import { estMotif } from './edition/fonctions/motifs.js';
import { estDegrade, poidsArrets } from './edition/degrades.js';
import { aireDeChemin, longueurDeChemin } from './nuancier/surfaces.js';

export { aireDeChemin, longueurDeChemin } from './nuancier/surfaces.js';

/**
 * L'ecart percu (distance OKLab, celle de `ecartPercu`) a ou sous lequel deux couleurs sont la meme teinte du nuancier. 0,02 est le
 * seuil de la difference a peine visible dans OKLab (« 0,02 se devine », util/couleur.ts) : deux rouges nes d'une vectorisation
 * (#c81e28 et #c91f27, a 0,003) se fondent, un rouge et un rouge plus sombre d'un cran (#c81e28 et #b41b24, a 0,04) restent deux.
 */
export const SEUIL_FUSION = 0.02;

/** Le noir et le blanc d'un dessin : une couleur sans chroma (OKLab) plus sombre, ou plus claire, que ces clartes. */
const NOIR_SOUS = 0.25, BLANC_SUR = 0.95, CHROMA_NEUTRE = 0.035;

export interface OptionsNuancier {
  /** Le nombre de teintes au plus (24 par defaut) ; noir et blanc, s'ils servent, prennent les dernieres places. */
  readonly plafond?: number;
  /** L'ecart percu de fusion (0,02 par defaut). */
  readonly seuil?: number;
}

/** Ce qu'une forme apporte a une couleur : la surface couverte, a une opacite. */
interface Apport { readonly hex: string; readonly opacite: number; readonly surface: number }

const arrondi = (v: number, pas: number) => Math.round(v / pas) * pas;

/** Un code de peinture lu en `#rrggbb` minuscule, ou null (aucune peinture, ou un mot qu'on ne lit pas : jamais devine). */
function hexDe(peinture: string | null): string | null {
  if (!peinture) return null;
  const rgb = lireCode(peinture);
  return rgb ? versHex(rgb) : null;
}

const memo = new WeakMap<Forme, readonly Apport[]>();

/**
 * Ce qu'une peinture couvre. Unie : sa couleur, toute la surface. Un degrade (modele v2, ADR-0012 etape 3) : chaque arret pour sa part
 * du degrade (`poidsArrets`) et a son opacite, jamais la couleur de repli, qui n'est pas une couleur du dessin. Un motif (etape 9) : les
 * couleurs de sa tuile, chacune pour sa part de ce que la tuile peint (ce qu'elle laisse transparent ne compte pas) et a son opacite par
 * celle de la peinture, jamais la couleur de repli ; un motif ou un degrade de la tuile, par leurs propres couleurs.
 */
function couvrir(r: Apport[], peinture: Peinture | undefined, hex: string, opacite: number, surface: number): void {
  if (peinture === undefined) { r.push({ hex, opacite, surface }); return; }
  if (estMotif(peinture)) {
    const tuile = apportsDeTuile(peinture.contenu), total = tuile.reduce((s, a) => s + a.surface, 0);
    if (!(total > 0)) return;
    for (const a of tuile) {
      const o = arrondi(opacite * a.opacite, 0.01), s = (surface * a.surface) / total;
      if (o > 0 && s > 0) r.push({ hex: a.hex, opacite: o, surface: s });
    }
    return;
  }
  if (!estDegrade(peinture)) return;
  const poids = poidsArrets(peinture.arrets);
  peinture.arrets.forEach((a, i) => {
    const o = arrondi(opacite * (a.opacite ?? 1), 0.01), s = surface * (poids[i] ?? 0);
    if (o > 0 && s > 0) r.push({ hex: a.couleur, opacite: o, surface: s });
  });
}

/**
 * Ce qu'une forme apporte au nuancier : son remplissage (l'aire peinte) et son contour (la longueur du trace par son
 * epaisseur), chacun a son opacite effective (celle de la forme par celle de la peinture), au centieme. Une peinture invisible
 * (opacite nulle, trait d'epaisseur nulle, aire nulle) n'apporte rien : elle n'est pas employee. Sous un degrade, ses arrets. Sous
 * une ombre portee (modele v2, ADR-0012 etape 7), sa couleur aussi : l'ombre peint la silhouette de la forme (ce que couvrent son fond
 * et son trait), a l'opacite de la forme par celle de l'ombre. Un flou ne change aucune couleur.
 */
export function apportsDe(f: Forme): readonly Apport[] {
  const deja = memo.get(f);
  if (deja) return deja;
  const r: Apport[] = [];
  const fond = hexDe(f.remplissage), trait = hexDe(f.contour);
  let silhouette = 0;
  if (fond) {
    const opacite = arrondi(f.opacite * opaciteDuRemplissage(f), 0.01), surface = opacite > 0 ? aireDeChemin(f.d, f.regle) : 0;
    if (surface > 0) couvrir(r, f.peintureRemplissage, fond, opacite, surface);
    silhouette += surface;
  }
  if (trait && f.epaisseur > 0) {
    const opacite = arrondi(f.opacite * opaciteDuContour(f), 0.01), surface = opacite > 0 ? longueurDeChemin(f.d) * f.epaisseur : 0;
    if (surface > 0) couvrir(r, f.peintureContour, trait, opacite, surface);
    silhouette += surface;
  }
  const ombre = f.effets?.ombre, teinteOmbre = ombre ? hexDe(ombre.couleur) : null;
  if (ombre && teinteOmbre && silhouette > 0) {
    const opacite = arrondi(f.opacite * ombre.opacite, 0.01);
    if (opacite > 0) r.push({ hex: teinteOmbre, opacite, surface: silhouette });
  }
  memo.set(f, r);
  return r;
}

const memoTuiles = new WeakMap<Contenu, readonly Apport[]>();
/** Ce que les feuilles visibles d'une tuile de motif apportent, memorise par tuile (un motif partage ne se mesure qu'une fois). */
function apportsDeTuile(c: Contenu): readonly Apport[] {
  const deja = memoTuiles.get(c);
  if (deja) return deja;
  const r = c.formes.filter(f => visibleEffectif(c, f.id)).flatMap(f => apportsDe(f));
  memoTuiles.set(c, r);
  return r;
}

/** Une couleur du nuancier en cours de calcul : sa surface totale, et sa surface par opacite (l'opacite gardee est la plus large). */
interface Cumul { hex: string; point: Oklab; surface: number; parOpacite: Map<number, number> }

const parSurface = (a: { surface: number; hex: string }, b: { surface: number; hex: string }) => b.surface - a.surface || (a.hex < b.hex ? -1 : a.hex > b.hex ? 1 : 0);

function ajouterOpacites(dans: Map<number, number>, de: ReadonlyMap<number, number>): void {
  for (const [o, s] of de) dans.set(o, (dans.get(o) ?? 0) + s);
}

/** L'opacite qui couvre le plus de surface ; a egalite la plus pleine. */
function opaciteDominante(m: ReadonlyMap<number, number>): number {
  let meilleure = 1, surface = -1;
  for (const [o, s] of m) if (s > surface || (s === surface && o > meilleure)) { meilleure = o; surface = s; }
  return meilleure;
}

const teinte = (c: Cumul): TeinteDessin => {
  const o = opaciteDominante(c.parOpacite);
  return o < 1 ? { hex: c.hex, opacite: o } : { hex: c.hex };
};

/**
 * Les cumuls par code exact, puis fondus : on parcourt les couleurs de la plus large a la moins large ; chacune rejoint la
 * premiere couleur retenue a moins du seuil, sinon elle est retenue. Mesurer contre la couleur retenue (pas contre le dernier
 * membre) evite qu'un degrade s'enchaine en une seule teinte ; la couleur retenue est la plus large de son groupe, une couleur
 * reelle du dessin, jamais une moyenne.
 */
function fondre(apports: Iterable<Apport>, seuil: number): Cumul[] {
  const parCode = new Map<string, Cumul>();
  for (const a of apports) {
    let c = parCode.get(a.hex);
    if (!c) {
      const rgb = lireCode(a.hex);
      if (!rgb) continue;
      c = { hex: a.hex, point: versOklab(rgb), surface: 0, parOpacite: new Map() };
      parCode.set(a.hex, c);
    }
    c.surface += a.surface;
    c.parOpacite.set(a.opacite, (c.parOpacite.get(a.opacite) ?? 0) + a.surface);
  }
  const index = creerIndexVoisins(seuil), retenues: Cumul[] = [];
  for (const c of [...parCode.values()].sort(parSurface)) {
    const rang = index.premier(c.point), cible = rang >= 0 ? retenues[rang] : undefined;
    if (cible) { cible.surface += c.surface; ajouterOpacites(cible.parOpacite, c.parOpacite); continue; }
    index.ajouter(c.point, retenues.length);
    retenues.push({ ...c, parOpacite: new Map(c.parOpacite) });
  }
  return retenues.sort(parSurface);
}

const estNoir = (p: Oklab) => p.l < NOIR_SOUS && Math.hypot(p.a, p.b) < CHROMA_NEUTRE;
const estBlanc = (p: Oklab) => p.l > BLANC_SUR && Math.hypot(p.a, p.b) < CHROMA_NEUTRE;

/**
 * Les `plafond` couleurs les plus larges. Le noir et le blanc du dessin, s'il en a, restent meme s'ils couvrent peu (un trait
 * noir fin, un blanc de reserve) : ils prennent les dernieres places, et l'ordre par surface est garde.
 */
function plafonner(cumuls: readonly Cumul[], plafond: number): Cumul[] {
  const n = Math.max(1, Math.floor(plafond));
  if (cumuls.length <= n) return [...cumuls];
  const gardes = cumuls.slice(0, n);
  const extremes = [cumuls.find(c => estNoir(c.point)), cumuls.find(c => estBlanc(c.point))].filter((c): c is Cumul => !!c && !gardes.includes(c));
  if (!extremes.length) return gardes;
  // Les places des extremes se prennent sur les moins larges, sans jamais chasser l'autre extreme deja garde.
  const proteges = new Set([cumuls.find(c => estNoir(c.point)), cumuls.find(c => estBlanc(c.point))]);
  let aRetirer = Math.min(extremes.length, n);
  for (let i = gardes.length - 1; i >= 0 && aRetirer > 0; i--) {
    if (proteges.has(gardes[i])) continue;
    gardes.splice(i, 1);
    aRetirer--;
  }
  return [...gardes, ...extremes].slice(0, n).sort(parSurface);
}

/** Les teintes des formes donnees, rangees par surface couverte, fondues sous le seuil, plafonnees. */
export function teintesDesFormes(formes: Iterable<Forme>, options: OptionsNuancier = {}): TeinteDessin[] {
  const apports: Apport[] = [];
  for (const f of formes) for (const a of apportsDe(f)) apports.push(a);
  return plafonner(fondre(apports, options.seuil ?? SEUIL_FUSION), options.plafond ?? PLAFOND_NUANCIER).map(teinte);
}

/** Le nuancier de tout le dessin : les formes visibles (une forme masquee ne s'ecrit pas, elle n'emploie aucune couleur). */
export function nuancierDuDessin(dessin: DessinSvg, options: OptionsNuancier = {}): NuancierDessin {
  return { provenance: 'dessin', teintes: teintesDesFormes(dessin.formes.filter(f => f.visible), options) };
}

const memoEffectif = new WeakMap<readonly Forme[], NuancierDessin>();

/** Le nuancier que montre l'editeur : celui que le dessin porte, sinon celui qu'on lit sur ses formes (memorise par liste de formes). */
export function nuancierEffectif(dessin: DessinSvg): NuancierDessin {
  if (dessin.nuancier) return dessin.nuancier;
  const deja = memoEffectif.get(dessin.formes);
  if (deja) return deja;
  const n = nuancierDuDessin(dessin);
  memoEffectif.set(dessin.formes, n);
  return n;
}

/**
 * Le dessin tel que l'editeur l'ouvre : avec son nuancier, tire de ses couleurs s'il n'en porte pas (un SVG, un PDF, une image
 * convertie, un projet d'avant le nuancier). Le meme objet s'il en porte deja un : un hote qui compare les etats par identite
 * (le site, ADR-0030) le reconnait.
 */
export function avecNuancier(dessin: DessinSvg): DessinSvg {
  return dessin.nuancier ? dessin : { ...dessin, nuancier: nuancierDuDessin(dessin) };
}

const memesTeintes = (a: readonly TeinteDessin[], b: readonly TeinteDessin[]) => a.length === b.length && a.every((t, i) => t.hex === b[i]?.hex && t.opacite === b[i]?.opacite);

/** Le dessin avec ce nuancier ; le meme dessin si rien ne change (l'historique n'empile alors rien). */
export function poserNuancier(dessin: DessinSvg, n: NuancierDessin): DessinSvg {
  const avant = dessin.nuancier;
  if (avant && avant.provenance === n.provenance && memesTeintes(avant.teintes, n.teintes)) return dessin;
  return { ...dessin, nuancier: n };
}

export type ModeNuancier = 'remplacer' | 'ajouter';

/** Ce que rend la creation depuis une selection : le nouveau nuancier, et ce qu'elle a apporte (pour le dire). */
export interface NuancierDeSelection { readonly nuancier: NuancierDessin; readonly lues: number; readonly ajoutees: number }

/**
 * Le nuancier du dessin cree depuis les formes choisies. `remplacer` : leurs couleurs seules. `ajouter` : les teintes d'avant,
 * dans leur ordre, puis celles de la selection qu'aucune teinte d'avant ne couvre deja (sous le seuil), dans leur ordre de
 * surface ; le tout borne a 256. Null si les formes choisies n'ont aucune couleur employee.
 */
export function nuancierDeSelection(dessin: DessinSvg, ids: readonly string[], mode: ModeNuancier, options: OptionsNuancier = {}): NuancierDeSelection | null {
  const voulus = new Set(ids);
  const lues = teintesDesFormes(dessin.formes.filter(f => voulus.has(f.id)), options);
  if (!lues.length) return null;
  if (mode === 'remplacer') return { nuancier: { provenance: 'selection', teintes: lues }, lues: lues.length, ajoutees: lues.length };
  const avant = nuancierEffectif(dessin), seuil = options.seuil ?? SEUIL_FUSION;
  const index = creerIndexVoisins(seuil);
  avant.teintes.forEach((t, i) => { const rgb = lireCode(t.hex); if (rgb) index.ajouter(versOklab(rgb), i); });
  const nouvelles = lues.filter(t => { const rgb = lireCode(t.hex); return rgb !== null && index.premier(versOklab(rgb)) < 0; });
  const provenance: ProvenanceNuancier = avant.provenance === 'selection' ? 'selection' : 'mixte';
  const teintes = [...avant.teintes, ...nouvelles].slice(0, TEINTES_NUANCIER_MAX);
  return { nuancier: { provenance: nouvelles.length ? provenance : avant.provenance, teintes }, lues: lues.length, ajoutees: teintes.length - avant.teintes.length };
}

/**
 * Le nuancier des couleurs dominantes d'une image (engine/extraction.ts, coupe mediane deterministe) : leur part de l'image tient
 * lieu de surface. Les memes regles que pour un dessin : fusion sous le seuil, plafond, noir et blanc gardes s'ils servent.
 */
export function teintesDImage(couleurs: readonly { readonly hex: string; readonly part: number }[], options: OptionsNuancier = {}): TeinteDessin[] {
  const apports: Apport[] = [];
  for (const c of couleurs) { const hex = hexDe(c.hex); if (hex && c.part > 0) apports.push({ hex, opacite: 1, surface: c.part }); }
  return plafonner(fondre(apports, options.seuil ?? SEUIL_FUSION), options.plafond ?? PLAFOND_NUANCIER).map(teinte);
}
