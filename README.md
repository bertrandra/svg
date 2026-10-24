# svg

Un éditeur SVG qui tient dans une page, un convertisseur d'image en SVG, et une bibliothèque de
4 000 formes classées par événement. Le tout se calcule dans le navigateur, sans serveur, et
s'embarque aussi comme composant React dans un autre produit.

## Ce que fait la page

- **Ouvrir un SVG** : un fichier déposé, un code collé, ou l'exemple.
- **Convertir une image en SVG** : PNG, JPG, GIF ou WebP, affiché dès le dépôt, fond détouré
  (tolérance et portée réglables), puis vectorisé par vtracer (modes aplats, trait, fidèle ; trois
  grains) ou enveloppé tel quel. Un atelier sous le dépôt montre l'image et son tracé (rideau de
  comparaison, rendu, contours, zoom, fond), expose huit réglages fins du traceur qui se rejouent à
  chaque changement, et garde les huit derniers essais pour comparer et revenir. Le résultat se
  télécharge, se copie, s'ouvre dans l'éditeur.
- **Choisir une forme** dans la bibliothèque : 4 134 silhouettes nommées en français, cherchées par
  nom et par événement du calendrier (Noël, Pâques, Halloween, 14 Juillet…), de la vie
  (naissance, anniversaire, mariage, concert…) ou par catégorie (personnage, bâtiment, animal…).
- **Éditer en plein écran** comme dans un logiciel de dessin :
  - sélection au clic ou au cadre, Tout et Aucun, déplacement, coins pour redimensionner (Maj :
    proportions) ; une rangée contextuelle avec alignements, miroirs, rotations, empilement,
    combiner, séparer, dupliquer, masquer, verrouiller, supprimer ;
  - copier, couper, coller ; les couleurs courantes dans la barre ; une grille magnétique ; le zoom
    sur la sélection ; les raccourcis d'un logiciel de dessin (Ctrl+S, Ctrl+C/X/V, Ctrl+G, G, Z…) ;
  - outils de tracé : rectangle, ellipse, étoile, ligne, plume ; texte en formes (neuf fontes libres
    ou la vôtre), une forme par lettre ;
  - booléens : union, soustraction, intersection, exclusion ;
  - aimants vers les bords et centres des autres formes, transformations numériques (rotation,
    inclinaison, échelle) et poignée de rotation ;
  - recoloration par palettes d'événements, par le nuancier ou d'une seule couleur ;
  - points et poignées : glisser une ancre, tirer une poignée, ajouter un point sans changer la
    courbe, redresser ou courber un segment, retirer un point ;
  - couleurs : sélecteur, code, nuancier, remplacement d'une couleur partout ;
  - nettoyage du tracé : poussières sous un seuil, voisines de même couleur regroupées si le rendu
    reste identique, plan de travail ajusté ;
  - insertion d'une forme de la bibliothèque au centre du dessin, d'un panier en grille, ou d'une
    scène prête par événement ;
  - versions nommées, et reprise du dessin après un rechargement ;
  - annuler et rétablir chaque geste (Ctrl+Z, Ctrl+Maj+Z) ; zoom, main, vue contours, fonds.
- **Récupérer le résultat** : SVG, SVG de découpe (contours seuls), PNG à la largeur voulue, PDF
  vectoriel, copie du code. Rien ne quitte le navigateur.
- **Sur tablette et mobile** : barres qui défilent, panneaux en tiroirs, zoom à deux doigts.

Ce que l'éditeur refuse, en le nommant : texte, image, dégradé, masque, découpe, filtre, `<use>`.
On n'édite pas ce qu'on ne saurait pas réécrire ; une image se vectorise d'abord.

## Démarrer

Prérequis : Node 20 ou plus.

```bash
npm ci
npm run verifier     # typecheck + lint + cliquet + tests : ce que lance la CI
npm run construire   # dist/editeur-svg.html (la page), dist/vtracer.js, dist/bibliotheque.js, dist/polices.js
npm run e2e          # les tests de navigateur (Chromium), après construire
```

| Commande | Ce qu'elle fait |
|---|---|
| `npm run typecheck` | `tsc --noEmit`, configuration stricte complète |
| `npm run lint` | Aucun `any` dans le moteur, aucune assertion `!`, aucune fonction de plus de 150 lignes |
| `npm run cliquet` | Aucun dossier ne régresse en typage |
| `npm test` | Couches, cycles, pureté du cœur, lecture et écriture du dessin, opérations, points, historique, vectorisation réelle, bibliothèque entière |
| `npm run construire` | La page, le traceur, la bibliothèque et les fontes, dans `dist/` |
| `npm run vtracer` | Le traceur seul : `dist/vtracer.js` |
| `npm run e2e` | 68 tests de navigateur (Playwright dans vitest) sur la page construite ; `CHROMIUM_PATH` facultatif ; hors `npm test` |
| `npm run bibliotheque` | La bibliothèque seule : `dist/bibliotheque.js` |
| `npm run polices` | Les neuf fontes seules : `dist/polices.js` |

La page construite s'ouvre telle quelle dans un navigateur, depuis le disque ou un serveur
statique ; `vtracer.js` (0,9 Mo), `bibliotheque.js` (7 Mo) et `polices.js` (2,7 Mo) doivent rester à côté
d'elle, ils se chargent à la demande (au premier tracé, à l'ouverture de la bibliothèque, au premier texte).

## Embarquer l'éditeur

```tsx
import { EditeurSvg } from './src/zones/EditeurSvg.js';

<EditeurSvg
  svg={texteSvg}                                  // le SVG a retoucher
  titre="logo.svg" nom="logo"                     // le titre de la fenetre, le nom du fichier propose
  nuancier={[{ nom: 'Rouge', hex: '#c81e28' }]}   // facultatif : les couleurs proposees
  bibliotheque="a-charger"                        // facultatif : la bibliotheque, chargee au premier besoin
  fermer={() => …}
  enregistrer={svg => …}                          // le SVG retouche, deja passe par nettoyerSvg
/>
```

Le composant se pose en portail par-dessus la page et attend les styles de
`outils/editeur-svg/page.html` (les classes `editeur-*` et les jetons `--table`, `--panneau`,
`--encre`, `--encre-douce`, `--filet`, `--cyan`, `--sur-cyan`, `--alerte`, `--alerte-fond`,
`--echec`, `--mono`). `BoutonEditerSvg` l'ouvre depuis un bouton, grisé quand le SVG enveloppe une
image. Le moteur seul (`src/engine/editionSvg.ts`) s'utilise sans React ni DOM.

## Organisation du dépôt

| Chemin | Rôle |
|---|---|
| `src/util/` | Primitives pures : lecture XML sans DOM, nettoyage d'un SVG, historique immuable, couleur (OKLab), lecture indexée sûre (`au`) |
| `src/model/` | La bibliothèque : le lexique anglais → français, les événements et leurs règles, le nom et le classement d'une forme |
| `src/engine/` | Le dessin à plat (`editionSvg.ts`), les booléens, les transformations et aimants, le texte en formes, les palettes, le détourage, l'extraction des couleurs, les réglages de vectorisation. Pur : ni DOM, ni réseau, ni horloge |
| `src/export/` | Le PDF vectoriel et le SVG de découpe. Pur |
| `src/io/` | Ce qui touche au navigateur : décoder une image, rendre un PNG, appeler vtracer (WASM), charger la bibliothèque et les fontes, télécharger, copier |
| `src/zones/` | `EditeurSvg.tsx` (le composant), `BarreOutils.tsx` (ses barres), `Menu.tsx` et `Section.tsx`, ses panneaux (`Texte`, `Palettes`, `Versions`, `Exporter`), `Vectoriser.tsx`, `Bibliotheque.tsx`, `Application.tsx` (la page), `session.ts` |
| `bibliotheque/` | `corrections.json` : les corrections de nom et de classement posées à la main, appliquées à la construction |
| `outils/editeur-svg/` | La page et son point d'entrée ; `scripts/construire.mjs` y embarque le moteur, `scripts/bibliotheque.mjs` construit la bibliothèque |
| `tests/unit/` | Un dossier par couche de `src/`, plus `architecture.test.ts` |
| `src/styles/` | Le registre des jetons de couleur de l'interface (rôle, clair, sombre, contrastes), d'où le CSS se génère |
| `docs/adr/` | Les décisions, une par fichier ; `docs/jetons.md` : les jetons, générés |

Les couches vont de `util` à `zones` : `util/shell` → `geometry` → `model/plateforme` → `engine` →
`core/io/render/export/interaction` → `ui` → `app/zones`, jamais dans l'autre sens, et le cœur pur
(`util`, `model`, `engine`) ne touche ni au DOM, ni à l'horloge, ni au hasard, ni au réseau. Un test
l'impose.

## Sources et licences

- Les formes de la bibliothèque viennent de [game-icons.net](https://game-icons.net), licence
  [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), par le paquet `@iconify-json/game-icons`.
- La vectorisation emploie [vtracer](https://github.com/visioncortex/vtracer) (Vision Cortex),
  compilé en WebAssembly, par le paquet `@visioncortex/vtracer`.
- Les booléens emploient [polygon-clipping](https://github.com/mfogel/polygon-clipping) (MIT) ; le
  texte, [opentype.js](https://opentype.js.org) (MIT) et neuf fontes sous licence SIL OFL 1.1
  (Inter, Oswald, Bebas Neue, Playfair Display, Lobster, Pacifico, Caveat, Fredoka), par les paquets
  `@expo-google-fonts/*`.
