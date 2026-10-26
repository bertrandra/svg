// La fin du parcours Cricut, en pur : ce que dit le bouton d'export selon les constats (un bloquant refuse, un « à corriger »
// demande une confirmation, un conseil ne change rien), la phrase de la confirmation, l'accord des couches, les etapes dans
// Design Space (ce qui n'est pas verifie reste marque), le libelle du selecteur de machine et l'unite retenue.

import { describe, expect, it } from 'vitest';
import { resoudreProfil, type Constat, type ProfilProduction } from '../../../src/engine/preparation.js';
import { CHOIX_CRICUT_DEFAUT, CHOIX_GENERIQUE, type ChoixMachine } from '../../../src/model/contextes.js';
import {
  demandeConfirmation, etapesDesignSpace, etatExport, libelleSelecteur, lireUnite, phraseConfirmation, phraseConfirmationCourte, phraseCouches, pointsACorriger
} from '../../../src/zones/parcoursCricut.js';

const constat = (gravite: Constat['gravite'], code: Constat['code'], message: string): Constat => ({ code, gravite, message, formes: [], correction: null });
const OUVERT = constat('a-corriger', 'trace-ouvert', 'Un tracé ouvert : la lame ne saurait où finir.');
const FIN = constat('a-corriger', 'detail-fin', 'Des parties plus étroites que 1,59 mm : la lame les déchirerait.');
const TRAIT = constat('bloquant', 'trait', 'Une forme a un contour.');
const POINTS = constat('conseil', 'trop-de-noeuds', 'Beaucoup de points.');

const profil = (choix: Partial<ChoixMachine> = {}): ProfilProduction => {
  const p = resoudreProfil({ contexte: 'cricut', ...CHOIX_CRICUT_DEFAUT, ...choix });
  if (!p) throw new Error('profil');
  return p;
};

describe('le bouton d export Cricut', () => {
  it('attend l analyse, puis refuse un bloquant en disant combien', () => {
    expect(etatExport(null)).toMatchObject({ raison: 'L’analyse du dessin n’est pas finie', libelle: 'Exporter pour Cricut' });
    expect(etatExport([TRAIT, OUVERT]).raison).toBe('Corrigez d’abord le constat bloquant');
    expect(etatExport([TRAIT, TRAIT]).raison).toBe('Corrigez d’abord les 2 constats bloquants');
  });

  it('dit combien de points restent a corriger, accorde au singulier et au pluriel', () => {
    expect(etatExport([OUVERT])).toMatchObject({ raison: null, libelle: 'Exporter quand même (1 point à corriger)' });
    expect(etatExport([OUVERT, FIN, POINTS]).libelle).toBe('Exporter quand même (2 points à corriger)');
    expect(pointsACorriger(3)).toBe('3 points à corriger');
  });

  it('ne demande rien pour un conseil seul, ni pour un dessin pret', () => {
    expect(etatExport([POINTS])).toEqual({ raison: null, aCorriger: [], libelle: 'Exporter pour Cricut' });
    expect(etatExport([])).toEqual({ raison: null, aCorriger: [], libelle: 'Exporter pour Cricut' });
  });

  it('demande une confirmation tant qu un point reste a corriger, et seulement si l export est permis ; « quand même » la donne', () => {
    expect(demandeConfirmation(etatExport([OUVERT]), false)).toBe(true);
    expect(demandeConfirmation(etatExport([OUVERT]), true)).toBe(false);
    expect(demandeConfirmation(etatExport([POINTS]), false)).toBe(false);
    expect(demandeConfirmation(etatExport([TRAIT, OUVERT]), false)).toBe(false);
    expect(demandeConfirmation(etatExport(null), false)).toBe(false);
  });

  it('dit dans la confirmation chaque point et les deux choix', () => {
    expect(phraseConfirmationCourte(2)).toBe('Il reste 2 points à corriger, listés dans le panneau : exporter quand même, ou revoir.');
    expect(phraseConfirmation([OUVERT, FIN])).toBe('Il reste 2 points à corriger : Un tracé ouvert : la lame ne saurait où finir ; Des parties plus étroites que 1,59 mm : la lame les déchirerait. Exporter quand même, ou Revoir.');
  });
});

describe('les phrases de la fin du parcours', () => {
  it('accorde couches et tapis (tapis ne prend pas de s)', () => {
    expect(phraseCouches(1)).toBe('1 couche : 1 tapis');
    expect(phraseCouches(4)).toBe('4 couches : 4 tapis');
  });

  it('donne les etapes de Design Space pour la decoupe, taille en millimetres, ce qui n est pas verifie marque', () => {
    // Avec le recalage coche (ADR-0039) : la taille du dessin ; le tapis fixe du defaut a ses etapes (zones/recalage.test.ts).
    const e = etapesDesignSpace(profil({ recalage: true }), 'bonhomme-de-neige', { l: 192, h: 96 });
    expect(e.map(x => x.texte)).toEqual([
      'Dans Design Space, « Nouveau projet », puis « Importer ».',
      'Choisissez le fichier bonhomme-de-neige-cricut.svg, importez-le, puis ajoutez-le au projet.',
      'Vérifiez sa taille : 50,8 × 25,4 mm. Ne la changez pas.',
      'Pour chaque couche, choisissez couper, dessiner ou rainer : le fichier ne le dit pas.'
    ]);
    expect(e.map(x => x.aVerifier ?? false)).toEqual([false, false, true, false]);
  });

  it('donne les etapes propres a Print Then Cut : l archive, l etalonnage, le tapis', () => {
    const e = etapesDesignSpace(profil({ procede: 'imprimer-decouper' }), 'carte', { l: 96, h: 96 });
    const texte = e.map(x => x.texte).join(' ');
    for (const bout of ['carte-print-then-cut.zip', 'Imprimer puis découper', 'étalonnage', 'tapis']) expect(texte, bout).toContain(bout);
    expect(e.filter(x => x.aVerifier).length).toBeGreaterThanOrEqual(2);
  });

  it('dit la machine et son tapis sur le bouton du selecteur, ou « Machine : Générique »', () => {
    expect(libelleSelecteur(CHOIX_GENERIQUE)).toBe('Machine : Générique');
    expect(libelleSelecteur({ contexte: 'cricut', ...CHOIX_CRICUT_DEFAUT })).toBe('Cricut Maker · 12 × 12');
    expect(libelleSelecteur({ contexte: 'cricut', ...CHOIX_CRICUT_DEFAUT, machine: 'joy', tapis: 'joy-4x6' })).toBe('Cricut Joy · 4,5 × 6,5');
    expect(libelleSelecteur({ contexte: 'cricut', ...CHOIX_CRICUT_DEFAUT, tapis: 'smart' })).toBe('Cricut Maker · sans tapis');
    expect(libelleSelecteur({ contexte: 'cricut', ...CHOIX_CRICUT_DEFAUT, procede: 'imprimer-decouper' })).toBe('Cricut Maker · 12 × 12 · Print Then Cut');
  });

  it('ne relit comme unite retenue que « mm » ou « in »', () => {
    expect(lireUnite('mm')).toBe('mm');
    expect(lireUnite('in')).toBe('in');
    for (const v of ['cm', 'MM', null, undefined, 3, {}, ['mm']]) expect(lireUnite(v)).toBeNull();
  });
});
