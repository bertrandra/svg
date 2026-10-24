// Construit la page autonome de l'editeur : un seul fichier HTML qui embarque le moteur. vtracer n'y est
// plus : il vit dans dist/vtracer.js (scripts/vtracer.mjs), charge a la demande au premier trace.
//
// La page (outils/editeur-svg/page.html) ne calcule rien elle-meme : lecture, operations et ecriture
// du dessin viennent de src/, compiles ici en un script unique. Une regle changee dans le moteur
// change donc la page au prochain build, sans copie a tenir.
//
//   npm run construire         -> dist/editeur-svg.html

import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feuillesEditeur } from './feuilles.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const dossier = join(racine, 'outils/editeur-svg');

const { outputFiles } = await build({
  entryPoints: [join(dossier, 'entree.tsx')],
  bundle: true, format: 'iife', globalName: 'EditeurSvg', target: 'es2020', minify: true, write: false, jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' }
});
const moteur = outputFiles[0]?.text ?? '';
// Un `</script` dans le moteur fermerait la balise qui l'embarque.
if (moteur.includes('</script')) throw new Error('le moteur contient « </script » : la page serait coupee');

// Les styles de l'editeur vivent hors de la page (scripts/feuilles.mjs : les jetons viennent du registre
// src/styles/jetons.ts, ADR-0007, le reste de outils/editeur-svg/*.css), partages avec l'embarquement
// (scripts/embarquer.mjs) : la page les remet a leur place, entre ses propres regles, pour que la
// cascade reste celle d'avant.
const feuilles = await feuillesEditeur(racine);

const page = readFileSync(join(dossier, 'page.html'), 'utf8');
for (const repere of ['/*MOTEUR*/', '/*JETONS*/', '/*STYLE_BASE*/', '/*STYLE_EDITEUR*/']) {
  if (!page.includes(repere)) throw new Error('page.html ne porte plus le repere ' + repere);
}
mkdirSync(join(racine, 'dist'), { recursive: true });
const sortie = join(racine, 'dist/editeur-svg.html');
writeFileSync(sortie, page.replace('/*JETONS*/', () => feuilles.jetons).replace('/*STYLE_BASE*/', () => feuilles.base)
  .replace('/*STYLE_EDITEUR*/', () => feuilles.editeur).replace('/*MOTEUR*/', () => moteur));
console.log('Page construite : dist/editeur-svg.html (' + Math.round(moteur.length / 1024) + ' Ko de moteur).');
