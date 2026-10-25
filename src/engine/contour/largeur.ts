// Un trait de largeur variable (ADR-0038) : le trait d'une forme devient une forme pleine dont la largeur suit un profil, du
// debut au milieu puis a la fin du trace. Une conversion, pas un style : le modele a plat n'a pas de trait a largeur variable
// (il faudrait un profil garde sur la forme et rendu par chaque export, ce que le modele v2 portera, ADR-0012) ; on fait donc ce
// que fait deja « Contour en forme » (ADR-0015), avec une demi-epaisseur qui change le long du trace.
//
// Meme methode que epaissir.ts : le trace aplati est pave de quadrilateres qui partagent EXACTEMENT leurs sommets (le point de
// bord d'un sommet est le meme pour le segment qui y arrive et pour celui qui en part), et l'union (polygon-clipping) etablit le
// bord. Aux vrais coins (et aux virages de plus de trente degres), les segments ont des bords perpendiculaires et une cale ronde
// comble l'exterieur ; l'interieur se recouvre franchement. Le profil se lisse par une courbe en S (u^2 (3 - 2u)), sans
// trigonometrie : le resultat est le meme sur tout moteur.

import type { MultiPolygon, Pair, Ring } from 'polygon-clipping';
import type { DessinSvg, Forme } from '../edition/types.js';
import { prochainId } from '../edition/operations.js';
import { toleranceBooleen } from '../booleens.js';
import { pointsArc, pointsDemiTour } from './arcs.js';
import { polylignesDeChemin, fois, moins, norme, plus, quart, scalaire, unitaire, vectoriel, type Polyligne, type Pt } from './polylignes.js';
import { cheminDeRegionChoisie, unirAnneaux } from './region.js';
import { sansContour, silhouette, toleranceDeForme, MSG_SANS_TRAIT } from './etendre.js';

/** Les largeurs du trait (bord a bord), en unites du plan, a son debut, en son milieu et a sa fin. */
export interface ProfilLargeur { readonly debut: number; readonly milieu: number; readonly fin: number }

/** La largeur au parametre `t` (0 au debut, 1 a la fin, en part de la longueur) : deux courbes en S, du debut au milieu puis a la fin. */
export function largeurA(p: ProfilLargeur, t: number): number {
  const s = (u: number) => u * u * (3 - 2 * u);
  return t <= 0.5 ? p.debut + (p.milieu - p.debut) * s(Math.max(0, t) * 2) : p.milieu + (p.fin - p.milieu) * s((Math.min(1, t) - 0.5) * 2);
}

const anneau = (pts: readonly Pt[]): Ring => pts.map((q): Pair => [q[0], q[1]]);
/** Un virage au-dela duquel les bords ne se partagent plus : cos 30 degres. */
const COS_PARTAGE = Math.sqrt(3) / 2;

/** Les anneaux dont l'union est le trait de la polyligne ouverte, de demi-largeurs `demis` (une par sommet). */
function anneauxVariables(pts: readonly Pt[], coin: readonly boolean[], demis: readonly number[], rond: boolean, tolerance: number): Ring[] {
  const n = pts.length, r: Ring[] = [];
  const dir: Pt[] = [];
  for (let k = 0; k < n - 1; k++) dir.push(unitaire(moins(pts[k + 1] ?? [0, 0], pts[k] ?? [0, 0])));
  // Pour chaque sommet, les points de bord (gauche, droite) du segment qui y arrive et de celui qui en part.
  const arrivee: [Pt, Pt][] = [], depart: [Pt, Pt][] = [];
  for (let k = 0; k < n; k++) {
    const p = pts[k] ?? [0, 0], h = demis[k] ?? 0, d1 = dir[k - 1], d2 = dir[k];
    const bords = (d: Pt): [Pt, Pt] => { const m = fois(quart(d), h); return [plus(p, m), moins(p, m)]; };
    if (!d1 || !d2) { const b = bords(d1 ?? d2 ?? [1, 0]); arrivee.push(b); depart.push(b); continue; }
    const cos = scalaire(d1, d2);
    if (!coin[k] && cos >= COS_PARTAGE) {
      // Un virage doux : un seul point de bord de chaque cote, a l'onglet (h / cos du demi-virage), partage par les deux segments.
      const b = unitaire(plus(d1, d2)), k2 = h / Math.sqrt((1 + cos) / 2), m = fois(quart(b), k2);
      const partage: [Pt, Pt] = [plus(p, m), moins(p, m)];
      arrivee.push(partage); depart.push(partage);
      continue;
    }
    const a = bords(d1), b = bords(d2);
    arrivee.push(a); depart.push(b);
    // La cale ronde, du cote exterieur du virage : du bord du segment qui arrive a celui du segment qui part, autour du sommet.
    const gauche = vectoriel(d1, d2) < 0, u = unitaire(moins(gauche ? a[0] : a[1], p)), v = unitaire(moins(gauche ? b[0] : b[1], p));
    if (h > 0 && norme(u) > 0 && norme(v) > 0) r.push(anneau([p, gauche ? a[0] : a[1], ...pointsArc(p, u, v, h, tolerance), gauche ? b[0] : b[1]]));
  }
  for (let k = 0; k < n - 1; k++) {
    const de = depart[k], a = arrivee[k + 1], p = pts[k], q = pts[k + 1];
    // Un bord perpendiculaire passe par le sommet : on l'y coupe, pour que la cale partage exactement son arete.
    if (de && a && p && q) r.push(anneau([de[0], a[0], ...(a === depart[k + 1] ? [] : [q]), a[1], de[1], ...(de === arrivee[k] ? [] : [p])]));
  }
  if (rond) {
    const p0 = pts[0], d0 = dir[0], b0 = depart[0], p1 = pts[n - 1], d1 = dir[n - 2], b1 = arrivee[n - 1];
    if (p0 && d0 && b0 && (demis[0] ?? 0) > 0) r.push(anneau([b0[1], ...pointsDemiTour(p0, fois(quart(d0), -1), fois(d0, -1), demis[0] ?? 0, tolerance), b0[0]]));
    if (p1 && d1 && b1 && (demis[n - 1] ?? 0) > 0) r.push(anneau([b1[0], ...pointsDemiTour(p1, quart(d1), d1, demis[n - 1] ?? 0, tolerance), b1[1]]));
  }
  return r;
}

/** Le nombre de pas du profil le long d'un trace : un segment plus long que sa part est recoupe, pour que la largeur y varie. */
const PAS_PROFIL = 96;

/**
 * La polyligne ouverte d'un trace (un trace ferme s'ouvre a son depart, ses bouts arrondis s'y rejoignent), recoupee pour qu'aucun
 * segment ne depasse un 96e de la longueur (une droite n'aurait sinon que ses deux bouts pour porter le profil), et ses longueurs
 * cumulees. Les points ajoutes sont sur le trace, alignes : ils ne sont pas des coins.
 */
function deroule(l: Polyligne): { pts: Pt[]; coin: boolean[]; abscisses: number[] } {
  const bruts = [...l.pts], coinsBruts = [...l.coin];
  if (l.ferme && bruts[0]) { bruts.push(bruts[0]); coinsBruts.push(true); coinsBruts[0] = true; }
  let total = 0;
  for (let k = 1; k < bruts.length; k++) total += norme(moins(bruts[k] ?? [0, 0], bruts[k - 1] ?? [0, 0]));
  const pas = total / PAS_PROFIL, pts: Pt[] = [], coin: boolean[] = [];
  bruts.forEach((p, k) => {
    const avant = bruts[k - 1];
    if (avant && pas > 0) {
      const v = moins(p, avant), parts = Math.ceil(norme(v) / pas - 1e-9);
      for (let i = 1; i < parts; i++) { pts.push(plus(avant, fois(v, i / parts))); coin.push(false); }
    }
    pts.push(p); coin.push(coinsBruts[k] ?? false);
  });
  const abscisses = [0];
  for (let k = 1; k < pts.length; k++) abscisses.push((abscisses[k - 1] ?? 0) + norme(moins(pts[k] ?? [0, 0], pts[k - 1] ?? [0, 0])));
  return { pts, coin, abscisses };
}

/** La region peinte par le trait de largeur variable d'une forme, ou le refus dit. */
export function regionLargeurVariable(f: Forme, profil: ProfilLargeur, tolerance: number): MultiPolygon | { erreur: string } {
  if (!f.contour || !(f.epaisseur > 0)) return { erreur: MSG_SANS_TRAIT };
  // Une largeur nulle laisserait des anneaux plats : un rien d'epaisseur, sous la tolerance, garde le bout pointu et sain.
  const plancher = tolerance * 2;
  for (const facteur of [1, 3, 9]) {
    const tol = tolerance * facteur;
    const anneaux: Ring[] = [];
    for (const l of polylignesDeChemin(f.d, tol)) {
      const { pts, coin, abscisses } = deroule(l);
      const total = abscisses[abscisses.length - 1] ?? 0;
      if (pts.length < 2 || !(total > 0)) continue;
      const demis = abscisses.map(s => Math.max(plancher, largeurA(profil, s / total)) / 2);
      anneaux.push(...anneauxVariables(pts, coin, demis, f.bout === 'round' || l.ferme, tol));
    }
    if (!anneaux.length) return { erreur: 'Ce tracé n’a pas de longueur : il n’y a rien à élargir.' };
    try {
      return unirAnneaux(anneaux);
    } catch { /* un autre aplatissement defait souvent l'incidence qui a fait echouer le balayage (ADR-0015) */ }
  }
  return { erreur: 'Le tracé est trop enchevêtré pour une largeur variable : simplifiez-le, puis recommencez.' };
}

/** Un profil sain : trois largeurs finies, positives ou nulles, dont l'une au moins est positive. */
export const profilValide = (p: ProfilLargeur): boolean =>
  [p.debut, p.milieu, p.fin].every(v => Number.isFinite(v) && v >= 0) && Math.max(p.debut, p.milieu, p.fin) > 0;

export interface ResultatLargeur {
  readonly dessin: DessinSvg;
  readonly ids: readonly string[];
  /** Les formes dont le trait est devenu une surface. */
  readonly elargis: number;
  readonly ignorees: number;
  readonly erreur?: string;
}

/**
 * Le trait des formes choisies devient une surface de largeur variable, couleur du trait en fond, courbes rebaties. Comme pour
 * « Contour en forme » : une forme sans fond devient sa silhouette, une forme avec un fond le garde et la silhouette se pose dessus.
 */
export function largeurVariable(dessin: DessinSvg, ids: readonly string[], profil: ProfilLargeur): ResultatLargeur {
  if (!profilValide(profil)) return { dessin, ids: [], elargis: 0, ignorees: 0, erreur: 'Donnez trois largeurs positives ou nulles, dont l’une au moins est positive.' };
  const voulus = new Set(ids);
  let n = prochainId(dessin), elargis = 0, ignorees = 0, erreur: string | undefined;
  const nouveaux: string[] = [];
  const formes = dessin.formes.flatMap((f): Forme[] => {
    if (!voulus.has(f.id) || f.verrouille || !f.visible) return [f];
    const tolerance = Math.min(toleranceBooleen(dessin), toleranceDeForme(f) * 4);
    const region = regionLargeurVariable(f, profil, tolerance);
    if ('erreur' in region) { ignorees++; erreur ??= region.erreur; return [f]; }
    elargis++;
    const seule = f.remplissage === null, id = seule ? f.id : 'f' + n++;
    nouveaux.push(id);
    const s = silhouette(f, id, cheminDeRegionChoisie(region, true, tolerance));
    return seule ? [s] : [sansContour(f), s];
  });
  if (!elargis) return { dessin, ids: [], elargis, ignorees, ...(erreur ? { erreur } : {}) };
  return { dessin: { ...dessin, formes }, ids: nouveaux, elargis, ignorees };
}
