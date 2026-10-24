// L'assemblage des feuilles de style de l'editeur, partage par la page (construire.mjs) et par
// l'embarquement (embarquer.mjs) : un seul endroit sait d'ou elles viennent.
//
//   jetons.css  les variables de couleur (themes clair et sombre, police)
//   base.css    les regles d'element de l'interface (boutons, champs, ...)
//   editeur.css l'editeur lui-meme, avec ce que la page lui partage (bibliotheque, message, apparition)
//
// La page les remet a leur place, entre ses propres regles (page.html : /*JETONS*/, /*STYLE_BASE*/,
// /*STYLE_EDITEUR*/), pour que la cascade reste celle d'avant ; l'embarquement les concatene.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function feuillesEditeur(racine) {
  const lire = fichier => readFileSync(join(racine, 'outils/editeur-svg', fichier), 'utf8');
  return { jetons: lire('jetons.css'), base: lire('base.css'), editeur: lire('editeur.css') };
}
