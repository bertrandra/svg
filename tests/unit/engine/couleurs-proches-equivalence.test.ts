import { describe, expect, it } from 'vitest';
import {
  couleursProches, fusionnerCouleursProches, idsDeNuancesProches,
  type DessinSvg, type Forme, type GrappeCouleurs, type SurCouleur
} from '../../../src/engine/editionSvg.js';
import { lireHex, versOklab, type Oklab } from '../../../src/util/couleur.js';

// Le regroupement des nuances proches cherche, pour chaque couleur, la premiere cible a moins de la
// tolerance. Il passe par un index en grille (util/voisinsOklab.ts) au lieu de parcourir toutes les
// cibles : ces tests le comparent, resultat pour resultat, a l'ancienne implementation recopiee ici
// telle qu'elle etait avant l'index (parcours lineaire des cibles), sur des milliers de couleurs.

// ---- L'ancienne implementation, recopiee --------------------------------------------------------

type Lue = (f: Forme, sur: SurCouleur) => string[];
const lues: Lue = (f, sur) => {
  const l = sur === 'remplissage' ? [f.remplissage] : sur === 'contour' ? [f.contour] : f.remplissage === f.contour ? [f.remplissage] : [f.remplissage, f.contour];
  return l.filter((c): c is string => !!c);
};
function usagesAncien(dessin: DessinSvg, sur: SurCouleur): Map<string, number> {
  const n = new Map<string, number>();
  for (const f of dessin.formes) for (const c of lues(f, sur)) n.set(c, (n.get(c) ?? 0) + 1);
  return n;
}
const ecartAncien = (a: Oklab, b: Oklab): number => Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
function pointAncien(couleur: string): Oklab | null {
  const rgb = lireHex(couleur);
  return rgb ? versOklab(rgb) : null;
}
function ordonneesAncien(n: ReadonlyMap<string, number>): string[] {
  return [...n.keys()].sort((a, b) => (n.get(b) ?? 0) - (n.get(a) ?? 0) || (a < b ? -1 : a > b ? 1 : 0));
}
function affectationsAncien(dessin: DessinSvg, tolerance: number, sur: SurCouleur) {
  const n = usagesAncien(dessin, sur);
  const centres: Array<{ couleur: string; point: Oklab }> = [];
  const cibles = new Map<string, string>();
  for (const c of ordonneesAncien(n)) {
    const point = pointAncien(c);
    if (!point) continue;
    const centre = centres.find(x => ecartAncien(x.point, point) <= tolerance);
    if (centre) cibles.set(c, centre.couleur); else centres.push({ couleur: c, point });
  }
  return { cibles, n };
}
function couleursProchesAncien(dessin: DessinSvg, tolerance: number, sur: SurCouleur): GrappeCouleurs[] {
  const { cibles, n } = affectationsAncien(dessin, tolerance, sur);
  const parCible = new Map<string, string[]>();
  for (const [de, vers] of cibles) parCible.set(vers, [...(parCible.get(vers) ?? []), de]);
  return ordonneesAncien(n).flatMap(cible => {
    const membres = parCible.get(cible);
    return membres ? [{ cible, membres, formes: membres.reduce((s, m) => s + (n.get(m) ?? 0), 0) }] : [];
  });
}
function fusionnerAncien(dessin: DessinSvg, tolerance: number, sur: SurCouleur) {
  const { cibles } = affectationsAncien(dessin, tolerance, sur);
  if (!cibles.size) return { dessin, fusionnees: 0, formes: 0, conservees: 0 };
  let recolorees = 0;
  const formes = dessin.formes.map(f => {
    if (f.verrouille) return f;
    const r = sur !== 'contour' && f.remplissage ? cibles.get(f.remplissage) : undefined;
    const c = sur !== 'remplissage' && f.contour ? cibles.get(f.contour) : undefined;
    if (r === undefined && c === undefined) return f;
    recolorees++;
    return { ...f, remplissage: r ?? f.remplissage, contour: c ?? f.contour };
  });
  if (!recolorees) return { dessin, fusionnees: 0, formes: 0, conservees: cibles.size };
  const apres = { ...dessin, formes };
  const restantes = usagesAncien(apres, sur);
  const fusionnees = [...cibles.keys()].filter(c => !restantes.has(c)).length;
  return { dessin: apres, fusionnees, formes: recolorees, conservees: cibles.size - fusionnees };
}

// ---- Des dessins de milliers de couleurs ----------------------------------------------------------

const graine = (n: number) => { let s = n; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };
const hex = (r: number, v: number, b: number) => '#' + [r, v, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');

/**
 * `formes` formes sur `couleurs` couleurs (au plus) : un tiers tirees au hasard dans tout le cube sRGB, le reste
 * en nuages serres autour de quelques centres (de quoi avoir des voisines a toutes les tolerances), plus
 * quelques noms de couleur qui ne sont pas des codes hexadecimaux, des formes masquees et verrouillees.
 */
function dessinAlea(seed: number, couleurs: number, formes: number): DessinSvg {
  const alea = graine(seed);
  const centres = Array.from({ length: 40 }, () => [alea() * 255, alea() * 255, alea() * 255] as const);
  const palette: string[] = ['red', 'transparentish', 'currentColor'];
  for (let i = 0; palette.length < couleurs && i < couleurs * 4; i++) {
    if (i % 3 === 0) palette.push(hex(alea() * 255, alea() * 255, alea() * 255));
    else {
      const c = centres[Math.floor(alea() * centres.length)] ?? [0, 0, 0];
      const s = [2, 6, 14][Math.floor(alea() * 3)] as number;
      palette.push(hex(c[0] + (alea() - 0.5) * s, c[1] + (alea() - 0.5) * s, c[2] + (alea() - 0.5) * s));
    }
  }
  const distinctes = [...new Set(palette)];
  const choix = () => distinctes[Math.floor(alea() * alea() * distinctes.length)] ?? '#000000';
  const fs: Forme[] = Array.from({ length: formes }, (_, i) => ({
    id: 'f' + (i + 1), d: [], remplissage: alea() < 0.1 ? null : choix(), contour: alea() < 0.4 ? choix() : null, epaisseur: 1, opacite: 1, regle: 'nonzero',
    visible: alea() > 0.1, verrouille: alea() < 0.08
  }));
  return { vb: [0, 0, 100, 100], formes: fs };
}

describe('couleursProches et fusionnerCouleursProches avec l’index en grille', () => {
  const SURS: SurCouleur[] = ['tout', 'remplissage', 'contour'];
  const TOLERANCES = [0.01, 0.02, 0.04, 0.07, 0.15];

  for (const [seed, couleurs, formes] of [[11, 3000, 8000], [12, 2500, 6000], [13, 600, 5000], [14, 4000, 9000]] as const) {
    it(`rend les memes grappes que l’ancien parcours (${couleurs} couleurs, ${formes} formes)`, () => {
      const dessin = dessinAlea(seed, couleurs, formes);
      for (const sur of SURS) for (const tolerance of TOLERANCES) {
        const attendu = couleursProchesAncien(dessin, tolerance, sur), obtenu = couleursProches(dessin, tolerance, sur);
        expect(obtenu, `sur ${sur}, tolerance ${tolerance}`).toEqual(attendu);
      }
    }, 60_000);

    it(`fusionne comme l’ancien parcours (${couleurs} couleurs, ${formes} formes)`, () => {
      const dessin = dessinAlea(seed + 100, couleurs, formes);
      for (const sur of SURS) for (const tolerance of [0.02, 0.07]) {
        const attendu = fusionnerAncien(dessin, tolerance, sur), obtenu = fusionnerCouleursProches(dessin, tolerance, sur);
        expect(obtenu.fusionnees).toBe(attendu.fusionnees);
        expect(obtenu.formes).toBe(attendu.formes);
        expect(obtenu.conservees).toBe(attendu.conservees);
        expect(obtenu.dessin.formes.map(f => [f.remplissage, f.contour])).toEqual(attendu.dessin.formes.map(f => [f.remplissage, f.contour]));
      }
    }, 60_000);
  }

  it('regroupe vraiment quelque chose a ces tolerances (le test ne compare pas du vide)', () => {
    const dessin = dessinAlea(11, 3000, 8000);
    expect(couleursProches(dessin, 0.04, 'tout').length).toBeGreaterThan(50);
    expect(couleursProches(dessin, 0.01, 'tout').length).toBeGreaterThan(5);
  });

  it('se comporte comme l’ancien parcours pour une tolerance nulle, negative ou non numerique', () => {
    const dessin = dessinAlea(21, 800, 2000);
    for (const tolerance of [0, -0.1, NaN, Infinity]) {
      expect(couleursProches(dessin, tolerance, 'tout')).toEqual(couleursProchesAncien(dessin, tolerance, 'tout'));
    }
  });

  it('ne change pas idsDeNuancesProches, qui partage seulement la distance', () => {
    const dessin = dessinAlea(31, 500, 1500);
    const p = (c: string) => { const rgb = lireHex(c); return rgb ? versOklab(rgb) : null; };
    const ancien = (couleur: string, tolerance: number, sur: SurCouleur) => {
      const ref = p(couleur);
      return dessin.formes.filter(f => f.visible && !f.verrouille && lues(f, sur).some(c => c === couleur || (!!ref && !!p(c) && ecartAncien(ref, p(c) as Oklab) <= tolerance))).map(f => f.id);
    };
    for (const couleur of dessin.formes.slice(0, 15).map(f => f.remplissage ?? '#000000')) {
      for (const sur of SURS) expect(idsDeNuancesProches(dessin, couleur, 0.04, sur)).toEqual(ancien(couleur, 0.04, sur));
    }
  });
});
