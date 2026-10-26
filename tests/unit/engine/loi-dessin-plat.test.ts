// La loi du dessin plat (ADR-0012, annexe 7 §3, porte G4) : pour tout dessin plat, chaque fonction que le modele v2 a touchee rend
// exactement ce que rendait celle d'avant (profondement egal, et le MEME objet quand l'ancienne rendait le meme objet). Les
// anciennes sont figees dans `anciennes/` ; le corpus est tout SVG de tests/fixtures/svg qui s'ouvre. Une etape qui touche le corps
// d'une fonction de plus y recopie l'ancien et ajoute son cas ici ; le dossier et ce fichier partent a la bascule (etape 14).

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FONCTIONNALITES, arbreDe, coller, dupliquer, ecrireDessin, estPlat, feuillesDe, inserer, lireDessin, modifier, normaliser, poidsDessin, promouvoir,
  rotation, translation, echelle, multiplier, transformer, unites, verifierDessin, type DessinSvg, type Matrice,
  aligner, modifierTrait, supprimer, prochainId, ordonner, montrerSeulement, combiner, retirerPetites, regrouper, ajusterPlan, visibilitesDe,
  restaurerVisibilites, visibilitesConformes, ajouterForme, boiteDe, etoile, type Alignement, type Ordre
} from '../../../src/engine/editionSvg.js';
import { appliquerBooleen, BOOLEENS } from '../../../src/engine/booleens.js';
import { refusDe } from '../../../src/engine/edition/heritage.js';
import { aplatirPour, CAPACITES_PLAT } from '../../../src/engine/aplatir.js';
import { au } from '../../../src/util/tableaux.js';
import { ecrireDessinAncien } from './anciennes/ecriture.js';
import { collerAncien, dupliquerAncien, insererAncien, modifierAncien, refusDeAncien, transformerAncien } from './anciennes/operations.js';
import {
  ajouterFormeAncien, ajusterPlanAncien, alignerAncien, appliquerBooleenAncien, boiteDeAncien, combinerAncien, modifierTraitAncien, montrerSeulementAncien,
  ordonnerAncien, prochainIdAncien, regrouperAncien, restaurerVisibilitesAncien, retirerPetitesAncien, supprimerAncien, visibilitesConformesAncien,
  visibilitesDeAncien
} from './anciennes/etape1.js';
import {
  couleursDuDessin, groupesDeCouleur, idsDeCouleur, idsMemeCouleur, memesCouleurs, remplacerCouleur, remplacerCouleurSur
} from '../../../src/engine/edition/couleurs.js';
import { couleursProches, fusionnerCouleursProches, idsDeNuancesProches } from '../../../src/engine/edition/couleursProches.js';
import { apportsDe } from '../../../src/engine/nuancier.js';
import {
  couleursDuDessinAncien, groupesDeCouleurAncien, idsDeCouleurAncien, idsMemeCouleurAncien, memesCouleursAncien, remplacerCouleurAncien, remplacerCouleurSurAncien
} from './anciennes/couleurs.js';
import { couleursProchesAncien, fusionnerCouleursProchesAncien, idsDeNuancesProchesAncien } from './anciennes/couleursProches.js';
import { apportsDeAncien } from './anciennes/nuancier.js';

const DOSSIER = resolve(__dirname, '../../fixtures/svg');
const textes = readdirSync(DOSSIER).filter(n => n.endsWith('.svg')).sort().map(nom => ({ nom, svg: readFileSync(resolve(DOSSIER, nom), 'utf8').replace(/\r\n/g, '\n') }));
const corpus: Array<{ nom: string; svg: string; d: DessinSvg }> = textes.flatMap(t => {
  const r = lireDessin(t.svg);
  return 'erreur' in r ? [] : [{ ...t, d: r.dessin }];
});

const MATRICES: ReadonlyArray<readonly [string, Matrice]> = [
  ['translation', translation(12.5, -7.25)],
  ['rotation', rotation(33, 40, 60)],
  ['echelle non uniforme', echelle(1.7, 0.45, 10, 20)],
  ['inclinaison', multiplier([1, 0, 0.35, 1, 0, 0], echelle(-1, 1, 50, 0))]
];

describe('la loi du dessin plat', () => {
  it('le corpus est assez grand pour couvrir le modele plat', () => {
    expect(corpus.length).toBeGreaterThan(100);
    expect(corpus.some(c => c.d.formes.some(f => f.texte?.disposition))).toBe(true);
    expect(corpus.some(c => c.d.formes.some(f => f.origine))).toBe(true);
    expect(corpus.some(c => c.d.formes.some(f => f.pointilles))).toBe(true);
  });

  it('tout dessin lu en mode plat est plat, normal, bien forme ; son arbre est une feuille par forme ; sa descente est lui-meme', () => {
    for (const { nom, d } of corpus) {
      expect(estPlat(d), nom).toBe(true);
      expect(normaliser(d), nom).toBe(d);
      expect(verifierDessin(d), nom).toEqual([]);
      expect(poidsDessin(d), nom).toBe(d.formes.length);
      expect(aplatirPour(d, CAPACITES_PLAT).dessin, nom).toBe(d);
      const a = arbreDe(d);
      expect(a.racine.map(n => (n.genre === 'feuille' ? n.forme : null)), nom).toEqual(d.formes);
      const ids = d.formes.map(f => f.id);
      expect(feuillesDe(d, [...ids].reverse()), nom).toEqual(ids);
      expect(unites(d, ids), nom).toEqual(ids);
      expect(promouvoir(d, ids), nom).toEqual(ids);
    }
  });

  it('ecrireDessin rend les octets de l ancienne ecriture, a toute precision, avec ou sans operations', () => {
    for (const { nom, d } of corpus) {
      for (const precision of [2, 3]) {
        for (const operations of [false, true]) expect(ecrireDessin(d, precision, operations), nom).toBe(ecrireDessinAncien(d, precision, operations));
      }
    }
  });

  it('transformer rend le dessin de l ancienne transformation, et le meme objet quand rien ne change', () => {
    for (const { nom, d } of corpus) {
      const ids = d.formes.map(f => f.id), moitie = ids.filter((_, i) => i % 2 === 0);
      for (const [quoi, m] of MATRICES) {
        expect(transformer(d, ids, m), nom + ' ' + quoi).toEqual(transformerAncien(d, ids, m));
        expect(transformer(d, moitie, m), nom + ' ' + quoi).toEqual(transformerAncien(d, moitie, m));
      }
      const [, m] = au(MATRICES, 0);
      expect(transformer(d, [], m), nom).toBe(d);
      expect(transformerAncien(d, [], m), nom).toBe(d);
    }
  });

  it('dupliquer, coller et inserer rendent ce que rendaient les anciennes', () => {
    const cible = { x: 5, y: 7, l: 123.4, h: 56.7 };
    for (const { nom, d } of corpus) {
      const ids = d.formes.map(f => f.id);
      expect(dupliquer(d, ids, 4, -3), nom).toEqual(dupliquerAncien(d, ids, 4, -3));
      expect(dupliquer(d, ids), nom).toEqual(dupliquerAncien(d, ids));
      expect(dupliquer(d, []).dessin, nom).toBe(d);
      expect(coller(d, d.formes, 10, 10), nom).toEqual(collerAncien(d, d.formes, 10, 10));
      expect(coller(d, d.formes), nom).toEqual(collerAncien(d, d.formes));
      expect(inserer(d, d, cible), nom).toEqual(insererAncien(d, d, cible));
    }
  });

  it('modifier rend ce que rendait l ancien, et le meme objet quand rien ne change', () => {
    const reglages = [{ remplissage: '#123456' }, { contour: '#000000' }, { remplissage: null, contour: null }, { opacite: 0.5, visible: false }, { epaisseur: 3, regle: 'evenodd' as const }];
    for (const { nom, d } of corpus) {
      const ids = d.formes.map(f => f.id);
      for (const r of reglages) expect(modifier(d, ids, r), nom).toEqual(modifierAncien(d, ids, r));
      const premiere = d.formes[0];
      if (premiere) expect(modifier(d, [premiere.id], { remplissage: premiere.remplissage }), nom).toBe(d);
    }
  });

  it('les listes et remplacements de couleurs, les nuances proches et le nuancier rendent ce que rendaient les anciens (etape 3)', () => {
    const SUR = ['tout', 'remplissage', 'contour'] as const;
    for (const { nom, d } of corpus) {
      expect(couleursDuDessin(d), nom).toEqual(couleursDuDessinAncien(d));
      for (const sur of SUR) {
        expect(groupesDeCouleur(d, sur), nom).toEqual(groupesDeCouleurAncien(d, sur));
        expect(couleursProches(d, 0.08, sur), nom).toEqual(couleursProchesAncien(d, 0.08, sur));
        const fusion = fusionnerCouleursProches(d, 0.08, sur), ancienne = fusionnerCouleursProchesAncien(d, 0.08, sur);
        expect(fusion, nom).toEqual(ancienne);
        if (ancienne.dessin === d) expect(fusion.dessin, nom).toBe(d);
      }
      const premiere = d.formes.find(f => f.remplissage ?? f.contour), couleur = premiere ? premiere.remplissage ?? premiere.contour : null;
      if (premiere && couleur) {
        expect(idsDeCouleur(d, couleur), nom).toEqual(idsDeCouleurAncien(d, couleur));
        expect(idsMemeCouleur(d, premiere.id), nom).toEqual(idsMemeCouleurAncien(d, premiere.id));
        for (const sur of SUR) expect(idsDeNuancesProches(d, couleur, 0.05, sur), nom).toEqual(idsDeNuancesProchesAncien(d, couleur, 0.05, sur));
        for (const vers of ['#123456', null]) {
          expect(remplacerCouleur(d, couleur, vers), nom).toEqual(remplacerCouleurAncien(d, couleur, vers));
          for (const sur of SUR) expect(remplacerCouleurSur(d, couleur, vers, sur), nom).toEqual(remplacerCouleurSurAncien(d, couleur, vers, sur));
        }
      }
      expect(remplacerCouleur(d, '#fedcba', '#000000'), nom).toBe(d);
      expect(memesCouleurs(d.formes, d.formes.map(f => ({ ...f }))), nom).toBe(memesCouleursAncien(d.formes, d.formes.map(f => ({ ...f }))));
      for (const f of d.formes) expect(apportsDe(f), nom + ' ' + f.id).toEqual(apportsDeAncien(f));
    }
  });

  it('refusDe sans fonctionnalite refuse exactement comme avant', () => {
    const valeurs = [undefined, 'none', 'url(#a)', ''];
    for (const clip of valeurs) for (const mask of valeurs) for (const filter of valeurs) {
      const pr: Record<string, string> = {};
      if (clip !== undefined) pr['clip-path'] = clip;
      if (mask !== undefined) pr.mask = mask;
      if (filter !== undefined) pr.filter = filter;
      expect(refusDe(pr)).toBe(refusDeAncien(pr));
    }
  });

  // ---- etape 1 : les corps qui ont pris un chemin riche derriere `estPlat`

  it('etape 1 : boiteDe, prochainId, supprimer, ordonner, montrerSeulement rendent ce que rendaient les anciens', () => {
    const ordres: readonly Ordre[] = ['premier', 'avant', 'arriere', 'dernier'];
    for (const { nom, d } of corpus) {
      const ids = d.formes.map(f => f.id), moitie = ids.filter((_, i) => i % 2 === 0), tiers = ids.filter((_, i) => i % 3 === 1);
      expect(boiteDe(d, moitie), nom).toEqual(boiteDeAncien(d, moitie));
      expect(prochainId(d), nom).toBe(prochainIdAncien(d));
      expect(supprimer(d, tiers), nom).toEqual(supprimerAncien(d, tiers));
      expect(supprimer(d, []), nom).toBe(d);
      for (const o of ordres) {
        const n = ordonner(d, tiers, o), a = ordonnerAncien(d, tiers, o);
        expect(n, nom + ' ' + o).toEqual(a);
        expect(n === d, nom + ' ' + o).toBe(a === d);
      }
      expect(montrerSeulement(d, moitie), nom).toEqual(montrerSeulementAncien(d, moitie));
      const tout = montrerSeulement(d, ids);
      expect(tout === d, nom).toBe(montrerSeulementAncien(d, ids) === d);
    }
  });

  it('etape 1 : aligner, modifierTrait, combiner, ajouterForme rendent ce que rendaient les anciens', () => {
    const alignements: readonly Alignement[] = ['gauche', 'centreH', 'droite', 'haut', 'centreV', 'bas'];
    for (const { nom, d } of corpus) {
      const ids = d.formes.map(f => f.id), tiers = ids.filter((_, i) => i % 3 === 0);
      for (const a of alignements) expect(aligner(d, tiers, a), nom + ' ' + a).toEqual(alignerAncien(d, tiers, a));
      expect(aligner(d, ids.slice(0, 1), 'gauche'), nom).toEqual(alignerAncien(d, ids.slice(0, 1), 'gauche'));
      expect(modifierTrait(d, tiers, { pointilles: [3, 1], bout: 'round' }), nom).toEqual(modifierTraitAncien(d, tiers, { pointilles: [3, 1], bout: 'round' }));
      expect(combiner(d, tiers), nom).toEqual(combinerAncien(d, tiers));
      const style = { remplissage: '#123456', contour: null, epaisseur: 1 };
      expect(ajouterForme(d, etoile(5, 5, 20, 20), style), nom).toEqual(ajouterFormeAncien(d, etoile(5, 5, 20, 20), style));
      expect(ajouterForme(d, etoile(5, 5, 20, 20), style, 'evenodd', 'g-inconnu'), nom).toEqual(ajouterFormeAncien(d, etoile(5, 5, 20, 20), style, 'evenodd'));
    }
  });

  it('etape 1 : retirerPetites, regrouper, ajusterPlan et l isolement rendent ce que rendaient les anciens, le meme objet compris', () => {
    for (const { nom, d } of corpus) {
      for (const part of [0, 0.001, 0.05]) {
        const n = retirerPetites(d, part), a = retirerPetitesAncien(d, part);
        expect(n, nom).toEqual(a);
        expect(n.dessin === d, nom).toBe(a.dessin === d);
      }
      const r = regrouper(d), ra = regrouperAncien(d);
      expect(r, nom).toEqual(ra);
      expect(r.dessin === d, nom).toBe(ra.dessin === d);
      expect(ajusterPlan(d), nom).toEqual(ajusterPlanAncien(d));
      expect(ajusterPlan(d, 0.1), nom).toEqual(ajusterPlanAncien(d, 0.1));
      const avant = visibilitesDe(d);
      expect(avant, nom).toEqual(visibilitesDeAncien(d));
      const isole = montrerSeulement(d, d.formes.slice(0, 1).map(f => f.id));
      expect(restaurerVisibilites(isole, avant), nom).toEqual(restaurerVisibilitesAncien(isole, avant));
      expect(restaurerVisibilites(d, avant), nom).toBe(d);
      expect(visibilitesConformes(isole, avant), nom).toBe(visibilitesConformesAncien(isole, avant));
      expect(visibilitesConformes(d, avant), nom).toBe(true);
    }
  });

  it('etape 1 : les booleens rendent ce que rendaient les anciens', () => {
    for (const { nom, d } of corpus.slice(0, 40)) {
      const pleines = d.formes.filter(f => f.remplissage !== null && f.visible && !f.verrouille).slice(0, 3).map(f => f.id);
      for (const op of BOOLEENS) expect(appliquerBooleen(d, pleines, op), nom + ' ' + op).toEqual(appliquerBooleenAncien(d, pleines, op));
      expect(appliquerBooleen(d, pleines.slice(0, 1), 'union'), nom).toEqual(appliquerBooleenAncien(d, pleines.slice(0, 1), 'union'));
    }
  });

  it('la lecture riche lit comme la plate tout SVG sans groupe (et tout SVG tant que le catalogue est vide)', () => {
    for (const { nom, svg } of textes) {
      const plat = lireDessin(svg), explicite = lireDessin(svg, { modele: 'plat' });
      expect(explicite, nom).toEqual(plat);
      // Les 17 entrees sans <g> ne bougent jamais, meme en riche (annexe 2 §3) ; les autres, tant qu'aucune fonctionnalite n'est inscrite.
      if (!/<(?:g|a)[\s>/]/.test(svg) || FONCTIONNALITES.length === 0) expect(lireDessin(svg, { modele: 'riche' }), nom).toEqual(plat);
    }
  });

  it('un SVG a groupes lu en riche, puis descendu, redonne les formes de la lecture plate (memes refus, memes pertes dites hors images)', () => {
    for (const { nom, svg } of textes) {
      const plat = lireDessin(svg), riche = lireDessin(svg, { modele: 'riche' });
      expect('erreur' in riche, nom).toBe('erreur' in plat);
      // Les memes fichiers refuses ; la phrase peut differer quand le mode riche lit ce que le plat refuse en bloc (une image).
      if ('erreur' in riche || 'erreur' in plat) continue;
      expect(riche.ignores, nom).toEqual(plat.ignores);
      expect(verifierDessin(riche.dessin), nom).toEqual([]);
      expect(aplatirPour(riche.dessin, CAPACITES_PLAT).dessin.formes, nom).toEqual(plat.dessin.formes);
    }
  });
});
