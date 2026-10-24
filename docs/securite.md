# Sécurité : le SVG d’un inconnu

L’éditeur ouvre des SVG qu’il n’a pas écrits (fichier déposé, code collé, option `svg` d’un hôte, formes d’une
bibliothèque d’hôte, brouillon laissé dans le navigateur) et en réécrit. Ce document dit ce qu’il protège, par où
l’on peut l’atteindre, ce que chaque couche garantit, ce qui reste à l’hôte, et **comment chaque affirmation est
prouvée** (tests, corpus, fuzzing, navigateur). Une affirmation qu’aucun test ne vérifie n’y figure pas.

## 1. Ce qu’on protège

| Actif | Menace |
|---|---|
| La page de la personne et son origine (cookies, stockage, session de l’hôte) | un script qui s’exécute (XSS) à l’ouverture, à l’export ou quand la personne rouvre le fichier exporté |
| Sa vie privée | une requête sortante déclenchée par l’entrée (pixel espion, feuille de style, police, `<use>` distant, entité externe) |
| Son onglet | gel ou plantage : bombes d’entités, de `<use>`, de règles de style, imbrication de 100 000 niveaux, chemin d’un million de points, expressions régulières quadratiques |
| Ses fichiers exportés | un SVG, un PNG ou un PDF qui porte encore l’attaque, ou qui est corrompu (`NaN`, `width="0"`, caractères interdits) |
| Son stockage local | un brouillon, des versions ou des corrections qui font planter la page ou polluent un prototype |
| L’hôte qui embarque l’éditeur | des options qui exécutent du code (`baseAnnexes`), un SVG rendu qui n’est pas inerte |

## 2. Les portes d’entrée

| Porte | Chemin dans le code | Ce qui lit le texte |
|---|---|---|
| Fichier déposé ou choisi | `zones/Application.tsx` (`OuvrirSvg`) | `nettoyerSvgNomme`, puis `lireDessin` |
| Code collé | idem | idem |
| Image à vectoriser | `io/image.ts` | `nettoyerSvg` sur la sortie de vtracer (un texte que nous produisons, d’un contenu que nous ne contrôlons pas) |
| Option `svg` de l’embarquement | `zones/embarque.tsx` → `EditeurSvg` | `lireDessin` **sans** nettoyage préalable (l’éditeur ne montre que le modèle à plat) |
| Bibliothèque d’hôte (option `bibliotheque`) | `io/bibliotheque.ts` | `normaliserBibliotheque`, puis `lireDessin` à l’insertion ; les vignettes sont des `<img src="data:…">` |
| Bibliothèque du build (`bibliotheque.js`) | `io/annexes.ts` | du code que nous avons construit ; hors modèle de menace |
| Brouillon, versions, corrections (`localStorage`) | `io/stockage.ts`, `zones/session.ts`, `zones/Bibliotheque.tsx` | JSON validé champ par champ |
| Options de l’hôte (`titre`, `nom`, `nuancier`, `baseAnnexes`, `stockage`) | `zones/embarque.tsx` (`verifierOptions`) | validées, en français |

Aucun chemin n’utilise `innerHTML`, `dangerouslySetInnerHTML`, `DOMParser` ni `eval` : le dessin est affiché par React à
partir du modèle à plat, les aperçus sont des `<img>` en `data:` (inertes par construction : ni script, ni requête).

## 3. Ce que garantit chaque couche

### `assainirSvg` (derrière `nettoyerSvg`) : lire, puis ne réémettre que le permis

`src/util/assainirSvg.ts` ne cherche pas le danger par des remplacements dans le texte (ce qu’on faisait, et que
`<scr<script></script>ipt>` ou `x:href` contournaient). Il **lit** le document (balayage linéaire de `util/xml.ts`) et
réémet, octet pour octet, ce qui est permis :

- **Éléments** : une liste blanche (le vocabulaire graphique de SVG 1.1 et 2). Tout le reste part **avec son contenu** :
  `script`, `foreignObject`, `handler`, polices SVG, `cursor`, tout élément préfixé (`svg:script`, `html:script`) sauf le
  RDF des licences dans `<metadata>` (`rdf:`, `cc:`, `dc:`, `dcterms:`). `title`, `desc` et `style` ne portent que du
  texte : un élément dedans part (piège de ré-analyse HTML).
- **Attributs** : `on*` (quels que soient la casse, le préfixe, le séparateur), `xml:base`, `src`/`action`/`formaction`…,
  tout préfixe hors `xlink`, `xml` et les espaces de noms d’outils connus, tout `xmlns` qui n’est pas celui de SVG (sur la
  racine) ou un espace de nom inerte connu. Un attribut répété est un refus (le premier gagne en HTML, le dernier ici).
- **Adresses** : un `href` ne reste que s’il vise `#ancre` ou, sur `<image>`/`<feImage>`, une image `data:` PNG, JPEG, GIF
  ou WebP en base64. Sur un `<use>`, un renvoi externe passe dans l’attribut inerte `data-href-externe` (la lecture le
  refuse en le nommant). Une animation qui vise `href`, `xlink:href` ou un gestionnaire part.
- **CSS** (`<style>`, `style=`, valeurs d’attributs) : `@import`, tout `url()` hors `#ancre`, `image-set`, `cross-fade`,
  `src()`, `expression()`, `-moz-binding`, `behavior` et les schémas `javascript:`, `vbscript:`, `data:` sont retirés. Les
  échappements (`u\72l`) et les commentaires sont résolus avant la recherche, et les retraits se répètent jusqu’à
  stabilité : un retrait ne recompose jamais le mot retiré.
- **Forme de la sortie** : du XML bien formé, une seule racine `<svg>` avec `xmlns` et `viewBox`, sans commentaire,
  instruction de traitement, DOCTYPE ni entité ; une section CDATA n’est gardée que dans une feuille de style, et
  jamais si le nettoyage a pu en déplacer la fin.
- **Entités** : aucune n’est jamais développée (ni interne, ni externe, ni paramètre). `&nom;` inconnu est échappé en
  `&amp;nom;`. Bombe de rires, explosion quadratique et XXE sont des textes inertes. **Conséquence assumée** : un
  vieil export d’Illustrator qui déclare `xmlns="&ns_svg;"` est lu, son `xmlns` est remplacé par celui de SVG ; une entité
  utilisée ailleurs que dans les espaces de noms n’est pas reprise.

L’unique cas où la sortie de ce nettoyage est ce que la personne **télécharge** est l’export sans modification depuis
l’accueil (« ouvrir, fermer l’éditeur, exporter ») : le fichier est le SVG d’origine nettoyé, pas une réécriture. C’est
pourquoi le nettoyage est une barrière de sécurité et non un simple confort.

### `lireDessin` : un modèle à plat, ou un refus nommé (ADR-0001, ADR-0009)

La lecture ramène le SVG à des chemins absolus M, L, C, Q, Z, des peintures résolues et des opacités. Elle **ne développe
jamais** ce qu’elle ne sait pas réécrire, et refuse en le nommant : texte, image, dégradé, masque, découpe, filtre, SVG
imbriqué, `<use>` en cycle ou vers l’extérieur, plus de 16 niveaux de `<use>`, plus de 20 000 clones. Elle ne lève jamais :
une pile qui déborderait malgré les bornes devient un refus.

### `ecrireDessin` : tout est regénéré depuis le modèle

Le SVG enregistré (« Enregistrer », `onEnregistrer`, les exports PNG/PDF/SVG après enregistrement) est **écrit à neuf** :
un `<svg>` et des `<path>`, rien d’autre, et d’un texte d’entrée seuls survivent des nombres (au millième), des couleurs
et des mots-clés de peinture. **Ce que cela implique** : même si le nettoyage était contourné un jour, un SVG enregistré
ne porte ni script, ni gestionnaire, ni adresse, ni feuille de style, ni attribut inconnu, car rien de cela n’existe dans
le modèle. La seule valeur libre était une peinture inconnue (`fill`/`stroke`) : elle est désormais limitée à `#hex`, un
mot-clé ou une fonction de couleur à un niveau (`peintureSure`), sinon la lecture refuse. Un test (`violationsEcriture`)
vérifie à chaque entrée du corpus et du fuzzing que la sortie n’a que `svg` et `path` et des valeurs numériques ou de
couleur.

## 4. Les bornes (et pourquoi aucun SVG réel n’y touche)

Chacune refuse en français, en disant quoi faire. Elles sont hautes exprès : un refus d’un SVG légitime est un défaut.

| Borne | Valeur | Vient de | Un SVG réel est à… |
|---|---|---|---|
| Taille du texte | 64 Mo | `util/xml.ts` | 2 Mo pour 5 000 formes vectorisées |
| Éléments | 1 000 000 | `util/xml.ts` | une carte détaillée : quelques centaines de milliers |
| Niveaux d’imbrication | 1 024 | `util/xml.ts` | moins de 50 ; un test du dépôt en monte 600 |
| Attributs d’un élément | 1 000 | `util/xml.ts` | moins de 60 |
| Longueur d’un nom | 256 | `util/xml.ts` | moins de 40 |
| Éléments ouverts à la fois (clones compris) | 1 500 | `edition/limites.ts` | un `<use>` sur 16 niveaux de groupes profonds |
| Données de tracé (`d`, `points`, clones compris) | 8 millions de caractères | `edition/limites.ts` | 2 Mo ; un chemin d’un million de points (7 Mo) passe |
| Coordonnée après transformations | ± 1 milliard | `edition/limites.ts` | Web Mercator va à 2·10⁷ |
| Plan de travail | ± 1 milliard, au moins 0,001 | `edition/lecture.ts` | l’écriture garde le millième |
| Confrontations règle de style × élément | 2 000 000 | `edition/limites.ts` | ~150 000 pour 1 000 règles sur 5 000 éléments (les règles sont rangées par classe, identifiant, type) |
| Clones `<use>`, niveaux de `<use>` | 20 000, 16 | `edition/clones.ts` | inchangés (ADR-0009) |

Le temps est borné par construction plutôt que mesuré : les balayages sont linéaires (plus d’expression régulière qui
relit le reste du texte à chaque `url(`, `/*` ou `scale(` non fermé) et les bornes ci-dessus plafonnent le travail. Le pire
cas accepté est un million de points : sept secondes de lecture. Il est lent, il est fini.

## 5. Ce qui reste à l’hôte

L’éditeur ne peut pas durcir la page qui l’héberge. À l’hôte de :

- **Servir ses propres SVG avec un `Content-Type: image/svg+xml` et `X-Content-Type-Options: nosniff`**, et **ne jamais
  servir un SVG d’utilisateur sur l’origine de l’application** en navigation de premier niveau (c’est le seul contexte où
  un `<script>` d’un SVG s’exécute). Un SVG affiché par `<img>` ou `background-image` ne s’exécute jamais.
- **Ne pas insérer en HTML** (`innerHTML`) le SVG reçu par `onEnregistrer` sans le réassainir : il est inerte (test), mais
  `onBrouillon` ne l’est pas (voir ci-dessous).
- **Poser une CSP** (`default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'`
  est un bon départ) : l’éditeur n’en a pas besoin de plus (ses annexes sont des `<script src>` de l’hôte ; `connect-src` peut
  rester fermé), et c’est la seconde ligne de défense si un jour un contournement existe. Les tests s’exécutent
  **sans** CSP, le pire cas.
- **Isoler** dans une `<iframe sandbox="allow-scripts allow-same-origin allow-downloads">` (voir `docs/integration.md`) si
  l’hôte veut un cloisonnement du CSS et du stockage.
- **`onBrouillon` n’est pas nettoyé** : il reçoit le SVG du moment, écrit par `ecrireDessin` (donc inerte) mais jamais passé
  par `nettoyerSvg`. Le traiter comme du texte d’éditeur, pas comme une entrée de confiance de plus.
- **Ne pas passer à `baseAnnexes`** une valeur que l’utilisateur contrôle : c’est le dossier d’où l’on charge des scripts.
  Les schémas `javascript:`, `data:`, `blob:`, `vbscript:`, `about:` sont refusés ; une adresse `http(s)` d’un tiers ne l’est
  pas (c’est un choix de l’hôte).
- **Savoir que la page autonome demande ses polices à Google Fonts** (`<link>` dans `outils/editeur-svg/page.html`) :
  c’est une requête de la page, pas de l’entrée, mais elle contredit « rien ne quitte votre navigateur » à la lettre
  (l’adresse IP part chez Google au chargement). Le bundle d’embarquement n’en fait pas.
- **Le stockage** (`localStorage`) est partagé par toute la page de l’origine : un script de l’hôte peut y écrire. L’éditeur
  valide ce qu’il y lit (types, longueurs, clés de prototype retirées), il ne le chiffre pas.

## 6. Constats

Ce qu’un corpus de 166 fichiers, un fuzzer et un navigateur ont trouvé dans la version précédente (sévérité honnête : aucun
n’exécutait de script **dans l’éditeur** ; tous passaient par le fichier ou le texte que la personne récupère ensuite).

| # | Vecteur | Sévérité | Impact | Correction |
|---|---|---|---|---|
| 1 | `<scr<script></script>ipt>` : le nettoyage en une passe recomposait `<script>` | **moyenne** | un `<script>` survivait dans le SVG téléchargé sans édition ; il s’exécute quand ce fichier est ouvert seul dans un navigateur | lecture + liste blanche (`assainirSvg`) |
| 2 | Espaces de noms : `<html:script xmlns:html="…xhtml">`, `xmlns` XHTML sur un `<g>`, `<handler>` | **moyenne** | même conséquence que 1 | éléments préfixés ou inconnus retirés, `xmlns` hors racine retiré |
| 3 | `x:href` (préfixe renommé), `xml:base`, `src=` | faible à moyenne | image distante / lien externe conservés dans le SVG exporté (pixel espion à l’ouverture seule) | tout préfixe hors liste retiré ; `href` limité à `#` et aux images `data:` |
| 4 | CSS obscurci : `u\72l(…)`, `@\69mport`, `image-set("…")`, `url(` non fermé | faible | feuille ou image distante chargée à l’ouverture seule du fichier exporté | CSS résolu avant recherche, répété jusqu’à stabilité |
| 5 | Animation `<set attributeName="href" to="jav&#x61;script:…">` | faible | un lien qui devient `javascript:` au rendu ; il faut ouvrir le fichier seul et cliquer | animations visant `href`/`on*` retirées ; schémas retirés des valeurs décodées |
| 6 | Temps quadratique : `url(` non fermés (3 Mo : plusieurs minutes), `scale(` non fermés dans `transform` (120 Ko : 2,4 s, 1,2 Mo : 4 min), `/*` non fermés | **moyenne** (déni de service de l’onglet) | l’onglet gèle jusqu’à la fermeture | balayages linéaires ; mesuré sur les anciennes expressions : 160 Ko → 0,7 s, croissance quadratique |
| 7 | Travail non borné : 50 000 règles × 300 formes ; un chemin d’un Mo cloné 20 000 fois par `<use>` | **moyenne** (déni de service) | gel de l’onglet de plusieurs dizaines de secondes à des heures | règles rangées + plafond de confrontations ; données de tracé comptées par clone |
| 8 | Imbrication de 10 000 niveaux : `RangeError` dans la lecture | faible | « Ouvrir » ne fait rien (exception non rattrapée) | refus nommé à 1 024 niveaux ; la lecture ne lève plus |
| 9 | `1e308`, `1e999`, `NaN`, un plan de 1e-20 : l’écriture produisait `NaN`, `Infinity`, `width="0"` | faible (intégrité) | SVG enregistré illisible ou corrompu | coordonnées et plan bornés, nombres non finis = erreur de syntaxe |
| 10 | Peinture libre (`fill="red;x"`, caractères de contrôle) écrite telle quelle | faible (intégrité) | XML invalide en sortie | peinture limitée (`peintureSure`) |
| 11 | Stockage empoisonné : `svg.brouillon` ou `svg.versions` de mauvais type | faible | l’accueil ou l’éditeur plante à chaque ouverture jusqu’à vider le stockage (il faut déjà écrire dans l’origine) | validation champ par champ ; clés `__proto__`/`constructor`/`prototype` retirées |
| 12 | `nuancier` d’hôte mal formé : `TypeError` dans l’éditeur | faible | l’éditeur ne s’ouvre pas | entrée écartée |
| 13 | `baseAnnexes: "data:text/javascript,…"` : exécution de code | faible (l’hôte doit déjà être compromis ou naïf) | exécution dans la page de l’hôte | schémas actifs refusés |

**Rien d’exploitable** n’a été trouvé dans : l’interface React (aucune insertion de HTML), les aperçus (`<img>` en `data:`),
la lecture d’entités (jamais développées), l’écriture (`svg` + `path`), les exports PNG et PDF (le PDF ne porte ni
`/JavaScript`, ni `/OpenAction`, ni `/URI`, ni fichier joint ; vérifié sur chaque sortie du navigateur), la bibliothèque
d’hôte (vignettes inertes, insertion par le moteur à plat).

## 7. Les preuves

| Preuve | Où | Ce qu’elle établit |
|---|---|---|
| Invariants de sortie | `tests/unit/securite/invariants.ts` | une spécification exécutable, indépendante de `src/` : XML 1.0 bien formé (analyseur strict), éléments et attributs permis, aucun `<script`, `on*=`, `javascript:`/`vbscript:`/`data:` actif, `href` externe, `url()` externe, `@import`, DOCTYPE, instruction, entité ; pour l’écriture : seulement `svg` et `path` |
| Corpus hostile | `tests/fixtures/hostile/*.svg` (166 fichiers) et `index.json` | un fichier par vecteur, nommé pour lui, avec son attendu (« s’ouvre » ou « est refusé ») |
| Entrées volumineuses | `tests/unit/securite/volumineux.ts` | 100 000 niveaux, 1,1 million d’éléments, un million de points, 64 Mo, bombes de règles et de clones… avec leur temps |
| Fuzzing déterministe | `tests/unit/securite/fuzz.test.ts`, `mutateur.ts` | 12 000 entrées par défaut (octets, jetons, imbrication, nombres, grammaire), graine fixe, aucune exception, aucun appel au-delà de 1,5 s, invariants, relecture de sa propre écriture idempotente |
| Régressions du fuzzer | `tests/fixtures/regressions/` | chaque entrée réduite qui a échoué une fois, rejouée à chaque test |
| Navigateur | `tests/e2e/securite.e2e.ts` | chaque fichier du corpus par code collé, fichier déposé et option `svg` ; fil de détente, aucune requête, aucune boîte de dialogue ; exports SVG, PNG, PDF rouverts en `<img>`, en ligne et en document de premier niveau |
| Stockage empoisonné | `tests/unit/securite/stockage-empoisonne.test.ts` et l’e2e | types faux, clés de prototype, valeurs énormes : rien ne plante, rien ne pollue |

Exploration longue du fuzzer, sans rien changer au dépôt :

```bash
FUZZ_ITERATIONS=200000 FUZZ_GRAINES=11,12,13,14 npx vitest run tests/unit/securite/fuzz.test.ts
FUZZ_ECRIRE=1 …    # écrit l’entrée réduite d’un échec dans tests/fixtures/regressions
```

## 8. Ajouter un vecteur

Un fichier `tests/fixtures/hostile/<famille>-<vecteur>.svg` et sa ligne dans `index.json` (`attendu` : `ouvre` ou
`refus`). Le test du corpus échoue si l’un des deux manque. Un échec du fuzzer se range, réduit, dans
`tests/fixtures/regressions/` avec la correction.
