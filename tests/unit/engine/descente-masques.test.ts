// La descente des masques d'opacite (ADR-0012, etape 6, annexe 5 §4) : un exporteur de traces (PDF d'aujourd'hui, SVG de decoupe,
// DXF, EPS, fichiers de production, SVG « a plat ») ne compose pas une luminance ; le masque part, ce qu'il masquait est exporte entier,
// et c'est dit (rien pour ce qui ne s'exporte pas). Un exporteur natif le garde. La regle passe avant celle des groupes.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ecrireDessin, estPlat, lireDessin, verifierDessin, type Chemin, type DessinSvg, type Forme, type Groupe, type Masque } from '../../../src/engine/editionSvg.js';
import { aplatirPour, CAPACITES_PLAT, phrasePertes, REGLES_DESCENTE } from '../../../src/engine/aplatir.js';
import { descendreMasques, descenteMasques, MSG_DESCENTE_MASQUES } from '../../../src/engine/descente/masques.js';
import { CAPACITES_DXF, CAPACITES_EPS, CAPACITES_PDF, CAPACITES_PRODUCTION, CAPACITES_SVG_DECOUPE } from '../../../src/export/capacites.js';
import { ecrirePdf } from '../../../src/export/pdf.js';
import { svgDecoupe } from '../../../src/export/svgs.js';

const carre = (x: number, y: number): Chemin => [{ c: 'M', p: [x, y] }, { c: 'L', p: [x + 10, y] }, { c: 'L', p: [x + 10, y + 10] }, { c: 'L', p: [x, y + 10] }, { c: 'Z', p: [] }];
const f = (id: string, p: Partial<Forme> = {}): Forme => ({ id, d: carre(0, 0), remplissage: '#c81e28', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, ...p });
const g = (id: string, p: Partial<Groupe> = {}): Groupe => ({ id, visible: true, verrouille: false, ...p });
const masque = (id: string): Masque => ({ contenu: { formes: [f(id, { remplissage: '#ffffff' })] }, type: 'luminance', region: { x: 0, y: 0, l: 10, h: 10 } });

describe('la descente des masques', () => {
  it('retire les masques des groupes, garde ce qu ils masquaient, et le dit pour un groupe qui s exporte', () => {
    const d: DessinSvg = {
      vb: [0, 0, 100, 100],
      formes: [f('f1', { parent: 'g1' }), f('f2', { parent: 'g2', d: carre(50, 0) })],
      groupes: { g1: g('g1', { masque: masque('f8'), opacite: 0.5 }), g2: g('g2', { visible: false, masque: masque('f9') }) }
    };
    const r = descendreMasques(d);
    expect(Object.values(r.dessin.groupes ?? {}).some(x => 'masque' in x)).toBe(false);
    expect(r.dessin.groupes?.g1).toEqual(g('g1', { opacite: 0.5 }));
    expect(r.dessin.formes).toBe(d.formes);
    expect(r.pertes).toEqual([MSG_DESCENTE_MASQUES]);
    // Le seul masque est sous un groupe masque : il part sans phrase.
    expect(descendreMasques({ ...d, groupes: { ...d.groupes, g1: g('g1') } }).pertes).toEqual([]);
    const sans: DessinSvg = { vb: [0, 0, 10, 10], formes: [f('f1', { parent: 'g1' })], groupes: { g1: g('g1') } };
    expect(descendreMasques(sans).dessin).toBe(sans);
  });

  it('un exporteur natif garde les masques ; chaque exporteur de traces les perd par aplatirPour, et le dit', () => {
    const d = lireDessin(readFileSync(resolve(__dirname, '../../fixtures/svg/v2/masques-degrade.svg'), 'utf8'), { modele: 'riche' });
    if ('erreur' in d) throw new Error(d.erreur);
    expect(descenteMasques.descendre(d.dessin, 'natif').dessin).toBe(d.dessin);
    for (const capacites of [CAPACITES_PDF, CAPACITES_SVG_DECOUPE, CAPACITES_DXF, CAPACITES_EPS, CAPACITES_PRODUCTION, CAPACITES_PLAT]) {
      const r = aplatirPour(d.dessin, capacites);
      expect(estPlat(r.dessin)).toBe(true);
      expect(verifierDessin(r.dessin)).toEqual([]);
      expect(r.pertes).toContain(MSG_DESCENTE_MASQUES);
      expect(phrasePertes(r.pertes)).toContain('les masques d’opacité');
      expect(r.dessin.formes.map(x => x.id)).toEqual(d.dessin.formes.map(x => x.id));
    }
    expect(ecrirePdf(aplatirPour(d.dessin, CAPACITES_PDF).dessin).length).toBeGreaterThan(100);
    expect(svgDecoupe(aplatirPour(d.dessin, CAPACITES_SVG_DECOUPE).dessin)).toContain('<path');
  });

  it('passe avant les groupes, qui restent derniers', () => {
    const noms = REGLES_DESCENTE.map(r => r.fonction);
    expect(noms.indexOf('masques')).toBeLessThan(noms.indexOf('groupes'));
    expect(noms[noms.length - 1]).toBe('groupes');
  });

  it('un SVG a masques lu en riche puis descendu redonne les formes de la lecture plate du meme SVG sans masque', () => {
    for (const nom of ['masques-groupe', 'masques-feuille', 'masques-alpha', 'masques-use']) {
      const texte = readFileSync(resolve(__dirname, '../../fixtures/svg/v2', nom + '.svg'), 'utf8');
      const r = lireDessin(texte, { modele: 'riche' }), p = lireDessin(texte.replace(/ mask="url\(#[^)]*\)"/g, ''));
      if ('erreur' in r || 'erreur' in p) throw new Error(nom);
      expect(ecrireDessin(aplatirPour(r.dessin, CAPACITES_PLAT).dessin, 3), nom).toBe(ecrireDessin(p.dessin, 3));
    }
  });
});
