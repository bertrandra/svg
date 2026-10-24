// Construit dist/polices.js : neuf fontes libres (licence SIL OFL 1.1), en base64, posees dans un
// script que la page charge a la demande, comme la bibliotheque. Ouvert depuis le disque, un fetch
// serait refuse ; une balise <script> passe.
//
//   npm run polices            -> dist/polices.js

import { annoncer, base64DeFichier, depuisRacine, ecrireDansDist, enKo, estLance, refuserFinDeScript } from './aide.mjs';

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
  const liste = POLICES.map(([id, nom, chemin]) => ({ id, nom, base64: base64DeFichier(depuisRacine('node_modules/@expo-google-fonts', chemin)) }));
  const texte = 'window.__policesSvg=' + JSON.stringify(liste) + ';';
  refuserFinDeScript(texte, 'les polices');
  ecrireDansDist('polices.js', texte);
  return { polices: liste.length, octets: texte.length };
}

if (estLance(import.meta.url)) {
  const r = construirePolices();
  annoncer('Polices construites', 'polices.js', r.polices + ' fontes, ' + enKo(r.octets) + ' Ko');
}
