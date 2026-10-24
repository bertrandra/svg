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
- Le modèle `Forme` porte aussi `pointilles` (la liste paire normalisée, « 5 3 2 » devient
  `[5, 3, 2, 5, 3, 2]`), `decalagePointilles`, `bout`, `jonction` et `limiteMitre`, tous absents quand ils
  valent ce que l'écriture produisait déjà. Une jonction non précisée se lit arrondie (et non « miter »,
  le défaut de la spécification), pour qu'aucun octet existant ne bouge ; seule une jonction non arrondie
  explicite change la sortie. Épaisseur et longueurs de pointillés se mettent à l'échelle du même facteur
  `sqrt(|det|)` ; la limite de pointe, rapport de la pointe à l'épaisseur, ne s'échelonne pas.
- La peinture de la balise `<svg>` racine est héritée comme celle d'un `<g>`, et `currentColor` se
  résout à la forme.
- Restent signalés (`ignores`), non portés par le modèle : les marqueurs, les animations (`animate…`,
  `@keyframes`), les pointillés en pourcentage ou hors du pixel, les jonctions `arcs` et `miter-clip`, les
  `@media` et autres @-règles de feuille, les sélecteurs de frère, les pseudo-classes et pseudo-éléments,
  `var()` et le `transform` CSS. `ajusterPlan` compte les pointes de jonction et les bouts carrés
  (`edition/etendue.ts`).

## Amendement — le troisième lot étend la lecture

Sans renoncer au principe « fidèle ou dit ce qu'elle perd » :

- **Un `<use>` se déplie en formes plates indépendantes** (`edition/clones.ts`) : `href` et `xlink:href`,
  `x`/`y` avant le `transform`, héritage du `<use>`, `<symbol>` avec `viewBox` et `preserveAspectRatio`
  complet, clones emboîtés. Sont refusés en le nommant : un cycle, plus de 16 niveaux, plus de 20 000
  clones, un renvoi externe. Une cible introuvable, et le rognage au cadre d'un `<symbol>` qui déborde,
  sont dits. `nettoyerSvg` garde le renvoi externe dans `data-href-externe` pour que la lecture le refuse.
- **La feuille `<style>` se lit avec un sous-ensemble correct de CSS** (`selecteurs.ts`, `feuille.ts`,
  `cascade.ts`) : type, `*`, classes, `#id`, attributs, descendant et enfant, groupes, `:root`,
  `:first-child`, `:last-child`, `:only-child`, spécificité et ordre exacts, `!important` ; attribut de
  présentation sous les règles, sous `style` en ligne. Tout ce qui n'est pas porté est dit.
- **Les ligatures** sont une option du moteur (éteinte par défaut, donc sans effet sur les octets existants),
  portée par un lecteur GSUB pur (`io/ligaturesGsub.ts`, type 4 et 7, feature `liga` seule).
- Limites : les lookups d'une feature sont fondus sans application séquentielle ; les types 5 et 6 et les
  features `clig`, `rlig`, `dlig` ne sont pas lus.
- Les 4 134 empreintes de la bibliothèque et les références existantes restent identiques (13 fixtures
  ajoutées, aucune modifiée) ; trois assertions de l'ancien comportement sont réécrites parce que leur
  phrase d'`ignores` a disparu.
