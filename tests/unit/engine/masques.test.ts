// Les masques d'opacite du modele v2 (ADR-0012, etape 6 ; annexe 8 §1) : la lecture riche d'un `mask` (luminance et alpha, unites de la
// region et du contenu, transformations, <use>, contenu peint et degrades, imbrication, feuille enveloppee), ses refus et ses pertes
// dites, l'ecriture (propre, dedoublonnee, en point fixe : le harnais ecriture-stable-v2.test.ts), la regle de la fermeture, la boite
// visuelle, creer, liberer et inverser, la copie qui renumerote, le nuancier qui ne lit pas un masque, et le mode plat, qui refuse
// toujours avec la phrase d'aujourd'hui.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  boiteVisuelle, collerContenu, creerMasque, dupliquer, ecrireDessin, inserer, inverserMasque, libererMasque, lireDessin, MSG_MASQUE, MSG_MASQUES, renduDe,
  REFUS_MASQUES, rotation, transformer, translation, verifierDessin, type DessinSvg, type Forme, type Groupe
} from '../../../src/engine/editionSvg.js';
import { nuancierDuDessin } from '../../../src/engine/nuancier.js';
import { nettoyerSvg } from '../../../src/util/svg.js';
import { violationsEcriture, violationsNettoyage } from '../securite/invariants.js';
import { CAS } from './v2/cas-masques.js';

const V2 = resolve(__dirname, '../../fixtures/svg/v2');
const CORPUS = resolve(__dirname, '../../fixtures/svg/corpus');
const SVG = (corps: string) => '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100">' + corps + '</svg>';
const MASQUE = '<defs><mask id="m"><rect x="10" y="10" width="50" height="50" fill="#fff"/></mask></defs>';

const lire = (svg: string): ReturnType<typeof lireDessin> => lireDessin(svg, { modele: 'riche' });
const riche = (svg: string): DessinSvg => { const r = lire(svg); if ('erreur' in r) throw new Error(r.erreur); return r.dessin; };
const erreur = (r: ReturnType<typeof lireDessin>): string => ('erreur' in r ? r.erreur : '');
const ignores = (r: ReturnType<typeof lireDessin>): readonly string[] => ('erreur' in r ? [] : r.ignores);
const groupes = (d: DessinSvg): Groupe[] => Object.values(d.groupes ?? {});
const masques = (d: DessinSvg): Groupe[] => groupes(d).filter(g => g.masque);
const entrees = [
  ...readdirSync(V2).filter(n => n.startsWith('masques-') && n.endsWith('.svg') && !n.endsWith('.attendu.svg')).map(n => join(V2, n)),
  ...['figma-trait-interieur', 'sketch-masque-use'].map(n => join(CORPUS, n + '.svg'))
];
const tousLesIds = (d: DessinSvg): string[] => {
  const out: string[] = [];
  const voir = (c: { formes: readonly Forme[]; groupes?: Readonly<Record<string, Groupe>> }) => {
    out.push(...c.formes.map(f => f.id), ...Object.keys(c.groupes ?? {}));
    for (const g of Object.values(c.groupes ?? {})) { if (g.decoupe) voir(g.decoupe.contenu); if (g.masque) voir(g.masque.contenu); }
  };
  voir(d);
  return out;
};

describe('la lecture des masques', () => {
  it('chaque entree s ouvre en riche, bien formee, et le mode plat la refuse avec la phrase d aujourd hui', () => {
    expect(entrees.length).toBeGreaterThanOrEqual(13);
    for (const fichier of entrees) {
      const svg = readFileSync(fichier, 'utf8');
      expect(erreur(lireDessin(svg)), fichier).toContain('un masque ou une découpe');
      const d = riche(svg);
      expect(masques(d).length, fichier).toBeGreaterThan(0);
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
      expect(nettoyerSvg(e)?.svg, c.nom).toBe(e);
      expect(verifierDessin(riche(e)), c.nom).toEqual([]);
    }
  });

  it('ecrit deux fois le meme dessin a l identique, les definitions citees avant celles qui les citent', () => {
    for (const fichier of entrees) {
      const d = riche(readFileSync(fichier, 'utf8'));
      const premiere = ecrireDessin(d, 3);
      ecrireDessin(d, 2);
      expect(ecrireDessin(d, 3), fichier).toBe(premiere);
      const ids = [...premiere.matchAll(/ id="(ed-[a-z]-[0-9a-f]{14})"/g)].map(m => m[1] ?? '');
      for (const id of ids) expect(premiere.indexOf('url(#' + id + ')') > premiere.indexOf(' id="' + id + '"'), fichier + ' : ' + id).toBe(true);
    }
  });

  it('garde un groupe et son masque : un contenu peint, dans le repere du plan, son type et sa region', () => {
    const d = riche(SVG('<defs><mask id="m" fill="#808080" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="50"><circle cx="30" cy="30" r="25" fill-opacity="0.5"/></mask></defs>'
      + '<g mask="url(#m)" transform="translate(5 0)"><rect width="80" height="80" fill="#c81e28"/></g>'));
    const [g] = masques(d);
    const feuille = g?.masque?.contenu.formes[0];
    expect(feuille?.d[0]).toEqual({ c: 'M', p: [10, 30] });
    expect([feuille?.remplissage, feuille?.opacite]).toEqual(['#808080', 0.5]);
    expect([g?.masque?.type, g?.masque?.region]).toEqual(['luminance', { x: 5, y: 0, l: 100, h: 50 }]);
    expect(d.formes.map(f => f.parent)).toEqual([g?.id]);
  });

  it('lit le type alpha par l attribut, le style ou une feuille de style', () => {
    for (const pose of [' mask-type="alpha"', ' style="mask-type:alpha"', ' class="a"']) {
      const d = riche(SVG('<style>.a { mask-type: alpha }</style><defs><mask id="m"' + pose + '><rect width="50" height="50" fill="#fff"/></mask></defs><g mask="url(#m)"><rect width="80" height="80"/></g>'));
      expect(masques(d)[0]?.masque?.type, pose).toBe('alpha');
    }
  });

  it('enveloppe dans un groupe une feuille (une image aussi) qui porte son masque, et numerote tout sans doublon, contenus compris', () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const d = riche(SVG('<defs><mask id="m"><g><rect width="5" height="5" fill="#fff"/></g><rect x="5" width="5" height="5" fill="#fff"/></mask></defs>'
      + '<rect width="5" height="5"/><path d="M0 0L90 0L90 90Z" mask="url(#m)"/><g mask="url(#m)"><image href="' + png + '" width="40" height="40" mask="url(#m)"/></g><rect width="5" height="5"/>'));
    expect(new Set(tousLesIds(d)).size).toBe(tousLesIds(d).length);
    expect(verifierDessin(d)).toEqual([]);
    expect(d.formes.map(f => f.id)).toEqual(['f1', 'f2', 'f7', 'f10']);
    expect(masques(d)).toHaveLength(3);
    // Le <g> du contenu d'un masque y reste un groupe, il ne reste pas dans la table du dessin.
    for (const g of masques(d)) expect(Object.keys(g.masque?.contenu.groupes ?? {})).toHaveLength(1);
    expect(Object.keys(d.groupes ?? {}).every(id => masques(d).some(g => g.id === id) || d.formes.some(f => f.parent === id))).toBe(true);
  });

  it('dit ce qu un navigateur ignore : reference absente ou vers autre chose, transformation d un <mask>, masque dans une decoupe, unite inconnue', () => {
    const r = lire(readFileSync(join(V2, 'masques-ignores.svg'), 'utf8'));
    expect(ignores(r)).toEqual(expect.arrayContaining([MSG_MASQUES.absente, MSG_MASQUES.transformation, MSG_MASQUES.dansDecoupe]));
    expect(ignores(lire(readFileSync(join(V2, 'masques-region.svg'), 'utf8')))).toContain(MSG_MASQUES.unite);
    const plate = lire(SVG('<defs><mask id="m"><rect width="1" height="1" fill="#fff"/></mask></defs><g mask="url(#m)"><path d="M0 0L50 0"/></g><rect width="5" height="5"/>'));
    expect(ignores(plate)).toContain(MSG_MASQUES.boitePlate);
    const sur = lire(SVG('<defs><mask id="m" opacity="0.5"><rect width="50" height="50" fill="#fff"/></mask></defs><g mask="url(#m)"><rect width="50" height="50"/></g>'));
    expect(ignores(sur)).toContain(MSG_MASQUES.surMasque);
  });

  it('dit quand la region d un masque tourne est elargie alors que son contenu la depasse, et seulement alors', () => {
    const corps = (largeur: number) => SVG('<defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="40" height="40"><rect width="' + largeur + '" height="30" fill="#fff"/></mask></defs>'
      + '<g mask="url(#m)" transform="rotate(30 20 20)"><rect width="40" height="40"/></g>');
    expect(ignores(lire(corps(30)))).not.toContain(MSG_MASQUES.regionTournee);
    expect(ignores(lire(corps(80)))).toContain(MSG_MASQUES.regionTournee);
  });

  it('refuse en le nommant un masque CSS, un renvoi exterieur, un cycle, une imbrication trop profonde, un masque sur un <use>, un symbole ou la racine', () => {
    const corps = (pose: string) => SVG(MASQUE + '<g ' + pose + '><rect width="50" height="50"/></g>');
    expect(erreur(lire(corps('style="mask-image: url(#m)"')))).toContain(REFUS_MASQUES.css);
    expect(erreur(lire(corps('style="-webkit-mask: linear-gradient(red, blue)"')))).toContain(REFUS_MASQUES.css);
    expect(erreur(lire(corps('style="mask: url(#m) center / contain"')))).toContain(REFUS_MASQUES.css);
    expect(erreur(lire(corps('style="mask: linear-gradient(red, blue)"')))).toContain(REFUS_MASQUES.css);
    expect(erreur(lire(SVG(MASQUE + '<rect width="50" height="50" style="mask-mode: alpha"/>')))).toContain(REFUS_MASQUES.css);
    expect(erreur(lire(corps('style="mask-image: none"')))).toBe('');
    expect(erreur(lire(corps('mask="url(a.svg#m)"')))).toContain(REFUS_MASQUES.externe);
    expect(erreur(lire(SVG('<defs><mask id="m"><rect width="5" height="5" fill="#fff" mask="url(#m)"/></mask></defs><g mask="url(#m)"><rect width="50" height="50"/></g>')))).toContain(REFUS_MASQUES.cycle);
    const chaine = Array.from({ length: 9 }, (_, i) => '<mask id="m' + i + '"><rect width="50" height="50" fill="#fff"' + (i < 8 ? ' mask="url(#m' + (i + 1) + ')"' : '') + '/></mask>').join('');
    expect(erreur(lire(SVG('<defs>' + chaine + '</defs><g mask="url(#m0)"><rect width="50" height="50"/></g>')))).toContain(REFUS_MASQUES.profondeur);
    expect(erreur(lire(SVG('<defs>' + chaine.replace(' mask="url(#m8)"', '') + '</defs><g mask="url(#m0)"><rect width="50" height="50"/></g>')))).toBe('');
    expect(erreur(lire(SVG(MASQUE + '<defs><rect id="r" width="5" height="5"/></defs><use href="#r" mask="url(#m)"/>')))).toContain('un masque ou une découpe (posé sur un clone <use>)');
    expect(erreur(lire(SVG(MASQUE + '<defs><symbol id="s" mask="url(#m)"><rect width="5" height="5"/></symbol></defs><use href="#s"/>')))).toContain('un masque ou une découpe (posé sur un symbole)');
    expect(erreur(lire('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" mask="url(#m)">' + MASQUE + '<rect width="5" height="5"/></svg>'))).toContain('posé sur tout le dessin');
  });
});

describe('les masques et les operations', () => {
  const d = riche(readFileSync(join(V2, 'masques-degrade.svg'), 'utf8'));
  const [g] = masques(d);
  const feuilles = d.formes.filter(f => f.parent === g?.id).map(f => f.id);

  it('un masque suit son groupe quand il est dans la fermeture (contenu, degrades et region), pas quand une seule de ses feuilles bouge', () => {
    const tout = transformer(d, feuilles, translation(10, 0));
    const mq = masques(tout)[0]?.masque;
    expect(mq?.contenu.formes[0]?.d[0]?.p).toEqual([10, 0]);
    expect(mq?.contenu.formes[0]?.peintureRemplissage).toEqual({ ...g?.masque?.contenu.formes[0]?.peintureRemplissage, matrice: [200, 0, 0, 60, 10, 0] });
    expect(mq?.region).toEqual({ x: -10, y: -12, l: 240, h: 144 });
    const une = transformer(d, feuilles.slice(0, 1), translation(10, 0));
    expect(masques(une)[0]?.masque).toBe(g?.masque);
    // Sous une rotation, la region devient le rectangle qui enferme ses coins.
    const tourne = masques(transformer(d, feuilles, rotation(90, 0, 0)))[0]?.masque?.region;
    expect([tourne?.x, tourne?.y, tourne?.l, tourne?.h].map(v => Math.round((v ?? 0) * 1e6) / 1e6)).toEqual([-132, -20, 144, 240]);
  });

  it('la boite visuelle d un groupe masque est rognee par sa region', () => {
    const r = riche(readFileSync(join(V2, 'masques-region.svg'), 'utf8'));
    const [plan] = masques(r);
    expect(boiteVisuelle(r, plan?.id ?? '')).toEqual({ x: 20, y: 25, l: 100, h: 35 });
  });

  it('dupliquer, coller et inserer renumerotent les contenus des masques copies', () => {
    const copie = dupliquer(d, [g?.id ?? ''], 5, 5).dessin;
    expect(verifierDessin(copie)).toEqual([]);
    expect(masques(copie)).toHaveLength(2);
    const colle = collerContenu(d, d.formes.filter(f => f.parent === g?.id), 0, 0, d.groupes).dessin;
    expect(verifierDessin(colle)).toEqual([]);
    const insere = inserer(d, d, { x: 0, y: 0, l: 50, h: 50 }).dessin;
    expect(verifierDessin(insere)).toEqual([]);
    expect(new Set(tousLesIds(insere)).size).toBe(tousLesIds(insere).length);
    // Un masque dont le contenu porte des groupes, un masque et une decoupe imbriques : tout est renumerote.
    for (const nom of ['masques-use', 'masques-imbriques']) {
      const x = riche(readFileSync(join(V2, nom + '.svg'), 'utf8'));
      const c = dupliquer(x, masques(x).map(m => m.id), 5, 5).dessin;
      expect(verifierDessin(c), nom).toEqual([]);
      expect(new Set(tousLesIds(c)).size, nom).toBe(tousLesIds(c).length);
    }
  });

  it('la toile voit ce qui s ecrit : le rendu generique pose le masque et les definitions de son contenu, sans rien de plus', () => {
    const rendu = renduDe(d);
    const attributs = rendu.groupe(g ?? { id: '', visible: true, verrouille: false }).attributs;
    expect(attributs.map(a => a[0])).toEqual(['mask']);
    const id = /^url\(#(ed-m-[0-9a-f]{14})\)$/.exec(attributs[0]?.[1] ?? '')?.[1] ?? '';
    const ecrit = ecrireDessin(d, 3);
    expect(rendu.definitions).toContain('<mask id="' + id + '"');
    // Les degrades du contenu, avant le <mask> qui les cite, comme a l'ecriture.
    for (const deg of ecrit.match(/<(?:linear|radial)Gradient id="ed-d-[0-9a-f]{14}"/g) ?? []) expect(rendu.definitions.indexOf(deg)).toBeLessThan(rendu.definitions.indexOf('<mask'));
    expect(ecrit).toContain(' id="' + id + '"');
  });

  it('le nuancier ne compte pas les couleurs d un contenu de masque', () => {
    const r = riche(readFileSync(join(V2, 'masques-alpha.svg'), 'utf8'));
    const teintes = nuancierDuDessin(r).teintes.map(t => t.hex);
    expect(teintes).toEqual(expect.arrayContaining(['#1f5f3f', '#15181d']));
    expect(teintes).not.toContain('#c81e28');
    expect(teintes).not.toContain('#1f5fb0');
  });

  it('creer un masque : le dessus masque les autres, reunis dans un groupe ; sinon le meme dessin et la raison', () => {
    const plat = lireDessin(SVG('<rect width="50" height="50" fill="#c81e28"/><rect x="40" width="50" height="50" fill="#1f5fb0"/><circle cx="50" cy="25" r="20" fill="#fff"/>'));
    if ('erreur' in plat) throw new Error(plat.erreur);
    const ids = plat.dessin.formes.map(f => f.id);
    const r = creerMasque(plat.dessin, ids);
    expect(r.erreur).toBeUndefined();
    expect(r.dessin.formes.map(f => [f.id, f.parent])).toEqual([['f1', r.id], ['f2', r.id]]);
    const mq = masques(r.dessin)[0]?.masque;
    expect(mq?.contenu.formes.map(f => [f.id, f.remplissage])).toEqual([['f3', '#ffffff']]);
    expect([mq?.type, mq?.region]).toEqual(['luminance', { x: 0, y: 0, l: 90, h: 50 }]);
    expect(verifierDessin(r.dessin)).toEqual([]);
    expect(creerMasque(plat.dessin, ids.slice(0, 1))).toEqual({ dessin: plat.dessin, id: null, erreur: MSG_MASQUE.selection });
    // Un groupe au-dessus : il devient le contenu, avec ses groupes, sans reprendre un numero.
    const avecGroupe = riche(SVG('<rect width="50" height="50"/><g><g><rect width="10" height="10" fill="#fff"/></g><rect x="20" width="10" height="10" fill="#808080"/></g>'));
    const g2 = creerMasque(avecGroupe, ['f1', 'g1']);
    expect(g2.erreur).toBeUndefined();
    expect(verifierDessin(g2.dessin)).toEqual([]);
    expect(new Set(tousLesIds(g2.dessin)).size).toBe(tousLesIds(g2.dessin).length);
    expect(Object.keys(masques(g2.dessin)[0]?.masque?.contenu.groupes ?? {}).sort()).toEqual(['g1', 'g2']);
    // Un dessus qui ne laisse rien voir.
    const vide = riche(SVG('<rect width="50" height="50"/><path d="M0 0L20 0"/>'));
    expect(creerMasque(vide, vide.formes.map(f => f.id)).erreur).toBe(MSG_MASQUE.vide);
  });

  it('liberer : le groupe perd son masque et en garde le contenu, peint, au premier plan ; un groupe sans masque le dit', () => {
    const r = libererMasque(d, g?.id ?? '');
    expect(r.erreur).toBeUndefined();
    expect(masques(r.dessin)).toEqual([]);
    expect(r.ids).toEqual(g?.masque?.contenu.formes.map(f => f.id));
    const rendue = r.dessin.formes.find(f => f.id === r.ids[0]);
    expect([rendue?.parent, rendue?.peintureRemplissage]).toEqual([g?.id, g?.masque?.contenu.formes[0]?.peintureRemplissage]);
    expect(r.dessin.formes.filter(f => f.parent === g?.id).pop()?.id).toBe(r.ids[1]);
    expect(verifierDessin(r.dessin)).toEqual([]);
    expect(libererMasque(r.dessin, g?.id ?? '')).toEqual({ dessin: r.dessin, ids: [], erreur: MSG_MASQUE.aucun });
  });

  it('inverser : le contenu aux couleurs complementaires sur un fond blanc ; inverser deux fois redonne le masque, octet pour octet', () => {
    const lumineux = riche(readFileSync(join(V2, 'masques-groupe.svg'), 'utf8'));
    const id = masques(lumineux)[0]?.id ?? '';
    const une = inverserMasque(lumineux, id);
    expect(une.erreur).toBeUndefined();
    const contenu = masques(une.dessin)[0]?.masque?.contenu;
    expect(contenu?.formes.map(f => f.remplissage)).toEqual(['#ffffff', '#000000', '#7f7f7f', '#ffffff']);
    expect(verifierDessin(une.dessin)).toEqual([]);
    const deux = inverserMasque(une.dessin, id);
    expect(masques(deux.dessin)[0]?.masque).toEqual(masques(lumineux)[0]?.masque);
    expect(ecrireDessin(deux.dessin, 3)).toBe(ecrireDessin(lumineux, 3));
    // Sous une rotation, le fond tourne avec le contenu et se reconnait encore.
    const tourne = transformer(une.dessin, une.dessin.formes.map(f => f.id), rotation(33, 50, 50));
    const retour = inverserMasque(tourne, id);
    expect(masques(retour.dessin)[0]?.masque?.contenu.formes).toHaveLength(3);
    // Un masque alpha devient un masque de luminance, son contenu en noir a ses opacites.
    const alpha = riche(readFileSync(join(V2, 'masques-alpha.svg'), 'utf8'));
    const a = inverserMasque(alpha, masques(alpha)[0]?.id ?? '');
    const ma = masques(a.dessin)[0]?.masque;
    expect([ma?.type, ma?.contenu.formes.map(f => [f.remplissage, f.opacite])]).toEqual(['luminance', [['#ffffff', 1], ['#000000', 0.5], ['#000000', 0.75]]]);
    // Ce qui ne s'inverse pas : une image, une couleur qui n'est pas un code ; un groupe sans masque.
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const image = riche(SVG('<defs><mask id="m"><image href="' + png + '" width="40" height="40"/></mask></defs><g mask="url(#m)"><rect width="50" height="50"/></g>'));
    expect(inverserMasque(image, masques(image)[0]?.id ?? '')).toEqual({ dessin: image, erreur: MSG_MASQUE.image });
    const nommee = riche(SVG('<defs><mask id="m"><rect width="40" height="40" fill="context-fill"/></mask></defs><g mask="url(#m)"><rect width="50" height="50"/></g>'));
    expect(inverserMasque(nommee, masques(nommee)[0]?.id ?? '')).toEqual({ dessin: nommee, erreur: MSG_MASQUE.couleur });
    expect(inverserMasque(lumineux, 'g99')).toEqual({ dessin: lumineux, erreur: MSG_MASQUE.aucun });
  });
});
