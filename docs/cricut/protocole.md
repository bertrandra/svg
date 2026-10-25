# Protocole d’essai Cricut : figer les valeurs « à vérifier »

Le contexte de production Cricut (ADR-0013) repose sur des valeurs et des comportements de Design Space que nous
connaissons **de mémoire ou par la documentation**, pas par un essai. Chacune porte `aVerifier: true` et une note
dans `src/model/contextes.ts`, et le panneau « Prêt pour Cricut » les marque « à vérifier ». Ce protocole dit
comment les vérifier sur une vraie machine, avec huit SVG témoins (dans [`temoins/`](temoins/)), et où noter ce
qu’on observe. Une fois rempli, il suffit de reporter les valeurs mesurées dans `src/model/contextes.ts`, de
retirer `aVerifier` de celles qui sont confirmées, et d’annoncer le changement dans `CHANGELOG.md`.

Les témoins sont fabriqués par les mêmes fonctions que l’éditeur (export Cricut, Print Then Cut, ou l’écriture
ordinaire quand l’essai porte sur ce que l’export refuse) et un test vérifie qu’ils ne dérivent pas
(`tests/unit/export/temoins-cricut.test.ts`).

## Ce qu’il faut

- Une Cricut Maker, Maker 3, Explore Air 2 ou Explore 3 (la Joy pour les valeurs de ses tapis), un tapis
  12 × 12 po, une lame fine.
- Du papier cartonné uni (noter le grammage), et pour Print Then Cut une imprimante et du papier cartonné blanc
  imprimable au format Lettre.
- Une règle graduée en pouces et en millimètres, idéalement un pied à coulisse.
- Design Space à jour (noter sa version et le système : Windows, macOS, iPad…).

> Version de Design Space, système, machine, papier :
>
>

Pour chaque témoin : **Importer** dans Design Space (« Charger » une image, choisir le fichier SVG), ne pas
redimensionner, puis lire les champs Largeur et Hauteur de l’objet sélectionné **avant** toute modification.

---

## Témoin 1 — la taille exacte

Fichiers : `temoin-1-taille.svg` (avec unités : `width="7in" height="3.5in"`) et `temoin-1b-sans-unite.svg`
(le même dessin, écrit sans unité comme le fait l’enregistrement ordinaire, à 96 unités par pouce).

Le dessin : un carré de 2 po de côté, et une règle de 6 po (une bande de 1/2 po de haut, une encoche de 1/8 po de
large tous les demi-pouces, plus profonde aux pouces entiers).

Ce qu’on vérifie : `designSpace.pxNu` (Design Space lit-il une longueur sans unité à 72 ppp ?), et que l’export
avec unités arrive à la bonne taille.

À observer :

1. `temoin-1-taille.svg` : le carré mesure **2 × 2 po** dans Design Space, la règle 6 po ; après la coupe, le carré
   mesure 50,8 mm à la règle et les encoches tombent sur les pouces d’une vraie règle.
2. `temoin-1b-sans-unite.svg` : s’il arrive à **75 %** (carré de 1,5 po), Design Space lit bien le px nu à 72 ppp ;
   s’il arrive à 2 po, il le lit à 96 ppp (et la valeur 72 est fausse).
3. Les marges blanches autour du dessin (le cadre du SVG est plus grand que le dessin) : Design Space les garde-t-il
   dans la taille de l’objet (7 × 3,5 po) ou les rogne-t-il (6 × 2,75 po environ) ? La taille des pièces ne doit pas
   en dépendre.

> Résultat observé (taille du carré, de la règle, de l’objet entier, pour les deux fichiers ; mesure après coupe) :
>
>

## Témoin 2 — le trou

Fichier : `temoin-2-trou.svg`. Deux anneaux identiques de 2 po (trou de 1 po), de la même couleur, chacun un seul
tracé composé : à gauche en **pair-impair** (`fill-rule="evenodd"`, les deux cercles tournent dans le même sens), à
droite **selon le sens du tracé** (`nonzero`, le cercle intérieur tourne à l’envers).

Ce qu’on vérifie : le constat « pair-impair » du panneau (aujourd’hui un conseil marqué « à tester ») et la
correction « Réécrire les trous ».

À observer : dans Design Space, chaque anneau est-il un anneau (le trou vide, découpé) ? Ou l’anneau de gauche
devient-il un disque plein, ou deux disques ? Faire la coupe : le trou tombe-t-il ?

> Résultat observé (gauche / droite) :
>
>

## Témoin 3 — deux couleurs presque égales

Fichier : `temoin-3-couleurs-proches.svg`. Deux carrés de 1,5 po, `#c81e28` et `#d1212b` : environ 2 % d’écart
(0,0196 en OKLab), ce que l’œil devine à peine.

Ce qu’on vérifie : `cricut.materiaux.papier-cartonne.seuils.fusionNuances` (aujourd’hui 0,04), et le principe « une
couleur, une couche, un tapis ».

À observer : Design Space fait-il **deux couches** (deux tapis à la découpe) ? À l’écran, distingue-t-on les deux
rouges ? Si on choisissait deux papiers pour ces couleurs, seraient-ils différents ? (La valeur de fusion dit à
partir de quel écart deux couleurs sont « le même papier » : c’est un jugement, notez le vôtre.)

> Résultat observé (nombre de couches, de tapis ; les deux rouges sont-ils distincts à vos yeux ?) :
>
>

## Témoin 4 — le trait, et le détail minimal

Fichier : `temoin-4-trait.svg` (écrit sans passer par l’export Cricut, qui refuserait le trait). À gauche, un carré
rouge de 1,5 po avec un **trait noir épais de 1/8 po**, non converti. À droite, quatre bandes noires de 2 po de
haut, larges de **1/32, 1/16, 3/32 et 1/8 po**.

Ce qu’on vérifie : le constat « trait » (Design Space découpe le tracé, pas l’épaisseur), et
`cricut.materiaux.papier-cartonne.seuils.detailMin` (aujourd’hui 1/16 po).

À observer :

1. Le carré : Design Space montre-t-il le trait ? Combien de couches (une rouge, une noire, ou une seule) ? À la coupe,
   la lame suit-elle le milieu du trait (un carré de 1,5 po), son bord extérieur (1,625 po) ou autre chose ?
2. Les bandes : lesquelles sortent entières et propres, lesquelles se déchirent ou se tordent ? La plus fine qui
   tient donne le détail minimal de ce papier.

> Résultat observé (carré : couches, taille coupée ; bandes : 1/32, 1/16, 3/32, 1/8) :
>
>

## Témoin 5 — plus grand que le tapis

Fichier : `temoin-5-depasse-le-tapis.svg` (écrit sans l’export Cricut, qui refuserait). Trois bandes de 1 po de haut,
chacune de sa couleur (donc chacune sur son tapis) : **11,5 po** (noire), **11,75 po** (bleue) et **12,5 po** (rouge)
de large.

Ce qu’on vérifie : `cricut.tapis.12x12.zoneUtile.largeur` et `cricut.tapis.12x12.zoneUtile.hauteur` (aujourd’hui
11,5 po), `cricut.tapis.12x24.zoneUtile.largeur`, `cricut.tapis.12x24.zoneUtile.hauteur`, et ce que Design Space fait
d’un dessin dont les pièces tiennent mais pas l’ensemble (constat « dépassement », marqué « à vérifier »).

À observer : au moment de « Créer », sur le tapis 12 × 12 po, quelles bandes Design Space accepte-t-il ? Refuse-t-il
avec un message (lequel) ? Sur le tapis 12 × 24 po, même question. Essayez aussi une bande de 11,5 po **debout** si
possible, pour la hauteur utile. Avec plusieurs pièces de la même couleur, Design Space garde-t-il leur disposition
ou les répartit-il sur le tapis ?

> Résultat observé (12 × 12 : bandes acceptées ; 12 × 24 : bandes acceptées ; messages ; disposition) :
>
>

## Témoin 6 — Print Then Cut

Fichiers : `temoin-6-print-then-cut-impression.svg` (l’image à imprimer, avec un fond perdu de 1/16 po autour de la
coupe) et `temoin-6-print-then-cut-coupe.svg` (la ligne de coupe : la silhouette extérieure, une seule forme). Les
deux ont le même cadre et la même taille (5 × 3 po) : posés au même endroit, ils se superposent. Depuis l’éditeur,
« Exporter pour Cricut » en Print Then Cut livre les mêmes fichiers dans une archive ZIP, avec un PNG à 300 ppp et un
mode d’emploi.

Ce qu’on vérifie : `cricut.printThenCut.largeurMax`, `cricut.printThenCut.hauteurMax` (aujourd’hui 6,75 × 9,25 po),
`cricut.printThenCut.fondPerdu` (1/16 po), et surtout **la façon de monter les deux fichiers dans Design Space**,
que nous n’avons pas pu essayer.

À observer :

1. Importer l’image à imprimer, choisir « Imprimer puis découper » : Design Space découpe-t-il autour du bord du fond
   perdu (trop large de 1/16 po) ? Ajoute-t-il son propre fond perdu (réglage « Fond perdu ») ?
2. Importer aussi la ligne de coupe, à la même taille, centrée sur l’image : peut-on obtenir que la machine imprime
   l’image et coupe sur la ligne (en les attachant, en les aplatissant, autrement) ? Décrire la manipulation qui
   marche.
3. Après la coupe : reste-t-il un liseré blanc ? La coupe est-elle décalée, de combien ?
4. Une image plus grande (un dessin de 7 × 9 po, ou couché de 9,25 × 6,75 po) : Design Space l’accepte-t-il en Print
   Then Cut ? Quelle est la taille maximale annoncée ?

> Résultat observé (manipulation qui marche ; décalage ; fond perdu ; taille maximale) :
>
>

## Témoin 7 — le trait unique, au stylo

Fichier : `temoin-7-trait-unique.svg` (6,5 × 3,25 po), écrit par « Exporter pour le stylo » (procédé « Dessin au
stylo », ADR-0022) : le mot « Merci » dans la police à trait unique EMS Readability (un corps de 1 po, chaque lettre en
tracés **ouverts**), une ligne droite de 4 po, un zigzag de quatre segments, et un carré de 1 po en trait seul. Aucun
remplissage nulle part ; deux couleurs (bleu pour les lignes, encre pour le mot et le carré) : deux stylos.

Ce qu’on vérifie : **comment Design Space importe un tracé ouvert**, et s’il le passe en « Dessiner » sans le refermer.

À observer :

1. À l’import, Design Space montre-t-il le mot, la ligne et le zigzag **ouverts** (pas de segment de retour) ? Les
   remplit-il (un aplat entre le début et la fin d’une ligne) ?
2. Le type de ligne des calques : « Couper » d’office ? Passez chaque couche en **« Dessiner »** : la ligne garde-t-elle
   sa forme, le stylo suit-il une seule fois chaque trait (le « M » ne repasse pas sur lui-même) ?
3. Les deux couleurs font-elles deux couches, donc deux stylos demandés au moment de tracer ?
4. Les tailles : la ligne mesure 4 po, le carré 1 po, la hauteur d’une capitale environ 0,5 po.
5. Après le tracé : le trait du stylo (pointe fine) mesure-t-il bien environ 0,4 mm de large (`cricut.stylo.largeur`) ?

> Résultat observé (lignes ouvertes ou refermées ; type de ligne proposé ; couches ; tailles ; largeur du trait) :
>
>

## Témoin 8 — les hachures

Fichier : `temoin-8-hachures.svg` (5,5 × 3 po), écrit par « Exporter pour le stylo » après la correction « Hachurer » :
deux carrés de 1 po hachurés à la largeur supposée du stylo (0,4 mm), l’un à 45°, l’autre à l’horizontale, et un anneau
de 2 po (trou de 1 po) hachuré à 45°, le trou respecté. Chaque forme garde son pourtour, tracé au même stylo.

Ce qu’on vérifie : `cricut.stylo.largeur` (les lignes se touchent-elles bord à bord, sans blanc ni surépaisseur ?), et
le comportement du stylo sur des lignes très serrées.

À observer :

1. Au tracé, le carré paraît-il **plein** ? Restent-ils des blancs entre les lignes (la pointe est plus fine que 0,4 mm)
   ou le papier gondole-t-il sous l’encre (plus large) ? Noter la largeur réelle du trait.
2. Le trou de l’anneau reste-t-il blanc, les lignes s’arrêtent-elles net sur son bord ?
3. Combien de temps dure le tracé des trois formes ? Le stylo fait-il bien l’aller-retour (une ligne sur deux dans
   l’autre sens) ?
4. Design Space accepte-t-il ce nombre de lignes sans ralentir (environ 60 lignes par carré) ?

> Résultat observé (blancs ou surépaisseur ; largeur du trait mesurée ; trou ; durée ; réactivité de Design Space) :
>
>

---

## Les valeurs à vérifier

Chaque ligne est une valeur `aVerifier: true` de `src/model/contextes.ts` ; le test
`tests/unit/model/contextes.test.ts` vérifie qu’elles figurent toutes ici.

| Valeur | Aujourd’hui | Témoin | Valeur mesurée |
|---|---|---|---|
| `designSpace.pxNu` | 72 ppp pour une longueur sans unité | 1 | |
| `cricut.tapis.12x12.zoneUtile.largeur` | 11,5 po | 5 | |
| `cricut.tapis.12x12.zoneUtile.hauteur` | 11,5 po | 5 | |
| `cricut.tapis.12x24.zoneUtile.largeur` | 11,5 po | 5 | |
| `cricut.tapis.12x24.zoneUtile.hauteur` | 23,5 po | 5 | |
| `cricut.tapis.smart.zoneUtile.largeur` | 11,7 po | 5 (sur Smart Material) | |
| `cricut.tapis.smart.zoneUtile.hauteur` | 11,7 po | 5 (sur Smart Material) | |
| `cricut.tapis.joy-4x6.zoneUtile.largeur` | 4,5 po | 5 (sur une Joy, bandes réduites) | |
| `cricut.tapis.joy-4x6.zoneUtile.hauteur` | 6,5 po | 5 (sur une Joy) | |
| `cricut.tapis.joy-4x12.zoneUtile.largeur` | 4,5 po | 5 (sur une Joy) | |
| `cricut.tapis.joy-4x12.zoneUtile.hauteur` | 12 po | 5 (sur une Joy) | |
| `cricut.materiaux.papier-cartonne.seuils.detailMin` | 1/16 po | 4 | |
| `cricut.materiaux.papier-cartonne.seuils.rayonLame` | 0,01 po | 4 (angles rentrants du carré) | |
| `cricut.materiaux.papier-cartonne.seuils.toleranceNettoyage` | 0,005 po | aucun : sous la précision de la machine | |
| `cricut.materiaux.papier-cartonne.seuils.fusionNuances` | 0,04 (OKLab) | 3 | |
| `cricut.materiaux.papier-cartonne.seuils.noeudsParForme` | 5 000 points | aucun : à ajuster à l’usage | |
| `cricut.printThenCut.largeurMax` | 6,75 po | 6 | |
| `cricut.printThenCut.hauteurMax` | 9,25 po | 6 | |
| `cricut.printThenCut.fondPerdu` | 1/16 po | 6 | |
| `cricut.stylo.largeur` | 0,4 mm (environ 0,0157 po) | 7 et 8 | |

## Les comportements à vérifier

Ils ne sont pas des nombres, mais le panneau s’appuie sur eux ; chacun est dit « à vérifier » dans son constat.

| Comportement supposé | Constat | Témoin | Observé |
|---|---|---|---|
| Design Space découpe le tracé d’un trait, pas son épaisseur | « trait » (bloquant) | 4 | |
| Design Space ignore l’opacité (le papier est opaque de toute façon) | « opacité » (bloquant) | — | |
| `fill-rule="evenodd"` est lu comme dans un navigateur | « pair-impair » (conseil) | 2 | |
| Un tracé plein non fermé se coupe mal (la lame ne revient pas au départ) | « tracé ouvert » | — | |
| Des pièces qui tiennent mais un ensemble qui déborde : Design Space les répartit | « dépassement » | 5 | |
| Une forme blanche posée sur une autre est découpée dans du papier blanc, pas comme un trou | « trou superposé » | — | |
| Les attributs `data-ed-*` de la racine sont ignorés sans gêne | — | tous | |
| Le type de ligne (couper, dessiner, rainer) ne se lit pas dans le SVG : il se règle après l’import | aide du panneau | — | |
| Un tracé ouvert s’importe ouvert, et passe en « Dessiner » sans être refermé ni rempli | « trait ouvert » (découpe), étapes du stylo | 7 | |
| Le stylo ne remplit pas : une forme pleine est dessinée par son pourtour | « Le stylo trace le pourtour des formes pleines » | 7 | |
| Des hachures espacées de la largeur du stylo paraissent pleines | correction « Hachurer » | 8 | |
