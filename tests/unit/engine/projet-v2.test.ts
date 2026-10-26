// Le projet JSON (ADR-0030) garde TOUT le modele : chaque champ d'une forme et du dessin doit y etre porte, sinon un projet rouvert
// perdrait en silence ce que le modele v2 ajoute. Les tables ci-dessous classent chaque champ ; le typage force a classer un champ
// nouveau (une cle manquante ne compile pas), et le test verifie que les champs dits « porte » font l'aller-retour exact. Une etape
// qui livre un champ v2 le porte dans `model/projet.ts` et `engine/projet.ts`, puis le passe ici a « porte » (ADR-0012, annexe 8).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lireDessin, type DessinSvg, type Forme } from '../../../src/engine/editionSvg.js';
import { formeDuProjet, formeProjet } from '../../../src/engine/projet.js';

type Portage = 'porte' | `etape ${number}`;

const CHAMPS_FORME: Readonly<Record<keyof Forme, Portage>> = {
  id: 'porte', d: 'porte', remplissage: 'porte', contour: 'porte', epaisseur: 'porte', opacite: 'porte', opaciteRemplissage: 'porte',
  opaciteContour: 'porte', pointilles: 'porte', decalagePointilles: 'porte', bout: 'porte', jonction: 'porte', limiteMitre: 'porte',
  origine: 'porte', texte: 'porte', operation: 'porte', regle: 'porte', visible: 'porte', verrouille: 'porte',
  parent: 'etape 1', peintureRemplissage: 'etape 3', peintureContour: 'etape 3', effets: 'etape 7', image: 'etape 12'
};

const CHAMPS_DESSIN: Readonly<Record<keyof DessinSvg, Portage>> = { vb: 'porte', formes: 'porte', nuancier: 'porte', reperes: 'porte', groupes: 'etape 1' };

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
    expect(attendus).toEqual(['parent : etape 1', 'peintureRemplissage : etape 3', 'peintureContour : etape 3', 'effets : etape 7', 'image : etape 12', 'groupes : etape 1']);
  });
});
