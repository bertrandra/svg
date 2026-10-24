// Les calques par couleur, cote moteur : recolorer sur le fond ou le trait, choisir la meme couleur,
// les nuances proches (choisir, fusionner), et l'instantane de visibilite qui permet de quitter un isolement.

import { describe, it, expect } from 'vitest';
import { au } from '../../../src/util/tableaux.js';
import {
  couleursDuDessin, couleursProches, fusionnerCouleursProches, idsDeNuancesProches, idsMemeCouleur, lireDessin, modifier, montrerSeulement,
  remplacerCouleur, remplacerCouleurSur, restaurerVisibilites, supprimer, visibilitesConformes, visibilitesDe, type DessinSvg
} from '../../../src/engine/editionSvg.js';

const dessin = (corps: string): DessinSvg => {
  const r = lireDessin('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' + corps + '</svg>');
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
const forme = (x: number, fill: string | null, stroke: string | null = null) =>
  `<path d="M${x} 0h5v5h-5z" fill="${fill ?? 'none'}"${stroke ? ` stroke="${stroke}" stroke-width="2"` : ''}/>`;
const couleurs = (d: DessinSvg) => d.formes.map(f => [f.remplissage, f.contour]);

describe('remplacerCouleurSur', () => {
  // f1 fond rouge ; f2 fond bleu, trait rouge ; f3 trait rouge seul
  const d = () => dessin(forme(0, '#c81e28') + forme(10, '#1428a0', '#c81e28') + forme(20, null, '#c81e28'));

  it('ne change que les fonds en « remplissage »', () => {
    const r = remplacerCouleurSur(d(), '#c81e28', '#00ff00', 'remplissage');
    expect(couleurs(r)).toEqual([['#00ff00', null], ['#1428a0', '#c81e28'], [null, '#c81e28']]);
  });

  it('ne change que les traits en « contour »', () => {
    const r = remplacerCouleurSur(d(), '#c81e28', '#00ff00', 'contour');
    expect(couleurs(r)).toEqual([['#c81e28', null], ['#1428a0', '#00ff00'], [null, '#00ff00']]);
  });

  it('fait comme remplacerCouleur en « tout »', () => {
    expect(remplacerCouleurSur(d(), '#c81e28', '#00ff00', 'tout')).toEqual(remplacerCouleur(d(), '#c81e28', '#00ff00'));
  });

  it('rend le meme dessin quand rien ne change', () => {
    const x = d();
    expect(remplacerCouleurSur(x, '#abcdef', '#00ff00', 'remplissage')).toBe(x);
    expect(remplacerCouleurSur(x, '#1428a0', '#00ff00', 'contour')).toBe(x);
    expect(remplacerCouleurSur(x, '#c81e28', '#c81e28', 'remplissage')).toBe(x);
  });

  it('retirer un trait garde son epaisseur, en mettre un en donne une', () => {
    const x = d();
    const sans = remplacerCouleurSur(x, '#c81e28', null, 'contour');
    expect(sans.formes[1]).toMatchObject({ contour: null, epaisseur: 2 });
    expect(sans.formes[0]).toBe(x.formes[0]);
  });

  it('atteint aussi les formes masquees et verrouillees (un remplacement nomme)', () => {
    const x = modifier(modifier(d(), ['f1'], { visible: false }), ['f2'], { verrouille: true });
    const r = remplacerCouleurSur(x, '#c81e28', '#00ff00', 'tout');
    expect(couleurs(r)).toEqual([['#00ff00', null], ['#1428a0', '#00ff00'], [null, '#00ff00']]);
  });

  it('ne touche pas aux autres formes (memes objets)', () => {
    const x = d(), r = remplacerCouleurSur(x, '#c81e28', '#00ff00', 'remplissage');
    expect(r.formes[1]).toBe(x.formes[1]);
    expect(r.formes[2]).toBe(x.formes[2]);
  });
});

describe('idsMemeCouleur', () => {
  const d = () => dessin(forme(0, '#c81e28') + forme(10, '#c81e28', '#1428a0') + forme(20, '#1428a0') + forme(30, null, '#1428a0') + forme(40, null, '#1428a0') + forme(50, null, null));

  it('prend le remplissage de la forme modele', () => {
    expect(idsMemeCouleur(d(), 'f1')).toEqual(['f1', 'f2']);
    expect(idsMemeCouleur(d(), 'f3')).toEqual(['f3']);
  });

  it('prend le contour quand la forme n\'a pas de remplissage', () => {
    expect(idsMemeCouleur(d(), 'f4')).toEqual(['f2', 'f4', 'f5']);
  });

  it('ne rend que des formes qu\'on peut choisir', () => {
    const x = modifier(modifier(d(), ['f2'], { visible: false }), ['f4'], { verrouille: true });
    expect(idsMemeCouleur(x, 'f1')).toEqual(['f1']);
    expect(idsMemeCouleur(x, 'f5')).toEqual(['f5']);
  });

  it('rend rien pour une forme inconnue ou sans couleur', () => {
    expect(idsMemeCouleur(d(), 'f99')).toEqual([]);
    expect(idsMemeCouleur(d(), 'f6')).toEqual([]);
  });
});

describe('couleursProches', () => {
  const rouges = () => dessin(forme(0, '#c81e28') + forme(10, '#c81e28') + forme(20, '#c91f27') + forme(30, '#ca2026', '#1428a0') + forme(40, '#1428a0'));

  it('regroupe les nuances d\'un meme rouge autour de la plus employee', () => {
    const g = couleursProches(rouges(), 0.02);
    expect(g).toEqual([{ cible: '#c81e28', membres: ['#c91f27', '#ca2026'], formes: 2 }]);
  });

  it('ne regroupe rien a tolerance nulle ou quand les couleurs sont loin', () => {
    expect(couleursProches(rouges(), 0)).toEqual([]);
    expect(couleursProches(dessin(forme(0, '#c81e28') + forme(10, '#1428a0')), 0.1)).toEqual([]);
  });

  it('mesure contre la cible : un degrade ne s\'enchaine pas en une seule couleur', () => {
    const d = dessin(forme(0, '#848484') + forme(10, '#848484') + forme(20, '#848484') + forme(30, '#808080') + forme(40, '#888888') + forme(50, '#8c8c8c'));
    const g = couleursProches(d, 0.02);
    expect(g).toEqual([{ cible: '#848484', membres: ['#808080', '#888888'], formes: 2 }]);
  });

  it('departage a egalite d\'emploi par le code hexadecimal le plus petit', () => {
    const d = dessin(forme(0, '#c91f27') + forme(10, '#c81e28'));
    expect(couleursProches(d, 0.02)).toEqual([{ cible: '#c81e28', membres: ['#c91f27'], formes: 1 }]);
  });

  it('ne depend pas de l\'ordre des formes', () => {
    const d = rouges();
    const inverse: DessinSvg = { ...d, formes: [...d.formes].reverse() };
    expect(couleursProches(inverse, 0.02)).toEqual(couleursProches(d, 0.02));
  });

  it('lit le fond, le trait ou les deux', () => {
    const d = dessin(forme(0, '#c81e28', '#1428a0') + forme(10, '#c91f27', '#1529a1') + forme(20, '#c91f27'));
    expect(couleursProches(d, 0.02, 'remplissage').map(g => g.cible)).toEqual(['#c91f27']);
    expect(couleursProches(d, 0.02, 'contour').map(g => g.cible)).toEqual(['#1428a0']);
    expect(couleursProches(d, 0.02).map(g => g.cible).sort()).toEqual(['#1428a0', '#c91f27']);
  });

  it('ignore ce qui n\'est pas un code hexadecimal', () => {
    const d = modifier(dessin(forme(0, '#c81e28') + forme(10, '#000000')), ['f2'], { remplissage: 'bleu' });
    expect(couleursProches(d, 1)).toEqual([]);
  });
});

describe('fusionnerCouleursProches', () => {
  const rouges = () => dessin(forme(0, '#c81e28') + forme(10, '#c81e28') + forme(20, '#c91f27') + forme(30, '#ca2026', '#1428a0') + forme(40, '#1428a0'));

  it('ramene les nuances a la couleur la plus employee, en une passe', () => {
    const r = fusionnerCouleursProches(rouges(), 0.02);
    expect(r).toMatchObject({ fusionnees: 2, formes: 2, conservees: 0 });
    expect(couleursDuDessin(r.dessin)).toEqual([{ couleur: '#c81e28', formes: 4 }, { couleur: '#1428a0', formes: 2 }]);
  });

  it('est deterministe et ne depend pas de l\'ordre des formes', () => {
    const d = rouges();
    expect(fusionnerCouleursProches(d, 0.02)).toEqual(fusionnerCouleursProches(d, 0.02));
    const inverse: DessinSvg = { ...d, formes: [...d.formes].reverse() };
    expect(couleursDuDessin(fusionnerCouleursProches(inverse, 0.02).dessin)).toEqual(couleursDuDessin(fusionnerCouleursProches(d, 0.02).dessin));
  });

  it('rend le meme dessin quand il n\'y a rien a fusionner', () => {
    const d = rouges();
    expect(fusionnerCouleursProches(d, 0).dessin).toBe(d);
    expect(fusionnerCouleursProches(d, 0)).toMatchObject({ fusionnees: 0, formes: 0, conservees: 0 });
  });

  it('ne change jamais la couleur d\'une forme verrouillee', () => {
    const d = modifier(rouges(), ['f3'], { verrouille: true });
    const r = fusionnerCouleursProches(d, 0.02);
    expect(r.dessin.formes[2]).toBe(d.formes[2]);
    expect(r.dessin.formes[2]?.remplissage).toBe('#c91f27');
    expect(r).toMatchObject({ fusionnees: 1, formes: 1, conservees: 1 });
  });

  it('une couleur portee seulement par des formes verrouillees reste, mais peut servir de cible', () => {
    // #c81e28 n'est que sur deux formes verrouillees : c'est la plus employee, donc la cible.
    const d = modifier(rouges(), ['f1', 'f2'], { verrouille: true });
    const r = fusionnerCouleursProches(d, 0.02);
    expect(r.dessin.formes.map(f => f.remplissage)).toEqual(['#c81e28', '#c81e28', '#c81e28', '#c81e28', '#1428a0']);
    expect(r).toMatchObject({ fusionnees: 2, formes: 2, conservees: 0 });
    // Tout est verrouille : rien ne change, et on le dit.
    const tout = modifier(rouges(), ['f1', 'f2', 'f3', 'f4', 'f5'], { verrouille: true });
    const rien = fusionnerCouleursProches(tout, 0.02);
    expect(rien.dessin).toBe(tout);
    expect(rien).toMatchObject({ fusionnees: 0, formes: 0, conservees: 2 });
  });

  it('recolore les formes masquees, qui comptent aussi dans l\'emploi', () => {
    const d = modifier(rouges(), ['f3'], { visible: false });
    const r = fusionnerCouleursProches(d, 0.02);
    expect(r.dessin.formes[2]).toMatchObject({ remplissage: '#c81e28', visible: false });
    // Deux formes masquees d'un rouge plus employe que le premier : c'est lui, la cible.
    const x = modifier(dessin(forme(0, '#c81e28') + forme(10, '#c91f27') + forme(20, '#c91f27')), ['f2', 'f3'], { visible: false });
    expect(fusionnerCouleursProches(x, 0.02).dessin.formes.map(f => f.remplissage)).toEqual(['#c91f27', '#c91f27', '#c91f27']);
  });

  it('en « remplissage », les traits ne bougent pas et ne comptent pas', () => {
    const d = dessin(forme(0, '#c81e28', '#1428a0') + forme(10, '#c81e28', '#1529a1') + forme(20, '#c91f27', '#1529a1'));
    const r = fusionnerCouleursProches(d, 0.02, 'remplissage');
    expect(couleurs(r.dessin)).toEqual([['#c81e28', '#1428a0'], ['#c81e28', '#1529a1'], ['#c81e28', '#1529a1']]);
    expect(r).toMatchObject({ fusionnees: 1, formes: 1 });
    const t = fusionnerCouleursProches(d, 0.02, 'contour');
    expect(couleurs(t.dessin)).toEqual([['#c81e28', '#1529a1'], ['#c81e28', '#1529a1'], ['#c91f27', '#1529a1']]);
  });

  it('ne laisse aucune chaine : une cible n\'est jamais elle-meme remplacee', () => {
    const d = dessin(forme(0, '#848484') + forme(10, '#848484') + forme(20, '#808080') + forme(30, '#8c8c8c'));
    const r = fusionnerCouleursProches(d, 0.02);
    expect(r.dessin.formes.map(f => f.remplissage)).toEqual(['#848484', '#848484', '#848484', '#8c8c8c']);
  });

  it('ne touche pas aux formes sans couleur proche (memes objets)', () => {
    const d = rouges();
    const r = fusionnerCouleursProches(d, 0.02);
    expect(r.dessin.formes[0]).toBe(d.formes[0]);
    expect(r.dessin.formes[4]).toBe(d.formes[4]);
  });
});

describe('idsDeNuancesProches', () => {
  const d = () => dessin(forme(0, '#c81e28') + forme(10, '#c91f27') + forme(20, '#1428a0', '#ca2026') + forme(30, '#1428a0'));

  it('rend les formes de la couleur et de ses nuances', () => {
    expect(idsDeNuancesProches(d(), '#c81e28', 0.02)).toEqual(['f1', 'f2', 'f3']);
    expect(idsDeNuancesProches(d(), '#c81e28', 0)).toEqual(['f1']);
  });

  it('lit le fond, le trait ou les deux', () => {
    expect(idsDeNuancesProches(d(), '#c81e28', 0.02, 'remplissage')).toEqual(['f1', 'f2']);
    expect(idsDeNuancesProches(d(), '#c81e28', 0.02, 'contour')).toEqual(['f3']);
  });

  it('ne rend que des formes qu\'on peut choisir', () => {
    const x = modifier(modifier(d(), ['f2'], { visible: false }), ['f3'], { verrouille: true });
    expect(idsDeNuancesProches(x, '#c81e28', 0.02)).toEqual(['f1']);
  });

  it('compare une couleur qui n\'est pas un code seulement a elle-meme', () => {
    const x = modifier(dessin(forme(0, '#000000') + forme(10, '#c81e28')), ['f1'], { remplissage: 'bleu' });
    expect(idsDeNuancesProches(x, 'bleu', 1)).toEqual(['f1']);
    expect(idsDeNuancesProches(x, '#c81e28', 1)).toEqual(['f2']);
  });
});

describe('visibilite : quitter un isolement', () => {
  const d = () => modifier(dessin(forme(0, '#c81e28') + forme(10, '#1428a0') + forme(20, '#1428a0') + forme(30, '#c81e28')), ['f4'], { visible: false });

  it('rend a chaque forme la visibilite d\'avant, pas un « tout afficher »', () => {
    const avant = visibilitesDe(d());
    const isole = montrerSeulement(d(), ['f2', 'f3']);
    expect(isole.formes.map(f => f.visible)).toEqual([false, true, true, false]);
    const retour = restaurerVisibilites(isole, avant);
    expect(retour.formes.map(f => f.visible)).toEqual([true, true, true, false]);
  });

  it('laisse comme elles sont les formes nees depuis, et ignore les mortes', () => {
    const avant = visibilitesDe(d());
    let isole = montrerSeulement(d(), ['f2']);
    isole = supprimer(isole, ['f1']);
    isole = modifier(isole, ['f3'], { visible: false });
    const avecNouvelle: DessinSvg = { ...isole, formes: [...isole.formes, { ...au(isole.formes, 0), id: 'f9', visible: false }] };
    const retour = restaurerVisibilites(avecNouvelle, avant);
    expect(retour.formes.map(f => [f.id, f.visible])).toEqual([['f2', true], ['f3', true], ['f4', false], ['f9', false]]);
  });

  it('rend le meme dessin quand tout est deja comme avant', () => {
    const x = d();
    expect(restaurerVisibilites(x, visibilitesDe(x))).toBe(x);
  });

  it('dit si l\'isolement tient encore : une bascule a la main ou un retour en arriere le defont', () => {
    const base = d();
    const isole = montrerSeulement(base, ['f2', 'f3']);
    const apres = visibilitesDe(isole);
    expect(visibilitesConformes(isole, apres)).toBe(true);
    expect(visibilitesConformes(modifier(isole, ['f1'], { visible: true }), apres)).toBe(false);
    expect(visibilitesConformes(modifier(isole, ['f2'], { visible: false }), apres)).toBe(false);
    // Annuler (revenir a l'etat d'avant) defait l'isolement.
    expect(visibilitesConformes(base, apres)).toBe(false);
    // Une forme ajoutee ou supprimee depuis ne le defait pas.
    expect(visibilitesConformes(supprimer(isole, ['f1']), apres)).toBe(true);
  });
});
