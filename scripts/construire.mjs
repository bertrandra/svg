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
import { composerPage } from './page.mjs';

// La version du produit (package.json) entre dans la page pour la boite « A propos et credits » (src/zones/produit.ts).
const paquet = JSON.parse(readFileSync(depuisRacine('package.json'), 'utf8'));
const version = paquet.version;
// Le depot declare par package.json : le panneau des integrateurs de l'accueil y renvoie vers docs/integration.md
// (src/zones/produit.ts, depotProduit). Une valeur declaree, jamais une adresse inventee ; sans elle, la page renvoie a une ancre.
const depot = typeof paquet.repository === 'object' && paquet.repository !== null ? String(paquet.repository.url ?? '') : String(paquet.repository ?? '');

const moteur = await empaqueter({
  entryPoints: [depuisRacine('outils/editeur-svg/entree.tsx')],
  bundle: true, format: 'iife', globalName: 'EditeurSvg', target: 'es2020', minify: true, jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"', VERSION_PRODUIT: JSON.stringify(version), DEPOT_PRODUIT: JSON.stringify(depot) }
});
// Un `</script` dans le moteur fermerait la balise qui l'embarque.
refuserFinDeScript(moteur, 'le moteur');

// Les styles de l'editeur vivent hors de la page (scripts/feuilles.mjs : les jetons viennent du registre
// src/styles/jetons.ts, ADR-0007, le reste de outils/editeur-svg/*.css), partages avec l'embarquement
// (scripts/embarquer.mjs) ; les fontes de l'interface sont des data: URI (scripts/fontes-interface.mjs). Tout est remis a sa
// place par scripts/page.mjs, entre les propres regles de la page, pour que la cascade reste celle d'avant.
const page = await composerPage(moteur);
ecrireDansDist('editeur-svg.html', page);
annoncer('Page construite', 'editeur-svg.html', enKo(moteur.length) + ' Ko de moteur, ' + enKo(page.length) + ' Ko en tout');
