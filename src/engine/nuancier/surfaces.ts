// Ce qu'une couleur couvre sur le plan (ADR-0037) : l'aire d'un remplissage et la longueur d'un trait, calculees sur le chemin
// absolu du modele (ADR-0001 : M, L, C, Q, Z, deja dans les coordonnees du plan, sans transformation a appliquer).
//
// L'aire se lit par la formule de Green, segment par segment : exacte pour un segment droit, et exacte aussi pour une courbe
// quadratique ou cubique par une quadrature de Gauss-Legendre a trois points (l'integrande x.y' - y.x' d'une cubique est un
// polynome de degre 5, que trois points integrent sans erreur). La longueur d'une courbe n'a pas de forme close : cinq points de
// Gauss par segment, assez pour ranger des couleurs. Pur, deterministe, sans tolerance a regler.

import type { Chemin, Commande } from '../edition/types.js';

type Pt = readonly [number, number];

// Gauss-Legendre ramene a [0, 1] : abscisses et poids.
const G3: ReadonlyArray<readonly [number, number]> = [[0.5 - Math.sqrt(0.15), 5 / 18], [0.5, 4 / 9], [0.5 + Math.sqrt(0.15), 5 / 18]];
const G5: ReadonlyArray<readonly [number, number]> = (() => {
  const a = Math.sqrt(5 - 2 * Math.sqrt(10 / 7)) / 3, b = Math.sqrt(5 + 2 * Math.sqrt(10 / 7)) / 3;
  const wa = (322 + 13 * Math.sqrt(70)) / 900, wb = (322 - 13 * Math.sqrt(70)) / 900;
  return [[0.5 - b / 2, wb / 2], [0.5 - a / 2, wa / 2], [0.5, 128 / 450], [0.5 + a / 2, wa / 2], [0.5 + b / 2, wb / 2]];
})();

/** Un segment : ses points de controle, de deux (droit) a quatre (cubique). */
type Segment = readonly Pt[];

/** Le point et la derivee d'un segment de Bezier en t. */
function evaluer(s: Segment, t: number): [number, number, number, number] {
  const u = 1 - t;
  const [p0, p1, p2, p3] = s;
  if (!p0 || !p1) return [0, 0, 0, 0];
  if (!p2) return [u * p0[0] + t * p1[0], u * p0[1] + t * p1[1], p1[0] - p0[0], p1[1] - p0[1]];
  if (!p3) {
    return [
      u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
      2 * (u * (p1[0] - p0[0]) + t * (p2[0] - p1[0])), 2 * (u * (p1[1] - p0[1]) + t * (p2[1] - p1[1]))
    ];
  }
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    3 * (u * u * (p1[0] - p0[0]) + 2 * u * t * (p2[0] - p1[0]) + t * t * (p3[0] - p2[0])),
    3 * (u * u * (p1[1] - p0[1]) + 2 * u * t * (p2[1] - p1[1]) + t * t * (p3[1] - p2[1]))
  ];
}

/** La part d'un segment dans l'aire signee de son contour : la moitie de l'integrale de x.dy - y.dx. */
function aireSegment(s: Segment): number {
  const [p0, p1] = s;
  if (!p0 || !p1) return 0;
  if (s.length === 2) return (p0[0] * p1[1] - p1[0] * p0[1]) / 2;
  let a = 0;
  for (const [t, w] of G3) { const [x, y, dx, dy] = evaluer(s, t); a += w * (x * dy - y * dx); }
  return a / 2;
}

function longueurSegment(s: Segment): number {
  if (s.length === 2) { const [p0, p1] = s; return p0 && p1 ? Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) : 0; }
  let l = 0;
  for (const [t, w] of G5) { const [, , dx, dy] = evaluer(s, t); l += w * Math.hypot(dx, dy); }
  return l;
}

/** Un sous-chemin : ses segments (la fermeture comprise quand il est ferme), et s'il l'etait. */
interface SousChemin { segments: Segment[]; ferme: boolean }

const pt = (c: Commande, i: number): Pt => [c.p[i] ?? 0, c.p[i + 1] ?? 0];

function sousChemins(d: Chemin): SousChemin[] {
  const sortie: SousChemin[] = [];
  let courant: SousChemin | null = null, depart: Pt = [0, 0], ici: Pt = [0, 0];
  for (const c of d) {
    if (c.c === 'M') { ici = depart = pt(c, 0); courant = { segments: [], ferme: false }; sortie.push(courant); continue; }
    if (!courant) { courant = { segments: [], ferme: false }; sortie.push(courant); }
    if (c.c === 'Z') {
      if (ici[0] !== depart[0] || ici[1] !== depart[1]) courant.segments.push([ici, depart]);
      courant.ferme = true;
      ici = depart;
      continue;
    }
    const s: Segment = c.c === 'L' ? [ici, pt(c, 0)] : c.c === 'Q' ? [ici, pt(c, 0), pt(c, 2)] : [ici, pt(c, 0), pt(c, 2), pt(c, 4)];
    courant.segments.push(s);
    ici = s[s.length - 1] ?? ici;
  }
  return sortie;
}

/** La longueur du trace d'un chemin : chaque segment, fermetures comprises (un trait les dessine). */
export function longueurDeChemin(d: Chemin): number {
  let l = 0;
  for (const s of sousChemins(d)) for (const seg of s.segments) l += longueurSegment(seg);
  return l;
}

interface Boucle { aire: number; boite: readonly [number, number, number, number] }

/** La boite des points de controle : elle contient la courbe, et suffit a dire qu'une boucle en entoure une autre. */
function boiteDe(segments: readonly Segment[]): readonly [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of segments) for (const [x, y] of s) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}

const contient = (a: Boucle['boite'], b: Boucle['boite']) => a[0] <= b[0] && a[1] <= b[1] && a[2] >= b[2] && a[3] >= b[3];

/**
 * L'aire peinte par le remplissage d'un chemin. Chaque sous-chemin est une boucle (un remplissage ferme ce qui ne l'est pas) ;
 * une boucle comprise dans une plus grande est un trou ou un ilot selon la regle : en pair-impair, la profondeur d'emboitement
 * decide ; selon le sens du trace, une boucle de sens contraire a celle qui l'entoure est un trou, de meme sens elle ne change
 * rien (deja peinte). L'emboitement se lit sur les boites : une approximation pour des boucles qui se croisent, exacte pour les
 * contours ordinaires (lettres, logos, traces vectorises), et toujours deterministe.
 */
export function aireDeChemin(d: Chemin, regle: 'nonzero' | 'evenodd' = 'nonzero'): number {
  const boucles: Boucle[] = [];
  for (const s of sousChemins(d)) {
    if (!s.segments.length) continue;
    const premier = s.segments[0]?.[0], dernierSeg = s.segments[s.segments.length - 1], fin = dernierSeg?.[dernierSeg.length - 1];
    const segments = !s.ferme && premier && fin && (premier[0] !== fin[0] || premier[1] !== fin[1]) ? [...s.segments, [fin, premier] as Segment] : s.segments;
    let a = 0;
    for (const seg of segments) a += aireSegment(seg);
    if (a !== 0) boucles.push({ aire: a, boite: boiteDe(segments) });
  }
  // Les plus grandes d'abord : une boucle ne peut etre entouree que par une plus grande qu'elle.
  boucles.sort((x, y) => Math.abs(y.aire) - Math.abs(x.aire));
  // Chaque boucle fait passer son interieur d'un nombre d'enroulement (celui de ses parents) a un autre (le sien en plus) : elle
  // ajoute son aire si l'interieur devient peint, la retire s'il cesse de l'etre. Les apports se compensent d'un niveau a l'autre.
  const peint = (n: number, parite: number) => (regle === 'evenodd' ? parite % 2 === 1 : n !== 0);
  let total = 0;
  boucles.forEach((b, i) => {
    const parents = boucles.slice(0, i).filter(p => contient(p.boite, b.boite));
    const dehors = parents.reduce((s, p) => s + Math.sign(p.aire), 0), dedans = dehors + Math.sign(b.aire);
    total += Math.abs(b.aire) * (Number(peint(dedans, parents.length + 1)) - Number(peint(dehors, parents.length)));
  });
  return Math.max(0, total);
}
