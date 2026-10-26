// Les couleurs d'un dessin a degrades (ADR-0012, etape 3 ; annexe 1 §6) : les listes et remplacements ignorent le cote peint d'un
// degrade (sa couleur de repli n'est pas une couleur du dessin), sans toucher a l'autre cote ; les palettes ne le recolorent pas ; le
// nuancier, lui, lit les couleurs des arrets, pour leur part du degrade.

import { describe, expect, it } from 'vitest';
import {
  couleursDuDessin, groupesDeCouleur, idsDeCouleur, idsMemeCouleur, memesCouleurs, remplacerCouleur, remplacerCouleurSur,
  translation, transformer, type Degrade, type DessinSvg, type Forme
} from '../../../src/engine/editionSvg.js';
import { couleursProches, fusionnerCouleursProches, idsDeNuancesProches } from '../../../src/engine/edition/couleursProches.js';
import { appliquerPalette, uneCouleur } from '../../../src/engine/palettes.js';
import { apportsDe, nuancierDuDessin } from '../../../src/engine/nuancier.js';

const carre: Forme['d'] = [{ c: 'M', p: [0, 0] }, { c: 'L', p: [10, 0] }, { c: 'L', p: [10, 10] }, { c: 'L', p: [0, 10] }, { c: 'Z', p: [] }];
const forme = (id: string, p: Partial<Forme> = {}): Forme => ({ id, d: carre, remplissage: '#c81e28', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, ...p });
const degrade: Degrade = { genre: 'lineaire', x1: 0, y1: 0, x2: 10, y2: 0, arrets: [{ position: 0, couleur: '#1f5fb0' }, { position: 0.5, couleur: '#ffffff', opacite: 0.5 }, { position: 1, couleur: '#f2b705' }] };

// f1 : rouge uni ; f2 : degrade au fond (repli rouge, par construction) et trait rouge uni ; f3 : fond bleu uni, trait degrade (repli rouge).
const dessin: DessinSvg = {
  vb: [0, 0, 10, 10],
  formes: [
    forme('f1'),
    forme('f2', { peintureRemplissage: degrade, contour: '#c81e28', epaisseur: 1 }),
    forme('f3', { remplissage: '#1f5fb0', contour: '#c81e28', epaisseur: 1, peintureContour: degrade })
  ]
};

describe('les listes et remplacements ignorent le cote peint d un degrade', () => {
  it('les couleurs du dessin, leurs groupes, leurs formes', () => {
    expect(couleursDuDessin(dessin)).toEqual([{ couleur: '#c81e28', formes: 2 }, { couleur: '#1f5fb0', formes: 1 }]);
    expect(groupesDeCouleur(dessin, 'remplissage').map(g => [g.couleur, g.ids])).toEqual([['#1f5fb0', ['f3']], ['#c81e28', ['f1']]]);
    expect(groupesDeCouleur(dessin, 'contour').map(g => [g.couleur, g.ids])).toEqual([['#c81e28', ['f2']]]);
    expect(idsDeCouleur(dessin, '#c81e28')).toEqual(['f1', 'f2']);
    expect(idsMemeCouleur(dessin, 'f2')).toEqual(['f2']);
    expect(couleursProches(dessin, 0.5).flatMap(g => [g.cible, ...g.membres])).not.toContain('#808080');
    expect(idsDeNuancesProches(dessin, '#c81e28', 0.01)).toEqual(['f1', 'f2']);
  });

  it('un remplacement, une fusion, une palette ne changent ni le degrade ni sa couleur de repli', () => {
    const r = remplacerCouleur(dessin, '#c81e28', '#000000');
    expect(r.formes.map(f => [f.remplissage, f.contour])).toEqual([['#000000', null], ['#c81e28', '#000000'], ['#1f5fb0', '#c81e28']]);
    expect(r.formes[1]?.peintureRemplissage).toBe(degrade);
    expect(remplacerCouleurSur(dessin, '#c81e28', '#000000', 'remplissage').formes[1]).toBe(dessin.formes[1]);
    expect(remplacerCouleurSur(dessin, '#c81e28', '#000000', 'contour').formes[2]).toBe(dessin.formes[2]);
    const fusion = fusionnerCouleursProches({ ...dessin, formes: [...dessin.formes, forme('f4', { remplissage: '#c91f27' })] }, 0.05);
    expect(fusion.dessin.formes[1]).toBe(dessin.formes[1]);
    expect(uneCouleur(dessin, '#00ff00').formes.map(f => [f.remplissage, f.contour])).toEqual([['#00ff00', null], ['#c81e28', '#00ff00'], ['#00ff00', '#c81e28']]);
    expect(appliquerPalette(dessin, ['#111111', '#222222']).formes[1]?.remplissage).toBe('#c81e28');
  });

  it('poser ou retirer un degrade change les couleurs lues ; le deplacer, non', () => {
    const sans = { ...dessin, formes: dessin.formes.map(f => { const { peintureRemplissage: _p, ...reste } = f; void _p; return reste; }) };
    expect(memesCouleurs(dessin.formes, sans.formes)).toBe(false);
    expect(memesCouleurs(dessin.formes, transformer(dessin, ['f2', 'f3'], translation(3, 4)).formes)).toBe(true);
  });
});

describe('le nuancier lit les arrets', () => {
  it('une forme a degrade apporte chaque arret pour sa part, a son opacite, jamais la couleur de repli', () => {
    const a = apportsDe(forme('x', { peintureRemplissage: degrade, remplissage: '#808080' }));
    expect(a.map(x => [x.hex, x.opacite, x.surface])).toEqual([['#1f5fb0', 1, 25], ['#ffffff', 0.5, 50], ['#f2b705', 1, 25]]);
    const n = nuancierDuDessin({ vb: [0, 0, 10, 10], formes: [forme('x', { peintureRemplissage: degrade, remplissage: '#808080' })] });
    expect(n.teintes.map(t => t.hex).sort()).toEqual(['#1f5fb0', '#f2b705', '#ffffff']);
  });
});
