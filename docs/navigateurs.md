# Navigateurs pris en charge

Ce que la page et l’éditeur embarqué promettent, ce qui le vérifie, et ce qui reste à vérifier à la main.
Le tableau ci-dessous est relu par un test (`tests/unit/depot/navigateurs.test.ts`) : une fonctionnalité
qui entre dans le code sans y figurer, ou une version au-dessus du plancher sans repli écrit, fait échouer
`npm test`.

> **Honnêteté sur l’origine des chiffres.** Les versions minimales viennent des données de compatibilité
> de MDN et de caniuse, relevées de mémoire : cet audit a été écrit sans accès au réseau et sans Firefox ni
> WebKit sous la main. Elles sont à recouper avant de les citer hors de ce dépôt. Chromium est le seul moteur
> que l’on ait pu exécuter ; Firefox et WebKit tournent en CI (`navigateur`) mais n’y sont pas encore exigés
> (voir « Ce qui est vérifié »).

## La promesse, en trois niveaux

<!-- plancher: chrome=111 firefox=113 safari=16.4 -->

1. **Pris en charge** : les deux dernières versions majeures de Chrome, Edge, Firefox et Safari (macOS, iOS
   et iPadOS), et Chrome pour Android. Les navigateurs bâtis sur Chromium à jour (Brave, Opera, Samsung
   Internet…) suivent Chrome.
2. **Plancher de la promesse** : Chrome et Edge 111, Firefox 113, Safari et iOS Safari 16.4 (mars à mai
   2023). À partir de là, toutes les fonctionnalités du tableau existent d’origine, sans repli. iOS Safari
   16.4 est la limite basse côté Apple : l’iOS d’un appareil ne se choisit pas, et 16.4 couvre les iPhone
   depuis le 8.
3. **Plancher technique** (mesuré, non promis) : Chrome et Edge 96, Firefox 92, Safari et iOS Safari 15.4.
   Entre ce plancher et celui de la promesse, la page s’ouvre et sert à éditer, avec les replis du tableau
   (teintes fixes à la place de `color-mix()`, hauteur `vh` à la place de `dvh`…). Dessous, la garde de
   démarrage dit en français ce qui manque, ou une page d’attente honnête reste à l’écran
   (voir « Démarrage sans page blanche »).

La limite haute du plancher technique est `Object.hasOwn` (Chrome 93, Firefox 92, Safari 15.4) et
`:focus-visible` (Safari 15.4) ; la vectorisation demande de plus les extensions WebAssembly du traceur
(Chrome 96, Firefox 79, Safari 15).

Ne sont pas pris en charge : Internet Explorer, les navigateurs de console ou de télévision, les modes
« lecture » et les navigateurs en ligne de commande.

## Ce qui est vérifié

| Quoi | Comment | Où |
|---|---|---|
| Les versions récentes de Chromium, Firefox et WebKit | La suite `tests/e2e` complète, dans les trois moteurs que Playwright 1.56.1 embarque (Chromium 141, Firefox 142, WebKit 26.0) | job `navigateur` de la CI, une passe par moteur (`NAVIGATEUR=chromium\|firefox\|webkit npm run e2e`) |
| Chromium | Exigé : la CI échoue si un test tombe | idem |
| Firefox et WebKit | **Pas encore exigés** (`continue-on-error`) : ils n’avaient jamais tourné quand cette page a été écrite. Le TODO du workflow dit de les rendre obligatoires dès que leurs premiers passages sont verts, puis de remplacer ce paragraphe | idem |
| Les replis de `color-mix()` | Test de navigateur : chaque teinte de repli égale ce que `color-mix()` calcule, à un pas de 8 bits | `tests/e2e/compatibilite.e2e.ts` |
| Les gardes (API de base manquante, WebAssembly manquant, JavaScript coupé) | Tests de navigateur qui retirent l’API avant l’ouverture de la page | idem |
| Le moteur et les versions plus anciennes | Aucun test : l’audit statique de ce document, relu par `tests/unit/depot/navigateurs.test.ts` | ce fichier |
| Le reste (lecteurs d’écran, tactile réel, contraste élevé, clavier AZERTY…) | Une personne, une heure | [`verification-manuelle.md`](verification-manuelle.md) |

## Le tableau : fonctionnalité, versions minimales, repli

Chaque ligne est une fonctionnalité que le code livré emploie (ou, pour les lignes « évité », qu’un test
interdit). Les versions sont celles où elle existe sans préfixe ni réglage. Un tiret dit « jamais ». Une
version au-dessus du plancher de la promesse exige un repli écrit dans la dernière colonne.

| Fonctionnalité | Chrome / Edge | Firefox | Safari / iOS | Repli ou dégradation |
|---|---|---|---|---|
| `color-mix()` | 111 | 113 | 16.2 | Chaque règle qui l’emploie est suivie d’un bloc `@supports not` qui pose la teinte déjà calculée (jetons `repli-*`, ADR-0007). Un test de navigateur les compare. Les couleurs de repli sont fixes : un hôte qui change `--cyan` ne les change pas |
| `:has()` | 105 | 121 | 15.4 | Évité : la ligne de couleur masque son échantillon par un sélecteur voisin (`.recolorer + .couleur-choix`), sans `:has()` |
| `:focus-visible` | 86 | 85 | 15.4 | Aucun : sans lui, la liste de sélecteurs d’anneau de focus est ignorée en bloc. Sous le plancher technique |
| `:where()` | 88 | 78 | 14 | Aucun, sous le plancher technique |
| `content-visibility` | 85 | 125 | 18 | Ignoré : seul le coût de rendu d’une très longue liste change, et elle est déjà fenêtrée (ADR-0008) |
| `contain-intrinsic-size` | 83 | 107 | 17.4 | Ignoré avec `content-visibility` |
| `scrollbar-width` | 121 | 64 | 18.2 | Ignoré : barres de défilement de largeur ordinaire dans les barres d’outils étroites |
| `accent-color` | 93 | 92 | 15.4 | Ignoré : curseurs et cases aux couleurs du système |
| `dvh` | 108 | 101 | 15.4 | La ligne `max-height` avec `vh` précède celle avec `dvh` : un navigateur qui ne connaît pas `dvh` garde `vh` (un menu peut passer sous la barre d’adresse d’un mobile) |
| `inset` | 87 | 66 | 14.1 | Aucun, sous le plancher technique |
| `overflow-wrap` | 80 | 65 | 15.4 | Ignoré (`anywhere` : un nom de fichier très long déborde au lieu de se couper) |
| `touch-action` | 36 | 52 | 13 | Aucun : sans lui, le geste à deux doigts sur la toile zoomerait la page. Sous le plancher technique |
| `user-select` | 54 | 69 | 16.4 (préfixe `-webkit-` seul avant) | Le préfixe `-webkit-user-select` est écrit à côté, sur la toile |
| `forced-colors` | 89 | 89 | — | Safari ne l’applique jamais (macOS n’a pas de mode de couleurs forcées) ; le mode « Augmenter le contraste » de macOS n’est pas traité à part, les jetons tiennent 4,5:1 dans les deux thèmes |
| `pointer: coarse` | 41 | 64 | 9 | Absent : poignées et cibles de taille souris, sauf sous 900 px de large où les 40 px s’appliquent de toute façon |
| `prefers-reduced-motion` | 74 | 63 | 10.1 | Absent : les animations jouent |
| `prefers-color-scheme` | 76 | 67 | 12.1 | Absent : thème clair |
| `all: revert` | 84 | 67 | 9.1 | Aucun : le bouclier de l’embarquement n’agit pas, l’hôte peut teinter les boutons. Sous le plancher technique |
| `clip-path` | 55 | 54 | 13.1 | Aucun : le rideau de comparaison de l’atelier (`inset()`) ne coupe pas l’image |
| `vector-effect` | 6 | 15 | 5.1 | Aucun : les traits de sélection grossiraient avec le zoom. Sous le plancher technique |
| `<details>` | 12 | 49 | 6 | Aucun, toujours présent |
| `type="color"` | 20 | 29 | 12.1 | Aucun, toujours présent |
| `Object.hasOwn` | 93 | 92 | 15.4 | Garde de démarrage : le navigateur qui ne l’a pas voit une page en français qui le dit |
| lookbehind `(?<!` | 62 | 78 | 16.4 | Évité : deux regex de `util/cssPortee.ts` s’en servaient, et une regex que Safari ne sait pas lire tue tout le bundle d’embarquement à l’analyse |
| `\p{…}` | 64 | 78 | 11.1 | Aucun, toujours présent |
| `ResizeObserver` | 64 | 69 | 13.1 | Testé avant emploi ; sans lui, les longues listes se remesurent moins vite |
| `matchMedia` | 45 | 55 | 14 | Testé avant emploi ; sans lui, le pointeur est tenu pour fin. L’écoute `addEventListener('change')` demande Safari 14 |
| `PointerEvent` | 55 | 59 | 13 | Garde de démarrage |
| `setPointerCapture` | 55 | 59 | 13 | Dans un `try` : sans capture, la toile suit le pointeur tant qu’il la survole |
| `wheel` | 31 | 17 | 7 | Le pincement du pavé tactile arrive en `wheel` + `Ctrl` dans Chrome et Firefox ; **Safari sur Mac envoie un évènement de geste, non traité** : le zoom passe par la molette, les boutons et le menu Vue |
| `WebAssembly` | 96 | 79 | 15 | Garde avant la vectorisation : le message dit qu’il manque WebAssembly, l’image reste une image. Extensions du traceur lues dans le binaire par un test : `bulk-memory`, `mutable-globals`, `nontrapping-fptoint`, `reference-types`, `sign-ext`, `multivalue` |
| `inert` | 102 | 112 | 15.5 | L’hôte est aussi caché par `visibility: hidden`, qui le retire déjà de l’ordre de Tab et des lecteurs d’écran : sans `inert`, rien ne change |
| `navigator.clipboard` | 66 | 63 | 13.1 | Dans un `try` ; il n’existe qu’en contexte sécurisé (https, localhost, et pas toujours `file://` selon le navigateur) : « Copier » rend faux et la page le dit |
| `URL.createObjectURL` | 23 | 19 | 7 | Garde de démarrage. Sur iOS, un téléchargement s’ouvre dans l’aperçu ou la feuille de partage plutôt que dans un dossier |
| `localStorage` | 4 | 3.5 | 4 | Dans un `try` (accès refusé, navigation privée, `file://`) : brouillon et versions nommées disparaissent, l’éditeur marche |
| `TextEncoder` | 38 | 18 | 10.1 | Aucun, toujours présent |
| `canvas` | 4 | 3 | 3.1 | Garde avant de lire une image. iOS Safari borne un canvas à environ 16,7 millions de pixels : une très grande image ne se lit pas (voir la liste manuelle) |
| `requestAnimationFrame` | 24 | 23 | 6.1 | Aucun, toujours présent |
| `toLocaleDateString` | 24 | 29 | 10 | Date du brouillon sur l’accueil : le séparateur peut différer d’un moteur à l’autre, sans effet sur un SVG |
| `localeCompare` | 24 | 29 | 10 | Ne départage que des codes `#rrggbb` en minuscules, ordre identique dans tous les moteurs |
| `Math.sin` | 1 | 1 | 1 | Voir « Reproductibilité » : le dernier bit n’est pas fixé par la norme (aussi `cos`, `tan`, `atan2`, `hypot`, `cbrt`, `exp`, `log10`) |

Syntaxe JavaScript : le bundle est compilé en ES2020 (`scripts/*.mjs`, esbuild). `?.` et `??` demandent
Chrome 80, Firefox 74, Safari 13.1 ; `??=` et le reste d’ES2021 et plus sont abaissés par esbuild. Les API
d’ES2022 et plus ne sont pas complétées par esbuild : c’est pourquoi `Object.hasOwn` figure ci-dessus, et pourquoi
un test interdit `at()`, `findLast`, `toSorted`, `structuredClone`, `replaceAll`, `Promise.withResolvers` et
consorts dans `src/`.

## Replis ajoutés

- **`color-mix()`** : neuf jetons `repli-*` dans `src/styles/jetons.ts` (la couleur d’outil à 6, 7, 8, 10,
  12, 14, 18, 35 % et assombrie de 14 %, calculés pour chaque thème), un bloc `@supports not (color:
  color-mix(…))` sous chaque règle qui l’emploie. Une déclaration précédente ne pouvait pas servir de repli :
  un `color-mix()` qui lit `var()` n’est invalide qu’à l’usage et ne retombe pas sur la ligne d’avant.
- **`:has()`** : remplacé par un sélecteur voisin.
- **`dvh`** : `vh` d’abord, `dvh` ensuite.
- **Safari** : `-webkit-user-select` sur la toile ; `touch-action: manipulation` sur boutons, résumés,
  étiquettes et listes, pour que deux touches rapides sur « Annuler » ne zooment pas la page.
- **Lookbehind** retiré de `util/cssPortee.ts` (sortie identique, vérifiée sur les feuilles livrées).
- **Gardes** (`src/util/capacites.ts`, sonde dans `src/io/capacites.ts`) : voir ci-dessous.

## Démarrage sans page blanche

Trois cas, du plus doux au plus brutal :

1. **Une API de base manque** (`Object.hasOwn`, `PointerEvent`, `Blob` et `URL.createObjectURL`) : la page
   affiche « Ce navigateur est trop ancien » et dit ce qui manque ; l’éditeur embarqué ouvre une fenêtre
   d’alerte qui se ferme comme n’importe quel éditeur et appelle `onFermer`. Le calcul est pur
   (`manquantes`, `phraseManquantes`), la sonde reçoit son hôte en paramètre : les tests lui donnent un faux
   navigateur.
2. **Une capacité n’est utile qu’à un geste** : le canvas, quand on lit une image ; WebAssembly, quand on
   vectorise. Le geste dit ce qui manque dans le message de l’atelier ; le reste de la page marche.
3. **Le moteur ne s’exécute pas** (JavaScript coupé, syntaxe trop récente pour le navigateur) : le conteneur
   de la page porte déjà un paragraphe « Chargement de l’éditeur… Si ce message reste affiché, JavaScript est
   désactivé ou ce navigateur est trop ancien », que React remplace au démarrage. Le bundle d’embarquement,
   lui, ne peut rien dire s’il ne s’analyse pas : un hôte qui vise des navigateurs anciens teste
   `window.EditeurSvg` avant d’appeler `ouvrir`.

## Les sauts de test (tests intrinsèquement propres à un moteur)

Un test ne saute jamais en silence : il passe par `sauteSauf(moteurs, raison)` dans `tests/e2e/aide.ts`, et un
test de dépôt vérifie que la raison est écrite ici, mot pour mot.

| Test | Moteurs qui le jouent | Raison (texte du code) |
|---|---|---|
| `contraste-force.e2e.ts` (tout le fichier) | Chromium | `emulateMedia({ forcedColors }) : emulation verifiee sur Chromium seulement` |
| `tactile.e2e.ts`, « detecte un pointeur grossier » | Chromium, WebKit | `isMobile absent de Firefox : (pointer: coarse) y reste faux` |

À essayer quand la CI aura tourné : Playwright expose `forcedColors` aussi pour Firefox et WebKit ; si
l’émulation y agit, lever le saut. Adaptations qui ne sont pas des sauts : sur Firefox, un contexte tactile n’a
que `hasTouch` (pas de `isMobile`), et le test de l’embarquement sur 390 px y attend un pointeur fin.

Autres différences relues dans les specs, sans changement : les raccourcis `Control+…` passent partout parce que
l’éditeur accepte Ctrl ou Cmd ; les durées calculées se lisent en secondes par `parseFloat`, donc `1e-05s` passe ;
les couleurs calculées s’écrivent `rgb(…)` dans les trois moteurs ; le rideau de l’atelier accepte `inset(0px …)`
comme `inset(0 …)`. Restent à confirmer par la CI : le `tap()` de Firefox, le téléchargement d’un `blob:` sous
WebKit, `localStorage` sous `file://` dans Firefox et WebKit, et `:focus-visible` après un `focus()` par script.

## Reproductibilité d’un navigateur à l’autre

« Un SVG réécrit aujourd’hui doit l’être à l’identique demain » vaut aussi d’un moteur à l’autre. Les
références d’écriture (`tests/unit/engine/ecriture-stable.test.ts`) tournent sous Node, donc V8. Or `Math.sin`,
`cos`, `tan`, `atan2`, `hypot`, `cbrt`, `exp` et `log10` sont des approximations que la norme ne fixe pas :
SpiderMonkey et JavaScriptCore peuvent différer au dernier bit. Les coordonnées sont arrondies à trois décimales
à l’écriture, ce qui cache presque toujours l’écart, pas à coup sûr.

`tests/e2e/reecriture.e2e.ts` ferme la question en test : la même rotation, inclinaison et mise à l’échelle de
courbes et d’arcs, jouée dans chaque navigateur, doit écrire les mêmes octets que le moteur sous Node. Un écart
sur Firefox ou WebKit est un évènement de version majeure à annoncer, pas un bruit à ignorer.

La vectorisation d’une image est reproductible dans un navigateur donné, pas forcément de l’un à l’autre : le
décodage d’une image (profil de couleur, alpha prémultiplié, décodeur JPEG) est celui du navigateur, et
`getImageData` peut donner des pixels qui diffèrent d’une unité. L’image de test des specs est un PNG RVB sans
profil, qui ne les expose pas.

## Ajouter une fonctionnalité

1. L’employer dans le code ; `npm test` échoue en disant laquelle manque à ce tableau.
2. Chercher ses versions minimales (MDN, caniuse), l’ajouter au tableau.
3. Si une version dépasse le plancher de la promesse, écrire un repli (un `@supports`, un test de présence, une
   garde) et le dire dans la dernière colonne ; sinon le test refuse la ligne.
4. Si le repli est une couleur, en faire un jeton (ADR-0007) : la page n’écrit aucune couleur.
