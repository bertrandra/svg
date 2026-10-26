// Les groupes du modele v2, le moteur (ADR-0012, etape 1) : la lecture riche des <g>, ses bornes et ses refus, les operations
// nouvelles (grouper, degrouper, deplacer dans, renommer), chaque operation existante sur un dessin a groupes (annexe 3 §2), les
// lois de groupe (annexe 7 §3, point 4), une suite aleatoire qui garde les invariants, et le budget de l'arbre derive.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  GROUPES_MAX, MSG_FUSION, MSG_GROUPES_NOMBREUX, MSG_GROUPES_PROFONDS, MSG_MEME_PARENT, MSG_ORDRE_PEINTURE, MSG_VECTOR_EFFECT, PROFONDEUR_GROUPES_MAX,
  ajouterForme, ajusterPlan, aligner, arbreDe, boiteDe, boiteVisuelle, coller, combiner, degrouper, deplacer, deplacerDans, dupliquer, ecrireDessin, estPlat,
  etoile, feuillesDe, grouper, inserer, lireDessin, modifier, modifierTrait, montrerSeulement, ordonner, prochainId, redimensionner, regrouper, renommer,
  restaurerVisibilites, retirerPetites, separer, supprimer, tourner, transformer, verifierDessin, visibilitesConformes, visibilitesDe, visibleEffectif, translation,
  type Chemin, type DessinSvg, type Forme, type Groupe
} from '../../../src/engine/editionSvg.js';
import { appliquerBooleen } from '../../../src/engine/booleens.js';
import { nomGroupeTexte, vectoriserLettresEnGroupes } from '../../../src/engine/texte/vectoriser.js';
import { annuler, avancer, historique, retablir } from '../../../src/util/historique.js';
import { nettoyerSvg } from '../../../src/util/svg.js';
import { formeSousPoint, optionsPrise } from '../../../src/engine/prise.js';
import { formesDansZone } from '../../../src/engine/selection.js';
import { violationsEcriture, violationsNettoyage } from '../securite/invariants.js';
import { CAS } from './v2/cas-groupes.js';

const FIXTURES = resolve(__dirname, '../../fixtures/svg');
const SVG = (corps: string, racine = '') => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"' + racine + '>' + corps + '</svg>';
const CARRE = '<path d="M0 0h10v10h-10z" fill="#c81e28"/>';
const riche = (svg: string): DessinSvg => { const r = lireDessin(svg, { modele: 'riche' }); if ('erreur' in r) throw new Error(r.erreur); return r.dessin; };
const erreur = (svg: string, modele: 'plat' | 'riche') => { const r = lireDessin(svg, { modele }); return 'erreur' in r ? r.erreur : ''; };
const fixture = (nom: string): DessinSvg => riche(readFileSync(join(FIXTURES, nom), 'utf8'));
const ecrit = (d: DessinSvg): string => nettoyerSvg(ecrireDessin(d, 3))?.svg ?? '';
const forme = (d: DessinSvg, id: string): Forme => { const f = d.formes.find(x => x.id === id); if (!f) throw new Error('forme ' + id); return f; };
const groupe = (d: DessinSvg, id: string): Groupe => { const g = d.groupes?.[id]; if (!g) throw new Error('groupe ' + id); return g; };

const carre = (x: number, y: number, c = 10): Chemin => [{ c: 'M', p: [x, y] }, { c: 'L', p: [x + c, y] }, { c: 'L', p: [x + c, y + c] }, { c: 'L', p: [x, y + c] }, { c: 'Z', p: [] }];
const f = (id: string, p: Partial<Forme> = {}): Forme => ({ id, d: carre(0, 0), remplissage: '#c81e28', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, ...p });
const g = (id: string, p: Partial<Groupe> = {}): Groupe => ({ id, visible: true, verrouille: false, ...p });

/** Un dessin a deux niveaux : f1 a la racine, g1 (f2, g2 (f3, f4), f5), f6 a la racine. */
const exemple = (): DessinSvg => ({
  vb: [0, 0, 100, 100],
  formes: [
    f('f1', { d: carre(0, 0) }), f('f2', { d: carre(20, 0), parent: 'g1' }), f('f3', { d: carre(40, 0), parent: 'g2' }), f('f4', { d: carre(60, 0), parent: 'g2', remplissage: '#1428a0' }),
    f('f5', { d: carre(20, 30), parent: 'g1' }), f('f6', { d: carre(0, 60) })
  ],
  groupes: { g1: g('g1', { nom: 'Haut' }), g2: g('g2', { parent: 'g1', opacite: 0.5 }) }
});

describe('la lecture riche des groupes', () => {
  it('garde l opacite au groupe, sans la multiplier sur les feuilles (le mode plat la multiplie, comme avant)', () => {
    const svg = SVG('<g opacity="0.5"><path d="M0 0h10v10h-10z" fill="#c81e28" opacity="0.5"/></g>');
    const d = riche(svg);
    expect(d.groupes).toEqual({ g1: { id: 'g1', visible: true, verrouille: false, opacite: 0.5 } });
    expect(d.formes[0]).toMatchObject({ parent: 'g1', opacite: 0.5 });
    const p = lireDessin(svg);
    expect('erreur' in p ? null : p.dessin.formes[0]?.opacite).toBe(0.25);
  });

  it('nomme un groupe par data-ed-nom (decode), inkscape:label, data-name, puis l identifiant', () => {
    const d = fixture('v2/groupes-nom-piegeux.svg');
    expect(Object.values(d.groupes ?? {}).map(x => x.nom)).toEqual([
      'Joyeux Noël', 'on a=1 javascript:alert(1) url(x) @import', '<b> & "guillemets" ✓ 🎄', 'Calque_1', 'Repli', undefined
    ]);
    // Le nom s'ecrit encode : rien de ce qu'il contient ne survit en clair, et le nettoyage n'y change rien.
    const e = ecrit(d);
    expect(e).not.toMatch(/javascript:|url\(|@import|<b>/);
    expect(nettoyerSvg(e)?.svg).toBe(e);
  });

  it('un <use> d un <g> garde la structure de sa cible ; un <use> d une forme n en cree aucune', () => {
    const d = fixture('v2/groupes-use.svg');
    expect(Object.values(d.groupes ?? {}).map(x => [x.id, x.parent ?? null, x.nom, x.opacite ?? 1])).toEqual([
      ['g1', null, 'motif', 0.6], ['g2', 'g1', 'oeil', 1], ['g3', null, 'motif', 0.6], ['g4', 'g3', 'oeil', 1]
    ]);
    expect(d.formes.map(x => x.parent ?? null)).toEqual(['g1', 'g2', 'g3', 'g4', null]);
  });

  it('un groupe vide disparait, la table vide aussi : un SVG sans forme groupee se lit plat', () => {
    expect(riche(SVG(CARRE + '<g/><g><g></g></g>')).groupes).toBeUndefined();
    expect(estPlat(riche(SVG(CARRE + '<g display="none">' + CARRE + '</g>')))).toBe(true);
    expect(estPlat(riche(SVG('<g visibility="hidden">' + CARRE + '</g>' + CARRE)))).toBe(true);
  });

  it('borne la profondeur et le nombre des groupes, en le nommant ; le mode plat les fond comme avant', () => {
    const emboites = (n: number) => SVG('<g>'.repeat(n) + CARRE + '</g>'.repeat(n));
    expect(Object.keys(riche(emboites(PROFONDEUR_GROUPES_MAX)).groupes ?? {})).toHaveLength(PROFONDEUR_GROUPES_MAX);
    expect(verifierDessin(riche(emboites(PROFONDEUR_GROUPES_MAX)))).toEqual([]);
    expect(erreur(emboites(PROFONDEUR_GROUPES_MAX + 1), 'riche')).toContain(MSG_GROUPES_PROFONDS);
    expect(erreur(emboites(PROFONDEUR_GROUPES_MAX + 1), 'plat')).toBe('');
    const bombe = SVG(CARRE + '<g/>'.repeat(GROUPES_MAX + 1));
    expect(erreur(bombe, 'riche')).toContain(MSG_GROUPES_NOMBREUX);
    expect(erreur(bombe, 'plat')).toBe('');
    expect(erreur(SVG(CARRE + '<g/>'.repeat(GROUPES_MAX)), 'riche')).toBe('');
  });

  it('refuse un marqueur d une version plus recente, dans les deux modes ; lit le sien, ou un marqueur illisible', () => {
    for (const modele of ['plat', 'riche'] as const) {
      expect(erreur(SVG(CARRE, ' data-ed-modele="3"'), modele)).toBe('Ce fichier vient d’une version plus récente de l’éditeur (modèle 3) : mettez l’éditeur à jour pour l’ouvrir.');
      expect(erreur(SVG(CARRE, ' data-ed-modele="2"'), modele)).toBe('');
      expect(erreur(SVG(CARRE, ' data-ed-modele="1"'), modele)).toBe('');
      expect(erreur(SVG(CARRE, ' data-ed-modele="deux"'), modele)).toBe('');
    }
  });

  it('dit le mode de fusion, l ordre de peinture et vector-effect, dans les deux modes', () => {
    const svg = SVG('<g style="mix-blend-mode:multiply"><path d="M0 0h10v10h-10z" paint-order="stroke" stroke="#000" vector-effect="non-scaling-stroke"/></g>');
    for (const modele of ['plat', 'riche'] as const) {
      const r = lireDessin(svg, { modele });
      expect('erreur' in r ? [] : r.ignores).toEqual([MSG_FUSION, MSG_ORDRE_PEINTURE, MSG_VECTOR_EFFECT]);
    }
    const sansPerte = lireDessin(SVG('<g style="mix-blend-mode:normal;isolation:isolate">' + CARRE.replace('/>', ' paint-order="fill stroke" vector-effect="none"/>') + '</g>'), { modele: 'riche' });
    expect('erreur' in sansPerte ? null : sansPerte.ignores).toEqual([]);
  });

  it('toute fixture v2 et tout SVG du corpus lus en riche respectent les invariants', () => {
    const noms = [...readdirSync(join(FIXTURES, 'v2')).filter(n => n.endsWith('.svg')).map(n => 'v2/' + n), ...readdirSync(FIXTURES).filter(n => n.endsWith('.svg'))];
    let lus = 0;
    for (const nom of noms) {
      const r = lireDessin(readFileSync(join(FIXTURES, nom), 'utf8'), { modele: 'riche' });
      if ('erreur' in r) continue;
      lus++;
      expect(verifierDessin(r.dessin), nom).toEqual([]);
    }
    expect(lus).toBeGreaterThan(150);
  });

  it('le corpus hostile se lit aussi en riche : jamais d exception, des invariants tenus, un point fixe (H1, H5)', () => {
    const dossier = resolve(__dirname, '../../fixtures/hostile');
    const attendus: Record<string, 'ouvre' | 'refus'> = {
      'v2-groupes-65-niveaux.svg': 'refus', 'v2-groupes-10000-emboites.svg': 'refus', 'v2-groupes-bombe-vides.svg': 'refus',
      'v2-groupes-nom-injection.svg': 'ouvre', 'v2-groupes-marqueur-futur.svg': 'refus'
    };
    for (const nom of readdirSync(dossier).filter(n => n.endsWith('.svg'))) {
      const propre = nettoyerSvg(new TextDecoder('utf-8').decode(readFileSync(join(dossier, nom))));
      if (!propre) { expect(attendus[nom] ?? 'refus', nom).toBe('refus'); continue; }
      const t0 = performance.now();
      const r = lireDessin(propre.svg, { modele: 'riche' });
      expect(performance.now() - t0, nom).toBeLessThan(5000);
      if (attendus[nom]) expect('erreur' in r ? 'refus' : 'ouvre', nom).toBe(attendus[nom]);
      if ('erreur' in r) continue;
      expect(verifierDessin(r.dessin), nom).toEqual([]);
      if (!r.dessin.formes.some(x => visibleEffectif(r.dessin, x.id))) continue;
      const e = ecrit(r.dessin);
      expect(violationsEcriture(e), nom).toEqual([]);
      expect(ecrit(riche(e)), nom).toBe(e);
    }
  });

  it('l ecriture de chaque cas des groupes passe la specification de l ecriture et celle du nettoyage', () => {
    for (const c of CAS) {
      const depart = c.dessin ? c.dessin() : riche(readFileSync(join(FIXTURES, 'v2', (c.entree ?? '') + '.svg'), 'utf8'));
      const e = ecrit(c.operation ? c.operation(depart) : depart);
      expect(violationsEcriture(e), c.nom).toEqual([]);
      expect(violationsNettoyage(e), c.nom).toEqual([]);
    }
  });
});

describe('les operations nouvelles', () => {
  it('grouper : un groupe nouveau a la place du plus haut noeud, dans son parent ; un noeud d un autre parent y est ramene', () => {
    const d = exemple();
    const r = grouper(d, ['f3', 'f5'], ' Paire ');
    expect(r.id).toBe('g3');
    expect(groupe(r.dessin, 'g3')).toEqual({ id: 'g3', parent: 'g1', nom: 'Paire', visible: true, verrouille: false });
    expect(r.dessin.formes.map(x => [x.id, x.parent ?? null])).toEqual([['f1', null], ['f2', 'g1'], ['f4', 'g2'], ['f3', 'g3'], ['f5', 'g3'], ['f6', null]]);
    expect(verifierDessin(r.dessin)).toEqual([]);
    expect(grouper(d, []).dessin).toBe(d);
    expect(grouper(d, ['inconnu']).id).toBeNull();
  });

  it('grouper un dessin plat le rend riche ; degrouper(grouper(d, ids)) redonne d, et ses octets', () => {
    const d = fixture('chemins.svg');
    expect(estPlat(d)).toBe(true);
    const ids = d.formes.slice(1, 3).map(x => x.id);
    const r = grouper(d, ids);
    expect(estPlat(r.dessin)).toBe(false);
    const retour = degrouper(r.dessin, [r.id ?? '']);
    expect(retour.dessin).toEqual(d);
    expect(ecrireDessin(retour.dessin, 3)).toBe(ecrireDessin(d, 3));
    expect(retour.ids).toEqual(ids);
  });

  it('degrouper remonte les enfants dans leur ordre, et nomme les groupes qui portaient quelque chose', () => {
    const r = degrouper(exemple(), ['g2']);
    expect(r.porteurs).toEqual(['g2']);
    expect(r.ids).toEqual(['f3', 'f4']);
    expect(r.dessin.formes.map(x => x.parent ?? null)).toEqual([null, 'g1', 'g1', 'g1', 'g1', null]);
    expect(Object.keys(r.dessin.groupes ?? {})).toEqual(['g1']);
    const tout = degrouper(exemple(), ['g1', 'g2']);
    expect(tout.dessin.groupes).toBeUndefined();
    expect(estPlat(tout.dessin)).toBe(true);
    expect(degrouper(exemple(), ['f1']).dessin).toEqual(exemple());
  });

  it('deplacerDans : sous un frere donne, au premier plan du groupe, ou a la racine ; jamais dans soi-meme', () => {
    const d = exemple();
    const dans = deplacerDans(d, ['f6'], 'g2', 'f4');
    expect(dans.formes.map(x => [x.id, x.parent ?? null])).toEqual([['f1', null], ['f2', 'g1'], ['f3', 'g2'], ['f6', 'g2'], ['f4', 'g2'], ['f5', 'g1']]);
    expect(deplacerDans(d, ['f1'], 'g1').formes.map(x => x.id)).toEqual(['f2', 'f3', 'f4', 'f5', 'f1', 'f6']);
    expect(deplacerDans(d, ['g2'], undefined).formes.map(x => x.id)).toEqual(['f1', 'f2', 'f5', 'f6', 'f3', 'f4']);
    expect(deplacerDans(d, ['g1'], 'g2')).toBe(d);
    expect(deplacerDans(d, ['g1'], 'g1')).toBe(d);
    expect(deplacerDans(d, ['f3', 'f4'], 'g2')).toBe(d);
    for (const r of [dans, deplacerDans(d, ['f3', 'f4'], undefined)]) expect(verifierDessin(r)).toEqual([]);
    // Un groupe que le deplacement viderait part : ses formes ont toutes change de parent.
    expect(deplacerDans(d, ['f3', 'f4'], undefined).groupes?.g2).toBeUndefined();
  });

  it('renommer : un nom, un nom vide qui le retire, le meme dessin sans changement', () => {
    const d = exemple();
    expect(groupe(renommer(d, 'g2', 'Yeux'), 'g2').nom).toBe('Yeux');
    expect('nom' in groupe(renommer(d, 'g1', '  '), 'g1')).toBe(false);
    expect(renommer(d, 'g1', 'Haut')).toBe(d);
    expect(renommer(d, 'f1', 'x')).toBe(d);
  });
});

describe('les operations existantes sur un dessin a groupes (annexe 3 §2)', () => {
  it('transformer emmene les feuilles d un groupe choisi ; redimensionner(g) = redimensionner(ses feuilles) pour les feuilles', () => {
    const d = exemple();
    const cible = { x: 10, y: 10, l: 30, h: 50 };
    const parGroupe = redimensionner(d, ['g1'], cible), parFeuilles = redimensionner(d, feuillesDe(d, ['g1']), cible);
    expect(parGroupe.formes).toEqual(parFeuilles.formes);
    expect(boiteDe(d, ['g1'])).toEqual(boiteDe(d, ['f2', 'f3', 'f4', 'f5']));
    expect(transformer(d, [], translation(1, 1))).toBe(d);
    expect(tourner(d, ['g2'], 90).formes.map(x => x.d)).toEqual(tourner(d, ['f3', 'f4'], 90).formes.map(x => x.d));
  });

  it('aligner deplace chaque unite d un bloc', () => {
    const d = exemple();
    const r = aligner(d, ['g2', 'f6'], 'gauche');
    // g2 bouge en bloc : ses deux feuilles gardent leur ecart.
    expect(boiteDe(r, ['g2'])?.x).toBe(0);
    expect(boiteDe(r, ['f4'])?.x).toBe(20);
    expect(boiteDe(r, ['f6'])?.x).toBe(0);
  });

  it('modifier : visibilite, verrou et opacite vont au groupe ; la peinture a ses feuilles', () => {
    const d = exemple();
    const r = modifier(d, ['g1'], { visible: false, opacite: 0.3, remplissage: '#00ff00' });
    expect(groupe(r, 'g1')).toMatchObject({ visible: false, opacite: 0.3 });
    expect(r.formes.filter(x => x.parent).every(x => x.visible && x.opacite === 1 && x.remplissage === '#00ff00')).toBe(true);
    expect(forme(r, 'f1').remplissage).toBe('#c81e28');
    expect('opacite' in groupe(modifier(d, ['g2'], { opacite: 1 }), 'g2')).toBe(false);
    expect(modifier(d, ['g1'], { visible: true })).toBe(d);
    expect(modifierTrait(d, ['g2'], { bout: 'round' }).formes.filter(x => x.bout === 'round').map(x => x.id)).toEqual(['f3', 'f4']);
  });

  it('supprimer : un groupe part avec ses feuilles et ses sous-groupes ; un groupe vide aussi', () => {
    const d = exemple();
    const r = supprimer(d, ['g1']);
    expect(r.formes.map(x => x.id)).toEqual(['f1', 'f6']);
    expect(r.groupes).toBeUndefined();
    expect(Object.keys(supprimer(d, ['f3', 'f4']).groupes ?? {})).toEqual(['g1']);
    expect(supprimer(d, ['inconnu'])).toBe(d);
  });

  it('dupliquer copie le sous-arbre juste au-dessus, sous des identifiants neufs ; prochainId voit tout le dessin', () => {
    const d = exemple();
    expect(prochainId(d)).toBe(7);
    const r = dupliquer(d, ['g2', 'f1'], 5, 0);
    expect(r.ids).toEqual(['f7', 'g3']);
    expect(r.dessin.formes.map(x => [x.id, x.parent ?? null])).toEqual([
      ['f1', null], ['f7', null], ['f2', 'g1'], ['f3', 'g2'], ['f4', 'g2'], ['f8', 'g3'], ['f9', 'g3'], ['f5', 'g1'], ['f6', null]
    ]);
    expect(groupe(r.dessin, 'g3')).toEqual({ id: 'g3', parent: 'g1', visible: true, verrouille: false, opacite: 0.5 });
    expect(verifierDessin(r.dessin)).toEqual([]);
  });

  it('ordonner deplace un noeud parmi ses freres seulement, un groupe en bloc', () => {
    const d = exemple();
    expect(ordonner(d, ['f2'], 'premier').formes.map(x => x.id)).toEqual(['f1', 'f3', 'f4', 'f5', 'f2', 'f6']);
    expect(ordonner(d, ['g1'], 'dernier').formes.map(x => x.id)).toEqual(['f2', 'f3', 'f4', 'f5', 'f1', 'f6']);
    expect(ordonner(d, ['g2'], 'avant').formes.map(x => x.id)).toEqual(['f1', 'f2', 'f5', 'f3', 'f4', 'f6']);
    expect(ordonner(d, ['f6'], 'premier')).toBe(d);
    // Chacun dans son parent : f4 passe sous f3 dans g2, f6 passe sous g1 a la racine.
    expect(ordonner(d, ['f4', 'f6'], 'arriere').formes.map(x => x.id)).toEqual(['f1', 'f6', 'f2', 'f4', 'f3', 'f5']);
  });

  it('isoler montre les noeuds choisis et leurs ancetres ; l instantane garde aussi les groupes', () => {
    const d = modifier(exemple(), ['f4'], { visible: false });
    const avant = visibilitesDe(d);
    expect(avant.get('g1')).toBe(true);
    const r = montrerSeulement(d, ['g2']);
    expect(r.formes.map(x => [x.id, x.visible])).toEqual([['f1', false], ['f2', false], ['f3', true], ['f4', false], ['f5', false], ['f6', false]]);
    expect(groupe(r, 'g1').visible).toBe(true);
    expect(visibilitesConformes(r, avant)).toBe(false);
    expect(restaurerVisibilites(r, avant)).toEqual(d);
    const masque = modifier(d, ['g1'], { visible: false });
    expect(visibilitesConformes(masque, avant)).toBe(false);
    expect(restaurerVisibilites(masque, avant)).toEqual(d);
  });

  it('combiner et les booleens exigent un meme parent, et le disent ; le resultat garde le parent', () => {
    const d = exemple();
    expect(combiner(d, ['f1', 'f2'])).toEqual({ dessin: d, id: null, erreur: MSG_MEME_PARENT });
    expect(appliquerBooleen(d, ['f1', 'f2'], 'union')).toMatchObject({ dessin: d, id: null, erreur: MSG_MEME_PARENT });
    const c = combiner(d, ['g2']);
    expect(c.id).toBe('f4');
    expect(forme(c.dessin, 'f4').parent).toBe('g2');
    const u = appliquerBooleen(d, ['g2'], 'union');
    expect(u.id).toBe('f7');
    expect(forme(u.dessin, 'f7').parent).toBe('g2');
    expect(verifierDessin(u.dessin)).toEqual([]);
    // Ce qui vide un groupe le retire.
    const vide = appliquerBooleen(d, ['g2'], 'intersection');
    expect(vide.dessin.groupes?.g2).toBeUndefined();
    expect(verifierDessin(vide.dessin)).toEqual([]);
  });

  it('separer garde le parent ; regrouper ne reunit jamais deux formes de groupes differents', () => {
    const d: DessinSvg = { ...exemple(), formes: exemple().formes.map(x => (x.id === 'f2' ? { ...x, d: [...carre(20, 0), ...carre(20, 15)] } : x)) };
    const s = separer(d, 'f2');
    expect(s.ids).toEqual(['f2', 'f7']);
    expect(forme(s.dessin, 'f7').parent).toBe('g1');
    expect(verifierDessin(s.dessin)).toEqual([]);
    const voisines: DessinSvg = { vb: [0, 0, 100, 100], formes: [f('f1', { d: carre(0, 0) }), f('f2', { d: carre(50, 50), parent: 'g1' })], groupes: { g1: g('g1') } };
    expect(regrouper(voisines).reunies).toBe(0);
    expect(regrouper({ ...voisines, formes: voisines.formes.map(x => ({ ...x, parent: 'g1' })) }).reunies).toBe(1);
  });

  it('retirerPetites retire aussi un groupe devenu vide ; ajusterPlan ignore les formes d un groupe masque', () => {
    const d: DessinSvg = { vb: [0, 0, 1000, 1000], formes: [f('f1', { d: carre(0, 0, 500) }), f('f2', { d: carre(900, 900, 1), parent: 'g1' })], groupes: { g1: g('g1') } };
    const r = retirerPetites(d, 0.001);
    expect(r.retirees).toBe(1);
    expect(r.dessin.groupes).toBeUndefined();
    const masque = modifier({ ...d, formes: d.formes.map(x => (x.id === 'f2' ? { ...x, d: carre(900, 900, 50) } : x)) }, ['g1'], { visible: false });
    expect(ajusterPlan(masque, 0).vb).toEqual([0, 0, 500, 500]);
    expect(boiteVisuelle(masque, 'g1')).toEqual({ x: 900, y: 900, l: 50, h: 50 });
  });

  it('ajouterForme pose la forme au premier plan du groupe du contexte', () => {
    const r = ajouterForme(exemple(), etoile(0, 0, 10, 10), { remplissage: '#000000', contour: null, epaisseur: 1 }, 'nonzero', 'g2');
    expect(r.id).toBe('f7');
    expect(r.dessin.formes.map(x => [x.id, x.parent ?? null])).toEqual([['f1', null], ['f2', 'g1'], ['f3', 'g2'], ['f4', 'g2'], ['f7', 'g2'], ['f5', 'g1'], ['f6', null]]);
  });

  it('coller avec les groupes du presse-papiers les recree ; inserer un dessin a groupes les garde', () => {
    const d = exemple();
    const copiees = d.formes.filter(x => x.parent === 'g2');
    const c = coller(d, copiees, 5, 5, d.groupes);
    expect(c.ids).toEqual(['g3']);
    expect(c.dessin.formes.slice(-2).map(x => [x.id, x.parent])).toEqual([['f7', 'g4'], ['f8', 'g4']]);
    expect(groupe(c.dessin, 'g3').parent).toBeUndefined();
    expect(groupe(c.dessin, 'g4').parent).toBe('g3');
    expect(verifierDessin(c.dessin)).toEqual([]);
    expect(coller(d, copiees).dessin.formes.slice(-2).every(x => x.parent === undefined)).toBe(true);
    const plat: DessinSvg = { vb: [0, 0, 10, 10], formes: [f('f1')] };
    const i = inserer(plat, d, { x: 0, y: 0, l: 10, h: 10 });
    expect(i.ids).toEqual(['f2', 'g1', 'f7']);
    expect(verifierDessin(i.dessin)).toEqual([]);
    expect(Object.values(i.dessin.groupes ?? {}).map(x => x.nom ?? null)).toEqual(['Haut', null]);
  });

  it('les liens des textes poses survivent a grouper, degrouper et deplacer dans', () => {
    const d = fixture('texte-sur-forme.attendu.svg');
    const r = deplacerDans(grouper(grouper(d, ['f2', 'f3']).dessin, ['f5']).dessin, ['f4'], 'g1');
    expect(r.formes.filter(x => x.texte?.disposition).map(x => x.texte?.disposition?.forme)).toEqual(['f2', 'f2', 'f5']);
    const relu = riche(ecrit(r));
    const parId = new Map(relu.formes.map(x => [x.id, x]));
    for (const t of relu.formes.filter(x => x.texte?.disposition)) expect(parId.get(t.texte?.disposition?.forme ?? '')?.remplissage).toBe('#e0b84a');
    expect(ecrit(degrouper(relu, Object.keys(relu.groupes ?? {})).dessin)).toBe(ecrit(d));
  });

  it('prise et selection par zone voient toujours les feuilles d un dessin a groupes', () => {
    const d = exemple();
    expect(formeSousPoint(d.formes, 45, 5, optionsPrise(1, false))).toBe('f3');
    expect(formesDansZone(d.formes, { rect: { x: 35, y: -5, l: 40, h: 20 } }, { regle: 'touche' })).toEqual(['f3', 'f4']);
  });

  it('« Lettres séparées » en riche rend un groupe nommé par son texte, a la place du texte', () => {
    const d = fixture('texte-sur-forme.attendu.svg');
    const r = vectoriserLettresEnGroupes(d, ['f6']);
    expect(r.groupes).toHaveLength(1);
    const id = r.groupes[0] ?? '';
    expect(groupe(r.dessin, id).nom).toBe('Texte « vague »');
    expect(r.dessin.formes.filter(x => x.parent === id).length).toBe(r.ids.length);
    expect(r.ids.length).toBeGreaterThan(1);
    expect(verifierDessin(r.dessin)).toEqual([]);
    expect(nomGroupeTexte('\n  Une première ligne bien plus longue que quarante caractères\nsuite')).toBe('Texte « Une première ligne bien plus longue que… »');
  });
});

// ---------------------------------------------------------------- une suite aleatoire

/** Un generateur a graine (mulberry32), dans les tests seulement : le coeur pur n'emploie pas de hasard. */
function alea(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('une suite aleatoire d operations garde les invariants', () => {
  for (const graine of [1, 7, 42]) {
    it('graine ' + graine + ' : 100 operations, verifierDessin vide apres chacune, annuler et retablir par reference', () => {
      const r = alea(graine);
      const choisir = <T>(t: readonly T[]): T | undefined => t[Math.floor(r() * t.length)];
      const noeuds = (d: DessinSvg) => [...d.formes.map(x => x.id), ...Object.keys(d.groupes ?? {})];
      const quelques = (d: DessinSvg) => noeuds(d).filter(() => r() < 0.3);
      const operations: ReadonlyArray<readonly [string, (d: DessinSvg) => DessinSvg]> = [
        ['grouper', d => grouper(d, quelques(d)).dessin],
        ['degrouper', d => degrouper(d, quelques(d)).dessin],
        ['deplacer dans', d => deplacerDans(d, quelques(d), choisir([undefined, ...Object.keys(d.groupes ?? {})]), choisir(noeuds(d)))],
        ['deplacer', d => deplacer(d, quelques(d), r() * 10 - 5, r() * 10 - 5)],
        ['redimensionner', d => redimensionner(d, quelques(d), { x: 1, y: 2, l: 1 + r() * 50, h: 1 + r() * 50 })],
        ['ordonner', d => ordonner(d, quelques(d), choisir(['premier', 'avant', 'arriere', 'dernier'] as const) ?? 'avant')],
        ['dupliquer', d => dupliquer(d, quelques(d), 2, 2).dessin],
        ['supprimer', d => (d.formes.length > 3 ? supprimer(d, quelques(d).slice(0, 2)) : d)],
        ['combiner', d => combiner(d, quelques(d)).dessin],
        ['separer', d => separer(d, choisir(d.formes)?.id ?? '').dessin],
        ['booleen', d => appliquerBooleen(d, quelques(d), choisir(['union', 'soustraction', 'intersection', 'exclusion'] as const) ?? 'union').dessin],
        ['masquer', d => modifier(d, quelques(d), { visible: r() < 0.5 })],
        ['verrouiller', d => modifier(d, quelques(d), { verrouille: r() < 0.5 })],
        ['opacite', d => modifier(d, quelques(d), { opacite: Math.round(r() * 10) / 10 })],
        ['renommer', d => renommer(d, choisir(Object.keys(d.groupes ?? {})) ?? '', 'n' + Math.floor(r() * 9))],
        ['ajouter', d => ajouterForme(d, carre(r() * 80, r() * 80), { remplissage: '#123456', contour: null, epaisseur: 1 }, 'nonzero', choisir(Object.keys(d.groupes ?? {}))).dessin],
        ['isoler', d => montrerSeulement(d, quelques(d))]
      ];
      let h = historique<DessinSvg>(exemple());
      for (let i = 0; i < 100; i++) {
        const [nom, op] = choisir(operations) ?? ['', (d: DessinSvg) => d];
        const avant = h.present, apres = op(avant);
        const defauts = verifierDessin(apres);
        expect(defauts, 'graine ' + graine + ', operation ' + i + ' (' + nom + ')').toEqual([]);
        h = avancer(h, apres);
        if (apres !== avant) {
          expect(annuler(h).present, 'annuler ' + nom).toBe(avant);
          expect(retablir(annuler(h)).present, 'retablir ' + nom).toBe(apres);
        }
        // L'ecriture d'un dessin bien forme se relit en point fixe.
        if (i % 10 === 9 && apres.formes.some(x => visibleEffectif(apres, x.id))) { const e = ecrit(apres); expect(ecrit(riche(e)), 'point fixe apres ' + nom).toBe(e); }
      }
    });
  }
});

describe('le budget de l arbre derive (annexe 7 §4)', () => {
  it('arbreDe sur 5 000 feuilles dans 500 groupes sur 3 niveaux : mesure consignee, borne large en CI', () => {
    const formes: Forme[] = [], groupes: Record<string, Groupe> = {};
    for (let a = 0; a < 20; a++) {
      groupes['g' + a] = g('g' + a);
      for (let b = 0; b < 5; b++) {
        const idb = 'g' + (20 + a * 5 + b);
        groupes[idb] = g(idb, { parent: 'g' + a });
        for (let c = 0; c < 4; c++) {
          const idc = 'g' + (120 + (a * 5 + b) * 4 + c);
          groupes[idc] = g(idc, { parent: idb });
          for (let k = 0; k < 12; k++) formes.push(f('f' + (formes.length + 1), { parent: idc }));
        }
      }
    }
    while (formes.length < 5000) formes.push(f('f' + (formes.length + 1)));
    const d: DessinSvg = { vb: [0, 0, 100, 100], formes, groupes };
    expect(Object.keys(groupes)).toHaveLength(520);
    expect(verifierDessin(d)).toEqual([]);
    // Chaque modification rend un dessin neuf : l'arbre se reconstruit sur un code deja chaud. Trois tours d'echauffement, puis la
    // mediane de sept (machine de l'agent : 2,4 ms, quand l'arbre plat de 5 000 feuilles en prend 1,4 ; consigne a l'annexe 8). La CI ne borne que l'ordre de grandeur.
    const mesures: number[] = [];
    for (let i = 0; i < 10; i++) {
      const copie: DessinSvg = { ...d };
      const t0 = performance.now();
      arbreDe(copie);
      if (i >= 3) mesures.push(performance.now() - t0);
    }
    mesures.sort((x, y) => x - y);
    expect(mesures[3] ?? Infinity).toBeLessThan(100);
  });
});
