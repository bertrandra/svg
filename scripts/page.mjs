// L'assemblage de la page autonome : outils/editeur-svg/page.html, ou l'on remet a leur place le moteur, les feuilles
// de style et les fontes de l'interface. Un seul endroit le sait, pour que le build (construire.mjs) et le test qui
// prouve que la page ne contacte aucun hote (tests/unit/depot/page-hors-ligne.test.ts) lisent la meme page.

import { readFileSync } from 'node:fs';
import { depuisRacine } from './aide.mjs';
import { cssFontesInterface } from './fontes-interface.mjs';
import { feuillesEditeur } from './feuilles.mjs';

/** Les reperes que page.html doit porter, dans l'ordre ou ils sont remplaces. */
export const REPERES_PAGE = ['/*FONTES*/', '/*JETONS*/', '/*STYLE_BASE*/', '/*STYLE_EDITEUR*/', '/*MOTEUR*/'];

/** La page autonome complete, avec `moteur` (le script compile) a la place du repere MOTEUR. */
export async function composerPage(moteur) {
  const feuilles = await feuillesEditeur();
  const page = readFileSync(depuisRacine('outils/editeur-svg/page.html'), 'utf8');
  for (const repere of REPERES_PAGE) {
    if (!page.includes(repere)) throw new Error('page.html ne porte plus le repere ' + repere);
  }
  // Des fonctions de remplacement : le texte insere (du JavaScript, du base64) contient des `$` que String.replace lirait.
  return page.replace('/*FONTES*/', () => cssFontesInterface()).replace('/*JETONS*/', () => feuilles.jetons).replace('/*STYLE_BASE*/', () => feuilles.base)
    .replace('/*STYLE_EDITEUR*/', () => feuilles.editeur).replace('/*MOTEUR*/', () => moteur);
}
