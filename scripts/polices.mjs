// Construit dist/polices.js : neuf fontes libres (licence SIL OFL 1.1), en base64, posees dans un
// script que la page charge a la demande, comme la bibliotheque. Ouvert depuis le disque, un fetch
// serait refuse ; une balise <script> passe.
//
// S'y ajoutent les fontes a trait unique (ADR-0022) : des polices SVG d'Evil Mad Scientist (SIL OFL 1.1), livrees par le
// paquet hersheytext, dont chaque glyphe est un trace OUVERT (la course d'une plume). opentype.js ne lit pas une police
// SVG, et une fonte TrueType ne sait pas dire un trace ouvert : on en garde les glyphes tels quels, en donnees.
//
//   npm run polices            -> dist/polices.js

import { readFileSync } from 'node:fs';
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

/** Les fontes a trait unique : identifiant, nom, paquet et fichier de police SVG. */
export const POLICES_TRAIT = [
  ['ems-readability', 'EMS Readability (trait unique)', 'hersheytext', 'svg_fonts/EMSReadability.svg']
];

const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decoder = t => t.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITES[e.toLowerCase()]));
const attribut = (balise, nom) => { const m = new RegExp('\\s' + nom + '="([^"]*)"').exec(balise); return m ? decoder(m[1]) : undefined; };

/**
 * Les glyphes d'une police SVG : l'unite d'em, l'avance par defaut et, par caractere, son avance et son trace (« M x y L x y »,
 * en absolu, Y vers le haut comme dans la police). Seuls les glyphes d'un seul caractere sont gardes (pas de ligature).
 */
export function lirePoliceSvg(texte) {
  const police = /<font\b[^>]*>/.exec(texte)?.[0] ?? '', face = /<font-face\b[^>]*>/.exec(texte)?.[0] ?? '';
  const avance = Number(attribut(police, 'horiz-adv-x') ?? 500), unitesParEm = Number(attribut(face, 'units-per-em') ?? 1000);
  const glyphes = [];
  for (const [balise] of texte.matchAll(/<glyph\b[^>]*>/g)) {
    const c = attribut(balise, 'unicode');
    if (c === undefined || [...c].length !== 1) continue;
    glyphes.push([c, Number(attribut(balise, 'horiz-adv-x') ?? avance), (attribut(balise, 'd') ?? '').trim().replace(/\s+/g, ' ')]);
  }
  return { unitesParEm, avance, glyphes };
}

export function construirePolices() {
  const liste = [
    ...POLICES.map(([id, nom, chemin]) => ({ id, nom, base64: base64DeFichier(depuisRacine('node_modules/@expo-google-fonts', chemin)) })),
    ...POLICES_TRAIT.map(([id, nom, paquet, chemin]) => ({ id, nom, nature: 'trait', ...lirePoliceSvg(readFileSync(depuisRacine('node_modules', paquet, chemin), 'utf8')) }))
  ];
  const texte = 'window.__policesSvg=' + JSON.stringify(liste) + ';';
  refuserFinDeScript(texte, 'les polices');
  ecrireDansDist('polices.js', texte);
  return { polices: liste.length, octets: texte.length };
}

if (estLance(import.meta.url)) {
  const r = construirePolices();
  annoncer('Polices construites', 'polices.js', r.polices + ' fontes, ' + enKo(r.octets) + ' Ko');
}
