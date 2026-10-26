// Les decoupes du modele v2 (ADR-0012, etape 5 ; annexe 8 §5.6) : la lecture riche d'un `clip-path` (unites, transformations, <use>,
// `clip-rule`, imbrication, feuille enveloppee), ses refus et ses pertes dites, l'ecriture (propre, dedoublonnee, en point fixe : le
// harnais ecriture-stable-v2.test.ts), la regle de la fermeture, la boite visuelle, creer et liberer, la copie qui renumerote, et le
// mode plat, qui refuse toujours avec la phrase d'aujourd'hui.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  boiteVisuelle, collerContenu, creerDecoupe, dupliquer, ecrireDessin, inserer, liberer, lireDessin, MSG_DECOUPE, MSG_DECOUPES, REFUS_DECOUPES,
  renumeroterContenus, transformer, translation, verifierDessin, type DessinSvg, type Forme, type Groupe
} from '../../../src/engine/editionSvg.js';
import { nettoyerSvg } from '../../../src/util/svg.js';
import { violationsEcriture, violationsNettoyage } from '../securite/invariants.js';
import { CAS } from './v2/cas-decoupes.js';
import { au } from '../../../src/util/tableaux.js';

const V2 = resolve(__dirname, '../../fixtures/svg/v2');
const CORPUS = resolve(__dirname, '../../fixtures/svg/corpus');
const SVG = (corps: string) => '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100">' + corps + '</svg>';
const CLIP = '<defs><clipPath id="c"><rect x="10" y="10" width="50" height="50"/></clipPath></defs>';

const lire = (svg: string): ReturnType<typeof lireDessin> => lireDessin(svg, { modele: 'riche' });
const riche = (svg: string): DessinSvg => { const r = lire(svg); if ('erreur' in r) throw new Error(r.erreur); return r.dessin; };
const erreur = (r: ReturnType<typeof lireDessin>): string => ('erreur' in r ? r.erreur : '');
const groupes = (d: DessinSvg): Groupe[] => Object.values(d.groupes ?? {});
const decoupees = (d: DessinSvg): Groupe[] => groupes(d).filter(g => g.decoupe);
const entrees = [
  ...readdirSync(V2).filter(n => n.startsWith('decoupes-') && n.endsWith('.svg') && !n.endsWith('.attendu.svg')).map(n => join(V2, n)),
  ...['inkscape-decoupe', 'figma-cadre-decoupe', 'illustrator-degrade-decoupe'].map(n => join(CORPUS, n + '.svg'))
];
const tousLesIds = (d: DessinSvg): string[] => {
  const out: string[] = [];
  const voir = (c: { formes: readonly Forme[]; groupes?: Readonly<Record<string, Groupe>> }) => {
    out.push(...c.formes.map(f => f.id), ...Object.keys(c.groupes ?? {}));
    for (const g of Object.values(c.groupes ?? {})) if (g.decoupe) voir(g.decoupe.contenu);
  };
  voir(d);
  return out;
};

describe('la lecture des decoupes', () => {
  it('chaque entree s ouvre en riche, bien formee, et le mode plat la refuse avec la phrase d aujourd hui', () => {
    expect(entrees.length).toBeGreaterThanOrEqual(14);
    for (const fichier of entrees) {
      const svg = readFileSync(fichier, 'utf8');
      expect(erreur(lireDessin(svg)), fichier).toContain('un masque ou une découpe');
      const d = riche(svg);
      expect(decoupees(d).length, fichier).toBeGreaterThan(0);
      expect(verifierDessin(d), fichier).toEqual([]);
      // Le chemin de la page (nettoyage d'abord) lit la meme chose.
      const net = nettoyerSvg(svg);
      expect(ecrireDessin(riche(net?.svg ?? ''), 3), fichier).toBe(ecrireDessin(d, 3));
    }
  });

  it('chaque cas s ecrit propre : la specification de l ecriture et ses extensions, et le nettoyage n y change rien', () => {
    for (const c of CAS) {
      const d = c.dessin ? c.dessin() : riche(readFileSync(join(V2, (c.entree ?? '') + '.svg'), 'utf8'));
      const e = ecrireDessin(c.operation ? c.operation(d) : d, 3);
      expect(violationsEcriture(e), c.nom).toEqual([]);
      expect(violationsNettoyage(e), c.nom).toEqual([]);
      expect(verifierDessin(riche(e)), c.nom).toEqual([]);
    }
  });

  it('ecrit deux fois le meme dessin a l identique, les decoupes citees avant celles qui les citent, quelle que soit l ecriture d avant', () => {
    for (const fichier of entrees) {
      const d = riche(readFileSync(fichier, 'utf8'));
      const premiere = ecrireDessin(d, 3);
      ecrireDessin(d, 2);
      expect(ecrireDessin(d, 3), fichier).toBe(premiere);
      const ids = [...premiere.matchAll(/ id="(ed-c-[0-9a-f]{14})"/g)].map(m => m[1] ?? '');
      for (const [i, id] of ids.entries()) expect(premiere.indexOf('url(#' + id + ')') > premiere.indexOf(' id="' + id + '"'), fichier + ' : ' + id + ' (' + i + ')').toBe(true);
    }
  });

  it('garde un groupe et sa decoupe, en geometrie seule dans le repere du plan, la peinture fixee', () => {
    const d = riche(SVG(CLIP + '<g clip-path="url(#c)" transform="translate(5 0)"><circle cx="30" cy="30" r="25" fill="#c81e28"/></g>'));
    const [g] = decoupees(d);
    const feuille = g?.decoupe?.contenu.formes[0];
    expect(feuille?.d[0]).toEqual({ c: 'M', p: [15, 10] });
    expect([feuille?.remplissage, feuille?.contour, feuille?.epaisseur, feuille?.opacite, feuille?.regle]).toEqual(['#000000', null, 0, 1, 'nonzero']);
    expect(d.formes.map(f => f.parent)).toEqual([g?.id]);
  });

  it('enveloppe dans un groupe une feuille (une image aussi) qui porte sa decoupe, et numerote tout sans doublon', () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const d = riche(SVG(CLIP + '<rect width="5" height="5"/><path d="M0 0L90 0L90 90Z" clip-path="url(#c)"/><image href="' + png + '" width="40" height="40" clip-path="url(#c)"/><rect width="5" height="5"/>'));
    expect(d.formes.map(f => [f.id, f.parent ?? null])).toEqual([['f1', null], ['f2', 'g1'], ['f4', 'g2'], ['f6', null]]);
    expect(decoupees(d).map(g => g.decoupe?.contenu.formes.map(f => f.id))).toEqual([['f3'], ['f5']]);
    expect(new Set(tousLesIds(d)).size).toBe(tousLesIds(d).length);
    expect(verifierDessin(d)).toEqual([]);
  });

  it('dit ce qu un navigateur ignore : reference absente, <g> ou <use> d autre chose qu une forme dans un <clipPath>, boite plate', () => {
    const r = lire(readFileSync(join(V2, 'decoupes-ignorees.svg'), 'utf8'));
    if ('erreur' in r) throw new Error(r.erreur);
    expect(r.ignores).toEqual(expect.arrayContaining([MSG_DECOUPES.absente, MSG_DECOUPES.elements]));
    const plate = lire(SVG('<defs><clipPath id="c" clipPathUnits="objectBoundingBox"><rect width="1" height="1"/></clipPath></defs><g clip-path="url(#c)"><path d="M0 0L50 0"/></g><rect width="5" height="5"/>'));
    expect('erreur' in plate ? [] : plate.ignores).toContain(MSG_DECOUPES.boitePlate);
    const vise = lire(SVG('<defs><g id="x"><rect width="5" height="5"/></g><clipPath id="c"><use href="#x"/></clipPath></defs><g clip-path="url(#c)"><rect width="50" height="50"/></g>'));
    expect('erreur' in vise ? [] : vise.ignores).toContain(MSG_DECOUPES.elements);
  });

  it('refuse en le nommant une forme CSS, un renvoi exterieur, un cycle, une imbrication trop profonde, une decoupe sur un <use>, un <symbol> ou la racine', () => {
    const corps = (clip: string) => SVG(CLIP + '<g ' + clip + '><rect width="50" height="50"/></g>');
    expect(erreur(lire(corps('style="clip-path: inset(10px)"')))).toContain(REFUS_DECOUPES.formeCss);
    expect(erreur(lire(corps('clip-path="url(a.svg#c)"')))).toContain(REFUS_DECOUPES.externe);
    expect(erreur(lire(SVG('<defs><clipPath id="c"><rect width="5" height="5" clip-path="url(#c)"/></clipPath></defs><g clip-path="url(#c)"><rect width="50" height="50"/></g>')))).toContain(REFUS_DECOUPES.cycle);
    const chaine = Array.from({ length: 9 }, (_, i) => '<clipPath id="c' + i + '"' + (i < 8 ? ' clip-path="url(#c' + (i + 1) + ')"' : '') + '><rect width="50" height="50"/></clipPath>').join('');
    expect(erreur(lire(SVG('<defs>' + chaine + '</defs><g clip-path="url(#c0)"><rect width="50" height="50"/></g>')))).toContain(REFUS_DECOUPES.profondeur);
    expect(erreur(lire(SVG('<defs>' + chaine.replace(' clip-path="url(#c8)"', '') + '</defs><g clip-path="url(#c0)"><rect width="50" height="50"/></g>')))).toBe('');
    expect(erreur(lire(SVG(CLIP + '<defs><rect id="r" width="5" height="5"/></defs><use href="#r" clip-path="url(#c)"/>')))).toContain('une découpe (posé sur un clone <use>)');
    expect(erreur(lire(SVG(CLIP + '<defs><symbol id="s" clip-path="url(#c)"><rect width="5" height="5"/></symbol></defs><use href="#s"/>')))).toContain('une découpe (posé sur un symbole)');
    expect(erreur(lire('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" clip-path="url(#c)">' + CLIP + '<rect width="5" height="5"/></svg>'))).toContain('une découpe (posé sur tout le dessin)');
    expect(erreur(lire(SVG('<defs><clipPath id="c" transform="rotate(a)"><rect width="5" height="5"/></clipPath></defs><g clip-path="url(#c)"><rect width="50" height="50"/></g>')))).toContain(REFUS_DECOUPES.transformation);
  });

  it('garde toutes les formes d une decoupe de formes elles-memes decoupees sous la borne commune, refuse au-dela en le nommant', () => {
    // Les places vides des decoupes imbriquees sont deja comptees : le budget ne les compte pas deux fois (annexe 8, etape 9).
    const imbriquees = (n: number, k: number) => SVG('<defs><clipPath id="i">' + '<rect width="1" height="1"/>'.repeat(k) + '</clipPath><clipPath id="c">'
      + '<rect width="10" height="10" clip-path="url(#i)"/>'.repeat(n) + '</clipPath></defs><g clip-path="url(#c)"><rect width="100" height="100"/></g>');
    const d = riche(imbriquees(150, 100));
    expect(decoupees(d).reduce((s, g) => s + (g.decoupe?.contenu.formes.length ?? 0), 0)).toBe(150);
    expect(verifierDessin(d)).toEqual([]);
    expect(erreur(lire(imbriquees(150, 140)))).toContain(REFUS_DECOUPES.trop);
    expect(erreur(lire(SVG('<defs><clipPath id="c">' + '<rect width="1" height="1"/>'.repeat(100_000) + '</clipPath></defs><g clip-path="url(#c)"><rect width="100" height="100"/></g>')))).toContain(REFUS_DECOUPES.trop);
  });
});

describe('les decoupes et les operations', () => {
  const d = riche(readFileSync(join(V2, 'decoupes-groupe.svg'), 'utf8'));
  const [g] = decoupees(d);
  const feuilles = d.formes.filter(f => f.parent === g?.id).map(f => f.id);

  it('une decoupe suit son groupe quand il est dans la fermeture, pas quand une seule de ses feuilles bouge', () => {
    const tout = transformer(d, feuilles, translation(10, 0));
    expect(decoupees(tout)[0]?.decoupe?.contenu.formes[0]?.d[0]?.p).toEqual([40, 20]);
    const une = transformer(d, feuilles.slice(0, 1), translation(10, 0));
    expect(decoupees(une)[0]?.decoupe).toBe(g?.decoupe);
  });

  it('la boite visuelle d un groupe decoupe est rognee par sa decoupe', () => {
    expect(boiteVisuelle(d, g?.id ?? '')).toEqual({ x: 20, y: 20, l: 120, h: 80 });
    const vide = riche(SVG('<defs><clipPath id="v"/></defs><g clip-path="url(#v)"><rect x="5" y="5" width="50" height="50"/></g>'));
    const b = boiteVisuelle(vide, Object.keys(vide.groupes ?? {})[0] ?? '');
    expect([b?.l, b?.h]).toEqual([0, 0]);
  });

  it('dupliquer, coller et inserer renumerotent les contenus des decoupes copiees', () => {
    const copie = dupliquer(d, [g?.id ?? ''], 5, 5).dessin;
    expect(verifierDessin(copie)).toEqual([]);
    expect(decoupees(copie)).toHaveLength(2);
    const colle = collerContenu(d, d.formes.filter(f => f.parent === g?.id), 0, 0, d.groupes).dessin;
    expect(verifierDessin(colle)).toEqual([]);
    const insere = inserer(d, d, { x: 0, y: 0, l: 50, h: 50 }).dessin;
    expect(verifierDessin(insere)).toEqual([]);
    expect(new Set(tousLesIds(insere)).size).toBe(tousLesIds(insere).length);
    // Un groupe sans contenu imbrique est rendu tel quel.
    const nu: Groupe = { id: 'g9', visible: true, verrouille: false };
    expect(renumeroterContenus(nu, () => 'x')).toBe(nu);
  });

  it('creer une decoupe : la forme du dessus decoupe les autres, reunies dans un groupe ; sinon le meme dessin et la raison', () => {
    const plat = lireDessin(SVG('<rect width="50" height="50" fill="#c81e28"/><rect x="40" width="50" height="50" fill="#1f5fb0"/><circle cx="50" cy="25" r="20"/>'));
    if ('erreur' in plat) throw new Error(plat.erreur);
    const ids = plat.dessin.formes.map(f => f.id);
    const r = creerDecoupe(plat.dessin, ids);
    expect(r.erreur).toBeUndefined();
    expect(r.dessin.formes.map(f => [f.id, f.parent])).toEqual([['f1', r.id], ['f2', r.id]]);
    expect(decoupees(r.dessin)[0]?.decoupe?.contenu.formes.map(f => [f.id, f.remplissage])).toEqual([['f3', '#000000']]);
    expect(verifierDessin(r.dessin)).toEqual([]);
    expect(creerDecoupe(plat.dessin, ids.slice(0, 1))).toEqual({ dessin: plat.dessin, id: null, erreur: MSG_DECOUPE.selection });
    // Le plus haut est un groupe : refuse.
    const avecGroupe = r.dessin;
    const dessus = creerDecoupe({ ...avecGroupe, formes: [{ ...au(plat.dessin.formes, 2), id: 'f9' }, ...avecGroupe.formes] }, ['f9', r.id ?? '']);
    expect(dessus.erreur).toBe(MSG_DECOUPE.dessus);
  });

  it('liberer : le groupe perd sa decoupe et la garde en forme visible au premier plan ; un groupe sans decoupe le dit', () => {
    const r = liberer(d, g?.id ?? '');
    expect(r.erreur).toBeUndefined();
    expect(decoupees(r.dessin)).toEqual([]);
    const rendue = r.dessin.formes.find(f => f.id === r.ids[0]);
    expect([rendue?.parent, rendue?.remplissage, rendue?.contour]).toEqual([g?.id, null, '#000000']);
    expect(r.dessin.formes.filter(f => f.parent === g?.id).pop()?.id).toBe(r.ids[0]);
    expect(verifierDessin(r.dessin)).toEqual([]);
    expect(liberer(r.dessin, g?.id ?? '')).toEqual({ dessin: r.dessin, ids: [], erreur: MSG_DECOUPE.aucune });
  });
});
