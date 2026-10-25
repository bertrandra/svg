import { describe, expect, it } from 'vitest';
import { lireDessin, STYLE_DEFAUT, type DessinSvg, type Style } from '../../../src/engine/editionSvg.js';
import { avecNuancier } from '../../../src/engine/nuancier.js';
import { historique, annuler, avancer, type Historique } from '../../../src/util/historique.js';
import { creerNuancierDepuisSelection, nomDeTeinte, poserTeinte, reprendreNuancierDuDessin } from '../../../src/zones/actionsNuancier.js';
import type { ActionsEditeur } from '../../../src/zones/typesEditeur.js';

// Les gestes du nuancier (ADR-0037) sur un historique reel : « Créer le nuancier depuis la sélection » est une entree que
// l'annulation defait, une creation qui ne change rien n'en empile pas, et poser une teinte suit la cible.

function dessin(corps: string): DessinSvg {
  const lu = lireDessin('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">' + corps + '</svg>');
  if ('erreur' in lu) throw new Error(lu.erreur);
  return lu.dessin;
}

/** Un editeur reduit a ce que les gestes du nuancier emploient : l'historique, la phrase dite, le style des formes nouvelles. */
function editeur(d: DessinSvg) {
  const e = { h: historique(avecNuancier(d)) as Historique<DessinSvg>, dit: '', style: STYLE_DEFAUT as Style };
  const ac = {
    appliquer: (f: (x: DessinSvg) => DessinSvg, cle: string | null = null) => { e.h = avancer(e.h, f(e.h.present), cle); },
    dire: (t: string) => { e.dit = t; },
    nouvelleCle: () => 'geste-' + e.h.passe.length,
    poserStyle: (s: Style) => { e.style = s; }
  } as unknown as ActionsEditeur;
  return { e, ac };
}

const D = dessin('<rect x="0" y="0" width="100" height="100" fill="#1428a0"/><rect x="120" y="0" width="20" height="20" fill="#c81e28"/><rect x="150" y="0" width="10" height="10" fill="#2e8b57" stroke="#000000"/>');
const [bleu, rouge, vert] = D.formes.map(f => f.id ?? '');

describe('creer le nuancier depuis la selection', () => {
  it('remplace le nuancier du dessin, en une entree que Ctrl+Z defait', () => {
    const { e, ac } = editeur(D);
    const avant = e.h.present.nuancier;
    creerNuancierDepuisSelection(ac, e.h.present, [rouge ?? ''], 'remplacer');
    expect(e.h.present.nuancier).toEqual({ provenance: 'selection', teintes: [{ hex: '#c81e28' }] });
    expect(e.dit).toBe('Nuancier du dessin remplacé par 1 couleur de la sélection. Ctrl+Z le rend.');
    expect(e.h.passe).toHaveLength(1);
    e.h = annuler(e.h);
    expect(e.h.present.nuancier).toBe(avant);
  });

  it('ajoute les couleurs nouvelles, et ne change rien quand elles y sont deja', () => {
    const { e, ac } = editeur(D);
    creerNuancierDepuisSelection(ac, e.h.present, [rouge ?? ''], 'remplacer');
    creerNuancierDepuisSelection(ac, e.h.present, [bleu ?? '', vert ?? ''], 'ajouter');
    expect(e.h.present.nuancier?.teintes.map(t => t.hex)).toEqual(['#c81e28', '#1428a0', '#2e8b57', '#000000']);
    expect(e.h.present.nuancier?.provenance).toBe('selection');
    expect(e.dit).toBe('3 couleurs de la sélection ajoutées au nuancier du dessin. Ctrl+Z les retire.');
    const n = e.h.passe.length;
    creerNuancierDepuisSelection(ac, e.h.present, [bleu ?? ''], 'ajouter');
    expect(e.h.passe).toHaveLength(n);
    expect(e.dit).toBe('Le nuancier du dessin a déjà ces couleurs.');
  });

  it('dit pourquoi rien ne se fait sans selection', () => {
    const { e, ac } = editeur(D);
    creerNuancierDepuisSelection(ac, e.h.present, [], 'remplacer');
    expect(e.h.passe).toHaveLength(0);
    expect(e.dit).toContain('Choisissez des formes');
  });

  it('reprend les couleurs de tout le dessin', () => {
    const { e, ac } = editeur(D);
    creerNuancierDepuisSelection(ac, e.h.present, [rouge ?? ''], 'remplacer');
    reprendreNuancierDuDessin(ac, e.h.present);
    expect(e.h.present.nuancier?.provenance).toBe('dessin');
    expect(e.h.present.nuancier?.teintes.map(t => t.hex)).toEqual(['#1428a0', '#c81e28', '#2e8b57', '#000000']);
  });
});

describe('poser une teinte', () => {
  it('va au remplissage ou au contour des formes choisies, et aux formes nouvelles sans selection', () => {
    const { e, ac } = editeur(D);
    poserTeinte(ac, [bleu ?? ''], e.style, '#2e8b57', 'remplissage', 'Vert #2E8B57');
    expect(e.h.present.formes[0]?.remplissage).toBe('#2e8b57');
    poserTeinte(ac, [bleu ?? ''], e.style, '#c81e28', 'contour', 'Rouge #C81E28');
    expect(e.h.present.formes[0]?.contour).toBe('#c81e28');
    expect(e.dit).toBe('Rouge #C81E28 posé sur le contour de la forme choisie.');
    poserTeinte(ac, [], e.style, '#1428a0', 'remplissage', 'Bleu foncé #1428A0');
    expect(e.style.remplissage).toBe('#1428a0');
    expect(e.dit).toBe('Les formes nouvelles prendront Bleu foncé #1428A0 en remplissage.');
  });

  it('nomme une teinte par son nom approche, son code et son opacite', () => {
    expect(nomDeTeinte({ hex: '#1428a0', opacite: 0.5 })).toBe('Bleu foncé #1428A0, opacité 50 %');
    expect(nomDeTeinte({ hex: '#c81e28' })).toBe('Rouge #C81E28');
  });
});
