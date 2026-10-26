// Poser des effets depuis l'interface (ADR-0012, etape 8, paquet B ; annexe 6 §6) : un flou et une ombre portee, sur des feuilles et
// des groupes, regles champ par champ. Pur ; rend le MEME dessin quand rien ne change (une frappe qui redonne la meme valeur ne cree
// pas d'entree d'historique). Les bornes sont celles de la lecture (`ecartMax`, `decalageMax` : effets.ts), les nombres au millieme,
// la couleur d'une ombre en #rrggbb minuscule : ce que le projet JSON (`lireEffetsProjet`) et l'ecriture acceptent tels quels. Un flou
// garde toujours un ecart positif (le projet refuse « un flou sans écart ») : le retirer, c'est decocher sa case.
//
// Une transformation qui deforme un flou inegal (une rotation, une inclinaison) le remplace par un flou uniforme d'ecart moyen
// (`ecartsSous`), sans canal pour le dire (le crochet de transformation n'en a pas, etape 7) : `flousApproches` compare deux etats du
// dessin, et l'interface dit la phrase `MSG_EFFETS_OPERATIONS.approche`.

import type { DessinSvg, Effets, Flou, OmbrePortee } from './types.js';
import { unites, verrouilleEffectif } from './arbre.js';
import { decalageMax, ecartMax } from './effets.js';

/** Ce que disent les operations et l'interface des effets (au vouvoiement). */
export const MSG_EFFETS_OPERATIONS = {
  approche: 'Flou approché : la transformation déforme un flou inégal ; il devient uniforme, d’écart moyen.'
} as const;

/** Le plus petit ecart d'un flou : un millieme (un flou nul ne s'ecrit pas, et le projet le refuse). */
export const ECART_FLOU_MIN = 0.001;

/**
 * Un reglage d'effets, champ par champ : un champ absent ne change pas ; `null` retire l'effet ; un objet le pose, en completant
 * l'effet qui existe deja (ou celui par defaut, `flouParDefaut`, `ombreParDefaut`). `ecartY: null` rend un flou uniforme.
 */
export interface ReglageEffets {
  readonly flou?: { readonly ecart?: number; readonly ecartY?: number | null } | null;
  readonly ombre?: Partial<OmbrePortee> | null;
}

type Plan = DessinSvg['vb'];

const milliemes = (v: number): number => Math.round(v * 1000) / 1000;
const borner = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const plusGrand = (vb: Plan): number => Math.max(vb[2], vb[3]);

/** Le flou qu'une case cochee pose : un centieme du plus grand cote du plan, au millieme. */
export const flouParDefaut = (vb: Plan): Flou => ({ ecart: Math.max(ECART_FLOU_MIN, milliemes(plusGrand(vb) / 100)) });

/** L'ombre qu'une case cochee pose : decalee de deux centiemes vers le bas et la droite, floue d'autant, noire a 50 %. */
export function ombreParDefaut(vb: Plan): OmbrePortee {
  const pas = milliemes(plusGrand(vb) / 50);
  return { dx: pas, dy: pas, ecart: pas, couleur: '#000000', opacite: 0.5 };
}

/** Un nombre fini, au millieme, borne ; null pour ce qui n'en est pas un (le champ ne change pas). */
const nombre = (v: number | undefined, min: number, max: number): number | null => (v !== undefined && Number.isFinite(v) ? borner(milliemes(v), min, max) : null);

function reglerFlou(avant: Flou | undefined, r: NonNullable<ReglageEffets['flou']>, vb: Plan): Flou {
  const base = avant ?? flouParDefaut(vb), max = Math.max(ECART_FLOU_MIN, ecartMax(vb));
  const ecart = nombre(r.ecart, ECART_FLOU_MIN, max) ?? base.ecart;
  const ecartY = r.ecartY === null ? undefined : nombre(r.ecartY, ECART_FLOU_MIN, max) ?? base.ecartY;
  return ecartY === undefined || ecartY === ecart ? { ecart } : { ecart, ecartY };
}

function reglerOmbre(avant: OmbrePortee | undefined, r: Partial<OmbrePortee>, vb: Plan): OmbrePortee {
  const base = avant ?? ombreParDefaut(vb), dmax = decalageMax(vb), emax = ecartMax(vb);
  const couleur = r.couleur !== undefined && /^#[0-9a-f]{6}$/i.test(r.couleur) ? r.couleur.toLowerCase() : base.couleur;
  return {
    dx: nombre(r.dx, -dmax, dmax) ?? base.dx,
    dy: nombre(r.dy, -dmax, dmax) ?? base.dy,
    ecart: nombre(r.ecart, 0, emax) ?? base.ecart,
    couleur,
    opacite: nombre(r.opacite, 0, 1) ?? base.opacite
  };
}

const memesFlous = (a: Flou | undefined, b: Flou | undefined): boolean => a === b || (!!a && !!b && a.ecart === b.ecart && a.ecartY === b.ecartY);
const memesOmbres = (a: OmbrePortee | undefined, b: OmbrePortee | undefined): boolean =>
  a === b || (!!a && !!b && a.dx === b.dx && a.dy === b.dy && a.ecart === b.ecart && a.couleur === b.couleur && a.opacite === b.opacite);

/** Les effets d'un noeud apres le reglage ; le MEME objet (ou undefined) quand rien ne change. */
function reglerEffets(e: Effets | undefined, r: ReglageEffets, vb: Plan): Effets | undefined {
  const flou = r.flou === undefined ? e?.flou : r.flou === null ? undefined : reglerFlou(e?.flou, r.flou, vb);
  const ombre = r.ombre === undefined ? e?.ombre : r.ombre === null ? undefined : reglerOmbre(e?.ombre, r.ombre, vb);
  if (memesFlous(flou, e?.flou) && memesOmbres(ombre, e?.ombre)) return e;
  if (!flou && !ombre) return undefined;
  return { ...(flou ? { flou: memesFlous(flou, e?.flou) && e?.flou ? e.flou : flou } : {}), ...(ombre ? { ombre: memesOmbres(ombre, e?.ombre) && e?.ombre ? e.ombre : ombre } : {}) };
}

/** Le noeud avec ses effets nouveaux (le champ part quand il n'en reste aucun). */
function avecEffets<T extends { readonly effets?: Effets }>(x: T, e: Effets | undefined): T {
  if (e === x.effets) return x;
  if (e) return { ...x, effets: e };
  const { effets: _e, ...reste } = x;
  void _e;
  return reste as T;
}

/**
 * Pose un reglage d'effets sur les elements choisis : les racines de la selection (`unites` : un groupe choisi avec ses feuilles ne
 * compte qu'une fois), feuilles (images et textes compris) ou groupes, deverrouillees. Rend le meme dessin quand rien ne change.
 */
export function poserEffets(d: DessinSvg, ids: readonly string[], r: ReglageEffets): DessinSvg {
  const cibles = new Set(unites(d, ids).filter(id => !verrouilleEffectif(d, id)));
  if (!cibles.size) return d;
  let change = false;
  const formes = d.formes.map(f => {
    if (!cibles.has(f.id)) return f;
    const x = avecEffets(f, reglerEffets(f.effets, r, d.vb));
    if (x !== f) change = true;
    return x;
  });
  let groupes = d.groupes;
  if (d.groupes) {
    const table = { ...d.groupes };
    let changeG = false;
    for (const id of cibles) {
      const g = table[id];
      if (!g) continue;
      const x = avecEffets(g, reglerEffets(g.effets, r, d.vb));
      if (x !== g) { table[id] = x; changeG = true; }
    }
    if (changeG) { groupes = table; change = true; }
  }
  if (!change) return d;
  return groupes ? { ...d, formes, groupes } : { ...d, formes };
}

/** Les effets du premier element choisi qui en porte la valeur affichee (l'inspecteur montre ceux du premier). */
export function effetsDe(d: DessinSvg, id: string): Effets | undefined {
  return d.groupes?.[id]?.effets ?? d.formes.find(f => f.id === id)?.effets;
}

// ---------------------------------------------------------------- un flou approche par une transformation

const inegaux = new WeakMap<DessinSvg, ReadonlyMap<string, Flou>>();

/** Les noeuds d'un dessin dont le flou est inegal (deux ecarts differents), par identifiant ; memorise par dessin. */
function flousInegaux(d: DessinSvg): ReadonlyMap<string, Flou> {
  let m = inegaux.get(d);
  if (!m) {
    const t = new Map<string, Flou>();
    for (const f of d.formes) if (f.effets?.flou?.ecartY !== undefined) t.set(f.id, f.effets.flou);
    for (const g of Object.values(d.groupes ?? {})) if (g.effets?.flou?.ecartY !== undefined) t.set(g.id, g.effets.flou);
    m = t;
    inegaux.set(d, m);
  }
  return m;
}

/**
 * Le nombre de noeuds dont le flou inegal d'`avant` est devenu uniforme dans `apres` : ce qu'une transformation qui ne garde pas les
 * axes (rotation, inclinaison) fait d'un flou inegal (`ecartsSous`, l'ecart moyen). Une echelle par axe qui egaliserait les deux ecarts
 * compterait aussi (exacte, elle ; le cas est rare et la phrase reste vraie de ce qu'on voit : le flou est devenu uniforme).
 */
export function flousApproches(avant: DessinSvg, apres: DessinSvg): number {
  if (avant === apres) return 0;
  const a = flousInegaux(avant);
  if (!a.size) return 0;
  let n = 0;
  for (const id of a.keys()) {
    const f = apres.groupes?.[id]?.effets?.flou ?? apres.formes.find(x => x.id === id)?.effets?.flou;
    if (f && f.ecartY === undefined) n++;
  }
  return n;
}
