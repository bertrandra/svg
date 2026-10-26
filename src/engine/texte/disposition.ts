// Un texte vivant pose sur ou dans une forme (ADR-0031) : sa composition, et ce qui le garde lie a sa forme. Le texte reste vivant
// (ADR-0022) et garde l'identifiant de sa forme ; quand la forme change, le texte se recompose sur elle ; quand elle disparait, il
// redevient un texte libre, compose en ligne droite a son point d'ancrage. Le moteur ne charge aucune fonte : l'interface lui donne
// les glyphes d'une police (`glyphesDe`), qu'elle a chargees cote io/.
//
// La taille d'un texte pose dans le plan est sa taille fois l'echelle de sa matrice (une transformation affine du texte et de sa
// forme l'agrandit avec elle) ; la matrice garde le reste de son repere et prend pour origine le debut du texte pose. Memorise par
// forme et par fonte (ADR-0008) : un geste qui ne change ni la forme ni le texte ne recompose rien.

import type { Chemin, DessinSvg, Forme, Matrice, PoliceTexte, TexteVivant } from '../editionSvg.js';
import { facteur } from '../edition/geometrie.js';
import { sansDisposition } from '../edition/texteVivant.js';
import type { Glyphes } from '../texte.js';
import { cheminDuTexte, glyphesDuTexte } from './bloc.js';
import { poserSurTrace } from './surTrace.js';
import { poserDansForme, tailleQuiTient } from './dansForme.js';
import { poserEnveloppe, tailleEnveloppe } from './enveloppe.js';
import type { Pose } from './pose.js';

/** Le texte pose : ses contours, le texte vivant mis a jour (taille ajustee, matrice ancree), et sa pose (curseurs, depassement). */
export interface TexteDispose { readonly texte: TexteVivant; readonly d: Chemin; readonly pose: Pose }

const arrondi = (v: number): number => Number(v.toFixed(3));

/** Ce qui compose un texte pose (tout sauf la matrice d'ancrage, que la composition recalcule) : la cle de la memoire. */
const cleDe = (t: TexteVivant): string => JSON.stringify([t.texte, t.taille, t.interlettrage, t.interligne, t.alignement, t.ligatures, t.trace ?? '', t.disposition, facteur(t.matrice), t.matrice.slice(0, 4)]);

const memoire = new WeakMap<Forme, WeakMap<Glyphes, Map<string, TexteDispose>>>();
const MEMOIRE_MAX = 24;

/** La forme peut-elle porter un texte : ni un texte elle-meme, ni le texte qu'elle porterait, et un trace a elle. */
export const peutPorter = (base: Forme | undefined, idTexte: string): base is Forme => !!base && !base.texte && base.id !== idTexte && base.d.some(c => c.c !== 'M' && c.c !== 'Z');

/**
 * Compose un texte pose sur sa forme avec les glyphes de sa police (sa ligne au milieu du trait, en trace median). Dans une forme,
 * « ajuster » prend d'abord la plus grande taille qui tient. Le texte rendu garde tout, sa matrice ancree au debut du texte pose.
 */
export function composerDispose(t: TexteVivant, base: Forme, glyphes: Glyphes): TexteDispose {
  const p = t.disposition;
  const g = glyphesDuTexte(t, glyphes);
  let parFonte = memoire.get(base);
  if (!parFonte) { parFonte = new WeakMap(); memoire.set(base, parFonte); }
  let cache = parFonte.get(g);
  if (!cache) { cache = new Map(); parFonte.set(g, cache); }
  const cle = cleDe(t), deja = cache.get(cle);
  if (deja) return { ...deja, texte: { ...deja.texte, matrice: ancrer(t.matrice, deja.pose) } };
  const echelle = facteur(t.matrice) || 1;
  // Dans une forme a taille ajustee, la plus grande taille qui tient ; deforme (ADR-0032), la hauteur de la forme sur celle du bloc,
  // mesuree sur les lettres pleines (le trace median se deforme dans la meme boite).
  const taille = p?.mode === 'dans' && p.ajuster ? tailleQuiTient({ ...t, marge: p.marge, justifier: p.justifier }, base, g, echelle)
    : p?.mode === 'enveloppe' ? tailleEnveloppe({ ...t, marge: p.marge }, base, glyphes, echelle) : t.taille;
  const plan = taille * echelle;
  const pose: Pose = !p ? { lettres: [], carets: [], lignes: [], taille: plan, ancre: [t.matrice[4], t.matrice[5]], depasse: 0, nonPlaces: 0 }
    : p.mode === 'sur' ? poserSurTrace({ ...t, depart: p.depart, cote: p.cote, repartir: p.repartir }, base, g, plan)
      : p.mode === 'dans' ? poserDansForme({ ...t, marge: p.marge, justifier: p.justifier }, base, g, plan)
        : poserEnveloppe({ ...t, marge: p.marge }, base, glyphes, g, plan);
  const r: TexteDispose = { texte: { ...t, taille, matrice: ancrer(t.matrice, pose) }, d: pose.lettres.flatMap(l => l.d), pose };
  if (cache.size >= MEMOIRE_MAX) cache.clear();
  cache.set(cle, r);
  return r;
}

/** La matrice d'un texte pose : son repere (echelle, et ce qu'il porte de rotation ou de miroir) a l'origine du texte pose. */
const ancrer = (m: Matrice, pose: Pose): Matrice => [m[0], m[1], m[2], m[3], arrondi(pose.ancre[0]), arrondi(pose.ancre[1])];

/** Le texte pose d'une forme du dessin, ou null : texte libre, forme absente, ou forme qui ne peut pas le porter. */
export function texteDispose(dessin: DessinSvg, f: Forme, glyphes: Glyphes): TexteDispose | null {
  const p = f.texte?.disposition;
  const base = p ? dessin.formes.find(x => x.id === p.forme) : undefined;
  return f.texte && p && peutPorter(base, f.id) ? composerDispose(f.texte, base, glyphes) : null;
}

/**
 * Les contours d'un texte vivant dans ce dessin, et le texte tel qu'il se pose : sur ou dans sa forme s'il en a une, en ligne droite
 * sinon (et sans disposition si sa forme n'existe plus).
 */
export function composerDansDessin(dessin: DessinSvg, id: string, t: TexteVivant, glyphes: Glyphes): { texte: TexteVivant; d: Chemin; pose: Pose | null } {
  const p = t.disposition;
  const base = p ? dessin.formes.find(x => x.id === p.forme) : undefined;
  if (p && peutPorter(base, id)) { const r = composerDispose(t, base, glyphes); return { texte: r.texte, d: r.d, pose: r.pose }; }
  const libre = sansDisposition(t);
  return { texte: libre, d: cheminDuTexte(libre, glyphes), pose: null };
}

const dessineQuelqueChose = (d: Chemin): boolean => d.some(c => c.c !== 'M' && c.c !== 'Z');

/**
 * Garde les textes poses lies a leur forme apres une operation (ADR-0031), comme `garderTextes` garde les textes vivants : un texte
 * dont la forme a change de trace (ou qui est nouveau, une copie) se recompose sur elle ; un texte dont la forme a disparu (ou ne peut
 * plus le porter) redevient libre, recompose en ligne droite. Sans les glyphes de sa police (pas encore chargees), un texte garde
 * ses contours : il se recomposera au geste suivant. Un texte qui ne dessinerait plus rien (tout depasse) garde aussi ses contours.
 * Rend `apres` lui-meme quand rien ne change, les textes devenus libres et ceux qui attendent leur fonte.
 */
export function suivreDispositions(avant: DessinSvg, apres: DessinSvg, glyphesDe: (p: PoliceTexte) => Glyphes | null): { dessin: DessinSvg; libres: string[]; attente: string[] } {
  if (avant === apres || !apres.formes.some(f => f.texte?.disposition)) return { dessin: apres, libres: [], attente: [] };
  const avantParId = new Map(avant.formes.map(f => [f.id, f])), parId = new Map(apres.formes.map(f => [f.id, f]));
  const libres: string[] = [], attente: string[] = [];
  let change = false;
  const formes = apres.formes.map(f => {
    const t = f.texte, p = t?.disposition;
    if (!t || !p) return f;
    const base = parId.get(p.forme), fa = avantParId.get(f.id), ba = avantParId.get(p.forme);
    const g = glyphesDe(t.police);
    if (!peutPorter(base, f.id)) {
      libres.push(f.id);
      change = true;
      const libre = sansDisposition(t), d = g ? cheminDuTexte(libre, g) : f.d;
      return { ...f, texte: libre, d: dessineQuelqueChose(d) ? d : f.d };
    }
    const bouge = !fa || !ba || ba.d !== base.d || ba.regle !== base.regle || fa.texte?.disposition?.forme !== p.forme || fa.texte.matrice !== t.matrice;
    if (!bouge) return f;
    if (!g) { attente.push(f.id); return f; }
    const r = composerDispose(t, base, g);
    if (!dessineQuelqueChose(r.d)) return f;
    change = true;
    return { ...f, texte: r.texte, d: r.d };
  });
  return { dessin: change ? { ...apres, formes } : apres, libres, attente };
}

/** Les textes poses sur (ou dans) cette forme, dans l'ordre du dessin. */
export const textesPortesPar = (dessin: DessinSvg, id: string): Forme[] => dessin.formes.filter(f => f.texte?.disposition?.forme === id);
