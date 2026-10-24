# ADR-0005 — Un atelier de résultat pour rejouer la vectorisation

**Date :** 22 octobre 2026
**Statut :** acceptée (prolonge l'ADR-0002)

## Contexte

La vectorisation donnait un résultat unique après un clic, avec deux réglages (mode, grain) et un
aperçu. Pour un logo, on essaie : un grain plus lisse, moins de couleurs, des segments droits, des
poussières ignorées. Chaque essai demandait de remonter aux réglages, de relancer, de comparer de
mémoire. L'image déposée ne se voyait pas non plus avant le tracé.

## Décision

1. **L'image déposée s'affiche aussitôt** : en miniature dans la zone de dépôt, puis dans le
   visualiseur en « Originale » et « Détourée » (le détourage se recalcule sans le traceur, donc
   instantanément).
2. **Un atelier sous le dépôt** : la visionneuse à gauche (comparer, rendu, contours, détourée,
   originale ; zoom ajusté, 100, 200, 400 % ; fond damier, blanc, sombre), les réglages du tracé à
   droite, les essais dessous. « Comparer » est un rideau : l'image détourée d'un côté, les vecteurs de
   l'autre, par-dessus le même plan.
3. **Des réglages fins, qui ne sont que ce qu'on a touché** (`engine/vectorisation.ts`). Huit
   réglages : couleurs retenues, poussières, simplification, angles vifs, précision des couleurs,
   écart entre couches, courbes lissées ou droites, formes empilées ou découpées. Chacun, présent,
   l'emporte sur ce que le mode donnerait ; absent, il le suit. Remettre la valeur du mode retire le
   réglage, pour que « modifié » veuille toujours dire « différent ». Chaque mode ne propose que les
   curseurs qui y changent quelque chose. Changer de mode ou de grain remet les réglages fins à zéro :
   le grain n'est jamais masqué par un réglage oublié.
4. **Rejouer à chaque changement**, après une pause de 400 ms qui laisse finir un geste, ou à la
   demande. Chaque lancement prend un numéro : un résultat qui revient après un lancement plus récent
   est jeté. Aucun rejeu quand le résultat affiché montre déjà ces réglages sur cette image. Le message
   « en cours » se peint avant le calcul, qui fige la page quelques dizaines de millisecondes.
5. **Les essais** : les huit derniers, le plus récent d'abord, avec leur miniature, leur résumé de
   réglages, le nombre de tracés, le poids et le temps. Un clic reprend les réglages et le résultat
   sans relancer le traceur. Deux essais de mêmes réglages n'en font qu'un (clé stable, indépendante
   de l'ordre des champs).
6. **Le temps est une mesure, jamais une entrée** : il se lit dans `io`, au bord du calcul, et ne
   touche pas le moteur. La même image et les mêmes réglages rendent le même SVG.

## Conséquences

- Les types `Traitement` et `ReglagesFins` vivent dans le moteur, purs ; `io/image.ts` les
  réexporte. Les valeurs par défaut sont calculées, pas recopiées dans l'interface.
- Un réglage de plus au traceur est une ligne de table et un champ de `optionsTraceur` : l'interface
  se déduit de `PARAMETRES_FINS`.
- Les essais restent en mémoire de la page : fermer ou recharger les perd, ce qui est voulu, ils
  portent des pixels.
