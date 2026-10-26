// Les commandes des groupes (ADR-0012, etape 2, paquet 2-C) : en modele riche seulement ; Ctrl+G groupe en riche et combine a plat
// (annexe 9, question 1) ; Entree entre dans un groupe choisi seul et choisit son premier enfant, Maj+Entree sort ; le fil d'Ariane
// remonte de plusieurs niveaux d'un coup ; les phrases de la selection, du groupe cree ou defait.

import { describe, expect, it, vi } from 'vitest';
import { lireDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { aUnGroupe, ctrlG, elementsGroupes, entrerDansGroupe, groupeSeul, groupesActifs, remonterVers, toucheGroupes } from '../../../src/zones/commandesGroupes.js';
import { phraseBascule, phraseSelection } from '../../../src/zones/annonces.js';
import { cheminGroupes, elementsDits, phraseGroupeCree, phraseGroupeDefait, phraseNiveau, PHRASE_RACINE } from '../../../src/zones/phrasesGroupes.js';
import type { ActionsEditeur, EtatInterface, ModeleDessin } from '../../../src/zones/typesEditeur.js';

const lire = (svg: string, modele: 'plat' | 'riche'): DessinSvg => {
  const r = lireDessin(svg, modele === 'riche' ? { modele } : {});
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0h10v10h-10z" fill="#c81e28"/>'
  + '<g data-ed-nom="Nuage"><path d="M20 0h10v10h-10z" fill="#1428a0"/><g><path d="M40 0h10v10h-10z" fill="#1428a0"/><path d="M60 0h10v10h-10z" fill="#1428a0"/></g></g></svg>';
const riche = lire(SVG, 'riche'), plat = lire('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0h10v10h-10z"/><path d="M20 0h10v10h-10z"/></svg>', 'plat');

/** Des verbes espions, et ce que l'etat porterait. */
function monter(dessin: DessinSvg, sel: string[], modele: 'plat' | 'riche', contexte: string | null = null) {
  const ac = {
    grouper: vi.fn(), degrouper: vi.fn(), combinerSelection: vi.fn(), separerSelection: vi.fn(), choisir: vi.fn(), poserPoint: vi.fn(), annoncer: vi.fn(),
    poserContexte: vi.fn(), entrerGroupe: vi.fn((id: string) => !!dessin.groupes?.[id]), sortirGroupe: vi.fn(() => contexte !== null)
  };
  const m = { dessin, sel } as unknown as ModeleDessin;
  const u = { modele, outil: 'selection', contexte: contexte !== null ? { groupe: contexte } : null } as unknown as EtatInterface;
  return { ac, a: ac as unknown as ActionsEditeur, m, u };
}
const entree = (shiftKey = false) => ({ key: 'Enter', shiftKey, ctrlKey: false, metaKey: false, altKey: false }) as KeyboardEvent;

describe('les commandes des groupes', () => {
  it('n existent qu en modele riche, ou sur un dessin deja riche', () => {
    expect(groupesActifs(plat, 'plat')).toBe(false);
    expect(groupesActifs(plat, 'riche')).toBe(true);
    expect(groupesActifs(riche, 'plat')).toBe(true);
    const { m, u, a } = monter(plat, ['f1'], 'plat');
    expect(elementsGroupes(m, u, a)).toEqual([]);
  });

  it('se grisent selon la selection, avec leurs raccourcis', () => {
    const { m, u, a } = monter(riche, ['g1'], 'riche');
    const els = elementsGroupes(m, u, a);
    expect(els.map(e => [e.id, e.raccourci, !!e.desactive])).toEqual([
      ['grouper', 'Ctrl+G', false], ['degrouper', 'Ctrl+Maj+G', false], ['entrer-groupe', 'Entrée', false], ['sortir-groupe', 'Maj+Entrée', true]
    ]);
    expect(groupeSeul({ dessin: riche, sel: ['g1'] })).toBe('g1');
    expect(groupeSeul({ dessin: riche, sel: ['f1'] })).toBeNull();
    expect(groupeSeul({ dessin: riche, sel: ['g1', 'f1'] })).toBeNull();
    expect(aUnGroupe({ dessin: riche, sel: ['f1', 'g1'] })).toBe(true);
    expect(aUnGroupe({ dessin: riche, sel: ['f1'] })).toBe(false);
  });

  it('donnent Ctrl+G aux groupes en riche, a Combiner et Separer a plat', () => {
    const r = monter(riche, [], 'riche');
    ctrlG(r.m, r.u, r.a, false);
    ctrlG(r.m, r.u, r.a, true);
    expect(r.ac.grouper).toHaveBeenCalledTimes(1);
    expect(r.ac.degrouper).toHaveBeenCalledTimes(1);
    expect(r.ac.combinerSelection).not.toHaveBeenCalled();
    const p = monter(plat, [], 'plat');
    ctrlG(p.m, p.u, p.a, false);
    ctrlG(p.m, p.u, p.a, true);
    expect(p.ac.combinerSelection).toHaveBeenCalledTimes(1);
    expect(p.ac.separerSelection).toHaveBeenCalledTimes(1);
    expect(p.ac.grouper).not.toHaveBeenCalled();
  });

  it('entrent par Entree dans un groupe choisi seul, son premier enfant choisi, en une phrase', () => {
    const r = monter(riche, ['g1'], 'riche');
    expect(toucheGroupes(entree(), r.m, r.u, r.a)).toBe(true);
    expect(r.ac.entrerGroupe).toHaveBeenCalledWith('g1');
    expect(r.ac.choisir).toHaveBeenCalledWith(['f2']);
    expect(r.ac.annoncer).toHaveBeenLastCalledWith('Dans le groupe « Nuage », 2 éléments. Forme 2 sélectionnée : carré, fond bleu #1428a0, 10 × 10 à 20, 0.');
    // Une feuille garde son sens d'avant : la touche n'est pas prise.
    const feuille = monter(riche, ['f1'], 'riche');
    expect(toucheGroupes(entree(), feuille.m, feuille.u, feuille.a)).toBe(false);
    // A plat, rien.
    const p = monter(plat, ['f1'], 'plat');
    expect(toucheGroupes(entree(true), p.m, p.u, p.a)).toBe(false);
    expect(entrerDansGroupe({ dessin: riche }, monter(riche, [], 'riche').a, 'f1')).toBe(false);
  });

  it('sortent par Maj+Entree, et le disent a la racine', () => {
    const dedans = monter(riche, [], 'riche', 'g2');
    expect(toucheGroupes(entree(true), dedans.m, dedans.u, dedans.a)).toBe(true);
    expect(dedans.ac.sortirGroupe).toHaveBeenCalledTimes(1);
    expect(dedans.ac.annoncer).not.toHaveBeenCalled();
    const racine = monter(riche, [], 'riche');
    toucheGroupes(entree(true), racine.m, racine.u, racine.a);
    expect(racine.ac.annoncer).toHaveBeenCalledWith('Vous êtes déjà à la racine du dessin.');
  });

  it('remontent par le fil d Ariane, le groupe quitte choisi', () => {
    const r = monter(riche, ['f3'], 'riche', 'g2');
    remonterVers(r.m, r.u, r.a, null);
    expect(r.ac.poserContexte).toHaveBeenCalledWith(null);
    expect(r.ac.choisir).toHaveBeenCalledWith(['g1']);
    expect(r.ac.annoncer).toHaveBeenCalledWith(PHRASE_RACINE);
    const n = monter(riche, ['f3'], 'riche', 'g2');
    remonterVers(n.m, n.u, n.a, 'g1');
    expect(n.ac.poserContexte).toHaveBeenCalledWith({ groupe: 'g1' });
    expect(n.ac.choisir).toHaveBeenCalledWith(['g2']);
    expect(n.ac.annoncer).toHaveBeenCalledWith('Dans le groupe « Nuage », 2 éléments.');
    const deja = monter(riche, [], 'riche', 'g2');
    remonterVers(deja.m, deja.u, deja.a, 'g2');
    expect(deja.ac.poserContexte).not.toHaveBeenCalled();
  });
});

describe('les phrases des groupes', () => {
  it('disent la selection d un groupe, ou de plusieurs elements ; des feuilles, comme avant', () => {
    expect(phraseSelection(riche, ['g1'])).toBe('Groupe « Nuage » sélectionné : 3 formes, 50 × 10 à 20, 0.');
    expect(phraseSelection(riche, ['g2'])).toBe('Groupe 2 sélectionné : 2 formes, 30 × 10 à 40, 0.');
    expect(phraseSelection(riche, ['f1', 'g1'])).toBe('2 éléments sélectionnés.');
    expect(phraseSelection(riche, ['f1'])).toBe('Forme 1 sélectionnée : carré, fond rouge #c81e28, 10 × 10 à 0, 0.');
    expect(phraseSelection(plat, ['f1', 'f2'])).toBe('2 formes sélectionnées.');
    expect(phraseBascule('g2', 'ajoutee', 3)).toBe('Groupe 2 ajouté : 3 éléments sélectionnés.');
    expect(phraseBascule('f2', 'ajoutee', 3)).toBe('Forme 2 ajoutée : 3 formes sélectionnées.');
  });

  it('disent le groupe cree ou defait, et le niveau ou l on arrive', () => {
    expect(elementsDits(riche, ['f1', 'f2'])).toBe('2 formes');
    expect(elementsDits(riche, ['f1', 'g2'])).toBe('2 éléments');
    expect(phraseGroupeCree(riche, ['f1', 'g1'])).toBe('Groupe créé : 2 éléments.');
    expect(phraseGroupeDefait(riche, 2, ['f1', 'f2', 'f3'], 0)).toBe('2 groupes défaits : 3 formes.');
    expect(phraseGroupeDefait(riche, 2, ['f1'], 2)).toBe('2 groupes défaits : 1 forme. L’opacité, la découpe, le masque ou les effets de ces groupes sont retirés ; Ctrl+Z les rend.');
    expect(phraseNiveau(riche, null)).toBe(PHRASE_RACINE);
    expect(phraseNiveau(riche, 'g2')).toBe('Dans le groupe 2, 2 éléments.');
    expect(cheminGroupes(riche, 'g2').map(n => (n.genre === 'groupe' ? n.groupe.id : ''))).toEqual(['g1', 'g2']);
    expect(cheminGroupes(riche, null)).toEqual([]);
  });
});
