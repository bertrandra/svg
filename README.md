# svg

Un éditeur SVG qui tient dans une page, un convertisseur d'image en SVG, et une bibliothèque de
4 000 formes classées par événement. Le tout se calcule dans le navigateur, sans serveur, et
s'embarque aussi comme composant React dans un autre produit.

## Ce que fait la page

- **Ouvrir un SVG ou un PDF** : un fichier déposé ou choisi, un code SVG collé, ou l'exemple ; d'un PDF, les tracés et le texte de la première page (ou de celle qu'on choisit) deviennent des formes, et ce qui n'est pas repris est dit (ADR-0020).
- **Convertir une image en SVG** : PNG, JPG, GIF ou WebP, affiché dès le dépôt, fond détouré
  (tolérance et portée réglables), puis vectorisé par vtracer (modes aplats, trait, fidèle ; trois
  grains) ou enveloppé tel quel. Un atelier sous le dépôt montre l'image et son tracé (rideau de
  comparaison, rendu, contours, zoom, fond), expose huit réglages fins du traceur qui se rejouent à
  chaque changement, et garde les huit derniers essais pour comparer et revenir. Le résultat se
  télécharge, se copie, s'ouvre dans l'éditeur. Le mode « Ligne médiane » change un dessin au trait en traces ouverts d'une
  seule ligne au milieu du trait, sans remplissage, pour le stylo d'une Cricut (moteur pur, sans vtracer ; ADR-0021).
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
  - booléens : union, soustraction, intersection, exclusion, avec les courbes rebâties (réglage du
    menu Édition) ;
  - aimants vers les bords et centres des autres formes, transformations numériques (rotation,
    inclinaison, échelle) et poignée de rotation ;
  - recoloration par palettes d'événements, par le nuancier ou d'une seule couleur ;
  - points et poignées : glisser une ancre, tirer une poignée, ajouter un point sans changer la
    courbe, redresser ou courber un segment, retirer un point ;
  - couleurs : sélecteur, code, nuancier, remplacement d'une couleur partout ; opacité du fond et du
    contour, bout, jonction et pointillés du trait ;
  - calques par couleur : choisir, masquer, verrouiller, isoler, combiner, supprimer, recolorer les
    formes d'une couleur, choisir ou fusionner les nuances proches ;
  - nettoyage du tracé : poussières sous un seuil, voisines de même couleur regroupées si le rendu
    reste identique, tracés simplifiés, plan de travail ajusté au trait réel ;
  - insertion d'une forme de la bibliothèque au centre du dessin, d'un panier en grille, ou d'une
    scène prête par événement ;
  - versions nommées, et reprise du dessin après un rechargement ;
  - annuler et rétablir chaque geste (Ctrl+Z, Ctrl+Maj+Z) ; zoom, main, vue contours, fonds.
- **Récupérer le résultat** : SVG, SVG de découpe (contours seuls), PNG à la largeur voulue, PDF
  vectoriel, copie du code. Rien ne quitte le navigateur, pas même l'adresse de la personne : la page autonome embarque ses fontes
  et ne contacte aucun serveur (un test en navigateur, réseau coupé, le vérifie).
- **Préparer pour une Cricut** : un contexte de production se choisit dans la barre (Joy, Explore, Maker ; tapis ;
  papier cartonné ; découpe ou Print Then Cut ; pouces ou millimètres). Le tapis et sa zone utile s’affichent sur la toile,
  le panneau « Prêt pour Cricut » juge le dessin en continu (traits, transparences, dépassement, tracés ouverts, nuances
  proches, parties trop fines…) et propose pour chaque constat une correction annulable ; « Exporter pour Cricut » écrit un
  SVG à taille physique, ou une archive Print Then Cut. Les valeurs encore à vérifier sur une machine sont dans
  [`docs/cricut/protocole.md`](docs/cricut/protocole.md) (ADR-0013).
- **Sur tablette et mobile** : barres qui défilent, panneaux en tiroirs, cibles de 40 px, zoom à deux
  doigts.
- **Au clavier et au lecteur d'écran** : Tab parcourt les formes, Alt+flèches redimensionnent,
  Ctrl+flèches tournent, un réticule piloté aux flèches pose formes et points ; une région vocale
  dit la sélection et chaque action ; le contraste forcé et les thèmes clair et sombre sont tenus
  (audits `axe-core` en test).
- **Gros dessins** : des milliers de formes et de couleurs restent fluides (listes fenêtrées,
  historique borné selon la taille).

Ce que l'éditeur refuse, en le nommant : texte, image, dégradé, masque, découpe, filtre, un `<use>` en cycle
ou renvoyant à un fichier extérieur. Un `<use>` ordinaire (planche d'icônes, `<symbol>`) se déplie en formes
indépendantes, et la feuille `<style>` se lit avec ses vrais sélecteurs ; ce qui n'est pas repris
(marqueurs, animations, `@media`…) est dit à l'ouverture.
On n'édite pas ce qu'on ne saurait pas réécrire ; une image se vectorise d'abord.

## Démarrer

Prérequis : Node 20 ou plus.

```bash
npm ci
npm run verifier     # typecheck + lint + cliquet + tests : ce que lance la CI
npm run construire   # dist/editeur-svg.html (la page), dist/vtracer.js, dist/bibliotheque.js, dist/polices.js, dist/editeur-svg-embarque.js
npm run e2e          # les tests de navigateur (Chromium ; NAVIGATEUR=firefox|webkit pour les autres), après construire
```

| Commande | Ce qu'elle fait |
|---|---|
| `npm run typecheck` | `tsc --noEmit`, configuration stricte complète |
| `npm run lint` | Aucun `any` dans le moteur, aucune assertion `!`, aucune fonction de plus de 150 lignes |
| `npm run cliquet` | Aucun dossier ne régresse en typage |
| `npm test` | Couches, cycles, pureté du cœur, lecture et écriture du dessin, opérations, points, historique, vectorisation réelle, bibliothèque entière |
| `npm run construire` | La page, le traceur, la bibliothèque et les fontes, dans `dist/` |
| `npm run vtracer` | Le traceur seul : `dist/vtracer.js` |
| `npm run embarquer` | Le script d'embarquement seul : `dist/editeur-svg-embarque.js` |
| `npm run e2e` | Plus de 270 tests de navigateur (Playwright dans vitest) sur la page construite ; `NAVIGATEUR` = `chromium` (défaut), `firefox` ou `webkit` ; `CHROMIUM_PATH` facultatif, pour Chromium seul ; hors `npm test`. Navigateurs promis : [`docs/navigateurs.md`](docs/navigateurs.md) ; vérification à la main : [`docs/verification-manuelle.md`](docs/verification-manuelle.md) |
| `npm run bibliotheque` | La bibliothèque seule : `dist/bibliotheque.js` |
| `npm run polices` | Les neuf fontes seules : `dist/polices.js` |

La page construite s'ouvre telle quelle dans un navigateur, depuis le disque ou un serveur
statique ; `vtracer.js` (0,9 Mo), `bibliotheque.js` (7 Mo) et `polices.js` (2,7 Mo) doivent rester à côté
d'elle, ils se chargent à la demande (au premier tracé, à l'ouverture de la bibliothèque, au premier texte).

## Embarquer l'éditeur

Le guide complet est dans [`docs/integration.md`](docs/integration.md) ; une démonstration tourne
depuis le disque dans [`exemples/integration.html`](exemples/integration.html). Trois voies : l'iframe
de la page entière, un script classique, ou le composant React.

```html
<script src="editeur-svg-embarque.js"></script>
<script>
  const editeur = EditeurSvg.ouvrir({
    svg: texteSvg,                       // le SVG à retoucher
    nom: 'logo',                         // le nom du fichier proposé
    nuancier: [{ nom: 'Rouge', hex: '#c81e28' }],   // facultatif
    bibliotheque: 'a-charger',           // facultatif : chargée au premier besoin
    onEnregistrer: svg => { … },         // le SVG retouché, déjà passé par nettoyerSvg
    onFermer: () => { … }                // facultatif
  });
</script>
```

`dist/editeur-svg-embarque.js` (`npm run embarquer`, 0,7 Mo) amène ses propres styles, cantonnés à
l'éditeur, et lit les jetons de couleur de `src/styles/jetons.ts`. `bibliotheque.js` et `polices.js`
se posent à côté de la page de l'hôte, ou sous une adresse donnée par `baseAnnexes`. Le composant
React (`src/zones/EditeurSvg.tsx`, propriétés `ProprietesEditeur`) et le moteur seul
(`src/engine/editionSvg.ts`, sans React ni DOM) restent utilisables tels quels.

## Organisation du dépôt

| Chemin | Rôle |
|---|---|
| `src/util/` | Primitives pures : lecture XML sans DOM, nettoyage d'un SVG, historique immuable, couleur (OKLab), lecture indexée sûre (`au`) |
| `src/model/` | La bibliothèque : le lexique anglais → français, les événements et leurs règles, le nom et le classement d'une forme ; les profils de production (`contextes.ts`) |
| `src/engine/` | Le dessin à plat (`editionSvg.ts`), les booléens, les transformations et aimants, le texte en formes, les palettes, le détourage, l'extraction des couleurs, les réglages de vectorisation. Pur : ni DOM, ni réseau, ni horloge |
| `src/export/` | Le PDF vectoriel, le SVG de découpe, l'export pour Cricut et Print Then Cut. Pur |
| `src/io/` | Ce qui touche au navigateur : décoder une image, rendre un PNG, appeler vtracer (WASM), charger la bibliothèque et les fontes, télécharger, copier |
| `src/zones/` | `EditeurSvg.tsx` (le composant) et ses trois contextes (`contexteEditeur.tsx`), les barres (`BarreOutils`, `BarreSelection`, `MenusBarre`), les panneaux (`Calques`, `Inspecteur`, `PanneauDessin`, `ParCouleur`, `Texte`, `Palettes`, `Versions`, `Exporter`), `commun/` (`Bouton`, `Menu`, `Section`), `Vectoriser.tsx`, `Bibliotheque.tsx`, `Application.tsx` (la page) |
| `bibliotheque/` | `corrections.json` : les corrections de nom et de classement posées à la main, appliquées à la construction |
| `outils/editeur-svg/` | La page, ses feuilles de style (`base.css`, `editeur.css`) et ses points d'entrée (page, embarquement, traceur) ; `scripts/construire.mjs` assemble la page, `scripts/embarquer.mjs` le script d'embarquement |
| `exemples/` | Une page d'intégration qui tourne depuis le disque |
| `tests/unit/` | Un dossier par couche de `src/`, plus `architecture.test.ts` |
| `src/styles/` | Le registre des jetons de couleur de l'interface (rôle, clair, sombre, contrastes), d'où le CSS se génère |
| `docs/adr/` | Les décisions, une par fichier (dont la sécurité, [ADR-0014](docs/adr/0014-un-svg-d-inconnu-se-lit-il-ne-se-nettoie-pas.md) ; les outils de tracé, [ADR-0015](docs/adr/0015-les-outils-de-trace-des-morceaux-qui-partagent-leurs-aretes.md) ; les navigateurs, [ADR-0016](docs/adr/0016-les-navigateurs-pris-en-charge.md) ; la conformité et la provenance, [ADR-0017](docs/adr/0017-conformite-et-provenance.md) ; les exports et le prétraitement, [ADR-0018](docs/adr/0018-des-exports-purs-un-pretraitement-qui-n-existe-que-touche.md) ; l’import PDF et le texte en lettres, [ADR-0020](docs/adr/0020-un-pdf-se-lit-en-formes.md)) ; `docs/jetons.md` : les jetons, générés |

Les couches vont de `util` à `zones` : `util/shell` → `geometry` → `model/plateforme` → `engine` →
`core/io/render/export/interaction` → `ui` → `app/zones`, jamais dans l'autre sens, et le cœur pur
(`util`, `model`, `engine`) ne touche ni au DOM, ni à l'horloge, ni au hasard, ni au réseau. Un test
l'impose.

## Sources et licences

- Les formes de la bibliothèque viennent de [game-icons.net](https://game-icons.net) et de ses contributeurs, licence
  [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), par le paquet `@iconify-json/game-icons` : **l'attribution
  est obligatoire**. L'éditeur la porte lui-même : la boîte « À propos et crédits » (menu Fichier, pied de la page), un
  `<metadata>` d'attribution et un attribut `data-origine` dans tout SVG écrit qui contient une de ces formes, la mention dans les
  informations d'un PDF et en commentaire d'un SVG de découpe (un PNG ne la porte pas : citez la source à côté). Voir
  [docs/integration.md](docs/integration.md#attribution-et-licences) pour ce que doit faire l'hôte qui l'embarque.
- La vectorisation emploie [vtracer](https://github.com/visioncortex/vtracer) (Vision Cortex),
  compilé en WebAssembly, par le paquet `@visioncortex/vtracer`.
- Les booléens emploient [polygon-clipping](https://github.com/mfogel/polygon-clipping) (MIT) ; le
  texte, [opentype.js](https://opentype.js.org) (MIT) et neuf fontes (huit familles : Inter, Oswald, Bebas Neue,
  Playfair Display, Lobster, Pacifico, Caveat, Fredoka) sous licence SIL OFL 1.1, par les paquets
  `@expo-google-fonts/*`. L'interface est en [React](https://react.dev) (MIT), en *Instrument Sans* et *IBM Plex Mono* (SIL OFL 1.1,
  sous-ensemble latin, paquets `@fontsource/*`), incorporées à `dist/editeur-svg.html` : la page ne les demande à aucun serveur.
- **Le copyright et la licence de chaque composant tiers sont dans [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)**, généré par
  `npm run mentions` à partir de `src/model/credits.ts`, du `package-lock.json` et des fichiers de licence des paquets ; le même texte
  est construit dans `dist/MENTIONS.txt` et doit accompagner toute redistribution de `dist/`. Un test échoue si ce fichier est périmé
  (`ACTUALISER_REFERENCES=1 npx vitest run tests/unit/depot/mentions.test.ts` le régénère).
- Le projet lui-même est propriétaire, tous droits réservés (voir [LICENSE](LICENSE)) ; les composants tiers gardent leurs licences.
