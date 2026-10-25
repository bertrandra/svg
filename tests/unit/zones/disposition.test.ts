// Le texte pose sur ou dans une forme, cote interface (ADR-0031) : le changement d'un texte pose (disposition, alignement sur un
// trace ouvert, retour au texte libre), ce qui ne se pose pas, la recomposition dans la meme entree d'historique quand la forme
// change (les glyphes donnees aux verbes), la saisie qui recompose sur la forme, et les phrases.

import { describe, expect, it, vi } from 'vitest';
import { deplacer, ellipse, polygone, STYLE_DEFAUT, supprimer, type DessinSvg, type Forme } from '../../../src/engine/editionSvg.js';
import { creerTexte, nouveauTexte, peintureDuTexte } from '../../../src/engine/texte/vivant.js';
import { cheminDuTexte } from '../../../src/engine/texte/bloc.js';
import type { Police } from '../../../src/io/polices.js';
import { historique, type Historique } from '../../../src/util/historique.js';
import { au } from '../../../src/util/tableaux.js';
import { appliquerChangement, dispositionPour, poseApres, rienNeSePose } from '../../../src/zones/actionsTexte.js';
import { candidatesPour, depassementDe } from '../../../src/zones/actionsDisposition.js';
import { creerActions, type EtatDuMoment, type Setters } from '../../../src/zones/creerActions.js';
import { frapper } from '../../../src/zones/saisie.js';
import { operationProposee } from '../../../src/engine/preparation/operations.js';
import {
  LIBELLES_REMPLIR, nomCourt, phraseCandidate, phraseChoixForme, phraseDepart, phraseDepassement, phraseFormePerdue, phraseFormeVisible, phrasePose, phraseRemplir,
  phraseRienNeTient, remplit
} from '../../../src/zones/phrasesDisposition.js';
import { glyphesCarres } from '../engine/glyphesFactices.js';

const police: Police = { id: 'inter', nom: 'Inter', version: '0123456789abcd', nature: 'contour', glyphes: glyphesCarres };
const forme = (id: string, d: Forme['d'], r: Partial<Forme> = {}): Forme => ({ id, d, remplissage: '#c81e28', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, ...r });

/** Un cercle (f1), une ligne (f2), et un texte libre (f3). */
function dessin(texte = 'BADGE'): DessinSvg {
  const base: DessinSvg = { vb: [0, 0, 400, 300], formes: [forme('f1', ellipse(100, 100, 200, 200)), forme('f2', polygone([[20, 280], [380, 280]], false), { remplissage: null, contour: '#000000', epaisseur: 1 })] };
  const t = nouveauTexte(texte, { id: 'inter', version: '0123456789abcd' }, 20, [1, 0, 0, 1, 10, 30]);
  return creerTexte(base, t, cheminDuTexte(t, glyphesCarres), peintureDuTexte('contour', STYLE_DEFAUT, 1)).dessin;
}
const trouver = (d: DessinSvg, id: string): Forme => { const f = d.formes.find(x => x.id === id); if (!f) throw new Error(id); return f; };

describe('changer un texte pose', () => {
  it('le pose sur une forme fermee au point le plus haut, sur un trace ouvert au milieu, et le rend libre', () => {
    const d = dessin();
    const sur = dispositionPour('sur', trouver(d, 'f1'));
    expect(sur).toEqual({ mode: 'sur', forme: 'f1', depart: 0, cote: 'dessus', repartir: false });
    expect(dispositionPour('sur', trouver(d, 'f2'))).toMatchObject({ depart: 0.5 });
    expect(dispositionPour('dans', trouver(d, 'f1'))).toEqual({ mode: 'dans', forme: 'f1', marge: 0.25, ajuster: false, justifier: false });
    const pose = appliquerChangement(d, 'f3', { disposition: sur, alignement: 'centre' }, police, null);
    expect(trouver(pose, 'f3').texte?.disposition).toEqual(sur);
    expect(trouver(pose, 'f3').d).not.toEqual(trouver(d, 'f3').d);
    const libre = appliquerChangement(pose, 'f3', { disposition: null }, police, null);
    expect(trouver(libre, 'f3').texte?.disposition).toBeUndefined();
  });

  it('sur un trace ouvert, changer l alignement pose le texte au debut, au milieu ou a la fin', () => {
    const d = appliquerChangement(dessin(), 'f3', { disposition: dispositionPour('sur', trouver(dessin(), 'f2')) }, police, null);
    const fin = appliquerChangement(d, 'f3', { alignement: 'droite' }, police, null);
    expect(trouver(fin, 'f3').texte?.disposition).toMatchObject({ depart: 1 });
    const debut = appliquerChangement(d, 'f3', { alignement: 'gauche' }, police, null);
    expect(trouver(debut, 'f3').texte?.disposition).toMatchObject({ depart: 0 });
  });

  it('dit ce qui ne se pose pas plutot que de poser une forme sans contours', () => {
    const d = appliquerChangement(dessin('un deux trois'), 'f3', { disposition: { mode: 'dans', forme: 'f1', marge: 0.25, ajuster: false, justifier: false } }, police, null);
    expect(rienNeSePose(d, 'f3', { taille: 500 }, police)).toBe(true);
    expect(rienNeSePose(d, 'f3', { taille: 10 }, police)).toBe(false);
    expect(appliquerChangement(d, 'f3', { taille: 500 }, police, null)).toBe(d);
    expect(depassementDe(d, 'f3', police)).toEqual({ depasse: 0, nonPlaces: 0 });
  });

  it('suit la regle de couper ou ecrire (ADR-0028) : pose en trace Median, il s ecrit ; plein, il se coupe', () => {
    const d = appliquerChangement(dessin(), 'f3', { disposition: dispositionPour('sur', trouver(dessin(), 'f1')) }, police, null);
    expect(operationProposee(trouver(d, 'f3'), 'decoupe')).toBe('decoupe');
    const median = appliquerChangement(d, 'f3', { trace: 'median' }, police, null);
    expect(trouver(median, 'f3').texte?.disposition?.mode).toBe('sur');
    expect(trouver(median, 'f3').remplissage).toBeNull();
    expect(operationProposee(trouver(median, 'f3'), 'decoupe')).toBe('ecriture');
  });

  it('ne propose comme forme ni un texte, ni une forme masquee ou verrouillee', () => {
    const d = dessin();
    expect(candidatesPour(d, 'f3').map(f => f.id)).toEqual(['f1', 'f2']);
    const cache = { ...d, formes: d.formes.map(f => (f.id === 'f1' ? { ...f, visible: false } : f.id === 'f2' ? { ...f, verrouille: true } : f)) };
    expect(candidatesPour(cache, 'f3')).toEqual([]);
  });

  it('recompose sur la forme a chaque frappe de la saisie sur la toile', () => {
    const d = appliquerChangement(dessin('AB'), 'f3', { disposition: dispositionPour('sur', trouver(dessin(), 'f1')), alignement: 'centre' }, police, null);
    const r = frapper(d, { id: 'f3', neuf: null }, 'ABCD', police, { remplissage: '#000000', contour: null, epaisseur: 0 }, null);
    const t = trouver(r.dessin, 'f3');
    expect(t.texte?.texte).toBe('ABCD');
    expect(t.texte?.disposition?.mode).toBe('sur');
    // Quatre lettres posees sur le cercle : leurs points sont autour de lui, pas sur une ligne droite.
    const ys = t.d.filter(c => c.c !== 'Z').map(c => c.p[1] ?? 0);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(14.5);
  });
});

/** Un editeur sans React (comme creerActions.test.ts) : un etat tenu a la main, des setters qui le mettent a jour. */
function monter(depart: DessinSvg) {
  let h: Historique<DessinSvg> = historique(depart);
  const annonces: string[] = [];
  const etat = {
    dessin: depart, sel: [], formeSeule: null, outil: 'selection', point: null, style: STYLE_DEFAUT, trace: [], presse: [], lisserBooleens: true,
    vues: { vue: { zoom: 1, x: 0, y: 0 }, poserVue: vi.fn(), ajuster: vi.fn(), zoomer: vi.fn(), centrer100: vi.fn(), cadrer: vi.fn() },
    enregistrer: vi.fn(), production: { contexte: 'generique' }, modifie: false, refaisable: false, versions: [], fermer: vi.fn(), stockage: null,
    productionModifiee: false, fin: { libelle: 'Enregistrer', fermerSansModification: false, brouillon: false }, suiteCricut: null, apercuMachine: true
  } as EtatDuMoment;
  const rien = vi.fn();
  const setters = {
    poserH: (u: Historique<DessinSvg> | ((x: Historique<DessinSvg>) => Historique<DessinSvg>)) => { h = typeof u === 'function' ? u(h) : u; etat.dessin = h.present; etat.modifie = h.passe.length > 0; },
    choisir: rien, poserOutilBrut: rien, poserPoint: rien, poserStyle: rien, poserTrace: rien, poserPresse: rien, poserGrille: rien, poserAimants: rien, poserLisserBooleens: rien,
    poserGuides: rien, poserTiroir: rien, poserContours: rien, poserFond: rien, poserQuitter: rien, poserCurseur: rien, poserFocale: rien,
    poserAnnonce: (u: unknown) => { annonces.push(typeof u === 'function' ? (u as (a: { texte: string; rang: number }) => { texte: string })({ texte: '', rang: 0 }).texte : (u as { texte: string }).texte); },
    poserVersions: rien, dire: rien, poserProduction: rien, poserSuiteCricut: rien, poserApercuMachine: rien, toile: { current: null }
  } as unknown as Setters;
  return { actions: creerActions(() => etat, setters), etat, historique: () => h };
}

describe('changer un texte deforme (ADR-0032)', () => {
  it('le deforme dans une forme fermee, a la marge par defaut, sa taille calculee ; puis en lignes et retour, sur la meme forme', () => {
    const d = dessin('AMOUR');
    const env = { mode: 'enveloppe', forme: 'f1', marge: 0.05 } as const;
    expect(dispositionPour('enveloppe', trouver(d, 'f1'))).toEqual(env);
    const pose = appliquerChangement(d, 'f3', { disposition: env, alignement: 'centre' }, police, null);
    const t = trouver(pose, 'f3').texte;
    expect(t?.disposition).toEqual(env);
    // La taille se calcule : la hauteur du cercle (200) sur celle des lettres carrees (0,7 de la taille).
    expect(t?.taille).toBe(Math.floor((200 / 0.7) * 100) / 100);
    // En lignes, puis deforme a nouveau : la meme forme, la marge par defaut de chaque mode.
    const lignes = dispositionPour('dans', trouver(pose, 'f1'), env);
    expect(lignes).toMatchObject({ mode: 'dans', forme: 'f1', marge: 0.25 });
    expect(dispositionPour('enveloppe', trouver(pose, 'f1'), { ...env, marge: 0.2 })).toEqual({ ...env, marge: 0.2 });
  });

  it('ne se deforme pas dans une forme sans interieur, et dit pourquoi', () => {
    const d = appliquerChangement(dessin('AMOUR'), 'f3', { disposition: dispositionPour('enveloppe', trouver(dessin(), 'f1')) }, police, null);
    const vers = { disposition: { mode: 'enveloppe' as const, forme: 'f2', marge: 0.05 } };
    expect(rienNeSePose(d, 'f3', vers, police)).toBe(true);
    expect(poseApres(d, 'f3', vers, police)?.refus).toBe('forme-sans-aire');
    expect(appliquerChangement(d, 'f3', vers, police, null)).toBe(d);
    expect(phraseRienNeTient('enveloppe', 'forme-sans-aire')).toMatch(/^Cette forme n’a pas d’intérieur/);
    expect(phraseRienNeTient('enveloppe', 'marge')).toMatch(/^La marge ne laisse rien de la forme/);
    expect(poseApres(d, 'f3', { disposition: { mode: 'enveloppe', forme: 'f1', marge: 50 } }, police)?.refus).toBe('marge');
  });

  it('se coupe plein, s ecrit en trace median (ADR-0028)', () => {
    const d = appliquerChangement(dessin('AMOUR'), 'f3', { disposition: dispositionPour('enveloppe', trouver(dessin(), 'f1')) }, police, null);
    expect(operationProposee(trouver(d, 'f3'), 'decoupe')).toBe('decoupe');
    const median = appliquerChangement(d, 'f3', { trace: 'median' }, police, null);
    expect(trouver(median, 'f3').texte?.disposition?.mode).toBe('enveloppe');
    expect(operationProposee(trouver(median, 'f3'), 'decoupe')).toBe('ecriture');
  });

  it('dit la pose deformee, la bascule, et ne dit jamais de depassement', () => {
    const cercle = forme('f1', ellipse(0, 0, 10, 10));
    expect(phrasePose('enveloppe', cercle, 0, 0)).toBe('Texte déformé dans cercle 1 : il en prend la silhouette. « Plus d’options » le remplit en lignes ; Ctrl+Z annule.');
    expect(phraseDepassement('enveloppe', 3, 2)).toBe('');
    expect(phraseRemplir('dans')).toBe('Le texte remplit la forme en lignes, ses lettres droites. Ctrl+Z annule.');
    expect(phraseRemplir('enveloppe')).toBe('Le texte se déforme pour prendre la silhouette de la forme. Ctrl+Z annule.');
    expect(phraseChoixForme('enveloppe')).toMatch(/^Cliquez la forme dans laquelle poser le texte\./);
    expect([remplit('dans'), remplit('enveloppe'), remplit('sur'), remplit(undefined)]).toEqual([true, true, false, false]);
    expect(LIBELLES_REMPLIR).toEqual({ enveloppe: 'En déformant les lettres', dans: 'En lignes' });
  });
});

describe('le lien dans l historique', () => {
  const pose = () => appliquerChangement(dessin(), 'f3', { disposition: dispositionPour('sur', trouver(dessin(), 'f1')), alignement: 'centre' }, police, null);

  it('recompose le texte quand sa forme bouge, dans la meme entree d historique, une fois les glyphes donnees', () => {
    const { actions, etat, historique: h } = monter(pose());
    const avant = trouver(etat.dessin, 'f3').d;
    actions.poserGlyphes(p => (p.id === 'inter' ? glyphesCarres : null));
    actions.appliquer(d => deplacer(d, ['f1'], 25, 0));
    expect(h().passe).toHaveLength(1);
    const apres = trouver(etat.dessin, 'f3').d;
    expect(au(au(apres, 0).p, 0) - au(au(avant, 0).p, 0)).toBeCloseTo(25, 6);
    // Ctrl+Z rend la forme et le texte d'avant, d'un geste.
    actions.defaire();
    expect(trouver(etat.dessin, 'f3').d).toBe(avant);
  });

  it('rend le texte libre quand sa forme est supprimee ; sans glyphes, il garde ses contours', () => {
    const { actions, etat } = monter(pose());
    const avant = trouver(etat.dessin, 'f3').d;
    actions.appliquer(d => supprimer(d, ['f1']));
    expect(trouver(etat.dessin, 'f3').texte?.disposition).toBeUndefined();
    expect(trouver(etat.dessin, 'f3').d).toBe(avant);
  });
});

describe('les phrases', () => {
  const cercle = forme('f1', ellipse(0, 0, 10, 10));
  it('disent la pose, le depassement (au singulier et au pluriel), et la forme perdue', () => {
    expect(nomCourt(cercle)).toBe('cercle 1');
    expect(phrasePose('sur', cercle, 0, 0)).toBe('Texte posé sur cercle 1 : il suit son tracé. La poignée de départ le fait glisser ; Ctrl+Z annule.');
    expect(phrasePose('dans', cercle, 0, 2)).toBe('Texte posé dans cercle 1 : il remplit la forme en lignes. Ctrl+Z annule. 2 mots ne tiennent pas dans la forme.');
    expect(phraseDepassement('sur', 1, 0)).toBe('Le texte dépasse le tracé de 1 lettre.');
    expect(phraseDepassement('sur', 3, 0)).toBe('Le texte dépasse le tracé de 3 lettres.');
    expect(phraseDepassement('dans', 0, 1)).toBe('1 mot ne tient pas dans la forme.');
    expect(phraseDepassement('dans', 0, 0)).toBe('');
    const texte = trouver(dessin('Joyeux'), 'f3');
    expect(phraseFormePerdue([texte])).toBe('La forme qui portait le texte « Joyeux » n’existe plus : il redevient un texte libre, en ligne droite. Ctrl+Z rend la forme.');
    expect(phraseFormePerdue([texte, texte])).toMatch(/^La forme qui portait 2 textes n’existe plus : ils redeviennent des textes libres/);
  });

  it('disent le choix de la forme, a la souris et au doigt, et le depart en pour cent', () => {
    expect(phraseChoixForme('sur')).toBe('Cliquez la forme sur laquelle poser le texte. Échap annule ; au clavier, Tab parcourt les formes et Entrée choisit.');
    expect(phraseChoixForme('dans', true)).toMatch(/^Touchez la forme dans laquelle poser le texte\./);
    expect(phraseCandidate(cercle, 2, 5)).toBe('Forme 2 sur 5 : cercle 1. Entrée pose le texte, Échap annule.');
    expect(phraseDepart(0.125)).toBe('Départ à 12,5 % du tracé.');
    expect(phraseRienNeTient('dans')).toMatch(/« Ajuster la taille »/);
    expect(phraseFormeVisible(false)).toMatch(/ne s’écrit pas/);
  });
});
