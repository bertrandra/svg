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
- Laissé tel quel, avec ses chiffres : `Calque` mémoïsé tient déjà, `ecrireChemin` (formatage des nombres)
  ne gagne rien à une boucle manuelle, glisser 5 000 formes demanderait un `transform` CSS pendant le
  geste. `ParCouleur` n'est pas fenêtré : avec 2 000 couleurs, ses lignes se re-rendent à chaque
  mouvement (+65 à 80 ms).
- Deux cents états de 5 000 formes pesaient près de 2 Go : la limite d'historique est une décision de
  mémoire, pas de confort.
