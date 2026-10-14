# svg

Le canvas SVG de [crea](https://github.com/bertrandra/crea), repris en dépôt à part : un éditeur
vectoriel plein écran qui tient dans une page, et un composant React qu'un autre produit embarque.
Il lit un SVG en formes à plat, le retouche comme un logiciel de dessin, et réécrit un SVG propre,
déterministe, au rendu identique.

Ce qu'il fait :

- **sélection** au clic ou au cadre, déplacement, coins pour redimensionner (Maj : proportions),
  miroirs, rotations, alignements, empilement, dupliquer, masquer, verrouiller, supprimer ;
- **points et poignées** : glisser une ancre (et son jumeau quand le tracé se referme sur elle), tirer
  une poignée, ajouter un point sans changer la courbe, redresser ou courber un segment, retirer un
  point ;
- **couleurs** : sélecteur, code, nuancier fourni par l'hôte, remplacement d'une couleur partout ;
- **nettoyage du tracé** : poussières sous un seuil, voisines de même couleur regroupées seulement si
  le rendu reste identique, plan de travail ajusté ;
- **annuler et rétablir** chaque geste (Ctrl+Z, Ctrl+Maj+Z) ; un glisser ne fait qu'une entrée ;
- zoom, main, vue contours, fonds damier, blanc ou sombre ; raccourcis d'un logiciel de dessin.

Ce qu'il refuse, en le nommant : texte, image, dégradé, masque, découpe, filtre, `<use>`. On
n'édite pas ce qu'on ne saurait pas réécrire.

## Démarrer

Prérequis : Node 20 ou plus.

```bash
npm ci
npm run verifier     # typecheck + lint + cliquet + tests : ce que lance la CI
npm run construire   # dist/editeur-svg.html, la page autonome
```

| Commande | Ce qu'elle vérifie |
|---|---|
| `npm run typecheck` | `tsc --noEmit`, configuration stricte complète |
| `npm run lint` | Aucun `any` dans le moteur, aucune assertion `!`, aucune fonction de plus de 150 lignes |
| `npm run cliquet` | Aucun dossier ne régresse en typage |
| `npm test` | Couches, cycles, pureté du cœur, lecture et écriture du dessin, opérations, points, historique |
| `npm run construire` | Construit `dist/editeur-svg.html` : la page, le moteur embarqué, aucun réseau |

La page construite s'ouvre telle quelle dans un navigateur. On y dépose un fichier SVG, on colle un
code, ou on ouvre l'exemple ; « Enregistrer » dans l'éditeur ramène à la page, où le résultat se
télécharge et se copie. Rien ne quitte le navigateur.

## Embarquer l'éditeur

```tsx
import { EditeurSvg } from './src/zones/EditeurSvg.js';

<EditeurSvg
  svg={texteSvg}                                  // le SVG a retoucher
  titre="logo.svg" nom="logo"                     // le titre de la fenetre, le nom du fichier propose
  nuancier={[{ nom: 'Rouge', hex: '#c81e28' }]}   // facultatif : les couleurs proposees
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
| `src/util/` | Primitives pures : lecture XML sans DOM, nettoyage d'un SVG, historique immuable, lecture indexée sûre (`au`) |
| `src/engine/editionSvg.ts` | Le dessin à plat : lecture d'un SVG en formes, opérations pures, points, couleurs, nettoyage, écriture |
| `src/io/` | Télécharger un fichier, copier un texte |
| `src/zones/` | `EditeurSvg.tsx` (le composant), `Application.tsx` (la page autonome), `nuancier.ts` |
| `outils/editeur-svg/` | La page et son point d'entrée ; `scripts/construire.mjs` y embarque le moteur |
| `tests/unit/` | Un dossier par couche de `src/`, plus `architecture.test.ts` |
| `docs/adr/` | Les décisions, une par fichier |

Les couches et leurs règles sont celles de crea (ADR-0001) : `util` → `engine` → `io` → `zones`,
jamais dans l'autre sens, et le cœur pur (`util`, `engine`) ne touche ni au DOM, ni à l'horloge,
ni au hasard, ni au réseau.
