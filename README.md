# svg

Un éditeur SVG qui tient dans une page, un convertisseur d'image en SVG, et une bibliothèque de
4 000 formes classées par événement. Le tout se calcule dans le navigateur, sans serveur, et
s'embarque aussi comme composant React dans un autre produit.

## Ce que fait la page

- **Ouvrir un SVG** : un fichier déposé, un code collé, ou l'exemple.
- **Convertir une image en SVG** : PNG, JPG, GIF ou WebP, fond détouré (tolérance réglable), puis
  vectorisé par vtracer (modes aplats, trait, fidèle ; trois grains) ou enveloppé tel quel. Le
  résultat se voit en rendu et en contours, se télécharge, se copie, s'ouvre dans l'éditeur.
- **Choisir une forme** dans la bibliothèque : 4 134 silhouettes nommées en français, cherchées par
  nom et par événement du calendrier (Noël, Pâques, Halloween, 14 Juillet…), de la vie
  (naissance, anniversaire, mariage, concert…) ou par catégorie (personnage, bâtiment, animal…).
- **Éditer en plein écran** comme dans un logiciel de dessin :
  - sélection au clic ou au cadre, Tout et Aucun, déplacement, coins pour redimensionner (Maj :
    proportions), miroirs, rotations, alignements, empilement, dupliquer, masquer, verrouiller,
    supprimer ;
  - outils de tracé : rectangle, ellipse, étoile, ligne, plume ;
  - points et poignées : glisser une ancre, tirer une poignée, ajouter un point sans changer la
    courbe, redresser ou courber un segment, retirer un point ;
  - couleurs : sélecteur, code, nuancier, remplacement d'une couleur partout ;
  - nettoyage du tracé : poussières sous un seuil, voisines de même couleur regroupées si le rendu
    reste identique, plan de travail ajusté ;
  - insertion d'une forme de la bibliothèque au centre du dessin ;
  - annuler et rétablir chaque geste (Ctrl+Z, Ctrl+Maj+Z) ; zoom, main, vue contours, fonds.
- **Récupérer le résultat** : aperçu, téléchargement, copie du code. Rien ne quitte le navigateur.

Ce que l'éditeur refuse, en le nommant : texte, image, dégradé, masque, découpe, filtre, `<use>`.
On n'édite pas ce qu'on ne saurait pas réécrire ; une image se vectorise d'abord.

## Démarrer

Prérequis : Node 20 ou plus.

```bash
npm ci
npm run verifier     # typecheck + lint + cliquet + tests : ce que lance la CI
npm run construire   # dist/editeur-svg.html (la page, vtracer compris) et dist/bibliotheque.js
```

| Commande | Ce qu'elle fait |
|---|---|
| `npm run typecheck` | `tsc --noEmit`, configuration stricte complète |
| `npm run lint` | Aucun `any` dans le moteur, aucune assertion `!`, aucune fonction de plus de 150 lignes |
| `npm run cliquet` | Aucun dossier ne régresse en typage |
| `npm test` | Couches, cycles, pureté du cœur, lecture et écriture du dessin, opérations, points, historique, vectorisation réelle, bibliothèque entière |
| `npm run construire` | La page autonome et la bibliothèque, dans `dist/` |
| `npm run bibliotheque` | La bibliothèque seule : `dist/bibliotheque.js` |

La page construite s'ouvre telle quelle dans un navigateur, depuis le disque ou un serveur
statique ; `bibliotheque.js` doit rester à côté d'elle, il se charge à la demande (7 Mo).

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
| `src/engine/` | Le dessin à plat (`editionSvg.ts`), le détourage, l'extraction des couleurs, les réglages de vectorisation. Pur : ni DOM, ni réseau, ni horloge |
| `src/io/` | Ce qui touche au navigateur : décoder une image, appeler vtracer (WASM), charger la bibliothèque, télécharger, copier |
| `src/zones/` | `EditeurSvg.tsx` (le composant), `Vectoriser.tsx`, `Bibliotheque.tsx`, `Application.tsx` (la page) |
| `outils/editeur-svg/` | La page et son point d'entrée ; `scripts/construire.mjs` y embarque le moteur, `scripts/bibliotheque.mjs` construit la bibliothèque |
| `tests/unit/` | Un dossier par couche de `src/`, plus `architecture.test.ts` |
| `docs/adr/` | Les décisions, une par fichier |

Les couches vont de `util` à `zones` : `util/shell` → `geometry` → `model/plateforme` → `engine` →
`core/io/render/export/interaction` → `ui` → `app/zones`, jamais dans l'autre sens, et le cœur pur
(`util`, `model`, `engine`) ne touche ni au DOM, ni à l'horloge, ni au hasard, ni au réseau. Un test
l'impose.

## Sources et licences

- Les formes de la bibliothèque viennent de [game-icons.net](https://game-icons.net), licence
  [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), par le paquet `@iconify-json/game-icons`.
- La vectorisation emploie [vtracer](https://github.com/visioncortex/vtracer) (Vision Cortex),
  compilé en WebAssembly, par le paquet `@visioncortex/vtracer`.
