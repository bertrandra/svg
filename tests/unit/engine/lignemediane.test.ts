import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  PARAMETRES_LIGNE, PIXELS_LIGNE_MAX, poserLigne, resumeLigne, retirerLigne, TRACES_LIGNE_MAX, tracerLigneMediane, valeursLigneParDefaut, type ResultatLigne
} from '../../../src/engine/lignemediane.js';
import { ecrireDessin, lireDessin } from '../../../src/engine/editionSvg.js';
import { resumeReglages, TRACES_MAX } from '../../../src/engine/vectorisation.js';
import { peindre } from './images-synthetiques.js';
import { anneau, BLANC, distanceSegment, echantillons, ecriture, longueurPts, NOIR, segments, type P } from './traits-synthetiques.js';

// La ligne mediane (ADR-0021) sur des dessins au trait synthetiques : chaque cas dit ce qu'un oeil attend (un
// segment au milieu d'un trait droit, une jonction au croisement, une boucle de rayon moyen) et le verifie en
// pixels, a une tolerance d'un pixel ou d'une demi-epaisseur pres.

const FOND = { r: 255, g: 255, b: 255 };
const tracer = (...a: Parameters<typeof tracerLigneMediane>): ResultatLigne => {
  const r = tracerLigneMediane(...a);
  if ('erreur' in r) throw new Error(r.erreur);
  return r;
};
/** La plus grande distance des points echantillonnes d'un trace a un ensemble de segments. */
const ecartMax = (pts: readonly P[], segs: ReadonlyArray<readonly [P, P]>) => Math.max(...pts.map(p => Math.min(...segs.map(([a, b]) => distanceSegment(p, a, b)))));

describe('ligne mediane : formes simples', () => {
  it('une ligne droite epaisse devient un seul segment au milieu du trait', () => {
    const r = tracer(segments(100, 40, [[10, 20, 90, 20]], 7), FOND, 'normale');
    const [t] = echantillons(r.svg);
    expect(r.traces).toBe(1);
    expect(t?.ferme).toBe(false);
    expect(ecartMax(t?.pts ?? [], [[[10, 20], [90, 20]]])).toBeLessThanOrEqual(0.75);
    // Le squelette s'arrete a une demi-epaisseur des bouts : le bout rond du trait ecrit les rejoint.
    expect(longueurPts(t?.pts ?? [])).toBeGreaterThan(80 - 7);
    expect(r.mesure.epaisseur).toBeGreaterThanOrEqual(6.5);
    expect(r.mesure.epaisseur).toBeLessThanOrEqual(8.5);
    expect(r.svg).toContain('fill="none"');
    expect(r.svg).toContain('stroke-linecap="round"');
    expect(r.svg).not.toMatch(/fill="#/);
  });

  it('un « L » : un seul trace qui suit les deux branches et passe pres du coin', () => {
    const r = tracer(segments(80, 80, [[15, 10, 15, 65], [15, 65, 65, 65]], 7), FOND, 'normale');
    const [t] = echantillons(r.svg);
    expect(r.traces).toBe(1);
    const pts = t?.pts ?? [];
    expect(ecartMax(pts, [[[15, 10], [15, 65]], [[15, 65], [65, 65]]])).toBeLessThanOrEqual(3.5);
    // L'axe median coupe le coin a 45 degres : le trace passe a moins d'une demi-epaisseur du coin.
    expect(Math.min(...pts.map(p => Math.hypot(p[0] - 15, p[1] - 65)))).toBeLessThanOrEqual(3.5);
  });

  it('un « T » : la barre d un trait, la jambe qui la touche a la jonction', () => {
    const r = tracer(segments(80, 80, [[10, 15, 70, 15], [40, 15, 40, 70]], 7), FOND, 'normale');
    const e = echantillons(r.svg);
    expect(r.traces).toBe(2);
    const barre = e.find(t => Math.abs((t.pts[0]?.[1] ?? 0) - (t.pts[t.pts.length - 1]?.[1] ?? 0)) < 2), jambe = e.find(t => t !== barre);
    expect(ecartMax(barre?.pts ?? [], [[[10, 15], [70, 15]]])).toBeLessThanOrEqual(1);
    expect(ecartMax(jambe?.pts ?? [], [[[40, 15], [40, 70]]])).toBeLessThanOrEqual(1);
    // La jambe touche la barre : son bout haut est sur la barre, a un pixel pres.
    const haut = (jambe?.pts ?? []).reduce((m, p) => (p[1] < m[1] ? p : m), [0, 99] as P);
    expect(Math.hypot(haut[0] - 40, haut[1] - 15)).toBeLessThanOrEqual(1.5);
  });

  it('un « X » : deux traits qui se croisent au centre', () => {
    const r = tracer(segments(80, 80, [[10, 10, 70, 70], [10, 70, 70, 10]], 7), FOND, 'normale');
    const e = echantillons(r.svg);
    expect(r.traces).toBe(2);
    for (const t of e) expect(ecartMax(t.pts, [[[10, 10], [70, 70]], [[10, 70], [70, 10]]])).toBeLessThanOrEqual(1);
    for (const t of e) expect(Math.min(...t.pts.slice(1).map((p, i) => distanceSegment([40, 40], t.pts[i] ?? p, p)))).toBeLessThanOrEqual(1);
  });

  it('un « X » aigu, fin ou epais : deux diagonales entieres malgre les deux jonctions du croisement', () => {
    for (const e of [7, 15, 30]) {
      const r = tracer(segments(400, 200, [[20, 20, 380, 180], [20, 180, 380, 20]], e), FOND, 'normale');
      expect(r.traces, 'épaisseur ' + e).toBe(2);
      for (const t of echantillons(r.svg)) expect(ecartMax(t.pts, [[[20, 20], [380, 180]], [[20, 180], [380, 20]]]), 'épaisseur ' + e).toBeLessThanOrEqual(e / 2);
    }
  });

  it('un « H » serre n est pas un croisement : deux jambes et une barre', () => {
    const r = tracer(segments(60, 100, [[20, 20, 20, 80], [36, 20, 36, 80], [20, 50, 36, 50]], 7), FOND, 'normale');
    expect(r.traces).toBe(3);
    const e = echantillons(r.svg);
    expect(e.filter(t => ecartMax(t.pts, [[[20, 20], [20, 80]]]) <= 1 || ecartMax(t.pts, [[[36, 20], [36, 80]]]) <= 1)).toHaveLength(2);
  });

  it('un cercle epais : une boucle fermee de rayon moyen', () => {
    const r = tracer(anneau(100, 100, 50, 50, 26, 34), FOND, 'normale');
    const [t] = echantillons(r.svg);
    expect(r.traces).toBe(1);
    expect(t?.ferme).toBe(true);
    const rayons = (t?.pts ?? []).map(p => Math.hypot(p[0] - 50, p[1] - 50));
    const moyen = rayons.reduce((s, x) => s + x, 0) / rayons.length;
    expect(Math.abs(moyen - 30)).toBeLessThanOrEqual(0.75);
    expect(Math.max(...rayons.map(x => Math.abs(x - 30)))).toBeLessThanOrEqual(1.5);
  });
});

const bosse = (hauteur: number) => peindre(100, 40, (x, y) => {
  const c: P = [x + 0.5, y + 0.5];
  return distanceSegment(c, [10, 24], [90, 24]) <= 4 || (c[0] >= 48 && c[0] <= 52 && c[1] >= 20 - hauteur && c[1] <= 24) ? NOIR : BLANC;
});
const encre = (img: { data: Uint8ClampedArray; largeur: number; hauteur: number }) => { let n = 0; for (let i = 0; i < img.largeur * img.hauteur; i++) if ((img.data[i * 4] ?? 255) < 128) n++; return n; };

describe('ligne mediane : nettoyage du squelette', () => {
  it('elague une barbule courte, garde une vraie branche', () => {
    expect(tracer(bosse(5), FOND, 'normale').traces).toBe(1);
    // Sans elagage, la petite bosse fait une branche de 7 px.
    const sans = tracer(bosse(5), FOND, 'normale', { barbules: 0 });
    expect(sans.traces).toBe(2);
    expect(Math.round(Math.min(...echantillons(sans.svg).map(t => longueurPts(t.pts))))).toBe(7);
    // Une branche plus longue que le seuil (10 px contre 9) reste.
    expect(tracer(bosse(8), FOND, 'normale').traces).toBe(2);
  });

  it('raccorde une coupure de deux pixels, sauf a zero', () => {
    const coupe = segments(100, 40, [[10, 20, 45, 20], [52, 20, 90, 20]], 5);
    const r = tracer(coupe, FOND, 'normale');
    expect(r.traces).toBe(1);
    expect(longueurPts(echantillons(r.svg)[0]?.pts ?? [])).toBeGreaterThan(75);
    expect(tracer(coupe, FOND, 'normale', { coupures: 0 }).traces).toBe(2);
    // Deux traits paralleles proches ne se font pas face : aucun raccord.
    expect(tracer(segments(100, 40, [[10, 12, 60, 12], [10, 26, 60, 26]], 5), FOND, 'normale', { coupures: 12 }).traces).toBe(2);
  });

  it('ignore les poussieres et bouche les trous d un trait epais', () => {
    const sale = peindre(100, 40, (x, y) => (distanceSegment([x + 0.5, y + 0.5], [10, 20], [90, 20]) <= 4 && !(x === 50 && y === 20)) || (x === 5 && y === 5) || (x === 95 && y === 35) ? NOIR : BLANC);
    const r = tracer(sale, FOND, 'normale');
    expect(r.traces).toBe(1);
    expect(echantillons(r.svg)[0]?.ferme).toBe(false);
  });
});

describe('ligne mediane : une ecriture manuscrite', () => {
  // Caveat gras, une fonte du projet, rendue en pixels par balayage : l'ecriture d'une carte d'anniversaire.
  const CAS = [['Bonjour Léa', 64, 360, 80, 15, 59], ['Joyeux anniversaire', 48, 420, 64, 28, 80]] as const;
  it.each(CAS)('« %s » : des traces ouverts, une longueur proche de celle du trait', (texte, taille, l, h, traces, points) => {
    const img = ecriture(texte, taille, l, h), r = tracer(img, FOND, 'normale');
    const e = echantillons(r.svg), total = e.reduce((s, t) => s + longueurPts(t.pts), 0);
    expect(r.traces).toBe(traces);
    expect(r.points).toBe(points);
    // La ligne mediane mesure a peu pres l'aire du trait divisee par son epaisseur, moins les bouts : de 80 a 100 %.
    const attendue = encre(img) / r.mesure.epaisseur;
    expect(total / attendue).toBeGreaterThan(0.8);
    expect(total / attendue).toBeLessThan(1);
    expect(e.filter(t => !t.ferme).length).toBeGreaterThan(traces / 2);
  });

  it('un grain plus lisse donne moins de points', () => {
    const img = ecriture('Bonjour Léa', 64, 360, 80);
    const [fin, normal, lisse] = (['fine', 'normale', 'lisse'] as const).map(f => tracer(img, FOND, f).points);
    expect(fin).toBeGreaterThan(normal ?? 0);
    expect(normal).toBeGreaterThan(lisse ?? 0);
  });
});

describe('ligne mediane : des octets reproductibles et lisibles', () => {
  it('deux passages rendent les memes octets, et l empreinte d aujourd hui', () => {
    const img = ecriture('Bonjour Léa', 64, 360, 80);
    const a = tracer(img, FOND, 'normale').svg, b = tracer(ecriture('Bonjour Léa', 64, 360, 80), FOND, 'normale').svg;
    expect(a).toBe(b);
    // Changer cette empreinte est un evenement de version majeure (CLAUDE.md), jamais une correction discrete.
    expect(createHash('sha256').update(a).digest('hex').slice(0, 16)).toBe('22ed1e356db9dd14');
  });

  it('l editeur ouvre des traces ouverts sans remplissage, et les reecrit a l octet', () => {
    const r = tracer(ecriture('Bonjour Léa', 64, 360, 80), FOND, 'normale');
    const lu = lireDessin(r.svg);
    if ('erreur' in lu) throw new Error(lu.erreur);
    expect(lu.ignores).toEqual([]);
    expect(lu.dessin.formes).toHaveLength(r.traces);
    for (const f of lu.dessin.formes) { expect(f.remplissage).toBeNull(); expect(f.contour).toBe('#000000'); expect(f.bout).toBe('round'); }
    expect(lu.dessin.formes.filter(f => !f.d.some(c => c.c === 'Z')).length).toBeGreaterThan(0);
    expect(ecrireDessin(lu.dessin)).toBe(r.svg);
  });

  it('un point (celui d un « i ») devient un trait de longueur nulle, que le bout rond dessine', () => {
    const r = tracer(segments(60, 60, [[30, 30, 30, 30]], 5), FOND, 'normale');
    expect(r.svg).toMatch(/<path d="M(\S+) (\S+)L\1 \2"/);
  });
});

describe('ligne mediane : fond, couleur, epaisseur', () => {
  it('lit une craie claire sur un fond sombre', () => {
    const r = tracer(segments(100, 40, [[10, 20, 90, 20]], 7, BLANC, [20, 20, 20, 255]), { r: 20, g: 20, b: 20 }, 'normale');
    expect(r.traces).toBe(1);
  });

  it('garde la couleur d une encre teintee, le noir pour un gris ; « noir » sur demande ; l epaisseur touchee', () => {
    const bleu = segments(100, 40, [[10, 20, 90, 20]], 7, [20, 40, 200, 255]);
    expect(tracer(bleu, FOND, 'normale').mesure.couleur).toBe('#1428c8');
    expect(tracer(bleu, FOND, 'normale').svg).toContain('stroke="#1428c8"');
    expect(tracer(bleu, FOND, 'normale', { couleur: 'noir' }).svg).toContain('stroke="#000000"');
    expect(tracer(segments(100, 40, [[10, 20, 90, 20]], 7, [90, 90, 95, 255]), FOND, 'normale').mesure.couleur).toBe('#000000');
    expect(tracer(bleu, FOND, 'normale', { epaisseur: 2 }).svg).toContain('stroke-width="2"');
  });

  it('suit le seuil touche : trop haut, plus de trait', () => {
    const gris = segments(100, 40, [[10, 20, 90, 20]], 7, [160, 160, 160, 255]);
    expect(tracer(gris, FOND, 'normale').traces).toBe(1);
    expect(tracerLigneMediane(gris, FOND, 'normale', { seuil: 120 })).toEqual({ erreur: expect.stringContaining('Aucun trait trouvé') });
  });
});

describe('ligne mediane : bornes', () => {
  it('refuse en le nommant une image trop grande, vide, pleine, ou trop de traces', () => {
    expect(tracerLigneMediane({ data: new Uint8ClampedArray(4), largeur: 2049, hauteur: 2048 }, FOND, 'normale')).toEqual({ erreur: expect.stringContaining('Image trop grande') });
    expect(2049 * 2048).toBeGreaterThan(PIXELS_LIGNE_MAX);
    expect(tracerLigneMediane(peindre(20, 20, () => BLANC), FOND, 'normale')).toEqual({ erreur: expect.stringContaining('Aucun trait') });
    expect(tracerLigneMediane(peindre(20, 20, () => NOIR), FOND, 'normale')).toEqual({ erreur: expect.stringContaining('pas un dessin au trait') });
    // 70 x 60 points de 3 x 3 : plus de quatre mille traces.
    const points = peindre(420, 360, (x, y) => (x % 6 < 3 && y % 6 < 3 ? NOIR : BLANC));
    expect(tracerLigneMediane(points, FOND, 'fine')).toEqual({ erreur: expect.stringContaining('4200 tracés') });
    expect(TRACES_LIGNE_MAX).toBe(TRACES_MAX);
  });
});

describe('ligne mediane : les reglages ne sont que ce qu on a touche', () => {
  const mesure = { epaisseur: 5.2, seuil: 127, couleur: '#000000' };
  it('calcule les valeurs par defaut sur la mesure et le grain', () => {
    expect(valeursLigneParDefaut('normale', mesure)).toEqual({ epaisseur: 5, seuil: 127, taches: 4, barbules: 7, coupures: 4, couleur: 'trait' });
    expect(valeursLigneParDefaut('lisse', mesure).barbules).toBe(10);
    expect(valeursLigneParDefaut('fine', null).epaisseur).toBe(3);
  });

  it('retire une valeur egale au defaut, et dit ce qui est touche', () => {
    expect(poserLigne(undefined, 'barbules', 7, 7)).toBeUndefined();
    const r = poserLigne(poserLigne(undefined, 'barbules', 12, 7), 'couleur', 'noir', 'trait');
    expect(r).toEqual({ barbules: 12, couleur: 'noir' });
    expect(retirerLigne(retirerLigne(r, 'barbules'), 'couleur')).toBeUndefined();
    expect(resumeLigne({ epaisseur: 4, couleur: 'noir' })).toEqual(['épaisseur 4', 'noir']);
    expect(resumeReglages({ mode: 'mediane', finesse: 'lisse', ligne: { barbules: 12 } })).toBe('Ligne médiane · lisse · barbules 12');
    for (const p of PARAMETRES_LIGNE) { expect(p.min).toBeLessThan(p.max); expect(p.aide.length).toBeGreaterThan(40); }
  });
});
