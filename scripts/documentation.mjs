// Les documentations du menu Aide (zones/documentation.ts) : le guide complet et le mode Cricut, deux pages HTML autonomes posees
// dans dist/aide/, a cote de la page ; le site PHP les reprend dans public/aide/.
//
//   outils/aide/guide.html, cricut.html   le texte et la mise en page ; une image s'y ecrit src="img:<nom>"
//   outils/aide/images/<nom>.webp         les captures, faites sur l'application elle-meme (refaites a la main, jamais au build)
//
// Chaque page sort d'un seul tenant : images et fontes en data: URI (Instrument Sans et IBM Plex Mono comme l'interface, Fredoka
// pour les titres du mode Cricut). Ouvrir une documentation ne contacte donc aucun serveur, en file:// comme sur le site.
// Memes entrees, memes octets.
//
//   node scripts/documentation.mjs   (dans « npm run construire », avant le site PHP)

import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { base64DeFichier, depuisRacine, ecrireDansDist, enKo, annoncer, estLance } from './aide.mjs';
import { cssFontesInterface } from './fontes-interface.mjs';

const SOURCES = depuisRacine('outils/aide');
/** Les pages : la source, le fichier ecrit sous dist/aide, et ce qu'elle embarque de plus que les fontes de l'interface. */
export const DOCUMENTATIONS = [
  { source: 'guide.html', sortie: 'aide/guide.html', fredoka: false },
  { source: 'cricut.html', sortie: 'aide/cricut.html', fredoka: true }
];

/** Fredoka, les titres du mode Cricut : la fonte livree par @expo-google-fonts (la meme que celle du texte de l'editeur). */
function cssFredoka() {
  return [600, 700].map(g => {
    const nom = g === 600 ? '600SemiBold' : '700Bold';
    return '@font-face { font-family: "Fredoka"; font-style: normal; font-weight: ' + g + '; font-display: swap; src: url(data:font/ttf;base64,'
      + base64DeFichier(depuisRacine('node_modules/@expo-google-fonts/fredoka', nom, 'Fredoka_' + nom + '.ttf')) + ') format("truetype"); }';
  }).join('\n');
}

/**
 * Une page complete : chaque `src="img:<nom>"` devient l'image en data: URI (une image absente arrete la construction en la
 * nommant), les @font-face en tete du premier <style>, et le squelette du document autour.
 */
export function composerDocumentation(d) {
  const images = new Set(readdirSync(SOURCES + '/images').filter(n => n.endsWith('.webp')).map(n => n.slice(0, -5)));
  let texte = readFileSync(SOURCES + '/' + d.source, 'utf8');
  texte = texte.replace(/src="img:([\w-]+)"/g, (_, nom) => {
    if (!images.has(nom)) throw new Error('outils/aide/' + d.source + ' : l’image « ' + nom + ' » manque dans outils/aide/images.');
    return 'src="data:image/webp;base64,' + base64DeFichier(SOURCES + '/images/' + nom + '.webp') + '"';
  });
  if (!texte.includes('<style>')) throw new Error('outils/aide/' + d.source + ' : pas de <style> où poser les fontes.');
  const fontes = cssFontesInterface() + (d.fredoka ? '\n' + cssFredoka() : '');
  texte = texte.replace('<style>', '<style>\n' + fontes + '\n');
  const [tete, corps] = coupe(texte, d.source);
  return '<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    + tete + '</head>\n<body>\n' + corps + '</body>\n</html>\n';
}

/** La tete (titre et styles, jusqu'a la fin du premier <style>) et le corps de la source. */
function coupe(texte, source) {
  const fin = texte.indexOf('</style>');
  if (fin < 0) throw new Error('outils/aide/' + source + ' : <style> sans fin.');
  return [texte.slice(0, fin + '</style>\n'.length), texte.slice(fin + '</style>\n'.length)];
}

export function construireDocumentation() {
  mkdirSync(depuisRacine('dist/aide'), { recursive: true });
  let total = 0;
  for (const d of DOCUMENTATIONS) { const page = composerDocumentation(d); ecrireDansDist(d.sortie, page); total += page.length; }
  return total;
}

if (estLance(import.meta.url)) {
  const total = construireDocumentation();
  annoncer('Documentations construites', 'aide/', DOCUMENTATIONS.length + ' pages, ' + enKo(total) + ' Ko');
}
