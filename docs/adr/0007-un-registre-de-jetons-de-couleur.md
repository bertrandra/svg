# ADR-0007 — Un registre de jetons de couleur

**Date :** 24 octobre 2026
**Statut :** acceptée (prolonge l'ADR-0006)

## Contexte

Les couleurs de l'interface vivaient dans `outils/editeur-svg/page.html`, écrites trois fois (le thème
clair, le thème sombre demandé par le système, le thème sombre forcé par la page), sans description, et
mêlées à une vingtaine de couleurs en dur (damier, fonds de la toile, ombres). Rien ne disait qu'un jeton
était mort, qu'une couleur échappait au système, ni que deux couleurs posées l'une sur l'autre se lisaient.

## Décision

1. **Un registre, `src/styles/jetons.ts`, source unique.** Un jeton a un identifiant (`cyan` donne
   `--cyan`), un rôle (surface, texte, trait, action, état, toile, relief), une valeur claire, une valeur
   sombre et une description. Les couleurs du dessin édité n'en font pas partie : elles sont à
   l'utilisateur (nuancier, palettes).
2. **Le CSS des variables se génère** (`cssJetons`) et s'injecte à la construction à la place du repère
   `/*JETONS*/` de la page. Les blocs sombres ne portent que les jetons qui changent. La page n'écrit
   plus aucune couleur : le damier, les fonds de toile et les ombres sont devenus des jetons.
3. **Les contrastes sont des données** (`PAIRES`) : chaque texte sur son fond doit tenir 4,5:1
   (WCAG 2.x AA) dans les deux thèmes, mesuré par `contraste` (`util/couleur.ts`). Le filet est
   décoratif et n'y figure pas, on le dit.
4. **Un test confronte le registre à la page et au code** : pas de couleur hexadécimale ni `rgb()` en
   dur dans la page, pas de variable déclarée à la main, aucun `var(--x)` sans jeton, aucun jeton lu
   nulle part. Il a trouvé deux jetons morts (`ok`, `ok-fond`), retirés.
5. **`docs/jetons.md` est généré** (tableaux par rôle et rapports de contraste réels) et un test le
   garde à jour (`ACTUALISER_REFERENCES=1` le régénère).

## Conséquences

- Ajouter ou changer une couleur d'interface, c'est un geste en un seul endroit, et un test qui le
  juge ; les valeurs d'avant sont reprises à l'identique, l'interface ne change pas d'un pixel.
- Un hôte qui embarque l'éditeur reçoit le même CSS généré, au lieu d'une copie à tenir.
- Une valeur qui ne se lit pas en hexadécimal opaque (les ombres, translucides) est exclue des paires
  de contraste ; elles n'en portent pas.
