import { describe, it, expect, vi } from 'vitest';
import { lireDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { commandesSelection, effetDe, estOutilSelection, estOutilZone, etatOutilZone, phraseZone, toucheSelection } from '../../../src/zones/commandesSelection.js';
import { phraseOutil } from '../../../src/zones/annonces.js';
import type { ActionsEditeur, EtatInterface, ModeleDessin } from '../../../src/zones/typesEditeur.js';

const d: DessinSvg = (() => {
  const r = lireDessin('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">'
    + '<rect x="0" y="0" width="10" height="10" fill="#c81e28" stroke="#000000"/>'
    + '<rect x="20" y="0" width="10" height="10" fill="#c81e28"/>'
    + '<path d="M0 50L100 50" fill="none" stroke="#000000"/>'
    + '<path d="M0 60L100 60" fill="none" stroke="#1428a0"/></svg>');
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
})();

/** Le strict necessaire des trois contextes pour les commandes : le dessin, la selection, le profil, et des verbes espions. */
function contexte(sel: string[]) {
  const ac = { choisir: vi.fn(), poserPoint: vi.fn(), dire: vi.fn(), choisirMemeCouleur: vi.fn() };
  const m = { dessin: d, sel } as unknown as ModeleDessin;
  const u = { profil: null } as unknown as EtatInterface;
  return { m, u, ac, a: ac as unknown as ActionsEditeur };
}

describe('les phrases du cadre et du lasso', () => {
  it('disent ce que le relachement a fait', () => {
    expect(phraseZone('cadre', 'remplacer', [], ['f1', 'f2', 'f3'])).toBe('3 formes choisies.');
    expect(phraseZone('cadre', 'remplacer', ['f9'], ['f1'])).toBe('1 forme choisie.');
    expect(phraseZone('lasso', 'remplacer', ['f1'], [])).toBe('Aucune forme dans le lasso.');
    expect(phraseZone('cadre', 'ajouter', ['f1'], ['f1', 'f2', 'f3'])).toBe('2 formes ajoutées : 3 formes choisies.');
    expect(phraseZone('cadre', 'ajouter', ['f1'], ['f1'])).toBe('Aucune forme ajoutée : 1 forme choisie.');
    expect(phraseZone('cadre', 'retirer', ['f1', 'f2'], [])).toBe('2 formes retirées : aucune forme choisie.');
  });

  it('lisent l effet sur les touches : Alt retire, meme avec Maj', () => {
    expect(effetDe({ shiftKey: false, altKey: false })).toBe('remplacer');
    expect(effetDe({ shiftKey: true, altKey: false })).toBe('ajouter');
    expect(effetDe({ shiftKey: true, altKey: true })).toBe('retirer');
  });

  it('nomment l outil et sa regle dans la barre d etat et a voix haute', () => {
    expect(etatOutilZone('cadre', 'touche', 0)).toMatch(/^Cadre : glissez, même sur une forme, pour prendre les formes touchées/);
    expect(etatOutilZone('cadre', 'dedans', 1)).toMatch(/^Premier coin posé : .*les formes entièrement dedans/);
    expect(etatOutilZone('lasso', 'touche', 2)).toMatch(/^2 points · Espace pose un point/);
    expect(phraseOutil('cadre')).toMatch(/^Outil cadre de sélection : /);
    expect(phraseOutil('lasso')).toMatch(/^Outil lasso : /);
    expect(estOutilZone('cadre') && estOutilZone('lasso') && !estOutilZone('selection')).toBe(true);
    expect(estOutilSelection('selection') && estOutilSelection('lasso') && !estOutilSelection('points')).toBe(true);
  });
});

describe('les commandes de selection du menu Edition', () => {
  it('inversent la selection et le disent', () => {
    const c = contexte(['f1']);
    commandesSelection(c.m, c.u, c.a).inverser();
    expect(c.ac.choisir).toHaveBeenCalledWith(['f2', 'f3', 'f4']);
    expect(c.ac.dire).toHaveBeenCalledWith('Sélection inversée : 3 formes choisies.');
  });

  it('prennent le meme contour, en nommant la couleur avant son code', () => {
    const c = contexte(['f1']);
    commandesSelection(c.m, c.u, c.a).memeContour();
    expect(c.ac.choisir).toHaveBeenCalledWith(['f1', 'f3']);
    expect(c.ac.dire).toHaveBeenCalledWith('2 formes de même contour noir #000000 choisies.');
    const sans = contexte(['f2']);
    commandesSelection(sans.m, sans.u, sans.a).memeContour();
    expect(sans.ac.choisir).not.toHaveBeenCalled();
    expect(sans.ac.dire).toHaveBeenCalledWith('La sélection n’a pas de contour : pas de couleur de contour à retrouver.');
  });

  it('prennent le meme type, accorde', () => {
    const c = contexte(['f3']);
    commandesSelection(c.m, c.u, c.a).memeType();
    expect(c.ac.dire).toHaveBeenCalledWith('2 traits choisis.');
    const p = contexte(['f2']);
    commandesSelection(p.m, p.u, p.a).memeType();
    expect(p.ac.dire).toHaveBeenCalledWith('2 formes pleines choisies.');
    const melange = contexte(['f2', 'f3']);
    commandesSelection(melange.m, melange.u, melange.a).memeType();
    expect(melange.ac.dire).toHaveBeenCalledWith('4 formes de même type choisies.');
  });

  it('n ont pas de commandes par operation hors d un contexte Cricut', () => {
    const c = contexte([]);
    expect(commandesSelection(c.m, c.u, c.a).parOperationPossible).toBe(false);
  });

  it('repondent a leurs raccourcis : I, Y, Alt+C (par la lettre ou par la position), jamais avec Ctrl', () => {
    const touche = (init: KeyboardEventInit) => ({ key: '', code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...init }) as KeyboardEvent;
    const c = contexte(['f1']);
    expect(toucheSelection(touche({ key: 'i' }), c.m, c.u, c.a)).toBe(true);
    expect(toucheSelection(touche({ key: 'Y', shiftKey: true }), c.m, c.u, c.a)).toBe(true);
    // Option+C sur macOS : la lettre est « ç », la position reste celle du C.
    expect(toucheSelection(touche({ key: 'ç', code: 'KeyC', altKey: true }), c.m, c.u, c.a)).toBe(true);
    expect(toucheSelection(touche({ key: 'i', ctrlKey: true }), c.m, c.u, c.a)).toBe(false);
    expect(toucheSelection(touche({ key: 'x', code: 'KeyX', altKey: true, shiftKey: true }), c.m, c.u, c.a)).toBe(false);
    expect(toucheSelection(touche({ key: 'c' }), c.m, c.u, c.a)).toBe(false);
  });
});
