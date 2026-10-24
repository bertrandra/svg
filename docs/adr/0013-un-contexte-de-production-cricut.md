# ADR-0013 — Un contexte de production : Cricut

**Date :** 24 octobre 2026
**Statut :** acceptée (prolonge les ADR-0001, 0004, 0006, 0009, 0010 et 0011) ; aucun octet existant ne change

## Contexte

Le propriétaire découpe ses dessins sur une Cricut. Un SVG qui s’affiche bien dans un navigateur se découpe souvent
mal dans Design Space : une longueur sans unité y est lue à 72 ppp (un SVG à 96 ppp arrive à 75 %), un trait n’est
pas découpé comme il se voit, deux nuances presque égales font deux tapis, une partie plus fine que la lame se
déchire, un dessin plus grand que le tapis ne se coupe pas. Rien de cela ne se voyait dans l’éditeur.

Décisions du propriétaire, non négociables : le contexte se choisit **dans la barre**, à tout moment ; « Générique »
(le comportement d’avant, strictement inchangé) et « Cricut » (Joy, Explore Air 2 / 3, Maker / Maker 3) ; le papier
cartonné seul au lancement, la structure prête pour le vinyle, le thermocollant, le feutre, Silhouette et le laser ;
Print Then Cut dès le départ ; **aucune correction appliquée sans qu’on la voie**, chacune annulable.

## Décision

1. **Un contexte de production est un profil de données qui configure les outils existants et juge le dessin ; il
   n’invente pas d’outil.** `model/contextes.ts` décrit, sans logique, les familles (Cricut seule aujourd’hui ;
   `Famille` prévoit `silhouette` et `laser`), les machines (tapis et procédés permis), les tapis (taille et zone
   utile), les matériaux (seuils : détail minimal, rayon de lame, tolérance de nettoyage, distance de fusion, nombre de
   points) et Print Then Cut (taille maximale, fond perdu, résolution). **Toute valeur non mesurée porte
   `aVerifier: true` et une note** qui dit d’où elle vient ; un test oblige `docs/cricut/protocole.md` à les nommer
   toutes (19 aujourd’hui).
2. **L’échelle : 96 unités du plan par pouce.** Le plan n’a pas d’unité propre, et l’écriture pose `width` égal au
   viewBox, sans unité, donc en px CSS (1/96 po). Le contexte garde cette échelle : ce qu’on voit « en taille réelle »
   est ce qui sera découpé, et rien ne se réécrit en changeant d’unité (pouces ou millimètres ne changent que
   l’affichage, la grille et l’export).
3. **Le moteur juge** (`engine/preparation.ts`, pur, déterministe) : `constatsPreparation(dessin, profil)` rend des
   constats classés **bloquant** (trait, opacité, pièce plus grande que la zone utile, Print Then Cut trop grand,
   dessin vide), **à corriger** (dépassement de l’ensemble, tracé ouvert, nuances proches, parties trop fines) et
   **conseil** (trop de points, forme blanche posée comme un trou, pair-impair, analyse limitée), chacun avec ses
   formes et une correction identifiée. `corrigerPreparation` les applique en appelant des outils qui existaient :
   contour en forme, décalage, fusion des nuances, joindre et fermer, simplification, booléen (soustraction),
   transformation — avec les valeurs du matériau. « Réécrire les trous » (pair-impair vers selon le sens du tracé)
   retourne les boucles selon leur profondeur et garde les courbes ; il vérifie l’aire et retombe sur la région peinte
   des booléens si des boucles se croisent.
4. **Les parties trop fines se mesurent par ouverture morphologique** : une partie qui disparaît entièrement sous un
   décalage de −seuil/2 est trop fine en entier ; ce qui manque à l’ouverture (rétrécir puis regrossir de seuil/2,
   angles ronds) est trop étroit pour la lame (bras, isthme, pointe aiguë), au-delà de 0,25 seuil² — ce qui laisse
   passer les angles jusqu’à environ 45°. La mesure se mémorise par forme (ADR-0008) ; au-delà de 300 formes ou de
   3 000 points par forme, elle s’arrête et le dit.
5. **Le contexte est un état d’interface** (ADR-0010) : `production`, son `profil` résolu et `productionModifiee` vivent
   dans le contexte Interface, hors de l’historique ; changer de contexte ne s’annule pas par Ctrl+Z, mais suffit à
   rendre « Enregistrer » actif. Un choix incohérent (un tapis d’une autre machine, Print Then Cut sur une Joy, un
   matériau annoncé) est ramené au plus proche choix valide (`normaliserChoix`) et dit.
6. **Le contexte s’écrit dans le document, et seulement hors de Générique** : `data-ed-contexte`, `-machine`, `-tapis`,
   `-materiau`, `-procede`, `-unite` sur la racine, dans un ordre fixe, des identifiants `[a-z0-9-]` seulement
   (`marquerProduction`, après l’écriture ordinaire, comme `tailleRacine`). `lireDessin` les relit dans
   `DessinLu.production` ; un contexte inconnu (un fichier d’une version plus récente) s’ouvre en Générique en le
   disant. L’assainissement les laissait déjà passer (attributs sans préfixe, valeur nettoyée) ; les invariants de
   l’écriture les admettent **sur la racine seule et avec une valeur d’identifiant**, rien d’autre n’est relâché.
7. **L’export est un fichier à part** (`export/cricut.ts`, bâti sur `svgExporte`) : `width` et `height` en pouces ou en
   millimètres, viewBox inchangé, fonds pleins, une couleur par couche, aucun trait ni opacité, chaque trou dans le
   `<path>` de sa forme, la marque du contexte. **Il refuse** un dessin à constat bloquant, en le nommant : l’écrire
   changerait ce qu’on voit (un trait perdu, une transparence perdue). Le SVG enregistré, lui, reste celui de
   l’éditeur (unités du plan, traits compris), avec sa marque.
8. **Print Then Cut** (`export/printThenCut.ts`) : l’image à imprimer avec fond perdu (chaque forme décalée vers
   l’extérieur, gardée dans l’anneau du fond perdu seulement, sous le dessin : un trou ne se remplit jamais, et la
   couleur prolongée est celle du bord) et la ligne de coupe (la silhouette extérieure unie, une forme, sans trou),
   au même cadre et à la même taille. **Livré en une archive ZIP** (`export/zip.ts`) : `LISEZMOI.txt`, un PNG à 300 ppp
   rendu par le navigateur, l’image en SVG et la coupe en SVG. Un seul fichier à télécharger est le plus simple et le
   plus clair ; le mode d’emploi dit les tailles et ce qui reste à vérifier. Au-delà de 400 formes, le fond perdu forme
   par forme coûterait trop : l’export le dit.
9. **L’interface** : le sélecteur est un menu de la barre (bureau) à rubriques et éléments `menuitemradio` (contexte,
   machine, tapis, matériau, procédé, unité) ; sur un téléphone, ces rubriques terminent le menu « Plus ». Le panneau
   « Prêt pour Cricut » est une `Section` en tête de l’inspecteur (avec ou sans sélection), absente en Générique :
   profil, taille finale et couches en permanence, constats par gravité, « Choisir les formes », « Passer au tapis… »,
   et **une seule action primaire**, « Exporter pour Cricut », qui reste focalisable et dit pourquoi elle est inactive
   (`BoutonRaison`). Chaque correction ouvre une entrée d’historique et se dit dans la région vocale avec ce qui reste.
   La toile montre le tapis, sa zone utile calée sur le coin haut gauche du dessin (là où Design Space pose les
   pièces), un quadrillage au pouce, les formes qui débordent et les parties fines. Le jugement suit le dessin 200 ms
   après le dernier geste, pour ne rien mesurer pendant un glisser.
10. **Les outils prennent les valeurs du matériau** : grille au quart de pouce (5 mm en millimètres), décalage par
    défaut de la moitié du détail minimal, arrondi au rayon de lame, tolérance des nuances proches à la distance de
    fusion, simplification à la tolérance de nettoyage.
11. **Ce que le SVG ne porte pas, on ne le prétend pas** : le type de ligne (couper, dessiner, rainer) se règle dans
    Design Space après l’import ; le panneau propose une convention de couleurs facultative, en aide, sans l’écrire dans
    le fichier. Un `<text>`, un dégradé, un motif, un masque ou un filtre ne peuvent pas atteindre ce jugement : la
    lecture les refuse déjà en les nommant (ADR-0001, ADR-0009).

## Conséquences

- **Aucun octet existant ne bouge** : sans marque, `marquerProduction` rend son entrée (un test le vérifie sur toutes
  les références), l’écriture Générique est `ecrireDessin` ; les références de `tests/fixtures/svg` et les 4 134
  empreintes de la bibliothèque sont intactes. Cinq références neuves (`cricut-marque`, `cricut-export`,
  `cricut-export-mm`, `print-then-cut-impression`, `print-then-cut-coupe`).
- **Six SVG témoins** (`docs/cricut/temoins/`, huit fichiers : le témoin 1 a sa variante sans unité, le témoin 6 son
  image et sa coupe), fabriqués par les mêmes fonctions et gardés par un test, et un protocole à remplir sur la
  machine pour figer les valeurs `aVerifier`.
- **Limites, honnêtement** : aucune valeur ni aucun comportement de Design Space n’a été essayé sur une machine ; la
  façon d’assembler image et coupe en Print Then Cut est la plus incertaine (Design Space ajoute son propre fond perdu
  et découpe autour du bord de l’image) ; la zone utile est vérifiée sur l’étendue du dessin et non pièce par pièce
  sur chaque tapis de couleur ; la position et la taille de l’inspecteur restent en unités du plan (le panneau, lui,
  parle en pouces ou en millimètres) ; le PNG de Print Then Cut n’est pas reproductible à l’octet d’un navigateur à
  l’autre.
- **Ajouter une machine ou un matériau** est une entrée dans `model/contextes.ts` (et, pour une nouvelle famille, un
  contexte et sa résolution dans `engine/preparation/profil.ts`) ; les constats ne connaissent que des seuils.
