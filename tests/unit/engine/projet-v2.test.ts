// Le projet JSON (ADR-0030) garde TOUT le modele : chaque champ d'une forme et du dessin doit y etre porte, sinon un projet rouvert
// perdrait en silence ce que le modele v2 ajoute. Les tables ci-dessous classent chaque champ ; le typage force a classer un champ
// nouveau (une cle manquante ne compile pas), et le test verifie que les champs dits « porte » font l'aller-retour exact. Une etape
// qui livre un champ v2 le porte dans `model/projet.ts` et `engine/projet.ts`, puis le passe ici a « porte » (ADR-0012, annexe 8).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ecrireDessin, lireDessin, type DessinSvg, type Forme } from '../../../src/engine/editionSvg.js';
import { etatDuProjet, formeDuProjet, formeProjet, projetDe, texteDuProjet, type EtatProjet } from '../../../src/engine/projet.js';
import { lireProjet, VERSION_PROJET, VERSION_PROJET_PLAT } from '../../../src/model/projet.js';
import { CHAMPS_FORME_V2 } from '../../../src/model/projetV2/champs.js';
import { ALLERS_RETOURS_FORME } from '../../../src/engine/projetV2/champs.js';

type Portage = 'porte' | `etape ${number}`;

const CHAMPS_FORME: Readonly<Record<keyof Forme, Portage>> = {
  id: 'porte', d: 'porte', remplissage: 'porte', contour: 'porte', epaisseur: 'porte', opacite: 'porte', opaciteRemplissage: 'porte',
  opaciteContour: 'porte', pointilles: 'porte', decalagePointilles: 'porte', bout: 'porte', jonction: 'porte', limiteMitre: 'porte',
  origine: 'porte', texte: 'porte', operation: 'porte', regle: 'porte', visible: 'porte', verrouille: 'porte',
  parent: 'porte', peintureRemplissage: 'etape 3', peintureContour: 'etape 3', effets: 'etape 7', image: 'etape 12'
};

const CHAMPS_DESSIN: Readonly<Record<keyof DessinSvg, Portage>> = { vb: 'porte', formes: 'porte', nuancier: 'porte', groupes: 'porte' };

const lire = (nom: string): DessinSvg => {
  const r = lireDessin(readFileSync(resolve(__dirname, '../../fixtures/svg', nom), 'utf8'));
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};

describe('le projet porte tout le modele', () => {
  it('chaque champ dit porte fait l aller-retour exact, et le projet n en ecrit pas d autre', () => {
    const avecTexte = lire('texte-sur-forme.attendu.svg').formes.find(f => f.texte?.disposition);
    if (!avecTexte) throw new Error('aucun texte pose dans la reference');
    const pleine: Forme = {
      ...avecTexte, contour: '#1f4e8c', epaisseur: 2, opacite: 0.5, opaciteRemplissage: 0.4, opaciteContour: 0.3, pointilles: [4, 2], decalagePointilles: 1,
      bout: 'round', jonction: 'bevel', limiteMitre: 6, origine: ['game-icons:a'], operation: 'ecriture', regle: 'evenodd', visible: false, verrouille: true,
      parent: 'g1'
    };
    const portes = Object.entries(CHAMPS_FORME).filter(([, p]) => p === 'porte').map(([k]) => k).sort();
    expect(Object.keys(pleine).sort()).toEqual(portes);
    expect(Object.keys(formeProjet(pleine)).sort()).toEqual(portes);
    expect(formeDuProjet(formeProjet(pleine))).toEqual(pleine);
  });

  it('les champs du modele v2 attendent l etape qui les livre', () => {
    const attendus = Object.entries({ ...CHAMPS_FORME, ...CHAMPS_DESSIN }).filter(([, p]) => p !== 'porte').map(([k, p]) => k + ' : ' + p);
    expect(attendus).toEqual(['peintureRemplissage : etape 3', 'peintureContour : etape 3', 'effets : etape 7', 'image : etape 12']);
  });

  it('les champs v2 d une forme ont un point d entree de chaque cote, dans le meme ordre', () => {
    expect(ALLERS_RETOURS_FORME.map(c => c.cle)).toEqual(CHAMPS_FORME_V2.map(c => c.cle));
  });
});

/** L'aller-retour complet : etat -> projet -> texte JSON -> projet lu -> etat. */
function allerRetour(dessin: DessinSvg): { texte: string; etat: EtatProjet } {
  const etat: EtatProjet = { nom: 'Essai', dessin, production: { contexte: 'generique' }, nuancier: [], polices: [], images: [] };
  const texte = texteDuProjet(projetDe(etat));
  const lu = lireProjet(JSON.parse(texte));
  if ('erreur' in lu) throw new Error(lu.erreur);
  expect(lu.migre).toBe(false);
  const rouvert = etatDuProjet(lu.projet);
  if ('erreur' in rouvert) throw new Error(rouvert.erreur);
  expect(texteDuProjet(projetDe(rouvert)), 'relu puis reecrit, le meme texte').toBe(texte);
  return { texte, etat: rouvert };
}

describe('les groupes dans le projet (etape 1)', () => {
  const lireRiche = (nom: string): DessinSvg => {
    const r = lireDessin(readFileSync(resolve(__dirname, '../../fixtures/svg', nom), 'utf8'), { modele: 'riche' });
    if ('erreur' in r) throw new Error(r.erreur);
    return r.dessin;
  };

  it('un dessin a groupes fait l aller-retour exact, au format 2, et reecrit le meme SVG', () => {
    for (const nom of ['v2/groupes-imbriques.svg', 'v2/groupes-nom-piegeux.svg', 'v2/groupes-use.svg', 'lecture-use-imbriques.svg', 'texte-vivant-lecture.svg']) {
      const d = lireRiche(nom);
      const { texte, etat } = allerRetour(d);
      expect(JSON.parse(texte).version, nom).toBe(VERSION_PROJET);
      expect(etat.dessin, nom).toEqual(d);
      expect(ecrireDessin(etat.dessin, 3), nom).toBe(ecrireDessin(d, 3));
    }
  });

  it('un dessin plat reste au format 1, octet pour octet', () => {
    const d = lire('chemins.svg');
    const { texte } = allerRetour(d);
    expect(JSON.parse(texte).version).toBe(VERSION_PROJET_PLAT);
    expect(texte).not.toContain('groupes');
    expect(texte).not.toContain('"parent"');
  });

  it('un arbre abime (une forme coupee de son groupe) est refuse a l ouverture, en le disant', () => {
    const d = lireRiche('v2/groupes-imbriques.svg');
    const projet = JSON.parse(texteDuProjet(projetDe({ nom: 'x', dessin: d, production: { contexte: 'generique' }, nuancier: [], polices: [], images: [] }))) as { dessin: { formes: unknown[] } };
    const [premiere, ...autres] = projet.dessin.formes;
    projet.dessin.formes = [...autres, premiere];
    const lu = lireProjet(projet);
    if ('erreur' in lu) throw new Error(lu.erreur);
    expect(etatDuProjet(lu.projet)).toEqual({ erreur: 'Ce projet porte des groupes mal formés.' });
  });
});
