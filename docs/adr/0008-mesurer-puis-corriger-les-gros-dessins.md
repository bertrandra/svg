# ADR-0008 — Mesurer, puis corriger : les gros dessins

**Date :** 24 octobre 2026
**Statut :** acceptée

## Contexte

Une vectorisation peut produire des milliers de formes. Sur 5 000 formes (trois dessins de test : une
« photo » de 120 couleurs, un « logo » de 6 couleurs, un dessin de 2 000 couleurs), ouvrir l'éditeur
coûtait 1,6 s de fil principal, tout sélectionner 1 s, glisser une forme 100 ms par mouvement.

## Décision

Mesurer d'abord (Chromium, tâches du fil principal, médiane de trois passages, avant et après
entrelacés), ne corriger que ce qui coûte, et laisser tel quel ce qui ne coûte pas, chiffres à l'appui.

1. **Les calques se fenêtrent** (`util/fenetre.ts`, seuil de 150 formes) : seules les lignes visibles et
   douze de marge se dessinent, avec une hauteur minimale de liste, parce que retirer la ligne qui a le
   focus force une mise en page qui ramène le défilement en arrière. `aria-posinset` et `aria-setsize`
   sont posés. En dessous du seuil, le DOM est celui d'avant.
2. **Les sélections se testent par ensemble** (`ed.choisies`), la surcouche par table.
3. **Ce qui dépend d'une forme immuable se mémorise par forme** (`WeakMap`) : le texte écrit d'une forme
   par précision. Un test le compare à l'ancienne écriture, la sortie est identique octet pour octet.
4. **Les aimants se calculent une fois par geste**, le SVG se lit une fois à l'ouverture
   (`lireDessinMemo`), et l'historique garde moins d'états sur un très gros dessin
   (`limitePourTaille` : 200 jusqu'à 1 000 formes, 100 jusqu'à 2 000, 40 jusqu'à 5 000, jamais moins de 10).

## Conséquences

- Sur 5 000 formes : ouvrir 1 568 → 859 ms, Ctrl+A 996 → 443 ms, glisser une forme 96 → 33 ms par mouvement,
  glisser tout 669 → 288 ms, DOM 33 700 → 8 900 nœuds ; le SVG écrit ne change pas.
- **La liste « Par couleur » se fenêtre au-delà de 100 couleurs** (marge de douze lignes, `aria-posinset` et
  `aria-setsize`). Elle est son propre conteneur qui défile (260 px) : des cales `data-cale` portent la
  hauteur des lignes absentes, pas de `padding` ni de `min-height`. Ses lignes sont mémoïsées (elles ne
  lisent que leurs propriétés et des verbes stables), et les couleurs ne se relisent que si
  `(id, remplissage, contour, visible, verrouille)` change : déplacer une forme ne touche plus la liste.
- **Les nuances proches** cherchent leur cible par une grille OKLab (cellules au moins égales à la tolérance,
  27 cellules voisines, rang minimal, même comparaison finale) : le résultat est identique à l'ancien
  parcours, prouvé sur des milliers de couleurs. Il n'y a plus de plafond de 400 couleurs : 2 000 couleurs
  coûtent 6,5 ms, 10 000 coûtent 37 ms (88 ms et 1 387 ms avant).
- Sur le dessin à 1 669 couleurs : glisser une forme 142 → 25 ms par mouvement, masquer un groupe
  438 → 119 ms, choisir une couleur 348 → 74 ms, ouvrir 2 792 → 1 732 ms, DOM 53 968 → 21 029 nœuds.
- **Le panneau « Couleurs du dessin »** de l'inspecteur se fenêtre comme « Par couleur » (seuil 100, marge 12,
  `aria-posinset`/`aria-setsize`, cales, lignes mémoïsées à verbes stables ; les couleurs ne se relisent
  que si une couleur, une visibilité ou un verrou change). Sur le dessin à 1 669 couleurs : Échap
  933 → 156 ms, ouvrir 1 792 → 851 ms, recolorer cinq valeurs 722 → 310 ms, DOM 21 034 → 6 194 nœuds
  (20 lignes dessinées au lieu de 1 669). Photo et logo : dans le bruit de mesure.
- **La ligne dont le sélecteur de couleur est ouvert reste dessinée hors de la fenêtre** tant que le geste
  dure (`segmentsFenetre`, ligne épinglée), dans les deux listes : une ligne recolorée change de rang
  (tri par nombre de formes puis code), et sortie de la fenêtre elle fermait le sélecteur natif.
- Laissé tel quel, avec ses chiffres : `Calque` mémoïsé tient déjà, `ecrireChemin` (formatage des nombres)
  ne gagne rien à une boucle manuelle, glisser 5 000 formes demanderait un `transform` CSS pendant le
  geste. Le panneau « Couleurs du dessin » de l'inspecteur se fenêtre
  lui aussi (voir plus haut) : plus aucune liste de l'éditeur ne dessine toutes ses lignes au-delà de
  100 couleurs ou 150 formes.
- Deux cents états de 5 000 formes pesaient près de 2 Go : la limite d'historique est une décision de
  mémoire, pas de confort.
