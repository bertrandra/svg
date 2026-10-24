import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ecrireDessin, lireDessin, STYLE_DEFAUT, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { construireBibliotheque, type IconeSource } from '../../../src/model/bibliotheque.js';
import { mentionOrigines, origineDeBibliotheque } from '../../../src/model/credits.js';
import { historique, type Historique } from '../../../src/util/historique.js';
import { nettoyerSvg } from '../../../src/util/svg.js';
import { creerActions, type EtatDuMoment, type Setters } from '../../../src/zones/creerActions.js';
import { svgDeBibliotheque } from '../../../src/zones/provenanceBibliotheque.js';

// Les chemins par lesquels une forme de la bibliotheque entre dans un dessin portent son origine (inserer au centre, panier ou scene,
// ouvrir comme nouveau dessin) ; une forme dessinee a la main n'en porte pas.

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path d="M0 0L10 0L10 10Z" fill="#c81e28"/></svg>';
const FORME = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="#000000" d="M100 100h300v300h-300z"/></svg>';

function monter() {
  const lu = lireDessin(SVG);
  if ('erreur' in lu) throw new Error(lu.erreur);
  let h: Historique<DessinSvg> = historique(lu.dessin);
  const enregistrer = vi.fn();
  const etat: EtatDuMoment = {
    dessin: lu.dessin, sel: [], formeSeule: null, outil: 'selection', point: null, style: STYLE_DEFAUT, trace: [], presse: [], lisserBooleens: true,
    vues: { vue: { zoom: 1, x: 0, y: 0 }, poserVue: vi.fn(), ajuster: vi.fn(), zoomer: vi.fn(), centrer100: vi.fn() },
    enregistrer, production: { contexte: 'generique' }, modifie: false, refaisable: false, versions: [], fermer: vi.fn(), stockage: null
  };
  const setters: Setters = {
    poserH: u => { h = typeof u === 'function' ? u(h) : u; etat.dessin = h.present; etat.modifie = h.passe.length > 0; },
    choisir: u => { etat.sel = typeof u === 'function' ? u(etat.sel) : u; },
    poserOutilBrut: vi.fn(), poserPoint: vi.fn(), poserStyle: vi.fn(), poserTrace: vi.fn(), poserPresse: vi.fn(), poserGrille: vi.fn(), poserAimants: vi.fn(), poserLisserBooleens: vi.fn(),
    poserGuides: vi.fn(), poserTiroir: vi.fn(), poserContours: vi.fn(), poserFond: vi.fn(), poserQuitter: vi.fn(), poserCurseur: vi.fn(), poserFocale: vi.fn(), poserAnnonce: vi.fn(),
    poserVersions: u => { etat.versions = typeof u === 'function' ? u(etat.versions) : u; },
    dire: vi.fn(), poserProduction: vi.fn(), toile: { current: null }
  };
  return { actions: creerActions(() => etat, setters), etat, enregistrer };
}

describe('inserer une forme de la bibliotheque dans l editeur', () => {
  it('une forme inseree avec son origine fait ecrire la mention, dans le SVG enregistre aussi', () => {
    const { actions, etat, enregistrer } = monter();
    actions.insererForme(FORME, origineDeBibliotheque('abacus'));
    expect(etat.dessin.formes.map(f => f.origine ?? null)).toEqual([null, ['game-icons:abacus']]);
    actions.enregistrerTout();
    const svg = String(enregistrer.mock.calls[0]?.[0]);
    expect(svg).toContain('<metadata>' + mentionOrigines(['game-icons:abacus']));
    expect(svg).toContain('data-origine="game-icons:abacus"');
  });

  it('sans origine (une forme qui n est pas de la bibliotheque), le SVG enregistre n a ni mention ni marque', () => {
    const { actions, enregistrer } = monter();
    actions.insererForme(FORME);
    actions.enregistrerTout();
    const svg = String(enregistrer.mock.calls[0]?.[0]);
    expect(svg).not.toContain('<metadata');
    expect(svg).not.toContain('data-origine');
  });

  it('le panier et les scenes (plusieurs formes) creditent chacune la leur', () => {
    const { actions, etat } = monter();
    actions.insererPlusieurs([
      { svg: FORME, origine: origineDeBibliotheque('abacus'), x: 0, y: 0, taille: 0.3 },
      { svg: FORME, origine: origineDeBibliotheque('3d-glasses'), x: 0.5, y: 0.5, taille: 0.3 },
      { svg: FORME, x: 0.7, y: 0.1, taille: 0.2 }
    ]);
    expect(etat.dessin.formes.map(f => f.origine ?? null)).toEqual([null, ['game-icons:abacus'], ['game-icons:3d-glasses'], null]);
  });

  it('dupliquer, coller et combiner depuis l editeur gardent l origine', () => {
    const { actions, etat } = monter();
    actions.insererForme(FORME, origineDeBibliotheque('abacus'));
    actions.dupliquerSelection();
    expect(etat.dessin.formes.filter(f => f.origine?.[0] === 'game-icons:abacus')).toHaveLength(2);
    etat.sel = etat.dessin.formes.map(f => f.id);
    actions.combinerSelection();
    expect(etat.dessin.formes).toHaveLength(1);
    expect(etat.dessin.formes[0]?.origine).toEqual(['game-icons:abacus']);
  });
});

describe('ouvrir une forme de la bibliotheque comme nouveau dessin', () => {
  it('donne un SVG propre qui porte la mention, relu avec son origine', () => {
    const svg = svgDeBibliotheque('abacus', FORME);
    expect(svg).toContain('<metadata>');
    expect(nettoyerSvg(svg)?.svg).toBe(svg);
    const lu = lireDessin(svg);
    if ('erreur' in lu) throw new Error(lu.erreur);
    expect(lu.dessin.formes.map(f => f.origine)).toEqual([['game-icons:abacus']]);
    expect(ecrireDessin(lu.dessin, 3)).toBe(svg);
  });

  it('chaque forme de la bibliotheque (un echantillon regulier de ses 4 134) s ouvre, creditee, et se reecrit a l identique', () => {
    const jeu = JSON.parse(readFileSync(resolve(__dirname, '../../../node_modules/@iconify-json/game-icons/icons.json'), 'utf8')) as { width: number; icons: Record<string, IconeSource> };
    const entrees = construireBibliotheque(jeu.icons, jeu.width);
    expect(entrees.length).toBeGreaterThan(4000);
    const echantillon = entrees.filter((_, i) => i % 20 === 0);
    for (const e of echantillon) {
      const svg = svgDeBibliotheque(e.id, e.svg);
      const lu = lireDessin(svg);
      if ('erreur' in lu) throw new Error(e.id + ' : ' + lu.erreur);
      expect(lu.dessin.formes.every(f => f.origine?.join() === origineDeBibliotheque(e.id)), e.id).toBe(true);
      expect(ecrireDessin(lu.dessin, 3), e.id).toBe(svg);
    }
  });
});
