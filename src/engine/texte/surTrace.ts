// Le texte pose sur le trace d'une forme (ADR-0031) : le contour d'un cercle pour un badge, un arc, une vague, un trace libre. Le
// texte se compose d'abord en ligne droite (`composerEtMesurer` : memes avances, meme crenage, memes ligatures, meme interlettrage),
// puis chaque lettre est posee au point du trace qui correspond au milieu de son avance, tournee selon la tangente en ce point, sans
// etre deformee. Pur et deterministe : la rotation se lit sur la tangente unitaire (aucun sinus ni cosinus).
//
// Le sens et le depart : sur une forme fermee, le texte tourne dans le sens des aiguilles d'une montre a l'exterieur (le haut des
// lettres vers le dehors), dans l'autre sens a l'interieur ; le depart (0) est le point le plus haut a l'exterieur, le plus bas a
// l'interieur, la ou un texte centre se lit droit. Sur un trace ouvert, le texte va de gauche a droite (un trace dessine de droite a
// gauche se lit a rebours) ; dessus, sa ligne de base suit le trace, dessous, le haut des lettres le suit.

import type { Forme, TexteVivant } from '../editionSvg.js';
import { cheminDeGlyphe, composerEtMesurer, type Glyphes, type Lettre } from '../texte.js';
import { transformerChemin } from '../edition/geometrie.js';
import { abscisseExtreme, pointA, ramener, sensHoraire, tangenteA, traceDe, type Pt, type Trace } from './trace.js';
import { unitesDe, type Caret, type Pose } from './pose.js';
import { BAS_CURSEUR, HAUT_CURSEUR } from './curseur.js';
import { au } from '../../util/tableaux.js';

/** Ce qu'un texte sur un trace lit de son texte vivant. */
export type ReglagesSurTrace = Pick<TexteVivant, 'texte' | 'interlettrage' | 'ligatures' | 'alignement'> & { readonly depart: number; readonly cote: 'dessus' | 'dessous'; readonly repartir: boolean };

/** Sous un trace ouvert, la ligne de base descend de la hauteur des capitales (en part de la taille) : le haut des lettres suit le trace. */
export const BAISSE_DESSOUS = 0.72;

/**
 * Le parcours du texte sur le trace : d'ou il part, dans quel sens, et de combien la ligne de base s'ecarte du trace (vers le haut des lettres). Sur
 * une forme fermee, l'origine porte deja le depart ; sur un trace ouvert, c'est le debut du trace, et le depart s'y ajoute.
 */
interface Parcours { readonly tr: Trace; readonly origine: number; readonly sens: 1 | -1; readonly ecart: number }

function parcoursDe(tr: Trace, r: ReglagesSurTrace, taille: number): Parcours {
  if (tr.ferme) {
    const exterieur = r.cote === 'dessus', horaire = sensHoraire(tr);
    // A l'exterieur, dans le sens des aiguilles d'une montre (le haut des lettres, a gauche du sens de lecture, va vers le dehors).
    const sens: 1 | -1 = exterieur ? horaire : horaire === 1 ? -1 : 1;
    return { tr, sens, ecart: 0, origine: abscisseExtreme(tr, exterieur) + sens * r.depart * tr.longueur };
  }
  // Un trace ouvert se lit de gauche a droite : s'il finit a gauche de son depart, on le parcourt a rebours.
  const rebours = (tr.xs[tr.xs.length - 1] ?? 0) < (tr.xs[0] ?? 0);
  const sens: 1 | -1 = rebours ? -1 : 1;
  return { tr, sens, ecart: r.cote === 'dessous' ? -BAISSE_DESSOUS * taille : 0, origine: rebours ? tr.longueur : 0 };
}

/** Le point de la ligne de base et la tangente (sens de lecture) a l'abscisse u du texte. */
function repere(p: Parcours, u: number): { b: Pt; t: Pt } {
  const s = p.origine + p.sens * u, q = pointA(p.tr, s), t0 = tangenteA(p.tr, s), t: Pt = [p.sens * t0[0], p.sens * t0[1]];
  // Le haut des lettres est a gauche du sens de lecture a l'ecran (Y vers le bas) : (ty, -tx).
  return { b: [q[0] + t[1] * p.ecart, q[1] - t[0] * p.ecart], t };
}

/**
 * Le point de depart d'un texte sur ce trace : la ou se pose son point d'alignement (son debut, son milieu ou sa fin). C'est la
 * poignee de la toile. Null pour une forme sans trace.
 */
export function pointDeDepart(base: Forme, r: Pick<ReglagesSurTrace, 'depart' | 'cote'>): Pt | null {
  const tr = traceDe(base.d);
  if (!tr) return null;
  const p = parcoursDe(tr, { texte: '', interlettrage: 0, ligatures: false, alignement: 'gauche', repartir: false, ...r }, 0);
  return pointA(tr, p.origine + p.sens * (tr.ferme ? 0 : r.depart * tr.longueur));
}

/**
 * Le depart qui met le point de depart a l'abscisse s du trace (en part de la longueur, quatre decimales) : ce que fait la poignee
 * de la toile. Sur une forme fermee, il boucle dans [0 ; 1[ ; sur un trace ouvert, il va de 0 (le debut) a 1 (la fin).
 */
export function departVers(base: Forme, r: Pick<ReglagesSurTrace, 'cote'>, s: number): number {
  const tr = traceDe(base.d);
  if (!tr) return 0;
  const p = parcoursDe(tr, { texte: '', interlettrage: 0, ligatures: false, alignement: 'gauche', repartir: false, depart: 0, cote: r.cote }, 0);
  const u = p.sens * (s - p.origine), f = Math.round((tr.ferme ? ramener(tr, u) : Math.min(tr.longueur, Math.max(0, u))) / tr.longueur * 10000) / 10000;
  return tr.ferme && f >= 1 ? 0 : f;
}

/** Vrai si la forme a un trace ferme (son plus long sous-chemin) : le cote s'y dit exterieur ou interieur, le depart y boucle. */
export const traceFerme = (base: Forme): boolean => traceDe(base.d)?.ferme ?? false;

/**
 * Pose un texte sur le trace de sa forme (le plus long sous-chemin), a la taille donnee dans le plan. Les retours a la ligne se
 * lisent comme des espaces (un trace n'a qu'une ligne). Une lettre dont le milieu tombe hors du trace (un trace ouvert trop court,
 * ou une forme fermee dont le texte ferait plus d'un tour) n'est pas dessinee, et se compte dans `depasse`.
 */
export function poserSurTrace(r: ReglagesSurTrace, base: Forme, glyphes: Glyphes, taille: number): Pose {
  const ligne = r.texte.replace(/\n/g, ' '), unites = unitesDe(ligne), cars = [...ligne];
  const tr = traceDe(base.d);
  const comp = composerEtMesurer(ligne, glyphes, { taille, interlettrage: r.interlettrage, ligatures: r.ligatures, x: 0, y: 0 });
  const largeur = comp.groupes.length ? comp.fin - r.interlettrage * taille : 0;
  if (!tr) {
    const c: Caret = [[0, 0], [0, -taille]];
    return { lettres: [], carets: unites.map(() => c), lignes: unites.map(() => 0), taille, ancre: [0, 0], depasse: cars.filter(x => !/\s/.test(x)).length, nonPlaces: 0 };
  }
  const p = parcoursDe(tr, r, taille), L = tr.longueur, n = comp.groupes.length;
  // Repartir : un ecart de plus entre chaque lettre, pour que le texte couvre tout le trace (sur une forme fermee, l'ecart revient
  // aussi entre la derniere et la premiere). Un texte deja plus long que le trace ne se repartit pas : il depasse.
  const plus = !r.repartir || n < 1 ? 0 : tr.ferme ? (L - comp.fin) / n : n > 1 ? (L - largeur) / (n - 1) : 0;
  const extra = plus > 0 ? plus : 0, total = largeur + extra * Math.max(0, n - 1);
  const repartie = r.repartir && plus > 0;
  // Le point d'alignement du texte (son debut, son milieu, sa fin) se pose au depart ; reparti sur un trace ouvert, il le couvre.
  const decalage = r.alignement === 'centre' ? total / 2 : r.alignement === 'droite' ? total : 0;
  const debut = repartie && !tr.ferme ? 0 : (tr.ferme ? 0 : r.depart * L) - decalage;
  const lettres: Lettre[] = [];
  let depasse = 0;
  // L'abscisse (dans le texte) de chaque caractere : le debut de sa glyphe, plus les ecarts de la repartition.
  const xs: number[] = Array.from({ length: unites.length }, () => total);
  comp.groupes.forEach((g, k) => {
    const x = g.x + k * extra;
    for (let j = 0; j < g.n; j++) { const i = g.debut + j; if (i < xs.length - 1) xs[i] = x + (g.avance * j) / g.n; }
    const groupe = cars.slice(g.debut, g.debut + g.n).join('');
    if (/\s/.test(au(cars, g.debut))) return;
    const milieu = x + g.avance / 2;
    // Hors du trace : avant son debut ou apres sa fin (ouvert), au-dela d'un tour (ferme).
    if (tr.ferme ? milieu > L : debut + milieu < 0 || debut + milieu > L) { depasse++; return; }
    const d = cheminDeGlyphe(glyphes.contour(groupe, -g.avance / 2, 0, taille));
    if (!d.some(c => c.c !== 'M' && c.c !== 'Z')) return;
    const { b, t } = repere(p, debut + milieu);
    lettres.push({ caractere: groupe, d: transformerChemin(d, [t[0], t[1], -t[1], t[0], b[0], b[1]]) });
  });
  const carets = unites.map((_, ip) => {
    const { b, t } = repere(p, debut + au(xs, ip));
    const h: Pt = [t[1], -t[0]];
    return [[b[0] - h[0] * BAS_CURSEUR * taille, b[1] - h[1] * BAS_CURSEUR * taille], [b[0] + h[0] * HAUT_CURSEUR * taille, b[1] + h[1] * HAUT_CURSEUR * taille]] as Caret;
  });
  // Les curseurs sont donnes par point de code : on les range par unite UTF-16 (la seconde moitie d'une paire reprend la premiere).
  const parUnite: Caret[] = [];
  unites.forEach((u, ip) => { while (parUnite.length < u) parUnite.push(au(carets, Math.max(0, ip - 1))); parUnite.push(au(carets, ip)); });
  return { lettres, carets: parUnite, lignes: parUnite.map(() => 0), taille, ancre: repere(p, debut).b, depasse, nonPlaces: 0 };
}
