# ADR-0040 — Les liens des îlots

**Date :** 26 octobre 2026
**Statut :** acceptée (prolonge les ADR-0013, 0028 et 0039, s’appuie sur les ADR-0004, 0006, 0008, 0011 et 0015) ; **aucune
référence d’écriture existante ne change** : tant qu’on n’ajoute pas de liens, aucun octet ne bouge, en Générique comme en Cricut

## Contexte

Demande du propriétaire, du 26 octobre 2026 : « Dans le contexte Cricut, une zone pleine dans une zone découpée tombe après la
découpe. Je veux une option pour créer des liens pour maintenir cette zone à la découpe. Option largeur 2 mm par défaut et nombre de
liens 3 par défaut. À appliquer sur une forme et plusieurs fois en auto si besoin. »

C’est le problème du pochoir. La lame suit tous les bords d’une forme pleine : le bord extérieur d’un O et le bord de son trou. Une
fois la feuille coupée, il reste trois morceaux : l’anneau (la forme), le disque du centre et la feuille percée. Deux usages :

- **en autocollant ou en superposition de papiers** (l’usage le plus courant d’une Cricut), on garde la forme : le disque du centre
  s’échenille avec le reste, c’est voulu ;
- **en pochoir** (peinture, sablage, gravure à la crème), on garde la feuille et on retire la forme : le disque du centre, que plus
  rien ne tient, **tombe**. C’est l’îlot. Un pochoir de lettres perd ainsi le centre des A, B, D, O, P, Q, R et du ®.

La parade classique est le **lien** (pont, *bridge*) : une fine bande de feuille laissée en travers de la forme, qui retient l’îlot au
reste de la feuille. Les polices « pochoir » (Stencil, Allerta Stencil) les dessinent dans leurs lettres ; les logiciels de découpe
(Silhouette Studio, Inkscape avec une extension, LightBurn pour le laser) les posent à la demande, en largeur et en nombre.

**Ce que faisait l’éditeur** : rien. Le panneau « Prêt pour Cricut » ne disait pas qu’un centre tomberait, et aucun outil ne posait
de lien : il fallait dessiner des rectangles et faire une soustraction booléenne à la main, îlot par îlot.

## Décision

### 1. Le sens d’« îlot »

Un îlot est **un anneau intérieur de la région peinte d’une forme pleine à couper** : un trou de la forme, lu selon sa règle de
remplissage (pair-impair, ou selon le sens du tracé : deux contours emboîtés de même sens font une forme pleine, pas un trou). C’est
exactement ce qui tombe d’un pochoir. On n’en compte pas :

- pour une forme **à écrire** (ADR-0028) : le stylo ne détache rien ;
- pour une forme **sans fond** (un trait seul) ou une image ;
- pour une **miette** : un trou de moins de 0,5 mm de côté (`ILOT_AIRE_MIN`, le carré de la plus petite largeur de lien) ;
- pour un trou **entièrement bouché** par une autre forme à couper **de la même couleur** (le même tapis) : la lame y découpe la forme
  du dessus, il ne reste aucun morceau de feuille. Un trou couvert en partie reste un îlot (le cas prudent).

Les îlots imbriqués en sont aussi : dans un ®, l’espace entre le cercle et le R est un trou du polygone du cercle, le centre du R un
trou du polygone du R. Chaque îlot se relie à la matière qui l’entoure **de l’autre côté de son propre polygone** : le centre du R au
fond du ®, le fond du ® au reste de la feuille ; de proche en proche, toute la feuille se tient.

L’interface dit le sens et l’autre usage : « Le centre de cette forme tombera à la découpe (1 îlot) : pour un pochoir, ajoutez des
liens qui le retiennent à la feuille. Pour un autocollant, ce centre s’échenille : ignorez ce constat. »

### 2. Le placement (`engine/preparation/liens.ts`, pur)

Pour chaque îlot, `nombre` liens de `largeur` :

1. le bord de l’îlot est échantillonné à pas réguliers (au plus 512 points) ; pour chaque point, le lien candidat va **au point le
   plus proche du bord extérieur** de son polygone : il est donc perpendiculaire à ce bord, et, minimisé sur une fenêtre,
   perpendiculaire localement au bord de l’îlot. C’est le lien le plus court ;
2. un candidat est écarté si son axe ou les bords de sa bande traversent un autre bord (un autre trou, un repli de la forme), ou si
   son milieu n’est pas dans la matière ;
3. son score est sa longueur, plus une pénalité de virage : l’angle dont tourne le bord de l’îlot sur une largeur de part et d’autre,
   fois la largeur. Un lien évite ainsi les coins (un lien posé sur un coin tient mal, et la lame y tourne court) ;
4. le bord est partagé en `nombre` arcs égaux ; dans chaque arc, une fenêtre de ±35 % autour de sa place régulière garde le meilleur
   candidat (à score égal, le plus proche de sa place : sur un cercle, les liens sont exactement répartis) ; un candidat à moins
   d’une largeur et un dixième d’un lien déjà retenu est écarté (deux bandes fondues n’en font qu’une). Huit départs de série sont
   essayés ; on garde la série la plus complète, puis la plus courte ;
5. faute de tout chemin vers l’extérieur (un trou cerné d’autres trous), les liens vont vers un autre trou : c’est mieux que rien,
   et le résultat dit les îlots qui ont reçu moins de liens que demandé ;
6. la bande retirée est le rectangle du lien, **débordant d’une largeur de chaque côté**, moins la matière du polygone qu’il croiserait
   ailleurs. On retire le rectangle entier plutôt que sa part rognée à la matière : des bords confondus au flottant près laissaient
   au moteur de découpe un fil de largeur nulle, et la bande ne tranchait pas (constaté, puis corrigé). Chaque polygone ne perd que
   ses propres bandes : un rectangle qui déborde ne mord jamais une autre partie de la forme.

La forme garde son identifiant, son style, son opération, son parent et sa place ; sa région moins les bandes est réécrite selon le
sens du tracé, **courbes rebâties comme les booléens** (`cheminLisseDeRegion`, ADR-0004, quand la forme avait des courbes et que
« Booléens : rebâtir les courbes » est coché) ; un texte vivant devient des contours (`sansTexte`). Tous les îlots d’une forme en une
fois, chaque forme choisie traitée : **une seule entrée d’historique**, que Ctrl+Z défait d’un coup.

`ajouterLiens(dessin, ids, { largeur, nombre }, procede)` est la façade (`engine/preparation.ts`) ; `ilotsDe` (mémorisé par forme,
ADR-0008) et `ilotsQuiTombent` (avec la couverture par la même couleur) servent le constat et le panneau.

### 3. Les réglages

- **Largeur : 2 mm par défaut**, de 0,5 à 10 mm ; **nombre : 3 par îlot**, de 1 à 12 (la demande ; les bornes sont celles d’un
  pochoir de papier ou de vinyle, du plus fin au plus robuste). Le moteur ramène toute valeur dans ses bornes (`bornerLiens`) ;
  la boîte refuse une valeur hors bornes en le disant.
- La largeur s’écrit dans l’unité retenue du contexte (millimètre par défaut, pouce au choix), au centième de millimètre ou au
  millième de pouce ; un champ qu’on n’a pas touché garde la valeur exacte (2 mm restent 2 mm, affichés 0,079 po).
- Les réglages sont **de la session** (`contexteRegles`, comme les panneaux flottants) : jamais écrits dans le SVG, le projet ou le
  stockage.

### 4. Le constat et l’interface

- **Constat `ilot`**, « à corriger » (l’export demande une confirmation), jamais bloquant, rangé après les parties fines : il nomme
  les formes à couper qui ont un îlot et compte les îlots. Correction **« Ajouter des liens »** (les réglages de la session : 2 mm et 3
  au départ), annulable ; second bouton **« Régler les liens… »**, qui choisit les formes en cause et ouvre la boîte.
- **La boîte « Ajouter des liens »** (`zones/PanneauLiens.tsx`), un panneau flottant sur la toile comme « Dupliquer sur la feuille »
  (ADR-0039) : largeur, liens par îlot, ce que la sélection offre (« 3 îlots dans 2 formes »), « Annuler » et « Ajouter les liens ».
  Échap ferme ; le focus revient à la toile.
- **« Ajouter des liens… »** dans le menu Édition et le menu de la sélection, à côté de « Dupliquer sur la feuille… », en contexte
  Cricut qui coupe ou écrit (ADR-0006 : le rare dans les menus).
- La région vocale dit « 3 liens posés sur 1 îlot. Ctrl+Z les retire. » ; une forme sans îlot le dit sans rien changer (« Cette
  forme n’a pas d’îlot : rien ne tombera à la découpe. »).
- L’aperçu de la machine montre les liens sans rien de plus : ce sont des formes ordinaires, la zone hachurée s’interrompt.

### 5. Les octets

Aucun octet ne change tant qu’on n’ajoute pas de liens : le constat ne s’écrit nulle part, les réglages non plus. Les liens sont une
modification ordinaire de la géométrie. Deux références **neuves** (`tests/fixtures/svg/liens-anneau.attendu.svg`, l’anneau courbe
de `cricut.svg` avec 3 liens de 2 mm ; `liens-pair-impair.attendu.svg`, les carrés pair-impair d’`evenodd-opacite.svg` avec 2 liens
de 3 mm), écrites par `ACTUALISER_REFERENCES=1 npx vitest run tests/unit/engine/ecriture-stable.test.ts` et relues ; aucune
existante ne bouge. Aucun SVG d’entrée nouveau (le corpus du fuzzing ne change pas).

## Ce qui reste à vérifier sur la machine (`aVerifier`)

- **La largeur minimale qui tient**, selon la matière : 2 mm est la valeur demandée ; un papier cartonné de 65 lb, un vinyle pochoir
  et un carton de 0,5 mm ne se tiennent pas pareil, et un lien trop fin se déchire à l’échenillage. Un témoin (des anneaux à liens de
  0,5, 1, 2 et 3 mm) rejoindra le protocole (`docs/cricut/protocole.md`) quand l’export par défaut sera stabilisé ; d’ici là, la boîte
  le dit (« essayez sur une chute »).
- Le **nombre** utile selon la taille de l’îlot : trois tiennent un centre de lettre ; un grand îlot de papier fin en demande
  peut-être davantage.
- Le comportement de Design Space n’entre pas en jeu : les liens sont de la géométrie, coupée comme toute forme.

## Conséquences

- Un dessin à couper qui a des trous montre désormais un constat « à corriger » : en autocollant ou en superposition, il faut
  confirmer l’export une fois de plus. C’est le prix d’un pochoir qui ne perd plus ses centres ; la phrase dit qu’on peut l’ignorer.
  Le témoin 2 (deux anneaux) et le test des actions de production (un contour devenu anneau) le montrent maintenant.
- Les liens ne se défont qu’en annulant : la forme ne garde pas ses réglages (comme une forme de base, ADR-0033). Les poser deux fois
  sur une forme déjà reliée ne fait rien : elle n’a plus d’îlot.
- Le constat mesure les mêmes formes que les parties fines (300 au plus, 3 000 commandes au plus par forme) ; « Ajouter des liens »
  traite toute forme choisie, chargée ou non.

## Alternatives écartées

- **Des liens à angles égaux depuis le centre de l’îlot** : simple, mais un lien radial croise en biais le bord d’un îlot allongé ou
  triangulaire (le A), et peut tomber sur un coin. Le plus court chemin vers le bord extérieur, fenêtre par fenêtre, donne des liens
  courts et perpendiculaires.
- **Garder les liens vivants** (une forme qui retient ses réglages et se recalcule) : un champ de plus dans le modèle, écrit dans le
  fichier ; la demande n’en a pas besoin, et un lien est une géométrie que Design Space doit voir telle quelle.
- **Traiter les îlots sur l’union des formes d’une couleur** (le tapis entier) : exact dans tous les cas de chevauchement, mais les
  liens devraient alors tomber dans plusieurs formes à la fois. On s’en tient à la forme, en écartant le trou entièrement bouché par
  une forme de la même couleur.
- **Un constat « conseil »** : moins insistant pour l’autocollant, mais l’export d’un pochoir passerait sans un regard, et le centre
  tomberait. La demande et l’ADR-0013 rangent ce qui donnera une mauvaise coupe en « à corriger ».
