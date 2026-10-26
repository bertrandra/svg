import { describe, expect, it } from 'vitest';
import { aireSignee, aplatir } from '../../../src/engine/booleens.js';
import { arrondirAngles, arrondirFormes } from '../../../src/engine/edition/arrondi.js';
import { ajouterForme, lireChemin, rectangle, type Chemin, type DessinSvg } from '../../../src/engine/editionSvg.js';

// Arrondir les coins choisis (ADR-0038) : en mode points, seul le coin du point actif s'arrondit ; un carre arrondi a des coins
// tangents a ses cotes ; le rayon est borne par la longueur des cotes.

const aire = (d: Chemin): number => aplatir(d, 0.0005).reduce((s, r) => s + Math.abs(aireSignee(r)), 0);
const CARRE = 'M0 0L100 0L100 100L0 100Z';

describe('arrondir les coins choisis', () => {
  it('le carre entier : quatre arcs, chacun tangent a ses deux cotes (les points de raccord sont sur les cotes)', () => {
    const r = arrondirAngles(lireChemin(CARRE), 20);
    expect(r.angles).toBe(4);
    const droites = r.chemin.filter(c => c.c === 'L' || c.c === 'M');
    // Chaque cote garde son milieu : il va de 20 a 80, le reste est l'arc.
    for (const c of droites) expect(c.p.every(v => [0, 20, 80, 100].includes(Math.round(v * 1e6) / 1e6))).toBe(true);
    // Tangence : la premiere poignee d'un arc prolonge le cote qui y arrive (meme ordonnee pour le cote du haut).
    const premierArc = r.chemin.find(c => c.c === 'C');
    expect(premierArc?.p[1]).toBeCloseTo(0, 9);
    expect(Math.abs(aire(r.chemin) - (10000 - (4 - Math.PI) * 400))).toBeLessThan(0.6);
  });

  it('un seul coin, nomme par la commande de son ancre : les trois autres restent vifs', () => {
    // La commande 2 (L100 100) a pour ancre le coin bas droit.
    const r = arrondirAngles(lireChemin(CARRE), 20, new Set([2]));
    expect(r.angles).toBe(1);
    expect(r.chemin.filter(c => c.c === 'C').length).toBe(1);
    expect(Math.abs(aire(r.chemin) - (10000 - (1 - Math.PI / 4) * 400))).toBeLessThan(0.2);
  });

  it('le coin du depart d un trace ferme se nomme par son M', () => {
    const r = arrondirAngles(lireChemin(CARRE), 10, new Set([0]));
    expect(r.angles).toBe(1);
    // Le trace commence desormais apres l'arc, sur le cote du haut.
    expect(r.chemin[0]?.p).toEqual([10, 0]);
  });

  it('un coin seul peut prendre tout son cote : son rayon n est borne que par la longueur des cotes', () => {
    const seul = arrondirAngles(lireChemin(CARRE), 90, new Set([2]));
    expect(seul.reduits).toBe(0);
    expect(seul.rayonMin).toBe(90);
    const tous = arrondirAngles(lireChemin(CARRE), 90);
    expect(tous.reduits).toBe(4);
    expect(tous.rayonMin).toBe(50);
    const trop = arrondirAngles(lireChemin(CARRE), 500, new Set([2]));
    expect(trop.rayonMin).toBeLessThan(100);
  });

  it('un indice qui n est pas un coin ne change rien (le meme chemin)', () => {
    const d = lireChemin(CARRE);
    expect(arrondirAngles(d, 10, new Set([99])).chemin).toBe(d);
  });

  it('les coins choisis ne valent que pour une forme seule', () => {
    const base: DessinSvg = { vb: [0, 0, 300, 300], formes: [] };
    const d = [rectangle(0, 0, 100, 100), rectangle(150, 0, 100, 100)].reduce((x, c) => ajouterForme(x, c, { remplissage: '#000000', contour: null, epaisseur: 1 }).dessin, base);
    expect(arrondirFormes(d, ['f1'], 10, new Set([2])).angles).toBe(1);
    expect(arrondirFormes(d, ['f1', 'f2'], 10, new Set([2])).angles).toBe(8);
  });
});
