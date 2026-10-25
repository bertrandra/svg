# ADR-0026 — Les aperçus des polices : le nom dessiné dans sa fonte, sans aucune requête, une ligne par famille

**Date :** 25 octobre 2026
**Statut :** acceptée (prolonge l’ADR-0025 §6 ; s’appuie sur les ADR-0008, 0011, 0014, 0017 et 0022) ; **aucun octet écrit ne
change** : l’aperçu n’est qu’un affichage de la liste, il n’entre ni dans le dessin ni dans un export

## Contexte

Dans « Toutes les polices » (ADR-0025), chaque ligne écrivait le nom de la famille dans la police de l’interface : on ne voyait
l’allure d’une police qu’après l’avoir téléchargée (alors après avoir donné son accord à un serveur ; cet accord est retiré
depuis l’amendement de l’ADR-0025 du 25 octobre 2026 : le choix d’une police vaut demande). Décision du propriétaire :
**voir les polices en parcourant la liste, sans aucune requête réseau et sans rien choisir**, en deux parties :

1. les polices **déjà disponibles** (les dix livrées, celles téléchargées dans la session, les polices déposées ou de
   l’appareil) se dessinent dans leur propre fonte, calculées sur place ;
2. **tout le catalogue** se prépare à l’avance : le nom de chaque famille dessiné une fois, à la main, dans un fichier de données
   commis, livré dans une annexe voisine chargée à l’ouverture de la liste.

## Décision

### 1. Un même calcul pour la page et pour le script

`engine/texte/apercuNom.ts` (`tracerNom`, pur) compose le nom par `composerEtMesurer` (engine/texte.ts, inchangé), au **corps de
32 unités par em**, la ligne de base en y = 0, le bord gauche de la première lettre en x = 0, puis arrondit chaque coordonnée à
l’unité et simplifie ce que l’œil ne voit pas : une courbe dont les poignées restent à moins d’une demi-unité de sa corde devient
un segment, des segments presque alignés n’en font qu’un (chaque point retiré reste à moins d’une demi-unité du segment qui le
remplace), un segment nul disparaît. À 24 px pour le cadre de 43 unités, l’écart est d’un tiers de pixel au plus. Une lettre qui
commence au-delà de **400 unités** n’est pas dessinée (une ligne de la liste n’en montre pas plus). Un nom vide, ou une lettre
que la fonte n’a pas (elle dessinerait sa glyphe « manquante »), ne se dessine pas : la ligne écrit le nom.

Le script et la page appellent la même fonction : un aperçu préparé et un aperçu calculé sur place pour la même fonte ont le même
tracé.

### 2. Les polices disponibles : calculées sur place, une fois

`zones/apercusPolices.ts` choisit, ligne par ligne, **la police disponible d’abord** (une fonte livrée, déposée, de l’appareil,
ou une variante de la famille téléchargée dans la session : la principale de préférence), **puis l’aperçu préparé, puis le nom
écrit**. Un aperçu se calcule une fois par police et par nom (`WeakMap` sur l’objet `Police`, stable dans la session) et se
décode une fois par annexe (ADR-0008). Seules les lignes visibles le demandent : le fenêtrage (seuil 150) reste. Une fonte
déposée étrange, qui lèverait en composant, laisse le nom écrit. La police à trait unique se peint au trait, sans fond.

Une police gardée dans Cache Storage mais pas encore relue dans la session montre l’aperçu préparé : relire le cache sans geste
contournerait la règle de l’ADR-0025 (rien sans le choix de la police), et c’est le même fichier, vérifié par la même empreinte,
composé par la même fonction.

### 3. Tout le catalogue : un instantané commis, jamais construit en ligne

`scripts/apercus-polices.mjs`, relancé **à la main** après un rafraîchissement de l’index (jamais au build), prend pour chaque
famille sa **variante principale** (celle que la page choisit), télécharge son fichier latin (ou complet) **à l’adresse même que
la page emploierait**, le **vérifie par l’empreinte sha256 de l’index avant de le lire**, le remet en sfnt et le lit par le code
de la page (`io/woff.ts`, `io/polices.ts`), n’ajoute le latin étendu que si le nom a une lettre que le latin n’a pas, et dessine
le nom par `tracerNom`. Il vérifie que chaque code se relit à l’identique, valide le fichier par la fonction de la page
(`validerApercus`) et écrit `data/apercus-polices.json` (une famille par ligne, pour qu’un rafraîchissement se relise dans un
diff ; sa date est celle de l’index). `APERCUS_CACHE=<dossier>` garde les fichiers téléchargés entre deux passes.

À l’instantané du 25 octobre 2026 : **2 163 familles sur 2 205 ont un aperçu**. Les **42** autres écrivent leur nom (les cinq
dernières de ce tableau, illisibles, sont depuis retirées de l’index par `FAMILLES_ILLISIBLES` : il reste 2 200 familles, dont
2 163 avec aperçu, et 37 sans) :

| Raison | Familles |
|---|---|
| Aperçu trop lourd (plus de 8 192 caractères ou 4 000 commandes : fontes en pixels, en points, texturées) | 24 : Bitcount (4), Jacquard et Jersey « Charted » (7), Yarndings (2), dix Rubik décoratives, Fredericka the Great, Edu AU VIC WA NT Dots, Flor de Ruina (Velvetyne) |
| Une lettre du nom manque à la fonte (fontes de symboles ou de signes) | 13 : Allkin, Bravura, Bravura Text, DSEG Weather, DSEG7 SEGG Chan (2), Ponnala, YakuHanJP et ses cinq sœurs |
| Le fichier « .woff » servi est en réalité du WOFF2, que l’éditeur ne lit pas | 4 : Pitagon Sans, Sans Mono, Sans Text, Serif |
| WOFF mal formé (une table hors du fichier) | 1 : Peace Sans |

Les cinq dernières ne se liraient pas non plus une fois téléchargées dans l’éditeur : le script le révèle, l’index ne change pas
ici. Aucun fichier n’a été refusé pour son empreinte, aucun serveur n’a manqué (jsDelivr, GitLab et Fontshare joignables par le
proxy de l’atelier).

### 4. Un codage compact, décodé par une fonction pure

Un aperçu est une chaîne : sa largeur, puis ses commandes `M`, `L`, `Q`, `C`, `Z`. Chaque coordonnée est l’écart au point
précédent, écrite en longueur variable sur un alphabet de 64 caractères sans les cinq lettres de commande, sans guillemet, barre
oblique inverse ni chevron (un caractère de −15 à 15, deux jusqu’à 511, cinq bits par caractère, le sixième dit « la suite
vient ») ; la lettre ne se répète pas (après `M`, des points sans lettre sont des `L`, comme dans un chemin SVG). Le texte reste du
JSON sans échappement, posé tel quel dans une balise `<script>`. `model/apercusPolices.ts` (pur) porte l’encodeur, le décodeur (qui
**ne lève jamais** : caractère inconnu, commande tronquée, nombre sans fin, coordonnée au-delà de ±4 096, plus de 4 000 commandes
rendent `null`), le chemin SVG absolu en entiers et la boîte de vue.

Le cadre est le même pour toutes les familles (les polices se comparent à la même taille, comme sur un spécimen) : **30 unités
au-dessus de la ligne de base, 13 au-dessous**, dessiné à **24 px** de haut. Mesuré sur l’instantané : l’étendue au-dessus est de
24 unités en médiane, 30 à 95 %, 35 à 99 % ; au-dessous, 1, 13 et 19. 103 noms dépassent un peu en haut et 109 en bas (des
capitales ornées, des descendantes de scriptes), rognés au bord du cadre ; 65 noms sont coupés à la largeur.

### 5. L’annexe : chargée à la demande, crue après validation

`scripts/polices.mjs` valide l’instantané et en fait `dist/polices-apercus.js` (`window.__apercusPolicesSvg`), que
`io/apercusPolices.ts` charge par une balise `<script>` quand la personne ouvre « Toutes les polices », en même temps que l’index
(même mécanisme que `polices-catalogue.js`, `io/annexes.ts`). La globale est validée entièrement avant d’être crue (ADR-0014) :
forme, **cadre identique à celui du programme**, chaque clé (`dépôt:famille`, la clé des favoris), chaque code (ses caractères, au
plus 8 192), au plus 10 000 entrées et **6 Mo au total** ; une valeur malformée ou trop grosse est refusée **sans lever**, rangée
dans une `Map` (aucune clé de prototype ne se lit). Absente ou refusée : la liste le dit (« Les noms s’écrivent sans aperçu. Le
fichier polices-apercus.js est introuvable… ») et écrit les noms ; les polices disponibles se dessinent toujours. Pas de
découpage : l’annexe reste sous les 3 Mo bruts.

### 6. L’interface

Un aperçu est une **image décorative** : l’SVG est `aria-hidden`, non focalisable, et la ligne garde son nom accessible en texte
(`.sr-only`) ; le bouton se nomme toujours « Roboto Slab Google Fonts ». Le tracé est peint en `currentColor` : la couleur du
texte du bouton, donc les jetons, les deux thèmes et le contraste forcé. Haut de 24 px (`1.5rem`), il ne grandit pas la ligne
(28 px à la souris, 40 px au doigt) ; un nom plus long que la ligne est **coupé à son bord**, il n’élargit jamais la liste (vérifié
à 390 px). Pas de `<text>`, pas de `@font-face` : des contours, comme tout texte de l’éditeur (ADR-0022).

### 7. Une ligne par nom de famille

Décision du propriétaire, prise en cours de route : la liste montrait plusieurs fois la même famille. **35 familles** existent dans
l’index sous Google Fonts (dépôt Fontsource, versions récentes, latin et latin étendu) **et** sous Fontshare (Bebas Neue 5.3.0 et
2.0, Oswald, Anton, Archivo, Lora, Manrope, Fira Sans, JetBrains Mono…), et les **huit familles livrées** (Inter, Oswald, Bebas
Neue, Playfair Display, Lobster, Pacifico, Caveat, Fredoka) revenaient en « Livrée » puis en Google Fonts (Bebas Neue et Oswald
trois fois).

La règle est pure et vit dans `model` : `uneParNom` et `famillesMontrees` (`model/cataloguePolices.ts`) regroupent par nom de
famille normalisé (casse, accents et ponctuation ignorés) et ne gardent, pour chaque nom, que la source la mieux placée dans
**`PREFERENCE_SOURCES`** (`model/sourcesPolices.ts`, une donnée) : **la livrée**, puis **Google Fonts**, les autres catalogues
servis par Fontsource, Velvetyne, et **Fontshare en dernier** (adresses non versionnées, ITF FFL). Le nom de famille d’une fonte
livrée est une donnée (`FAMILLES_LIVREES`, `model/polices.ts` : « Playfair Display gras » est de la famille Playfair Display).
Deux polices de la même source gardent leur ligne (Inter et Inter gras, livrées toutes deux) ; une fonte déposée ne cache rien.

- La ligne montrée se choisit sur **toutes** les entrées, pas sur ce qu’un filtre laisse : la même police représente sa famille
  quelle que soit la recherche, et le total (« 2 166 polices ») compte les lignes montrées. Une famille livrée de plusieurs
  styles n’a qu’une ligne : Inter gras se choisit dans « Style » d’Inter (`stylesLivres`), qui remplace l’ancienne case « Gras »
  de l’inspecteur ; la fonte grasse garde son identifiant (`inter-gras`), aucun octet ne change.
- **Choisir une source** dans le filtre « Source » montre toutes ses familles, sans les confronter à la source préférée : Bebas Neue
  de Fontshare se trouve en filtrant Fontshare.
- Les **favoris** et les **récentes** suivent la même règle (deux favoris d’une famille de deux sources n’en font qu’un) ; une
  police d’une source cachée y est nommée avec sa source, comme dans **« Dans ce document »** : « Bebas Neue (Fontshare) ».
- Rien ne quitte l’index : un texte composé dans une variante `c-…` d’une source cachée garde son `data-ed-police`, se recompose à
  l’identique (`trouverVariante` cherche toujours dans tout l’index) et se télécharge à sa source.
- L’aperçu préparé suit la ligne montrée (sa clé est celle de la famille de la ligne).

### 8. Conformité

L’annexe ne contient **aucune fonte** : ni table de glyphes, ni autre lettre que celles du nom, ni moyen d’écrire autre chose.
C’est un spécimen, un rendu du nom par la fonte, ce que chaque licence admise permet (OFL, Apache 2.0, UFL, CC0, ITF FFL : l’usage
de la fonte pour produire une image, y compris commerciale ; rien n’est redistribué de la fonte elle-même). `THIRD-PARTY-NOTICES.md`
le dit à côté de l’index.

## Conséquences

- **Octets** : aucun (`ecriture-stable.test.ts` vert sans `ACTUALISER_REFERENCES`) ; l’aperçu ne touche ni le dessin ni un export.
- **Poids** : `data/apercus-polices.json`, commis, **1,93 Mo** (0,64 Mo compressé) ; `dist/polices-apercus.js` **1,93 Mo brut,
  0,64 Mo gzip**, chargé à la demande, facultatif ; la page autonome prend **7,8 Ko** (2,7 Ko compressés, aperçus et une ligne par famille), le bundle
  d’embarquement 7,4 Ko. Le codage compact et la simplification ont ramené l’annexe de ce qu’aurait coûté un chemin SVG relatif
  (environ 2,5 fois plus) à 1,93 Mo ; sans la simplification, il pesait 2,68 Mo.
- **Tests** : unitaires (aller-retour exact du codage, bornes, codes mal formés sans lever ; annexe hostile ou trop grosse refusée
  sans lever ; l’instantané commis relu en entier, chaque clé dans l’index, chaque code décodable ; le nom composé en entiers, coupé
  à la largeur, simplifié, une vraie fonte ; le choix disponible > préparé > nom, mémorisé ; le chargeur qui dit un fichier absent
  ou malformé) ; en navigateur, réseau entièrement coupé : des aperçus pour les fontes livrées et pour des familles de chaque dépôt
  (Fontsource, Velvetyne, Fontshare) sans aucune requête, l’annexe absente qui retombe au nom et le dit, une police téléchargée qui
  se dessine dans sa fonte, 390 px sans débordement et des lignes de 40 px ; axe audite le sélecteur avec ses aperçus (clair,
  sombre, téléphone). Une ligne par nom de famille : la règle en unitaire (livrée > Google Fonts > Fontshare, ordre de l’index
  gardé, source choisie explicitement, deux livrées d’une même famille, police déposée, variante `c-…` de Fontshare retrouvée par
  son identifiant, l’index commis : 35 doubles et 8 familles livrées) ; en navigateur, « bebas » donne une seule ligne (Livrée),
  celle de Fontshare quand on filtre Fontshare, et le total compte 2 166 lignes.
- **Limites, honnêtement** : 42 familles sans aperçu (tableau plus haut) ; un nom coupé à son bord n’a pas de points de suspension ;
  quelques ornements et descendantes rognés par le cadre ; l’aperçu montre la variante principale, pas le style qu’on choisira ;
  il faut relancer le script après chaque rafraîchissement de l’index (une famille nouvelle sans aperçu écrit son nom, une clé
  disparue de l’index est ignorée).

## Alternatives écartées

- **Télécharger les fontes pour les montrer** : contraire à l’ADR-0025 (aucune requête sans le choix d’une police) et à l’ADR-0017.
- **Une image (PNG, sprite) par famille** : plus lourd, flou au zoom et en haute densité, et une couleur figée qui ignorerait les
  thèmes et le contraste forcé.
- **Un sous-ensemble de fonte par famille (les lettres du nom en WOFF, `@font-face`)** : redistribuerait un morceau de fonte (l’ITF
  FFL l’interdit), demanderait une fonte par ligne et un `@font-face` que la page n’a jamais employé.
- **Des chemins SVG en clair** : environ 2,5 fois plus lourds, au-delà des 3 Mo, donc une annexe découpée en tranches.
- **Construire les aperçus au build** : le build contacterait le réseau, et deux builds d’un même commit pourraient différer.
