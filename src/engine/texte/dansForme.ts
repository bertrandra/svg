// Le texte pose dans une forme fermee (ADR-0031) : il en remplit l'interieur. Chaque ligne est coupee sur les bords de la forme :
// la largeur disponible se calcule sur toute la hauteur de la ligne (du haut du cadratin au bas des jambages, plus la marge), les
// trous et les creux respectes (une ligne peut avoir plusieurs morceaux, qu'on remplit de gauche a droite). Les mots se renvoient a
// la ligne ; un retour tape commence un paragraphe. Les lignes partent du haut de la forme, d'un interligne a l'autre.
//
// Les bords sont ceux des polygones du trace (trace.ts : chaque courbe en cordes, chaque sous-chemin ferme comme un remplissage,
// regle non nulle ou pair-impair de la forme). Sur une bande horizontale, les bords d'un polygone sont des droites entre ses
// sommets : l'interieur commun a toute la bande se lit donc exactement aux deux bords de la bande et a la hauteur de chaque sommet
// qui tombe dedans. Pur et deterministe.

import type { Forme, TexteVivant } from '../editionSvg.js';
import { cheminDeGlyphe, composerEtMesurer, type Glyphes, type GroupeCompose, type Lettre } from '../texte.js';
import { au } from '../../util/tableaux.js';
import { polygonesDe, type Pt } from './trace.js';
import { unitesDe, type Caret, type Pose } from './pose.js';
import { BAS_CURSEUR, HAUT_CURSEUR } from './curseur.js';

/** Ce qu'un texte dans une forme lit de son texte vivant. */
export type ReglagesDansForme = Pick<TexteVivant, 'texte' | 'interlettrage' | 'interligne' | 'ligatures' | 'alignement'> & { readonly marge: number; readonly justifier: boolean };

export type Intervalle = readonly [number, number];

/** Les morceaux d'une horizontale y a l'interieur des polygones, de gauche a droite, selon la regle de remplissage. */
export function intervallesA(polys: readonly (readonly Pt[])[], regle: Forme['regle'], y: number): Intervalle[] {
  const coupes: Array<readonly [number, number]> = [];
  for (const p of polys) {
    for (let i = 0; i < p.length; i++) {
      const a = au(p, i), b = au(p, (i + 1) % p.length);
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) coupes.push([a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), b[1] > a[1] ? 1 : -1]);
    }
  }
  coupes.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const r: Intervalle[] = [];
  let w = 0, debut = 0;
  for (const [x, s] of coupes) {
    const avant = regle === 'evenodd' ? w & 1 : w;
    w += regle === 'evenodd' ? 1 : s;
    const apres = regle === 'evenodd' ? w & 1 : w;
    if (avant === 0 && apres !== 0) debut = x;
    else if (avant !== 0 && apres === 0 && x > debut) r.push([debut, x]);
  }
  return r;
}

/** Ce que deux listes de morceaux ont en commun. */
function croiser(a: readonly Intervalle[], b: readonly Intervalle[]): Intervalle[] {
  const r: Intervalle[] = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const x = au(a, i), y = au(b, j), g = Math.max(x[0], y[0]), d = Math.min(x[1], y[1]);
    if (d > g) r.push([g, d]);
    if (x[1] < y[1]) i++; else j++;
  }
  return r;
}

/**
 * Les largeurs disponibles sur une bande horizontale [haut ; bas] : ce qui est a l'interieur de la forme sur toute la hauteur de la
 * bande, puis retreci de la marge a gauche et a droite. Les morceaux trop etroits pour rien (largeur nulle) disparaissent.
 */
export function largeursDisponibles(polys: readonly (readonly Pt[])[], regle: Forme['regle'], haut: number, bas: number, marge = 0): Intervalle[] {
  const ys = [haut, bas];
  for (const p of polys) for (const q of p) if (q[1] > haut && q[1] < bas) ys.push(q[1]);
  let r = intervallesA(polys, regle, haut);
  for (let k = 1; k < ys.length && r.length; k++) r = croiser(r, intervallesA(polys, regle, au(ys, k)));
  return r.map(([a, b]): Intervalle => [a + marge, b - marge]).filter(([a, b]) => b > a);
}

/** Un mot : ses points de code [debut ; fin[ dans le texte, et son paragraphe. */
interface Mot { readonly debut: number; readonly fin: number; readonly para: number }

/** Une ligne posee : ses points de code, son origine, sa ligne de base, l'ecart ajoute a chaque blanc (justifie), sa composition. */
interface LignePosee { readonly a: number; readonly b: number; readonly x: number; readonly y: number; readonly plus: number; readonly groupes: readonly GroupeCompose[]; readonly fin: number }

/** La boite des polygones. */
function boite(polys: readonly (readonly Pt[])[]): { x0: number; y0: number; x1: number; y1: number } | null {
  const pts = polys.flat();
  if (!pts.length) return null;
  return { x0: Math.min(...pts.map(p => p[0])), y0: Math.min(...pts.map(p => p[1])), x1: Math.max(...pts.map(p => p[0])), y1: Math.max(...pts.map(p => p[1])) };
}

/** Les mots du texte, par points de code, un paragraphe par ligne tapee. */
function motsDe(cars: readonly string[]): Mot[] {
  const r: Mot[] = [];
  let para = 0, debut = -1;
  cars.forEach((c, i) => {
    const blanc = /\s/.test(c);
    if (!blanc && debut < 0) debut = i;
    if (blanc && debut >= 0) { r.push({ debut, fin: i, para }); debut = -1; }
    if (c === '\n') para++;
  });
  if (debut >= 0) r.push({ debut, fin: cars.length, para });
  return r;
}

/** Les lignes posees dans la forme, et combien de mots n'y tiennent pas. */
function couper(r: ReglagesDansForme, polys: readonly (readonly Pt[])[], regle: Forme['regle'], glyphes: Glyphes, taille: number): { lignes: LignePosee[]; mots: Mot[]; places: number; b: ReturnType<typeof boite> } {
  const cars = [...r.texte], mots = motsDe(cars), b = boite(polys), lignes: LignePosee[] = [];
  if (!b) return { lignes, mots, places: 0, b };
  const m = r.marge * taille, pas = r.interligne * taille;
  const options = { taille, interlettrage: r.interlettrage, ligatures: r.ligatures, x: 0, y: 0 };
  const composer = (a: number, z: number) => composerEtMesurer(cars.slice(a, z).join(''), glyphes, options);
  const largeur = (c: ReturnType<typeof composer>) => (c.groupes.length ? c.fin - r.interlettrage * taille : 0);
  let w = 0, para = 0, y = b.y0 + m + HAUT_CURSEUR * taille;
  // Borne : une ligne par interligne sur la hauteur de la forme, jamais plus.
  for (let garde = 0; w < mots.length && y + BAS_CURSEUR * taille + m <= b.y1 + 1e-9 && garde < 100_000; garde++, y += pas) {
    // Un paragraphe neuf commence a la ligne ; un paragraphe vide (deux retours) en prend une.
    const prochain = au(mots, w).para;
    if (prochain > para && lignes.length) { para++; if (prochain > para) continue; }
    para = prochain;
    for (const [x0, x1] of largeursDisponibles(polys, regle, y - HAUT_CURSEUR * taille - m, y + BAS_CURSEUR * taille + m, m)) {
      if (w >= mots.length || au(mots, w).para !== para) break;
      let k = w, c = composer(au(mots, w).debut, au(mots, w).fin);
      if (largeur(c) > x1 - x0 + 1e-9) continue;
      while (k + 1 < mots.length && au(mots, k + 1).para === para) {
        const e = composer(au(mots, w).debut, au(mots, k + 1).fin);
        if (largeur(e) > x1 - x0 + 1e-9) break;
        k++; c = e;
      }
      const l = largeur(c), finPara = k + 1 >= mots.length || au(mots, k + 1).para !== para, blancs = k - w;
      const libre = x1 - x0 - l;
      const plus = r.justifier && !finPara && blancs > 0 ? libre / blancs : 0;
      const x = plus > 0 || r.alignement === 'gauche' ? x0 : r.alignement === 'centre' ? x0 + libre / 2 : x1 - l;
      lignes.push({ a: au(mots, w).debut, b: au(mots, k).fin, x, y, plus, groupes: c.groupes, fin: l });
      w = k + 1;
      if (finPara) break;
    }
  }
  return { lignes, mots, places: w, b };
}

/** Combien de blancs entre mots precedent ce point de code dans la ligne (l'ecart d'une ligne justifiee s'y ajoute). */
function blancsAvant(cars: readonly string[], a: number, i: number): number {
  let n = 0;
  for (let k = a + 1; k <= i && k < cars.length; k++) if (!/\s/.test(au(cars, k)) && /\s/.test(au(cars, k - 1))) n++;
  return n;
}

/**
 * Pose un texte dans sa forme, a la taille donnee dans le plan. Les mots qui ne tiennent pas (la forme est pleine, ou un mot est plus
 * large que tout morceau de ligne) ne sont pas dessines et se comptent dans `nonPlaces` ; le texte ne saute jamais un mot.
 */
export function poserDansForme(r: ReglagesDansForme, base: Forme, glyphes: Glyphes, taille: number): Pose {
  const cars = [...r.texte], polys = polygonesDe(base.d), unites = unitesDe(r.texte);
  const { lignes, mots, places, b } = couper(r, polys, base.regle, glyphes, taille);
  const lettres: Lettre[] = [];
  const caret = (x: number, y: number): Caret => [[x, y + BAS_CURSEUR * taille], [x, y - HAUT_CURSEUR * taille]];
  const debutVide = b ? caret(b.x0 + r.marge * taille, b.y0 + r.marge * taille + HAUT_CURSEUR * taille) : caret(0, 0);
  const carets: Caret[] = Array.from({ length: cars.length + 1 }, () => debutVide), numeros: number[] = carets.map(() => 0);
  let suite = 0;
  lignes.forEach((l, n) => {
    const debut = caret(l.x, l.y);
    // Les blancs et retours avant la ligne : au bout de la precedente (ou au debut de celle-ci pour la premiere).
    for (let i = suite; i < l.a; i++) { carets[i] = n ? au(carets, Math.max(0, i - 1)) : debut; numeros[i] = Math.max(0, n - 1); }
    for (const g of l.groupes) {
      const decal = l.plus * blancsAvant(cars, l.a, l.a + g.debut);
      for (let j = 0; j < g.n; j++) { const i = l.a + g.debut + j; carets[i] = caret(l.x + g.x + decal + (g.avance * j) / g.n, l.y); numeros[i] = n; }
      const groupe = cars.slice(l.a + g.debut, l.a + g.debut + g.n).join('');
      if (/\s/.test(au(cars, l.a + g.debut))) continue;
      const d = cheminDeGlyphe(glyphes.contour(groupe, l.x + g.x + decal, l.y, taille));
      if (d.some(c => c.c !== 'M' && c.c !== 'Z')) lettres.push({ caractere: groupe, d });
    }
    carets[l.b] = caret(l.x + l.fin + l.plus * blancsAvant(cars, l.a, l.b - 1), l.y);
    numeros[l.b] = n;
    suite = l.b + 1;
  });
  const dernier = lignes.length ? au(carets, au(lignes, lignes.length - 1).b) : debutVide;
  for (let i = suite; i <= cars.length; i++) { carets[i] = dernier; numeros[i] = Math.max(0, lignes.length - 1); }
  // Par unite UTF-16 : la seconde moitie d'une paire reprend le curseur de la premiere.
  const parUnite: Caret[] = [], lignesUnite: number[] = [];
  unites.forEach((u, ip) => { while (parUnite.length < u) { parUnite.push(au(carets, Math.max(0, ip - 1))); lignesUnite.push(au(numeros, Math.max(0, ip - 1))); } parUnite.push(au(carets, ip)); lignesUnite.push(au(numeros, ip)); });
  const premiere = lignes[0];
  return {
    lettres, carets: parUnite, lignes: lignesUnite, taille, ancre: premiere ? [premiere.x, premiere.y] : debutVide[0],
    depasse: 0, nonPlaces: mots.length - places
  };
}

/** Le nombre de mots qui ne tiennent pas a cette taille. */
export function motsHorsForme(r: ReglagesDansForme, base: Forme, glyphes: Glyphes, taille: number): number {
  const c = couper(r, polygonesDe(base.d), base.regle, glyphes, taille);
  return c.mots.length - c.places;
}

/** Les pas de la recherche de la taille : la moitie de l'intervalle a chaque fois, assez pour un millionieme de la hauteur. */
const PAS_RECHERCHE = 24;

/**
 * La plus grande taille de texte (en unites de composition, au centieme, vers le bas) a laquelle tout le texte tient dans la forme,
 * la taille dans le plan etant celle-ci fois `echelle`. Dichotomie bornee (PAS_RECHERCHE pas) entre zero et la hauteur de la forme,
 * puis le centieme verifie (quatre centiemes de moins au plus). 0,01 si rien ne tient a aucune taille ; deterministe.
 */
export function tailleQuiTient(r: ReglagesDansForme, base: Forme, glyphes: Glyphes, echelle = 1): number {
  const polys = polygonesDe(base.d), b = boite(polys), total = motsDe([...r.texte]).length;
  if (!b || !(echelle > 0)) return 0.01;
  const tient = (plan: number) => plan > 0 && couper(r, polys, base.regle, glyphes, plan).places === total;
  const haut = b.y1 - b.y0;
  let bas = 0;
  if (tient(haut)) bas = haut;
  else {
    let h = haut;
    for (let k = 0; k < PAS_RECHERCHE; k++) { const m = (bas + h) / 2; if (tient(m)) bas = m; else h = m; }
  }
  let t = Math.floor((bas / echelle) * 100) / 100;
  for (let k = 0; k < 4 && t > 0.01 && !tient(t * echelle); k++) t = Math.round((t - 0.01) * 100) / 100;
  return Math.max(0.01, t);
}
