// L'assemblage des feuilles de style de l'editeur, partage par la page (construire.mjs) et par
// l'embarquement (embarquer.mjs) : un seul endroit sait d'ou elles viennent.
//
//   jetons   les variables de couleur, generees depuis le registre src/styles/jetons.ts (ADR-0007)
//   base     outils/editeur-svg/base.css : les regles d'element de l'interface (boutons, champs, ...)
//   editeur  outils/editeur-svg/editeur.css : l'editeur lui-meme, avec ce que la page lui partage
//
// La page les remet a leur place, entre ses propres regles (page.html : /*JETONS*/, /*STYLE_BASE*/,
// /*STYLE_EDITEUR*/), pour que la cascade reste celle d'avant ; l'embarquement les concatene.

import { readFileSync } from 'node:fs';
import { depuisRacine, empaqueter } from './aide.mjs';

/** Le CSS des jetons, tel que le registre le genere : on compile le registre et on l'importe. */
async function cssDesJetons() {
  const code = await empaqueter({ entryPoints: [depuisRacine('src/styles/jetons.ts')], bundle: true, format: 'esm', target: 'es2020' });
  const { cssJetons } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  return cssJetons();
}

export async function feuillesEditeur() {
  const lire = fichier => readFileSync(depuisRacine('outils/editeur-svg', fichier), 'utf8');
  return { jetons: await cssDesJetons(), base: lire('base.css'), editeur: lire('editeur.css') };
}
