import { describe, expect, it, vi } from 'vitest';
import { lireDessin, modifier, STYLE_DEFAUT, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { stockageMemoire, type Stockage } from '../../../src/io/stockage.js';
import { historique, type Historique } from '../../../src/util/historique.js';
import { creerActions, type EtatDuMoment, type Setters } from '../../../src/zones/creerActions.js';
import { CLE_VERSIONS, type Version } from '../../../src/zones/session.js';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
  + '<path d="M0 0L10 0L10 10Z" fill="#c81e28"/><path d="M20 20L40 20L40 40Z" fill="#1428a0"/></svg>';

/** Un editeur sans React : un etat qu'on tient a la main, et des setters qui le mettent a jour. */
function monter(stockage: Stockage | null = null) {
  const lu = lireDessin(SVG);
  if ('erreur' in lu) throw new Error(lu.erreur);
  let h: Historique<DessinSvg> = historique(lu.dessin);
  const messages: string[] = [];
  const etat: EtatDuMoment = {
    dessin: lu.dessin, sel: [], formeSeule: null, outil: 'selection', point: null, style: STYLE_DEFAUT, trace: [], presse: [],
    vues: { vue: { zoom: 1, x: 0, y: 0 }, poserVue: vi.fn(), ajuster: vi.fn(), zoomer: vi.fn(), centrer100: vi.fn() },
    enregistrer: vi.fn(), modifie: false, versions: [], fermer: vi.fn(), stockage
  };
  const poserQuitter = vi.fn();
  const miseAJour = () => { etat.dessin = h.present; etat.modifie = h.passe.length > 0; };
  const setters: Setters = {
    poserH: u => { h = typeof u === 'function' ? u(h) : u; miseAJour(); },
    choisir: u => { etat.sel = typeof u === 'function' ? u(etat.sel) : u; },
    poserOutilBrut: vi.fn(), poserPoint: vi.fn(), poserStyle: vi.fn(), poserTrace: vi.fn(), poserPresse: vi.fn(), poserGrille: vi.fn(), poserAimants: vi.fn(),
    poserGuides: vi.fn(), poserTiroir: vi.fn(), poserContours: vi.fn(), poserFond: vi.fn(), poserQuitter,
    poserVersions: u => { etat.versions = typeof u === 'function' ? u(etat.versions) : u; },
    dire: u => { messages.push(typeof u === 'function' ? u('') : u); },
    toile: { current: null }
  };
  const actions = creerActions(() => etat, setters);
  return { actions, etat, messages, poserQuitter, historique: () => h };
}

describe('creerActions : des verbes qui lisent l etat du moment', () => {
  it('supprime la selection d aujourd hui, pas celle de la creation', () => {
    const { actions, etat, messages } = monter();
    const [premiere] = etat.dessin.formes;
    if (!premiere) throw new Error('un dessin de deux formes');
    // Le verbe existe deja ; la selection change ensuite, sans qu'on refasse les actions.
    etat.sel = [premiere.id];
    actions.supprimerSelection();
    expect(etat.dessin.formes).toHaveLength(1);
    expect(etat.dessin.formes.some(f => f.id === premiere.id)).toBe(false);
    expect(messages.at(-1)).toBe('1 forme supprimée.');
  });

  it('ne fait rien sans selection', () => {
    const { actions, etat, historique: h } = monter();
    actions.supprimerSelection();
    expect(etat.dessin.formes).toHaveLength(2);
    expect(h().passe).toHaveLength(0);
  });

  it('refuse d enregistrer un dessin sans forme visible, et le dit', () => {
    const { actions, etat, messages } = monter();
    actions.appliquer(d => modifier(d, d.formes.map(f => f.id), { visible: false }));
    actions.enregistrerTout();
    expect(etat.enregistrer).not.toHaveBeenCalled();
    expect(messages.at(-1)).toBe('Le dessin n’a plus de forme visible : rien à enregistrer.');
  });

  it('enregistre le SVG nettoye du dessin du moment', () => {
    const { actions, etat } = monter();
    actions.enregistrerTout();
    expect(etat.enregistrer).toHaveBeenCalledTimes(1);
    expect(vi.mocked(etat.enregistrer).mock.calls[0]?.[0]).toMatch(/^<svg /);
  });

  it('annule et retablit par l historique', () => {
    const { actions, etat, historique: h } = monter();
    actions.faire(d => modifier(d, d.formes.map(f => f.id), { visible: false }), 'masquees');
    expect(h().passe).toHaveLength(1);
    expect(etat.modifie).toBe(true);
    actions.defaire();
    expect(h().passe).toHaveLength(0);
    expect(h().futur).toHaveLength(1);
    actions.refaire();
    expect(h().passe).toHaveLength(1);
  });

  it('numerote ses gestes sans jamais repeter une cle', () => {
    const { actions } = monter();
    expect(new Set([actions.nouvelleCle(), actions.nouvelleCle(), actions.nouvelleCle()]).size).toBe(3);
  });

  it('ferme tout de suite un dessin intact, et demande confirmation s il a change', () => {
    const intact = monter();
    intact.actions.demanderFermeture();
    expect(intact.etat.fermer).toHaveBeenCalledTimes(1);
    expect(intact.poserQuitter).not.toHaveBeenCalled();

    const change = monter();
    change.actions.appliquer(d => modifier(d, d.formes.map(f => f.id), { visible: false }));
    change.actions.demanderFermeture();
    expect(change.etat.fermer).not.toHaveBeenCalled();
    expect(change.poserQuitter).toHaveBeenCalledWith(true);
  });
});

describe('creerActions : les versions nommees vont dans le stockage donne', () => {
  it('garde puis supprime une version dans le stockage de l hote', () => {
    const stockage = stockageMemoire();
    const { actions, etat, messages } = monter(stockage);
    actions.garderVersion('avant recoloration', '<svg/>');
    expect(etat.versions).toHaveLength(1);
    expect(stockage.lire<Version[]>(CLE_VERSIONS)?.[0]?.nom).toBe('avant recoloration');
    expect(messages.at(-1)).toBe('Version « avant recoloration » gardée dans ce navigateur.');
    const [id] = etat.versions.map(v => v.id);
    if (id === undefined) throw new Error('une version');
    actions.supprimerVersion(id);
    expect(stockage.lire<Version[]>(CLE_VERSIONS)).toEqual([]);
  });

  it('sans stockage, la version vit le temps de la page et rien ne se garde', () => {
    const { actions, etat } = monter(null);
    actions.garderVersion('v1', '<svg/>');
    expect(etat.versions).toHaveLength(1);
  });

  it('garde les plus recentes d abord', () => {
    const stockage = stockageMemoire();
    const { actions } = monter(stockage);
    actions.garderVersion('premiere', '<svg/>');
    actions.garderVersion('seconde', '<svg/>');
    expect(stockage.lire<Version[]>(CLE_VERSIONS)?.map(v => v.nom)).toEqual(['seconde', 'premiere']);
  });
});
