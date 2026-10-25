import { describe, expect, it, vi } from 'vitest';
import { lireDessin, modifier, STYLE_DEFAUT, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { stockageMemoire, type Stockage } from '../../../src/io/stockage.js';
import { historique, type Historique } from '../../../src/util/historique.js';
import { creerActions, type EtatDuMoment, type Setters } from '../../../src/zones/creerActions.js';
import { CLE_VERSIONS, type Version } from '../../../src/zones/session.js';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
  + '<path d="M0 0L10 0L10 10Z" fill="#c81e28"/><path d="M20 20L40 20L40 40Z" fill="#1428a0"/></svg>';

/** Un editeur sans React : un etat qu'on tient a la main, et des setters qui le mettent a jour. */
function monter(stockage: Stockage | null = null, svg = SVG) {
  const lu = lireDessin(svg);
  if ('erreur' in lu) throw new Error(lu.erreur);
  let h: Historique<DessinSvg> = historique(lu.dessin);
  const messages: string[] = [], annonces: string[] = [];
  const etat: EtatDuMoment = {
    dessin: lu.dessin, sel: [], formeSeule: null, outil: 'selection', point: null, style: STYLE_DEFAUT, trace: [], presse: [], lisserBooleens: true,
    vues: { vue: { zoom: 1, x: 0, y: 0 }, poserVue: vi.fn(), ajuster: vi.fn(), zoomer: vi.fn(), centrer100: vi.fn(), cadrer: vi.fn() },
    enregistrer: vi.fn(), production: { contexte: 'generique' }, modifie: false, refaisable: false, versions: [], fermer: vi.fn(), stockage,
    productionModifiee: false, fin: { libelle: 'Enregistrer', fermerSansModification: false, brouillon: false }, suiteCricut: null, apercuMachine: true
  };
  const poserQuitter = vi.fn();
  const miseAJour = () => { etat.dessin = h.present; etat.modifie = h.passe.length > 0; etat.refaisable = h.futur.length > 0; };
  const setters: Setters = {
    poserH: u => { h = typeof u === 'function' ? u(h) : u; miseAJour(); },
    choisir: u => { etat.sel = typeof u === 'function' ? u(etat.sel) : u; },
    poserOutilBrut: vi.fn(), poserPoint: vi.fn(), poserStyle: vi.fn(), poserTrace: vi.fn(), poserPresse: vi.fn(), poserGrille: vi.fn(), poserAimants: vi.fn(), poserLisserBooleens: vi.fn(),
    poserGuides: vi.fn(), poserTiroir: vi.fn(), poserContours: vi.fn(), poserFond: vi.fn(), poserQuitter, poserCurseur: vi.fn(), poserFocale: vi.fn(), poserAnnonce: u => { annonces.push((typeof u === 'function' ? u({ texte: '', rang: 0 }) : u).texte); },
    poserVersions: u => { etat.versions = typeof u === 'function' ? u(etat.versions) : u; },
    dire: u => { messages.push(typeof u === 'function' ? u('') : u); },
    poserProduction: u => { etat.production = typeof u === 'function' ? u(etat.production) : u; },
    poserSuiteCricut: u => { etat.suiteCricut = typeof u === 'function' ? u(etat.suiteCricut) : u; }, poserApercuMachine: vi.fn(), poserParametres: vi.fn(), poserDemandeFormes: vi.fn(),
    toile: { current: null }
  };
  const actions = creerActions(() => etat, setters);
  return { actions, etat, messages, annonces, poserQuitter, setters, historique: () => h };
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

  it('dit ce qu elle a fait quand on duplique, masque, verrouille ou combine la selection', () => {
    const { actions, etat, messages } = monter();
    etat.sel = ['f1', 'f2'];
    actions.combinerSelection();
    expect(messages.at(-1)).toMatch(/^2 formes combinées en une\./);
    // La combinaison choisit la forme qu'elle a faite ; la dupliquer en fait une de plus, choisie a son tour.
    const [combinee] = etat.sel;
    actions.dupliquerSelection();
    const [copie] = etat.sel;
    expect(copie).not.toBe(combinee);
    expect(messages.at(-1)).toBe('Forme ' + String(copie).slice(1) + ' dupliquée.');
    etat.sel = [String(combinee), String(copie)];
    actions.masquerSelection();
    expect(messages.at(-1)).toBe('2 formes masquées : affichez-les dans les calques.');
    etat.sel = [String(copie)];
    actions.verrouillerSelection();
    expect(messages.at(-1)).toBe('Verrouillée : déverrouillez-la dans les calques.');
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

  it('annonce annuler et retablir, et dit quand il n y a rien a faire', () => {
    const { actions, annonces } = monter();
    actions.defaire();
    expect(annonces).toEqual(['Rien à annuler.']);
    actions.faire(d => modifier(d, d.formes.map(f => f.id), { visible: false }));
    actions.defaire();
    actions.refaire();
    actions.refaire();
    expect(annonces).toEqual(['Rien à annuler.', 'Annulé.', 'Rétabli.', 'Rien à rétablir.']);
  });

  it('annonce aussi ce qu il dit dans la barre d etat, mais pas le silence', () => {
    const { actions, annonces, messages } = monter();
    actions.dire('Une phrase.');
    actions.dire('');
    actions.faire(d => d, 'Faite.');
    expect(messages).toEqual(['Une phrase.', '', 'Faite.']);
    expect(annonces).toEqual(['Une phrase.', 'Faite.']);
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

describe('creerActions : le geste de fin et Ctrl+S', () => {
  const deplacer = (m: ReturnType<typeof monter>) => m.actions.appliquer(d => modifier(d, ['f1'], { remplissage: '#1f8a3a' }));

  it('Ctrl+S garde le brouillon du moment et le dit, sans jamais fermer ni rendre le dessin', () => {
    const m = monter();
    const brouillon = vi.fn((svg: string) => svg.length > 0);
    m.etat.brouillon = brouillon;
    m.etat.fin = { ...m.etat.fin, brouillon: true };
    m.actions.garderBrouillon();
    expect(brouillon).not.toHaveBeenCalled();
    expect(m.messages.at(-1)).toBe('Aucune modification : rien à garder.');
    deplacer(m);
    m.actions.garderBrouillon();
    expect(brouillon).toHaveBeenCalledTimes(1);
    expect(brouillon.mock.calls[0]?.[0]).toContain('#1f8a3a');
    expect(m.messages.at(-1)).toBe('Brouillon gardé.');
    expect(m.etat.fermer).not.toHaveBeenCalled();
    expect(m.etat.enregistrer).not.toHaveBeenCalled();
  });

  it('Ctrl+S ne pretend pas avoir garde un brouillon refuse, et dit ou va le dessin sans brouillon', () => {
    const refuse = monter();
    refuse.etat.brouillon = () => false;
    deplacer(refuse);
    refuse.actions.garderBrouillon();
    expect(refuse.messages.at(-1)).toBe('Le brouillon n’a pas pu être gardé : ce navigateur refuse de l’écrire.');
    const sans = monter();
    sans.etat.fin = { libelle: 'Valider', fermerSansModification: false, brouillon: false };
    deplacer(sans);
    sans.actions.garderBrouillon();
    expect(sans.messages.at(-1)).toBe('Ctrl+S ne garde rien ici : « Valider » rend votre dessin.');
    expect(sans.etat.fermer).not.toHaveBeenCalled();
  });

  it('« Terminer » rend le dessin s il a change, ferme sans rien reecrire dans la page, et le dit ailleurs', () => {
    const page = monter();
    page.etat.fin = { libelle: 'Terminer', fermerSansModification: true, brouillon: true };
    page.actions.terminer();
    expect(page.etat.fermer).toHaveBeenCalledTimes(1);
    expect(page.etat.enregistrer).not.toHaveBeenCalled();
    deplacer(page);
    page.actions.terminer();
    expect(page.etat.enregistrer).toHaveBeenCalledTimes(1);

    const hote = monter();
    hote.actions.terminer();
    expect(hote.etat.fermer).not.toHaveBeenCalled();
    expect(hote.messages.at(-1)).toBe('Aucune modification à enregistrer.');
    // Un contexte de production change suffit a rendre le dessin (il s'ecrit dans le fichier).
    hote.etat.productionModifiee = true;
    hote.actions.terminer();
    expect(hote.etat.enregistrer).toHaveBeenCalledTimes(1);
  });

  it('« garder et fermer » de la confirmation rend puis ferme, mais ne ferme jamais un dessin qui n a pas pu etre rendu', () => {
    const ok = monter();
    deplacer(ok);
    ok.actions.enregistrerEtFermer();
    expect(ok.etat.enregistrer).toHaveBeenCalledTimes(1);
    expect(ok.etat.fermer).toHaveBeenCalledTimes(1);
    const vide = monter();
    vide.actions.appliquer(d => modifier(d, d.formes.map(f => f.id), { visible: false }));
    vide.actions.enregistrerEtFermer();
    expect(vide.etat.enregistrer).not.toHaveBeenCalled();
    expect(vide.etat.fermer).not.toHaveBeenCalled();
  });

  it('« Ajuster » cadre le dessin en Generique, le tapis en decoupe Cricut ; « Ajuster au dessin » le dessin toujours', () => {
    const m = monter();
    m.actions.ajuster();
    expect(m.etat.vues.ajuster).toHaveBeenCalledTimes(1);
    m.etat.production = { contexte: 'cricut', machine: 'maker', tapis: '12x12', materiau: 'papier-cartonne', procede: 'decoupe', unite: 'mm' };
    m.actions.ajuster();
    // Le tapis de 12 po (1 152 unites) cale sa zone utile de 11,5 po sur le coin du dessin : 24 unites de marge.
    expect(vi.mocked(m.etat.vues.cadrer).mock.calls[0]?.[0]).toMatchObject({ l: 1152, h: 1152 });
    m.actions.ajusterAuDessin();
    expect(m.etat.vues.ajuster).toHaveBeenCalledTimes(2);
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

const DEUX_CERCLES = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
  + '<circle cx="40" cy="50" r="25" fill="#c81e28"/><circle cx="65" cy="50" r="25" fill="#1428a0"/></svg>';

describe('creerActions : les booleens suivent le reglage « rebatir les courbes »', () => {
  const unir = (m: ReturnType<typeof monter>) => {
    m.etat.sel = m.etat.dessin.formes.map(f => f.id);
    m.actions.booleen('union');
    const f = m.etat.dessin.formes[0];
    if (!f) throw new Error('une forme');
    return f;
  };
  const points = (d: DessinSvg['formes'][number]['d']) => d.filter(c => c.c !== 'Z').length;

  it('rebatit des courbes quand le reglage est actif, et le dit', () => {
    const m = monter(null, DEUX_CERCLES);
    const f = unir(m);
    expect(m.etat.dessin.formes).toHaveLength(1);
    expect(f.d.some(c => c.c === 'C')).toBe(true);
    expect(f.d.some(c => c.c === 'L')).toBe(false);
    expect(m.messages.at(-1)).toBe('Union faite : 2 formes, ' + points(f.d) + ' points (courbes rebâties).');
  });

  it('rend des segments droits quand le reglage est coupe, avec bien plus de points, et le dit', () => {
    const lisse = monter(null, DEUX_CERCLES), droit = monter(null, DEUX_CERCLES);
    droit.etat.lisserBooleens = false;
    const a = unir(lisse), b = unir(droit);
    expect(b.d.some(c => c.c === 'C' || c.c === 'Q')).toBe(false);
    expect(points(b.d)).toBeGreaterThan(points(a.d) * 4);
    expect(droit.messages.at(-1)).toBe('Union faite : 2 formes, ' + points(b.d) + ' points en segments droits.');
  });

  it('lit le reglage au moment de l appel, pas a la creation', () => {
    const m = monter(null, DEUX_CERCLES);
    m.etat.lisserBooleens = false;
    m.etat.sel = m.etat.dessin.formes.map(f => f.id);
    m.actions.booleen('union');
    expect(m.messages.at(-1)).toMatch(/en segments droits\.$/);
    m.actions.defaire();
    expect(m.etat.dessin.formes).toHaveLength(2);
    m.etat.lisserBooleens = true;
    m.etat.sel = m.etat.dessin.formes.map(f => f.id);
    m.actions.booleen('union');
    expect(m.messages.at(-1)).toMatch(/\(courbes rebâties\)\.$/);
  });

  it('ne pretend pas rebatir des courbes quand les formes sont toutes droites', () => {
    const m = monter();
    m.etat.sel = m.etat.dessin.formes.map(f => f.id);
    m.actions.booleen('exclusion');
    expect(m.messages.at(-1)).toMatch(/^Exclusion faite : 2 formes, \d+ points en segments droits\.$/);
  });

  it('garde le message d une soustraction qui ne laisse rien', () => {
    const m = monter(null, DEUX_CERCLES.replace('cx="65" cy="50" r="25"', 'cx="40" cy="50" r="30"'));
    // La plus basse est un cercle de 25 contenu dans celui de 30 : plus rien ne reste de la difference.
    m.etat.sel = m.etat.dessin.formes.map(f => f.id);
    m.actions.booleen('soustraction');
    expect(m.messages.at(-1)).toBe('Il ne reste rien : les formes ont disparu. Ctrl+Z revient en arrière.');
  });

  it('laisse le reglage au setter de l editeur', () => {
    const m = monter();
    m.actions.poserLisserBooleens(false);
    expect(m.setters.poserLisserBooleens).toHaveBeenCalledWith(false);
  });
});

describe('un hote qui garde des projets (le site, ADR-0030)', () => {
  const changer = (m: ReturnType<typeof monter>) => m.actions.appliquer(d => modifier(d, ['f1'], { remplissage: '#1f8a3a' }));

  it('rend avec le SVG l etat du modele : le dessin et le contexte', () => {
    const m = monter();
    changer(m);
    m.actions.enregistrerTout();
    const [svg, etat] = vi.mocked(m.etat.enregistrer).mock.calls[0] ?? [];
    expect(svg).toMatch(/^<svg /);
    expect(etat).toEqual({ dessin: m.etat.dessin, production: { contexte: 'generique' } });
  });

  it('Ctrl+S enregistre sans fermer quand l hote le demande, et dit quand il n y a rien a enregistrer', () => {
    const m = monter();
    m.etat.fin = { libelle: 'Enregistrer', fermerSansModification: false, brouillon: false, ctrlSEnregistre: true };
    m.etat.enregistrement = { etat: 'enregistre' };
    m.actions.garderBrouillon();
    expect(m.etat.enregistrer).not.toHaveBeenCalled();
    expect(m.messages.at(-1)).toBe('Aucune modification : rien à enregistrer.');
    changer(m);
    m.etat.enregistrement = { etat: 'modifie' };
    m.actions.garderBrouillon();
    expect(m.etat.enregistrer).toHaveBeenCalledTimes(1);
    expect(m.etat.fermer).not.toHaveBeenCalled();
    m.etat.enregistrement = { etat: 'en-cours' };
    m.actions.garderBrouillon();
    expect(m.etat.enregistrer).toHaveBeenCalledTimes(1);
    expect(m.messages.at(-1)).toBe('Enregistrement en cours…');
  });

  it('l etat annonce par l hote decide : un projet neuf s enregistre sans modification, un projet enregistre se ferme sans confirmation', () => {
    const neuf = monter();
    neuf.etat.enregistrement = { etat: 'modifie' };
    neuf.actions.terminer();
    expect(neuf.etat.enregistrer).toHaveBeenCalledTimes(1);

    const enregistre = monter();
    changer(enregistre);
    enregistre.etat.enregistrement = { etat: 'enregistre' };
    enregistre.actions.terminer();
    expect(enregistre.etat.enregistrer).not.toHaveBeenCalled();
    expect(enregistre.messages.at(-1)).toBe('Aucune modification à enregistrer.');
    enregistre.actions.demanderFermeture();
    expect(enregistre.poserQuitter).not.toHaveBeenCalled();
    expect(enregistre.etat.fermer).toHaveBeenCalledTimes(1);

    const echec = monter();
    echec.etat.enregistrement = { etat: 'echec', message: 'Le serveur ne répond pas.' };
    echec.actions.demanderFermeture();
    expect(echec.poserQuitter).toHaveBeenCalledWith(true);
    echec.actions.terminer();
    expect(echec.etat.enregistrer).toHaveBeenCalledTimes(1);
  });
});
