# Navigateurs pris en charge

Ce que la page et l’éditeur embarqué promettent, ce qui le vérifie, et ce qui reste à vérifier à la main.
Le tableau ci-dessous est relu par un test (`tests/unit/depot/navigateurs.test.ts`) : une fonctionnalité
qui entre dans le code sans y figurer, ou une version au-dessus du plancher sans repli écrit, fait échouer
`npm test`.

> **Honnêteté sur l’origine des chiffres.** Les versions minimales viennent des données de compatibilité
> de MDN et de caniuse, relevées de mémoire : cet audit a été écrit sans accès au réseau et sans Firefox ni
> WebKit sous la main. Elles sont à recouper avant de les citer hors de ce dépôt. Les trois moteurs de
> Playwright 1.56.1 tournent en CI (`navigateur`) et ont été rejoués en local le 25 octobre 2026 ; Chromium et
> Firefox y sont exigés, WebKit pas encore (voir « Ce qui est vérifié »).

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
| Firefox | **Exigé** depuis le 25 octobre 2026 (60 minutes au lieu de 25) : passage entièrement vert en CI sur la fusion de `cc8be02` (1 071 tests passés, les 8 ignorés étant le contraste forcé, alors sauté hors de Chromium) ; le seul échec du passage suivant (une transition lue en route, voir « Passages suivants ») est corrigé | idem |
| WebKit | **Pas encore exigé** (`continue-on-error`, 60 minutes). Second passage en CI : 20 échecs sur 1 079, tous rejoués et corrigés en local sous WebKit 26 (voir « Passages suivants ») ; le TODO du workflow dit de le rendre obligatoire dès qu’un passage en CI est vert | idem |
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
| `accent-color` | 93 | 92 | 15.4 | Ignoré : curseurs, cases, radios et barres de progression aux couleurs du système |
| `scrollbar-color` | 121 | 64 | — | Ignoré : barres de défilement aux couleurs du système (Safari ne la connaît pas) |
| `:is()` | 88 | 78 | 14 | Aucun, sous le plancher technique |
| `text-underline-offset` | 87 | 70 | 12.1 | Aucun, sous le plancher technique |
| `font-variant-numeric` | 52 | 34 | 9.1 | Aucun, sous le plancher technique |
| `hover: none` | 41 | 64 | 9 | Aucun, sous le plancher technique |
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
| `clip-path` | 55 | 54 | 13.1 | Aucun : le rideau de comparaison de l’atelier (`inset()`) ne coupe pas l’image. Les découpes du modèle riche sont des `<clipPath>` SVG en unités du plan (`userSpaceOnUse`), lus partout bien avant ces versions |
| `<filter>` | 8 | 3 | 6 | Aucun, sous le plancher technique : le flou et l’ombre du modèle riche (ADR-0012, étape 7) s’écrivent en primitives que tous lisent (`feGaussianBlur`, `feOffset`, `feFlood`, `feComposite`, `feMerge` ; `feDropShadow` se lit, ne s’écrit jamais), sur une région explicite et en `color-interpolation-filters="sRGB"`, dont le défaut linéaire varie d’un moteur à l’autre. Au-delà de 20 nœuds à effet, la toile retire les filtres pendant un geste (`data-brouillon`) |
| `mask-type` | 24 | 35 | 7 | Aucun, sous le plancher technique : un masque alpha du modèle riche s’écrit `style="mask-type:alpha"` ; un moteur qui l’ignorerait le peindrait en luminance |
| `vector-effect` | 6 | 15 | 5.1 | Aucun : les traits de sélection grossiraient avec le zoom. Sous le plancher technique |
| `<details>` | 12 | 49 | 6 | Aucun, toujours présent |
| `type="color"` | 20 | 29 | 12.1 | Aucun, toujours présent |
| `Object.hasOwn` | 93 | 92 | 15.4 | Garde de démarrage : le navigateur qui ne l’a pas voit une page en français qui le dit |
| lookbehind `(?<!` | 62 | 78 | 16.4 | Évité : deux regex de `util/cssPortee.ts` s’en servaient, et une regex que Safari ne sait pas lire tue tout le bundle d’embarquement à l’analyse |
| `\p{…}` | 64 | 78 | 11.1 | Aucun, toujours présent |
| `ResizeObserver` | 64 | 69 | 13.1 | Testé avant emploi ; sans lui, les longues listes se remesurent moins vite, et la bulle de la visite guidée ne se replace qu’au redimensionnement de la fenêtre et au relâcher d’un pointeur, et les règles de la toile (ADR-0038) ne se remesurent qu’au redimensionnement de la fenêtre |
| `matchMedia` | 45 | 55 | 14 | Testé avant emploi ; sans lui, le pointeur est tenu pour fin. L’écoute `addEventListener('change')` demande Safari 14 |
| `PointerEvent` | 55 | 59 | 13 | Garde de démarrage |
| `setPointerCapture` | 55 | 59 | 13 | Dans un `try` : sans capture, la toile suit le pointeur tant qu’il la survole |
| `wheel` | 31 | 17 | 7 | Le pincement du pavé tactile arrive en `wheel` + `Ctrl` dans Chrome et Firefox ; **Safari sur Mac envoie un évènement de geste, non traité** : le zoom passe par la molette, les boutons et le menu Vue |
| `WebAssembly` | 96 | 79 | 15 | Garde avant la vectorisation : le message dit qu’il manque WebAssembly, l’image reste une image. Extensions du traceur lues dans le binaire par un test : `bulk-memory`, `mutable-globals`, `nontrapping-fptoint`, `reference-types`, `sign-ext`, `multivalue` |
| `inert` | 102 | 112 | 15.5 | L’hôte est aussi caché par `visibility: hidden`, qui le retire déjà de l’ordre de Tab et des lecteurs d’écran : sans `inert`, rien ne change |
| `focusVisible` | — | 104 | 18.4 | Ignoré : Chromium et Firefox appliquent d’eux-mêmes `:focus-visible` au focus qu’une flèche déplace ; sans l’option, WebKit ne montre pas l’élément atteint aux flèches dans un menu ouvert à la souris (ni fond ni filet), un lecteur d’écran l’annonce toujours. Voir `zones/commun/focusClavier.ts` |
| `navigator.clipboard` | 66 | 63 | 13.1 | Dans un `try` ; il n’existe qu’en contexte sécurisé (https, localhost, et pas toujours `file://` selon le navigateur) : « Copier » rend faux et la page le dit |
| `URL.createObjectURL` | 23 | 19 | 7 | Garde de démarrage. Sur iOS, un téléchargement s’ouvre dans l’aperçu ou la feuille de partage plutôt que dans un dossier |
| `localStorage` | 4 | 3.5 | 4 | Dans un `try` (accès refusé, navigation privée, `file://`) : brouillon et versions nommées disparaissent, l’éditeur marche |
| `TextEncoder` | 38 | 18 | 10.1 | Aucun, toujours présent |
| `DecompressionStream` | 80 | 113 | 16.4 | Testé avant emploi, à l’ouverture d’un PDF et d’une police WOFF du catalogue : sans lui, une police WOFF n’est pas lue ; un PDF dont les flux sont compressés est refusé en le disant (« ce navigateur ne sait pas décompresser… ») ; un PDF sans flux compressé s’ouvre |
| `fetch` | 42 | 39 | 10.1 | Aucun, sous le plancher technique : il ne sert qu’à télécharger une police du catalogue, quand la personne la choisit (ADR-0025) ; la page ne l’appelle jamais d’elle-même |
| `crypto.subtle` | 37 | 34 | 11 | Testé avant emploi ; il n’existe qu’en contexte sécurisé (https, localhost, `file://` selon le navigateur) : sans lui, une police téléchargée n’est pas lue (son empreinte ne peut pas être vérifiée) et la page le dit |
| `caches` | 43 | 41 | 11.1 | Dans un `try` : sans Cache Storage (contexte non sécurisé, refus, stockage plein), une police du catalogue se retélécharge à la session suivante |
| `queryLocalFonts` | 103 | — | — | Testé avant emploi : sans lui, le bouton « Polices de cet appareil » n’apparaît pas ; déposer un fichier TTF ou OTF reste possible partout |
| `Blob.arrayBuffer` | 76 | 69 | 14 | Aucun, sous le plancher technique : lire les octets d’un PDF ou d’une fonte déposés |
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

**Aucun saut aujourd’hui** : les trois moteurs jouent toute la suite.

| Test | Moteurs qui le jouent | Raison (texte du code) |
|---|---|---|
| — | — | — |

Sauts levés : celui de `contraste-force.e2e.ts` (tout le fichier, huit tests), le 25 octobre 2026 : l’émulation
`emulateMedia({ forcedColors })` agit sous Firefox 142 et WebKit 26 comme sous Chromium (mesuré en local). Deux de ses
tests tombaient hors de Chromium : l’anneau de focus, parce que le test y arrivait par une touche Maj et un `focus()` par
script (il y arrive maintenant par Tab et Maj+Tab), et l’élément de menu au focus sous WebKit, un défaut de la page
(voir `focusVisible` au tableau). Le saut de « detecte un pointeur grossier » sous Firefox est levé aussi : un contexte
tactile n’y a que `hasTouch` (Playwright refuse `isMobile`), mais Firefox annonce quand même `(pointer: coarse)`
(lu en CI, Firefox 142), et les trois moteurs attendent maintenant un pointeur grossier.

Ce qu’un moteur n’a pas, sans saut : sous WebKit, `scrollbar-color` n’existe pas (ligne du tableau) ; le test de finition
admet son absence sous WebKit seul, et exige le jeton partout où elle existe.

Autres différences relues dans les specs, sans changement : les raccourcis `Control+…` passent partout parce que
l’éditeur accepte Ctrl ou Cmd ; les durées calculées se lisent en secondes par `parseFloat`, donc `1e-05s` passe ;
les couleurs calculées s’écrivent `rgb(…)` dans les trois moteurs ; le rideau de l’atelier accepte `inset(0px …)`
comme `inset(0 …)`. Confirmés par les premiers passages : le `tap()` de Firefox, le téléchargement d’un `blob:` sous
WebKit, `localStorage` sous `file://` dans Firefox et WebKit. Infirmé : `:focus-visible` après une touche Maj et un
`focus()` par script, que seul Chromium applique (le test y arrive maintenant par Tab).

## Premiers passages de Firefox et WebKit

Journaux lus : run 40135888510 (commit `a0596d8`), jobs 120997443898 (Firefox 142, 15 échecs sur 884 tests) et
120997443791 (WebKit 26, coupé à 25 minutes pendant `securite.e2e.ts`, sans message d’échec : seuls les noms des onze
tests tombés sont connus). Les captures des échecs Firefox (artefact `traces-navigateur-firefox`) ont été relues.
Firefox et WebKit ne sont pas installés là où les corrections ont été faites : **chaque cause ci-dessous est établie par
le journal et par la lecture du code, puis la correction est rejouée sous Chromium seulement.** Un test qui tombait sous
WebKit seul est marqué ainsi ; sa cause est déduite de celle de Firefox.

| Échec | Moteurs | Cause établie | Correction |
|---|---|---|---|
| Atelier à 420 px : la page défile de 20 px (`pretraitement.e2e.ts`) | Firefox, WebKit | **Bug de la page.** Avec « Prétraitée », la visionneuse a six onglets qui ne passent pas à la ligne (406 px dans une colonne de 354) ; la colonne de grille s’élargit. Chromium le cachait : sous `isMobile`, il élargit `innerWidth` jusqu’au contenu (440 px, mesuré) et `scrollWidth - innerWidth` restait nul | Les onglets de la visionneuse passent à la ligne, la colonne du résultat est `minmax(0, 1fr)`. Les mesures de défilement de la page lisent `clientWidth` (cinq tests), qui voit ce débordement aussi sous Chromium |
| Tab dans « Couleurs du dessin » (et « Par couleur », WebKit seul) : le contrôle focalisé sort de la liste | Firefox, WebKit | **Défaut de la page sous ces moteurs.** Ils ne font pas défiler la liste pour un contrôle à demi visible (capture : ligne 8 coupée, liste à 0) ; Chromium la montre entière | Au focus clavier (`:focus-visible`), la liste montre la ligne entière (`montrerLigneAuClavier`, `zones/Fenetre.ts`) ; rien ne bouge au focus de la souris |
| La molette ne mène pas la liste « Par couleur » où elle va | Firefox, WebKit | Test : un cran de 300 px dépasse la liste (260 px), Firefox le ramène à une page (234 px = 90 %, lu) | Crans de 200 px (dix-huit, les mêmes 3 600 px) ; le cran de 200 px du test voisin passait déjà partout |
| Les formes choisies se lisent vides (`couleurs-suite.e2e.ts`) | Firefox, WebKit | Test : une ligne des calques hors de l’écran est en `content-visibility: auto`, son `innerText` y est vide | Le nom se lit par `textContent` (aussi dans les deux suites du clavier) |
| Anneau de focus de la toile absent (`edition.e2e.ts`) | Firefox, WebKit | Test : une touche Maj puis un `focus()` par script ne déclenche `:focus-visible` que sous Chromium | Le focus arrive par Tab puis Maj+Tab |
| Audit axe qui ne finit pas en 60 s (outils de tracé, exports) | Firefox, WebKit | Test, cause probable : l’attente de **toutes** les animations, sans borne ; le corps d’une section repliée garde son animation d’entrée, que Chromium fait avancer (vérifié) et ces moteurs non (non vérifié). L’audit commun, borné à 2 s, passait partout | Une seule attente bornée, `attendreAnimations` (`tests/e2e/aide.ts`), pour tous les audits et mesures |
| Polices chargées : `"Instrument Sans" 400` au lieu de `Instrument Sans 400` | Firefox (WebKit : même test tombé) | Test : `FontFace.family` garde ses guillemets sous Firefox | Le nom se lit sans guillemets |
| Bibliothèque, polices, bundle : aucune requête vue (`embarquement.e2e.ts`, deux tests) | Firefox | Test : Playwright ne signale aucune requête `file://` sous Firefox (le bundle chargé n’y figurait pas) | Second témoin dans la page : chaque `<script src>` posé, relevé avant tout script ; les annexes se chargent justement ainsi (`io/annexes.ts`) |
| Pointeur grossier à 390 px | Firefox | Test : il attendait un pointeur fin sous Firefox, qui annonce en fait `(pointer: coarse)` | Pointeur grossier attendu dans les trois moteurs, saut de `tactile.e2e.ts` levé |
| Deux fichiers du corpus collés s’ouvrent au lieu d’être refusés (`securite.e2e.ts`) | Firefox | Ni la page ni le test : Firefox retire des caractères de contrôle (au moins U+0000) de ce qu’on tape dans un `<textarea>`, les octets hostiles n’entrent pas par cette porte | Le test lit ce que la zone a reçu : si le moteur l’a changé, seul un retrait de caractères de contrôle est admis, et la page doit faire du texte reçu ce qu’en fait le moteur, sans défaut. Le même fichier déposé garde son issue attendue partout |
| WebKit coupé avant la fin | WebKit | CI : la limite de 25 minutes ; le corpus hostile (510 tests) a pris 15 minutes sous Firefox | 60 minutes pour Firefox et WebKit, 25 pour Chromium |

Non vérifié : que ces corrections suffisent sous Firefox et WebKit (aucun passage depuis), la cause exacte des deux audits
axe, et le reste de `securite.e2e.ts` sous WebKit, qui n’a jamais fini.

## Passages suivants

Firefox, fusion de `5107e87` (PR #16) : **un échec sur 1 084**, le filet du bouton « aucun » lu à 1,98 px d’une teinte
intermédiaire. Test : il attendait la fin de la transition de la couleur du texte, déjà à la couleur d’outil par le survol,
pendant que le filet passait encore de 1 à 2 px ; il attend maintenant la fin de toutes les transitions
(`attendreAnimations`).

WebKit 26, fusion de `cc8be02` : **20 échecs sur 1 079**, la suite enfin finie en 60 minutes. Tous rejoués en local (WebKit 26
de Playwright 1.56.1) avant et après correction :

| Échec | Cause établie (rejouée en local) | Correction |
|---|---|---|
| Onze « fichier déposé » du corpus hostile (`securite.e2e.ts`), un tirage différent à chaque passage (21 en local) | Test : `goto` rend la main à l’évènement `load`, et sous WebKit React n’a pas encore rendu l’accueil une fois sur quatre environ (8 sur 30 chargements mesurés, 0 sous Chromium). Le `drop` synthétique visait `document.querySelector('.depot')?.` : rien, en silence, puis 30 s d’attente | `deposerFichier` (`tests/e2e/aide.ts`) attend la zone de dépôt et échoue en le disant si elle manque ; `import-pdf.e2e.ts` passe par la même aide. Le dépôt par `DataTransfer` et la lecture du `File` marchent sous WebKit |
| Menus Aide et Machine (`onboarding.e2e.ts` ×3, `cricut.e2e.ts`) : `"Visite guidée\n"` au lieu de `"Visite guidée"` | Test : WebKit termine le `innerText` d’un élément de menu (un bouton en flex aux enfants en boîtes) par une fin de ligne, que la norme fait retirer | `textesDe` (`tests/e2e/aide.ts`) ramène les espaces et retire les bords |
| Couleur d’outil des curseurs (`finition.e2e.ts`, deux thèmes) : `scrollbarColor` indéfini | WebKit ne connaît pas `scrollbar-color` (ligne du tableau, repli « barres aux couleurs du système ») | Le test lit `CSS.supports` : l’absence n’est admise que sous WebKit, le jeton est exigé ailleurs |
| Texte d’exemple en grotesque (`finition.e2e.ts`, deux thèmes) : la chasse fixe du champ | Test : WebKit ne calcule pas le style de `::placeholder` par `getComputedStyle`, il rend celui du champ (sonde : couleur et famille du champ, pas de l’exemple) | Une sonde dit si le moteur le calcule ; sinon la couleur, la famille et l’opacité sont relues dans les feuilles (dernière règle `::placeholder` qui vise le champ) et calculées sur un élément voisin. Le contraste de 4,5:1 est ainsi mesuré pour de bon sous WebKit, il ne l’était pas |
| La molette qui retire la ligne au focus (`couleurs-nombreuses.e2e.ts`) : 3 123 px au lieu de 3 600 | Test : passé 1 000 px, il n’attendait plus qu’un cran ait porté avant d’envoyer le suivant, et WebKit en perdait ; cran par cran, la liste va jusqu’au bout, focus retiré compris (mesuré) | Chaque cran est attendu |

La bascule du modèle riche (ADR-0012, étape 14, 26 octobre 2026), en local, suite entière : Firefox 142 et WebKit 26 **entièrement
verts** (1 492 tests passés dans chacun, les 4 non joués étant les captures demandées de `texte-enveloppe.e2e.ts`), Chromium 141 aussi,
sauf un audit axe intermittent (un bouton de constat Cricut survolé à 4,33:1, défaut de la page, corrigé, son fichier et quatre autres
rejoués verts dans les trois). En route, sous Firefox seul : un clic synthétique ne choisit pas une forme dans un contexte tactile (le
test la touche), et Firefox tronque au pixel les coordonnées du pointeur (un geste peut perdre un pixel : le test de l'aimant des repères
visait 5,8 px pour une attraction à 6). Le détail est à l'annexe 8 de l'ADR-0012, « Ce que l'étape 14 a posé ».

Trouvé en levant le saut du contraste forcé, **défaut de la page sous WebKit** : un focus posé par script pendant un `keydown`
dont le geste par défaut est empêché (`preventDefault`, pour que la flèche ne fasse pas défiler la page) n’y reçoit pas
`:focus-visible`. Un menu ouvert à la souris puis parcouru aux flèches ne montrait donc aucun élément atteint, pas plus que
les pastilles de la bibliothèque et les onglets de l’accueil parcourus aux flèches après un clic. Correction : ces quatre
déplacements passent par `focusAuClavier` (`focus({ focusVisible: true })`), sans effet sous Chromium et Firefox.

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
