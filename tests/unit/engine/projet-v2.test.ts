// Le projet JSON (ADR-0030) garde TOUT le modele : chaque champ d'une forme et du dessin doit y etre porte, sinon un projet rouvert
// perdrait en silence ce que le modele v2 ajoute. Les tables ci-dessous classent chaque champ ; le typage force a classer un champ
// nouveau (une cle manquante ne compile pas), et le test verifie que les champs dits « porte » font l'aller-retour exact. Une etape
// qui livre un champ v2 le porte dans `model/projet.ts` et `engine/projet.ts`, puis le passe ici a « porte » (ADR-0012, annexe 8).
// « pret » : les fonctions du champ existent dans leurs propres fichiers (`model/projetV2/`, `engine/projetV2/`) et font l'aller-retour
// exact, mais attendent le cadre des champs v2 de l'etape 1 pour etre branchees (annexe 8 §2 : S3 et S12 branchent apres S1).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lireDessin, type DessinSvg, type Forme } from '../../../src/engine/editionSvg.js';
import { formeDuProjet, formeProjet } from '../../../src/engine/projet.js';
import { lireImageProjet } from '../../../src/model/projetV2/image.js';
import { imageDuProjet, imageProjet } from '../../../src/engine/projetV2/image.js';

type Portage = 'porte' | 'pret' | `etape ${number}`;

const CHAMPS_FORME: Readonly<Record<keyof Forme, Portage>> = {
  id: 'porte', d: 'porte', remplissage: 'porte', contour: 'porte', epaisseur: 'porte', opacite: 'porte', opaciteRemplissage: 'porte',
  opaciteContour: 'porte', pointilles: 'porte', decalagePointilles: 'porte', bout: 'porte', jonction: 'porte', limiteMitre: 'porte',
  origine: 'porte', texte: 'porte', operation: 'porte', regle: 'porte', visible: 'porte', verrouille: 'porte',
  parent: 'etape 1', peintureRemplissage: 'etape 3', peintureContour: 'etape 3', effets: 'etape 7', image: 'pret'
};

const CHAMPS_DESSIN: Readonly<Record<keyof DessinSvg, Portage>> = { vb: 'porte', formes: 'porte', nuancier: 'porte', groupes: 'etape 1' };

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
      bout: 'round', jonction: 'bevel', limiteMitre: 6, origine: ['game-icons:a'], operation: 'ecriture', regle: 'evenodd', visible: false, verrouille: true
    };
    const portes = Object.entries(CHAMPS_FORME).filter(([, p]) => p === 'porte').map(([k]) => k).sort();
    expect(Object.keys(pleine).sort()).toEqual(portes);
    expect(Object.keys(formeProjet(pleine)).sort()).toEqual(portes);
    expect(formeDuProjet(formeProjet(pleine))).toEqual(pleine);
  });

  it('les champs du modele v2 attendent l etape qui les livre', () => {
    const attendus = Object.entries({ ...CHAMPS_FORME, ...CHAMPS_DESSIN }).filter(([, p]) => p !== 'porte').map(([k, p]) => k + ' : ' + p);
    expect(attendus).toEqual(['parent : etape 1', 'peintureRemplissage : etape 3', 'peintureContour : etape 3', 'effets : etape 7', 'image : pret', 'groupes : etape 1']);
  });

  it('un champ pret fait l aller-retour exact par ses propres fonctions (etape 12 : image)', () => {
    const r = lireDessin(readFileSync(resolve(__dirname, '../../fixtures/svg/v2/images-rotation.svg'), 'utf8'), { modele: 'riche' });
    if ('erreur' in r) throw new Error(r.erreur);
    expect(r.dessin.formes.length).toBeGreaterThan(0);
    for (const f of r.dessin.formes) {
      if (!f.image) throw new Error('une image attendue');
      const lu = lireImageProjet(JSON.parse(JSON.stringify(imageProjet(f.image))));
      if ('erreur' in lu) throw new Error(lu.erreur);
      const retour = imageDuProjet(lu.image);
      if ('erreur' in retour) throw new Error(retour.erreur);
      expect(retour).toEqual({ image: f.image, d: f.d, octets: expect.any(Number) as number });
    }
  });
});
