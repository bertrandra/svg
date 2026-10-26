// La descente des degrades (ADR-0012, etape 3 ; annexe 5 §4) : pour chaque exporteur qui ne sait pas peindre un degrade, la peinture
// part et la couleur de repli reste ; le dessin descendu est plat, bien forme, et son ecriture se relit en mode plat sans refus. Un
// exporteur « natif » (le PDF a l'etape 13) garderait le degrade.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ecrireDessin, estPlat, lireDessin, verifierDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { aplatirPour, CAPACITES_PLAT, REGLES_DESCENTE, type DessinPlat } from '../../../src/engine/aplatir.js';
import { degrades, PERTE_DEGRADES } from '../../../src/engine/descente/degrades.js';
import { CAPACITES_DXF, CAPACITES_EPS, CAPACITES_PDF, CAPACITES_PRODUCTION, CAPACITES_SVG_DECOUPE } from '../../../src/export/capacites.js';
import { ecrirePdf } from '../../../src/export/pdf.js';
import { svgDecoupe } from '../../../src/export/svgs.js';

const riche = (nom: string): DessinSvg => {
  const r = lireDessin(readFileSync(resolve(__dirname, '../../fixtures/svg/v2', nom + '.svg'), 'utf8'), { modele: 'riche' });
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};

const EXPORTEURS = { 'SVG à plat': CAPACITES_PLAT, PDF: CAPACITES_PDF, 'SVG de découpe': CAPACITES_SVG_DECOUPE, DXF: CAPACITES_DXF, EPS: CAPACITES_EPS, production: CAPACITES_PRODUCTION };

describe('la descente des degrades', () => {
  it('est inscrite, avant les groupes (elle est seule a l etape 3)', () => {
    expect(REGLES_DESCENTE[0]).toBe(degrades);
  });

  it('chaque exporteur d aujourd hui recoit la couleur de repli, un dessin plat et bien forme, et la perte dite', () => {
    for (const nom of ['degrades-chaine', 'degrades-contour', 'degrades-opacite', 'degrades-transformes']) {
      const d = riche(nom);
      for (const [exporteur, capacites] of Object.entries(EXPORTEURS)) {
        const { dessin, pertes } = aplatirPour(d, capacites);
        expect(pertes, nom + ' ' + exporteur).toEqual([PERTE_DEGRADES]);
        expect(estPlat(dessin), nom + ' ' + exporteur).toBe(true);
        expect(verifierDessin(dessin)).toEqual([]);
        expect(dessin.formes.map(f => [f.id, f.remplissage, f.contour]), nom).toEqual(d.formes.map(f => [f.id, f.remplissage, f.contour]));
        const relu = lireDessin(ecrireDessin(dessin, 3));
        expect('erreur' in relu ? relu.erreur : '', nom + ' ' + exporteur).toBe('');
      }
    }
  });

  it('le PDF et le SVG de decoupe ecrivent la couleur de repli', () => {
    const d = riche('degrades-chaine');
    const plat = aplatirPour(d, CAPACITES_PDF).dessin;
    // Le PDF ne lit que les couleurs unies : le dessin riche et le dessin descendu y donnent les memes octets, ceux de la couleur de repli.
    expect(ecrirePdf(plat)).toEqual(ecrirePdf(d as DessinPlat));
    expect(svgDecoupe(aplatirPour(d, CAPACITES_SVG_DECOUPE).dessin)).not.toContain('url(');
  });

  it('niveau natif : le degrade reste ; un dessin sans degrade passe tel quel', () => {
    const d = riche('degrades-radial');
    expect(degrades.descendre(d, 'natif')).toEqual({ dessin: d, pertes: [] });
    const sans = { ...d, formes: d.formes.map(f => { const { peintureRemplissage: _p, ...reste } = f; void _p; return reste; }) };
    expect(degrades.descendre(sans, 'approche').dessin).toBe(sans);
  });
});
