# Sécurité : le SVG d’un inconnu

L’éditeur ouvre des SVG qu’il n’a pas écrits (fichier déposé, code collé, option `svg` d’un hôte, formes d’une
bibliothèque d’hôte, brouillon laissé dans le navigateur), et des PDF (fichier déposé ou choisi sur l’accueil, avec les
programmes de fonte qu’ils embarquent), et en réécrit. Ce document dit ce qu’il protège, par où
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
| PDF déposé ou choisi | `zones/OuvrirPdf.tsx` → `io/pdf.ts` | `lirePdf` (`engine/pdf/`, pur ; décompression du navigateur injectée), puis le SVG écrit passe par `nettoyerSvgNomme` et `lireDessin` comme un fichier SVG |
| Programme de fonte embarqué dans un PDF (TrueType, OpenType) | `io/policesPdf.ts` | `opentype.js` (épinglé), dans un `try`, une glyphe à la fois ; sa table `cmap` est lue à part, bornée |
| SVG qui porte du texte (fichier, code, option `svg`) | `io/texteSvg.ts` | `lireDessin` avec les fontes de `polices.js` : une forme par lettre, puis le SVG réécrit sans `<text>` |
| Code collé | idem | idem |
| Image à vectoriser | `io/image.ts` | `nettoyerSvg` sur la sortie de vtracer (un texte que nous produisons, d’un contenu que nous ne contrôlons pas) |
| Option `svg` de l’embarquement | `zones/embarque.tsx` → `EditeurSvg` | `lireDessin` **sans** nettoyage préalable (l’éditeur ne montre que le modèle à plat) |
| Bibliothèque d’hôte (option `bibliotheque`) | `io/bibliotheque.ts` | `normaliserBibliotheque`, puis `lireDessin` à l’insertion ; les vignettes sont des `<img src="data:…">` |
| Bibliothèque du build (`bibliotheque.js`) | `io/annexes.ts` | du code que nous avons construit ; hors modèle de menace |
| Brouillon, versions, corrections (`localStorage`) | `io/stockage.ts`, `zones/session.ts`, `zones/Bibliotheque.tsx` | JSON validé champ par champ |
| Options de l’hôte (`titre`, `nom`, `nuancier`, `baseAnnexes`, `stockage`) | `zones/embarque.tsx` (`verifierOptions`) | validées, en français |
| Projet ouvert depuis le site PHP | `site/Site.tsx` → `io/serveur.ts` | `lireProjet` (`model/projet.ts`) : migré, validé champ par champ, borné, puis `etatDuProjet` ; voir § 9 |
| Annexes de données du site PHP (JSON de `data/json`) | `io/annexes.ts` (`definirSourceDonnees`) | les mêmes validations que les globales des scripts |

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

### `lirePdf` : un PDF se lit, rien ne s’y exécute (ADR-0020)

Le PDF est lu par un analyseur linéaire écrit à la main sur ses octets (`engine/pdf/lexique.ts`) : objets, table des objets
classique ou en flux, flux d’objets, chaîne `/Prev`, arbre des pages, contenu de page. **Rien n’est exécuté ni suivi** :
JavaScript (`/OpenAction`, `/AA`, `/JS`), actions `/Launch` et `/URI`, fichiers joints, formulaires XFA ne sont jamais lus
(seuls le catalogue, les pages, leurs ressources et leurs contenus le sont) ; les annotations sont comptées, pas dessinées.
Un PDF chiffré est refusé en le nommant (aucun mot de passe n’est essayé, même vide). La décompression (FlateDecode) passe par
`DecompressionStream`, arrêtée dès que la sortie dépasse la borne : une bombe ne produit jamais plus de 128 Mo. LZW, et les
compressions d’image sur un contenu, sont refusés en le nommant. Un programme de fonte est lu par `opentype.js` dans un `try` :
illisible, la police est remplacée (et c’est dit), jamais une exception. La lecture ne lève jamais pour un fichier : tout refus
est une phrase ; le seul signal qui la traverse, `FluxEnAttente`, est rattrapé par `io/pdf.ts`. Son résultat est un dessin à
plat, écrit par `ecrireDessin` puis relu par `nettoyerSvgNomme` et `lireDessin` : les garanties de l’écriture ci-dessous
s’appliquent telles quelles.

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
| Caractères de texte d’un SVG lu en lettres | 100 000 | `edition/texteSvg.ts` | un livre entier ; au-delà, des dizaines de milliers de formes |

Les bornes de la lecture d’un PDF (`engine/pdf/limites.ts`), chacune un refus nommé :

| Borne | Valeur | Un PDF réel est à… |
|---|---|---|
| Taille du fichier | 100 Mo | un export d’Illustrator avec ses données privées : 60 Mo |
| Octets décompressés, tous flux confondus (FlateDecode, RunLength, ASCII85) | 128 Mo | quelques Mo de contenu |
| Objets de la table, objets lus | 1 000 000 | un atlas de mille pages : quelques centaines de milliers |
| Imbrication de tableaux et dictionnaires | 256 | moins de 10 |
| Renvois enchaînés, sections `/Prev` | 32, 64 | 1 à 3 |
| Pages, profondeur de l’arbre des pages | 100 000, 64 | |
| Pile d’états `q` | 1 024 | moins de 50 |
| Formulaires imbriqués, formulaires dessinés (glyphes Type 3 comprises) | 16, 20 000 | |
| Opérateurs exécutés, opérandes en attente | 5 000 000, 10 000 | |
| Formes, segments de tracé par page | 100 000, 2 000 000 | |
| Coordonnée après transformations | ± 1 milliard | |
| Programme de fonte | 32 Mo (au-delà : remplacé) | les plus grosses fontes CJK : 20 Mo |
| Entrées d’une CMap (`/ToUnicode`), par plage et en tout | 65 536, 200 000 | |
| Fonction PostScript (tons directs) : opérations, pile, imbrication | 10 000, 100, 8 | |

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
- **Rien à savoir sur les polices** : la page autonome ne contacte plus aucun hôte au chargement (ses polices sont dans le
  fichier, voir le constat 14). Le bundle d’embarquement n’en charge pas non plus ; si vous voulez la typographie de la page
  entière chez vous, c’est à vous de servir *Instrument Sans* et *IBM Plex Mono* (voir `docs/integration.md`).
- **Les polices téléchargées** (ADR-0025) : aucune requête tant que la personne ne choisit pas une police non livrée (ouvrir la
  liste, chercher, voir les aperçus n’en font partir aucune) ; seulement vers les serveurs du registre, chaque adresse par le
  préfixe de son serveur (`cdn.jsdelivr.net`, `fonts.bunny.net`, `gitlab.com`, `cdn.fontshare.com`) ; chez un hôte, seulement avec
  `policesEnLigne: true`. La requête ne porte ni cookie ni référent ; chaque fichier est vérifié par son empreinte sha256
  (`crypto.subtle`) contre l’index commis avant d’être lu par opentype.js : un serveur compromis ou un miroir d’une autre
  version ne fait lire aucun octet inattendu, et le refus est dit. Le fichier est borné (8 Mo, puis les bornes du WOFF :
  256 tables, 32 Mo décompressés). L’index (`polices-catalogue.js`) est validé en entier (licence de la liste blanche, version
  épinglée, empreinte, chemin sans « .. », adresse qui commence par le préfixe de son serveur). Le réseau ne passe que par `io/` :
  le téléchargement d’une police (`io/policesEnLigne.ts`) et, pour le site PHP seulement, son serveur (`io/serveur.ts`, § 9) ; un
  test le garde. Les aperçus (`polices-apercus.js`, ADR-0026) sont validés de même avant d’être crus (forme, cadre, clés, caractères et
  longueur de chaque code, taille totale bornée) ; un code se décode par une fonction pure qui ne lève jamais, et une annexe refusée laisse
  les noms écrits.
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
| 14 | La page autonome chargeait *Instrument Sans* et *IBM Plex Mono* chez Google (`fonts.googleapis.com`, `fonts.gstatic.com`) | faible (vie privée, RGPD) | l’adresse IP et l’en-tête de la personne partaient chez un tiers à chaque ouverture, ce qui contredisait « Rien ne quitte votre navigateur » (aucune donnée du dessin n’était concernée) | **corrigé** : le sous-ensemble latin des deux fontes (paquets `@fontsource`, SIL OFL 1.1, épinglés) est incorporé à `dist/editeur-svg.html` en `data:` URI (`scripts/fontes-interface.mjs`) ; la page n’a plus aucun `<link>` ni hôte à contacter |

**Rien d’exploitable** n’a été trouvé dans : l’interface React (aucune insertion de HTML), les aperçus (`<img>` en `data:`),
la lecture d’entités (jamais développées), l’écriture (`svg` + `path`), les exports PNG et PDF (le PDF ne porte ni
`/JavaScript`, ni `/OpenAction`, ni `/URI`, ni fichier joint ; vérifié sur chaque sortie du navigateur), la bibliothèque
d’hôte (vignettes inertes, insertion par le moteur à plat).

## 7. Les preuves

| Preuve | Où | Ce qu’elle établit |
|---|---|---|
| Invariants de sortie | `tests/unit/securite/invariants.ts` | une spécification exécutable, indépendante de `src/` : XML 1.0 bien formé (analyseur strict), éléments et attributs permis, aucun `<script`, `on*=`, `javascript:`/`vbscript:`/`data:` actif, `href` externe, `url()` externe, `@import`, DOCTYPE, instruction, entité ; pour l’écriture : seulement `svg` et `path` |
| Corpus hostile | `tests/fixtures/hostile/*.svg` (166 fichiers) et `index.json` | un fichier par vecteur, nommé pour lui, avec son attendu (« s’ouvre » ou « est refusé ») |
| Corpus de PDF hostiles | `tests/fixtures/hostile-pdf/*.pdf` (39 fichiers) et `index.json`, fabriqués par `tests/unit/securite/hostilesPdf.ts` | bombes (FlateDecode, flux d’objets, RunLength), chiffrement, boucles (`/Prev`, arbre des pages, formulaires, glyphe Type 3), renvois en chaîne, tables démesurées, fichier tronqué, coordonnées démesurées, programmes de fonte tronqués ou faux, CMap démesurée, JavaScript et actions : par la lecture pure et par la voie de la page (`DecompressionStream`), aucune exception, un temps borné, l’attendu, et les invariants de l’écriture sur ce qui s’ouvre (`tests/unit/securite/corpus-pdf.test.ts`) |
| Fuzzing des PDF | `tests/unit/securite/fuzz-pdf.test.ts` | 4 000 PDF par défaut, mutés octet par octet ou engendrés par une grammaire d’opérateurs (texte compris), graine fixe : aucune exception, aucun appel au-delà de 1,5 s, invariants de l’écriture ; 70 000 de plus explorés à l’écriture de l’ADR-0020 sans un échec |
| Entrées volumineuses | `tests/unit/securite/volumineux.ts` | 100 000 niveaux, 1,1 million d’éléments, un million de points, 64 Mo, bombes de règles et de clones… avec leur temps |
| Fuzzing déterministe | `tests/unit/securite/fuzz.test.ts`, `mutateur.ts` | 12 000 entrées par défaut (octets, jetons, imbrication, nombres, grammaire), graine fixe, aucune exception, aucun appel au-delà de 1,5 s, invariants, relecture de sa propre écriture idempotente |
| Régressions du fuzzer | `tests/fixtures/regressions/` | chaque entrée réduite qui a échoué une fois, rejouée à chaque test |
| Navigateur | `tests/e2e/securite.e2e.ts` | chaque fichier du corpus par code collé, fichier déposé et option `svg` ; fil de détente, aucune requête, aucune boîte de dialogue ; exports SVG, PNG, PDF rouverts en `<img>`, en ligne et en document de premier niveau |
| Aucune requête à un hôte | `tests/unit/depot/page-hors-ligne.test.ts` et `tests/e2e/hors-ligne.e2e.ts` | le texte de la page composée n’a ni `<link>`, ni `@import`, ni adresse, et chaque `url()` est une `data:` ; en navigateur, **tout le réseau coupé**, l’accueil, la voie image (avec une vectorisation) et l’éditeur s’ouvrent sans la moindre requête, et les polices se chargent et rendent le texte. `securite.e2e.ts` n’admet plus aucune exception de police |
| Stockage empoisonné | `tests/unit/securite/stockage-empoisonne.test.ts` et l’e2e | types faux, clés de prototype, valeurs énormes : rien ne plante, rien ne pollue |

Exploration longue du fuzzer, sans rien changer au dépôt :

```bash
FUZZ_ITERATIONS=200000 FUZZ_GRAINES=11,12,13,14 npx vitest run tests/unit/securite/fuzz.test.ts
FUZZ_ECRIRE=1 …    # écrit l’entrée réduite d’un échec dans tests/fixtures/regressions
```

## 8. Ajouter un vecteur

Un PDF : une entrée dans `HOSTILES` (`tests/unit/securite/hostilesPdf.ts`), puis
`ACTUALISER_REFERENCES=1 npx vitest run tests/unit/securite/corpus-pdf.test.ts`, qui écrit le fichier et sa ligne
d’`index.json` ; le test échoue si le fichier, la ligne et l’entrée ne se correspondent pas.

Un SVG :

Un fichier `tests/fixtures/hostile/<famille>-<vecteur>.svg` et sa ligne dans `index.json` (`attendu` : `ouvre` ou
`refus`). Le test du corpus échoue si l’un des deux manque. Un échec du fuzzer se range, réduit, dans
`tests/fixtures/regressions/` avec la correction.

## 9. Le site PHP (ADR-0030)

Le site PHP ajoute ce que la page autonome n’a pas : un serveur, un mot de passe, des projets enregistrés. Ce qui précède vaut tel
quel pour l’éditeur qu’il monte ; voici ce qu’il protège de plus, et comment c’est prouvé.

| Actif | Menace | Garantie |
|---|---|---|
| L’accès au site | deviner le mot de passe, voler la session, forcer une connexion | un seul mot de passe, en empreinte (`password_hash`, argon2id ou bcrypt) dans `data/pwd`, posé en ligne de commande ; `password_verify` en temps constant ; trois essais libres par client puis un délai qui double jusqu’à 15 min, sans même vérifier pendant l’attente ; jeton CSRF sur le formulaire ; `session_regenerate_id` à la connexion ; cookie `HttpOnly`, `SameSite=Strict`, `Secure` en HTTPS ; expiration d’inactivité ; sessions dans `data/sessions` |
| Les projets | écriture par un autre site, écrasement par un autre onglet, chemin hostile, fichier géant, JSON piégé | toute route exige la session ; toute écriture exige POST, du JSON, le jeton CSRF (`X-CSRF`, `hash_equals`) et pas un autre site (`Sec-Fetch-Site`) ; un identifiant de disque tiré au hasard (`[a-f0-9]{16}`), seul à fabriquer un chemin, le nom affiché à part et assaini ; la révision ouverte exigée pour écraser (409, 428) ; taille bornée avant lecture (413) ; JSON analysé à profondeur bornée, structure et format vérifiés (400) ; écriture sous verrou, d’un seul geste ; suppression vers une corbeille |
| L’éditeur qui rouvre un projet | un projet altéré sur le disque ou en transit | `lireProjet` migre, valide chaque champ et chaque borne, refuse en le nommant sans lever, reconstruit le projet sans champ inconnu ni clé de prototype ; les peintures suivent la règle de l’écriture ; une fonte déposée relue doit redonner son identifiant (empreinte de ses octets) |
| Le navigateur | un tiers qui voit l’adresse de la personne, un script injecté | aucune requête hors du site : la politique de sécurité n’autorise que `'self'` (`connect-src 'self'`, aucun domaine tiers) ; les polices du catalogue passent par le serveur ; la vignette d’un projet est le SVG de l’éditeur, refusée au moindre élément ou attribut actif, servie avec `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox` et `nosniff` |
| Le serveur | une police détournée, une requête vers un hôte arbitraire, une fuite d’information | une police ne se demande que par une empreinte sha256 présente dans l’index (sinon 404, avant toute requête) ; les adresses sont recalculées de l’index et des préfixes de `POLICES_SOURCES`, sans redirection, HTTP(S) seulement, 8 Mo au plus ; une empreinte fausse n’est jamais rangée ; aucune erreur PHP affichée (journal dans `data/journal/`), pas de `X-Powered-By`, `config.php` et `inc/` muets demandés directement |
| `data/` | lu depuis le Web | hors de la racine web par défaut ; sinon `data/.htaccess` (« Require all denied ») et `index.php` qui vérifie que `data/pwd` ne répond pas, et avertit sinon |

En-têtes de chaque page et de l’API : `Content-Security-Policy: default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src
'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; manifest-src 'none'; base-uri 'none';
form-action 'self'; frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options:
DENY`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `Permissions-Policy`, et
`Strict-Transport-Security` en HTTPS. `unsafe-inline` reste pour les styles parce que l’éditeur pose des attributs `style` ;
`wasm-unsafe-eval` pour le traceur.

**Limites, honnêtement** : un seul mot de passe pour tous ; la limitation se compte par client (une attaque répartie n’est ralentie
que par le coût de l’empreinte) ; les projets ne sont pas chiffrés sur le disque ; la vérification HTTP de `data/pwd` demande cURL ;
le journal des connexions garde une empreinte salée de l’adresse, pas l’adresse.

**Les preuves** :

| Preuve | Où | Ce qu’elle établit |
|---|---|---|
| Lecture d’un projet | `tests/unit/model/projet.test.ts` | refus nommés champ par champ, bornes, version plus récente refusée, chaîne de migration complète, clé de prototype et champ inconnu écartés, 2 000 projets mutés au hasard sans exception |
| Aller-retour | `tests/unit/engine/projet.test.ts` | projet → dessin → projet identique, et le même SVG octet pour octet, sur chaque référence de `tests/fixtures/svg` |
| Client de l’API | `tests/unit/io/serveur.test.ts` | jeton CSRF sur chaque écriture, révision sur un écrasement, projet invalide refusé, réseau coupé et réponse illisible sans exception |
| Fonctions du serveur | `tests/php/unitaires.php` | noms et identifiants hostiles, structure d’un projet, vignette piégée, écriture atomique, contrôle de version, corbeille, empreinte du mot de passe, délai des essais, police hors index, adresses d’un index altéré |
| Le site par HTTP | `tests/php/http.php` (`npm run test:php`) | en-têtes, cookie, bon et mauvais mot de passe, CSRF de connexion, limitation, installation sans `data/pwd`, toute route sous session, écritures sous jeton, chemins hostiles, JSON invalide, profond ou géant, conflit de révision, police servie, empreinte fausse refusée, hors index refusé, déconnexion, expiration |
| Navigateur | `tests/e2e/site-php.e2e.ts` | contre `php -S` sur `dist/php` : la page ne contacte que le site, la politique de sécurité appliquée, axe sans violation grave sur la connexion et l’écran Projets |
