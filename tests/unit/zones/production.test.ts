// Les actions du contexte de production (ADR-0013), sans React : le choix ramene a un choix valide et dit, la
// correction d'un constat en une entree d'historique avec sa phrase, et l'ecriture du document marquee seulement
// hors de Generique.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ecrireDessin, lireDessin, STYLE_DEFAUT, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { CHOIX_CRICUT_DEFAUT, CHOIX_GENERIQUE, type ChoixProduction } from '../../../src/model/contextes.js';
import type { EtatDuMoment } from '../../../src/zones/creerActions.js';
import { actionsProduction, choixCricut, phraseProduction, phraseReste, svgDocument, uniteRetenue } from '../../../src/zones/actionsProduction.js';
import { stockageMemoire } from '../../../src/io/stockage.js';

const lire = (svg: string): DessinSvg => { const r = lireDessin(svg); if ('erreur' in r) throw new Error(r.erreur); return r.dessin; };
// En pouces : ces phrases datent d'avant le millimetre par defaut, le choix explicite les garde.
const CRICUT: ChoixProduction = { contexte: 'cricut', ...CHOIX_CRICUT_DEFAUT, unite: 'in' };
const TRAIT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 288"><path d="M48 48H240V240H48Z" fill="#c81e28" stroke="#15181d" stroke-width="8"/></svg>';

function monter(svg: string, production: ChoixProduction) {
  const etat: EtatDuMoment = {
    dessin: lire(svg), sel: [], formeSeule: null, outil: 'selection', point: null, style: STYLE_DEFAUT, trace: [], presse: [], lisserBooleens: true,
    vues: { vue: { zoom: 1, x: 0, y: 0 }, poserVue: vi.fn(), ajuster: vi.fn(), zoomer: vi.fn(), centrer100: vi.fn(), cadrer: vi.fn() }, enregistrer: vi.fn(), production,
    modifie: false, refaisable: false, versions: [], fermer: vi.fn(), stockage: null, productionModifiee: false,
    fin: { libelle: 'Enregistrer', fermerSansModification: false, brouillon: false }, suiteCricut: null
  };
  const messages: string[] = [], historique: DessinSvg[] = [];
  const poser = vi.fn((c: ChoixProduction) => { etat.production = c; });
  const actions = actionsProduction(() => etat, {
    appliquer: f => { historique.push(etat.dessin); etat.dessin = f(etat.dessin); }, choisir: vi.fn(), poserPoint: vi.fn(), poserOutil: vi.fn(), poserOutilBrut: vi.fn(),
    poserTrace: vi.fn(), poserPresse: vi.fn(), dire: t => { messages.push(t); }, toile: { current: null }
  }, { poserProduction: poser, poserSuiteCricut: s => { etat.suiteCricut = s; } });
  return { actions, etat, messages, historique, poser };
}

describe('les actions du contexte de production', () => {
  it('posent un choix valide et le disent', () => {
    const m = monter(TRAIT, CHOIX_GENERIQUE);
    m.actions.poserProduction({ ...CRICUT, machine: 'joy', procede: 'imprimer-decouper' });
    expect(m.etat.production).toEqual({ ...CRICUT, machine: 'joy', tapis: 'joy-4x6', procede: 'decoupe' });
    expect(m.messages).toEqual(['Contexte Cricut : Joy, tapis joy 4,5 × 6,5 po, papier cartonné, en pouces.']);
    m.actions.poserProduction(CHOIX_GENERIQUE);
    expect(m.messages.at(-1)).toBe('Contexte générique : le dessin n’est plus jugé pour une machine.');
  });

  it('corrigent un constat en une seule entree d historique, et disent ce qu il reste', () => {
    const m = monter(TRAIT, CRICUT);
    m.actions.corrigerConstat('trait');
    expect(m.historique).toHaveLength(1);
    expect(m.etat.dessin.formes.every(f => f.contour === null)).toBe(true);
    expect(m.messages).toEqual(['1 contour transformé en forme. Prêt à découper. Ctrl+Z annule.']);
    m.actions.corrigerConstat('trait');
    expect(m.historique).toHaveLength(1);
    expect(m.messages.at(-1)).toBe('Ce constat ne se pose plus : le dessin a changé.');
  });

  it('ne corrigent ni n exportent rien en Generique', () => {
    const m = monter(TRAIT, CHOIX_GENERIQUE);
    m.actions.corrigerConstat('trait');
    expect(m.historique).toHaveLength(0);
    m.actions.exporterPourCricut('dessin');
    expect(m.messages).toEqual(['Choisissez d’abord une machine Cricut dans la barre.']);
  });

  it('refusent l export d un dessin qui bloque, en le nommant', () => {
    const m = monter(TRAIT, CRICUT);
    m.actions.exporterPourCricut('dessin');
    expect(m.messages[0]).toMatch(/^Corrigez d’abord, dans le panneau « Prêt pour Cricut » : Une forme a un contour/);
  });
});

describe('la fin du parcours Cricut', () => {
  const OUVERT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 288"><path d="M48 48L240 48L144 240" fill="#c81e28"/></svg>';
  afterEach(() => { vi.unstubAllGlobals(); });

  it('demande une confirmation avant d exporter un dessin qui a un point a corriger, sans rien telecharger', () => {
    const m = monter(OUVERT, CRICUT);
    const telecharge = vi.fn(async () => ({ save: telecharge }));
    vi.stubGlobal('window', { claude: { use: telecharge } });
    m.actions.exporterPourCricut('dessin');
    expect(m.etat.suiteCricut).toBe('confirmer');
    expect(m.messages.at(-1)).toMatch(/^Il reste 1 point à corriger : .*tracé.* Exporter quand même, ou Revoir\.$/);
    expect(telecharge).not.toHaveBeenCalled();
  });

  it('exporte « quand même » sur la confirmation, puis montre les etapes dans Design Space', async () => {
    const m = monter(OUVERT, CRICUT);
    const noms: string[] = [];
    vi.stubGlobal('window', { claude: { use: async () => ({ save: async (o: { filename: string }) => { noms.push(o.filename); } }) } });
    m.actions.exporterPourCricut('bonhomme-de-neige', true);
    expect(m.etat.suiteCricut).toBe('design-space');
    await vi.waitFor(() => expect(noms).toEqual(['bonhomme-de-neige-cricut.svg']));
    await vi.waitFor(() => expect(m.messages.at(-1)).toMatch(/^Fichier proposé : bonhomme-de-neige-cricut\.svg\. 1 couche : 1 tapis, /));
    m.actions.fermerSuiteCricut();
    expect(m.etat.suiteCricut).toBeNull();
  });

  it('cadre le tapis quand une machine apparait, retient l unite choisie, et efface la suite d un autre choix', () => {
    const m = monter(TRAIT, CHOIX_GENERIQUE);
    m.etat.suiteCricut = 'design-space';
    m.actions.poserProduction({ ...CRICUT, unite: 'mm' });
    expect(m.etat.suiteCricut).toBeNull();
    expect(vi.mocked(m.etat.vues.cadrer)).toHaveBeenCalledTimes(1);
    expect(choixCricut(null)).toMatchObject({ contexte: 'cricut', unite: 'mm' });
    m.actions.poserProduction({ ...CRICUT, unite: 'in' });
    expect(choixCricut(null)).toMatchObject({ unite: 'in' });
    // Le meme tapis, une autre unite : la vue ne bouge pas.
    expect(vi.mocked(m.etat.vues.cadrer)).toHaveBeenCalledTimes(1);
    // Un stockage garde l'unite d'une page a l'autre ; une valeur abimee s'y lit comme absente.
    const st = stockageMemoire();
    m.etat.stockage = st;
    m.actions.poserProduction({ ...CRICUT, unite: 'mm' });
    expect(st.lire('svg.unite')).toBe('mm');
    expect(uniteRetenue(st)).toBe('mm');
    st.ecrire('svg.unite', 'cm');
    expect(uniteRetenue(st)).toBe('mm');
  });
});

describe('l ecriture du document', () => {
  it('est exactement ecrireDessin en Generique, et porte la marque en Cricut', () => {
    const d = lire(TRAIT);
    expect(svgDocument(d, CHOIX_GENERIQUE)).toBe(ecrireDessin(d, 3));
    expect(svgDocument(d, CRICUT)).toContain(' height="288" data-ed-contexte="cricut" data-ed-machine="maker"');
  });

  it('dit les phrases du panneau', () => {
    expect(phraseProduction(CRICUT)).toBe('Contexte Cricut : Maker (Maker / Maker 3), tapis 12 × 12 po, papier cartonné, en pouces.');
    expect(phraseReste(0, 'imprimer-decouper')).toBe('Prêt pour Print Then Cut.');
    expect(phraseReste(2, 'decoupe')).toBe('Reste 2 constats.');
  });
});
