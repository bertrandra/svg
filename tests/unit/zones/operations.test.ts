// Couper ou ecrire dans l'editeur (ADR-0028), sans React : le geste qui change l'operation (une entree d'historique, dite ; rien en
// Generique ni sur une forme verrouillee), l'apercu de la machine qui se montre et se retire, l'export d'un dessin mele, et ce que
// la fin du parcours en dit (le libelle de l'export, les etapes dans Design Space). L'archive elle-meme est essayee dans
// tests/unit/export/operations.test.ts, le telechargement dans tests/e2e/operations.e2e.ts.

import { describe, expect, it, vi } from 'vitest';
import { lireDessin, STYLE_DEFAUT, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { resoudreProfil } from '../../../src/engine/preparation.js';
import { CHOIX_CRICUT_DEFAUT, CHOIX_GENERIQUE, type ChoixProduction } from '../../../src/model/contextes.js';
import type { EtatDuMoment } from '../../../src/zones/creerActions.js';
import { actionsProduction, phraseApercu } from '../../../src/zones/actionsProduction.js';
import { etapesDesignSpace, etatExport, libelleExport } from '../../../src/zones/parcoursCricut.js';

const lire = (svg: string): DessinSvg => { const r = lireDessin(svg); if ('erreur' in r) throw new Error(r.erreur); return r.dessin; };
const CRICUT: ChoixProduction = { contexte: 'cricut', ...CHOIX_CRICUT_DEFAUT, unite: 'in' };
const MELE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 288"><path d="M48 48H240V240H48Z" fill="#c81e28"/><path d="M288 96L432 96" fill="none" stroke="#1f4e8c" stroke-width="2"/><path d="M288 160H432V240H288Z" fill="#1f4e8c"/></svg>';

function monter(production: ChoixProduction, sel: string[] = []) {
  const etat: EtatDuMoment = {
    dessin: lire(MELE), sel, formeSeule: null, outil: 'selection', point: null, style: STYLE_DEFAUT, trace: [], presse: [], lisserBooleens: true,
    vues: { vue: { zoom: 1, x: 0, y: 0 }, poserVue: vi.fn(), ajuster: vi.fn(), zoomer: vi.fn(), centrer100: vi.fn(), cadrer: vi.fn() }, enregistrer: vi.fn(), production,
    modifie: false, refaisable: false, versions: [], fermer: vi.fn(), stockage: null, productionModifiee: false,
    fin: { libelle: 'Enregistrer', fermerSansModification: false, brouillon: false }, suiteCricut: null, apercuMachine: true
  };
  const messages: string[] = [], historique: DessinSvg[] = [];
  const actions = actionsProduction(() => etat, {
    appliquer: f => { historique.push(etat.dessin); etat.dessin = f(etat.dessin); }, choisir: vi.fn(), poserPoint: vi.fn(), poserOutil: vi.fn(), poserOutilBrut: vi.fn(),
    poserTrace: vi.fn(), poserPresse: vi.fn(), dire: t => { messages.push(t); }, toile: { current: null }
  }, {
    poserProduction: c => { etat.production = c; }, poserSuiteCricut: s => { etat.suiteCricut = s; },
    poserApercuMachine: a => { etat.apercuMachine = typeof a === 'function' ? a(etat.apercuMachine) : a; }
  });
  return { actions, etat, messages, historique };
}

describe('changer l operation d une forme', () => {
  it('passe la selection a ecrire en une entree d historique, et le dit avec Ctrl+Z', () => {
    const m = monter(CRICUT, ['f1', 'f3']);
    m.actions.poserOperation('ecriture');
    expect(m.historique).toHaveLength(1);
    expect(m.etat.dessin.formes.map(f => f.operation)).toEqual(['ecriture', undefined, 'ecriture']);
    expect(m.messages).toEqual(['2 formes passent à l’écriture au stylo. Ctrl+Z annule.']);
    // Rien ne change : aucune entree de plus, et la phrase le dit.
    m.actions.poserOperation('ecriture');
    expect(m.historique).toHaveLength(1);
    expect(m.messages.at(-1)).toBe('Ces formes sont déjà à écrire.');
  });

  it('agit sur des formes nommees (une ligne du panneau, un glisser) plutot que sur la selection', () => {
    const m = monter(CRICUT, ['f1']);
    m.actions.poserOperation('decoupe', ['f2']);
    expect(m.etat.dessin.formes.map(f => f.operation)).toEqual([undefined, 'decoupe', undefined]);
    expect(m.messages).toEqual(['Une forme passe à la découpe. Ctrl+Z annule.']);
  });

  it('ne fait rien en Generique, ni en Print Then Cut, ni sans selection, ni sur des formes verrouillees, et le dit', () => {
    const generique = monter(CHOIX_GENERIQUE, ['f1']);
    generique.actions.poserOperation('ecriture');
    expect(generique.historique).toHaveLength(0);
    expect(generique.messages).toEqual(['Couper ou écrire se choisit en contexte Cricut, pour la découpe ou le stylo.']);
    const ptc = monter({ ...CRICUT, procede: 'imprimer-decouper' }, ['f1']);
    ptc.actions.poserOperation('ecriture');
    expect(ptc.historique).toHaveLength(0);
    const rien = monter(CRICUT);
    rien.actions.poserOperation('ecriture');
    expect(rien.messages).toEqual(['Choisissez d’abord une forme à écrire.']);
    const verrou = monter(CRICUT, ['f1']);
    verrou.etat.dessin = { ...verrou.etat.dessin, formes: verrou.etat.dessin.formes.map(f => ({ ...f, verrouille: f.id === 'f1' })) };
    verrou.actions.poserOperation('ecriture');
    expect(verrou.historique).toHaveLength(0);
    expect(verrou.messages).toEqual(['Ces formes sont verrouillées : déverrouillez-les pour changer ce que la machine en fait.']);
  });
});

describe('l apercu de la machine', () => {
  it('se retire et revient, et le dit', () => {
    const m = monter(CRICUT);
    m.actions.poserApercuMachine(a => !a);
    expect(m.etat.apercuMachine).toBe(false);
    expect(m.messages).toEqual([phraseApercu(false)]);
    m.actions.poserApercuMachine(true);
    expect(m.etat.apercuMachine).toBe(true);
    expect(m.messages.at(-1)).toBe('Aperçu de la machine : les zones que la lame découpe sont hachurées, les lignes du stylo tracées.');
  });
});

describe('la fin du parcours d un dessin mele', () => {
  const p = resoudreProfil({ ...CRICUT, procede: 'dessin-stylo' });
  if (!p) throw new Error('profil');

  it('s exporte « pour Cricut », meme au stylo : l archive porte la lame et le stylo', () => {
    expect(libelleExport('dessin-stylo', true)).toBe('Exporter pour Cricut');
    expect(libelleExport('dessin-stylo')).toBe('Exporter pour le stylo');
    expect(etatExport([], 'dessin-stylo', true).libelle).toBe('Exporter pour Cricut');
  });

  it('dit les etapes dans Design Space : deux fichiers, « Dessiner », « Attacher », ce qui n est pas verifie marque', () => {
    const e = etapesDesignSpace(p, 'carte', { l: 480, h: 288 }, true);
    expect(e.map(x => x.texte)).toEqual([
      'Ouvrez l’archive carte-cricut.zip : le fichier à couper, le fichier à écrire, les deux ensemble et un mode d’emploi.',
      'Dans Design Space, « Nouveau projet », puis « Importer » carte-a-couper.svg, puis carte-a-ecrire.svg, sans changer leur taille (5 × 3 po).',
      'Passez les calques de carte-a-ecrire.svg en « Dessiner » (une couleur, un stylo) ; ceux de carte-a-couper.svg restent sur « Couper ».',
      'Sélectionnez tout et « Attachez » : le stylo écrit à sa place sur la pièce découpée.'
    ]);
    expect(e.slice(1).every(x => x.aVerifier)).toBe(true);
  });
});
