// La descente des groupes (ADR-0012, etape 1, annexe 5 §4) : ce qu'un exporteur qui ne connait pas les groupes recoit. Les feuilles
// dans l'ordre, celles d'un groupe masque masquees, l'opacite des groupes multipliee sur leurs feuilles, et l'approximation dite
// quand elles se recouvrent. La loi de l'annexe 7 §3, point 5 : la descente de tout dessin riche est plate, bien formee, et son
// ecriture se relit en mode plat sans refus.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ecrireDessin, estPlat, lireDessin, verifierDessin, type Chemin, type DessinSvg, type Forme, type Groupe } from '../../../src/engine/editionSvg.js';
import { aplatirPour, CAPACITES_PLAT, phrasePertes, REGLES_DESCENTE } from '../../../src/engine/aplatir.js';
import { descendreGroupes, MSG_OPACITE_COMPOSEE } from '../../../src/engine/descente/groupes.js';
import { CAPACITES_DXF, CAPACITES_EPS, CAPACITES_PDF, CAPACITES_PRODUCTION, CAPACITES_SVG_DECOUPE } from '../../../src/export/capacites.js';
import { ecrirePdf } from '../../../src/export/pdf.js';
import { svgDecoupe } from '../../../src/export/svgs.js';
import { ecrireDxf } from '../../../src/export/dxf.js';
import { ecrireEps } from '../../../src/export/eps.js';

const carre = (x: number, y: number): Chemin => [{ c: 'M', p: [x, y] }, { c: 'L', p: [x + 10, y] }, { c: 'L', p: [x + 10, y + 10] }, { c: 'L', p: [x, y + 10] }, { c: 'Z', p: [] }];
const f = (id: string, p: Partial<Forme> = {}): Forme => ({ id, d: carre(0, 0), remplissage: '#c81e28', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, ...p });
const g = (id: string, p: Partial<Groupe> = {}): Groupe => ({ id, visible: true, verrouille: false, ...p });

const dessin = (recouvrement: boolean): DessinSvg => ({
  vb: [0, 0, 100, 100],
  formes: [
    f('f1', { parent: 'g1', opacite: 0.5 }), f('f2', { parent: 'g2', d: carre(recouvrement ? 5 : 50, 0) }), f('f3', { parent: 'g3', d: carre(0, 50) }), f('f4', { d: carre(50, 50) })
  ],
  groupes: { g1: g('g1', { opacite: 0.5 }), g2: g('g2', { parent: 'g1', opacite: 0.8 }), g3: g('g3', { visible: false }) }
});

describe('la descente des groupes', () => {
  it('multiplie les opacites, masque les formes d un groupe masque, retire la structure', () => {
    const r = descendreGroupes(dessin(false));
    expect(r.pertes).toEqual([]);
    expect(r.dessin.groupes).toBeUndefined();
    expect(r.dessin.formes.map(x => [x.id, x.opacite, x.visible, 'parent' in x])).toEqual([
      ['f1', 0.25, true, false], ['f2', 0.4, true, false], ['f3', 1, false, false], ['f4', 1, true, false]
    ]);
    expect(estPlat(r.dessin)).toBe(true);
  });

  it('dit l approximation quand des formes d un groupe a opacite se recouvrent, ou qu un contour recouvre un fond', () => {
    expect(descendreGroupes(dessin(true)).pertes).toEqual([MSG_OPACITE_COMPOSEE]);
    const trait: DessinSvg = { vb: [0, 0, 10, 10], formes: [f('f1', { parent: 'g1', contour: '#000000', epaisseur: 1 })], groupes: { g1: g('g1', { opacite: 0.5 }) } };
    expect(descendreGroupes(trait).pertes).toEqual([MSG_OPACITE_COMPOSEE]);
    // Un groupe masque ne compte pas : rien de lui ne s'exporte.
    const masque: DessinSvg = { ...dessin(true), groupes: { ...dessin(true).groupes, g1: g('g1', { opacite: 0.5, visible: false }) } };
    expect(descendreGroupes(masque).pertes).toEqual([]);
  });

  it('est inscrite en dernier dans REGLES_DESCENTE, et aplatirPour la passe a tout exporteur', () => {
    expect(REGLES_DESCENTE[REGLES_DESCENTE.length - 1]?.fonction).toBe('groupes');
    for (const c of [CAPACITES_PLAT, CAPACITES_SVG_DECOUPE, CAPACITES_DXF, CAPACITES_EPS, CAPACITES_PRODUCTION]) {
      const r = aplatirPour(dessin(true), c);
      expect(r.pertes).toEqual([MSG_OPACITE_COMPOSEE]);
      expect(estPlat(r.dessin)).toBe(true);
    }
    // Le PDF ecrit l'opacite du groupe en groupe de transparence (etape 13a) : exacte, rien a dire.
    const pdf = aplatirPour(dessin(true), CAPACITES_PDF);
    expect(pdf.pertes).toEqual([]);
    expect(estPlat(pdf.dessin)).toBe(true);
    expect(pdf.scene?.noeuds.some(n => n.genre === 'portee' && n.opacite !== undefined)).toBe(true);
    expect(phrasePertes([])).toBe('');
    expect(phrasePertes(['a', 'b'])).toBe('Approché par ce format : a ; b.');
    expect(phrasePertes(['a', 'b', 'c'], ['b'])).toBe('Approché par ce format : a ; c. Perdu dans ce format : b.');
    expect(phrasePertes(['b'], ['b'])).toBe('Perdu dans ce format : b.');
  });

  it('un dessin riche construit a la main s exporte en PDF, DXF, EPS et SVG de decoupe, et dit ce qui est approche', () => {
    const r = aplatirPour(dessin(true), CAPACITES_EPS);
    expect(phrasePertes(r.pertes)).toContain('une opacité de groupe composée sur ses formes');
    expect(ecrirePdf(aplatirPour(dessin(true), CAPACITES_PDF).dessin).length).toBeGreaterThan(100);
    expect(ecrireDxf(aplatirPour(dessin(true), CAPACITES_DXF).dessin)).toContain('ENTITIES');
    expect(ecrireEps(aplatirPour(dessin(true), CAPACITES_EPS).dessin).eps).toContain('%!PS-Adobe');
    // La forme d'un groupe masque ne part pas, comme a l'enregistrement.
    expect((svgDecoupe(aplatirPour(dessin(false), CAPACITES_SVG_DECOUPE).dessin).match(/<path /g) ?? []).length).toBe(3);
  });

  it('sous un groupe, le degrade descend en couleur de repli, l image part, l opacite du groupe se multiplie ; tout est dit', () => {
    const lu = lireDessin(readFileSync(resolve(__dirname, '../../fixtures/svg/v2/groupes-degrade-image.svg'), 'utf8'), { modele: 'riche' });
    if ('erreur' in lu) throw new Error(lu.erreur);
    const r = aplatirPour(lu.dessin, CAPACITES_SVG_DECOUPE);
    expect(estPlat(r.dessin)).toBe(true);
    expect(verifierDessin(r.dessin)).toEqual([]);
    expect(r.dessin.formes.map(x => [x.id, x.remplissage, x.opacite])).toEqual(
      lu.dessin.formes.filter(x => !x.image).map(x => [x.id, x.remplissage, x.parent === 'g1' || x.parent === 'g2' ? 0.8 : 1])
    );
    expect(r.pertes.length).toBeGreaterThanOrEqual(2);
    expect(phrasePertes(r.pertes)).toMatch(/image/);
    // L'image est perdue, le degrade approche : la phrase le dit a part.
    expect(r.perdus.some(p => /image/.test(p))).toBe(true);
    expect(phrasePertes(r.pertes, r.perdus)).toMatch(/^Approché par ce format : les dégradés[^.]*\. Perdu dans ce format : une image/);
    // Le PDF (etape 13a) garde le degrade et l'image dans sa scene ; l'opacite du groupe y est multipliee comme ailleurs.
    const pdf = aplatirPour(lu.dessin, CAPACITES_PDF);
    expect(pdf.perdus).toEqual([]);
    const noeuds = pdf.scene?.noeuds ?? [];
    expect(noeuds.filter(n => n.genre === 'image').map(n => n.genre === 'image' && n.opacite)).toEqual([1]);
    // Le groupe « Ciel » (0,8) a deux feuilles : un groupe de transparence, ses feuilles a leur opacite propre.
    const ciel = noeuds.find(n => n.genre === 'portee');
    expect(ciel?.genre === 'portee' && ciel.opacite).toBe(0.8);
    expect(ciel?.genre === 'portee' && ciel.enfants.some(n => n.genre === 'forme' && n.fond !== undefined && n.trait !== undefined && n.forme.opacite === 1)).toBe(true);
    expect(ecrirePdf(pdf.dessin).length).toBeGreaterThan(100);
  });

  it('la descente de chaque fixture lue en riche est plate, bien formee, et s ecrit en un SVG que la lecture plate accepte', () => {
    const dossier = resolve(__dirname, '../../fixtures/svg');
    const noms = [...readdirSync(dossier).filter(n => n.endsWith('.svg')), ...readdirSync(join(dossier, 'v2')).filter(n => n.endsWith('.svg')).map(n => 'v2/' + n)];
    let riches = 0;
    for (const nom of noms) {
      const lu = lireDessin(readFileSync(join(dossier, nom), 'utf8'), { modele: 'riche' });
      if ('erreur' in lu || estPlat(lu.dessin)) continue;
      riches++;
      const r = aplatirPour(lu.dessin, CAPACITES_PLAT);
      expect(estPlat(r.dessin), nom).toBe(true);
      expect(verifierDessin(r.dessin), nom).toEqual([]);
      const relu = lireDessin(ecrireDessin(r.dessin, 3));
      if (r.dessin.formes.some(x => x.visible)) expect('erreur' in relu ? relu.erreur : '', nom).toBe('');
    }
    expect(riches).toBeGreaterThan(20);
  });
});
