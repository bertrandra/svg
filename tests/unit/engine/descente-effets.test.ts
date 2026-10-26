// La descente des effets (ADR-0012, etape 7, annexe 5 §4) : un exporteur de traces (PDF d'aujourd'hui, SVG de decoupe, DXF, EPS,
// fichiers de production, SVG « a plat ») ne porte ni flou ni ombre ; les effets partent, des feuilles comme des groupes, la forme
// reste, et c'est dit (au singulier, au pluriel ; rien pour ce qui ne s'exporte pas). Un exporteur natif les garde.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ecrireDessin, estPlat, lireDessin, type Chemin, type DessinSvg, type Forme, type Groupe } from '../../../src/engine/editionSvg.js';
import { aplatirPour, CAPACITES_PLAT, phrasePertes, REGLES_DESCENTE } from '../../../src/engine/aplatir.js';
import { descendreEffets, effets, perteEffets } from '../../../src/engine/descente/effets.js';
import { CAPACITES_DXF, CAPACITES_EPS, CAPACITES_PDF, CAPACITES_PRODUCTION, CAPACITES_SVG_DECOUPE } from '../../../src/export/capacites.js';
import { ecrirePdf } from '../../../src/export/pdf.js';

const carre = (x: number, y: number): Chemin => [{ c: 'M', p: [x, y] }, { c: 'L', p: [x + 10, y] }, { c: 'L', p: [x + 10, y + 10] }, { c: 'L', p: [x, y + 10] }, { c: 'Z', p: [] }];
const f = (id: string, p: Partial<Forme> = {}): Forme => ({ id, d: carre(0, 0), remplissage: '#c81e28', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, ...p });
const g = (id: string, p: Partial<Groupe> = {}): Groupe => ({ id, visible: true, verrouille: false, ...p });
const flou = { flou: { ecart: 2 } } as const;

describe('la descente des effets', () => {
  it('retire les effets des feuilles et des groupes, garde les formes, et dit combien en ont perdu', () => {
    const d: DessinSvg = {
      vb: [0, 0, 100, 100],
      formes: [f('f1', { effets: flou }), f('f2', { parent: 'g1', d: carre(50, 0) }), f('f3', { parent: 'g2', d: carre(0, 50), effets: flou }), f('f4', { visible: false, effets: flou })],
      groupes: { g1: g('g1', { effets: { ombre: { dx: 2, dy: 2, ecart: 1, couleur: '#000000', opacite: 0.5 } } }), g2: g('g2', { visible: false }) }
    };
    const r = descendreEffets(d);
    expect(r.dessin.formes.map(x => 'effets' in x)).toEqual([false, false, false, false]);
    expect(Object.values(r.dessin.groupes ?? {}).some(x => 'effets' in x)).toBe(false);
    expect(r.dessin.formes.map(x => x.id)).toEqual(['f1', 'f2', 'f3', 'f4']);
    // Visibles : f1 et le groupe g1 ; f3 (sous un groupe masque) et f4 (masquee) partent sans phrase.
    expect(r.pertes).toEqual([perteEffets(2)]);
    expect(perteEffets(1)).toContain('d’une forme');
    expect(descendreEffets({ vb: [0, 0, 10, 10], formes: [f('f1')] }).pertes).toEqual([]);
  });

  it('un exporteur natif garde les effets ; chaque exporteur de traces les perd par aplatirPour, et le dit', () => {
    const d: DessinSvg = { vb: [0, 0, 100, 100], formes: [f('f1', { effets: flou })] };
    expect(effets.descendre(d, 'natif').dessin).toBe(d);
    for (const capacites of [CAPACITES_PDF, CAPACITES_SVG_DECOUPE, CAPACITES_DXF, CAPACITES_EPS, CAPACITES_PRODUCTION, CAPACITES_PLAT]) {
      const r = aplatirPour(d, capacites);
      expect(estPlat(r.dessin)).toBe(true);
      expect(r.pertes).toEqual([perteEffets(1)]);
      expect(phrasePertes(r.pertes)).toContain('le flou ou l’ombre portée');
    }
    expect(ecrirePdf(aplatirPour(d, CAPACITES_PDF).dessin).length).toBeGreaterThan(0);
  });

  it('passe avant les groupes, qui restent derniers', () => {
    const noms = REGLES_DESCENTE.map(r => r.fonction);
    expect(noms.indexOf('effets')).toBeLessThan(noms.indexOf('groupes'));
    expect(noms[noms.length - 1]).toBe('groupes');
  });

  it('un SVG a effets lu en riche puis descendu redonne les formes de la lecture plate du meme SVG sans filtre', () => {
    for (const nom of ['effets-flou', 'effets-ombre', 'effets-flou-ombre']) {
      const texte = readFileSync(resolve(__dirname, '../../fixtures/svg/v2', nom + '.svg'), 'utf8');
      const r = lireDessin(texte, { modele: 'riche' }), p = lireDessin(texte.replace(/ filter="url\(#[^)]*\)"|filter: ?url\([^)]*\);?/g, ''));
      if ('erreur' in r || 'erreur' in p) throw new Error(nom);
      expect(ecrireDessin(aplatirPour(r.dessin, CAPACITES_PLAT).dessin, 3), nom).toBe(ecrireDessin(p.dessin, 3));
    }
  });
});
