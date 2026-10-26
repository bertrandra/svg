// Les cas d'ecriture des outils de couleur sur les degrades et les motifs (ADR-0012, etape 13d) : remplacer une couleur partout, sur
// le fond seul, sur le trait seul, fusionner les nuances proches, appliquer une palette, tout mettre d'une couleur. Les arrets des
// degrades et les feuilles des tuiles changent comme les couleurs unies, la couleur de repli se recalcule, le contenu d'un masque ne
// bouge pas. Chaque cas s'ecrit comme « Enregistrer », se compare a sa reference `tests/fixtures/svg/v2/couleurs-*.attendu.svg` et se
// relit en point fixe (ecriture-stable-v2.test.ts).

import { fusionnerCouleursProches, lireDessin, remplacerCouleur, remplacerCouleurSur, type DessinSvg } from '../../../../src/engine/editionSvg.js';
import { appliquerPalette, palette, uneCouleur } from '../../../../src/engine/palettes.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CasV2 } from './cas.js';

const peintures = (): DessinSvg => {
  const r = lireDessin(readFileSync(resolve(__dirname, '../../../fixtures/svg/v2/couleurs-peintures.svg'), 'utf8'), { modele: 'riche' });
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};

export const CAS: readonly CasV2[] = [
  { nom: 'couleurs-peintures', entree: 'couleurs-peintures' },
  // Le rouge partout : fond et trait unis, le premier arret des trois degrades (fond, trait, tuile), la feuille de la tuile (le motif au
  // fond et au trait reste une seule definition) ; pas le masque
  { nom: 'couleurs-remplacer', dessin: peintures, operation: d => remplacerCouleur(d, '#c81e28', '#7b2d8e') },
  // Le bleu sur le fond seul : le degrade du fond change, celui du trait non (deux definitions), la tuile (peinture d'un fond) aussi
  { nom: 'couleurs-remplacer-fond', dessin: peintures, operation: d => remplacerCouleurSur(d, '#1f5fb0', '#264653', 'remplissage') },
  // Le rouge sur le trait seul : le trait uni, l'arret du degrade au trait, la tuile qui peint un trait
  { nom: 'couleurs-remplacer-trait', dessin: peintures, operation: d => remplacerCouleurSur(d, '#c81e28', '#264653', 'contour') },
  // Le rouge presque identique du halo rejoint le rouge du dessin
  { nom: 'couleurs-fusionner', dessin: peintures, operation: d => fusionnerCouleursProches(d, 0.02).dessin },
  // Une palette posee sur toutes les couleurs, arrets et tuiles compris
  { nom: 'couleurs-palette', dessin: peintures, operation: d => appliquerPalette(d, palette('hiver')?.couleurs ?? []) },
  { nom: 'couleurs-une-couleur', dessin: peintures, operation: d => uneCouleur(d, '#15181d') }
];
