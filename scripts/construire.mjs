// Construit la page autonome de l'editeur : un seul fichier HTML qui embarque le moteur. vtracer n'y est
// plus : il vit dans dist/vtracer.js (scripts/vtracer.mjs), charge a la demande au premier trace.
//
// La page (outils/editeur-svg/page.html) ne calcule rien elle-meme : lecture, operations et ecriture
// du dessin viennent de src/, compiles ici en un script unique. Une regle changee dans le moteur
// change donc la page au prochain build, sans copie a tenir.
//
//   npm run construire         -> dist/editeur-svg.html

import { readFileSync } from 'node:fs';
import { annoncer, depuisRacine, ecrireDansDist, empaqueter, enKo, refuserFinDeScript } from './aide.mjs';
import { feuillesEditeur } from './feuilles.mjs';

// La version du produit (package.json) entre dans la page pour la boite « A propos et credits » (src/zones/produit.ts).
const version = JSON.parse(readFileSync(depuisRacine('package.json'), 'utf8')).version;

const moteur = await empaqueter({
  entryPoints: [depuisRacine('outils/editeur-svg/entree.tsx')],
  bundle: true, format: 'iife', globalName: 'EditeurSvg', target: 'es2020', minify: true, jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"', VERSION_PRODUIT: JSON.stringify(version) }
});
// Un `</script` dans le moteur fermerait la balise qui l'embarque.
refuserFinDeScript(moteur, 'le moteur');

// Les styles de l'editeur vivent hors de la page (scripts/feuilles.mjs : les jetons viennent du registre
// src/styles/jetons.ts, ADR-0007, le reste de outils/editeur-svg/*.css), partages avec l'embarquement
// (scripts/embarquer.mjs) : la page les remet a leur place, entre ses propres regles, pour que la
// cascade reste celle d'avant.
const feuilles = await feuillesEditeur();

const page = readFileSync(depuisRacine('outils/editeur-svg/page.html'), 'utf8');
for (const repere of ['/*MOTEUR*/', '/*JETONS*/', '/*STYLE_BASE*/', '/*STYLE_EDITEUR*/']) {
  if (!page.includes(repere)) throw new Error('page.html ne porte plus le repere ' + repere);
}
ecrireDansDist('editeur-svg.html', page.replace('/*JETONS*/', () => feuilles.jetons).replace('/*STYLE_BASE*/', () => feuilles.base)
  .replace('/*STYLE_EDITEUR*/', () => feuilles.editeur).replace('/*MOTEUR*/', () => moteur));
annoncer('Page construite', 'editeur-svg.html', enKo(moteur.length) + ' Ko de moteur');
