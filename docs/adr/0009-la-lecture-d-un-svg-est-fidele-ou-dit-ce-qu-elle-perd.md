# ADR-0009 — La lecture d'un SVG est fidèle, ou dit ce qu'elle perd

**Date :** 24 octobre 2026
**Statut :** acceptée (prolonge l'ADR-0001) ; **événement de version majeure**

## Contexte

Les tests de référence de l'écriture (`tests/fixtures/svg`) ont figé des défauts de lecture que leur
propre existence rendait visibles : `stroke-width="0"` s'écrivait `1` (un trait invisible devenait
visible), l'alpha de `rgba()` se perdait, un nom de couleur hors de douze restait un nom, et ce que la
lecture laissait tomber sans refuser (pointillés, bouts de trait, marqueurs…) ne se disait pas.

## Décision

1. **Zéro est une épaisseur** : une valeur absente, illisible ou négative reste 1, comme dans un navigateur.
2. **L'alpha se garde.** `Forme` reçoit `opaciteRemplissage` et `opaciteContour`, absents quand ils
   valent 1, donc toute forme sans alpha garde les mêmes champs et les mêmes octets. `fill-opacity` et
   `stroke-opacity` ne s'écrivent que s'ils diffèrent de 1 et que la forme a un contour ; sans contour,
   tout passe dans `opacity`, ce qui garde une relecture stable. `hsl()`, `rgb(… / 40%)`, `#rrggbbaa`,
   `#rgba` et les opacités en pourcentage se lisent.
3. **Les 148 noms de couleur CSS** (`util/couleursNommees.ts`) se ramènent à `#rrggbb`.
4. **La lecture dit ce qu'elle laisse tomber** : `lireDessin` rend `ignores`, la liste des pertes qu'elle
   n'a pas refusées, et la page la dit une fois à l'ouverture. Ce qui change le rendu au point de ne
   pas s'éditer (dégradé, motif, filtre, masque) reste refusé, nommé.
5. **Un changement d'octets est décidé, pas subi** : `ACTUALISER_REFERENCES=1` ne réécrit que ce
   qu'on a relu ; chaque référence changée est expliquée dans l'entrée de CHANGELOG.

## Conséquences

- Les 26 références existantes et les 4 134 empreintes de la bibliothèque n'ont pas bougé : seuls les
  cas fautifs (`fidelite-lecture`, `booleens-*`) sont réécrits.
- Restent signalés, non portés par le modèle (un autre événement majeur si on les porte) : pointillés,
  bouts et jonctions de trait, marqueurs, règles de style hors classe, animations. Aussi, la peinture
  posée sur la balise `<svg>` racine (`fill="none" stroke="currentColor"`, icônes de type Feather) n'est
  pas héritée : ces formes s'importent en noir plein.
