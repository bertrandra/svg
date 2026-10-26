// Vectoriser un texte vivant (ADR-0022) : il devient des formes ordinaires, qu'on ne retape plus. Trois modes :
//   - « lettres » : une forme par lettre (par ligature) ;
//   - « souder-touchantes » : les lettres qui se touchent n'en font qu'une (un mot manuscrit d'un seul tenant), les autres
//     restent seules : ce qu'attend une machine de decoupe, qui couperait sinon chaque lettre a travers sa voisine ;
//   - « tout » : une seule forme, les lettres qui se touchent soudees.
// Souder, c'est l'union des booleens (ADR-0004) pour une police a contour ; pour une police a trait (des traces ouverts,
// sans aire), c'est mettre bout a bout les traces des lettres qui se touchent : on n'unit pas des lignes.
//
// Les lettres viennent de la composition (texte/bloc.ts) quand l'interface a la fonte et que ses contours sont ceux de la
// forme ; sinon (fonte absente, ou d'une autre version), la forme se coupe en « parties » : chaque contour exterieur avec
// ses trous, ou chaque trace pour une police a trait. Les soudures donnent alors le meme resultat ; seules les lettres en
// plusieurs morceaux (i, e accent aigu) se separent en morceaux. Pur et deterministe.

import clipping, { type MultiPolygon } from 'polygon-clipping';
import { boiteChemin, grouper, prochainId, sansTexte, seCroisent, sousChemins, type Boite, type Chemin, type Commande, type DessinSvg, type Forme } from '../editionSvg.js';
import { aireSignee, aplatir, cheminDeRegion, cheminLisseDeRegion, regionDeChemin, toleranceBooleen } from '../booleens.js';
import { aireDeRegion } from '../contour/region.js';
import { natureDuTexte } from './vivant.js';

export type ModeVectorisation = 'lettres' | 'souder-touchantes' | 'tout';
export const MODES_VECTORISATION: readonly ModeVectorisation[] = ['lettres', 'souder-touchantes', 'tout'];
export const NOMS_MODES: Readonly<Record<ModeVectorisation, string>> = {
  lettres: 'Lettres séparées',
  'souder-touchantes': 'Souder les lettres qui se touchent',
  tout: 'Tout souder'
};

export interface OptionsVectorisation {
  /** Les lettres de chaque texte, posees dans le plan (lettresDuTexte), par identifiant de forme ; absentes : par parties. */
  readonly lettres?: ReadonlyMap<string, readonly Chemin[]>;
  readonly tolerance?: number;
  /** Rebatir en courbes les lettres soudees (le reglage des booleens de l'editeur). */
  readonly lisser?: boolean;
}

export interface ResultatVectorisation {
  readonly dessin: DessinSvg;
  /** Les formes produites, dans l'ordre du dessin. */
  readonly ids: string[];
  readonly textes: number;
  /** Combien de textes ont ete coupes par parties, faute de fonte qui redonne leurs contours. */
  readonly parParties: number;
}

/** Un texte a trait unique se vectorise sans union : ses traces n'ont pas d'aire. */
export const estTraceOuvert = (f: Forme): boolean => (f.texte ? natureDuTexte(f.texte) === 'trait' : false) || (f.remplissage === null && f.contour !== null);

/** Vrai si deux chemins ont les memes commandes, a `tol` pres (une relecture arrondit au millieme). */
function memesChemins(a: Chemin, b: Chemin, tol: number): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (!x || !y || x.c !== y.c || x.p.length !== y.p.length || x.p.some((v, k) => Math.abs(v - (y.p[k] ?? NaN)) > tol)) return false;
  }
  return true;
}

const dedans = (p: readonly [number, number], r: ReadonlyArray<readonly [number, number]>): boolean => {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if (a && b && (a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
};

/**
 * Les parties d'un trace, a defaut des lettres : pour un trace plein, chaque contour exterieur avec les contours qu'il
 * contient a une profondeur impaire (ses trous) ; pour un trace ouvert, chaque sous-chemin.
 */
export function partiesDe(d: Chemin, ouvert: boolean, tolerance: number): Chemin[] {
  const sous = sousChemins(d);
  if (ouvert) return sous;
  const anneaux = sous.map(s => aplatir(s, tolerance)[0] ?? []);
  const aires = anneaux.map(r => Math.abs(aireSignee(r)));
  // Le conteneur le plus proche de chaque sous-chemin : le plus petit qui contient son premier point.
  const parent = sous.map((_, i) => {
    const p = anneaux[i]?.[0];
    let meilleur = -1;
    if (!p) return meilleur;
    anneaux.forEach((r, k) => { if (k !== i && r.length > 2 && (aires[k] ?? 0) > (aires[i] ?? 0) && dedans(p, r) && (meilleur < 0 || (aires[k] ?? 0) < (aires[meilleur] ?? 0))) meilleur = k; });
    return meilleur;
  });
  const profondeur = (i: number): number => { let n = 0; for (let k = parent[i] ?? -1; k >= 0 && n < sous.length; k = parent[k] ?? -1) n++; return n; };
  const groupes = new Map<number, Commande[]>();
  sous.forEach((s, i) => {
    // Profondeur paire : un contour exterieur (une ile dans un trou aussi), une partie a lui ; impaire : un trou de son conteneur.
    const r = profondeur(i) % 2 === 0 ? i : parent[i] ?? i;
    groupes.set(r, [...(groupes.get(r) ?? []), ...s]);
  });
  return [...groupes.entries()].sort((a, b) => a[0] - b[0]).map(([, d]) => d);
}

/** Les morceaux d'un texte : ses lettres quand elles redonnent sa forme, sinon ses parties. */
function morceauxDe(f: Forme, lettres: readonly Chemin[] | undefined, tolerance: number): { morceaux: Chemin[]; parParties: boolean } {
  const ouvert = estTraceOuvert(f);
  if (lettres && lettres.length && memesChemins(lettres.flat(), f.d, Math.max(0.01, tolerance * 20))) return { morceaux: [...lettres], parParties: false };
  return { morceaux: partiesDe(f.d, ouvert, tolerance), parParties: true };
}

/** La plus courte distance entre deux suites de segments (traces ouverts aplatis). */
function distanceTraces(a: ReadonlyArray<ReadonlyArray<readonly [number, number]>>, b: ReadonlyArray<ReadonlyArray<readonly [number, number]>>): number {
  const seg = (p: readonly [number, number], q: readonly [number, number], r: readonly [number, number]): number => {
    const dx = q[0] - p[0], dy = q[1] - p[1], l = dx * dx + dy * dy;
    const t = l > 0 ? Math.max(0, Math.min(1, ((r[0] - p[0]) * dx + (r[1] - p[1]) * dy) / l)) : 0;
    return Math.hypot(p[0] + t * dx - r[0], p[1] + t * dy - r[1]);
  };
  let min = Infinity;
  for (const la of a) for (const lb of b) {
    for (let i = 0; i < la.length; i++) for (let k = 0; k + 1 < lb.length; k++) { const p = la[i], q = lb[k], r = lb[k + 1]; if (p && q && r) min = Math.min(min, seg(q, r, p)); }
    for (let k = 0; k < lb.length; k++) for (let i = 0; i + 1 < la.length; i++) { const p = lb[k], q = la[i], r = la[i + 1]; if (p && q && r) min = Math.min(min, seg(q, r, p)); }
  }
  return min;
}

/** Les points d'un trace ouvert, sous-chemin par sous-chemin (l'aplatissement ferme les anneaux ; ici, on garde la ligne). */
const polylignes = (d: Chemin, tolerance: number): Array<Array<readonly [number, number]>> => sousChemins(d).map(s => {
  const r = aplatir([...s, { c: 'L', p: s[0]?.p.slice(0, 2) ?? [0, 0] }], tolerance)[0] ?? [];
  return r.slice(0, Math.max(1, r.length - 1));
});

/** Les groupes de morceaux qui se touchent (de proche en proche), dans l'ordre de leur premier morceau. */
export function groupesQuiSeTouchent(morceaux: readonly Chemin[], ouvert: boolean, epaisseur: number, tolerance: number): number[][] {
  const n = morceaux.length, parent = morceaux.map((_, i) => i);
  const trouver = (i: number): number => { let k = i; while (parent[k] !== k) k = parent[k] ?? k; return k; };
  const boites = morceaux.map(boiteChemin);
  const marge = ouvert ? Math.max(epaisseur, tolerance) : 0;
  const regions: Array<MultiPolygon | null> = ouvert ? [] : morceaux.map(m => regionDeChemin(m, 'nonzero', tolerance));
  const lignes = ouvert ? morceaux.map(m => polylignes(m, tolerance)) : [];
  for (let i = 0; i < n; i++) for (let k = i + 1; k < n; k++) {
    const a = boites[i], b = boites[k];
    if (!a || !b || !seCroisent(elargir(a, marge), b) || trouver(i) === trouver(k)) continue;
    const touche = ouvert
      ? distanceTraces(lignes[i] ?? [], lignes[k] ?? []) <= marge
      : aireDeRegion(clipping.intersection(regions[i] ?? [], regions[k] ?? [])) > tolerance * tolerance;
    if (touche) parent[trouver(k)] = trouver(i);
  }
  const groupes = new Map<number, number[]>();
  for (let i = 0; i < n; i++) { const r = trouver(i); groupes.set(r, [...(groupes.get(r) ?? []), i]); }
  return [...groupes.values()].sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
}

const elargir = (b: Boite, m: number): Boite => ({ x: b.x - m, y: b.y - m, l: b.l + 2 * m, h: b.h + 2 * m });

/** Le trace d'un groupe soude : le morceau seul tel quel ; plusieurs, unis (contour) ou mis bout a bout (trait). */
function souder(morceaux: readonly Chemin[], groupe: readonly number[], ouvert: boolean, tolerance: number, lisser: boolean): Chemin {
  const choisis = groupe.map(i => morceaux[i] ?? []);
  if (choisis.length === 1 || ouvert) return choisis.flat();
  const region = clipping.union(regionDeChemin(choisis[0] ?? [], 'nonzero', tolerance), ...choisis.slice(1).map(m => regionDeChemin(m, 'nonzero', tolerance)));
  const courbe = lisser && choisis.some(m => m.some(c => c.c === 'C' || c.c === 'Q'));
  return courbe ? cheminLisseDeRegion(region, tolerance) : cheminDeRegion(region);
}

/** Les traces d'un texte vectorise selon le mode. */
export function tracesVectorises(morceaux: readonly Chemin[], mode: ModeVectorisation, ouvert: boolean, epaisseur: number, tolerance: number, lisser: boolean): Chemin[] {
  if (mode === 'lettres') return morceaux.filter(m => m.length);
  const groupes = groupesQuiSeTouchent(morceaux, ouvert, epaisseur, tolerance);
  const soudes = groupes.map(g => souder(morceaux, g, ouvert, tolerance, lisser)).filter(d => d.length);
  return mode === 'tout' ? [soudes.flat()] : soudes;
}

/**
 * Vectorise les textes vivants choisis : chacun laisse place, a son rang, aux formes de son mode, a sa peinture ; la
 * premiere garde son identifiant. Les formes choisies qui ne sont pas des textes, et les textes verrouilles, ne bougent pas.
 */
export function vectoriserTextes(dessin: DessinSvg, ids: readonly string[], mode: ModeVectorisation, options: OptionsVectorisation = {}): ResultatVectorisation {
  const voulus = new Set(ids), tolerance = options.tolerance ?? toleranceBooleen(dessin);
  let n = prochainId(dessin), textes = 0, parParties = 0;
  const produits: string[] = [];
  const formes = dessin.formes.flatMap(f => {
    if (!voulus.has(f.id) || !f.texte || f.verrouille) return [f];
    textes++;
    const m = morceauxDe(f, options.lettres?.get(f.id), tolerance);
    if (m.parParties) parParties++;
    const traces = tracesVectorises(m.morceaux, mode, estTraceOuvert(f), f.epaisseur, tolerance, options.lisser === true);
    const base = sansTexte(f);
    if (!traces.length) { produits.push(f.id); return [base]; }
    return traces.map((d, i) => { const id = i === 0 ? f.id : 'f' + n++; produits.push(id); return { ...base, id, d, regle: 'nonzero' as const }; });
  });
  return { dessin: textes ? { ...dessin, formes } : dessin, ids: produits, textes, parParties };
}

/** Le nom du groupe des lettres d'un texte (ADR-0012, annexe 4 A §2) : « Texte « … » », sa premiere ligne, ecourtee. */
export function nomGroupeTexte(texte: string): string {
  const ligne = (texte.split('\n').find(l => l.trim() !== '') ?? '').trim();
  const court = [...ligne].length > 40 ? [...ligne].slice(0, 39).join('').trimEnd() + '…' : ligne;
  return 'Texte « ' + court + ' »';
}

/**
 * « Lettres séparées » dans le modele riche (ADR-0012, etape 1, le reste de l'etape 10) : comme `vectoriserTextes` en mode
 * `lettres`, puis les lettres de chaque texte deviennent UN groupe nomme « Texte « … » », a la place et dans le groupe du texte. Un
 * texte qui ne donne qu'une forme reste une forme. `groupes` : les identifiants des groupes crees, dans l'ordre du dessin. Le choix
 * du modele est celui de l'interface (etape 2) ; le moteur n'en suppose aucun.
 */
export function vectoriserLettresEnGroupes(dessin: DessinSvg, ids: readonly string[], options: OptionsVectorisation = {}): ResultatVectorisation & { readonly groupes: readonly string[] } {
  const voulus = new Set(ids), existants = new Set(dessin.formes.map(f => f.id));
  const noms = new Map(dessin.formes.flatMap(f => (voulus.has(f.id) && f.texte && !f.verrouille ? [[f.id, f.texte.texte] as const] : [])));
  const r = vectoriserTextes(dessin, ids, 'lettres', options);
  // Les lettres d'un texte se suivent dans `ids` : la premiere garde l'identifiant du texte, les autres sont neuves.
  const lots: string[][] = [];
  for (const id of r.ids) {
    if (noms.has(id)) lots.push([id]);
    else if (!existants.has(id)) lots[lots.length - 1]?.push(id);
  }
  let d = r.dessin;
  const groupes: string[] = [];
  for (const lot of lots) {
    const premier = lot[0];
    if (lot.length < 2 || premier === undefined) continue;
    const g = grouper(d, lot, nomGroupeTexte(noms.get(premier) ?? ''));
    if (g.id === null) continue;
    d = g.dessin;
    groupes.push(g.id);
  }
  return { ...r, dessin: d, groupes };
}
