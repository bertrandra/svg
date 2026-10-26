// Modifier une decoupe ou un masque sur place, cote interface (ADR-0012, paquet 8-D) : les verbes de l'editeur passent par la lentille
// (`appliquer` recoit le dessin de travail, chaque geste est UNE entree d'historique du dessin complet), « Modifier la découpe » y
// entre et choisit le contenu, Echap (sortirGroupe) en sort et le dit, un contenu vide refuse la sortie, liberer depuis la lentille
// fait revenir dans le groupe ; le contexte se ramene au dessin du moment (`contexteDuDessin`).

import { describe, expect, it, vi } from 'vitest';
import { contenuEnDessin, creerDecoupe, creerMasque, STYLE_DEFAUT, verifierDessin, type DessinSvg, type Forme } from '../../../src/engine/editionSvg.js';
import { historique, type Historique } from '../../../src/util/historique.js';
import { creerActions, type EtatDuMoment, type Setters } from '../../../src/zones/creerActions.js';
import { avecNiveau, contexteDuDessin, lentilleDe, niveauEdition } from '../../../src/zones/lentille.js';
import { phraseContenuVide, RAISONS_LENTILLE } from '../../../src/zones/phrasesContenus.js';

const carre = (x: number, c: number) => [{ c: 'M' as const, p: [x, 10] }, { c: 'L' as const, p: [x + c, 10] }, { c: 'L' as const, p: [x + c, 10 + c] }, { c: 'L' as const, p: [x, 10 + c] }, { c: 'Z' as const, p: [] }];
const forme = (id: string, x: number, champs: Partial<Forme> = {}): Forme => ({ id, d: carre(x, 30), remplissage: '#c81e28', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, ...champs });

function decoupe(): { d: DessinSvg; g: string } {
  const r = creerDecoupe({ vb: [0, 0, 200, 100], formes: [forme('f2', 10), forme('f3', 50), forme('f1', 20)] }, ['f2', 'f3', 'f1']);
  if (r.id === null) throw new Error(r.erreur);
  return { d: r.dessin, g: r.id };
}

/** Un editeur sans React, qui tire le dessin de travail de la lentille comme `useEtatEditeur`. */
function monter(initial: DessinSvg) {
  let h: Historique<DessinSvg> = historique(initial);
  const messages: string[] = [], annonces: string[] = [];
  const etat: EtatDuMoment = {
    dessin: initial, sel: [], formeSeule: null, outil: 'selection', point: null, style: STYLE_DEFAUT, trace: [], presse: [], lisserBooleens: true,
    vues: { vue: { zoom: 1, x: 0, y: 0 }, poserVue: vi.fn(), ajuster: vi.fn(), zoomer: vi.fn(), centrer100: vi.fn(), cadrer: vi.fn() },
    enregistrer: vi.fn(), production: { contexte: 'generique' }, modifie: false, refaisable: false, versions: [], fermer: vi.fn(), stockage: null,
    productionModifiee: false, fin: { libelle: 'Enregistrer', fermerSansModification: false, brouillon: false }, suiteCricut: null, apercuMachine: true, modele: 'riche', contexte: null
  };
  const miseAJour = () => {
    const contexte = contexteDuDessin(h.present, etat.contexte ?? null), l = lentilleDe(contexte);
    etat.contexte = contexte;
    etat.complet = h.present;
    etat.dessin = (l ? contenuEnDessin(h.present, l.groupe, l.genre) : null) ?? h.present;
    etat.modifie = h.passe.length > 0;
    etat.formeSeule = etat.sel.length === 1 ? etat.dessin.formes.find(f => f.id === etat.sel[0]) ?? null : null;
  };
  const setters: Setters = {
    poserH: u => { h = typeof u === 'function' ? u(h) : u; miseAJour(); },
    choisir: u => { etat.sel = typeof u === 'function' ? u(etat.sel) : u; miseAJour(); },
    poserOutilBrut: vi.fn(), poserPoint: vi.fn(), poserStyle: vi.fn(), poserTrace: vi.fn(), poserPresse: vi.fn(), poserGrille: vi.fn(), poserAimants: vi.fn(), poserLisserBooleens: vi.fn(),
    poserGuides: vi.fn(), poserTiroir: vi.fn(), poserContours: vi.fn(), poserFond: vi.fn(), poserQuitter: vi.fn(), poserCurseur: vi.fn(), poserFocale: vi.fn(),
    poserAnnonce: u => { annonces.push((typeof u === 'function' ? u({ texte: '', rang: 0 }) : u).texte); },
    poserVersions: vi.fn(), dire: u => { messages.push(typeof u === 'function' ? u('') : u); },
    poserProduction: vi.fn(), poserSuiteCricut: vi.fn(), poserApercuMachine: vi.fn(), poserParametres: vi.fn(), poserDemandeFormes: vi.fn(), poserRegleZone: vi.fn(), poserModele: vi.fn(),
    poserContexte: u => { etat.contexte = typeof u === 'function' ? u(etat.contexte ?? null) : u; miseAJour(); },
    poserDeplies: vi.fn(), toile: { current: null }
  };
  const actions = creerActions(() => etat, setters);
  return { actions, etat, messages, annonces, historique: () => h };
}

describe('le contexte d une decoupe ou d un masque', () => {
  it('se ramene au dessin du moment : contenu disparu, groupe du contenu disparu, groupe disparu', () => {
    const { d, g } = decoupe();
    const c = { groupe: g, dans: 'decoupe' as const };
    expect(contexteDuDessin(d, c)).toBe(c);
    expect(contexteDuDessin(d, { groupe: g, dans: 'masque' })).toEqual({ groupe: g });
    expect(contexteDuDessin(d, { groupe: g, dans: 'decoupe', sous: 'g9' })).toEqual(c);
    expect(contexteDuDessin(d, { groupe: 'g9', dans: 'decoupe' })).toBeNull();
    expect(niveauEdition(c)).toBeNull();
    expect(niveauEdition({ groupe: g })).toBe(g);
    expect(avecNiveau(c, 'g7')).toEqual({ groupe: g, dans: 'decoupe', sous: 'g7' });
    expect(avecNiveau({ groupe: g }, null)).toBeNull();
  });
});

describe('modifier une decoupe par la lentille', () => {
  it('y entre au menu, choisit sa forme et le dit ; un geste est une entree d historique du dessin complet ; Echap en sort', () => {
    const { d, g } = decoupe();
    const { actions, etat, annonces, historique: h } = monter(d);
    etat.sel = [g];
    expect(actions.modifierContenu('decoupe')).toBe(true);
    expect(etat.contexte).toEqual({ groupe: g, dans: 'decoupe' });
    expect(etat.sel).toEqual(['f1']);
    expect(annonces.at(-1)).toMatch(/^Dans la découpe du groupe 1, 1 forme, tracée en contour/);
    // Un deplacement par l'inspecteur : la decoupe bouge, le reste non, une seule entree.
    actions.transformerNumerique({ echelle: 2 });
    expect(h().passe).toHaveLength(1);
    expect(etat.complet?.formes).toBe(d.formes);
    expect(etat.complet?.groupes?.[g]?.decoupe?.contenu).not.toBe(d.groupes?.[g]?.decoupe?.contenu);
    expect(verifierDessin(h().present)).toEqual([]);
    // Annuler revient a l'etat d'avant en une fois, et la lentille reste (le contenu existe encore).
    actions.defaire();
    expect(h().present).toBe(d);
    expect(lentilleDe(etat.contexte)).not.toBeNull();
    actions.choisir([]);
    expect(actions.sortirGroupe()).toBe(true);
    expect(etat.contexte).toEqual({ groupe: g });
    expect(annonces.at(-1)).toMatch(/^Découpe reposée\. Dans le groupe 1, 2 éléments\./);
  });

  it('une copie dans la lentille garde l espace unique des identifiants, et reste choisie sous son nouveau nom', () => {
    const { d, g } = decoupe();
    const { actions, etat, historique: h } = monter(d);
    etat.sel = [g];
    actions.modifierContenu('decoupe');
    actions.dupliquerSelection();
    expect(verifierDessin(h().present)).toEqual([]);
    expect(h().present.groupes?.[g]?.decoupe?.contenu.formes.map(f => f.id)).toEqual(['f1', 'f4']);
    // L'editeur suit le renommage (renommagesDe) : ici, le verbe a choisi f2, que la lentille a renomme f4.
    expect(etat.sel).toEqual(['f2']);
  });

  it('les booleens passent par la lentille : deux formes de la decoupe se reunissent en une, de la geometrie seule', () => {
    const { d, g } = decoupe();
    const { actions, etat, historique: h } = monter(d);
    etat.sel = [g];
    actions.modifierContenu('decoupe');
    actions.dupliquerSelection();
    actions.transformerNumerique({ echelle: 1.5 });
    etat.sel = etat.dessin.formes.map(f => f.id);
    expect(actions.booleen('union')).toBe(true);
    const c = h().present.groupes?.[g]?.decoupe?.contenu;
    expect(c?.formes).toHaveLength(1);
    expect(c?.formes[0]?.remplissage).toBe('#000000');
    expect(verifierDessin(h().present)).toEqual([]);
  });

  it('un contenu vide refuse la sortie et dit quoi faire ; liberer depuis la lentille fait revenir dans le groupe', () => {
    const { d, g } = decoupe();
    const { actions, etat, messages } = monter(d);
    etat.sel = [g];
    actions.modifierContenu('decoupe');
    actions.supprimerSelection();
    expect(etat.dessin.formes).toEqual([]);
    actions.sortirGroupe();
    expect(messages.at(-1)).toBe(phraseContenuVide('decoupe'));
    expect(lentilleDe(etat.contexte)).not.toBeNull();
    actions.libererDecoupe();
    expect(etat.contexte).toEqual({ groupe: g });
    expect(etat.complet?.groupes?.[g]?.decoupe).toBeUndefined();
  });

  it('refuse ce qui ne passe pas par la lentille : le texte, les effets d une decoupe, une seconde lentille', () => {
    const { d, g } = decoupe();
    const { actions, etat, messages } = monter(d);
    etat.sel = [g];
    actions.modifierContenu('decoupe');
    actions.poserOutil('texte');
    expect(messages.at(-1)).toBe(RAISONS_LENTILLE.texte);
    actions.poserEffets({ flou: {} });
    expect(messages.at(-1)).toBe(RAISONS_LENTILLE.decoupe);
    expect(actions.modifierContenu('decoupe')).toBe(false);
    expect(messages.at(-1)).toBe(RAISONS_LENTILLE.dejaDedans);
  });
});

describe('modifier un masque par la lentille', () => {
  it('y entre par le groupe vise (la pastille), et un geste recalcule la region qui suivait', () => {
    const r = creerMasque({ vb: [0, 0, 200, 100], formes: [forme('f1', 10), forme('f2', 20, { remplissage: '#ffffff' })] }, ['f1', 'f2']);
    if (r.id === null) throw new Error(r.erreur);
    const g = r.id;
    const { actions, etat } = monter(r.dessin);
    expect(actions.modifierContenu('masque', g)).toBe(true);
    expect(etat.sel).toEqual(['f2']);
    actions.transformerNumerique({ echelle: 2 });
    expect(etat.complet?.groupes?.[g]?.masque?.region).not.toEqual(r.dessin.groupes?.[g]?.masque?.region);
    expect(verifierDessin(etat.complet ?? etat.dessin)).toEqual([]);
  });
});
