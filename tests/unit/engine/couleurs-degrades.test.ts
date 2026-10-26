// Les couleurs d'un dessin a degrades et a motifs (ADR-0012, etape 13d ; annexe 1 §6) : les listes, la selection par couleur, les
// remplacements, les nuances proches et les palettes lisent et changent les arrets des degrades et les couleurs des tuiles de motif,
// jamais la couleur de repli, qu'ils recalculent comme la lecture ; une peinture partagee le reste ; le contenu d'un masque n'y entre
// pas. Le nuancier, lui, lit les arrets pour leur part du degrade (etape 3).

import { describe, expect, it } from 'vitest';
import {
  couleurDeRepli, couleursDArrets, couleursDeForme, couleursDuDessin, groupesDeCouleur, idsDeCouleur, idsMemeCouleur, memesCouleurs, modifierArret,
  remplacerCouleur, remplacerCouleurSur, translation, transformer, type Contenu, type Degrade, type DessinSvg, type Forme, type Motif
} from '../../../src/engine/editionSvg.js';
import { couleursProches, fusionnerCouleursProches, idsDeNuancesProches } from '../../../src/engine/edition/couleursProches.js';
import { couleurDeRepliMotif, estMotif } from '../../../src/engine/edition/fonctions/motifs.js';
import { estDegrade } from '../../../src/engine/edition/degrades.js';
import { appliquerPalette, uneCouleur } from '../../../src/engine/palettes.js';
import { apportsDe, nuancierDuDessin } from '../../../src/engine/nuancier.js';

const carre: Forme['d'] = [{ c: 'M', p: [0, 0] }, { c: 'L', p: [10, 0] }, { c: 'L', p: [10, 10] }, { c: 'L', p: [0, 10] }, { c: 'Z', p: [] }];
const forme = (id: string, p: Partial<Forme> = {}): Forme => ({ id, d: carre, remplissage: '#c81e28', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, ...p });
const degrade: Degrade = { genre: 'lineaire', x1: 0, y1: 0, x2: 10, y2: 0, arrets: [{ position: 0, couleur: '#1f5fb0' }, { position: 0.5, couleur: '#ffffff', opacite: 0.5 }, { position: 1, couleur: '#f2b705' }] };
const repli = couleurDeRepli(degrade.arrets);
// Une tuile : un rouge, un vert cerne de bleu, et une feuille cachee (elle ne peint rien : ni listee, ni comptee).
const tuile: Contenu = { formes: [forme('t1'), forme('t2', { remplissage: '#2a9d8f', contour: '#1f5fb0', epaisseur: 1 }), forme('t3', { remplissage: '#abcdef', visible: false })] };
const motif: Motif = { genre: 'motif', x: 0, y: 0, l: 10, h: 10, contenu: tuile };

// f1 : rouge uni ; f2 : degrade au fond, trait rouge uni ; f3 : fond bleu uni, le meme degrade au trait ; f4 : motif au fond.
const dessin: DessinSvg = {
  vb: [0, 0, 10, 10],
  formes: [
    forme('f1'),
    forme('f2', { remplissage: repli, peintureRemplissage: degrade, contour: '#c81e28', epaisseur: 1 }),
    forme('f3', { remplissage: '#1f5fb0', contour: repli, epaisseur: 1, peintureContour: degrade }),
    forme('f4', { remplissage: couleurDeRepliMotif(tuile), peintureRemplissage: motif })
  ]
};
const f = (d: DessinSvg, i: number): Forme => { const x = d.formes[i]; if (!x) throw new Error('forme ' + i); return x; };
const degradeDu = (x: Forme, cote: 'remplissage' | 'contour'): Degrade => {
  const p = cote === 'remplissage' ? x.peintureRemplissage : x.peintureContour;
  if (!estDegrade(p)) throw new Error('pas un degrade');
  return p;
};
const motifDu = (x: Forme): Motif => { const p = x.peintureRemplissage ?? x.peintureContour; if (!estMotif(p)) throw new Error('pas un motif'); return p; };

describe('les listes lisent les arrets et les tuiles, jamais la couleur de repli', () => {
  it('les couleurs du dessin : chaque cote compte une fois par couleur', () => {
    expect(couleursDuDessin(dessin)).toEqual([
      { couleur: '#1f5fb0', formes: 4 }, { couleur: '#c81e28', formes: 3 }, { couleur: '#f2b705', formes: 2 }, { couleur: '#ffffff', formes: 2 }, { couleur: '#2a9d8f', formes: 1 }
    ]);
    expect(couleursDuDessin(dessin).map(c => c.couleur)).not.toContain(repli);
  });

  it('les groupes par couleur, sur le fond, le trait ou les deux', () => {
    expect(groupesDeCouleur(dessin, 'remplissage').map(g => [g.couleur, g.ids])).toEqual([
      ['#1f5fb0', ['f2', 'f3', 'f4']], ['#c81e28', ['f1', 'f4']], ['#2a9d8f', ['f4']], ['#f2b705', ['f2']], ['#ffffff', ['f2']]
    ]);
    expect(groupesDeCouleur(dessin, 'contour').map(g => [g.couleur, g.ids])).toEqual([['#1f5fb0', ['f3']], ['#c81e28', ['f2']], ['#f2b705', ['f3']], ['#ffffff', ['f3']]]);
    expect(groupesDeCouleur(dessin).find(g => g.couleur === '#1f5fb0')?.ids).toEqual(['f2', 'f3', 'f4']);
    expect(couleursDeForme(f(dessin, 2), 'tout')).toEqual(['#1f5fb0', '#ffffff', '#f2b705']);
  });

  it('une forme dont un arret ou une feuille de tuile porte la couleur est de cette couleur', () => {
    expect(idsDeCouleur(dessin, '#c81e28')).toEqual(['f1', 'f2', 'f4']);
    expect(idsDeCouleur(dessin, '#ffffff')).toEqual(['f2', 'f3']);
    expect(idsDeCouleur(dessin, '#abcdef')).toEqual([]);
    expect(idsDeCouleur(dessin, repli)).toEqual([]);
  });

  it('la meme couleur qu un modele : le meme cote porte toutes ses couleurs', () => {
    expect(idsMemeCouleur(dessin, 'f1')).toEqual(['f1', 'f4']);
    expect(idsMemeCouleur(dessin, 'f2')).toEqual(['f2']);
    expect(idsMemeCouleur(dessin, 'f3')).toEqual(['f2', 'f3', 'f4']);
    expect(idsMemeCouleur(dessin, 'f4')).toEqual(['f4']);
  });

  it('la ligne « Dégradés » compte les couleurs de leurs arrets', () => {
    expect(couleursDArrets(dessin, ['f2', 'f3'])).toBe(3);
    expect(couleursDArrets(dessin, ['f2', 'f3'], 'contour')).toBe(3);
    expect(couleursDArrets(dessin, ['f1'])).toBe(0);
  });

  it('le contenu d un masque n est pas une couleur du dessin', () => {
    const masque: DessinSvg = {
      vb: [0, 0, 10, 10],
      formes: [forme('m1', { parent: 'g1', remplissage: '#2a9d8f' })],
      groupes: { g1: { id: 'g1', visible: true, verrouille: false, masque: { type: 'luminance', region: { x: 0, y: 0, l: 10, h: 10 }, contenu: { formes: [forme('k1')] } } } }
    };
    expect(couleursDuDessin(masque)).toEqual([{ couleur: '#2a9d8f', formes: 1 }]);
    expect(idsDeCouleur(masque, '#c81e28')).toEqual([]);
    expect(remplacerCouleur(masque, '#c81e28', '#000000')).toBe(masque);
    expect(uneCouleur(masque, '#000000').groupes).toBe(masque.groupes);
  });
});

describe('les remplacements changent les arrets et les tuiles, et recalculent la couleur de repli', () => {
  it('partout : le degrade partage le reste, la tuile change, le repli suit', () => {
    const r = remplacerCouleur(dessin, '#1f5fb0', '#264653');
    const fond = degradeDu(f(r, 1), 'remplissage');
    expect(fond.arrets.map(a => a.couleur)).toEqual(['#264653', '#ffffff', '#f2b705']);
    expect(fond.arrets[1]).toBe(degrade.arrets[1]);
    expect(degradeDu(f(r, 2), 'contour')).toBe(fond);
    expect(f(r, 1).remplissage).toBe(couleurDeRepli(fond.arrets));
    expect(f(r, 1).remplissage).not.toBe(repli);
    expect(f(r, 2).contour).toBe(f(r, 1).remplissage);
    expect(f(r, 2).remplissage).toBe('#264653');
    const t = motifDu(f(r, 3)).contenu;
    expect(t.formes.map(x => [x.remplissage, x.contour])).toEqual([['#c81e28', null], ['#2a9d8f', '#264653'], ['#abcdef', null]]);
    expect(t.formes[0]).toBe(tuile.formes[0]);
    expect(f(r, 3).remplissage).toBe(couleurDeRepliMotif(t));
    expect(f(r, 0)).toBe(f(dessin, 0));
  });

  it('une feuille de tuile cachee change aussi (elle reviendrait sinon dans l ancienne couleur)', () => {
    const r = remplacerCouleur(dessin, '#abcdef', '#000000');
    expect(motifDu(f(r, 3)).contenu.formes[2]?.remplissage).toBe('#000000');
    expect(f(r, 3).remplissage).toBe(f(dessin, 3).remplissage);
  });

  it('sur le fond seul ou le trait seul : l autre cote ne bouge pas', () => {
    const fond = remplacerCouleurSur(dessin, '#1f5fb0', '#264653', 'remplissage');
    expect(f(fond, 2).peintureContour).toBe(degrade);
    expect(f(fond, 2).remplissage).toBe('#264653');
    expect(degradeDu(f(fond, 1), 'remplissage').arrets[0]?.couleur).toBe('#264653');
    const trait = remplacerCouleurSur(dessin, '#1f5fb0', '#264653', 'contour');
    expect(f(trait, 1)).toBe(f(dessin, 1));
    expect(f(trait, 3)).toBe(f(dessin, 3));
    expect(degradeDu(f(trait, 2), 'contour').arrets[0]?.couleur).toBe('#264653');
    expect(f(trait, 2).remplissage).toBe('#1f5fb0');
  });

  it('un arret prend un code en minuscules, et ne devient jamais « sans couleur »', () => {
    expect(degradeDu(f(remplacerCouleur(dessin, '#ffffff', '#ABCDEF'), 1), 'remplissage').arrets[1]).toEqual({ position: 0.5, couleur: '#abcdef', opacite: 0.5 });
    expect(remplacerCouleur(dessin, '#ffffff', null)).toBe(dessin);
    expect(remplacerCouleur(dessin, '#1f5fb0', '#1f5fb0')).toBe(dessin);
    expect(remplacerCouleur(dessin, repli, '#000000')).toBe(dessin);
  });

  it('les nuances proches se lisent et se fondent sur les arrets ; une forme verrouillee garde les siens', () => {
    const proche: Degrade = { ...degrade, arrets: [{ position: 0, couleur: '#c91f27' }, { position: 1, couleur: '#ffffff' }] };
    const d: DessinSvg = { vb: [0, 0, 10, 10], formes: [forme('a'), forme('b'), forme('c', { peintureRemplissage: proche, remplissage: couleurDeRepli(proche.arrets) }), forme('v', { peintureRemplissage: proche, remplissage: couleurDeRepli(proche.arrets), verrouille: true })] };
    expect(couleursProches(d, 0.02)).toEqual([{ cible: '#c81e28', membres: ['#c91f27'], formes: 2 }]);
    expect(idsDeNuancesProches(d, '#c81e28', 0.01)).toEqual(['a', 'b', 'c']);
    const r = fusionnerCouleursProches(d, 0.02);
    expect(r).toMatchObject({ formes: 1, fusionnees: 0, conservees: 1 });
    expect(degradeDu(f(r.dessin, 2), 'remplissage').arrets.map(a => a.couleur)).toEqual(['#c81e28', '#ffffff']);
    expect(f(r.dessin, 3)).toBe(f(d, 3));
  });
});

describe('les palettes portent sur les arrets et les tuiles', () => {
  it('une palette se pose en une passe : deux couleurs s echangent sans s enchainer, aucun jeton ne reste', () => {
    const d: DessinSvg = { vb: [0, 0, 10, 10], formes: [forme('a'), forme('b'), forme('c', { remplissage: repli, peintureRemplissage: { ...degrade, arrets: [{ position: 0, couleur: '#c81e28' }, { position: 1, couleur: '#1f5fb0' }] } })] };
    const r = appliquerPalette(d, ['#1f5fb0', '#c81e28']);
    expect(r.formes.slice(0, 2).map(x => x.remplissage)).toEqual(['#1f5fb0', '#1f5fb0']);
    expect(degradeDu(f(r, 2), 'remplissage').arrets.map(a => a.couleur)).toEqual(['#1f5fb0', '#c81e28']);
    const toutes = appliquerPalette(dessin, ['#111111', '#222222', '#333333']);
    expect(couleursDuDessin(toutes).map(c => c.couleur).sort()).toEqual(['#111111', '#222222', '#333333']);
    expect(JSON.stringify(toutes)).not.toContain('jeton');
  });

  it('une seule couleur : chaque arret et chaque feuille de tuile la prennent, le repli aussi', () => {
    const r = uneCouleur(dessin, '#00ff00');
    expect(couleursDuDessin(r)).toEqual([{ couleur: '#00ff00', formes: 6 }]);
    expect(r.formes.map(x => [x.remplissage, x.contour])).toEqual([['#00ff00', null], ['#00ff00', '#00ff00'], ['#00ff00', '#00ff00'], ['#00ff00', null]]);
    // La feuille cachee de la tuile n'etait pas listee : elle garde sa couleur.
    expect(motifDu(f(r, 3)).contenu.formes.map(x => x.remplissage)).toEqual(['#00ff00', '#00ff00', '#abcdef']);
  });
});

describe('ce que les listes relisent', () => {
  it('poser, retirer ou recolorer une peinture change les couleurs lues ; la deplacer, non', () => {
    const sans = { ...dessin, formes: dessin.formes.map(x => { const { peintureRemplissage: _p, ...reste } = x; void _p; return reste; }) };
    expect(memesCouleurs(dessin.formes, sans.formes)).toBe(false);
    expect(memesCouleurs(dessin.formes, transformer(dessin, ['f2', 'f3', 'f4'], translation(3, 4)).formes)).toBe(true);
    expect(memesCouleurs(dessin.formes, modifierArret(dessin, ['f2'], 'remplissage', 1, { couleur: '#000000' }).formes)).toBe(false);
    expect(memesCouleurs(dessin.formes, remplacerCouleur(dessin, '#2a9d8f', '#000000').formes)).toBe(false);
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
