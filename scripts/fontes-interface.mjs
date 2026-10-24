// Les fontes de l'interface de la page autonome (Instrument Sans, IBM Plex Mono), servies SANS reseau : le sous-ensemble
// latin en WOFF2, pris tel quel dans les paquets @fontsource (le meme decoupage que Google Fonts), pose en data: URI
// dans un @font-face de la page.
//
// Pourquoi : la page chargeait ces fontes chez Google (<link> vers fonts.googleapis.com), ce qui envoyait l'adresse IP
// de la personne a un tiers des l'ouverture et contredisait « Rien ne quitte votre navigateur ». Une data: URI n'est
// pas une requete : la page n'a plus aucun hote tiers a contacter. Le bundle d'embarquement, lui, ne les embarque
// pas (il reste sans fontes propres, voir docs/integration.md) : seule la page les porte.
//
// Le sous-ensemble est le latin seul (U+0000-00FF, oe, guillemets, tirets, euro...) : tout le francais y est. Le latin
// etendu (polonais, tcheque...) coute 54 Ko de plus et n'est pas dans l'interface, qui est en francais ; un nom de
// fichier en polonais retombe, caractere par caractere, sur la pile systeme de --sans / --mono.

import { readFileSync } from 'node:fs';
import { base64DeFichier, depuisRacine } from './aide.mjs';

/** Les familles embarquees : le paquet, la famille CSS telle que jetons.ts la nomme, les graisses que l'interface utilise. */
export const FONTES_INTERFACE = [
  { paquet: '@fontsource/instrument-sans', fichier: 'instrument-sans', famille: 'Instrument Sans', graisses: [400, 500, 600, 700] },
  { paquet: '@fontsource/ibm-plex-mono', fichier: 'ibm-plex-mono', famille: 'IBM Plex Mono', graisses: [400, 500] }
];

/** La plage de caracteres du sous-ensemble latin, telle que le paquet la declare (unicode.json). */
function plageLatin(dossier) {
  const plages = JSON.parse(readFileSync(depuisRacine('node_modules', dossier, 'unicode.json'), 'utf8'));
  if (typeof plages.latin !== 'string') throw new Error(dossier + ' : unicode.json ne porte pas de sous-ensemble latin');
  return plages.latin;
}

/** Le chemin d'un fichier WOFF2 latin d'une famille et d'une graisse, sous node_modules. */
export const cheminFonte = (f, graisse) => depuisRacine('node_modules', f.paquet, 'files', f.fichier + '-latin-' + graisse + '-normal.woff2');

/**
 * Le CSS des @font-face de la page : un par famille et par graisse, source en data: URI uniquement. `font-display: swap`
 * n'a pas d'effet visible (la source est dans la page) mais garde un texte lisible si le decodage tarde.
 */
export function cssFontesInterface() {
  const regles = [];
  for (const f of FONTES_INTERFACE) {
    const plage = plageLatin(f.paquet);
    for (const graisse of f.graisses) {
      regles.push(
        '@font-face { font-family: "' + f.famille + '"; font-style: normal; font-weight: ' + graisse + '; font-display: swap; ' +
        'src: url(data:font/woff2;base64,' + base64DeFichier(cheminFonte(f, graisse)) + ') format("woff2"); unicode-range: ' + plage + '; }'
      );
    }
  }
  return '/* Les fontes de l\'interface, en data: URI : aucune requete (scripts/fontes-interface.mjs). */\n' + regles.join('\n');
}
