// Construit dist/polices.js : neuf fontes libres (licence SIL OFL 1.1), en base64, posees dans un
// script que la page charge a la demande, comme la bibliotheque. Ouvert depuis le disque, un fetch
// serait refuse ; une balise <script> passe.
//
//   npm run polices            -> dist/polices.js

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');

export const POLICES = [
  ['inter', 'Inter', 'inter/400Regular/Inter_400Regular.ttf'],
  ['inter-gras', 'Inter gras', 'inter/700Bold/Inter_700Bold.ttf'],
  ['oswald', 'Oswald', 'oswald/500Medium/Oswald_500Medium.ttf'],
  ['bebas', 'Bebas Neue', 'bebas-neue/400Regular/BebasNeue_400Regular.ttf'],
  ['playfair', 'Playfair Display gras', 'playfair-display/700Bold/PlayfairDisplay_700Bold.ttf'],
  ['lobster', 'Lobster', 'lobster/400Regular/Lobster_400Regular.ttf'],
  ['pacifico', 'Pacifico', 'pacifico/400Regular/Pacifico_400Regular.ttf'],
  ['caveat', 'Caveat gras', 'caveat/700Bold/Caveat_700Bold.ttf'],
  ['fredoka', 'Fredoka', 'fredoka/600SemiBold/Fredoka_600SemiBold.ttf']
];

export function construirePolices() {
  const liste = POLICES.map(([id, nom, chemin]) => ({ id, nom, base64: readFileSync(join(racine, 'node_modules/@expo-google-fonts', chemin)).toString('base64') }));
  const texte = 'window.__policesSvg=' + JSON.stringify(liste) + ';';
  mkdirSync(join(racine, 'dist'), { recursive: true });
  writeFileSync(join(racine, 'dist/polices.js'), texte);
  return { polices: liste.length, octets: texte.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = construirePolices();
  console.log('Polices construites : dist/polices.js (' + r.polices + ' fontes, ' + Math.round(r.octets / 1024) + ' Ko).');
}
