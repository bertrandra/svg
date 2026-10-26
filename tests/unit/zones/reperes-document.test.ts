import { describe, expect, it } from 'vitest';
import { ajouterForme, ajouterRepere, rectangle, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { svgExporte } from '../../../src/export/svgs.js';
import { svgDocument } from '../../../src/zones/actionsProduction.js';
import { CHOIX_CRICUT_DEFAUT } from '../../../src/model/contextes.js';

// Le document enregistre porte les reperes (ADR-0038) apres la marque du contexte, et seulement s'il y en a ; un export jamais.

const base: DessinSvg = ajouterForme({ vb: [0, 0, 100, 100], formes: [] }, rectangle(10, 10, 20, 20), { remplissage: '#000000', contour: null, epaisseur: 1 }).dessin;

describe('les reperes dans le document', () => {
  it('ne changent rien au document d un dessin sans repere', () => {
    expect(svgDocument(base, { contexte: 'generique' })).not.toContain('data-ed-reperes');
  });

  it('suivent la marque du contexte sur la racine', () => {
    const d = ajouterRepere(base, 'v', 50);
    const generique = svgDocument(d, { contexte: 'generique' });
    expect(generique).toMatch(/^<svg [^>]* data-ed-reperes="v:50">/);
    const cricut = svgDocument(d, { contexte: 'cricut', ...CHOIX_CRICUT_DEFAUT });
    expect(cricut).toMatch(/data-ed-contexte="cricut"[^>]* data-ed-reperes="v:50">/);
  });

  it('ne passent jamais dans un export', () => {
    expect(svgExporte(ajouterRepere(base, 'h', 5), { precision: 3, optimise: false, taille: null })).not.toContain('reperes');
  });
});
