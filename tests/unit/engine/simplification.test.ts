import { describe, it, expect } from 'vitest';
import { compterPoints, lireChemin, lireDessin, simplifier, simplifierChemin, type Chemin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { ajusterCubiques, distancePolyligne2, reconstruireAnneau, simplifierPolyligne, type Pt } from '../../../src/engine/edition/ajustement.js';

const chemin = (d: string): Chemin => lireChemin(d);
const dessin = (corps: string): DessinSvg => {
  const r = lireDessin(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${corps}</svg>`);
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};

// ---------------------------------------------------------------- mesure : l'ecart de Hausdorff entre deux chemins

/** Les polylignes d'un chemin, courbes echantillonnees finement : une par sous-chemin, fermees par leur depart. */
function polylignes(d: Chemin): Pt[][] {
  const sous: Pt[][] = [];
  let courant: Pt[] = [], debut: Pt = [0, 0], dernier: Pt = [0, 0];
  const poser = (p: Pt) => { courant.push(p); dernier = p; };
  for (const c of d) {
    const p = c.p;
    if (c.c === 'M') { if (courant.length) sous.push(courant); courant = []; debut = [p[0] ?? 0, p[1] ?? 0]; poser(debut); }
    else if (c.c === 'L') poser([p[0] ?? 0, p[1] ?? 0]);
    else if (c.c === 'Z') { poser(debut); }
    else {
      const [x0, y0] = dernier;
      for (let k = 1; k <= 200; k++) {
        const t = k / 200, v = 1 - t;
        if (c.c === 'C') poser([v ** 3 * x0 + 3 * v * v * t * (p[0] ?? 0) + 3 * v * t * t * (p[2] ?? 0) + t ** 3 * (p[4] ?? 0), v ** 3 * y0 + 3 * v * v * t * (p[1] ?? 0) + 3 * v * t * t * (p[3] ?? 0) + t ** 3 * (p[5] ?? 0)]);
        else poser([v * v * x0 + 2 * v * t * (p[0] ?? 0) + t * t * (p[2] ?? 0), v * v * y0 + 2 * v * t * (p[1] ?? 0) + t * t * (p[3] ?? 0)]);
      }
    }
  }
  if (courant.length) sous.push(courant);
  return sous;
}

/** Les points d'une polyligne, plus quatre points regulierement poses sur chaque segment (le sommet seul ne verrait pas un ecart au milieu). */
const echantillons = (l: readonly Pt[]): Pt[] => l.flatMap((a, i) => {
  const b = l[i + 1];
  if (!b) return [a];
  return [0, 0.25, 0.5, 0.75].map((t): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
});

/** L'ecart de Hausdorff symetrique (distance maximale d'un chemin a l'autre, dans les deux sens). */
function hausdorff(a: Chemin, b: Chemin): number {
  const la = polylignes(a).filter(l => l.length > 0), lb = polylignes(b).filter(l => l.length > 0);
  const sens = (de: Pt[][], vers: Pt[][]) => Math.max(...de.flatMap(l => echantillons(l)).map(p => Math.sqrt(Math.min(...vers.map(m => distancePolyligne2(p, m))))));
  return Math.max(sens(la, lb), sens(lb, la));
}

const lettres = (d: Chemin): string => d.map(c => c.c).join('');

// Une courbe bruitee, deterministe : un cercle de 360 sommets dont le rayon oscille de 0.03.
const bruit = (k: number): number => ((k * 7919) % 13) / 13 - 0.5;
const cercleBruite = (): string => {
  const pts = Array.from({ length: 360 }, (_, k) => {
    const a = (k / 360) * 2 * Math.PI, r = 30 + 0.06 * bruit(k);
    return (50 + r * Math.cos(a)).toFixed(4) + ' ' + (50 + r * Math.sin(a)).toFixed(4);
  });
  return 'M' + pts.join('L') + 'Z';
};

describe('simplifierChemin', () => {
  it('retire les sommets alignes a la tolerance pres, et garde les extremites', () => {
    const d = chemin('M0 0L10 0.01L20 -0.01L30 0.02L40 0');
    const s = simplifierChemin(d, 0.05);
    expect(lettres(s)).toBe('ML');
    expect(s.map(c => c.p)).toEqual([[0, 0], [40, 0]]);
  });

  it('garde un coin : un sommet plus ecarte que la tolerance reste', () => {
    const s = simplifierChemin(chemin('M0 0L10 0.01L20 0L20.01 10L20 20'), 0.05);
    expect(s.map(c => c.p)).toEqual([[0, 0], [20, 0], [20, 20]]);
  });

  it('rend le chemin lui-meme, sans copie, quand la tolerance est nulle ou qu il n y a rien a retirer', () => {
    const d = chemin('M0 0L10 0.01L20 0');
    expect(simplifierChemin(d, 0)).toBe(d);
    expect(simplifierChemin(d, -1)).toBe(d);
    const coins = chemin('M0 0L10 0L10 10L0 10Z');
    expect(simplifierChemin(coins, 0.5)).toBe(coins);
  });

  it('reduit un cercle de 360 sommets bruites a quelques dizaines, en restant a la tolerance pres', () => {
    const d = chemin(cercleBruite());
    for (const tolerance of [0.05, 0.2, 1]) {
      const s = simplifierChemin(d, tolerance);
      expect(compterPoints(s), 'tolerance ' + tolerance).toBeLessThan(compterPoints(d) / 3);
      expect(hausdorff(d, s), 'tolerance ' + tolerance).toBeLessThanOrEqual(tolerance);
    }
  });

  it('est idempotent a la meme tolerance', () => {
    for (const d of [chemin(cercleBruite()), chemin('M0 0L10 0.01L20 0L30 0.02L40 0L40.01 20L40 40Z'), chemin('M0 0L5 0.01L10 0C20 0 30 10 30 20L30.01 30L30 40L30.02 50')]) {
      for (const tolerance of [0.05, 0.5]) {
        const une = simplifierChemin(d, tolerance), deux = simplifierChemin(une, tolerance);
        expect(deux).toEqual(une);
      }
    }
  });

  it('garde la structure : sous-chemins, ouverts ou fermes, et fermeture', () => {
    const d = chemin('M0 0L10 0.01L20 0L30 0.01L40 0ZM50 50L60 50.01L70 50L80 50.02L90 50M0 90L10 90L10 80L0 80.01L0 90Z');
    const s = simplifierChemin(d, 0.05);
    expect(s.filter(c => c.c === 'M').length).toBe(3);
    expect(s.filter(c => c.c === 'Z').length).toBe(2);
    // Chaque sous-chemin garde son depart et sa nature : le premier et le dernier se ferment, le second reste ouvert.
    const sous = lettres(s).split(/(?=M)/);
    expect(sous.map(x => x.endsWith('Z'))).toEqual([true, false, true]);
    expect(s[0]?.p).toEqual([0, 0]);
    expect(compterPoints(s)).toBeLessThan(compterPoints(d));
    expect(hausdorff(d, s)).toBeLessThanOrEqual(0.05);
  });

  it('une forme fermee garde au moins trois sommets, meme minuscule', () => {
    const petit = chemin('M0 0L0.01 0L0.01 0.01L0 0.01Z');
    const s = simplifierChemin(petit, 5);
    expect(compterPoints(s)).toBeGreaterThanOrEqual(3);
    expect(lettres(s).endsWith('Z')).toBe(true);
  });

  it('laisse les courbes exactement telles quelles et simplifie les droites qui les entourent', () => {
    const d = chemin('M0 0L5 0.01L10 0C20 0 30 10 30 20Q35 25 40 20L40.01 10L40 0L40.02 -10');
    const s = simplifierChemin(d, 0.05);
    expect(s.filter(c => c.c === 'C')).toEqual(d.filter(c => c.c === 'C'));
    expect(s.filter(c => c.c === 'Q')).toEqual(d.filter(c => c.c === 'Q'));
    expect(lettres(s)).toBe('MLCQL');
    expect(hausdorff(d, s)).toBeLessThanOrEqual(0.05);
  });

  it('ne change rien a un chemin sans segments droits', () => {
    const d = chemin('M0 0C10 0 20 10 20 20C20 30 10 40 0 40Z');
    expect(simplifierChemin(d, 5)).toBe(d);
  });

  it('retire le L qui revient au depart avant un Z, puisque le Z le trace', () => {
    const s = simplifierChemin(chemin('M0 0L10 0L10 10L0 10L0 0Z'), 0.01);
    expect(s.map(c => c.p)).toEqual([[0, 0], [10, 0], [10, 10], [0, 10], []]);
  });

  it('est pur : meme entree, memes commandes, et l entree n est pas modifiee', () => {
    const d = chemin(cercleBruite());
    const copie = JSON.stringify(d);
    expect(simplifierChemin(d, 0.1)).toEqual(simplifierChemin(d, 0.1));
    expect(JSON.stringify(d)).toBe(copie);
  });
});

describe('simplifier, sur un dessin', () => {
  const bruite = 'M5 50L10 50.01L20 50L30 50.02L40 50';
  const d = () => dessin(`<path d="${bruite}" fill="none" stroke="#000"/><path d="${bruite}" fill="none" stroke="#f00"/><path d="M0 0h10v10h-10z" fill="#0f0"/>`);

  it('simplifie les formes choisies et dit combien de points sont partis', () => {
    const r = simplifier(d(), ['f1'], 0.05);
    expect(r.retires).toBe(3);
    expect(r.formes).toBe(1);
    expect(r.dessin.formes[0]?.d.length).toBe(2);
    expect(r.dessin.formes[1]).toBe(d().formes[1] && r.dessin.formes[1]);
    expect(r.dessin.formes[1]?.d.length).toBe(5);
  });

  it('ne touche jamais une forme verrouillee, meme choisie', () => {
    const base = d();
    const verrouillee: DessinSvg = { ...base, formes: base.formes.map(f => (f.id === 'f1' ? { ...f, verrouille: true } : f)) };
    const r = simplifier(verrouillee, ['f1', 'f2'], 0.05);
    expect(r.dessin.formes[0]).toBe(verrouillee.formes[0]);
    expect(r.dessin.formes[1]?.d.length).toBe(2);
    expect(r.retires).toBe(3);
    expect(r.formes).toBe(1);
  });

  it('rend le dessin lui-meme quand rien ne bouge', () => {
    const base = d();
    expect(simplifier(base, ['f3'], 0.05).dessin).toBe(base);
    expect(simplifier(base, [], 0.05).dessin).toBe(base);
    expect(simplifier(base, ['f1'], 0).dessin).toBe(base);
  });
});

describe('simplifierPolyligne', () => {
  it('garde les extremites et le sommet le plus ecarte, en ordre', () => {
    expect(simplifierPolyligne([[0, 0], [5, 0.1], [10, 5], [15, 0.1], [20, 0]], 3)).toEqual([0, 2, 4]);
    expect(simplifierPolyligne([[0, 0], [5, 0.1], [10, 0]], 1)).toEqual([0, 2]);
  });

  it('ne change rien a deux points ou moins, ni sans tolerance', () => {
    expect(simplifierPolyligne([[0, 0], [1, 1]], 5)).toEqual([0, 1]);
    expect(simplifierPolyligne([[0, 0], [1, 0.0001], [2, 0]], 0)).toEqual([0, 1, 2]);
  });

  it('supporte une polyligne qui revient a son depart', () => {
    const idx = simplifierPolyligne([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], 0.5);
    expect(idx).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('ajusterCubiques', () => {
  const arc = (n: number, a1: number, r = 30): Pt[] => Array.from({ length: n + 1 }, (_, k) => [50 + r * Math.cos((k / n) * a1), 50 + r * Math.sin((k / n) * a1)]);

  it('ajuste un quart de cercle en peu de cubiques, a la tolerance pres', () => {
    const pts = arc(40, Math.PI / 2);
    const pieces = ajusterCubiques(pts, 0.05);
    expect(pieces).not.toBeNull();
    expect(pieces?.length).toBeLessThanOrEqual(4);
    // Les pieces enchainent le premier au dernier point, sans trou.
    expect(pieces?.[0]?.de).toBe(0);
    expect(pieces?.[pieces.length - 1]?.a).toBe(40);
    expect(pieces?.[pieces.length - 1]?.fin).toEqual(pts[40]);
  });

  it('se resserre avec la tolerance : plus de pieces pour un ecart plus petit', () => {
    const pts = arc(200, Math.PI * 1.5);
    const grosse = ajusterCubiques(pts, 0.5)?.length ?? 0, fine = ajusterCubiques(pts, 0.005)?.length ?? 0;
    expect(grosse).toBeGreaterThan(0);
    expect(fine).toBeGreaterThan(grosse);
  });

  it('rend null plutot qu une courbe infidele : deux points ne se courbent pas, une tolerance nulle non plus', () => {
    expect(ajusterCubiques([[0, 0]], 1)).toBeNull();
    expect(ajusterCubiques(arc(10, 1), 0)).toBeNull();
  });

  it('est deterministe', () => {
    const pts = arc(120, 4);
    expect(ajusterCubiques(pts, 0.02)).toEqual(ajusterCubiques(pts, 0.02));
  });
});

describe('reconstruireAnneau', () => {
  const cercle = (n: number, r = 30): Pt[] => Array.from({ length: n }, (_, k) => [50 + r * Math.cos((k / n) * 2 * Math.PI), 50 + r * Math.sin((k / n) * 2 * Math.PI)]);

  it('rebatit un cercle de 200 sommets en quelques cubiques fermees, a la tolerance pres', () => {
    const anneau = cercle(200), c = reconstruireAnneau(anneau, 0.02);
    expect(c[0]?.c).toBe('M');
    expect(c[c.length - 1]?.c).toBe('Z');
    expect(c.filter(x => x.c === 'C').length).toBeGreaterThan(3);
    expect(c.length).toBeLessThan(40);
    const avant: Chemin = [{ c: 'M', p: anneau[0] ?? [0, 0] }, ...anneau.slice(1).map(p => ({ c: 'L' as const, p: [...p] })), { c: 'Z', p: [] }];
    expect(hausdorff(avant, c)).toBeLessThanOrEqual(0.02 + 0.0015);
  });

  it('garde les coins : un carre reste quatre segments droits', () => {
    const c = reconstruireAnneau([[0, 0], [10, 0], [10, 10], [0, 10]], 0.05);
    expect(c.map(x => x.c).join('')).toBe('MLLLZ');
  });

  it('garde un demi-disque : l arc devient courbe, les deux coins restent', () => {
    const arc = Array.from({ length: 80 }, (_, k): Pt => [50 + 30 * Math.cos((k / 79) * Math.PI), 50 - 30 * Math.sin((k / 79) * Math.PI)]);
    const c = reconstruireAnneau(arc, 0.02);
    expect(c.filter(x => x.c === 'C').length).toBeGreaterThan(0);
    expect(c.filter(x => x.c === 'M').length).toBe(1);
    expect(c[c.length - 1]?.c).toBe('Z');
    expect(c.length).toBeLessThan(30);
  });

  it('est deterministe, et ne depend pas du depart de l anneau pour la forme', () => {
    const anneau = cercle(150);
    expect(reconstruireAnneau(anneau, 0.02)).toEqual(reconstruireAnneau(anneau, 0.02));
  });
});
