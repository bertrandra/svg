// La descente des decoupes (ADR-0012, etape 5, annexe 5 §4) : ce qu'un exporteur qui ne sait pas rogner recoit. Le remplissage rogne
// exactement par l'intersection booleenne (une feuille toute dedans ne change pas), le trait garde entier et dit quand il est a cheval,
// retire quand il est tout dehors ; les decoupes imbriquees se composent ; le niveau `natif` garde tout ; la regle passe avant celle des
// groupes, et le resultat est plat, bien forme, exportable.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { boiteForme, estPlat, lireDessin, verifierDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { aplatirPour, CAPACITES_PLAT, phrasePertes, REGLES_DESCENTE } from '../../../src/engine/aplatir.js';
import { descendreDecoupes, descenteDecoupes, MSG_DESCENTE_DECOUPES } from '../../../src/engine/descente/decoupes.js';
import { CAPACITES_PDF, CAPACITES_SVG_DECOUPE } from '../../../src/export/capacites.js';
import { au } from '../../../src/util/tableaux.js';
import { ecrirePdf } from '../../../src/export/pdf.js';
import { svgDecoupe } from '../../../src/export/svgs.js';

const SVG = (corps: string) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' + corps + '</svg>';
const riche = (svg: string): DessinSvg => { const r = lireDessin(svg, { modele: 'riche' }); if ('erreur' in r) throw new Error(r.erreur); return r.dessin; };
const CLIP = '<defs><clipPath id="c"><rect x="10" y="10" width="50" height="50"/></clipPath></defs>';

describe('la descente des decoupes', () => {
  it('rogne le remplissage qui deborde, laisse intacte une feuille toute dedans', () => {
    const d = riche(SVG(CLIP + '<g clip-path="url(#c)"><rect x="0" y="0" width="40" height="40" fill="#c81e28"/><rect x="20" y="20" width="10" height="10" fill="#1f5fb0"/></g>'));
    const r = descendreDecoupes(d);
    expect(r.pertes).toEqual([MSG_DESCENTE_DECOUPES.rognees]);
    const [rognee, intacte] = r.dessin.formes;
    expect(boiteForme(rognee ?? au(d.formes, 0))).toEqual({ x: 10, y: 10, l: 30, h: 30 });
    expect(intacte).toBe(d.formes[1]);
    expect(Object.values(r.dessin.groupes ?? {}).some(g => g.decoupe)).toBe(false);
  });

  it('garde un trait a cheval entier, en feuille a part, et le dit ; retire un trait tout dehors', () => {
    const d = riche(SVG(CLIP + '<g clip-path="url(#c)"><rect x="0" y="0" width="40" height="40" fill="#c81e28" stroke="#000" stroke-width="2"/>'
      + '<path d="M70 70L90 90" stroke="#000" stroke-width="2"/><rect x="80" y="0" width="10" height="10" fill="#1f5fb0" stroke="#000" stroke-width="2"/></g>'));
    const r = descendreDecoupes(d);
    expect(r.pertes).toEqual([MSG_DESCENTE_DECOUPES.rognees, MSG_DESCENTE_DECOUPES.traits]);
    expect(r.dessin.formes.map(f => [f.remplissage, f.contour, f.epaisseur])).toEqual([['#c81e28', null, 0], [null, '#000000', 2]]);
    expect(boiteForme(au(r.dessin.formes, 1))).toEqual(boiteForme(au(d.formes, 0)));
    expect(new Set(r.dessin.formes.map(f => f.id)).size).toBe(2);
  });

  it('une decoupe vide efface ce qu elle rogne ; des decoupes imbriquees se composent', () => {
    const vide = riche(SVG('<defs><clipPath id="v"/></defs><g clip-path="url(#v)"><rect width="50" height="50" stroke="#000"/></g><rect x="90" width="5" height="5"/>'));
    expect(descendreDecoupes(vide).dessin.formes).toHaveLength(1);
    const d = riche(SVG(CLIP + '<defs><clipPath id="b"><rect x="30" y="0" width="70" height="100"/></clipPath></defs><g clip-path="url(#c)"><g clip-path="url(#b)"><rect width="100" height="100"/></g></g>'));
    expect(boiteForme(au(descendreDecoupes(d).dessin.formes, 0))).toEqual({ x: 30, y: 10, l: 30, h: 50 });
  });

  it('passe avant les groupes ; natif garde tout ; aplatirPour rend un dessin plat que les exporteurs ecrivent, et dit la perte', () => {
    const fonctions = REGLES_DESCENTE.map(r => r.fonction);
    expect(fonctions.indexOf('decoupes')).toBeLessThan(fonctions.indexOf('groupes'));
    const d = riche(readFileSync(resolve(__dirname, '../../fixtures/svg/corpus/figma-cadre-decoupe.svg'), 'utf8'));
    expect(descenteDecoupes.descendre(d, 'natif').dessin).toBe(d);
    for (const c of [CAPACITES_PLAT, CAPACITES_PDF, CAPACITES_SVG_DECOUPE]) {
      const r = aplatirPour(d, c);
      expect(estPlat(r.dessin)).toBe(true);
      expect(verifierDessin(r.dessin)).toEqual([]);
      expect(phrasePertes(r.pertes)).toContain(MSG_DESCENTE_DECOUPES.rognees);
    }
    // Le cadre blanc, les traits et le texte du cadre restent dedans : seules la vague et le soleil qui debordent sont rognes.
    const r = aplatirPour(d, CAPACITES_PDF);
    for (const f of r.dessin.formes) {
      const b = boiteForme(f);
      expect(b && b.x >= -0.01 && b.y >= -0.01 && b.x + b.l <= 160.01 && b.y + b.h <= 120.01, f.id).toBe(true);
    }
    expect(ecrirePdf(r.dessin).length).toBeGreaterThan(100);
    expect(svgDecoupe(aplatirPour(d, CAPACITES_SVG_DECOUPE).dessin)).toContain('<path');
  });
});
